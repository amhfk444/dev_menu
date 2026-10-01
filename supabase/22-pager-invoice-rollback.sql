drop index if exists public.pager_tickets_invoice_idx;
alter table public.pager_tickets drop column if exists invoice_no;
notify pgrst, 'reload schema';
