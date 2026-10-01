-- =====================================================================
-- DEV MENU — البيجر الرقمي
-- العميل يمسح QR عند الكاشير ← ياخذ رقم ← الكاشير يضغط "جاهز" ← جوال العميل يرن
-- الجدول مقفول (RLS بدون سياسات): القراءة والكتابة عبر الخادم فقط (/api/pager و /api/owner)
-- =====================================================================
create table if not exists public.pager_tickets (
  id          bigserial primary key,
  client_id   bigint not null references public.clients(id) on delete cascade,
  token       text not null unique,
  number      int not null,
  status      text not null default 'waiting' check (status in ('waiting', 'ready', 'done', 'cancelled')),
  created_at  timestamptz not null default now(),
  ready_at    timestamptz,
  closed_at   timestamptz
);
create index if not exists pager_tickets_client_day_idx on public.pager_tickets (client_id, created_at desc);
alter table public.pager_tickets enable row level security;

-- رقم جديد بالترتيب لكل متجر، يبدأ من 1 كل يوم (بتوقيت الرياض) — مقفول ضد التكرار
create or replace function public.server_pager_take(p_client_id bigint, p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare
  day_start timestamptz := (date_trunc('day', now() at time zone 'Asia/Riyadh')) at time zone 'Asia/Riyadh';
  n int;
begin
  perform pg_advisory_xact_lock(hashtext('pager:' || p_client_id));
  select count(*) into n from pager_tickets where client_id = p_client_id and created_at >= day_start;
  if n >= 999 then raise exception 'PAGER_FULL'; end if;
  select coalesce(max(number), 0) + 1 into n from pager_tickets where client_id = p_client_id and created_at >= day_start;
  insert into pager_tickets (client_id, token, number) values (p_client_id, p_token, n);
  return json_build_object('token', p_token, 'number', n);
end $$;

revoke all on function public.server_pager_take(bigint, text) from public, anon, authenticated;
