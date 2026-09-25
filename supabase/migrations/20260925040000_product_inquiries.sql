-- LINE chatbot product questions ("lining no1 เท่าไหร่").
-- 1) products.aliases: other names customers use for a product ("เบอร์1, no1"), comma separated, set by the owner in
--    แก้ไขสินค้า and used by the matcher (lib/product-search.ts) alongside the product's own name.
-- 2) product_inquiries: what customers asked for that the shop couldn't sell them - not stocked at all ('missing'),
--    or stocked but sold out ('out_of_stock') - so the owner can decide what to bring in. One row per request
--    (grouped by a normalized key so "Lining No.1" and "lining no1" count together), with how many times and how
--    many different LINE customers asked.
alter table public.products add column if not exists aliases text not null default '';

create table if not exists public.product_inquiries (
  id text primary key,
  kind text not null check (kind in ('missing','out_of_stock')),
  query_key text not null,
  query text not null,
  product_id text references public.products(id) on delete set null,
  count integer not null default 1,
  line_users text[] not null default '{}',
  first_asked text not null,
  last_asked text not null,
  dismissed smallint not null default 0 check (dismissed in (0,1)),
  unique (kind, query_key)
);
alter table public.product_inquiries enable row level security;
revoke all on public.product_inquiries from anon, authenticated;
