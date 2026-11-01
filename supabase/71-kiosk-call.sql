-- شاشة الزبون: رقم الطلب الجاهز يطلع كبير ويغطي الشاشة (اختياري، صاحب المحل يفعّله من الإعدادات)
alter table public.clients add column if not exists kiosk_call boolean not null default false;
notify pgrst, 'reload schema';
