-- البحث برقم بطاقة المحفظة (طابور الإشعارات، وربط بطاقة النداء برقم اليوم) كان يمسح الجدول كامل
create index if not exists pager_tickets_wallet_serial_idx on public.pager_tickets (wallet_serial, created_at desc) where wallet_serial is not null;
create index if not exists pager_cards_wallet_serial_idx on public.pager_cards (wallet_serial) where wallet_serial is not null;
