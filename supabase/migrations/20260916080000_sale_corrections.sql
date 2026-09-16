alter table public.sales
  add column discount_reason text not null default '',
  add column status text not null default 'active' check (status in ('active','voided')),
  add column edit_reason text not null default '',
  add column edited_at text,
  add column edited_by uuid references public.members(id) on delete restrict,
  add column void_reason text not null default '',
  add column voided_at text,
  add column voided_by uuid references public.members(id) on delete restrict;

create index sales_status_created_idx on public.sales(status, created desc);
