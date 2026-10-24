alter table public.pager_tickets drop column if exists loyalty_stamped;
alter table public.pager_tickets drop column if exists loyalty_card_id;
drop table if exists public.loyalty_stamp_codes;
notify pgrst, 'reload schema';
