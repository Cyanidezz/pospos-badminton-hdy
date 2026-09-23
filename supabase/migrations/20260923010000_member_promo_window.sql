-- An optional limited-time window for the stamp/reward promotion, plus a manual on/off switch (e.g. "1 ต.ค. 2569 -
-- 31 ธ.ค. 2569"). Both are additive and default to "no restriction" so a shop that never touches this setting keeps
-- earning stamps exactly as before. A visit outside the window (or made while the switch is off) earns no stamp;
-- a reward the customer already earned can still be redeemed either way.
alter table public.config
  add column if not exists member_promo_enabled smallint not null default 1 check (member_promo_enabled in (0,1)),
  add column if not exists member_promo_start text,
  add column if not exists member_promo_end text;
