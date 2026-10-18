-- تراجع عن 25-ai-reviews.sql (يحذف سجل الردود نهائياً)
drop table if exists public.review_drafts;
alter table public.clients drop column if exists reviews_enabled;
notify pgrst, 'reload schema';
