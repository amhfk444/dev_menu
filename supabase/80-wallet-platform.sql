-- نوع المحفظة لكل بطاقة (apple / google) من جوال الزبون وقت الإضافة.
-- رد شركة المحفظة يحسب أجهزة الآيفون بس، فبطاقة Google Wallet كانت تطلع "انحذفت" وهي موجودة
alter table pager_cards add column if not exists platform text;
alter table loyalty_cards add column if not exists wallet_platform text;
