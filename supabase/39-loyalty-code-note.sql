-- كود الختم: سبب عدم الختم (مثلاً الزبون مختوم قبل شوي) عشان شاشة الكاشير توضحه
alter table public.loyalty_stamp_codes add column if not exists note text;
notify pgrst, 'reload schema';
