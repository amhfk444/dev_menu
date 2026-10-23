-- =====================================================================
-- DEV MENU — رسائل بطاقة الولاء
--   صاحب المحل يرسل رسالة لكل الأعضاء (card_id = null) أو لعضو واحد
--   توصل إشعار لمحفظة الجوال (للي حافظين البطاقة)، وتطلع في صفحة البطاقة
--   (شكل البطاقة وألوانها محفوظة في clients.loyalty_settings، ما تحتاج أعمدة)
-- شغّل الملف مرة وحدة في Supabase → SQL Editor. آمن لإعادة التشغيل.
-- =====================================================================
create table if not exists public.loyalty_messages (
  id          bigserial primary key,
  client_id   bigint not null references public.clients(id) on delete cascade,
  card_id     bigint references public.loyalty_cards(id) on delete cascade,
  body        text not null,
  wallet_sent int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists loyalty_messages_client_idx on public.loyalty_messages (client_id, created_at desc);
alter table public.loyalty_messages enable row level security;
notify pgrst, 'reload schema';
