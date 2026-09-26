-- =====================================================================
-- DEV MENU — الدفعة الثانية: ثيمات المنيو + أرقام الطلبات + الروابط المخصصة
--
--   theme          نص        dark | light | sand | forest   (الافتراضي dark = الشكل الحالي)
--   accent_color   نص        #RRGGBB أو null (بدون لون مخصص)
--   order_numbers  jsonb     [{label, phone}]   حد أقصى 5
--   custom_links   jsonb     [{title, url}]     حد أقصى 30
--
-- شغّل الملف كامل مرة وحدة في Supabase → SQL Editor.
-- آمن لإعادة التشغيل: كل خطوة تتأكد قبل ما تضيف.
--
-- لعرض تعريف public_clients الحالي قبل التشغيل (اختياري):
--   select pg_get_viewdef('public.public_clients'::regclass, true);
-- =====================================================================

begin;

-- ─── 1) الأعمدة الجديدة ───
alter table public.clients add column if not exists theme         text  not null default 'dark';
alter table public.clients add column if not exists accent_color  text;
alter table public.clients add column if not exists order_numbers jsonb not null default '[]'::jsonb;
alter table public.clients add column if not exists custom_links  jsonb not null default '[]'::jsonb;

-- حماية إضافية في قاعدة البيانات (الخادم يتحقق أولاً، وهذي خط دفاع ثاني)
alter table public.clients drop constraint if exists clients_theme_check;
alter table public.clients add  constraint clients_theme_check
  check (theme in ('dark', 'light', 'sand', 'forest'));

alter table public.clients drop constraint if exists clients_accent_color_check;
alter table public.clients add  constraint clients_accent_color_check
  check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.clients drop constraint if exists clients_order_numbers_check;
alter table public.clients add  constraint clients_order_numbers_check
  check (jsonb_typeof(order_numbers) = 'array' and jsonb_array_length(order_numbers) <= 5);

alter table public.clients drop constraint if exists clients_custom_links_check;
alter table public.clients add  constraint clients_custom_links_check
  check (jsonb_typeof(custom_links) = 'array' and jsonb_array_length(custom_links) <= 30);

-- ─── 2) إضافة الأعمدة إلى public_clients بدون حذف أي عمود موجود ───
-- ما نعيد كتابة الـ view يدوياً (حتى ما يضيع شرط "المتاجر السارية فقط" أو أي عمود):
-- نقرأ تعريفه الحالي من قاعدة البيانات نفسها، ونضيف الأعمدة الناقصة في آخر قائمة الأعمدة.
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

  foreach col in array array['theme', 'accent_color', 'order_numbers', 'custom_links'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'public_clients' and column_name = col
    ) then
      extra := extra || format(', %I.%I', src, col);
    end if;
  end loop;

  if extra = '' then
    raise notice 'public_clients فيه الأعمدة الجديدة مسبقاً، ما تغيّر شي';
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

-- ─── 3) الـ view مقفول عن المتصفح، والخادم فقط يقرأه ───
revoke all on public.public_clients from anon, authenticated;
grant select on public.public_clients to service_role;

commit;

-- ─── تحقق (اختياري): لازم تظهر الأعمدة الأربعة ───
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'public_clients' order by ordinal_position;
