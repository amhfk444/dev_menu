-- بطاقات Apple Wallet من سيرفرنا (بدل WalletWallet للآيفون):
-- apple_passes: محتوى كل بطاقة (نفس شكل اللي كنا نرسله لـ WalletWallet) ووقت آخر تغيير
-- apple_pass_devices: الأجهزة اللي أضافت البطاقة ورمز الإشعار حقها (آبل تسجلها بنفسها)
create table if not exists apple_passes (
  serial text primary key,
  auth_token text not null,
  body jsonb not null,
  voided boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists apple_pass_devices (
  device_id text not null,
  serial text not null references apple_passes(serial) on delete cascade,
  push_token text not null,
  created_at timestamptz not null default now(),
  primary key (device_id, serial)
);
create index if not exists apple_pass_devices_serial on apple_pass_devices(serial);

alter table apple_passes enable row level security;
alter table apple_pass_devices enable row level security;
