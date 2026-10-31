-- =====================================================================
-- DEV MENU — رسائل لزبائن فرع واحد: كل بطاقة نداء تعرف الفروع اللي أخذ منها صاحبها رقم
--   البطاقات القديمة تاخذ فروعها من أرقام البيجر اللي انربطت فيها
-- =====================================================================
alter table public.pager_cards add column if not exists branch_ids bigint[] not null default '{}';
update public.pager_cards pc set branch_ids = s.ids
  from (select wallet_serial, array_agg(distinct client_id) ids from public.pager_tickets where wallet_serial is not null group by wallet_serial) s
 where s.wallet_serial = pc.wallet_serial and pc.branch_ids = '{}';
create index if not exists pager_cards_branch_idx on public.pager_cards using gin (branch_ids);
-- الرسالة لفرع واحد (فاضي = كل الفروع)
alter table public.pager_messages add column if not exists branch_id bigint references public.clients(id) on delete set null;
notify pgrst, 'reload schema';
