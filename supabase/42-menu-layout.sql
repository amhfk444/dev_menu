-- شكل عرض الأطباق في المنيو: list (الحالي: صورة صغيرة جنب الاسم) أو photos (صورة كبيرة تغطي البطاقة)
alter table public.clients add column if not exists menu_layout text not null default 'list';
alter table public.clients drop constraint if exists clients_menu_layout_check;
alter table public.clients add constraint clients_menu_layout_check check (menu_layout in ('list', 'photos'));
notify pgrst, 'reload schema';
