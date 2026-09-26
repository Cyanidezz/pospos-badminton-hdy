-- สินค้าสำคัญ + แจ้งเตือนสินค้าใกล้หมดเข้า LINE เจ้าของร้าน.
-- products.important: the owner ticks the products that must never run out. When one's sellable stock (stock minus
--   strings reserved for queued rackets) drops below its own low_stock ("แจ้งเตือนเมื่อพร้อมขายน้อยกว่า") a LINE
--   message goes to the linked LINE accounts - once (low_alerted), re-armed when it is back above the line.
-- config.low_stock_line: the on/off switch; alert_line_users: [{lineUser,name,linked}] - who receives them, linked by
--   sending the one-time code from ตั้งค่าร้าน (alert_link_code, valid 30 minutes) to the shop's LINE OA.
alter table public.products add column if not exists important smallint not null default 0 check (important in (0,1));
alter table public.products add column if not exists low_alerted smallint not null default 0 check (low_alerted in (0,1));
alter table public.config add column if not exists low_stock_line smallint not null default 0 check (low_stock_line in (0,1));
alter table public.config add column if not exists alert_line_users jsonb not null default '[]'::jsonb;
alter table public.config add column if not exists alert_link_code text;
alter table public.config add column if not exists alert_link_created text;
