-- =====================================================================
-- DEV MENU — فهارس للاستعلامات المتكررة (مراجعة الأداء 2026-10)
-- كل الفهارس "if not exists": تنعاد بأمان، وما تغير أي بيانات.
-- =====================================================================

-- أطباق المحل (المنيو ولوحة التحكم تجيبها بالمحل كل مرة)
create index if not exists products_client_idx on public.products (client_id);

-- سجل العضو ورسائله وردوده (ملف العضو، الدمج، آخر رسالة على البطاقة)
create index if not exists loyalty_events_card_idx on public.loyalty_events (card_id, id desc);
create index if not exists loyalty_messages_card_idx on public.loyalty_messages (card_id, id desc) where card_id is not null;
create index if not exists loyalty_feedback_card_idx on public.loyalty_feedback (card_id, created_at desc);

-- أرقام البيجر والانتظار المربوطة ببطاقة ولاء
create index if not exists pager_tickets_card_idx on public.pager_tickets (loyalty_card_id) where loyalty_card_id is not null;
create index if not exists waitlist_entries_card_idx on public.waitlist_entries (loyalty_card_id) where loyalty_card_id is not null;

-- صاحب المتجر بإيميله (كل طلب للوحة التحكم يبدأ منه)
create index if not exists clients_email_lower_idx on public.clients (lower(email));

analyze public.products, public.loyalty_events, public.loyalty_messages, public.loyalty_feedback,
  public.pager_tickets, public.waitlist_entries, public.clients;
