-- =====================================================================
-- DEV MENU — بيانات الطلب (طلب فرع: الاسم ونوع المنيو) عشان المدير يوافق بضغطة
-- =====================================================================
alter table public.support_requests add column if not exists meta jsonb;
notify pgrst, 'reload schema';
