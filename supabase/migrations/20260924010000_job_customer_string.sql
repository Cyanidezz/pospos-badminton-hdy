-- Optional: when a customer brings their own string for a "บริการขึ้นเอ็น" (stringing-labor-only) job, staff can
-- note down what string it is, purely for reference - it isn't sold, so there's no product row for it.
alter table public.jobs add column if not exists customer_string text;
