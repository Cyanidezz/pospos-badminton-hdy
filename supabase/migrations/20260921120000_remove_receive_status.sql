-- The "รับไม้" step was removed from the stringing flow; jobs now start at "รอขึ้นเอ็น".
-- The app already treats legacy rows as "รอขึ้นเอ็น", so this only tidies existing data.
update public.jobs set status = 'รอขึ้นเอ็น' where status = 'รับไม้';
