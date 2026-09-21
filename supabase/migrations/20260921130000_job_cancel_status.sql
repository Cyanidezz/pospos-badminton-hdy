-- Owners can cancel a stringing job, so jobs.status must accept 'ยกเลิก'.
-- The old "รับไม้" step is gone as well; move any leftover rows first.
update public.jobs set status = 'รอขึ้นเอ็น' where status = 'รับไม้';

-- Drop whichever CHECK constraint currently guards jobs.status, then recreate it.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.jobs'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.jobs drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.jobs add constraint jobs_status_check
  check (status in ('รอขึ้นเอ็น','กำลังขึ้นเอ็น','พร้อมรับไม้','คืนไม้แล้ว','ยกเลิก'));
