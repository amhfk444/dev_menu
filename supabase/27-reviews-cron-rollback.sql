-- تراجع عن 27-reviews-cron.sql
select cron.unschedule('devmenu-reviews-sync');
drop table if exists public.app_settings;
