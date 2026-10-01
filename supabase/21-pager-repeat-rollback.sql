alter table public.pager_tickets drop column if exists ring_count, drop column if exists last_ring_at, drop column if exists acked_at;
notify pgrst, 'reload schema';
