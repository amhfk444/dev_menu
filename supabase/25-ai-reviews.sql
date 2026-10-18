-- =====================================================================
-- DEV MENU — ردود تقييمات قوقل ماب بالذكاء الاصطناعي (إضافة مدفوعة)
--
--   clients.reviews_enabled  يفعّلها المدير العام لكل متجر مشترك في الإضافة
--   review_drafts            التعليقات والردود اللي كتبها الذكاء الاصطناعي (سجل + حد يومي)
--
-- الجدول مقفول (RLS بدون سياسات): القراءة والكتابة عبر الخادم فقط.
-- شغّل الملف كامل مرة وحدة في Supabase → SQL Editor. آمن لإعادة التشغيل.
-- =====================================================================
begin;

alter table public.clients add column if not exists reviews_enabled boolean not null default false;

create table if not exists public.review_drafts (
  id          bigserial primary key,
  client_id   bigint not null references public.clients(id) on delete cascade,
  reviewer    text,
  rating      int not null check (rating between 1 and 5),
  review      text not null,
  note        text,
  tone        text not null default 'friendly',
  reply       text not null,
  created_at  timestamptz not null default now()
);
create index if not exists review_drafts_client_idx on public.review_drafts (client_id, created_at desc);
alter table public.review_drafts enable row level security;

commit;
notify pgrst, 'reload schema';
