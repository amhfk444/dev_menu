-- =====================================================================
-- DEV MENU — إضافات الطبق (صوصات، مخلل، نوع الخبز...)
--   products.extras: مجموعات، كل مجموعة فيها خيارات بأسعار
--   [{ name, name_en?, required, max, options: [{ name, name_en?, price }] }]
--   required = العميل لازم يختار وحدة على الأقل (مثل نوع الخبز)، max = أقصى عدد يختاره من المجموعة
-- =====================================================================
alter table public.products add column if not exists extras jsonb;
notify pgrst, 'reload schema';
