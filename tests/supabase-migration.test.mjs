import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("uses Vercel-compatible Next.js scripts and pinned Supabase packages", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(pkg.scripts.build, "next build");
  assert.match(pkg.dependencies["@supabase/supabase-js"], /^\d+\.\d+\.\d+$/);
  assert.match(pkg.dependencies["@supabase/ssr"], /^\d+\.\d+\.\d+$/);
  assert.ok(!pkg.dependencies.wrangler);
});

test("protects POS tables and uses a private image bucket", async () => {
  const sql = await read("supabase/migrations/20260915170000_initial_wingpro_pos.sql");
  const policySql = await read("supabase/migrations/20260915173000_explicit_server_only_rls.sql");
  const tables = ["config","members","product_categories","products","receipts","sales","items","jobs","leaves","expenses","files","operations","stock_adjustments"];
  for (const table of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(policySql, new RegExp(`on public\\.${table} for all`, "i"));
  }
  assert.match(sql, /'wingpro-files', 'wingpro-files', false/);
  assert.match(sql, /references auth\.users\(id\)/);
});

test("keeps secrets server-side", async () => {
  const example = await read(".env.example");
  assert.match(example, /^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/m);
  assert.match(example, /^SUPABASE_SERVICE_ROLE_KEY=/m);
  assert.doesNotMatch(example, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  const admin = await read("lib/supabase/admin.ts");
  assert.match(admin, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
});

test("member upserts target the case-insensitive email index", async () => {
  const server = await read("lib/server.ts");
  const dataRoute = await read("app/api/data/route.ts");
  assert.match(server, /ON CONFLICT\(\(lower\(email\)\)\)/);
  assert.match(dataRoute, /ON CONFLICT\(\(lower\(email\)\)\)/);
  assert.doesNotMatch(`${server}\n${dataRoute}`, /ON CONFLICT\(email\)/);
});

test("enforces configurable cashier permissions on the server", async () => {
  const migration = await read("supabase/migrations/20260916012411_cashier_permissions.sql");
  const server = await read("lib/server.ts");
  const dataRoute = await read("app/api/data/route.ts");
  const pos = await read("app/pos.tsx");
  assert.match(migration, /permissions jsonb not null/);
  assert.match(server, /export function permit/);
  assert.match(dataRoute, /permit\(me,required\[action\]\)/);
  assert.match(dataRoute, /permit\(me,'discount'\)/);
  assert.match(dataRoute, /action==='bulkProductCategory'\)\{owner\(me\)/);
  assert.match(dataRoute, /role,memberPermissions/);
  assert.doesNotMatch(dataRoute, /JSON\.stringify\(memberPermissions\)/);
  assert.doesNotMatch(pos, /บัญชี ChatGPT/);
});

test("keeps bill corrections auditable and excludes voided sales", async () => {
  const migration = await read("supabase/migrations/20260916080000_sale_corrections.sql");
  const dataRoute = await read("app/api/data/route.ts");
  const pos = await read("app/pos.tsx");
  assert.match(migration, /discount_reason text not null/);
  assert.match(migration, /status text not null default 'active'/);
  assert.match(migration, /voided_by uuid references public\.members/);
  assert.match(dataRoute, /action==='editSale'/);
  assert.match(dataRoute, /action==='voidSale'/);
  assert.match(dataRoute, /sales\.status='active'/);
  assert.match(dataRoute, /UPDATE products SET stock=stock\+\?/);
  assert.match(pos, /เหตุผลส่วนลดท้ายบิล/);
  assert.match(pos, /เหตุผลที่ยกเลิกบิล/);
});

test("normalizes unlimited Excel stock before import", async () => {
  const importer = await read("app/product-import.tsx");
  assert.match(importer, /sourceQty===999999/);
  assert.match(importer, /qty:unlimited\?0:sourceQty/);
  assert.match(importer, /สต๊อกไม่จำกัดหรือจำนวน 999999 จะเริ่มที่ 0/);
});

test("renders inventory rows in the selected sort order", async () => {
  const pos = await read("app/pos.tsx");
  assert.match(pos, /const sortedInventoryRows=/);
  assert.match(pos, /<tbody>\{sortedInventoryRows\.map/);
  assert.match(pos, /field="price">ราคาขาย/);
  assert.match(pos, /field="cost">ราคาทุน/);
});

test("uses role-based landing pages and limits dashboard categories", async () => {
  const pos = await read("app/pos.tsx");
  assert.match(pos, /\[page,setPage\]=useState\(''\)/);
  assert.match(pos, /owner\?\[\['dashboard','ภาพรวมร้าน'/);
  assert.match(pos, /can\('pos'\)\?\[\['pos','ขายหน้าร้าน \(POS\)'/);
  assert.match(pos, /\['stringing','งานขึ้นเอ็น'.*\['inventory','คลังสินค้า'.*\['purchaseOrders','รับสินค้าเข้า \(PO\)'/);
  assert.match(pos, /categorySales=cats\.slice\(1\).*\.sort\(\(a,b\)=>b\.amount-a\.amount/);
  assert.match(pos, /showAllCategories\?categorySales:categorySales\.slice\(0,6\)/);
  assert.match(pos, /แสดงทั้งหมด/);
  assert.match(pos, /page==='dashboard'\?'dashboard-main'/);
  assert.match(pos, /page==='expenses'\?'expenses-main'/);
  assert.match(pos, /page==='team'\?'team-main'/);
});

test("keeps purchase orders staged until inventory is received", async () => {
  const migration = await read("supabase/migrations/20260917001000_purchase_orders.sql");
  const approvalMigration = await read("supabase/migrations/20260917010000_purchase_order_approval.sql");
  const dataRoute = await read("app/api/data/route.ts");
  const pos = await read("app/pos.tsx");
  const purchaseOrders = await read("app/purchase-orders.tsx");
  assert.match(migration, /create table public\.suppliers/i);
  assert.match(migration, /create table public\.purchase_orders/i);
  assert.match(migration, /create table public\.purchase_order_items/i);
  assert.match(migration, /status in \('draft','approved','paid','received'\)/);
  for (const table of ["suppliers","purchase_orders","purchase_order_items"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(migration, new RegExp(`policy "server only" on public\\.${table}`, "i"));
  }
  assert.match(approvalMigration, /pending_approval/);
  assert.match(dataRoute, /transitions:any=\{pending_approval:'approved',approved:'paid',paid:'received'\}/);
  assert.match(dataRoute, /action==='purchaseOrderStatus'\)\{owner\(me\)/);
  assert.match(dataRoute, /targetStatus==='approved'\)owner\(me\)/);
  assert.match(dataRoute, /UPDATE products SET stock=stock\+\?,cost=\?/);
  assert.match(pos, /รับสินค้าเข้า \(PO\)/);
  assert.doesNotMatch(pos, /id:'receive',name:'รับสินค้า'/);
  assert.match(purchaseOrders, /Number\(satang\|\|0\)\/100/);
  assert.match(purchaseOrders, /Math\.round\(Number\(item\.cost\|\|0\)\*100\)/);
  assert.match(purchaseOrders, /บันทึก \(รออนุมัติ\)/);
  assert.match(purchaseOrders, /บันทึกและอนุมัติ/);
});

test("manages product import and selective Excel export", async () => {
  const manager = await read("app/excel-manager.tsx");
  const pos = await read("app/pos.tsx");
  assert.match(pos, /จัดการสินค้าด้วย Excel/);
  assert.match(manager, /นำเข้าสินค้า/);
  assert.match(manager, /ส่งออกสินค้า/);
  assert.match(manager, /selected\.length===0\|\|selected\.includes/);
  assert.match(manager, /exportCategory==='ทั้งหมด'/);
  assert.match(manager, /XLSX\.writeFile/);
});

test("uses compact permission details and readable inventory states", async () => {
  const pos = await read("app/pos.tsx");
  const css = await read("app/globals.css");
  assert.doesNotMatch(pos, /สิทธิ์แคชเชียร์/);
  assert.match(pos, /a\.role==='owner'\?0:1/);
  assert.match(css, /\.stock-state\.paid/);
  assert.match(css, /\.stock-state\.stock-low/);
  assert.match(css, /white-space:nowrap/);
});

test("owners can rename users and reset passwords", async () => {
  const api = await read("app/api/data/route.ts");
  const pos = await read("app/pos.tsx");
  assert.match(api, /auth\.admin\.updateUserById/);
  assert.match(api, /user_metadata:\{full_name:str\(b\.name\)\}/);
  assert.match(pos, /รหัสผ่านใหม่ \(เว้นว่างหากไม่เปลี่ยน\)/);
  assert.match(pos, /m\.id!==data\.me\.id&&!!m\.active/);
});
