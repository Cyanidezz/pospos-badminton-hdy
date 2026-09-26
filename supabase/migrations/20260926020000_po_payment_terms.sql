-- How a PO is paid: 'transfer' (pay first, the existing flow: approved -> paid -> received) or 'credit' (the
-- supplier gives credit: goods can be received right after approval and the amount stays owed until the owner
-- records the payment). creditor = who is owed (defaults to the supplier's name in the app), due_date = when the
-- debt must be settled (YYYY-MM-DD). The existing paid_at is when it was paid (for credit: the debt settled);
-- debt_paid_by who recorded that. Outstanding debt = credit POs with paid_at still empty ("เจ้าหนี้ค้างชำระ").
alter table public.purchase_orders add column if not exists payment_method text not null default 'transfer';
alter table public.purchase_orders drop constraint if exists purchase_orders_payment_method_check;
alter table public.purchase_orders add constraint purchase_orders_payment_method_check check (payment_method in ('transfer','credit'));
alter table public.purchase_orders add column if not exists creditor text not null default '';
alter table public.purchase_orders add column if not exists due_date text check (due_date is null or due_date ~ '^\d{4}-\d{2}-\d{2}$');
alter table public.purchase_orders add column if not exists debt_paid_by uuid references public.members(id) on delete restrict;
create index if not exists purchase_orders_open_debt_idx on public.purchase_orders (due_date) where payment_method = 'credit' and paid_at is null;
