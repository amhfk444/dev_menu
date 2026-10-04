-- تراجع عن 23-currency.sql
-- العمود داخل public_clients: احذفه من الـ view أولاً (أعد إنشاءه بدون currency)، ثم:
alter table public.clients drop constraint if exists clients_currency_check;
alter table public.clients drop column if exists currency;
notify pgrst, 'reload schema';
