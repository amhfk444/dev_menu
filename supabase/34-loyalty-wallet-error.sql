-- آخر خطأ في تحديث بطاقة المحفظة (للمتابعة)، فاضي = آخر تحديث نجح
alter table public.loyalty_cards add column if not exists wallet_error text;
notify pgrst, 'reload schema';
