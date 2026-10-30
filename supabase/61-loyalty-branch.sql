-- =====================================================================
-- DEV MENU — عملاء الولاء لكل فرع: الفرع اللي سجّل فيه العضو، والفرع اللي صار فيه كل ختم أو صرف
--   (البطاقات والأختام قبل هالتحديث بدون فرع)
-- =====================================================================
alter table public.loyalty_cards  add column if not exists branch_id bigint references public.clients(id) on delete set null;
alter table public.loyalty_events add column if not exists branch_id bigint references public.clients(id) on delete set null;
create index if not exists loyalty_events_branch_idx on public.loyalty_events (client_id, created_at desc, branch_id);
notify pgrst, 'reload schema';

-- أرقام كل فرع: الأعضاء اللي سجلوا فيه، والعملاء اللي زاروه آخر 30 يوم، وأختامه ومكافآته
create or replace function public.server_loyalty_branch_stats(p_client bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  with ev as (
    select branch_id, card_id, kind from public.loyalty_events
     where client_id = p_client and created_at >= now() - interval '30 days' and kind in ('stamp', 'redeem')
  ), ids as (
    select branch_id from public.loyalty_cards where client_id = p_client
    union select branch_id from ev
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'branch_id', i.branch_id,
    'members', (select count(*) from public.loyalty_cards c where c.client_id = p_client and c.branch_id is not distinct from i.branch_id),
    'customers30', (select count(distinct card_id) from ev where ev.branch_id is not distinct from i.branch_id and kind = 'stamp'),
    'stamps30', (select count(*) from ev where ev.branch_id is not distinct from i.branch_id and kind = 'stamp'),
    'redeems30', (select count(*) from ev where ev.branch_id is not distinct from i.branch_id and kind = 'redeem')
  )), '[]'::jsonb) from (select distinct branch_id from ids) i;
$$;
revoke all on function public.server_loyalty_branch_stats(bigint) from public, anon, authenticated;
notify pgrst, 'reload schema';
