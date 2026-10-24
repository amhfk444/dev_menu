-- نقل رصيد من بطاقة ولاء قديمة (منصة ثانية أو ورق): الكاشير يشوف الرصيد ويضيفه مرة وحدة لكل عضو
alter table public.loyalty_cards add column if not exists transferred int;
alter table public.loyalty_cards add column if not exists transferred_at timestamptz;
notify pgrst, 'reload schema';
