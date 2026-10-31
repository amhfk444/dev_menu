-- =====================================================================
-- DEV MENU — إشعارات صاحب المحل داخل لوحة التحكم (الجرس)
--   رد الإدارة على طلب، إضافة فرع أو تفعيل مميزاته، إشعار من الإدارة لمحل أو للكل
--   للحساب كله (المتجر الرئيسي)، وتطلع في لوحة كل فروعه
-- =====================================================================
create table if not exists public.owner_notifications (
  id bigserial primary key,
  client_id bigint not null references public.clients(id) on delete cascade,
  kind text not null default 'admin',
  title text not null,
  body text,
  link text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists owner_notifications_client_idx on public.owner_notifications (client_id, id desc);
alter table public.owner_notifications enable row level security;
notify pgrst, 'reload schema';
