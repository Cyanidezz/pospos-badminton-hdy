-- Optional pickup date/time the customer expects to collect their racket, set at intake ("รับไม้ลูกค้า"). Stored as
-- plain "YYYY-MM-DDTHH:mm" text, like the other date fields in this app (expense date, promo window) - no timezone
-- conversion, since the shop and its customers are all in one timezone (Asia/Bangkok).
alter table public.jobs add column if not exists pickup_at text;
