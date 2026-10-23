-- =====================================================================
-- DEV MENU — بطاقة الولاء (أختام)
--
--   الزبون يمسح كود المحل ← الجوال يرسل موقعه ← لو داخل نطاق المحل (50 متر افتراضياً) ينضاف ختم
--   زيارة وحدة كل فترة (12 ساعة افتراضياً)، ولما يكمّل الأختام يستخدم مكافأته قدام الموظف
--   ما نخزن إحداثيات الزبون أبداً، بس المسافة عن المحل بالمتر
--
--   clients.loyalty_enabled   تشغيل البطاقة
--   clients.loyalty_settings  { needed, reward, cooldown_hours, radius_m }
--   clients.loyalty_lat/lng   موقع المحل (يحدده صاحب المحل وهو داخل المحل)
--
-- شغّل الملف كامل مرة وحدة في Supabase → SQL Editor. آمن لإعادة التشغيل.
-- =====================================================================

begin;

alter table public.clients add column if not exists loyalty_enabled boolean not null default false;
alter table public.clients add column if not exists loyalty_settings jsonb not null default '{}'::jsonb;
alter table public.clients add column if not exists loyalty_lat double precision;
alter table public.clients add column if not exists loyalty_lng double precision;

create table if not exists public.loyalty_cards (
  id            bigserial primary key,
  client_id     bigint not null references public.clients(id) on delete cascade,
  token         text not null unique,
  name          text not null,
  phone         text not null,
  stamps        int not null default 0,
  visits        int not null default 0,
  rewards       int not null default 0,
  last_stamp_at timestamptz,
  created_at    timestamptz not null default now(),
  unique (client_id, phone)
);
create index if not exists loyalty_cards_client_idx on public.loyalty_cards (client_id, last_stamp_at desc);

create table if not exists public.loyalty_events (
  id          bigserial primary key,
  client_id   bigint not null references public.clients(id) on delete cascade,
  card_id     bigint not null references public.loyalty_cards(id) on delete cascade,
  kind        text not null check (kind in ('stamp', 'redeem')),
  distance_m  int,
  created_at  timestamptz not null default now()
);
create index if not exists loyalty_events_client_idx on public.loyalty_events (client_id, created_at desc);

-- الوصول من الخادم فقط (بدون سياسات = المتصفح ما يقدر يقرأ أو يكتب)
alter table public.loyalty_cards  enable row level security;
alter table public.loyalty_events enable row level security;

-- ختم جديد: مرة وحدة كل فترة، وبشكل ذري (ما يتكرر لو ضغط مرتين بنفس اللحظة)
create or replace function public.server_loyalty_stamp(p_card bigint, p_cooldown_hours int, p_needed int, p_distance int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.loyalty_cards;
begin
  update public.loyalty_cards
     set stamps = stamps + 1, visits = visits + 1, last_stamp_at = now()
   where id = p_card
     and stamps < p_needed
     and (last_stamp_at is null or last_stamp_at < now() - make_interval(hours => p_cooldown_hours))
  returning * into c;
  if not found then
    select * into c from public.loyalty_cards where id = p_card;
    if c.stamps >= p_needed then return jsonb_build_object('ok', false, 'reason', 'FULL', 'stamps', c.stamps); end if;
    return jsonb_build_object('ok', false, 'reason', 'COOLDOWN', 'stamps', c.stamps,
                              'next_at', c.last_stamp_at + make_interval(hours => p_cooldown_hours));
  end if;
  insert into public.loyalty_events (client_id, card_id, kind, distance_m) values (c.client_id, c.id, 'stamp', p_distance);
  return jsonb_build_object('ok', true, 'stamps', c.stamps);
end $$;

-- استخدام المكافأة: ينقص الأختام المطلوبة مرة وحدة بس
create or replace function public.server_loyalty_redeem(p_card bigint, p_needed int, p_distance int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.loyalty_cards;
begin
  update public.loyalty_cards
     set stamps = stamps - p_needed, rewards = rewards + 1
   where id = p_card and stamps >= p_needed
  returning * into c;
  if not found then return jsonb_build_object('ok', false); end if;
  insert into public.loyalty_events (client_id, card_id, kind, distance_m) values (c.client_id, c.id, 'redeem', p_distance);
  return jsonb_build_object('ok', true, 'stamps', c.stamps, 'rewards', c.rewards);
end $$;

revoke all on function public.server_loyalty_stamp(bigint, int, int, int) from public, anon, authenticated;
revoke all on function public.server_loyalty_redeem(bigint, int, int) from public, anon, authenticated;
grant execute on function public.server_loyalty_stamp(bigint, int, int, int) to service_role;
grant execute on function public.server_loyalty_redeem(bigint, int, int) to service_role;

commit;

notify pgrst, 'reload schema';
