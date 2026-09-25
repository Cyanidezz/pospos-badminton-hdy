-- Lets the owner update a product's sale price right from a PO's own item row while editing it (alongside cost
-- and quantity, both already editable). Nullable: old PO rows never recorded one, and only an owner's save ever
-- sets it (see the isOwner check in app/api/data/route.ts's purchaseOrderSave) - a cashier's edit never touches
-- price. Applied to the product itself at receiving time (purchaseOrderStatus, same moment cost already is),
-- via COALESCE so a row with no price recorded (an old PO, or a cashier's save) never wipes out the real price.
alter table public.purchase_order_items add column if not exists price integer check (price is null or price >= 0);
