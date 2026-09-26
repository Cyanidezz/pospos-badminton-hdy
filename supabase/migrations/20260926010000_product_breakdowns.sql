-- แปลงสินค้าขายย่อย: open a pack and sell its contents one by one (1 หลอดลูกแบด = 12 ลูก).
-- product_breakdowns: the rule - which product (parent, e.g. the tube) breaks into which product (child, e.g. one
--   shuttle) and how many. Set up once by the owner; the child is an ordinary product with its own price.
-- product_conversions: every time packs were opened - parent stock goes down, child stock goes up by qty x ratio,
--   and the child's cost is averaged in at the parent's cost / ratio (see breakdownConvert in app/api/data/route.ts).
create table if not exists public.product_breakdowns (
  id text primary key,
  parent_id text not null references public.products(id) on delete cascade,
  child_id text not null references public.products(id) on delete cascade,
  ratio integer not null check (ratio between 2 and 10000),
  created text not null,
  unique (parent_id, child_id),
  check (parent_id <> child_id)
);

create table if not exists public.product_conversions (
  id text primary key,
  breakdown_id text references public.product_breakdowns(id) on delete set null,
  parent_id text references public.products(id) on delete set null,
  child_id text references public.products(id) on delete set null,
  parent_qty integer not null check (parent_qty > 0),
  child_qty integer not null check (child_qty > 0),
  unit_cost integer check (unit_cost is null or unit_cost >= 0),
  staff_id uuid not null references public.members(id) on delete restrict,
  created text not null
);
create index if not exists product_conversions_created on public.product_conversions (created desc);

alter table public.product_breakdowns enable row level security;
alter table public.product_conversions enable row level security;
revoke all on public.product_breakdowns from anon, authenticated;
revoke all on public.product_conversions from anon, authenticated;
