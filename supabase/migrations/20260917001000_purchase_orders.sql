create table public.suppliers (
  id text primary key,
  name text not null,
  address text not null default '',
  phone text not null default '',
  line text not null default '',
  active smallint not null default 1 check (active in (0,1)),
  created text not null
);
create unique index suppliers_name_lower_idx on public.suppliers (lower(name));

create table public.purchase_orders (
  id text primary key,
  date text not null,
  supplier_id text not null references public.suppliers(id) on delete restrict,
  note text not null default '',
  evidence text not null default '[]',
  total integer not null default 0 check (total >= 0),
  status text not null default 'draft' check (status in ('draft','approved','paid','received')),
  created_by uuid not null references public.members(id) on delete restrict,
  created text not null,
  updated text not null,
  approved_by uuid references public.members(id) on delete restrict,
  approved_at text,
  paid_at text,
  received_at text
);
create index purchase_orders_date_idx on public.purchase_orders(date desc);
create index purchase_orders_status_idx on public.purchase_orders(status);
create index purchase_orders_supplier_idx on public.purchase_orders(supplier_id);

create table public.purchase_order_items (
  id text primary key,
  purchase_order_id text not null references public.purchase_orders(id) on delete cascade,
  product_id text not null references public.products(id) on delete restrict,
  name text not null,
  qty integer not null check (qty > 0),
  cost integer not null check (cost >= 0)
);
create index purchase_order_items_order_idx on public.purchase_order_items(purchase_order_id);
create index purchase_order_items_product_idx on public.purchase_order_items(product_id);

alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

revoke all on public.suppliers, public.purchase_orders, public.purchase_order_items from anon, authenticated;
create policy "server only" on public.suppliers for all to anon, authenticated using (false) with check (false);
create policy "server only" on public.purchase_orders for all to anon, authenticated using (false) with check (false);
create policy "server only" on public.purchase_order_items for all to anon, authenticated using (false) with check (false);
