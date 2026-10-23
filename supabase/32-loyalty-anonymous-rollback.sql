-- يرجع 32 (يفشل لو فيه بطاقات بدون اسم أو جوال)
alter table public.loyalty_cards alter column name set not null;
alter table public.loyalty_cards alter column phone set not null;
notify pgrst, 'reload schema';
