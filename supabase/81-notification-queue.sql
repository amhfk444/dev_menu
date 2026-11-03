-- =====================================================================
-- DEV MENU — طابور إشعارات بطاقات المحفظة
--   رسائل المحل و"وحشتنا" تنحفظ هنا بدل ما تنرسل كلها مرة وحدة، و api/notify-cron يرسلها كل دقيقة:
--   بالأولوية، ويحترم حد Google Wallet (3 إشعارات للبطاقة كل 24 ساعة، واحد منها محجوز لـ "طلبك جاهز")،
--   ويعيد المحاولة لو فشل الإرسال، ويسجل وش صار لكل رسالة
-- =====================================================================
create table if not exists public.notification_queue (
  id bigserial primary key,
  kind text not null,                       -- pager_msg | winback
  client_id bigint not null,                -- المحل الرئيسي
  ref_id bigint,                            -- pager_messages.id (رسالة المحل)
  card_id bigint,                           -- pager_cards.id
  serial text not null,
  platform text,                            -- apple | google (من pager_cards)
  body text not null,
  lang text,
  priority smallint not null default 5,     -- الأصغر أول
  status text not null default 'pending',   -- pending | sent | gone | failed
  attempts smallint not null default 0,
  run_at timestamptz not null default now(),
  result text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notification_queue_due on public.notification_queue (status, run_at, priority, id) where status = 'pending';
create index if not exists notification_queue_serial on public.notification_queue (serial, sent_at);
create index if not exists notification_queue_ref on public.notification_queue (ref_id, status);
alter table public.notification_queue enable row level security;
revoke all on table public.notification_queue from anon, authenticated;

-- كم بطاقة انضافت للطابور لكل رسالة (عشان صاحب المحل يشوف "وصلت لـ X من Y")
alter table public.pager_messages add column if not exists queued integer not null default 0;

-- عنوان الموقع اللي يشغّل الطابور (التجربة تحط رابطها هنا)
insert into public.app_settings (key, value) values ('api_base', 'https://www.devmenu.digital') on conflict (key) do nothing;

-- كل دقيقة: نرسل الرسائل الجاهزة
select cron.unschedule('devmenu-notify') where exists (select 1 from cron.job where jobname = 'devmenu-notify');
select cron.schedule('devmenu-notify', '* * * * *', $job$
  select net.http_get(
    url := (select value from public.app_settings where key = 'api_base') || '/api/notify-cron?key=' || (select value from public.app_settings where key = 'cron_key'),
    timeout_milliseconds := 60000
  ) where exists (select 1 from public.notification_queue where status = 'pending' and run_at <= now());
$job$);

notify pgrst, 'reload schema';
