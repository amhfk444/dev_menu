-- رقم البيجر في محفظة الجوال: تنبيه من النظام حتى لو العميل يشوف فيديو أو مسكّر المتصفح
alter table public.pager_tickets add column if not exists wallet_serial text;
alter table public.pager_tickets add column if not exists wallet_url text;
notify pgrst, 'reload schema';
