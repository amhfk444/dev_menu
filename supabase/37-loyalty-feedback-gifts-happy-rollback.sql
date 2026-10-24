begin;
drop function if exists public.server_loyalty_gift(bigint, int);
drop table if exists public.loyalty_gifts;
drop table if exists public.loyalty_feedback;
commit;
notify pgrst, 'reload schema';
