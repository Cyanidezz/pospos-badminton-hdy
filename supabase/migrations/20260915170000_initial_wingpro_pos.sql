create table public.config (
  id smallint primary key check (id = 1),
  shop text not null default 'Wingpro',
  revision integer not null default 0 check (revision >= 0),
  next_product_number integer not null default 1 check (next_product_number >= 1),
  show_earnings smallint not null default 0 check (show_earnings in (0,1)),
  line_oa text not null default ''
);

create table public.members (
  id uuid primary key references auth.users(id) on delete restrict,
  email text not null,
  name text not null,
  role text not null check (role in ('owner','cashier')),
  active smallint not null default 1 check (active in (0,1))
);
create unique index members_email_lower_idx on public.members (lower(email));

create table public.product_categories (
  name text primary key
);

create table public.products (
  id text primary key,
  name text not null,
  barcode text not null unique,
  scan_code text unique,
  category text not null references public.product_categories(name) on update cascade on delete restrict,
  price integer not null check (price >= 0),
  cost integer check (cost >= 0),
  image text,
  low_stock integer not null default 5 check (low_stock >= 0),
  active smallint not null default 1 check (active in (0,1)),
  stock integer not null default 0,
  unit text not null default 'ชิ้น'
);
create index products_category_idx on public.products(category);
create index products_active_category_idx on public.products(active, category);

create table public.receipts (
  id text primary key,
  product_id text not null references public.products(id) on delete cascade,
  qty integer not null check (qty > 0),
  cost integer check (cost >= 0),
  staff_id uuid not null references public.members(id) on delete restrict,
  created text not null
);
create index receipts_product_id_idx on public.receipts(product_id);
create index receipts_staff_id_idx on public.receipts(staff_id);
create index receipts_created_idx on public.receipts(created desc);

create table public.sales (
  id text primary key,
  staff_id uuid not null references public.members(id) on delete restrict,
  created text not null,
  total integer not null check (total >= 0),
  discount integer not null default 0 check (discount >= 0),
  method text not null check (method in ('เงินสด','โอนเงิน','บัตร')),
  slip text,
  job_id text unique
);
create index sales_staff_id_idx on public.sales(staff_id);
create index sales_created_idx on public.sales(created desc);

create table public.items (
  id text primary key,
  sale_id text not null references public.sales(id) on delete cascade,
  product_id text,
  name text not null,
  category text not null,
  qty integer not null check (qty > 0),
  price integer not null check (price >= 0),
  original integer not null check (original >= 0),
  net integer not null check (net >= 0),
  line_discount integer not null default 0 check (line_discount >= 0),
  cost integer check (cost >= 0),
  note text not null default ''
);
create index items_sale_id_idx on public.items(sale_id);
create index items_product_id_idx on public.items(product_id);

create table public.jobs (
  id text primary key,
  token text not null unique,
  customer text not null,
  phone text not null,
  racket text not null,
  product_id text,
  tension text not null,
  condition text not null,
  note text not null default '',
  photos text not null default '[]',
  amount integer not null check (amount >= 0),
  status text not null check (status in ('รับไม้','รอขึ้นเอ็น','กำลังขึ้นเอ็น','พร้อมรับไม้','คืนไม้แล้ว')),
  paid smallint not null default 0 check (paid in (0,1)),
  staff_id uuid not null references public.members(id) on delete restrict,
  stringer_id uuid not null references public.members(id) on delete restrict,
  created text not null,
  completed text,
  returned text,
  notify text not null default 'ยังไม่เชื่อม LINE',
  line_user text
);
alter table public.sales add constraint sales_job_id_fkey foreign key (job_id) references public.jobs(id) on delete restrict;
create index jobs_product_id_idx on public.jobs(product_id);
create index jobs_staff_id_idx on public.jobs(staff_id);
create index jobs_stringer_id_idx on public.jobs(stringer_id);
create index jobs_status_idx on public.jobs(status);
create index jobs_created_idx on public.jobs(created desc);

create table public.leaves (
  id text primary key,
  staff_id uuid not null references public.members(id) on delete restrict,
  "start" text not null,
  "end" text not null,
  type text not null,
  reason text not null,
  status text not null check (status in ('รออนุมัติ','อนุมัติ','ไม่อนุมัติ')),
  note text not null default ''
);
create index leaves_staff_id_idx on public.leaves(staff_id);
create index leaves_start_idx on public.leaves("start" desc);

create table public.expenses (
  id text primary key,
  date text not null,
  category text not null,
  name text not null,
  amount integer not null check (amount > 0),
  photos text not null default '[]'
);
create index expenses_date_idx on public.expenses(date desc);

create table public.files (
  id text primary key,
  staff_id uuid not null references public.members(id) on delete restrict,
  mime text not null check (mime in ('image/jpeg','image/png','image/webp')),
  name text not null
);
create index files_staff_id_idx on public.files(staff_id);

create table public.operations (
  id text primary key,
  staff_id uuid not null references public.members(id) on delete restrict,
  action text not null,
  created text not null,
  valid smallint not null check (valid = 1)
);
create index operations_staff_id_idx on public.operations(staff_id);
create index operations_created_idx on public.operations(created desc);

create table public.stock_adjustments (
  id text primary key,
  product_id text not null references public.products(id) on delete cascade,
  delta integer not null,
  reason text not null,
  staff_id uuid not null references public.members(id) on delete restrict,
  created text not null
);
create index stock_adjustments_product_id_idx on public.stock_adjustments(product_id);
create index stock_adjustments_staff_id_idx on public.stock_adjustments(staff_id);
create index stock_adjustments_created_idx on public.stock_adjustments(created desc);

insert into public.config(id, shop) values (1, 'Wingpro');
insert into public.product_categories(name) values
  ('ไม้แบดมินตัน'),('เอ็นแบดมินตัน'),('รองเท้า'),('เสื้อผ้า'),('กระเป๋า'),('อุปกรณ์เสริม');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wingpro-files', 'wingpro-files', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

alter table public.config enable row level security;
alter table public.members enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.receipts enable row level security;
alter table public.sales enable row level security;
alter table public.items enable row level security;
alter table public.jobs enable row level security;
alter table public.leaves enable row level security;
alter table public.expenses enable row level security;
alter table public.files enable row level security;
alter table public.operations enable row level security;
alter table public.stock_adjustments enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
