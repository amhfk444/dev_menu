-- تراجع عن 26-google-reviews.sql
drop table if exists public.owner_push;
drop table if exists public.google_connections;
drop index if exists public.review_drafts_google_name_idx;
drop index if exists public.review_drafts_pending_idx;
alter table public.review_drafts drop column if exists source, drop column if exists google_name, drop column if exists status,
  drop column if exists reviewed_at, drop column if exists posted_at, drop column if exists error;
notify pgrst, 'reload schema';
