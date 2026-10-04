-- =====================================================================
-- DEV MENU — الطلب والدفع الإلكتروني من المنيو (Moyasar)
--
--   payment_settings  إعدادات الدفع لكل متجر: المفتاح السري لحساب Moyasar حق المطعم (مشفّر)
--   orders            طلبات المنيو المدفوعة: الأصناف والمبالغ بأسعار قاعدة البيانات + مرجع فاتورة Moyasar
--   pager_tickets.order_id   الطلب المدفوع ياخذ رقم بيجر تلقائياً ويطلع في شاشة الكاشير
--
-- الجداول مقفولة (RLS بدون سياسات): القراءة والكتابة عبر الخادم فقط.
-- شغّل الملف كامل مرة وحدة في Supabase → SQL Editor. آمن لإعادة التشغيل.
-- يحتاج 19-pager.sql و 22-pager-invoice.sql قبله.
-- =====================================================================
begin;

create table if not exists public.payment_settings (
  client_id      bigint primary key references public.clients(id) on delete cascade,
  provider       text not null default 'moyasar' check (provider in ('moyasar')),
  enabled        boolean not null default false,
  live           boolean not null default false,
  secret_key_enc text,
  updated_at     timestamptz not null default now()
);
alter table public.payment_settings enable row level security;

create table if not exists public.orders (
  id              bigserial primary key,
  client_id       bigint not null references public.clients(id) on delete cascade,
  token           text not null unique,
  status          text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled')),
  items           jsonb not null default '[]'::jsonb,
  subtotal        numeric(12,3) not null default 0,
  discount        numeric(12,3) not null default 0,
  total           numeric(12,3) not null,
  currency        text not null default 'SAR',
  coupon_id       bigint,
  coupon_code     text,
  customer_name   text,
  note            text,
  provider        text not null default 'moyasar',
  payment_ref     text,
  pager_ticket_id bigint references public.pager_tickets(id) on delete set null,
  created_at      timestamptz not null default now(),
  paid_at         timestamptz
);
create index if not exists orders_client_day_idx on public.orders (client_id, created_at desc);
create index if not exists orders_payment_ref_idx on public.orders (payment_ref);
alter table public.orders enable row level security;

alter table public.pager_tickets add column if not exists order_id bigint references public.orders(id) on delete set null;

commit;
notify pgrst, 'reload schema';
