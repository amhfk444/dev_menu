-- =====================================================================
-- DEV MENU — بطاقة الولاء وحدة للمحل بكل فروعه
-- من الحين كل بيانات الولاء تنحفظ على المحل الرئيسي (الأعضاء، الأختام، الرسائل، الهدايا...)،
-- والإعدادات من المحل الرئيسي، وموقع الختم (النطاق) لكل فرع لحاله.
-- هذا الملف ينقل بيانات الولاء اللي انحفظت على الفروع قبل كذا إلى المحل الرئيسي:
--   • نفس الجوال مسجل في الفرع والرئيسي: البطاقتين تندمج (الأختام والزيارات والمكافآت تنجمع) وتبقى بطاقة الرئيسي
--   • الباقي ينتقل للرئيسي كما هو، ولو رقم العضوية مكرر ياخذ رقم جديد
-- آمن لإعادة التشغيل (ما يسوي شي لو ما فيه بيانات على الفروع)
-- =====================================================================
begin;

-- ─── 1) دمج البطاقات المكررة (نفس الجوال في الفرع والرئيسي) ───
create temporary table loyalty_merge on commit drop as
select b.id as from_id, m.id as to_id
from public.loyalty_cards b
join public.clients c on c.id = b.client_id and c.parent_id is not null
join public.loyalty_cards m on m.client_id = c.parent_id and m.phone = b.phone
where b.phone is not null;

update public.loyalty_cards m set
  stamps = m.stamps + b.stamps,
  visits = m.visits + b.visits,
  rewards = m.rewards + b.rewards,
  last_stamp_at = greatest(m.last_stamp_at, b.last_stamp_at),
  name = coalesce(m.name, b.name),
  gender = coalesce(m.gender, b.gender)
from public.loyalty_cards b, loyalty_merge x
where x.to_id = m.id and x.from_id = b.id;

update public.loyalty_events e set card_id = x.to_id from loyalty_merge x where e.card_id = x.from_id;
update public.loyalty_messages e set card_id = x.to_id from loyalty_merge x where e.card_id = x.from_id;
update public.loyalty_feedback e set card_id = x.to_id from loyalty_merge x where e.card_id = x.from_id;
update public.loyalty_stamp_codes e set card_id = x.to_id from loyalty_merge x where e.card_id = x.from_id;
update public.loyalty_gifts e set from_card = x.to_id from loyalty_merge x where e.from_card = x.from_id;
update public.loyalty_gifts e set to_card = x.to_id from loyalty_merge x where e.to_card = x.from_id;
update public.pager_tickets e set loyalty_card_id = x.to_id from loyalty_merge x where e.loyalty_card_id = x.from_id;
update public.waitlist_entries e set loyalty_card_id = x.to_id from loyalty_merge x where e.loyalty_card_id = x.from_id;
delete from public.loyalty_cards b using loyalty_merge x where b.id = x.from_id;

-- ─── 2) باقي بطاقات الفروع تنتقل للرئيسي (رقم العضوية المكرر ياخذ رقم جديد) ───
update public.loyalty_cards b set member_no = public.loyalty_random_member_no(c.parent_id)
from public.clients c
where c.id = b.client_id and c.parent_id is not null
  and exists (select 1 from public.loyalty_cards m where m.client_id = c.parent_id and m.member_no = b.member_no);

update public.loyalty_cards b set client_id = c.parent_id
from public.clients c where c.id = b.client_id and c.parent_id is not null;

-- ─── 3) باقي جداول الولاء ───
update public.loyalty_events t set client_id = c.parent_id from public.clients c where c.id = t.client_id and c.parent_id is not null;
update public.loyalty_messages t set client_id = c.parent_id from public.clients c where c.id = t.client_id and c.parent_id is not null;
update public.loyalty_feedback t set client_id = c.parent_id from public.clients c where c.id = t.client_id and c.parent_id is not null;
update public.loyalty_gifts t set client_id = c.parent_id from public.clients c where c.id = t.client_id and c.parent_id is not null;
update public.loyalty_stamp_codes t set client_id = c.parent_id from public.clients c where c.id = t.client_id and c.parent_id is not null;

commit;
