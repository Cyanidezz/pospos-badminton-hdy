-- Member program: every returning customer (grouped by phone number) collects one stamp per paid
-- stringing job; after N stamps they earn one free stringing. Members are derived from the job
-- history, so there is no separate customers table.
alter table public.config
  add column if not exists member_stamps_required integer not null default 10 check (member_stamps_required between 1 and 100),
  add column if not exists member_reward_cap integer check (member_reward_cap is null or member_reward_cap >= 0); -- satang, null = whole job

alter table public.jobs
  add column if not exists reward_used smallint not null default 0 check (reward_used in (0,1)),
  add column if not exists reward_discount integer not null default 0 check (reward_discount >= 0); -- satang waived

-- POS bills can be linked to a member for purchase history.
alter table public.sales
  add column if not exists customer_key text,
  add column if not exists customer_name text;

create index if not exists jobs_phone_digits_idx on public.jobs ((regexp_replace(phone, '\D', '', 'g')));
create index if not exists sales_customer_key_idx on public.sales(customer_key) where customer_key is not null;

-- A free stringing is recorded as a 0-baht sale (so the string's cost still shows in reports).
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.sales'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%method%'
  loop
    execute format('alter table public.sales drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.sales add constraint sales_method_check
  check (method in ('เงินสด','โอนเงิน','บัตร','สิทธิ์สมาชิก'));
