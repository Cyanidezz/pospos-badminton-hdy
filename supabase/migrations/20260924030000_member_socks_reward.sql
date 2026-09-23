-- Second reward tier: "5 ดาวแลกถุงเท้า, 10 ดาวแลกเอ็นฟรี" - redeeming EITHER tier resets the star count to zero
-- (handled in application code, see lib/customers.ts's buildCustomers() and lib/member-reward.ts's starsSql()).
-- member_stamps_required (existing) stays the string-reward threshold; this adds the socks one plus which
-- product is given away. The socks reward stays inactive until an owner picks a product for it.
alter table public.config
  add column if not exists member_socks_stamps_required integer not null default 5 check (member_socks_stamps_required between 1 and 100),
  add column if not exists member_socks_product_id text references public.products(id);
