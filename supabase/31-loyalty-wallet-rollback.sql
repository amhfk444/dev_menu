alter table public.loyalty_cards drop column if exists wallet_serial;
alter table public.loyalty_cards drop column if exists wallet_url;
notify pgrst, 'reload schema';
