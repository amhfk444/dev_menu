-- =====================================================================
-- DEV MENU — طلب "فرع جديد" من لوحة صاحب المحل (زر "اطلب فرع جديد" في بطاقة الفروع)
-- =====================================================================
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.support_requests'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%';
  if c is not null then execute format('alter table public.support_requests drop constraint %I', c); end if;
end $$;
alter table public.support_requests add constraint support_requests_kind_check
  check (kind in ('renew', 'plan', 'addon', 'branch', 'suspended', 'contact'));
notify pgrst, 'reload schema';
