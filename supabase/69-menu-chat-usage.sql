-- رصيد المساعد الذكي: عدد أسئلة كل محل بالشهر، وأسئلة كل جوال باليوم (الجوال = بصمة مشفّرة، ما نحفظ رقم ولا IP)
create table if not exists public.menu_chat_usage (
  client_id bigint not null references public.clients(id) on delete cascade,
  month text not null,
  used int not null default 0,
  primary key (client_id, month)
);
create table if not exists public.menu_chat_devices (
  client_id bigint not null references public.clients(id) on delete cascade,
  device text not null,
  day date not null,
  used int not null default 0,
  primary key (client_id, device, day)
);
alter table public.menu_chat_usage enable row level security;
alter table public.menu_chat_devices enable row level security;
revoke all on public.menu_chat_usage, public.menu_chat_devices from anon, authenticated;

-- ياخذ سؤال من الرصيد: 'ok' أو 'month' (خلص رصيد الشهر) أو 'day' (الجوال وصل حد اليوم)
create or replace function public.server_chat_take(p_client bigint, p_device text, p_limit int, p_day int)
returns text language plpgsql security definer set search_path = public as $$
declare
  m text := to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM');
  d date := (now() at time zone 'Asia/Riyadh')::date;
  mu int; du int;
begin
  insert into menu_chat_usage (client_id, month) values (p_client, m) on conflict do nothing;
  select used into mu from menu_chat_usage where client_id = p_client and month = m for update;
  if mu >= p_limit then return 'month'; end if;
  insert into menu_chat_devices (client_id, device, day) values (p_client, p_device, d) on conflict do nothing;
  select used into du from menu_chat_devices where client_id = p_client and device = p_device and day = d for update;
  if du >= p_day then return 'day'; end if;
  update menu_chat_usage set used = used + 1 where client_id = p_client and month = m;
  update menu_chat_devices set used = used + 1 where client_id = p_client and device = p_device and day = d;
  -- تنظيف: بصمات الجوالات ما نحتاجها بعد يومين
  if random() < 0.02 then delete from menu_chat_devices where day < d - 2; end if;
  return 'ok';
end $$;
revoke all on function public.server_chat_take(bigint, text, int, int) from public, anon, authenticated;
grant execute on function public.server_chat_take(bigint, text, int, int) to service_role;

notify pgrst, 'reload schema';
