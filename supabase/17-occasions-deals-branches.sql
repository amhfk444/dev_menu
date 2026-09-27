-- =====================================================================
-- DEV MENU — زينة المناسبات + الخصم الظاهر في المنيو + الفروع
--
--   clients.occasions      jsonb   مناسبات المتجر وزينتها (حد أقصى 20)
--   coupons.auto_apply     boolean خصم تلقائي بدون كود يظهر على الأصناف في المنيو
--   coupons.show_in_menu   boolean كوبون بكود يظهر كشريط وشارة في المنيو
--   clients.parent_id      bigint  الفرع مربوط بالمتجر الرئيسي
--   server_create_branch() ينشئ فرع بنسخة من المنيو (الأقسام والأطباق)
--
-- شغّل الملف كامل في Supabase → SQL Editor. آمن لإعادة التشغيل.
-- =====================================================================

begin;

-- ─── 1) المناسبات ───
alter table public.clients add column if not exists occasions jsonb not null default '[]'::jsonb;
alter table public.clients drop constraint if exists clients_occasions_check;
alter table public.clients add  constraint clients_occasions_check
  check (jsonb_typeof(occasions) = 'array' and jsonb_array_length(occasions) <= 20);

-- ─── 2) الخصم الظاهر في المنيو ───
alter table public.coupons add column if not exists auto_apply   boolean not null default false;
alter table public.coupons add column if not exists show_in_menu boolean not null default false;

-- ─── 3) الفروع ───
alter table public.clients add column if not exists parent_id bigint references public.clients(id);
create index if not exists clients_parent_idx on public.clients (parent_id);

-- أعمدة جدول للنسخ: كل الأعمدة كما هي، ما عدا المعرّف التلقائي،
-- والأعمدة الفريدة (غير المستبدلة) تصير null حتى ما يتكرر شي
create or replace function public._dm_copy_cols(p_table regclass, p_over jsonb, out cols text, out vals text)
language plpgsql
set search_path = public
as $$
declare r record; uniq boolean;
begin
  cols := ''; vals := '';
  for r in
    select a.attnum, a.attname, a.attnotnull, a.attidentity, a.attgenerated, pg_get_expr(d.adbin, d.adrelid) as def
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = p_table and a.attnum > 0 and not a.attisdropped
    order by a.attnum
  loop
    if r.attgenerated <> '' then continue; end if;
    if p_over ? r.attname then
      cols := cols || quote_ident(r.attname) || ','; vals := vals || (p_over ->> r.attname) || ',';
      continue;
    end if;
    -- المعرّف (identity أو serial) ياخذ قيمته التلقائية
    if r.attidentity <> '' or coalesce(r.def, '') like 'nextval(%' then continue; end if;
    select exists (select 1 from pg_index i where i.indrelid = p_table and i.indisunique and i.indnkeyatts = 1 and i.indkey[0] = r.attnum) into uniq;
    cols := cols || quote_ident(r.attname) || ',';
    vals := vals || case when uniq and not r.attnotnull then 'null' else quote_ident(r.attname) end || ',';
  end loop;
  cols := rtrim(cols, ','); vals := rtrim(vals, ',');
end
$$;

-- ينشئ فرع: نسخة من المتجر (الهوية والإعدادات والاشتراك) + الأقسام + الأطباق
create or replace function public.server_create_branch(p_parent_id bigint, p_name text, p_slug text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare c record; new_id bigint; sfx text; over jsonb;
  has_col text[] := array(select column_name::text from information_schema.columns where table_schema = 'public' and table_name = 'clients');
begin
  if not exists (select 1 from clients where id = p_parent_id and parent_id is null) then
    raise exception 'PARENT_NOT_FOUND';
  end if;

  -- المتجر: بدون بريد (صاحب المتجر الرئيسي يديره)، رابط جديد، ومربوط بالرئيسي
  over := jsonb_build_object('name', quote_literal(p_name), 'client_slug', quote_literal(p_slug), 'parent_id', p_parent_id::text);
  if 'email' = any(has_col)              then over := over || '{"email": "null"}'; end if;
  if 'old_slugs' = any(has_col)          then over := over || jsonb_build_object('old_slugs', quote_literal('{}')); end if;
  if 'is_featured' = any(has_col)        then over := over || '{"is_featured": "false"}'; end if;
  if 'admin_notification' = any(has_col) then over := over || '{"admin_notification": "null"}'; end if;
  if 'created_at' = any(has_col)         then over := over || '{"created_at": "now()"}'; end if;
  select * into c from _dm_copy_cols('public.clients', over);
  execute format('insert into public.clients (%s) select %s from public.clients where id = $1 returning id', c.cols, c.vals)
    using p_parent_id into new_id;

  -- الأقسام: مفتاح جديد لكل قسم (حتى لو المفاتيح فريدة على مستوى الجدول)
  sfx := '-b' || new_id;
  select * into c from _dm_copy_cols('public.categories',
    jsonb_build_object('client_id', new_id::text, 'key', format('key || %L', sfx)));
  execute format('insert into public.categories (%s) select %s from public.categories where client_id = $1', c.cols, c.vals)
    using p_parent_id;

  -- الأطباق: نربطها بمفاتيح الأقسام الجديدة (والمربوطة باسم القسم تبقى كما هي)
  select * into c from _dm_copy_cols('public.products', jsonb_build_object('client_id', new_id::text,
    'category', format('case when category in (select key from public.categories where client_id = %s) then category || %L else category end', p_parent_id, sfx)));
  execute format('insert into public.products (%s) select %s from public.products where client_id = $1', c.cols, c.vals)
    using p_parent_id;

  return new_id;
end
$$;
revoke all on function public._dm_copy_cols(regclass, jsonb) from public, anon, authenticated;
revoke all on function public.server_create_branch(bigint, text, text) from public, anon, authenticated;
grant execute on function public.server_create_branch(bigint, text, text) to service_role;

commit;

-- ─── تحقق: لازم يطلع 1 و 2 و 1 و 1 ───
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'clients' and column_name = 'occasions') as occasions_col,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'coupons' and column_name in ('auto_apply', 'show_in_menu')) as coupon_cols,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'clients' and column_name = 'parent_id') as parent_col,
  (select count(*) from pg_proc where proname = 'server_create_branch') as branch_fn;
