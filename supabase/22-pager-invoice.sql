-- =====================================================================
-- DEV MENU — ربط رقم البيجر برقم الفاتورة (يدخله الكاشير)
-- =====================================================================
alter table public.pager_tickets add column if not exists invoice_no text;
create index if not exists pager_tickets_invoice_idx on public.pager_tickets (client_id, invoice_no);
notify pgrst, 'reload schema';
