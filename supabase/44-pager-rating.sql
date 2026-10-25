-- تقييم الزبون بعد استلام طلبه من البيجر + رابط تقييم قوقل للمحل
alter table public.pager_tickets add column if not exists rating smallint;
alter table public.pager_tickets add column if not exists rating_note text;
alter table public.pager_tickets add column if not exists rated_at timestamptz;
alter table public.pager_tickets drop constraint if exists pager_tickets_rating_check;
alter table public.pager_tickets add constraint pager_tickets_rating_check check (rating is null or rating between 1 and 5);
alter table public.clients add column if not exists google_review_url text;
notify pgrst, 'reload schema';
