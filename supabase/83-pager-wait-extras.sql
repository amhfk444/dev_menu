-- =====================================================================
-- DEV MENU — صفحة انتظار البيجر: «أضف لطلبك» وجايزة اللعبة
--   clients.pager_upsell: صاحب المحل يشغّل اقتراحات «أضف لطلبك» (يحتاج المنيو)
--   clients.pager_game_reward: نص الجايزة لمن يخلّص اللعبة (فاضي = بدون جايزة)
--   clients.pager_game_moves: أقصى عدد حركات عشان يفوز
--   pager_tickets.addons: [{id, name, price, at}] اللي أضافه الزبون وهو ينتظر
--   pager_tickets.game_won: فاز باللعبة (يطلع للموظف جنب رقمه)
-- =====================================================================
alter table public.clients add column if not exists pager_upsell boolean not null default false;
alter table public.clients add column if not exists pager_game_reward text;
alter table public.clients add column if not exists pager_game_moves integer not null default 20;
alter table public.pager_tickets add column if not exists addons jsonb;
alter table public.pager_tickets add column if not exists game_won boolean not null default false;
notify pgrst, 'reload schema';

-- الكاشير يحدد وقت الانتظار لرقم معيّن (بعض الأصناف تتأخر): يطلع للزبون بدل التقدير
alter table public.pager_tickets add column if not exists eta_at timestamptz;
notify pgrst, 'reload schema';
