alter table public.loyalty_cards drop constraint if exists loyalty_cards_gender_check;
alter table public.loyalty_cards drop column if exists gender;
notify pgrst, 'reload schema';
