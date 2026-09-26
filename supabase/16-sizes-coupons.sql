-- =====================================================================
-- DEV MENU — أحجام وأسعار متعددة + كوبونات الخصم
--
--   products.sizes  jsonb  [{name, name_en, price}]  حد أقصى 6 أحجام
--   coupons         كوبونات خصم لكل متجر (على كل الأصناف أو أقسام وأصناف محددة)
--
-- شغّل الملف كامل مرة وحدة في Supabase → SQL Editor. آمن لإعادة التشغيل.
-- =====================================================================

begin;

-- ─── 1) أحجام الأطباق ───
alter table public.products add column if not exists sizes jsonb not null default '[]'::jsonb;
alter table public.products drop constraint if exists products_sizes_check;
alter table public.products add  constraint products_sizes_check
  check (jsonb_typeof(sizes) = 'array' and jsonb_array_length(sizes) <= 6);

-- ─── 2) الكوبونات ───
create table if not exists public.coupons (
  id            bigint generated always as identity primary key,
  client_id     bigint not null references public.clients(id) on delete cascade,
  code          text   not null check (code ~ '^[A-Z0-9-]{3,20}$'),
  type          text   not null check (type in ('percent', 'fixed')),
  value         numeric(10, 2) not null check (value > 0),
  scope         text   not null default 'all' check (scope in ('all', 'selected')),
  category_keys text[] not null default '{}',
  product_ids   bigint[] not null default '{}',
  min_order     numeric(10, 2) check (min_order is null or min_order >= 0),
  starts_at     timestamptz,
  ends_at       timestamptz,
  max_uses      integer check (max_uses is null or max_uses > 0),
  uses          integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (client_id, code),
  check (type <> 'percent' or value <= 100),
  check (starts_at is null or ends_at is null or ends_at >= starts_at)
);
create index if not exists coupons_client_idx on public.coupons (client_id);

-- مقفول عن المتصفح تماماً: الخادم فقط (service_role) يوصل له
alter table public.coupons enable row level security;
revoke all on public.coupons from anon, authenticated;
grant select, insert, update, delete on public.coupons to service_role;

-- تسجيل استخدام كوبون: يزيد العداد فقط إذا الكوبون فعّال وما وصل حده
create or replace function public.redeem_coupon(p_coupon_id bigint)
returns boolean
language sql
set search_path = public
as $$
  with u as (
    update public.coupons
       set uses = uses + 1
     where id = p_coupon_id
       and is_active
       and (max_uses is null or uses < max_uses)
       and (starts_at is null or starts_at <= now())
       and (ends_at is null or ends_at >= now())
    returning 1
  )
  select exists (select 1 from u);
$$;
revoke all on function public.redeem_coupon(bigint) from public, anon, authenticated;
grant execute on function public.redeem_coupon(bigint) to service_role;

commit;

-- ─── تحقق: لازم يطلع 1 و 1 و 1 ───
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'sizes') as sizes_col,
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'coupons') as coupons_table,
  (select count(*) from pg_proc where proname = 'redeem_coupon') as redeem_fn;
