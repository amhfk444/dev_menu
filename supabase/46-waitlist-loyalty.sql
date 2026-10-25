-- ربط قائمة الانتظار ببطاقة الولاء: لما يجي دوره يوصله إشعار من المحفظة
alter table public.waitlist_entries add column if not exists loyalty_card_id bigint references public.loyalty_cards(id) on delete set null;
notify pgrst, 'reload schema';
