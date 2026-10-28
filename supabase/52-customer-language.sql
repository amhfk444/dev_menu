-- =====================================================================
-- DEV MENU — لغة العميل (عربي / English)
-- نحفظ لغة الزبون على بطاقته ورقم البيجر وتسجيل الانتظار، عشان الخادم يكتب له
-- إشعاراته وبطاقة المحفظة والبريد ورسائل المساعد بنفس لغته. الفاضي = عربي.
-- آمن لإعادة التشغيل.
-- =====================================================================
alter table public.loyalty_cards    add column if not exists lang text check (lang in ('ar', 'en'));
alter table public.pager_tickets    add column if not exists lang text check (lang in ('ar', 'en'));
alter table public.waitlist_entries add column if not exists lang text check (lang in ('ar', 'en'));
notify pgrst, 'reload schema';
