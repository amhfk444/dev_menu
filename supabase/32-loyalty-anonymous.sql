-- =====================================================================
-- DEV MENU — بطاقة الولاء بدون تسجيل
--   الزبون يمسح ويختم بدون ما يكتب شي، والبطاقة مربوطة بجواله (رقم سري في المتصفح وفي المحفظة)
--   الاسم والجوال صاروا اختياريين (الجوال للي يبي يرجّع بطاقته لو غيّر جواله)
-- شغّل الملف مرة وحدة في Supabase → SQL Editor. آمن لإعادة التشغيل.
-- =====================================================================
alter table public.loyalty_cards alter column name drop not null;
alter table public.loyalty_cards alter column phone drop not null;
notify pgrst, 'reload schema';
