-- يرجع 28-plans.sql
begin;
alter table public.clients drop constraint if exists clients_requested_plan_check;
alter table public.clients drop constraint if exists clients_subscription_plan_check;
alter table public.clients drop column if exists requested_plan;
alter table public.clients drop column if exists plan_requested_at;
alter table public.clients drop column if exists subscription_plan;
commit;
