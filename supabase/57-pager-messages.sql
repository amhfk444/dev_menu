-- =====================================================================
-- DEV MENU — "رسائل لزبائنك": صاحب المحل يرسل إشعار لكل زبون حافظ بطاقة النداء
-- إضافة مدفوعة على البيجر (notify في js/plans.js). client_id = المحل الرئيسي
-- حد الرسائل بالأسبوع يتحسب من هالجدول
-- =====================================================================
create table if not exists public.pager_messages (
  id bigserial primary key,
  client_id bigint not null references public.clients(id) on delete cascade,
  body text not null,
  sent int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists pager_messages_client_idx on public.pager_messages (client_id, created_at desc);
alter table public.pager_messages enable row level security;
notify pgrst, 'reload schema';
