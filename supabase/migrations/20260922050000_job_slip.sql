-- A customer can attach a transfer slip from their public tracking link before staff confirm the payment in
-- person (the shop still reviews it themselves before marking the job paid - this only stores the photo).
alter table public.jobs add column if not exists slip text;
