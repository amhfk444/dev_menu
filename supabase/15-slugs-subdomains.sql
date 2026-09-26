-- =====================================================================
-- DEV MENU — روابط المتاجر المختصرة (duja.devmenu.digital)
--
--   old_slugs  text[]  الروابط القديمة للمتجر بعد تغيير رابطه.
--                      المنيو يفتح منها (عشان رموز QR المطبوعة تبقى شغالة)،
--                      وما يقدر متجر ثاني ياخذها.
--
-- شغّل الملف كامل مرة وحدة في Supabase → SQL Editor. آمن لإعادة التشغيل.
-- =====================================================================

begin;

alter table public.clients add column if not exists old_slugs text[] not null default '{}';

alter table public.clients drop constraint if exists clients_old_slugs_check;
alter table public.clients add  constraint clients_old_slugs_check
  check (cardinality(old_slugs) <= 20);

-- البحث عن متجر برابطه القديم
create index if not exists clients_old_slugs_idx on public.clients using gin (old_slugs);

-- إضافة old_slugs إلى public_clients بدون حذف أي عمود موجود (نفس طريقة ملف 14)
do $$
declare
  def text; m text[]; src text; pos int; opts text[];
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'public_clients' and column_name = 'old_slugs') then
    raise notice 'public_clients فيه old_slugs مسبقاً، ما تغيّر شي';
    return;
  end if;

  def := rtrim(btrim(pg_get_viewdef('public.public_clients'::regclass, true)), ';');
  select reloptions into opts from pg_class where oid = 'public.public_clients'::regclass;

  m := regexp_match(def, '\sFROM\s+(?:public\.)?clients(?:\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*))?', 'i');
  if m is null then
    raise exception 'تعريف public_clients غير متوقع (لازم يقرأ من clients). التعريف الحالي: %', def;
  end if;
  src := coalesce(m[1], 'clients');
  if upper(src) in ('WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'FULL', 'CROSS', 'ORDER', 'GROUP', 'LIMIT', 'WINDOW', 'UNION', 'HAVING', 'OFFSET') then
    src := 'clients';
  end if;

  pos := regexp_instr(def, '\sFROM\s+(public\.)?clients\M', 1, 1, 0, 'i');
  def := substr(def, 1, pos - 1) || format(', %I.old_slugs', src) || substr(def, pos);

  execute 'create or replace view public.public_clients as ' || def;
  if opts is not null then
    execute format('alter view public.public_clients set (%s)', array_to_string(opts, ', '));
  end if;
end
$$;

revoke all on public.public_clients from anon, authenticated;
grant select on public.public_clients to service_role;

commit;

-- ─── تحقق: لازم يطلع 1 و 1 ───
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'old_slugs') as clients_col,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'public_clients' and column_name = 'old_slugs') as view_col;
