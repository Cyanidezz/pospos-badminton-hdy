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

test("filters purchase orders by selected day month or year", async () => {
  const po = await read("app/purchase-orders.tsx");
  assert.match(po, /\[filterDate,setFilterDate\]/);
  assert.match(po, /groupBy==='day'\?order\.date===filterDate/);
  assert.match(po, /groupBy==='month'\?order\.date\.slice\(0,7\)===filterDate\.slice\(0,7\)/);
  assert.match(po, /aria-label="เลือกวันที่ใบ PO"/);
});

test("owner leave records are approved immediately", async () => {
  const api = await read("app/api/data/route.ts");
  const pos = await read("app/pos.tsx");
  assert.match(api, /me\.role==='owner'\?'อนุมัติ':'รออนุมัติ'/);
  assert.match(api, /บันทึกโดยเจ้าของกิจการ/);
  assert.match(pos, /owner\?'บันทึกวันลา':'ขอลา'/);
});

test("shows active inventory count and total stock cost", async () => {
  const pos = await read("app/pos.tsx");
  assert.match(pos, /className="inventory-value-summary"/);
  assert.match(pos, /Math\.max\(0,Number\(p\.stock\)\|\|0\)\*\(p\.cost\|\|0\)/);
});

test("stringing jobs start at waiting and offer payment right after saving", async () => {
  const server = await read("lib/server.ts");
  const route = await read("app/api/data/route.ts");
  const pos = await read("app/pos.tsx");
  const track = await read("app/track/[token]/page.tsx");
  assert.match(server, /export const statuses = \["รอขึ้นเอ็น","กำลังขึ้นเอ็น","พร้อมรับไม้","คืนไม้แล้ว"\]/);
  assert.match(pos, /const statuses=\['รอขึ้นเอ็น','กำลังขึ้นเอ็น','พร้อมรับไม้','คืนไม้แล้ว'\]/);
  assert.doesNotMatch(track, /'รับไม้'/);
  assert.match(route, /JSON\.stringify\(photos\),amount,'รอขึ้นเอ็น',me\.id/);
  assert.match(route, /statuses\.indexOf\(normalizeJobStatus\(j\.status\)\)/);
  assert.match(pos, /open\('jobPay'/);
  assert.match(pos, /act\('payJob',\{id:form\.id,method:form\.jobPay/);
  assert.match(pos, /modal==='jobPay'\?'ชำระภายหลัง':/);
});

test("owners can step a stringing job back or cancel it", async () => {
  const route = await read("app/api/data/route.ts");
  const pos = await read("app/pos.tsx");
  const track = await read("app/track/[token]/page.tsx");
  const migration = await read("supabase/migrations/20260921130000_job_cancel_status.sql");
  const revert = route.slice(route.indexOf("action==='jobRevert'"), route.indexOf("action==='jobCancel'"));
  const cancel = route.slice(route.indexOf("action==='jobCancel'"), route.indexOf("action==='notify'"));
  assert.match(revert, /owner\(me\)/);
  assert.match(revert, /statuses\[index-1\]/);
  assert.match(revert, /index===2\?null:j\.completed,index===3\?null:j\.returned/);
  assert.match(cancel, /owner\(me\)/);
  assert.match(cancel, /str\(b\.reason,500\)/);
  assert.match(cancel, /UPDATE sales SET status='voided'/);
  assert.match(cancel, /UPDATE products SET stock=stock\+\?/);
  assert.match(cancel, /status='ยกเลิก',paid=0,completed=NULL/);
  assert.match(route, /returned IS NULL AND status<>'ยกเลิก'\) reserved/);
  assert.match(route, /if\(j\?\.status==='ยกเลิก'\)throw new Error\('งานนี้ถูกยกเลิกแล้ว'\);if\(!j\|\|j\.paid\)/);
  assert.match(pos, /owner&&selected\.status!=='คืนไม้แล้ว'&&<button/);
  assert.match(pos, /open\('jobRevert'/);
  assert.match(pos, /open\('jobCancel'/);
  assert.match(pos, /j\.status!=='ยกเลิก'\)\.length/);
  assert.match(track, /job\.status!=='ยกเลิก'&&<ol>/);
  assert.match(migration, /'ยกเลิก'/);
});

test("loads the POS snapshot in a single database round trip", async () => {
  const route = await read("app/api/data/route.ts");
  const server = await read("lib/server.ts");
  const get = route.slice(route.indexOf("export async function GET()"), route.indexOf("export async function POST"));
  assert.match(get, /allInOne\(\[/);
  assert.doesNotMatch(get, /await all\(/);
  assert.doesNotMatch(get, /await one\(/);
  assert.doesNotMatch(get, /Promise\.all/);
  assert.match(server, /json_build_object/);
  assert.match(server, /coalesce\(json_agg\(t\),'\[\]'::json\)/);
});

test("shows the new job's receipt with its QR code after the payment step", async () => {
  const pos = await read("app/pos.tsx");
  assert.match(pos, /useEffect\(\(\)=>\{if\(!openJobId\|\|!data\)return;const job=data\.jobs\.find\(\(j:any\)=>j\.id===openJobId\);setOpenJobId\(''\);if\(job\)showJob\(job\)\}/);
  assert.match(pos, /if\(d\)setOpenJobId\(form\.id\)/);
  assert.match(pos, /onClick=\{\(\)=>\{if\(modal==='jobPay'\)setOpenJobId\(form\.id\);setModal\(''\)\}\}/);
  assert.match(pos, /onOpenChange=\{v=>\{if\(!busy&&!uploading&&!v\)\{if\(modal==='jobPay'\)setOpenJobId\(form\.id\)/);
});

test("LINE push failures report the real cause instead of a generic message", async () => {
  const server = await read("lib/server.ts");
  const notify = server.slice(server.indexOf("export async function notifyJob"));
  assert.match(notify, /console\.error\("LINE push failed", response\.status, detail\)/);
  assert.match(notify, /response\.status === 401 \? "Channel access token/);
  assert.match(notify, /state = `ส่งไม่สำเร็จ \(\$\{response\.status\}\): \$\{hint\}`/);
  assert.doesNotMatch(notify, /Authorization: Bearer \$\{token\}[^]*console\.(log|error)\([^)]*token/);
});

test("sends job status updates as a Flex card with a plain-text fallback", async () => {
  const server = await read("lib/server.ts");
  const card = await read("lib/line-message.ts");
  const notify = server.slice(server.indexOf("export async function notifyJob"));
  assert.match(notify, /jobStatusMessage\(current, \{ steps: statuses, siteUrl: siteUrl\(\) \}\)/);
  assert.match(notify, /response\.status === 400[^]*jobStatusText\(current\)/);
  assert.match(card, /type: "flex"/);
  assert.match(card, /altText:/);
  assert.match(card, /\/\^https:\\\/\\\/\/\.test\(siteUrl\)/);
  assert.match(card, /"ยกเลิก": \{ color:/);
});

test("customer tracking page has a prominent LINE button and the shop contact details", async () => {
  const page = await read("app/track/[token]/page.tsx");
  const css = await read("app/globals.css");
  assert.match(page, /className="line-cta"/);
  assert.match(page, /phone:'080-539-0444'/);
  assert.match(page, /href=\{'tel:'\+SHOP\.phone\.replaceAll\('-',''\)\}/);
  assert.match(page, /facebook:'https:\/\/www\.facebook\.com\/profile\.php\?id=61583314268963'/);
  assert.match(page, /days:\[1,2,3,4,5\],time:'15\.00 – 23\.00 น\.'/);
  assert.match(page, /days:\[6\],time:'13\.00 – 21\.00 น\.'/);
  assert.match(page, /days:\[0\],time:'หยุด'/);
  assert.match(page, /timeZone:'Asia\/Bangkok'/);
  assert.match(css, /\.line-cta\{/);
});
