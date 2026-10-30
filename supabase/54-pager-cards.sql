-- =====================================================================
-- DEV MENU — بطاقة النداء الدائمة: بطاقة وحدة للزبون في كل محل (المحل اللي ما عنده ولاء)
-- كل ما ياخذ رقم جديد تتحدث نفس البطاقة برقمه، ويجيه الإشعار منها لما يجهز. بعد الاستلام ترجع "بالعافية"
-- الجوال يحفظ رمز البطاقة (token) ويرسله مع كل رقم جديد
-- =====================================================================
create table if not exists public.pager_cards (
  id bigserial primary key,
  client_id bigint not null references public.clients(id) on delete cascade,
  token text not null unique,
  wallet_serial text,
  wallet_url text,
  lang text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
create index if not exists pager_cards_client_idx on public.pager_cards (client_id);
alter table public.pager_cards enable row level security;
alter table public.pager_tickets add column if not exists wallet_error text;
notify pgrst, 'reload schema';
