-- =====================================================================
-- DEV MENU — الطلب من المنيو: الزبون يطلب من جواله ويوصل الطلب لشاشة الكاشير
--   clients.menu_order_mode: null = مطفي (الطلب عبر واتساب مثل قبل)
--     'table' = خدمة على الطاولة: الزبون يكتب رقم طاولته، والطلب يوصل للكاشير (يحتاج المنيو)
--     'self'  = خدمة ذاتية: محلي أو سفري، ويطلع له رقم بيجر ويرن جواله لما يجهز (يحتاج المنيو والبيجر)
--   menu_orders: الطلبات (الأصناف بأسعار قاعدة البيانات وقت الطلب)
--     status: new (وصل) → accepted (الكاشير استلمه) → served (انقدّم/انتهى) أو cancelled
--     في الخدمة الذاتية الطلب مربوط برقم البيجر (pager_ticket_id) وحالته من حالة الرقم
-- =====================================================================
alter table public.clients add column if not exists menu_order_mode text;
alter table public.clients drop constraint if exists clients_menu_order_mode_check;
alter table public.clients add constraint clients_menu_order_mode_check check (menu_order_mode is null or menu_order_mode in ('table', 'self'));

create table if not exists public.menu_orders (
  id bigserial primary key,
  client_id bigint not null references public.clients(id) on delete cascade,
  token text not null unique,
  mode text not null check (mode in ('table', 'self')),
  dine text check (dine is null or dine in ('in', 'out')),
  table_no text,
  items jsonb not null,
  note text,
  total numeric(10, 2) not null default 0,
  coupon_code text,
  discount numeric(10, 2) not null default 0,
  status text not null default 'new' check (status in ('new', 'accepted', 'served', 'cancelled')),
  pager_ticket_id bigint references public.pager_tickets(id) on delete set null,
  device text,
  lang text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  closed_at timestamptz
);
create index if not exists menu_orders_client_idx on public.menu_orders (client_id, created_at desc);
create index if not exists menu_orders_ticket_idx on public.menu_orders (pager_ticket_id) where pager_ticket_id is not null;
alter table public.menu_orders enable row level security;
revoke all on table public.menu_orders from anon, authenticated;
notify pgrst, 'reload schema';

-- السفري: رقم جوال الزبون (إجباري)، يطلع للكاشير عشان يتواصل معه لو احتاج
alter table public.menu_orders add column if not exists phone text;
notify pgrst, 'reload schema';
