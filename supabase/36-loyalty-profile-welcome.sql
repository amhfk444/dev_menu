-- =====================================================================
-- DEV MENU — بيانات العضو + رسالة الترحيب
--   loyalty_cards.gender  النوع (m / f) عشان صاحب المحل يعرف مين أكثر فئة تزوره، والمساعد يخاطب صح
--   رسالة الترحيب في clients.loyalty_settings.welcome ما تحتاج عمود
-- شغّل الملف مرة وحدة في Supabase → SQL Editor. آمن لإعادة التشغيل.
-- =====================================================================
alter table public.loyalty_cards add column if not exists gender text;
alter table public.loyalty_cards drop constraint if exists loyalty_cards_gender_check;
alter table public.loyalty_cards add constraint loyalty_cards_gender_check check (gender in ('m', 'f'));
notify pgrst, 'reload schema';
