-- =====================================================================
-- DEV MENU — الطلب من المنيو: العميل يطلب من جواله ويوصل الطلب لشاشة الكاشير
--   clients.menu_order_mode: null = مطفي (الطلب عبر واتساب مثل قبل)، 'table' = مفعّل
--   menu_orders: الطلبات (الأصناف بأسعار قاعدة البيانات وقت الطلب)
--     code: رمز الطلب اللي يوريه العميل للكاشير (A12)، dine: محلي in / سفري out، table_no: رقم الطاولة (اختياري للمحلي، من QR الطاولة)
--     status: new (وصل) → accepted (الكاشير استلمه) → served (سلّمه) أو cancelled
-- =====================================================================
alter table public.clients add column if not exists menu_order_mode text;
alter table public.clients drop constraint if exists clients_menu_order_mode_check;
alter table public.clients add constraint clients_menu_order_mode_check check (menu_order_mode is null or menu_order_mode in ('table', 'self'));

create table if not exists public.menu_orders (
  id bigserial primary key,
  client_id bigint not null references public.clients(id) on delete cascade,
  token text not null unique,
  mode text not null default 'table',
  code text,
  dine text check (dine is null or dine in ('in', 'out', 'delivery')),
  table_no text,
  items jsonb not null,
  note text,
  total numeric(10, 2) not null default 0,
  coupon_code text,
  discount numeric(10, 2) not null default 0,
  status text not null default 'new' check (status in ('new', 'accepted', 'served', 'cancelled')),
  device text,
  lang text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  closed_at timestamptz
);
alter table public.menu_orders add column if not exists code text;
alter table public.menu_orders add column if not exists dine text;
alter table public.menu_orders drop constraint if exists menu_orders_dine_check;
alter table public.menu_orders add constraint menu_orders_dine_check check (dine is null or dine in ('in', 'out', 'delivery'));
-- التوصيل والطلب المسبق (الأسر المنتجة ومحلات الورود): العنوان والموقع والجوال ورسوم التوصيل، وموعد الطلب
alter table public.menu_orders add column if not exists phone text;
alter table public.menu_orders add column if not exists address text;
alter table public.menu_orders add column if not exists location text;
alter table public.menu_orders add column if not exists delivery_fee numeric(10, 2) not null default 0;
alter table public.menu_orders add column if not exists scheduled_at timestamptz;
-- خيارات صاحب المتجر: محلي / استلام / توصيل (ورسومه ونطاقه) / الطلب المسبق
alter table public.clients add column if not exists menu_order_opts jsonb;
-- السفري: لما يستلمه الكاشير ياخذ العميل رقم بيجر (يرن لما يجهز)، وتنربط بطاقة النداء اللي في جواله (cards)
alter table public.menu_orders add column if not exists pager_ticket_id bigint references public.pager_tickets(id) on delete set null;
alter table public.menu_orders add column if not exists cards jsonb;
create index if not exists menu_orders_ticket_idx on public.menu_orders (pager_ticket_id) where pager_ticket_id is not null;
create index if not exists menu_orders_client_idx on public.menu_orders (client_id, created_at desc);
alter table public.menu_orders enable row level security;
revoke all on table public.menu_orders from anon, authenticated;
notify pgrst, 'reload schema';
