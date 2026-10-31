-- =====================================================================
-- DEV MENU — رسائل الولاء لزبائن فرع واحد: كل بطاقة ولاء تعرف الفروع اللي زارها صاحبها
--   (الفرع اللي سجّل فيه، وكل فرع انختم له أو صرف فيه)
-- =====================================================================
alter table public.loyalty_cards add column if not exists branch_ids bigint[] not null default '{}';
update public.loyalty_cards c set branch_ids = s.ids
  from (
    select id, array_agg(distinct b) ids from (
      select id, branch_id b from public.loyalty_cards where branch_id is not null
      union select card_id, branch_id from public.loyalty_events where branch_id is not null
    ) x group by id
  ) s
 where s.id = c.id and c.branch_ids = '{}';
create index if not exists loyalty_cards_branch_idx on public.loyalty_cards using gin (branch_ids);

-- يضيف الفرع للبطاقة (مرة وحدة)
create or replace function public.server_card_add_branch(p_card bigint, p_branch bigint)
returns void language sql security definer set search_path = public as $$
  update public.loyalty_cards set branch_ids = array_append(branch_ids, p_branch)
   where id = p_card and not (branch_ids @> array[p_branch]);
$$;
revoke all on function public.server_card_add_branch(bigint, bigint) from public, anon, authenticated;

-- الرسالة لفرع واحد (فاضي = كل الفروع)
alter table public.loyalty_messages add column if not exists branch_id bigint references public.clients(id) on delete set null;
notify pgrst, 'reload schema';
