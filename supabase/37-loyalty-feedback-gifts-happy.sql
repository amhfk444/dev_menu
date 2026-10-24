-- =====================================================================
-- DEV MENU — بطاقة الولاء: ليش ما رجعت؟ + هدية لصديق + ساعات الهدوء (ختم دبل)
--   loyalty_feedback  رد الزبون الغايب على "وش اللي ما عجبك؟"
--   loyalty_gifts     مكافأة مهداة لصديق برابط (الصديق يسجل وياخذها من المحل)
--   server_loyalty_stamp صار يقبل عدد الأختام (ختمين في ساعات الهدوء)
--   loyalty_events.kind: stamp / redeem / gift (أهدى) / gift_redeem (استخدم هدية)
-- شغّل الملف كامل مرة وحدة في Supabase → SQL Editor. آمن لإعادة التشغيل.
-- =====================================================================
begin;

create table if not exists public.loyalty_feedback (
  id          bigserial primary key,
  client_id   bigint not null references public.clients(id) on delete cascade,
  card_id     bigint not null references public.loyalty_cards(id) on delete cascade,
  reason      text not null check (reason in ('wait', 'price', 'quality', 'far', 'busy', 'other')),
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists loyalty_feedback_client_idx on public.loyalty_feedback (client_id, created_at desc);
alter table public.loyalty_feedback enable row level security;

create table if not exists public.loyalty_gifts (
  id          bigserial primary key,
  client_id   bigint not null references public.clients(id) on delete cascade,
  code        text not null unique,
  from_card   bigint not null references public.loyalty_cards(id) on delete cascade,
  to_card     bigint references public.loyalty_cards(id) on delete set null,
  reward      text not null,
  status      text not null default 'sent' check (status in ('sent', 'claimed', 'redeemed')),
  new_member  boolean not null default false,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  redeemed_at timestamptz,
  expires_at  timestamptz not null default now() + interval '30 days'
);
create index if not exists loyalty_gifts_client_idx on public.loyalty_gifts (client_id, created_at desc);
create index if not exists loyalty_gifts_to_idx on public.loyalty_gifts (to_card) where status = 'claimed';
alter table public.loyalty_gifts enable row level security;

alter table public.loyalty_events drop constraint if exists loyalty_events_kind_check;
alter table public.loyalty_events add constraint loyalty_events_kind_check check (kind in ('stamp', 'redeem', 'gift', 'gift_redeem'));

-- الختم: عدد الأختام (1 أو 2) ما يتعدى المطلوب
drop function if exists public.server_loyalty_stamp(bigint, int, int, int);
create or replace function public.server_loyalty_stamp(p_card bigint, p_cooldown_hours int, p_needed int, p_distance int, p_count int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.loyalty_cards;
begin
  update public.loyalty_cards
     set stamps = least(stamps + greatest(p_count, 1), p_needed), visits = visits + 1, last_stamp_at = now()
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
revoke all on function public.server_loyalty_stamp(bigint, int, int, int, int) from public, anon, authenticated;
grant execute on function public.server_loyalty_stamp(bigint, int, int, int, int) to service_role;

-- إهداء المكافأة: ينقص الأختام مرة وحدة بس (مثل الاستخدام)
create or replace function public.server_loyalty_gift(p_card bigint, p_needed int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.loyalty_cards;
begin
  update public.loyalty_cards set stamps = stamps - p_needed where id = p_card and stamps >= p_needed returning * into c;
  if not found then return jsonb_build_object('ok', false); end if;
  insert into public.loyalty_events (client_id, card_id, kind) values (c.client_id, c.id, 'gift');
  return jsonb_build_object('ok', true, 'stamps', c.stamps);
end $$;
revoke all on function public.server_loyalty_gift(bigint, int) from public, anon, authenticated;
grant execute on function public.server_loyalty_gift(bigint, int) to service_role;

commit;
notify pgrst, 'reload schema';
