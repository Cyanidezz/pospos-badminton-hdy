-- Members added directly from the "ลูกค้าสมาชิก" page, before their first stringing job or POS bill.
-- Keyed the same way as everywhere else (phone digits), so a later job or sale under the same phone
-- merges into this member instead of creating a second one.
alter table public.config
  add column if not exists manual_members jsonb not null default '{}'::jsonb;
