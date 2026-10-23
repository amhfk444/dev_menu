-- =====================================================================
-- DEV MENU — المساعد الذكي لبطاقة الولاء
--   clients.loyalty_ai           تشغيل المساعد (يكتب رسائل عفوية للزبائن حسب زياراتهم)
--   clients.loyalty_near_lines   جمل "أنت قريب" تطلع على شاشة قفل الآيفون قرب المحل (تتجدد كل أسبوع)
--   loyalty_cards.ai_last_at     آخر رسالة من المساعد لهالزبون (عشان ما يزعجه)
--   loyalty_messages.source/kind  مين كتب الرسالة (owner / ai) ونوعها (miss / almost / ready / second)
--   pg_cron: كل يوم الساعة 4 العصر بتوقيت الرياض
-- شغّل الملف مرة وحدة في Supabase → SQL Editor. آمن لإعادة التشغيل. يحتاج 27-reviews-cron.sql قبله.
-- =====================================================================
alter table public.clients add column if not exists loyalty_ai boolean not null default false;
alter table public.clients add column if not exists loyalty_near_lines jsonb not null default '[]'::jsonb;
alter table public.clients add column if not exists loyalty_near_at timestamptz;
alter table public.loyalty_cards add column if not exists ai_last_at timestamptz;
alter table public.loyalty_messages add column if not exists source text not null default 'owner';
alter table public.loyalty_messages add column if not exists kind text;

do $$ begin perform cron.unschedule('devmenu-loyalty-ai'); exception when others then null; end $$;
select cron.schedule('devmenu-loyalty-ai', '0 13 * * *', $job$
  select net.http_get(
    url := 'https://www.devmenu.digital/api/loyalty-cron?key=' || (select value from public.app_settings where key = 'cron_key'),
    timeout_milliseconds := 60000
  );
$job$);

notify pgrst, 'reload schema';
