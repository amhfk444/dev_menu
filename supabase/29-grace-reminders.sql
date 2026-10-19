-- =====================================================================
-- DEV MENU — مهلة بعد انتهاء الاشتراك + تذكير تلقائي بالتجديد
--
--   1) مهلة 3 أيام: الاشتراك المدفوع لما ينتهي يبقى المنيو شغال للزبائن 3 أيام
--      (التجربة المجانية ما لها مهلة)
--   2) reminder_key: آخر تذكير انرسل (عشان ما يتكرر)
--   3) pg_cron يشغّل /api/subscriptions-cron كل يوم الساعة 9 الصبح بتوقيت الرياض
--
-- شغّل الملف كامل مرة وحدة في Supabase → SQL Editor. آمن لإعادة التشغيل.
-- يحتاج 27-reviews-cron.sql قبله (جدول app_settings ومفتاح cron_key).
-- =====================================================================

create or replace function public.client_is_live(p_active boolean, p_status text, p_trial timestamptz, p_end timestamptz)
returns boolean language sql stable as $function$
  select coalesce(p_active, false) and case p_status
    when 'active' then p_end is null or p_end + interval '3 days' > now()
    when 'trial'  then p_trial is null or p_trial > now()
    else false end
$function$;

alter table public.clients add column if not exists reminder_key text;

do $$ begin
  perform cron.unschedule('devmenu-subscription-reminders');
exception when others then null;
end $$;

select cron.schedule(
  'devmenu-subscription-reminders',
  '0 6 * * *',
  $job$
    select net.http_get(
      url := 'https://www.devmenu.digital/api/subscriptions-cron?key=' || (select value from public.app_settings where key = 'cron_key'),
      timeout_milliseconds := 60000
    );
  $job$
);

notify pgrst, 'reload schema';
