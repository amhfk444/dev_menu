-- =====================================================================
-- DEV MENU — الباقة الشهرية والسنوية
--
--   requested_plan     الباقة اللي اختارها صاحب المتجر من لوحته (month / year) وتنتظر التفعيل
--   plan_requested_at  وقت الاختيار
--   subscription_plan  الباقة المفعّلة حالياً (month / year)، تنحفظ مع كل تفعيل
--
-- شغّل الملف كامل مرة وحدة في Supabase → SQL Editor. آمن لإعادة التشغيل.
-- =====================================================================

begin;

alter table public.clients add column if not exists requested_plan text;
alter table public.clients add column if not exists plan_requested_at timestamptz;
alter table public.clients add column if not exists subscription_plan text;

alter table public.clients drop constraint if exists clients_requested_plan_check;
alter table public.clients add  constraint clients_requested_plan_check check (requested_plan in ('month', 'year'));
alter table public.clients drop constraint if exists clients_subscription_plan_check;
alter table public.clients add  constraint clients_subscription_plan_check check (subscription_plan in ('month', 'year'));

-- المشتركين الحاليين كلهم على السنوي
update public.clients set subscription_plan = 'year' where subscription_status = 'active' and subscription_plan is null;

commit;
