-- أنواع منشآت أكثر (للي يشترك في البيجر أو الانتظار أو الولاء بدون منيو) + اسم النشاط لما يختار "أخرى"
alter table public.clients drop constraint if exists clients_business_type_check;
alter table public.clients add constraint clients_business_type_check check (business_type = any (array[
  'restaurant','cafe','mixed','bakery','clinic','salon','carwash','laundry','retail','pharmacy','services','other']));
alter table public.clients add column if not exists business_label text;
notify pgrst, 'reload schema';
