do $$ begin perform cron.unschedule('devmenu-loyalty-ai'); exception when others then null; end $$;
alter table public.loyalty_messages drop column if exists kind;
alter table public.loyalty_messages drop column if exists source;
alter table public.loyalty_cards drop column if exists ai_last_at;
alter table public.clients drop column if exists loyalty_near_at;
alter table public.clients drop column if exists loyalty_near_lines;
alter table public.clients drop column if exists loyalty_ai;
notify pgrst, 'reload schema';
