-- بطاقة النداء في Google Wallet: قوقل تسمح بـ 3 إشعارات بس لكل بطاقة كل 24 ساعة.
-- نحفظ نوع المحفظة عشان بطاقات قوقل ياخذون إشعار "جاهز" بس، والباقي يوصلهم من إشعارات المتصفح (بدون حد)
alter table pager_cards add column if not exists platform text;
