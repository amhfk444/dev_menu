-- يرجع 30-loyalty.sql (يحذف بطاقات الولاء وكل الأختام)
begin;
drop function if exists public.server_loyalty_stamp(bigint, int, int, int);
drop function if exists public.server_loyalty_redeem(bigint, int, int);
drop table if exists public.loyalty_events;
drop table if exists public.loyalty_cards;
alter table public.clients drop column if exists loyalty_enabled;
alter table public.clients drop column if exists loyalty_settings;
alter table public.clients drop column if exists loyalty_lat;
alter table public.clients drop column if exists loyalty_lng;
commit;
notify pgrst, 'reload schema';
