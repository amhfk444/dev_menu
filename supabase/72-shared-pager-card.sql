-- =====================================================================
-- DEV MENU — بطاقة النداء الموحدة: بطاقة وحدة للزبون في كل المحلات المشتركة
--   client_id = المحل اللي انضافت منه أول مرة (لو انحذف المحل تبقى البطاقة)
--   last_store_id = آخر محل أخذ منه رقم (البطاقة تلبس شكله، وتغيير هويته يحدّثها)
--   branch_ids = كل المحلات والفروع اللي أخذ منها رقم (رسائل المحل توصل لزبائنه بس)
-- =====================================================================
alter table public.pager_cards alter column client_id drop not null;
alter table public.pager_cards drop constraint if exists pager_cards_client_id_fkey;
alter table public.pager_cards add constraint pager_cards_client_id_fkey
  foreign key (client_id) references public.clients(id) on delete set null;
alter table public.pager_cards add column if not exists last_store_id bigint references public.clients(id) on delete set null;
update public.pager_cards set last_store_id = coalesce(branch_ids[array_length(branch_ids, 1)], client_id) where last_store_id is null;
create index if not exists pager_cards_last_store_idx on public.pager_cards (last_store_id);
notify pgrst, 'reload schema';
