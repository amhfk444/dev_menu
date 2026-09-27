-- =====================================================================
-- DEV MENU — ربط الأطباق بين الفروع
--
--   products.link_id  uuid  نفس القيمة للطبق في المتجر الرئيسي وكل فروعه.
--   تعديل الاسم/الوصف/الصورة/القسم... يمشي على كل الأطباق بنفس link_id،
--   أما السعر والإخفاء والحذف والتوفر فتبقى لكل فرع لحاله.
--
-- الأطباق المنسوخة في الفروع قبل هذا التحديث تنربط بطبق المتجر الرئيسي بنفس الاسم.
-- شغّل الملف كامل في Supabase → SQL Editor. آمن لإعادة التشغيل.
-- =====================================================================

begin;

alter table public.products add column if not exists link_id uuid;

-- 1) أطباق المتاجر الرئيسية (والمتاجر اللي ما لها فروع): معرّف ربط جديد
update public.products p set link_id = gen_random_uuid()
where p.link_id is null
  and exists (select 1 from public.clients c where c.id = p.client_id and c.parent_id is null);

-- 2) أطباق الفروع: نفس معرّف طبق المتجر الرئيسي اللي بنفس الاسم
update public.products b set link_id = r.link_id
from public.clients c, public.products r
where b.link_id is null
  and c.id = b.client_id and c.parent_id is not null
  and r.client_id = c.parent_id and r.name = b.name and r.link_id is not null;

-- 3) الباقي (أطباق أضافها الفرع بنفسه): معرّف خاص فيها
update public.products set link_id = gen_random_uuid() where link_id is null;

-- الأطباق الجديدة تاخذ معرّف تلقائي، والنسخ للفروع ينسخه كما هو
alter table public.products alter column link_id set default gen_random_uuid();
alter table public.products alter column link_id set not null;
create index if not exists products_link_idx on public.products (link_id);

commit;

-- تحقق: لازم يطلع 0 (ما فيه طبق بدون ربط)
select count(*) as unlinked from public.products where link_id is null;
