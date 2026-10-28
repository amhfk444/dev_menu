-- =====================================================================
-- DEV MENU — تقوية الحماية (مراجعة أمان 2026-10)
-- المتصفح ما يكلم قاعدة البيانات أبداً: كل البيانات تمر عبر خادمنا (/api) بمفتاح الخدمة.
-- فالمفتاح العام (anon) والمستخدم المسجل (authenticated) ما يحتاجون أي صلاحية على جداول الخادم.
--
-- 1) جدول settings القديم (ما يستخدمه الكود): كان مفتوح قراءة وكتابة وحذف لأي أحد عنده المفتاح العام.
-- 2) جداول الخادم: نشيل صلاحيات anon و authenticated كلها (RLS كان يمنع، وهذي طبقة حماية ثانية،
--    وتشيل TRUNCATE اللي ما يمنعه RLS).
-- 3) دوال رقم العضوية: ما يحتاجها إلا الخادم.
-- =====================================================================

-- 1) settings
drop policy if exists "Allow All Settings" on public.settings;
revoke all on public.settings from anon, authenticated;

-- 2) جداول الخادم
do $$
declare t text;
begin
  foreach t in array array[
    'app_settings', 'google_connections', 'loyalty_cards', 'loyalty_events', 'loyalty_feedback', 'loyalty_gifts',
    'loyalty_messages', 'loyalty_stamp_codes', 'owner_push', 'pager_tickets', 'review_drafts', 'support_requests',
    'waitlist_entries', 'coupons', 'menu_events', 'super_admins', 'settings'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon, authenticated', t);
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

-- 3) دوال رقم العضوية (الـ trigger يشتغل وقت الإضافة من الخادم)
revoke execute on function public.loyalty_random_member_no(bigint) from anon, authenticated, public;
revoke execute on function public.loyalty_set_member_no() from anon, authenticated, public;

notify pgrst, 'reload schema';
