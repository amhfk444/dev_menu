-- الأسئلة الشائعة لمساعد المنيو: أكثر أسئلة زبائن كل محل وأجوبتها
-- الجواب المحفوظ يرجع ببلاش طالما المنيو ما تغيّر (version = بصمة المنيو)، وأكثرها تكراراً تطلع كأزرار
create table if not exists public.menu_chat_faq (
  client_id bigint not null references public.clients(id) on delete cascade,
  qkey text not null,
  question text not null,
  answer text,
  version text,
  hits int not null default 0,
  ok boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (client_id, qkey)
);
create index if not exists menu_chat_faq_top on public.menu_chat_faq (client_id, hits desc);
alter table public.menu_chat_faq enable row level security;
revoke all on public.menu_chat_faq from anon, authenticated;

-- يزيد عدّاد السؤال ويرجّع جوابه المحفوظ (لو فيه)
create or replace function public.server_faq_get(p_client bigint, p_qkey text, p_question text)
returns table (answer text, version text) language sql security definer set search_path = public as $$
  insert into menu_chat_faq (client_id, qkey, question, hits) values (p_client, p_qkey, left(p_question, 120), 1)
  on conflict (client_id, qkey) do update set hits = menu_chat_faq.hits + 1
  returning menu_chat_faq.answer, menu_chat_faq.version;
$$;
-- يحفظ جواب السؤال مع بصمة المنيو، وok = يصلح يطلع كزر
create or replace function public.server_faq_set(p_client bigint, p_qkey text, p_answer text, p_version text, p_ok boolean)
returns void language sql security definer set search_path = public as $$
  update menu_chat_faq set answer = p_answer, version = p_version, ok = p_ok, updated_at = now() where client_id = p_client and qkey = p_qkey;
$$;
revoke all on function public.server_faq_get(bigint, text, text), public.server_faq_set(bigint, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.server_faq_get(bigint, text, text), public.server_faq_set(bigint, text, text, text, boolean) to service_role;

notify pgrst, 'reload schema';
