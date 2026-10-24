-- =====================================================================
-- DEV MENU — الباقة بالمميزات
--   plan_features       المميزات المفعّلة في الاشتراك: menu / pager / waitlist / loyalty
--                       (فاضي للمشترك القديم = المنيو + البيجر + الانتظار، والتجربة فيها كل شي)
--   requested_features  المميزات اللي اختارها صاحب المحل مع طلب الاشتراك
-- شغّل الملف مرة وحدة في Supabase → SQL Editor. آمن لإعادة التشغيل.
-- =====================================================================
alter table public.clients add column if not exists plan_features text[];
alter table public.clients add column if not exists requested_features text[];
notify pgrst, 'reload schema';
select count(*) filter (where plan_features is null) as without_features from public.clients;
