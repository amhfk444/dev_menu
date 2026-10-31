-- =====================================================================
-- DEV MENU — الأعضاء القدامى بدون فرع: اللي سجّلوا قبل ما يفتح المحل أول فرع له
--   (أو المحل ما عنده فروع) أكيد من المحل الرئيسي، لأنه ما كان فيه غيره
-- =====================================================================
update public.loyalty_cards c set branch_ids = array[c.client_id]
 where c.branch_ids = '{}'
   and c.created_at < coalesce((select min(b.created_at) from public.clients b where b.parent_id = c.client_id), 'infinity'::timestamptz);
