-- =====================================================================
-- DEV MENU — رابط الكاشير: لكل فرع مفتاح سري يفتح شاشة البيجر وشاشة الختم بس، بدون حساب المالك
-- المالك يطلعه من لوحة التحكم، ويغيّره لو ترك موظف (الرابط القديم يوقف على طول)
-- =====================================================================
alter table public.clients add column if not exists desk_key text;
create unique index if not exists clients_desk_key_idx on public.clients (desk_key) where desk_key is not null;
notify pgrst, 'reload schema';
