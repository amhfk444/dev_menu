-- =====================================================================
-- DEV MENU — رقم العضوية العشوائي (6 خانات، ما يتكرر في نفس المحل)
--   بدل الرقم المتسلسل اللي يكشف عدد الأعضاء ويسهل تخمينه
--   الأعضاء الحاليين ياخذون أرقام عشوائية، والجدد ياخذونها تلقائياً عند التسجيل
-- شغّل الملف مرة وحدة في Supabase → SQL Editor. آمن لإعادة التشغيل.
-- =====================================================================
alter table public.loyalty_cards add column if not exists member_no int;

create or replace function public.loyalty_random_member_no(p_client bigint)
returns int language plpgsql as $$
declare n int;
begin
  loop
    n := 100000 + floor(random() * 900000)::int;
    exit when not exists (select 1 from public.loyalty_cards where client_id = p_client and member_no = n);
  end loop;
  return n;
end $$;

create or replace function public.loyalty_set_member_no()
returns trigger language plpgsql as $$
begin
  if new.member_no is null then new.member_no := public.loyalty_random_member_no(new.client_id); end if;
  return new;
end $$;

drop trigger if exists loyalty_cards_member_no on public.loyalty_cards;
create trigger loyalty_cards_member_no before insert on public.loyalty_cards
  for each row execute function public.loyalty_set_member_no();

-- الأعضاء الحاليين
do $$ declare r record; begin
  for r in select id, client_id from public.loyalty_cards where member_no is null order by id loop
    update public.loyalty_cards set member_no = public.loyalty_random_member_no(r.client_id) where id = r.id;
  end loop;
end $$;

create unique index if not exists loyalty_cards_member_no_idx on public.loyalty_cards (client_id, member_no);
notify pgrst, 'reload schema';
