-- =====================================================================
-- DEV MENU — تشغيل مزامنة تعليقات قوقل ماب كل ربع ساعة من داخل Supabase (pg_cron + pg_net)
-- يولّد مفتاح سري ويحفظه في جدول مقفول، والخادم (/api/reviews-sync) يتحقق منه.
-- ما يحتاج أي مُجدول خارجي ولا متغير بيئة. آمن لإعادة التشغيل.
-- يحتاج 26-google-reviews.sql قبله.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);
alter table public.app_settings enable row level security;

insert into public.app_settings (key, value)
values ('cron_key', md5(random()::text || clock_timestamp()::text) || md5(random()::text || clock_timestamp()::text))
on conflict (key) do nothing;

-- نحذف الجدولة القديمة (لو موجودة) ونعيدها
do $$ begin
  perform cron.unschedule('devmenu-reviews-sync');
exception when others then null;
end $$;

select cron.schedule(
  'devmenu-reviews-sync',
  '*/15 * * * *',
  $job$
    select net.http_get(
      url := 'https://www.devmenu.digital/api/reviews-sync?key=' || (select value from public.app_settings where key = 'cron_key'),
      timeout_milliseconds := 60000
    );
  $job$
);

notify pgrst, 'reload schema';
