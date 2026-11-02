-- =====================================================================
-- DEV MENU — "وحشتنا" التلقائية لبطاقة النداء
--   صاحب المحل يكتب رسالة مرة وحدة، وتوصل تلقائياً للي ما أخذ رقم من فترة (يختارها)
--   مرة وحدة لكل غيبة: ما تنعاد لين يرجع الزبون ويغيب من جديد
-- =====================================================================
alter table public.clients add column if not exists pager_winback jsonb not null default '{"enabled": false, "days": 14, "text": ""}'::jsonb;
alter table public.pager_cards add column if not exists winback_at timestamptz;
create index if not exists pager_cards_last_used_idx on public.pager_cards (client_id, last_used_at);
notify pgrst, 'reload schema';
