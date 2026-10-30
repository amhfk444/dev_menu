-- بطاقة النداء: نتيجة آخر تحديث للبطاقة (عشان نعرف هل وصل "جاهز" للمحفظة)
alter table public.pager_tickets add column if not exists wallet_error text;
notify pgrst, 'reload schema';
