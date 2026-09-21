-- Member notes (customer key -> note) and the minimum POS bill that earns a stamp.
-- Notes live in one jsonb map on the config row, so no separate customers table is needed.
alter table public.config
  add column if not exists customer_notes jsonb not null default '{}'::jsonb,
  add column if not exists member_pos_min_amount integer not null default 0 check (member_pos_min_amount >= 0); -- satang, 0 = every bill
