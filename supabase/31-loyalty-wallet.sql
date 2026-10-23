-- =====================================================================
-- DEV MENU — بطاقة الولاء في محفظة آبل وقوقل (عبر WalletWallet)
--   wallet_serial  رقم البطاقة عند الخدمة (نحدّثها مع كل ختم)
--   wallet_url     صفحة الإضافة للمحفظة (تعرض زر آبل أو قوقل حسب الجوال)
-- شغّل الملف مرة وحدة في Supabase → SQL Editor. آمن لإعادة التشغيل.
-- =====================================================================
alter table public.loyalty_cards add column if not exists wallet_serial text;
alter table public.loyalty_cards add column if not exists wallet_url text;
notify pgrst, 'reload schema';
