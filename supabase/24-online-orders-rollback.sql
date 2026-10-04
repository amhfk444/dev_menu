-- تراجع عن 24-online-orders.sql (يحذف الطلبات وإعدادات الدفع نهائياً)
alter table public.pager_tickets drop column if exists order_id;
drop table if exists public.orders;
drop table if exists public.payment_settings;
notify pgrst, 'reload schema';
