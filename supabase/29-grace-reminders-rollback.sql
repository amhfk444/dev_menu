-- يرجع 29-grace-reminders.sql (بدون مهلة، وبدون تذكير تلقائي)
create or replace function public.client_is_live(p_active boolean, p_status text, p_trial timestamptz, p_end timestamptz)
returns boolean language sql stable as $function$
  select coalesce(p_active, false) and case p_status
    when 'active' then p_end is null or p_end > now()
    when 'trial'  then p_trial is null or p_trial > now()
    else false end
$function$;
do $$ begin perform cron.unschedule('devmenu-subscription-reminders'); exception when others then null; end $$;
alter table public.clients drop column if exists reminder_key;
notify pgrst, 'reload schema';
