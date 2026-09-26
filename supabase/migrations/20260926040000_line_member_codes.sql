-- สมาชิกผ่าน LINE, stricter: a phone is only trusted for a LINE account after proof that can't be had from the
-- phone number alone - scanning the QR on a stringing receipt ('link'), or showing the shop a code that only the
-- customer's own LINE member page displays ('code', entered by staff). Signing up with just a number ('new') and
-- the receipt job number ('job' - it was visible to anyone who typed the phone into the chat) no longer verify.
alter table public.line_members add column if not exists verify_code text check (verify_code is null or verify_code ~ '^\d{6}$');
alter table public.line_members add column if not exists code_created text;
alter table public.line_members drop constraint if exists line_members_method_check;
alter table public.line_members add constraint line_members_method_check check (method in ('','new','job','link','staff','code'));
create index if not exists line_members_code on public.line_members (verify_code) where status = 'pending';

-- Memberships verified the old ways go back to waiting: first stop their jobs notifying that LINE account (a
-- receipt-QR link is recorded as method 'link', so it is never one of these), then reset them.
update public.jobs j set line_user = null
  from public.line_members l
  where l.status = 'verified' and l.method in ('new','job')
    and j.line_user = l.line_user and regexp_replace(j.phone,'\D','','g') = l.phone;
update public.line_members set status = 'pending', method = '', verified_at = null, verified_by = null
  where status = 'verified' and method in ('new','job');
