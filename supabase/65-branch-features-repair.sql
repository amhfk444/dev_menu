-- =====================================================================
-- DEV MENU — تصليح الفروع اللي أخذت مميزات الحساب كاملة بالغلط (تعديل الباقة وقت التجربة)
--   الفرع بمميزاته الخاصة = مميزاته (منيو، بيجر، انتظار) + الولاء والرسائل من الحساب الرئيسي
--   الرسائل تحتاج البيجر، وتنشال لو فيه الولاء (مشمولة فيه)
-- =====================================================================
with fixed as (
  select b.id,
         array(select k from unnest(array['menu','pager','notify','waitlist','loyalty']) with ordinality as o(k, n)
                where (k in ('menu','pager','waitlist') and k = any(b.branch_features))
                   or (k = 'loyalty' and k = any(p.plan_features))
                   or (k = 'notify' and k = any(p.plan_features) and 'pager' = any(b.branch_features) and not ('loyalty' = any(p.plan_features)))
                order by n) as f
    from public.clients b join public.clients p on p.id = b.parent_id
   where b.branch_features is not null
)
update public.clients c set plan_features = fixed.f, waitlist_enabled = ('waitlist' = any(fixed.f))
  from fixed
 where c.id = fixed.id and c.plan_features is distinct from fixed.f;
