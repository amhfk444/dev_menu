-- =====================================================================
-- DEV MENU — الختم مع الشراء
--   loyalty_stamp_codes  كود ختم من شاشة الكاشير: لزبون واحد ولمدة 90 ثانية
--   pager_tickets.loyalty_card_id  بطاقة الولاء المربوطة برقم البيجر (ينختم لما يجهز الطلب)
-- طريقة الختم (بالموقع / بعد الشراء بس) في clients.loyalty_settings
-- شغّل الملف مرة وحدة في Supabase → SQL Editor. آمن لإعادة التشغيل.
-- =====================================================================
create table if not exists public.loyalty_stamp_codes (
  id          bigserial primary key,
  client_id   bigint not null references public.clients(id) on delete cascade,
  code        text not null unique,
  card_id     bigint references public.loyalty_cards(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '90 seconds',
  used_at     timestamptz
);
create index if not exists loyalty_stamp_codes_client_idx on public.loyalty_stamp_codes (client_id, created_at desc);
alter table public.loyalty_stamp_codes enable row level security;

alter table public.pager_tickets add column if not exists loyalty_card_id bigint references public.loyalty_cards(id) on delete set null;
alter table public.pager_tickets add column if not exists loyalty_stamped boolean not null default false;

notify pgrst, 'reload schema';
