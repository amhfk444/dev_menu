-- صفحة الروابط السريعة: خلفية خاصة فيها وترتيب أقسامها
-- خلفية خاصة لصفحة الروابط السريعة (صورة أو فيديو). لو فاضية تاخذ خلفية المنيو
alter table public.clients add column if not exists links_bg_image_url text;
alter table public.clients add column if not exists links_bg_video_url text;
-- ترتيب أقسام صفحة الروابط (services, contact, delivery, social, custom, location). فاضي = الترتيب الافتراضي
alter table public.clients add column if not exists links_order text[];
notify pgrst, 'reload schema';

-- إضافة الأعمدة إلى public_clients (المنيو العام يقرأ منها)
do $$
declare
  def      text;
  m        text[];
  src      text;
  pos      int;
  extra    text := '';
  opts     text[];
  col      text;
begin
  def := rtrim(btrim(pg_get_viewdef('public.public_clients'::regclass, true)), ';');
  select reloptions into opts from pg_class where oid = 'public.public_clients'::regclass;

  -- الاسم اللي يُشار به لجدول clients داخل الـ view (clients أو اسم مستعار مثل c)
  m := regexp_match(def, '\sFROM\s+(?:public\.)?clients(?:\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*))?', 'i');
  if m is null then
    raise exception 'تعريف public_clients غير متوقع (لازم يقرأ من clients). عدّله يدوياً. التعريف الحالي: %', def;
  end if;
  src := coalesce(m[1], 'clients');
  if upper(src) in ('WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'FULL', 'CROSS', 'ORDER', 'GROUP', 'LIMIT', 'WINDOW', 'UNION', 'HAVING', 'OFFSET') then
    src := 'clients';
  end if;

  foreach col in array array['links_bg_image_url', 'links_bg_video_url', 'links_order'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'public_clients' and column_name = col
    ) then
      extra := extra || format(', %I.%I', src, col);
    end if;
  end loop;

  if extra = '' then
    raise notice 'public_clients فيه أعمدة خلفية صفحة الروابط مسبقاً، ما تغيّر شي';
    return;
  end if;

  -- أول FROM clients هو نهاية قائمة الأعمدة
  pos := regexp_instr(def, '\sFROM\s+(public\.)?clients\M', 1, 1, 0, 'i');
  def := substr(def, 1, pos - 1) || extra || substr(def, pos);

  execute 'create or replace view public.public_clients as ' || def;
  -- نرجّع خيارات الـ view (مثل security_invoker) لو كانت موجودة
  if opts is not null then
    execute format('alter view public.public_clients set (%s)', array_to_string(opts, ', '));
  end if;

  raise notice 'التعريف الجديد لـ public_clients: %', def;
end
$$;

revoke all on public.public_clients from anon, authenticated;
grant select on public.public_clients to service_role;


notify pgrst, 'reload schema';
