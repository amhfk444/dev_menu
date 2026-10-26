-- =====================================================================
-- DEV MENU — طلبات المشتركين للإدارة (بدل الواتساب)
-- التجديد، تغيير الباقة، تفعيل إضافة، الحساب الموقوف، أو رسالة عامة.
-- توصل لصفحة المدير العام (super-admin.html)، والرد يرجع لصاحب المتجر في لوحته.
-- الوصول من الخادم فقط (service role)، فما فيه سياسات RLS للمتصفح.
-- =====================================================================
create table if not exists public.support_requests (
  id          bigserial primary key,
  client_id   bigint not null references public.clients(id) on delete cascade,
  kind        text not null default 'contact' check (kind in ('renew', 'plan', 'addon', 'suspended', 'contact')),
  body        text not null,
  status      text not null default 'open' check (status in ('open', 'done')),
  reply       text,
  created_at  timestamptz not null default now(),
  handled_at  timestamptz
);
create index if not exists support_requests_client_idx on public.support_requests (client_id, created_at desc);
create index if not exists support_requests_open_idx on public.support_requests (status, created_at desc);
alter table public.support_requests enable row level security;
notify pgrst, 'reload schema';
