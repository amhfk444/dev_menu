-- المتصفح ما يكلم جداول قاعدة البيانات مباشرة: كل القراءة والكتابة من الخادم بمفتاح الخدمة (api/*)
-- بعض الجداول الجديدة أخذت صلاحيات كاملة لـ anon و authenticated تلقائياً (منها TRUNCATE اللي ما يوقفه RLS).
-- نشيلها من كل الجداول، ونمنعها عن الجداول اللي تنضاف بعدين.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke all on table public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
