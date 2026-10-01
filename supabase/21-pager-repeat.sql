-- =====================================================================
-- DEV MENU — تكرار إشعار البيجر لين يستلم العميل
-- ring_count: كم مرة انرسل الإشعار · last_ring_at: آخر إرسال · acked_at: العميل شاف التنبيه
-- شاشة الكاشير تطلب إعادة الإرسال كل 30 ثانية، بحد أقصى 5 مرات
-- =====================================================================
alter table public.pager_tickets
  add column if not exists ring_count   int not null default 0,
  add column if not exists last_ring_at timestamptz,
  add column if not exists acked_at     timestamptz;
notify pgrst, 'reload schema';
