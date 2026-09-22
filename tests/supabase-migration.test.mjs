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

test("bulk-select in inventory can download every selected product's barcode as one sheet", async () => {
  const label = await read("app/barcode-label.tsx");
  const pos = await read("app/pos.tsx");
  assert.match(label, /export function downloadBarcodeSheet\(items:\{name:string;barcode:string\}:\[\]|export function downloadBarcodeSheet\(items:\{name:string;barcode:string\}\[\]\)/);
  assert.match(label, /const MAX_SHEET_LABELS=200;/, "a generous cap so a huge selection can't freeze the browser or exceed canvas limits");
  assert.match(label, /items\.slice\(0,MAX_SHEET_LABELS\)/);
  assert.match(label, /\.filter\(\(c\):c is HTMLCanvasElement=>!!c\)/, "a product with no usable barcode is dropped, not left as a gap");
  assert.match(label, /return \{printed:labels\.length,skipped:items\.length-labels\.length\}/);
  assert.match(label, /triggerDownload\(sheet,`barcodes-\$\{new Date\(\)\.toISOString\(\)\.slice\(0,10\)\}\.png`\)/, "one combined download, not one popup per product");
  assert.match(pos, /import \{BarcodeLabel,downloadBarcodeSheet\} from '\.\/barcode-label';/);
  const bulkBar = pos.slice(pos.indexOf('bulk-edit-bar'), pos.indexOf('inventory-table-wrap'));
  assert.match(bulkBar, /downloadBarcodeSheet\(items\)/);
  assert.match(bulkBar, /inventorySelected\.map\(id=>allProducts\.find\(\(p:any\)=>p\.id===id\)\)/, "resolves against every product (including archived), not just the current filtered page");
  assert.match(bulkBar, /if\(printed\)toast\.success/);
  assert.match(bulkBar, /else toast\.error/, "a selection with no barcodes at all is reported, not a silent no-op");
});

test("product form shows a printable barcode label with a download button", async () => {
  const pkg = JSON.parse(await read("package.json"));
  const label = await read("app/barcode-label.tsx");
  const pos = await read("app/pos.tsx");
  const css = await read("app/globals.css");
  assert.match(pkg.dependencies.jsbarcode, /^\^?\d+\.\d+\.\d+$/);
  assert.match(label, /'use client'/);
  assert.match(label, /JsBarcode\(canvasRef\.current,code,\{format:'CODE128'/, "one symbology reads back both a real manufacturer barcode and our own auto-generated wingpro-N codes");
  assert.match(label, /if\(!code\.trim\(\)\)return null;/, "hidden until there is a code to show (a brand-new product with no barcode yet has nothing to print)");
  assert.match(label, /ctx\.fillText\(name\|\|'สินค้า',/, "the product name is drawn into the downloaded image itself, not just shown on screen");
  assert.match(label, /triggerDownload\(label,`barcode-\$\{code\.trim\(\)\}\.png`\)/);
  assert.match(pos, /import \{BarcodeLabel,downloadBarcodeSheet\} from '\.\/barcode-label';/);
  assert.match(pos, /<BarcodeLabel name=\{form\.name\|\|''\} code=\{form\.barcode\|\|''\}\/>/, "wired into both the add-product and edit-product dialogs (they share this markup)");
  assert.match(css, /\.barcode-label\{/);
  assert.match(label, /marginTop:2/, "the barcode's own top margin is trimmed so it sits close under the product name");
  assert.match(css, /\.barcode-label\{display:flex;flex-direction:column;align-items:center;gap:4px/);
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
  assert.match(route, /JSON\.stringify\(photos\),amount,'รอขึ้นเอ็น'\],jobTail=\[me\.id/);
  assert.match(route, /statuses\.indexOf\(normalizeJobStatus\(j\.status\)\)/);
  assert.match(pos, /open\('jobPay'/);
  assert.match(pos, /act\('payJob',\{id:form\.id,method:form\.jobPay/);
  assert.match(pos, /modal==='jobPay'&&!\(form\.reward&&form\.amount===0\)\?'ชำระภายหลัง':/);
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

test("a returning customer's linked LINE carries over to their new job automatically", async () => {
  const route = await read("app/api/data/route.ts");
  const job = route.slice(route.indexOf("else if(action==='job')"), route.indexOf("else if(action==='payJob')"));
  assert.match(job, /SELECT line_user FROM jobs WHERE regexp_replace\(phone,'\\\\D','','g'\)=\? AND line_user IS NOT NULL ORDER BY created DESC LIMIT 1/);
  assert.match(job, /INSERT INTO jobs\(id,token,customer,phone,racket,product_id,tension,condition,note,photos,amount,status,paid,staff_id,stringer_id,created,line_user,reward_used,reward_discount\)/, "carried over on the reward-redemption insert too");
  assert.match(job, /INSERT INTO jobs\(id,token,customer,phone,racket,product_id,tension,condition,note,photos,amount,status,paid,staff_id,stringer_id,created,line_user\) VALUES/, "and the plain insert");
  assert.match(job, /if\(existingLineUser\)result\.notifyId=id;/, "sends the status message right away, reusing the same post-transaction notifyJob hook as jobStatus/notify");
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
  const hours = await read("lib/shop-hours.ts");
  const css = await read("app/globals.css");
  assert.match(page, /className="line-cta"/);
  assert.match(page, /href=\{'tel:'\+String\(info\.phone\)\.replace\(\/\[\^0-9\+\]\/g,''\)\}/);
  assert.match(page, /href=\{info\.facebook\}/);
  assert.match(page, /groupHours\(hours\)/);
  assert.match(page, /isOpenNow\(hours,now\)/);
  // The defaults shown until the owner edits them in "ตั้งค่าร้าน".
  assert.match(hours, /phone: "080-539-0444"/);
  assert.match(hours, /facebook: "https:\/\/www\.facebook\.com\/profile\.php\?id=61583314268963"/);
  assert.match(hours, /\["15:00", "23:00"\]/);
  assert.match(hours, /\["13:00", "21:00"\]/);
  assert.match(hours, /timeZone: "Asia\/Bangkok"/);
  assert.match(css, /\.line-cta\{/);
});

test("returning customers are found from job history by name or phone", async t => {
  let customers;
  try { customers = await import("../lib/customers.ts"); }
  catch { t.skip("this Node version cannot import .ts files directly"); return; }
  const job = (customer, phone, racket, tension, created, status = "คืนไม้แล้ว") => ({ customer, phone, racket, tension, created, status });
  const jobs = [
    job("สมชาย ใจดี", "081-234-5678", "Yonex Astrox 88D", "26 lbs", "2026-09-19T10:00:00Z"),
    job("สมชาย ใจดี", "0812345678", "yonex astrox 88d", "27 lbs", "2026-08-01T10:00:00Z"),
    job("สมชาย ใจดี", "0812345678", "Li-Ning Windstorm 72", "25 lbs", "2026-06-01T10:00:00Z"),
    job("สมหญิง รักดี", "0899999999", "Victor Thruster K", "24 lbs", "2026-09-10T10:00:00Z"),
    job("คนยกเลิก", "0811111111", "Yonex X", "24 lbs", "2026-09-11T10:00:00Z", "ยกเลิก"),
  ];
  const list = customers.buildCustomers(jobs);
  assert.equal(list.length, 2);
  const som = list.find(c => c.name === "สมชาย ใจดี");
  assert.equal(som.visits, 3);
  assert.deepEqual(som.rackets.map(r => r.name), ["Yonex Astrox 88D", "Li-Ning Windstorm 72"]);
  assert.equal(som.rackets[0].tension, "26 lbs");
  assert.ok(!list.some(c => c.name === "คนยกเลิก"));
  assert.deepEqual(customers.matchCustomers(list, "สม", "name").map(c => c.name), ["สมชาย ใจดี", "สมหญิง รักดี"]);
  assert.deepEqual(customers.matchCustomers(list, "0899", "phone").map(c => c.name), ["สมหญิง รักดี"]);
  assert.deepEqual(customers.matchCustomers(list, "08", "phone"), []);
  assert.deepEqual(customers.knownRackets(jobs)[0], "Yonex Astrox 88D");
});

test("the job form is compact, has no default condition text, and condition is optional", async () => {
  const pos = await read("app/pos.tsx");
  const form = await read("app/job-form.tsx");
  const route = await read("app/api/data/route.ts");
  const css = await read("app/globals.css");
  assert.doesNotMatch(pos, /ไม่มีตำหนิที่พบ/);
  assert.match(pos, /<JobFormFields form=\{form\}/);
  assert.match(pos, /modal==='job'\?'job-dialog'/);
  assert.match(pos, /act\('job',\{\.\.\.form,member:undefined\},false\)/);
  assert.match(form, /className="job-form"/);
  assert.match(form, /สภาพไม้ \/ จุดตำหนิ \(ถ้ามี\)/);
  assert.doesNotMatch(form, /<textarea required/);
  assert.match(form, /attach-button/);
  assert.match(route, /String\(b\.condition\|\|''\)\.trim\(\)\.slice\(0,2000\)/);
  assert.match(css, /\.job-form\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("the payment summary after saving a job shows the amount and payment choices", async () => {
  const pos = await read("app/pos.tsx");
  const start = pos.indexOf("{modal==='jobPay'&&<div className={'pay-body'");
  assert.ok(start > 0, "jobPay body must exist in pos.tsx");
  const body = pos.slice(start, pos.indexOf("{modal==='leave'&&"));
  assert.match(body, /className="job-pay-summary"/);
  assert.match(body, /<b>\{form\.racket\}<\/b>/);
  assert.match(body, /className="payment-total">฿\{fmt\(form\.amount\)\}/);
  assert.match(body, /\['โอนเงิน','เงินสด'\]/, "transfer is listed first");
  assert.match(body, /form\.jobPay==='โอนเงิน'&&/);
  assert.match(body, /แนบสลิป/);
});

test("opening hours: validation, grouping and open-now use Thailand time", async t => {
  let hours;
  try { hours = await import("../lib/shop-hours.ts"); }
  catch { t.skip("this Node version cannot import .ts files directly"); return; }
  const week = hours.DEFAULT_SHOP.hours;
  assert.deepEqual(hours.groupHours(week).map(r => `${r.label} ${r.time}`), ["จันทร์ – ศุกร์ 15.00 – 23.00 น.", "เสาร์ 13.00 – 21.00 น.", "อาทิตย์ หยุด"]);
  assert.deepEqual(hours.parseHours(""), week);
  assert.deepEqual(hours.parseHours("not json"), week);
  assert.throws(() => hours.normalizeHours({ ...week, 1: ["25:00", "26:00"] }), /วันจันทร์/);
  assert.throws(() => hours.normalizeHours({ ...week, 2: ["18:00", "09:00"] }), /เวลาปิดต้องหลังเวลาเปิด/);
  assert.equal(hours.normalizeHours(JSON.stringify(week))["6"][1], "21:00");
  assert.equal(hours.isOpenNow(week, { day: 3, minutes: 18 * 60 }), true);
  assert.equal(hours.isOpenNow(week, { day: 3, minutes: 22 * 60 + 59 }), true);
  assert.equal(hours.isOpenNow(week, { day: 3, minutes: 23 * 60 }), false);
  assert.equal(hours.isOpenNow(week, { day: 3, minutes: 14 * 60 + 59 }), false);
  assert.equal(hours.isOpenNow(week, { day: 0, minutes: 12 * 60 }), false);
  const custom = { ...week, 3: null, 0: ["10:00", "12:00"] };
  assert.deepEqual(hours.groupHours(custom).map(r => r.label), ["จันทร์ – อังคาร", "พุธ", "พฤหัสบดี – ศุกร์", "เสาร์", "อาทิตย์"]);
});

test("shop contact and bank settings are stored, validated and shown", async () => {
  const migration = await read("supabase/migrations/20260922000000_shop_contact_and_bank.sql");
  const route = await read("app/api/data/route.ts");
  const track = await read("app/api/track/[token]/route.ts");
  const page = await read("app/track/[token]/page.tsx");
  const pos = await read("app/pos.tsx");
  const settings = await read("app/shop-settings.tsx");
  for (const column of ["contact_phone", "contact_facebook", "opening_hours", "bank_name", "bank_account_name", "bank_account_no", "bank_qr"]) assert.match(migration, new RegExp(`add column if not exists ${column}`));
  const action = route.slice(route.indexOf("action==='settings'"), route.indexOf("action==='expense'"));
  assert.match(action, /owner\(me\)/);
  assert.match(action, /normalizeHours\(b\.openingHours\)/);
  assert.match(action, /ขึ้นต้นด้วย https/);
  assert.match(action, /ownedFiles\(\[qr\]\)/);
  assert.match(action, /if\(b\.bankName!==undefined\)/, "fields left out (older clients) must be left alone");
  assert.match(track, /contact_phone\?\?DEFAULT_SHOP\.phone/);
  assert.match(page, /<ShopContact shop=\{job\.shop\}\/>/);
  assert.doesNotMatch(page, /080-539-0444/, "phone number now comes from settings");
  assert.match(settings, /'bank_name' in config/, "new fields are only sent once the migration is applied");
  assert.match(pos, /<ContactPanel /);
  assert.match(pos, /<BankPanel /);
  assert.equal((pos.match(/<BankTransfer /g) || []).length, 2, "transfer QR at checkout/payJob and after saving a job");
  assert.match(pos, /method==='โอนเงิน'&&<BankTransfer/);
  assert.match(pos, /form\.jobPay==='โอนเงิน'&&<><BankTransfer/);
});

test("brand assets use the Wingpro colors instead of the old green/teal", async () => {
  const offline = await read("public/offline.html");
  const favicon = await read("public/favicon.svg");
  const manifest = JSON.parse(await read("public/manifest.webmanifest"));
  const css = await read("app/globals.css");
  assert.match(offline, /id="badminton-offline-document"/, "the service worker checks for this id");
  for (const old of ["#087fac", "#17644f", "#f5f7f8"]) assert.ok(!offline.includes(old), `offline page still uses ${old}`);
  for (const old of ["#0C79D8", "#2E9EFF", "#68C4FF"]) assert.ok(!favicon.includes(old), `favicon still uses ${old}`);
  assert.deepEqual(manifest.icons.map(i => i.src), ["/wingpro-icon.svg", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"]);
  assert.match(css, /\.register-product-name\{background:linear-gradient\(145deg,#3a70d4,#5488e6\)\}/);
});

test("member stamps: one per paid job or linked POS bill, a reward every N, free jobs earn none", async t => {
  let customers;
  try { customers = await import("../lib/customers.ts"); }
  catch { t.skip("this Node version cannot import .ts files directly"); return; }
  const paid = (i, extra = {}) => ({ id: "j" + i, customer: "สมชาย", phone: "081-234-5678", racket: "R", tension: "25", created: `2026-09-${String(10 + i).padStart(2, "0")}T10:00:00Z`, status: "คืนไม้แล้ว", paid: 1, amount: 40000, reward_used: 0, ...extra });
  const jobs = [paid(1), paid(2), paid(3), paid(4), paid(5), paid(6, { paid: 0, status: "รอขึ้นเอ็น" })];
  let [c] = customers.buildCustomers(jobs, { stampsRequired: 3 });
  assert.equal(c.visits, 6);
  assert.equal(c.stamps, 5, "the unpaid job has no stamp yet");
  assert.equal(c.earned, 1);
  assert.equal(c.progress, 2);
  assert.equal(c.available, 1);
  // using the reward: the free job (reward_used) does not earn a stamp and consumes the reward
  [c] = customers.buildCustomers([...jobs, paid(7, { reward_used: 1, amount: 0, created: "2026-09-25T10:00:00Z" })], { stampsRequired: 3 });
  assert.equal(c.stamps, 5);
  assert.equal(c.used, 1);
  assert.equal(c.available, 0);
  // a cancelled free job gives the reward back
  [c] = customers.buildCustomers([...jobs, paid(7, { reward_used: 1, amount: 0, status: "ยกเลิก" })], { stampsRequired: 3 });
  assert.equal(c.available, 1);
  // POS bills linked to the member count towards spend but not stamps; voided ones are ignored
  const sales = [{ id: "s1", created: "2026-09-20T10:00:00Z", total: 129000, customer_key: "0812345678", status: "active" }, { id: "s2", created: "2026-09-21T10:00:00Z", total: 5000, customer_key: "0812345678", status: "voided" }];
  [c] = customers.buildCustomers(jobs, { stampsRequired: 3, sales });
  assert.equal(c.sales.length, 1);
  assert.equal(c.spent, 5 * 40000 + 129000);
  assert.equal(c.stamps, 6, "the linked POS bill earns a stamp too");
  assert.equal(c.posStamps, 1);
  assert.equal(customers.rewardDiscount(40000, null), 40000);
  assert.equal(customers.rewardDiscount(40000, 10000), 10000);
  assert.equal(customers.rewardDiscount(5000, 10000), 5000);
});

test("member program: server rules, settings and screens", async () => {
  const migration = await read("supabase/migrations/20260922010000_members.sql");
  const route = await read("app/api/data/route.ts");
  const pos = await read("app/pos.tsx");
  const settings = await read("app/shop-settings.tsx");
  const form = await read("app/job-form.tsx");
  for (const column of ["member_stamps_required", "member_reward_cap", "reward_used", "reward_discount", "customer_key", "customer_name"]) assert.match(migration, new RegExp(`add column if not exists ${column}`));
  assert.match(migration, /'สิทธิ์สมาชิก'/);
  const job = route.slice(route.indexOf("else if(action==='job')"), route.indexOf("else if(action==='payJob')"));
  assert.match(job, /Math\.floor\(Number\(stat\.stamps\)\/need\)-Number\(stat\.used\)<1/, "server re-checks the reward is available");
  assert.match(job, /paid=1 AND reward_used=0/);
  assert.match(job, /b\.useReward\?q\('INSERT INTO jobs\(.*reward_used,reward_discount\)/, "new columns only used when a reward is redeemed");
  const pay = route.slice(route.indexOf("else if(action==='payJob')"), route.indexOf("else if(action==='jobStatus')"));
  assert.match(pay, /freeReward=j\.reward_used===1&&j\.amount===0/);
  const sale = route.slice(route.indexOf("else if(action==='sale')"), route.indexOf("else if(action==='editSale')"));
  assert.match(sale, /memberKey\?q\('INSERT INTO sales\(.*customer_key,customer_name\)/);
  assert.match(route, /member_stamps_required',n\]/);
  assert.match(settings, /'member_stamps_required' in config/);
  assert.match(settings, /export function MemberPanel/);
  assert.match(form, /className=\{'reward-box f-full'/);
  assert.match(pos, /\['members','ลูกค้าสมาชิก',UserRound\]/);
  assert.match(pos, /<MembersPage jobs=\{jobs\}/);
  assert.match(pos, /<MemberPicker jobs=\{jobs\}/);
  assert.match(pos, /customerKey:form\.member\?\.key,customerName:form\.member\?\.name/);
  assert.match(pos, /form\.reward&&form\.amount===0/);
  assert.match(pos, /ยืนยันใช้สิทธิ์/);
});

test("add a member directly from the ลูกค้าสมาชิก page, before their first visit", async () => {
  const migration = await read("supabase/migrations/20260922040000_manual_members.sql");
  const route = await read("app/api/data/route.ts");
  const pos = await read("app/pos.tsx");
  const membersPage = await read("app/members-page.tsx");
  assert.match(migration, /add column if not exists manual_members jsonb not null default '\{\}'::jsonb/);
  const action = route.slice(route.indexOf("action==='memberAdd'"), route.indexOf("else if(action==='leave')"));
  assert.match(action, /manual_members' in config/, "fails clearly before the migration is run");
  assert.match(action, /key\.length<9\|\|key\.length>20/, "a real phone number is required, same as the POS's own +เพิ่มสมาชิกใหม่");
  assert.match(action, /FROM jobs WHERE regexp_replace\(phone,'\\\\D','','g'\)=\? LIMIT 1.*FROM sales WHERE customer_key=\? LIMIT 1.*config\.manual_members&&config\.manual_members\[key\]!==undefined/s, "refuses a phone already used by a job, a sale, or another manual member");
  assert.match(action, /manual_members=manual_members\|\|jsonb_build_object\(\?::text,\(\?::text\)::jsonb\)/);
  assert.match(pos, /page==='members'\?<button onClick=\{\(\)=>open\('memberAdd',\{name:'',phone:'',note:''\}\)\}/);
  assert.match(pos, /memberAdd:'เพิ่มสมาชิกใหม่'/);
  assert.match(pos, /modal==='memberAdd'&&<><Field label="ชื่อลูกค้า">/);
  assert.match(membersPage, /manualMembers:config\?\.manual_members/);
  let lib;
  try { lib = await import("../lib/customers.ts"); }
  catch { return; }
  const withManual = lib.buildCustomers([], { manualMembers: { "0899998888": { name: "ลูกค้าทดสอบ", phone: "0899998888" } } });
  assert.equal(withManual.length, 1);
  assert.deepEqual([withManual[0].visits, withManual[0].stamps, withManual[0].available], [0, 0, 0], "a manually added member starts with no history");
  // real activity always wins: a manual entry never overwrites (or duplicates) a customer already seen in a job/sale
  const job = { customer: "สมชาย", phone: "0899998888", racket: "Yonex", tension: "26", created: "2026-01-01", status: "คืนไม้แล้ว", paid: 1, amount: 40000 };
  const merged = lib.buildCustomers([job], { manualMembers: { "0899998888": { name: "ชื่ออื่น", phone: "0899998888" } } });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, "สมชาย");
  assert.equal(merged[0].visits, 1);
});

test("stamp dots always sit five to a row", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /\.stamp-dots\{display:grid;grid-template-columns:repeat\(5,/);
});

test("customer can pay from the tracking page: bank QR, slip upload, staff review", async () => {
  const migration = await read("supabase/migrations/20260922050000_job_slip.sql");
  const server = await read("lib/server.ts");
  const upload = await read("app/api/upload/route.ts");
  const slipRoute = await read("app/api/track/[token]/slip/route.ts");
  const qrRoute = await read("app/api/track/bank-qr/route.ts");
  const trackRoute = await read("app/api/track/[token]/route.ts");
  const dataRoute = await read("app/api/data/route.ts");
  const bank = await read("app/bank-transfer.tsx");
  const page = await read("app/track/[token]/page.tsx");
  const pos = await read("app/pos.tsx");
  const css = await read("app/globals.css");

  assert.match(migration, /alter table public\.jobs add column if not exists slip text/);

  // upload is now a single shared helper, used by both the staff-only route and the public one
  assert.match(server, /export async function saveUploadedFile/);
  assert.match(upload, /saveUploadedFile\(file,me\.id\)/);
  assert.doesNotMatch(upload, /storage\.upload|INSERT INTO files/, "the validation/storage logic lives in one place now");

  // the public slip route: no login, scoped by token, fails clearly before the migration, refuses a paid/cancelled job
  assert.doesNotMatch(slipRoute, /\bauth\(\)/, "no login required - it is reached from the public tracking link");
  assert.match(slipRoute, /information_schema\.columns[\s\S]*?column_name='slip'/);
  assert.match(slipRoute, /status==='ยกเลิก'/);
  assert.match(slipRoute, /if\(job\.paid\)throw/);
  assert.match(slipRoute, /saveUploadedFile\(file,job\.staff_id\)/, "attributed to the staff who created the job - a customer is not a member");
  assert.match(slipRoute, /WHERE token=\? AND paid=0 RETURNING id/);

  // the public bank-qr route: also no login, serves only the shop's one configured QR
  assert.doesNotMatch(qrRoute, /\bauth\(\)/);
  assert.match(qrRoute, /SELECT bank_qr FROM config WHERE id=1/);

  // BankTransfer can point its <img> somewhere other than the authenticated /api/files/[id]
  assert.match(bank, /src=\{qrSrc\|\|\('\/api\/files\/'\+qr\)\}/);

  // /api/track/[token]: bank details + whether a slip is already pending are only sent while the job is payable,
  // and the new "slip" column is read defensively (a missing column must never break the whole endpoint)
  assert.match(trackRoute, /to_jsonb\(jobs\)->>'slip' AS slip/);
  assert.match(trackRoute, /payable=!j\.paid&&j\.status!=='ยกเลิก'/);
  assert.match(trackRoute, /bank=payable\?\{name:config\?\.bank_name/);

  // the tracking page: a pay button reveals the QR + upload, and shows a persisted "already sent" state
  assert.match(page, /function PaySection/);
  assert.match(page, /if\(job\.paid\|\|job\.status==='ยกเลิก'\)return null/);
  assert.match(page, /if\(job\.slipUploaded\)return.*ส่งสลิปแล้ว/);
  assert.match(page, /fetch\('\/api\/track\/'\+token\+'\/slip'/);
  assert.match(page, /qrSrc="\/api\/track\/bank-qr"/);

  // staff side: the main jobs query also reads reward_used (a stamp-card display bug - it was missing entirely,
  // so "available" free rewards never accounted for ones already used) and the same defensive slip column
  assert.match(dataRoute, /status,paid,staff_id,stringer_id,created,completed,returned,notify,reward_used,to_jsonb\(jobs\)->>'slip' AS slip FROM jobs/);
  assert.match(pos, /\{!j\.paid&&j\.slip&&<span className="badge amber">มีสลิปรอตรวจ<\/span>\}/);
  assert.match(pos, /if\(selected\.slip\)setMethod\('โอนเงิน'\);open\('payJob',\{id:selected\.id,slip:selected\.slip\}\)/);
  assert.match(pos, /modal==='payJob'&&selected\?\.slip&&form\.slip===selected\.slip\?<div className="notice customer-slip">/);
  assert.match(css, /\.pay-cta\{/);
});

test("tracking page shows the customer's own stamp progress and reward", async () => {
  const route = await read("app/api/track/[token]/route.ts");
  const page = await read("app/track/[token]/page.tsx");
  const css = await read("app/globals.css");
  assert.match(route, /import \{buildCustomers\} from '@\/lib\/customers'/);
  assert.match(route, /if\(!\('member_stamps_required' in config\)\)return null/, "works before the members migration is run");
  assert.match(route, /regexp_replace\(phone,'\\\\D','','g'\)=\?",key\)/, "matches the same phone-digits key used everywhere else");
  assert.match(route, /FROM sales WHERE customer_key=\?/);
  assert.doesNotMatch(route, /customer_notes|\.note\b/, "the staff-only customer note is never sent to the public tracking page");
  assert.match(route, /rewardCap:config\.member_reward_cap\?\?null/);
  assert.match(page, /function MemberStamps\(/);
  assert.match(page, /job\.status!=='ยกเลิก'&&<MemberStamps member=\{job\.member\}\/>/, "hidden once the job is cancelled");
  assert.match(page, /available>0\?<span>🎁 <b>คุณมีสิทธิ์ขึ้นเอ็นฟรี/);
  assert.match(page, /cap===null\|\|cap===undefined\?'ฟรีค่าขึ้นเอ็นทั้งหมด'/);
  assert.match(css, /\.member-stamps\{margin:22px 0\}/);
});

test("payment dialogs default to transfer with a large QR and no repeated amount", async () => {
  const pos = await read("app/pos.tsx");
  const bank = await read("app/bank-transfer.tsx");
  const css = await read("app/globals.css");
  assert.match(pos, /\[method,setMethod\]=useState\('โอนเงิน'\)/);
  assert.match(pos, /jobPay:'โอนเงิน'\}/);
  assert.match(pos, /options=\{\['โอนเงิน','เงินสด','บัตร'\]\}/);
  assert.doesNotMatch(pos, /amountText=/, "the amount is shown once at the top, not again in the bank card");
  assert.doesNotMatch(bank, /amountText|bank-amount/);
  const checkout = pos.slice(pos.indexOf("(modal==='checkout'||modal==='payJob')&&<div className={'pay-body'"), pos.indexOf("{modal==='editSale'"));
  assert.ok(checkout.indexOf("<BankTransfer") > 0);
  assert.ok(checkout.lastIndexOf("MemberPicker") > checkout.indexOf("แนบสลิป"), "the member field comes after the slip field (last)");
  assert.match(checkout, /className="member-optional"/);
  assert.match(pos, /payWide\?'pay-dialog'/);
  assert.match(css, /\.pay-body\.with-qr\{display:grid;grid-template-columns:minmax\(0,340px\)/);
  assert.match(css, /\.pay-body \.bank-qr\{[^}]*max-height:calc\(90dvh - 270px\)/);
});

test("POS bills earn stamps, POS-only members exist, and notes come from the config map", async t => {
  let customers;
  try { customers = await import("../lib/customers.ts"); }
  catch { t.skip("this Node version cannot import .ts files directly"); return; }
  const job = { id: "j1", customer: "สมชาย", phone: "081-234-5678", racket: "R", tension: "25", created: "2026-09-01T10:00:00Z", status: "คืนไม้แล้ว", paid: 1, amount: 40000, reward_used: 0 };
  const bill = (id, key, total, extra = {}) => ({ id, customer_key: key, customer_name: "ชื่อในบิล", total, status: "active", job_id: null, created: "2026-09-10T10:00:00Z", ...extra });
  const sales = [bill("s1", "0812345678", 15000), bill("s2", "0812345678", 3000), bill("s3", "0812345678", 9000, { status: "voided" }), bill("s4", "0812345678", 20000, { job_id: "j1" }), bill("s5", "0876543210", 5000, { customer_name: "คุณใหม่" })];
  let list = customers.buildCustomers([job], { stampsRequired: 3, sales, notes: { "0812345678": "ชอบความตึงสูง" } });
  const som = list.find(c => c.key === "0812345678");
  assert.equal(som.stamps, 3, "1 job + 2 active POS bills (voided and job-payment bills do not count)");
  assert.equal(som.jobStamps, 1);
  assert.equal(som.posStamps, 2);
  assert.equal(som.note, "ชอบความตึงสูง");
  const fresh = list.find(c => c.key === "0876543210");
  assert.ok(fresh, "a customer who only shops at the POS is a member too");
  assert.equal(fresh.name, "คุณใหม่");
  assert.equal(fresh.phone, "087-654-3210");
  assert.equal(fresh.stamps, 1);
  assert.equal(fresh.jobs.length, 0);
  list = customers.buildCustomers([job], { stampsRequired: 3, sales, posMinAmount: 10000 });
  assert.equal(list.find(c => c.key === "0812345678").posStamps, 1, "only the ฿150 bill reaches the ฿100 minimum");
  assert.equal(list.find(c => c.key === "0876543210").stamps, 0);
  assert.equal(customers.billEarnsStamp(bill("x", "1", 10000), 10000), true);
  assert.equal(customers.billEarnsStamp(bill("x", "1", 9999), 10000), false);
  assert.equal(customers.billEarnsStamp(bill("x", null, 99999), 0), false, "a bill with no member earns nothing");
  assert.equal(customers.formatPhone("0812345678"), "081-234-5678");
});

test("editing a member: server rules, migration and screens", async () => {
  const migration = await read("supabase/migrations/20260922020000_member_notes_and_pos_stamps.sql");
  const route = await read("app/api/data/route.ts");
  const page = await read("app/members-page.tsx");
  const pos = await read("app/pos.tsx");
  const settings = await read("app/shop-settings.tsx");
  assert.match(migration, /add column if not exists customer_notes jsonb/);
  assert.match(migration, /add column if not exists member_pos_min_amount/);
  const edit = route.slice(route.indexOf("else if(action==='customerEdit')"), route.indexOf("else if(action==='leave')"));
  assert.match(edit, /access\.stringing\|\|access\.pos/, "needs stringing or POS access");
  assert.match(edit, /เบอร์นี้มีลูกค้าคนอื่นอยู่แล้ว/, "never merge into another customer");
  assert.match(edit, /UPDATE jobs SET customer=\?,phone=\?/);
  assert.match(edit, /UPDATE sales SET customer_key=\?,customer_name=\?/);
  assert.match(edit, /'customer_notes' in config/, "notes need the migration");
  assert.match(edit, /jsonb_build_object/);
  const job = route.slice(route.indexOf("else if(action==='job')"), route.indexOf("else if(action==='payJob')"));
  assert.match(job, /SELECT COUNT\(\*\) FROM sales WHERE customer_key=\? AND status='active' AND job_id IS NULL AND total>=\?/, "the server counts POS stamps for the reward");
  assert.match(route, /\^\(\\d\{6,20\}\|name:\.\{1,90\}\)\$/, "member key format is validated on sales");
  assert.match(route, /member_pos_min_amount',b\.memberPosMinAmount/);
  assert.match(page, /function EditForm/);
  assert.match(page, /\+ เพิ่มสมาชิกใหม่/);
  assert.match(page, /บิลนี้ได้ \+1 แต้ม/);
  assert.match(pos, /act\('customerEdit'/);
  assert.match(pos, /total=\{total\}\/><\/Field>/);
  assert.match(settings, /'member_pos_min_amount' in config/);
});

test("stock count rules: missing/surplus, wrong-barcode swaps, blind counting progress", async t => {
  let sc;
  try { sc = await import("../lib/stock-count.ts"); }
  catch { t.skip("this Node version cannot import .ts files directly"); return; }
  const item = (id, name, category, expected, counted, extra = {}) => ({ product_id: id, name, category, expected, counted, touched: counted > 0 ? 1 : 0, has_stock: expected !== 0, cost: 10000, ...extra });
  const items = [
    item("a", "A", "ลูกขน", 3, 3),
    item("b", "B", "ลูกขน", 5, 3),
    item("c", "C", "ลูกขน", 2, 4),
    item("d", "D", "อุปกรณ์", 3, 0, { cost: 5000 }),         // never scanned: counts as 0 => missing
    item("e", "E", "อุปกรณ์", -2, 0, { touched: 1, cost: 3000 }), // system was negative
    item("f", "F", "ไม้", 0, 0, { cost: 200000 }),
  ];
  const r = sc.classify(items);
  assert.deepEqual(r.missing.map(i => i.product_id), ["b", "d"], "sorted by value lost: B ฿200 before D ฿150");
  assert.deepEqual(r.surplus.map(i => i.product_id), ["c", "e"]);
  assert.deepEqual(r.matched.map(i => i.product_id), ["a", "f"]);
  assert.equal(r.missingValue, 35000);
  assert.equal(r.surplusValue, 26000);
  assert.equal(r.missingUnits, 5);
  assert.equal(r.surplusUnits, 4);
  const swaps = sc.possibleSwaps(items);
  assert.equal(swaps.length, 1, "D (missing 3) has no equal surplus in its category");
  assert.equal(swaps[0].missing.product_id, "b");
  assert.equal(swaps[0].surplus.product_id, "c");
  assert.equal(swaps[0].similarCost, true);
  const twoSurplus = [item("m", "M", "x", 4, 2, { cost: 100000 }), item("s1", "S1", "x", 0, 2, { cost: 500 }), item("s2", "S2", "x", 0, 2, { cost: 90000 })];
  assert.equal(sc.possibleSwaps(twoSurplus)[0].surplus.product_id, "s2", "the closest cost wins");
  assert.equal(sc.possibleSwaps([item("m", "M", "x", 4, 2), item("s", "S", "y", 0, 2)]).length, 0, "other categories are not paired");
  assert.equal(sc.defaultReason(items[1], new Set(["b"])), "รับเข้าผิด / สแกนผิดตัว");
  assert.equal(sc.defaultReason(items[3]), "ของหาย");
  assert.equal(sc.defaultReason(items[2]), "นับผิด / ปรับตามการนับ");
  const p = sc.progress(items.map(i => ({ ...i, expected: null })));
  assert.equal(p.shouldHave, 5, "progress works without the system quantities");
  assert.equal(p.counted, 4);
  assert.equal(p.remaining, 1);
  assert.equal(p.units, 10);
});

test("scanning an unrecognized barcode while counting offers to register the product", async () => {
  const route = await read("app/api/count/route.ts");
  const page = await read("app/stock-count.tsx");

  // server: distinguishes "exists but out of this count's scope" from "genuinely unknown", only the latter is
  // offered as an add-on-the-spot; the new product starts untracked (stock/expected 0) and is counted right away
  const scanNew = route.slice(route.indexOf("if(action==='scanNew')"), route.indexOf("if(action==='set')"));
  assert.match(route, /exists\?'สินค้านี้ไม่อยู่ในขอบเขตรอบนับนี้':'ไม่พบสินค้าจากบาร์โค้ดนี้',400,exists\?'out_of_scope':'not_found'/);
  assert.match(scanNew, /getCategories\(\)\)\.includes\(category\)/);
  assert.match(scanNew, /SELECT id FROM products WHERE barcode=\? OR scan_code=\?/, "refuses if the barcode was registered in the meantime");
  assert.match(scanNew, /status='counting'/, "only while the count is still open");
  assert.match(scanNew, /INSERT INTO products\(id,name,barcode,category,price,active,stock,unit\) VALUES\(\?,\?,\?,\?,\?,1,0,\?\)/, "stock starts at 0 - it was never tracked before");
  assert.match(scanNew, /INSERT INTO stock_count_items\(count_id,product_id,expected,counted,touched,staff_id,updated\) VALUES\(\?,\?,0,1,1,\?,\?\)/, "counted as 1 immediately, in the same step");

  // client: only a genuinely-unknown code (code:'not_found') opens the dialog; out-of-scope just shows the message
  assert.match(page, /if\(e\.code==='not_found'\)setNewProduct\(\{code:value,name:'',price:'',category:session\.scope\|\|categories\[0\]\|\|''\}\);/);
  assert.match(page, /else toast\.error\(e\.message\);/);
  assert.match(page, /action:'scanNew',countId:session\.id,code:newProduct\.code,name:newProduct\.name,price:newProduct\.price,category:newProduct\.category/);
  assert.match(page, /function Counting\(\{data,isOwner,categories,reload\}:any\)/, "needs the category list to offer in the add-product form");
});

test("the add-product form defaults its category to the count's own scope, not just the first category", async () => {
  const page = await read("app/stock-count.tsx");
  assert.match(page, /category:session\.scope\|\|categories\[0\]\|\|''/, "a category-scoped count (e.g. \"Support\") suggests that same category; a whole-shop count falls back to the first one");
});

test("stock counting: server rules, migration and screens", async () => {
  const migration = await read("supabase/migrations/20260922030000_stock_counts.sql");
  const route = await read("app/api/count/route.ts");
  const page = await read("app/stock-count.tsx");
  const pos = await read("app/pos.tsx");
  for (const table of ["stock_counts", "stock_count_items"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`create policy "server only" on public\\.${table}`));
  }
  assert.match(migration, /status text not null check \(status in \('counting','review','closed','cancelled'\)\)/);
  // who can do what
  assert.match(route, /const canCount=\(me:any\)=>me\.role==='owner'\|\|!!permissions\(me\)\.inventory/);
  const beforeOwner = route.slice(route.indexOf("if(action==='scan'||action==='set'||action==='scanNew')"), route.indexOf("owner(me); // everything below"));
  assert.notEqual(beforeOwner.length, 0, "the anchor text must actually be found in the source, or this check is vacuous");
  assert.doesNotMatch(beforeOwner, /owner\(me\)/, "counting itself (including registering a new product while counting) is open to staff with inventory access");
  const afterOwner = route.slice(route.indexOf("owner(me); // everything below"));
  for (const action of ["start", "finish", "reopen", "cancel", "apply"]) assert.match(afterOwner, new RegExp(`action==='${action}'`), `${action} is owner-only`);
  // blind counting
  assert.match(route, /showExpected=isOwner&&session\.status!=='counting'/);
  assert.match(route, /NULL::integer AS expected/);
  // counting only while the session is 'counting'
  assert.match(route, /c\.status='counting'/);
  // apply: relative delta, set-based, once, audited, idempotent
  const apply = route.slice(route.indexOf("if(action==='apply')"));
  assert.match(apply, /SET stock=p\.stock\+\(i\.counted-i\.expected\)/, "relative delta keeps sales made during the count");
  assert.match(apply, /jsonb_to_recordset\(\(\?::text\)::jsonb\)/, "JSON is sent as text (a jsonb-typed parameter would be double-encoded)");
  assert.match(apply, /INSERT INTO stock_adjustments/);
  assert.match(apply, /i\.applied=0/);
  assert.match(apply, /transaction\(requestId,me,'countApply'/);
  assert.doesNotMatch(apply, /for\s*\(/, "no per-product loop of round trips");
  assert.match(route, /INSERT INTO stock_count_items\(count_id,product_id,expected\) SELECT/);
  // screens
  assert.match(pos, /\['stockCount','นับสต๊อก',ClipboardCheck\]/);
  assert.match(pos, /<StockCountPage isOwner=\{owner\}/);
  assert.match(pos, /onStockChanged=\{load\}/);
  assert.match(page, /queue\.current=queue\.current\.then/, "scans are sent in order");
  assert.match(page, /pending\.current\?current:data\.items/, "a refresh never overwrites counts still on their way");
  assert.match(page, /requestId:crypto\.randomUUID\(\)/);
  assert.match(page, /ยืนยันปรับสต๊อก/);
});

test('new stringing job form: grouped sections and a barcode scan button for the string', async () => {
  const form = await read('app/job-form.tsx'), pos = await read('app/pos.tsx'), css = await read('app/globals.css');
  assert.equal((form.match(/<section className="job-section/g) || []).length, 3, 'customer / racket+string / optional');
  assert.match(form, /aria-label="สแกนบาร์โค้ดเอ็น"[^>]*onClick=\{onScanString\}/);
  assert.match(pos, /onScanString=\{\(\)=>setScanTarget\('jobString'\)\}/);
  // scanned product must be a string, otherwise refused; a string fills in the price
  assert.match(pos, /target==='jobString'[\s\S]*?category!=='เอ็นแบดมินตัน'[\s\S]*?ไม่ใช่เอ็น[\s\S]*?productId:p\.id,amount:\(p\.price\|\|0\)\/100/);
  assert.match(css, /\.with-scan\{display:flex/);
  // regression: the form grid once shared the name `.job-grid` with the job card list and squeezed every card into 12 columns
  assert.doesNotMatch(form, /job-grid/);
  assert.match(css, /\.job-fields\{display:grid;grid-template-columns:repeat\(12/);
  assert.match(pos, /className="job-grid"/, 'the card list keeps its own class');
  assert.doesNotMatch(css.slice(css.indexOf('.job-fields{display:grid')), /\.job-grid\{[^}]*repeat\(12/);
  assert.match(css, /\.scan-string\{/);
});

test("stock count start screen shows how many products and pieces each scope covers", async t => {
  const page = await read("app/stock-count.tsx"), pos = await read("app/pos.tsx"), css = await read("app/globals.css");
  assert.match(pos, /<StockCountPage[^>]*products=\{data\.products\|\|\[\]\}/);
  assert.match(page, /scopeStats\(products\|\|\[\],categories\)/);
  assert.match(page, /รายการ · \{num\(stat\.units\)\} ชิ้น/);
  assert.match(page, /disabled=\{busy\|\|!shown\.items\}/, "an empty scope cannot start a count");
  assert.doesNotMatch(page, /<select value=\{scope\}/, "the scope picker is the styled Select, not the plain browser one");
  assert.match(css, /\.scope-item\[data-state=checked\]\{background:linear-gradient/);
  let sc;
  try { sc = await import("../lib/stock-count.ts"); }
  catch { t.skip("this Node version cannot import .ts files directly"); return; }
  const p = (category, stock, active = 1) => ({ category, stock, active });
  const s = sc.scopeStats([p("กริป", 3), p("กริป", 4), p("กริป", 99, 0), p("ถุงเท้า", -3), p("ลูกขน", 10)], ["กริป", "ถุงเท้า", "ลูกขน", "ว่าง"]);
  assert.deepEqual(s.byCategory["กริป"], { items: 2, units: 7 }, "archived products are not counted");
  assert.deepEqual(s.byCategory["ถุงเท้า"], { items: 1, units: 0 }, "negative stock is 0 pieces on the shelf");
  assert.deepEqual(s.byCategory["ว่าง"], { items: 0, units: 0 });
  assert.deepEqual(s.all, { items: 4, units: 17 });
});

test("sidebar can be hidden from a small button, and the POS bar has a stringing shortcut", async () => {
  const pos = await read("app/pos.tsx"), css = await read("app/globals.css");
  assert.match(pos, /function SidebarHide\(\)\{const \{toggleSidebar,isMobile\}=useSidebar\(\);if\(isMobile\)return null/);
  assert.match(pos, /<SidebarHide\/><\/SidebarHeader>/);
  // shortcut: only for accounts that may use stringing, sits before the pay button and goes through the same page switch as the menu
  assert.match(pos, /can\('stringing'\)&&<button type="button" className="register-stringing"[\s\S]*?setPage\('stringing'\)[\s\S]*?<button className="register-total"/);
  // and the other way round: the stringing page has a POS button before "รับไม้ใหม่", only for accounts that may sell
  assert.match(pos, /page==='stringing'\?<div className="actions">\{can\('pos'\)&&<button type="button" className="secondary" onClick=\{\(\)=>\{setPage\('pos'\)[\s\S]*?ขายหน้าร้าน \(POS\)<\/button>\}<button onClick=\{\(\)=>open\('job'/);
  // when the sidebar is hidden the fixed pay bar must not leave a gap where the menu used to be
  assert.match(css, /body:has\(\[data-slot=sidebar\]\[data-state=collapsed\]\) \.register-bottom\{left:0\}/);
});

test("on a narrow screen the pay button first shows the cart, and only pays once it is on screen", async () => {
  const pos = await read("app/pos.tsx");
  assert.match(pos, /useNarrowRegister\(\)\{[\s\S]*?matchMedia\('\(max-width:1199px\)'\)/);
  assert.match(pos, /narrowRegister=useNarrowRegister\(\)/);
  assert.match(pos, /onClick=\{\(\)=>\{if\(narrowRegister&&saleScreen==='catalog'\)setSaleScreen\('cart'\);else open\('checkout',\{\}\)\}\}/);
  assert.match(pos, /\{narrowRegister&&saleScreen==='catalog'\?'ดูตะกร้า':'ชำระเงิน'\}/);
});

test("staff can see the customer's uploaded slip directly in the job detail, not only inside the pay dialog", async () => {
  const pos = await read("app/pos.tsx");
  assert.match(pos, /\{!selected\.paid&&selected\.slip&&<Field label="สลิปที่ลูกค้าแนบมา \(ยังไม่ตรวจสอบ\)">/);
  assert.match(pos, /alt="สลิปโอนเงินจากลูกค้า"/);
});

test("paying a job with a customer-uploaded slip doesn't offer a redundant re-upload field", async () => {
  const pos = await read("app/pos.tsx");
  const css = await read("app/globals.css");
  // the customer's slip gets a view link + a compact "attach a different one" control, not a second bare file
  // input sitting right under "the customer already sent one" - that read as if the upload hadn't registered
  assert.match(pos, /modal==='payJob'&&selected\?\.slip&&form\.slip===selected\.slip\?<div className="notice customer-slip">/);
  assert.match(pos, /ดูสลิปที่ลูกค้าแนบ ↗/);
  assert.match(pos, /แนบสลิปใหม่แทน/);
  // any other case (a staff-attached slip, or none yet) keeps the plain upload field as before
  assert.match(pos, /:<><Field label="แนบสลิป \(ถ้ามี\)">/);
  assert.match(css, /\.customer-slip-actions\{/);
});

test("stamp card has room to breathe: bigger dots, more padding, more gap before the reward line", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /\.stamp-card\{margin:18px 0;padding:22px 24px/);
  assert.match(css, /\.stamp-dots\{display:grid;grid-template-columns:repeat\(5,40px\);gap:10px 12px\}/);
  assert.match(css, /\.stamp-reward\{display:flex;align-items:center;gap:8px;margin-top:20px;padding:13px 15px/);
});

test("staff stamp card (ลูกค้าสมาชิก) is compact on desktop, unchanged on the public tracking page", async () => {
  const membersPage = await read("app/members-page.tsx");
  const trackPage = await read("app/track/[token]/page.tsx");
  const css = await read("app/globals.css");
  assert.match(membersPage, /className="stamp-card stamp-card-panel"/);
  assert.doesNotMatch(trackPage, /stamp-card-panel/, "the public tracking page keeps the mobile-sized card");
  assert.match(css, /@media\(min-width:901px\)\{\s*\.stamp-card-panel\{/);
  assert.match(css, /\.stamp-card-panel \.stamp-dots\{grid-template-columns:repeat\(10,34px\);gap:8px\}/);
});
