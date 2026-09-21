-- Shop contact details (shown to customers on the tracking page) and the bank account /
-- transfer QR (shown to staff when a customer pays by transfer). Editable in "ตั้งค่าร้าน".
alter table public.config
  add column if not exists contact_phone text not null default '',
  add column if not exists contact_facebook text not null default '',
  add column if not exists opening_hours text not null default '',
  add column if not exists bank_name text not null default '',
  add column if not exists bank_account_name text not null default '',
  add column if not exists bank_account_no text not null default '',
  add column if not exists bank_qr text;

-- Keep showing what the tracking page has shown until now, so nothing has to be re-typed.
update public.config
set contact_phone = '080-539-0444',
    contact_facebook = 'https://www.facebook.com/profile.php?id=61583314268963',
    opening_hours = '{"0":null,"1":["15:00","23:00"],"2":["15:00","23:00"],"3":["15:00","23:00"],"4":["15:00","23:00"],"5":["15:00","23:00"],"6":["13:00","21:00"]}'
where id = 1 and contact_phone = '' and contact_facebook = '' and opening_hours = '';
