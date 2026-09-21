-- Stock counting ("รอบนับสต๊อก"): the owner starts a count, staff scan/type what is on the shelves,
-- and the owner reviews the differences (missing / surplus) before any stock is changed.
create table public.stock_counts (
  id text primary key,
  name text not null,
  scope text not null default '',                  -- '' = whole shop, otherwise a product category
  status text not null check (status in ('counting','review','closed','cancelled')),
  started text not null,
  started_by uuid not null references public.members(id) on delete restrict,
  finished text,
  closed text,
  closed_by uuid references public.members(id) on delete restrict,
  summary text not null default ''                 -- JSON totals saved when the count is closed
);
create index stock_counts_status_idx on public.stock_counts(status);
create index stock_counts_started_idx on public.stock_counts(started desc);

create table public.stock_count_items (
  count_id text not null references public.stock_counts(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  expected integer not null,                       -- system stock when the count started
  counted integer not null default 0 check (counted >= 0),
  touched smallint not null default 0 check (touched in (0,1)),
  staff_id uuid references public.members(id) on delete set null,
  updated text,
  applied smallint not null default 0 check (applied in (0,1)),
  reason text,
  primary key (count_id, product_id)
);
create index stock_count_items_product_idx on public.stock_count_items(product_id);

alter table public.stock_counts enable row level security;
alter table public.stock_count_items enable row level security;

revoke all on public.stock_counts, public.stock_count_items from anon, authenticated;
create policy "server only" on public.stock_counts for all to anon, authenticated using (false) with check (false);
create policy "server only" on public.stock_count_items for all to anon, authenticated using (false) with check (false);
