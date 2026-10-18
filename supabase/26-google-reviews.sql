-- =====================================================================
-- DEV MENU — الرد التلقائي على تقييمات قوقل ماب (يحتاج 25-ai-reviews.sql قبله)
--
--   google_connections  ربط حساب قوقل للمتجر: المفتاح (refresh token) مشفّر + الفرع المختار في قوقل ماب
--   review_drafts       صار فيه التعليقات اللي تجي تلقائياً من قوقل، وحالة كل رد (بانتظار الموافقة / انتشر / تجاهل)
--   owner_push          أجهزة صاحب المطعم المفعّل عليها الإشعارات (تعليق جديد ورده جاهز)
--
-- كل الجداول مقفولة (RLS بدون سياسات): القراءة والكتابة عبر الخادم فقط.
-- شغّل الملف كامل مرة وحدة في Supabase → SQL Editor. آمن لإعادة التشغيل.
-- =====================================================================
begin;

create table if not exists public.google_connections (
  client_id         bigint primary key references public.clients(id) on delete cascade,
  google_email      text,
  refresh_token_enc text not null,
  account_name      text,          -- accounts/123
  location_name     text,          -- locations/456
  location_title    text,
  connected_at      timestamptz not null default now(),
  last_sync_at      timestamptz,
  sync_error        text
);
alter table public.google_connections enable row level security;

alter table public.review_drafts
  add column if not exists source       text not null default 'manual' check (source in ('manual', 'google')),
  add column if not exists google_name  text,           -- accounts/x/locations/y/reviews/z
  add column if not exists status       text not null default 'draft' check (status in ('draft', 'pending', 'posted', 'dismissed', 'failed')),
  add column if not exists reviewed_at  timestamptz,    -- وقت كتابة التعليق في قوقل
  add column if not exists posted_at    timestamptz,
  add column if not exists error        text;
create unique index if not exists review_drafts_google_name_idx on public.review_drafts (client_id, google_name) where google_name is not null;
create index if not exists review_drafts_pending_idx on public.review_drafts (client_id, status) where status = 'pending';

create table if not exists public.owner_push (
  id          bigserial primary key,
  client_id   bigint not null references public.clients(id) on delete cascade,
  endpoint    text not null unique,
  sub         jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists owner_push_client_idx on public.owner_push (client_id);
alter table public.owner_push enable row level security;

commit;
notify pgrst, 'reload schema';
