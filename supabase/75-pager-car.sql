-- =====================================================================
-- DEV MENU — تسليم الطلب للسيارة: الزبون يكتب سيارته، والموظف يشوفها جنب رقمه
--   clients.pager_car: صاحب المحل يشغّله (للمحلات اللي عندها شباك سيارات)
--   pager_tickets.car: {color, model, plate}
-- =====================================================================
alter table public.clients add column if not exists pager_car boolean not null default false;
alter table public.pager_tickets add column if not exists car jsonb;
notify pgrst, 'reload schema';
