import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
// The tracking API plus the memberStatus() it shares with the LINE webhook (lib/member-status.ts).
const readTrackApi = async () => (await read("app/api/track/[token]/route.ts")) + "\n" + (await read("lib/member-status.ts"));

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

test("PO product search reacts to a hardware barcode scanner (types + Enter)", async () => {
  const po = await read("app/purchase-orders.tsx");
  // a hardware scanner is just a keyboard: it types the code into whatever has focus, then sends Enter - so the
  // search box needs its own Enter handler to act immediately, the same way the camera-scan fallback (scanned())
  // already does for "found" vs "register as new"
  assert.match(po, /onKeyDown=\{e=>\{if\(e\.key==='Enter'\)\{e\.preventDefault\(\);const value=productQuery\.trim\(\);if\(value\)\{scanned\(value\);setProductQuery\(''\)\}\}\}\}/);
  assert.match(po, /placeholder="ค้นหาชื่อหรือบาร์โค้ดสินค้า \(ยิงจากเครื่องสแกนแล้วกด Enter ได้เลย\)"/);
});

test("PO editor: adding a new product doesn't require a cost, and every past PO's items can be reviewed", async () => {
  const po = await read("app/purchase-orders.tsx");
  const css = await read("app/globals.css");
  // creating a product from within a PO no longer requires (or even sends an empty-string) cost
  assert.match(po, /if\(!p\?\.name\|\|!p\?\.category\|\|p\?\.price===''\)\{toast\.error\('กรอกชื่อสินค้า หมวดหมู่ และราคาขายให้ครบ'\)/);
  assert.doesNotMatch(po, /p\?\.cost===''/, "cost is no longer part of the required-field check");
  assert.match(po, /cost:p\.cost===''\?null:Math\.round\(Number\(p\.cost\)\*100\)/, "left blank, the new item's line cost is empty (still to be filled in per PO), not a misleading 0");
  assert.match(po, /placeholder="ต้นทุน \(ไม่บังคับ\)"/);
  // an explicit "เพิ่มสินค้า" button opens the new-product form directly, not only after a search finds nothing
  assert.match(po, /className="secondary po-add-product" onClick=\{\(\)=>setNewProduct\(\{barcode:'',name:productQuery/);
  // every past PO (any status, not just drafts) can have its item list reviewed without editing it
  assert.match(po, /\[expanded,setExpanded\]=useState<string>\(''\)/);
  assert.match(po, /onClick=\{\(\)=>setExpanded\(id=>id===order\.id\?'':order\.id\)\}>\{open\?'ซ่อนรายการ':'ดูรายการ'\}/);
  assert.match(po, /\{open&&<div className="po-card-detail">/);
  assert.match(css, /\.po-card-detail\{grid-column:1\/-1/);
});

test("inventory toolbar stacks below its action buttons on iPad-landscape width, not just phones", async () => {
  const css = await read("app/globals.css");
  // an iPad 7th-gen in landscape is about 1080px viewport / ~824px of main content once the sidebar is
  // subtracted; the old 760px breakpoint left the filter row squeezed against the add/view-toggle buttons at
  // that width and the wide 4-column toolbar grid (800px) didn't fit either, overlapping the หมวดหมู่ dropdown
  // with the buttons next to it
  assert.match(css, /@media\(max-width:1100px\)\{\.inventory-controls-row\{grid-template-columns:1fr\}/, "buttons move below the toolbar with room to spare on a tablet, not just a phone");
  assert.match(css, /@media\(max-width:1100px\)\{\.inventory-toolbar\{grid-template-columns:minmax\(220px,1fr\) repeat\(3,minmax\(130px,160px\)\)\}\}/, "once stacked, the toolbar also switches to its narrower column set - the wide one alone still doesn't fit an iPad's available width");
  assert.doesNotMatch(css, /max-width:760px\)\{\.inventory-controls-row\{grid-template-columns:1fr\}/, "the old, too-narrow breakpoint is gone, not just duplicated");
});

test("cashiers never see product cost, on the PO page or over the network", async () => {
  const dataRoute = await read("app/api/data/route.ts");
  const po = await read("app/purchase-orders.tsx");

  // server: cost/total are nulled for anyone without owner access, the same way products.cost and receipts.cost
  // already are - so a cashier session never receives the figures at all, not just a UI that hides them
  const getBlock = dataRoute.slice(dataRoute.indexOf("export async function GET"), dataRoute.indexOf("export async function POST"));
  assert.match(getBlock, /poTotal=isOwner\?'total':'NULL as total'/);
  assert.match(getBlock, /SELECT id,date,supplier_id,note,evidence,\$\{poTotal\},status,created_by,created,updated,approved_by,approved_at,paid_at,received_at,COALESCE\(to_jsonb\(purchase_orders\)->>'payment_method','transfer'\) AS payment_method,COALESCE\(to_jsonb\(purchase_orders\)->>'creditor',''\) AS creditor,to_jsonb\(purchase_orders\)->>'due_date' AS due_date FROM purchase_orders/);
  assert.match(getBlock, /SELECT id,purchase_order_id,product_id,name,qty,\$\{cost\},to_jsonb\(purchase_order_items\)->>'price' AS price FROM purchase_order_items/);
  assert.doesNotMatch(getBlock, /SELECT \* FROM purchase_orders/);
  assert.doesNotMatch(getBlock, /SELECT \* FROM purchase_order_items/);

  // server: saving a draft never trusts a submitted cost from a non-owner - it keeps whatever is already stored
  // for a product already on the PO (a cashier's form only ever shows blank costs, so trusting it would silently
  // zero out costs the owner had entered), and only a genuinely new line item defaults to 0
  const saveAction = dataRoute.slice(dataRoute.indexOf("action==='purchaseOrderSave'"), dataRoute.indexOf("else if(action==='purchaseOrderStatus')"));
  assert.match(saveAction, /oldCostByProduct:any=!isOwner&&existing\?Object\.fromEntries\(\(await all\('SELECT product_id,cost FROM purchase_order_items WHERE purchase_order_id=\?',poId\)\)/);
  assert.match(saveAction, /const itemCost=isOwner\?money\(x\.cost\):\(oldCostByProduct\[product\.id\]\?\?0\);/);

  // client: every cost/total display in the PO editor and history is owner-gated
  assert.match(po, /<\/div>\{owner&&<strong>฿\{money\(total\)\}<\/strong>\}<\/header>/, "editor header total");
  assert.match(po, /\{owner&&<input type="number" min="0" step="0\.01" placeholder="ต้นทุน \(ไม่บังคับ\)"/, "new-product mini-form cost field");
  assert.match(po, /\{owner&&<label><span>ต้นทุน\/ชิ้น<\/span><input type="number" min="0" step="0\.01" value=\{item\.cost\}/, "per-item cost input");
  assert.match(po, /\{owner&&<strong>฿\{money\(Number\(item\.qty\|\|0\)\*Math\.round\(Number\(item\.cost\|\|0\)\*100\)\)\}<\/strong>\}/, "per-item line total");
  assert.match(po, /<footer className="po-editor-footer">\{owner&&<div><span>ยอดรวมใบ PO<\/span>/, "footer total");
  assert.match(po, /\{owner&&<strong>฿\{money\(order\.total\)\}<\/strong>\}<div className="po-card-actions">/, "list card total");
  assert.match(po, /<th>จำนวน<\/th>\{owner&&<><th>ต้นทุน\/ชิ้น<\/th><th>รวม<\/th><\/>\}/, "detail table columns");
  assert.match(po, /<span>\{group\.length\} ใบ\{owner&&`/, "date-group heading total");
  // editing an existing draft reads a masked (null) cost safely, same null-guard addProduct() already uses
  assert.match(po, /cost:x\.cost==null\?'':x\.cost\/100/);
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
  assert.match(dataRoute, /transitions:any=\{pending_approval:\['approved'\],approved:credit\?\['received','paid'\]:\['paid'\],paid:\['received'\]\}/, "transfer: approved -> paid -> received; credit may receive first");
  assert.match(dataRoute, /action==='purchaseOrderStatus'\)\{owner\(me\)/);
  assert.match(dataRoute, /targetStatus==='approved'\)owner\(me\)/);
  assert.match(dataRoute, /UPDATE products SET stock=stock\+\?,\$\{averaged\}/);
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
  assert.match(route, /JSON\.stringify\(photos\),amount,'รอขึ้นเอ็น',0,me\.id,stringer\.id,now\(\),existingLineUser\]/);
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
  // the INSERT's column/value lists are built dynamically (cols/vals) so reward_used/reward_discount and the
  // optional pickup_at can each be added independently, without a combinatorial set of hardcoded literal inserts
  assert.match(job, /const cols=\['id','token','customer','phone','racket','product_id','tension','condition','note','photos','amount','status','paid','staff_id','stringer_id','created','line_user'\];/);
  assert.match(job, /vals=\[id,token,str\(b\.customer\),str\(b\.phone,30\),str\(b\.racket\),p\.id,str\(b\.tension,50\),String\(b\.condition\|\|''\)\.trim\(\)\.slice\(0,2000\),String\(b\.note\|\|''\)\.slice\(0,2000\),JSON\.stringify\(photos\),amount,'รอขึ้นเอ็น',0,me\.id,stringer\.id,now\(\),existingLineUser\];/);
  assert.match(job, /statements\.push\(q\(`INSERT INTO jobs\(\$\{cols\.join\(','\)\}\) VALUES\(\$\{cols\.map\(\(\)=>'\?'\)\.join\(','\)\}\)`,\.\.\.vals\)\);/, "carried over on the reward-redemption insert too, since cols/vals are shared");
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
  assert.match(css, /\.job-fields\{display:grid;grid-template-columns:repeat\(12,minmax\(0,1fr\)\);/, "the grouped-sections grid, not a flat two-column one");
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
  const track = await readTrackApi();
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

test("member stars: one per paid job or linked POS bill; redeeming EITHER of the two reward tiers resets the count", async t => {
  let customers;
  try { customers = await import("../lib/customers.ts"); }
  catch { t.skip("this Node version cannot import .ts files directly"); return; }
  const paid = (i, extra = {}) => ({ id: "j" + i, customer: "สมชาย", phone: "081-234-5678", racket: "R", tension: "25", created: `2026-09-${String(10 + i).padStart(2, "0")}T10:00:00Z`, status: "คืนไม้แล้ว", paid: 1, amount: 40000, reward_used: 0, ...extra });
  const jobs = [paid(1), paid(2), paid(3), paid(4), paid(5), paid(6, { paid: 0, status: "รอขึ้นเอ็น" })];
  let [c] = customers.buildCustomers(jobs, { stampsRequired: 4, socksStampsRequired: 2 });
  assert.equal(c.visits, 6);
  assert.equal(c.stars, 5, "the unpaid job has no star yet");
  assert.equal(c.socksNeed, 2);
  assert.equal(c.stringNeed, 4);
  assert.equal(c.socksAvailable, true);
  assert.equal(c.stringAvailable, true, "5 >= 4, so both tiers are available at once");
  assert.equal(c.stringUsed, 0);
  assert.equal(c.socksUsed, 0);
  // redeeming the string reward: the free job (reward_used) does not earn a star, consumes the reward, and resets
  // the whole star count to zero - not just a decrement by stringNeed
  [c] = customers.buildCustomers([...jobs, paid(7, { reward_used: 1, amount: 0, created: "2026-09-25T10:00:00Z" })], { stampsRequired: 4, socksStampsRequired: 2 });
  assert.equal(c.stars, 0);
  assert.equal(c.stringUsed, 1);
  assert.equal(c.stringAvailable, false);
  assert.equal(c.socksAvailable, false, "redeeming EITHER tier resets both, even though socks wasn't the one used");
  // a visit after the reset only counts stars earned since then, not the whole history again
  [c] = customers.buildCustomers([...jobs, paid(7, { reward_used: 1, amount: 0, created: "2026-09-25T10:00:00Z" }), paid(8, { created: "2026-09-26T10:00:00Z" })], { stampsRequired: 4, socksStampsRequired: 2 });
  assert.equal(c.stars, 1, "one visit after the reset, not 6");
  // a cancelled free job gives the reward back (skipped entirely, same as before this feature existed)
  [c] = customers.buildCustomers([...jobs, paid(7, { reward_used: 1, amount: 0, status: "ยกเลิก" })], { stampsRequired: 4, socksStampsRequired: 2 });
  assert.equal(c.stringAvailable, true);
  // redeeming the SOCKS reward (a sale with SOCK_REWARD_REASON) also resets the shared count
  const sockSale = { id: "sock1", created: "2026-09-25T10:00:00Z", total: 0, customer_key: "0812345678", status: "active", discount_reason: customers.SOCK_REWARD_REASON };
  [c] = customers.buildCustomers(jobs, { stampsRequired: 4, socksStampsRequired: 2, sales: [sockSale] });
  assert.equal(c.stars, 0);
  assert.equal(c.socksUsed, 1);
  assert.equal(c.socksAvailable, false);
  assert.equal(c.stringAvailable, false);
  // POS bills linked to the member count towards spend and stars; voided ones are ignored; the socks-reward sale
  // itself is never counted as a NEW star even when member_pos_min_amount is 0
  const sales = [{ id: "s1", created: "2026-09-20T10:00:00Z", total: 129000, customer_key: "0812345678", status: "active" }, { id: "s2", created: "2026-09-21T10:00:00Z", total: 5000, customer_key: "0812345678", status: "voided" }, sockSale];
  [c] = customers.buildCustomers(jobs, { stampsRequired: 4, socksStampsRequired: 2, sales });
  assert.equal(c.sales.length, 2, "the voided sale never entered the customer's own list");
  assert.equal(c.spent, 5 * 40000 + 129000, "spend still counts the socks giveaway's ฿0 total and the voided sale is excluded");
  assert.equal(c.stars, 0, "reset by the socks redemption; the POS bill happened before it so doesn't count again");
  assert.equal(c.posStamps, 1, "lifetime totals are unaffected by the reset");
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
  const rewardLib = await read("lib/member-reward.ts");
  assert.match(job, /if\(Number\(stat\.stars\)<\(Number\(config\.member_stamps_required\)\|\|10\)\)throw new Error\('ลูกค้ายังไม่มีสิทธิ์ขึ้นเอ็นฟรี'\)/, "server re-checks the star count against the string threshold");
  assert.match(rewardLib, /const sinceSql = `GREATEST\(COALESCE\(\(SELECT MAX\(created\) FROM jobs WHERE .* AND reward_used=1\),'1900-01-01'\),COALESCE\(\(SELECT MAX\(created\) FROM sales WHERE .* AND discount_reason=\?\),'1900-01-01'\)\)`;/, "the most recent redemption of EITHER reward tier");
  assert.match(rewardLib, /WHERE e\.created>\$\{sinceSql\}\)/, "stars only count what was earned since that reset point, not a lifetime floor division");
  assert.match(rewardLib, /paid=1 AND reward_used=0/);
  assert.match(job, /if\(b\.useReward\)\{cols\.push\('reward_used','reward_discount'\);vals\.push\(1,rewardDiscount\);\}/, "new columns only used when a reward is redeemed");
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
  assert.deepEqual([withManual[0].visits, withManual[0].stamps, withManual[0].stars, withManual[0].stringAvailable, withManual[0].socksAvailable], [0, 0, 0, false, false], "a manually added member starts with no history");
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
  const trackRoute = await readTrackApi();
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
  assert.match(trackRoute, /bank=payable&&j\.amount>0\?\{name:config\?\.bank_name/);

  // the tracking page: a pay button reveals the QR + upload, and shows a persisted "already sent" state
  assert.match(page, /function PaySection/);
  assert.match(page, /if\(job\.paid\|\|job\.status==='ยกเลิก'\|\|!\(job\.amount>0\)\)return null/);
  assert.match(page, /if\(job\.slipUploaded\)return.*ส่งสลิปแล้ว/);
  assert.match(page, /fetch\('\/api\/track\/'\+token\+'\/slip'/);
  assert.match(page, /qrSrc="\/api\/track\/bank-qr"/);

  // staff side: the main jobs query also reads reward_used (a stamp-card display bug - it was missing entirely,
  // so "available" free rewards never accounted for ones already used) and the same defensive slip column
  assert.match(dataRoute, /status,paid,staff_id,stringer_id,created,completed,returned,notify,reward_used,reward_discount,to_jsonb\(jobs\)->>'slip' AS slip,to_jsonb\(jobs\)->>'pickup_at' AS pickup_at,to_jsonb\(jobs\)->>'customer_string' AS customer_string FROM jobs/);
  assert.match(pos, /\{!j\.paid&&j\.slip&&<span className="badge amber slip-badge" role="button"/);
  assert.match(pos, /if\(selected\.slip\)setMethod\('โอนเงิน'\);open\('payJob',\{id:selected\.id,slip:selected\.slip\}\)/);
  assert.match(pos, /modal==='payJob'&&selected\?\.slip&&form\.slip===selected\.slip\?<div className="notice customer-slip">/);
  assert.match(css, /\.pay-cta\{/);
});

test("tracking page shows the customer's own stamp progress and reward", async () => {
  const route = await readTrackApi();
  const page = await read("app/track/[token]/page.tsx");
  const css = await read("app/globals.css");
  assert.match(route, /import \{rewardDiscount\} from '@\/lib\/customers';/);
  assert.match(route, /import \{DEFAULT_SOCKS_STAMPS_REQUIRED,DEFAULT_STAMPS_REQUIRED,buildCustomers,promoOf,promoPhase\} from '\.\/customers';/);
  assert.match(route, /if\(!\('member_stamps_required' in config\)\)return null/, "works before the members migration is run");
  assert.match(route, /regexp_replace\(phone,'\\\\D','','g'\)=\?",key\)/, "matches the same phone-digits key used everywhere else");
  assert.match(route, /FROM sales WHERE customer_key=\?/);
  assert.doesNotMatch(route, /customer_notes|\.note\b/, "the staff-only customer note is never sent to the public tracking page");
  assert.match(route, /rewardCap:config\.member_reward_cap\?\?null/);
  assert.match(page, /function MemberStamps\(/);
  assert.match(page, /job\.status!=='ยกเลิก'&&<MemberStamps member=\{job\.member\} reward=/, "hidden once the job is cancelled");
  assert.match(page, /stringAvailable\?<span>🎁 <b>คุณมีสิทธิ์ขึ้นเอ็นฟรี!<\/b>/);
  assert.match(page, /cap===null\|\|cap===undefined\?'ฟรีค่าขึ้นเอ็นทั้งหมด'/);
  assert.match(route, /socksAvailable:customer\.socksAvailable&&!!program!\.socksProductName/, "the socks tier stays off until an owner has actually picked a product for it");
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

test("member stamp promotion has an optional date window and an on/off switch", async () => {
  const migration = await read("supabase/migrations/20260923010000_member_promo_window.sql");
  const dataRoute = await read("app/api/data/route.ts");
  const trackRoute = await readTrackApi();
  const membersPage = await read("app/members-page.tsx");
  const settings = await read("app/shop-settings.tsx");

  assert.match(migration, /add column if not exists member_promo_enabled smallint not null default 1/, "defaults to on, so an untouched shop keeps earning stamps exactly as before");
  assert.match(migration, /add column if not exists member_promo_start text/);
  assert.match(migration, /add column if not exists member_promo_end text/);

  // server: the reward-eligibility count is date/enabled-filtered the same way the display logic is
  // (the count lives in lib/member-reward.ts, shared by staff intake and the customer's own redeem)
  const rewardLib = await read("lib/member-reward.ts");
  assert.match(rewardLib, /promoOn = !\('member_promo_enabled' in config\) \|\| config\.member_promo_enabled !== 0/, "the column may not exist yet (migration not run) - treated as on, not a hard failure");
  assert.match(rewardLib, /dateFilter = promoOn \? "AND created>=COALESCE\(\?,'0000-01-01'\) AND created<=COALESCE\(\?,'9999-12-31'\)" : 'AND 1=0'/);
  assert.match(rewardLib, /\$\{dateFilter\} UNION ALL SELECT created FROM sales/, "the same window applies to both the job and the POS-bill half of the star count");
  assert.match(dataRoute, /const stars=starsSql\(config,digits\),stat:any=await one\(`SELECT \$\{stars\.sql\} AS stars`,\.\.\.stars\.args\)/);

  // server: settings validates the date format and that start doesn't come after end
  const settingsAction = dataRoute.slice(dataRoute.indexOf("action==='settings'"), dataRoute.indexOf("else if(action==='expense')"));
  assert.match(settingsAction, /if\(b\.memberPromoEnabled!==undefined\)sets\.push\(\['member_promo_enabled',b\.memberPromoEnabled\?1:0\]\)/);
  assert.match(settingsAction, /if\(!\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(t\)\)throw new Error\(label\+'ไม่ถูกต้อง'\)/);
  assert.match(settingsAction, /if\(newStart&&newEnd&&newStart>newEnd\)throw new Error\('วันที่เริ่มโปรโมชั่นต้องมาก่อนวันที่สิ้นสุด'\)/);

  // client: lib/customers.ts's pure withinPromo() is what both buildCustomers() and the tracking page's own
  // memberStatus() rely on, so the two can never disagree about whether a given visit counted
  assert.match(trackRoute, /const promo=promoOf\(config\);/);
  assert.match(trackRoute, /promo\}\);/);
  assert.match(membersPage, /promo:promoOf\(config\)/);

  // settings screen: the toggle and the two (optional) date fields
  assert.match(settings, /payload\.memberPromoEnabled=form\.memberPromoEnabled\?\?!!config\.member_promo_enabled/);
  assert.match(settings, /<Switch disabled=\{!\('member_promo_enabled' in config\)\} checked=\{form\.memberPromoEnabled\?\?!!config\.member_promo_enabled\}/);
  assert.match(settings, /type="date"[^>]*value=\{form\.memberPromoStart\?\?\(config\.member_promo_start\|\|''\)\}/);
  assert.match(settings, /type="date"[^>]*value=\{form\.memberPromoEnd\?\?\(config\.member_promo_end\|\|''\)\}/);

  let customers;
  try { customers = await import("../lib/customers.ts"); }
  catch { return; }
  const { withinPromo, buildCustomers, billEarnsStamp } = customers;
  // withinPromo: the pure rule powering all of the above
  assert.equal(withinPromo("2026-11-01", null), true, "unconfigured (no promo object at all) is unrestricted");
  assert.equal(withinPromo("2026-11-01", { enabled: false }), false, "the switch alone stops it, dates or not");
  assert.equal(withinPromo("2026-11-01", { enabled: true, start: "2026-10-01", end: "2026-12-31" }), true);
  assert.equal(withinPromo("2026-09-30", { enabled: true, start: "2026-10-01", end: "2026-12-31" }), false, "before the window");
  assert.equal(withinPromo("2027-01-01", { enabled: true, start: "2026-10-01", end: "2026-12-31" }), false, "after the window");
  assert.equal(withinPromo("2026-11-01", { enabled: true, start: null, end: null }), true, "on with no dates set = unrestricted");

  // buildCustomers: a job outside the window earns no stamp, but reward_used (already redeemed) is untouched by it
  const job1 = { customer: "สมชาย", phone: "0812345678", racket: "R", created: "2026-09-01T00:00:00Z", status: "คืนไม้แล้ว", paid: 1, amount: 40000 };
  const job2 = { customer: "สมชาย", phone: "0812345678", racket: "R", created: "2026-11-01T00:00:00Z", status: "คืนไม้แล้ว", paid: 1, amount: 40000 };
  const promo = { enabled: true, start: "2026-10-01", end: "2026-12-31" };
  const [outside] = buildCustomers([job1], { promo });
  assert.equal(outside.stamps, 0, "a visit before the promo window earns nothing");
  const [inside] = buildCustomers([job2], { promo });
  assert.equal(inside.stamps, 1, "a visit inside the window still earns a stamp");
  const [unconfigured] = buildCustomers([job1], {});
  assert.equal(unconfigured.stamps, 1, "no promo passed at all: unrestricted, same as before this feature existed");

  // billEarnsStamp: same rule, same default
  const bill = (created) => ({ customer_key: "0812345678", status: "active", job_id: null, total: 50000, created });
  assert.equal(billEarnsStamp(bill("2026-09-01"), 0, promo), false);
  assert.equal(billEarnsStamp(bill("2026-11-01"), 0, promo), true);
  assert.equal(billEarnsStamp(bill("2026-09-01"), 0), true, "no promo argument: unrestricted (back-compat default)");
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
  assert.match(await read("lib/member-reward.ts"), /SELECT created FROM sales WHERE customer_key=\? AND status='active' AND job_id IS NULL AND total>=\? AND COALESCE\(discount_reason,''\)<>\?/, "the server counts POS stamps for the reward - excluding the socks-reward giveaway sale itself");
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

test("POS search box reclaims focus after adding a product, so a barcode gun still works after a manual tap", async () => {
  const pos = await read("app/pos.tsx");
  // a Bluetooth/USB scanner is just a keyboard: its keystrokes go wherever focus currently is. Tapping a product
  // card moves focus onto that card's button, so without reclaiming it, a scan right after would land nowhere.
  assert.match(pos, /searchInputRef=useRef<HTMLInputElement>\(null\)/);
  assert.match(pos, /ref=\{searchInputRef\} autoFocus placeholder="ค้นหาชื่อสินค้า หรือสแกนบาร์โค้ด…"/);
  const addFn = pos.slice(pos.indexOf("function add(p:any){"), pos.indexOf("function newScannedProduct"));
  assert.match(addFn, /setTimeout\(\(\)=>searchInputRef\.current\?\.focus\(\),0\)/, "deferred a tick so it doesn't also pop the on-screen keyboard on every tap");
});

test("catalog and cart stay side by side from iPad-landscape width up, not only on a full desktop", async () => {
  const pos = await read("app/pos.tsx");
  const css = await read("app/globals.css");
  assert.match(pos, /useNarrowRegister\(\)\{[\s\S]*?matchMedia\('\(max-width:999px\)'\)/);
  assert.match(css, /@media\(min-width:1000px\)\{\s*\.register-toolbar>\[data-slot=tabs\]\{display:none\}/);
  assert.match(css, /@media\(min-width:1000px\)\{\.register-main \.register-toolbar\{display:none\}\}/);
  assert.doesNotMatch(css, /min-width:1200px/, "the old, too-narrow-for-an-iPad breakpoint is gone, not just duplicated");
});

test("เอ็น field is a search box, not a dropdown, so a hardware barcode scanner (types + Enter) picks it too", async () => {
  const form = await read("app/job-form.tsx");
  const css = await read("app/globals.css");
  assert.match(form, /function StringInput\(\{value,onChange,products\}/);
  assert.doesNotMatch(form, /<Choice value=\{form\.productId\}/, "no longer a dropdown");
  assert.match(form, /<StringInput value=\{form\.productId\} onChange=\{\(v:string\)=>setForm\(\{\.\.\.form,productId:v,amount:\(products\.find/);
  // typing filters by name or barcode/scan_code, restricted to actual strings
  assert.match(form, /strings=useMemo\(\(\)=>products\.filter\(\(p:any\)=>p\.category==='เอ็นแบดมินตัน'\)/);
  assert.match(form, /p\.name\.toLowerCase\(\)\.includes\(text\)\|\|\(p\.barcode\|\|''\)\.includes\(text\)\|\|\(p\.scan_code\|\|''\)\.includes\(text\)/);
  // Enter: an exact barcode/scan_code match wins outright; otherwise a single filtered match is accepted
  assert.match(form, /if\(e\.key==='Enter'\)\{e\.preventDefault\(\);const code=query\.trim\(\),byCode=strings\.find\(\(p:any\)=>p\.barcode===code\|\|p\.scan_code===code\);if\(byCode\)pick\(byCode\);else if\(matches\.length===1\)pick\(matches\[0\]\)\}/);
  // the field re-syncs its displayed text whenever productId changes from elsewhere (e.g. the camera-scan button)
  assert.match(form, /useEffect\(\(\)=>\{setQuery\(selected\?\.name\|\|''\)\},\[value\]\)/);
  assert.match(css, /\.with-scan \.suggest-wrap\{flex:1;min-width:0\}/);
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
  assert.match(pos, /useNarrowRegister\(\)\{[\s\S]*?matchMedia\('\(max-width:999px\)'\)/);
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
  assert.match(pos, /ดูสลิปที่ลูกค้าแนบ<\/button>/, "opens as a popup (Lightbox) instead of a new tab, so the arrow that implied leaving the page is gone");
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

test("inventory list on iPad/tablet and phones: one short line per product, details behind a toggle", async () => {
  const pos = await read("app/pos.tsx");
  const css = await read("app/globals.css");
  for (const cls of ["inv-sel", "inv-product", "inv-meta inv-code", "inv-meta inv-price", "inv-meta inv-stock", "inv-meta inv-cat", "inv-status", "inv-actions"]) assert.match(pos, new RegExp(`<td className="${cls}"`), cls);
  assert.match(pos, /\{owner&&<td className="inv-meta inv-cost" data-label="ทุน">/, "cost stays owner-only");
  assert.match(pos, /<td className="inv-actions"><div className="inventory-row-actions"><button type="button" className="inventory-more-toggle" aria-expanded=\{inventoryOpen\.includes\(p\.id\)\}/, "toggle lives in the existing actions cell so desktop column counts (and nth-child widths) don't shift");
  assert.match(pos, /inventoryOpen\.includes\(p\.id\)\?' is-open':''/);
  assert.match(css, /^\.inventory-more-toggle\{display:none!important\}/m, "desktop table has no toggle");
  const tablet = css.slice(css.indexOf("@media(max-width:1100px){\n.inventory-list-panel,.inventory-table-wrap{overflow:visible!important}"));
  assert.match(tablet, /\.inventory-list-table,\.inventory-list-table thead,\.inventory-list-table tbody\{display:block;width:100%;min-width:0!important/, "overrides the 980px min-width that forced sideways scrolling");
  assert.match(tablet, /td\.inv-code,\.inventory-list-table td\.inv-cost,\.inventory-list-table td\.inv-cat\{order:8;display:none\}/, "code, cost and category are hidden until opened");
  assert.match(tablet, /tr\.is-open td\.inv-code,\.inventory-list-table tr\.is-open td\.inv-cost,\.inventory-list-table tr\.is-open td\.inv-cat\{display:flex/);
  assert.match(tablet, /td\.inv-status\{order:4;width:78px!important;min-width:0!important/, "the old 150px nth-last-child(3) min-width must not push the badge onto its own line");
  assert.match(css, /\.inventory-list-panel\{container:invlist\/inline-size\}/);
  assert.match(css, /@container invlist \(max-width:640px\)\{/, "two-line layout follows the list's own width (portrait iPad with the sidebar open), not the viewport");
  assert.match(css, /@container invcontrols \(max-width:640px\)\{\.inventory-toolbar\{grid-template-columns:1fr 1fr\}/, "the filter bar no longer pushes the last dropdown out of the frame");
  assert.match(tablet, /tbody tr:has\(\.inventory-row-menu\)\{z-index:100\}/, "the row menu stays above the next row");
});

test("customers redeem a free stringing themselves on the tracking page; the reward is booked as a POS discount", async () => {
  const redeem = await read("app/api/track/[token]/redeem/route.ts");
  const trackApi = await readTrackApi();
  const trackPage = await read("app/track/[token]/page.tsx");
  const dataRoute = await read("app/api/data/route.ts");
  const pos = await read("app/pos.tsx");
  const backfill = await read("supabase/migrations/20260923020000_reward_discount_backfill.sql");
  // redeem: same-origin, token-scoped, entitlement re-checked inside the UPDATE under a per-phone lock
  assert.match(redeem, /req\.headers\.get\('origin'\)!==new URL\(req\.url\)\.origin/);
  assert.match(redeem, /pg_advisory_xact_lock\(hashtext\(\?\)\)'\)\.bind\('member-reward:'\+digits\)/, "a double tap or two jobs at once can't spend one reward twice");
  assert.match(redeem, /UPDATE jobs SET reward_used=1,reward_discount=\?,amount=amount-\?.* WHERE token=\? AND paid=0 AND reward_used=0 AND status<>'ยกเลิก' AND amount=\? AND to_jsonb\(jobs\)->>'slip' IS NULL AND \$\{stars\.sql\}>=\? RETURNING id/, "gated on the shared star count meeting the string threshold");
  assert.match(redeem, /rewardDiscount\(job\.amount,config\.member_reward_cap\)/, "same cap as staff intake");
  // tracking API + page
  assert.match(trackApi, /canRedeem=payable&&!rewardUsed&&!j\.slip&&j\.amount>0&&!!member\?\.stringAvailable/);
  assert.match(trackPage, /fetch\('\/api\/track\/'\+token\+'\/redeem',\{method:'POST'\}\)/);
  assert.match(trackPage, /reward\?\.canRedeem&&\(!confirmString\?<button type="button" className="redeem-cta" onClick=\{\(\)=>setConfirmString\(true\)\}/, "a confirm step before spending the reward");
  assert.match(trackPage, /if\(job\.paid\|\|job\.status==='ยกเลิก'\|\|!\(job\.amount>0\)\)return null;/, "no pay button once the job is free");
  // POS: the waived amount is the bill's discount, the item keeps its list price with a line discount
  assert.match(dataRoute, /const rewardOffAmount=j\.reward_used===1\?Number\(j\.reward_discount\)\|\|0:0;/);
  assert.match(dataRoute, /INSERT INTO sales\(id,staff_id,created,total,discount,discount_reason,method,slip,job_id\) VALUES\(\?,\?,\?,\?,\?,\?,\?,\?,\?\)',id,me\.id,now\(\),j\.amount,rewardOffAmount,rewardOffAmount\?REWARD_REASON:''/);
  assert.match(dataRoute, /'เอ็นแบดมินตัน',j\.amount\+rewardOffAmount,p\.price,j\.amount,p\.cost,.*,rewardOffAmount\)/);
  assert.match(dataRoute, /notify,reward_used,reward_discount,to_jsonb\(jobs\)->>'slip' AS slip,to_jsonb\(jobs\)->>'pickup_at' AS pickup_at,to_jsonb\(jobs\)->>'customer_string' AS customer_string FROM jobs/);
  assert.match(pos, /rewardSales=sales\.filter\(\(x:any\)=>x\.discount_reason===REWARD_REASON\)/, "dashboard totals what rewards cost the shop");
  assert.match(pos, /\{selected\.reward_used===1&&<div className="reward-notice">/, "staff see the reward on the job");
  // backfill for bills paid before this change: idempotent, only untouched bills
  assert.match(backfill, /and s\.discount = 0 and i\.line_discount = 0;/);
  assert.match(backfill, /discount_reason = 'สิทธิ์สมาชิก: ขึ้นเอ็นฟรี'/);
  assert.ok(backfill.indexOf("update public.items") < backfill.indexOf("update public.sales"), "items first - it keys off sales.discount still being 0");
});

test("stock-count history opens a round's items right under its own row, not at the end of the list", async () => {
  const page = await read("app/stock-count.tsx");
  const css = await read("app/globals.css");
  assert.match(page, /if\(detail\?\.id===id\)\{setDetail\(null\);return\}/, "tapping the same round again hides it");
  assert.match(page, /setDetail\(\(x:any\)=>x\?\.id===id\?\{id,\.\.\.d\}:x\)/, "a slow response for a round that was since closed/switched doesn't overwrite the current one");
  assert.match(page, /\{detail\?\.id===h\.id&&<div className="count-detail">.*<\/div>\}<\/li>\}\)\}<\/ul>/s, "rendered inside the row's <li>");
  assert.doesNotMatch(page, /<h3>\{detail\.session\.name\}<\/h3>/, "the ambiguous repeated name heading is gone");
  assert.match(css, /\.count-history li>\.count-detail\{flex:1 1 100%;min-width:0;max-width:100%/);
});

test("job intake: the free-text note is gone, replaced by an optional pickup date/time (native mobile wheel picker)", async () => {
  const form = await read("app/job-form.tsx");
  const pos = await read("app/pos.tsx");
  const route = await read("app/api/data/route.ts");
  const migration = await read("supabase/migrations/20260923030000_job_pickup_at.sql");
  const css = await read("app/globals.css");
  assert.doesNotMatch(form, /label="หมายเหตุ"/, "the free-text note input is removed from the intake form");
  assert.match(form, /<Field className="f-narrow" label="วันเวลาที่นัดรับ \(ถ้าทราบ\)"><input type="datetime-local" min=\{nowLocal\(\)\} value=\{form\.pickupAt\|\|''\} onChange=\{e=>setForm\(\{\.\.\.form,pickupAt:e\.target\.value\}\)\}\/><\/Field>/, "datetime-local renders as a native wheel picker on iOS/Android - no custom widget needed");
  assert.match(form, /min=\{nowLocal\(\)\}/, "can't pick a pickup time in the past");
  assert.doesNotMatch(form, /form\.note/, "no longer reads/writes a note field");
  // server: defensive since the migration may not have run yet - job creation must never break because of this
  const job = route.slice(route.indexOf("else if(action==='job')"), route.indexOf("else if(action==='payJob')"));
  assert.match(job, /const jobCols=await all\("SELECT column_name FROM information_schema\.columns WHERE table_schema='public' AND table_name='jobs' AND column_name IN \('pickup_at','customer_string'\)"\);/);
  assert.match(job, /hasPickup=jobCols\.some\(\(r:any\)=>r\.column_name==='pickup_at'\)/);
  assert.match(job, /pickupAt=hasPickup&&\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}T\\d\{2\}:\\d\{2\}\/\.test\(String\(b\.pickupAt\|\|''\)\)\?String\(b\.pickupAt\)\.slice\(0,16\):null;/, "malformed/missing input silently becomes null, never a thrown error");
  assert.match(job, /if\(hasPickup\)\{cols\.push\('pickup_at'\);vals\.push\(pickupAt\);\}/);
  // migration: plain text column, no timezone conversion (matches the other local date fields in this app)
  assert.match(migration, /alter table public\.jobs add column if not exists pickup_at text;/);
  // staff see it on the job card and in the job detail
  assert.match(pos, /\{j\.pickup_at&&<div className="job-pickup"><CalendarClock size=\{14\}\/>นัดรับ \{pickupText\(j\.pickup_at\)\}<\/div>\}/);
  assert.match(pos, /\{selected\.pickup_at&&<p className="job-pickup"><CalendarClock size=\{14\}\/> นัดรับ: \{pickupText\(selected\.pickup_at\)\}<\/p>\}/);
  assert.match(css, /\.job-pickup\{display:flex;align-items:center;gap:6px/);
});

test("tracking page's stamp card shows the promotion's stamping period, matching the shop's own promoPhase rule", async () => {
  const lib = await read("lib/customers.ts");
  const route = await readTrackApi();
  const page = await read("app/track/[token]/page.tsx");
  const css = await read("app/globals.css");
  const hours = await read("lib/shop-hours.ts");
  assert.match(hours, /export function bangkokToday\(date = new Date\(\)\) \{/);
  assert.match(hours, /date\.toLocaleDateString\("en-CA", \{ timeZone: "Asia\/Bangkok" \}\)/);
  assert.match(lib, /export type PromoPhase = "off" \| "before" \| "during" \| "after" \| null;/);
  assert.match(lib, /if \(!promo\) return null;/);
  assert.match(lib, /if \(promo\.enabled === false\) return "off";/);
  assert.match(lib, /if \(promo\.start && today < promo\.start\) return "before";/);
  assert.match(lib, /if \(promo\.end && today > promo\.end\) return "after";/);
  assert.match(lib, /return "during";/);
  assert.match(route, /import \{bangkokToday\} from '\.\/shop-hours';/);
  assert.match(route, /import \{DEFAULT_SOCKS_STAMPS_REQUIRED,DEFAULT_STAMPS_REQUIRED,buildCustomers,promoOf,promoPhase\} from '\.\/customers';/);
  assert.match(route, /const promo=promoOf\(config\);/);
  assert.match(route, /promo:\{phase:promoPhase\(promo,bangkokToday\(\)\),start:promo\?\.start\?\?null,end:promo\?\.end\?\?null\}/);
  // client: same phase-to-wording mapping for all five states, including the two "unbounded"/off cases that show nothing extra
  assert.match(page, /function promoNotice\(promo:\{phase:string\|null;start:string\|null;end:string\|null\}\|undefined\)\{/);
  assert.match(page, /if\(!promo\?\.phase\)return null;/);
  assert.match(page, /if\(phase==='off'\)return \{tone:'paused',text:'ปิดรับสะสมแต้มชั่วคราว · แต้มและสิทธิ์ที่มีอยู่ยังใช้ได้ตามปกติ'\};/);
  assert.match(page, /if\(phase==='after'\)return \{tone:'ended',text:`โปรโมชั่นสะสมแต้มสิ้นสุดแล้วเมื่อ \$\{thaiDay\(end!\)\} · แต้มและสิทธิ์ที่มีอยู่ยังใช้ได้ตามปกติ`\};/);
  assert.match(page, /if\(end\)return \{tone:'active',text:`สะสมแต้มได้ถึง \$\{thaiDay\(end\)\}`\};/, "an unbounded start-only or fully-open window shows nothing extra");
  assert.match(page, /\{promo&&<p className=\{'promo-window '\+promo\.tone\}>\{promo\.text\}<\/p>\}/);
  assert.match(css, /\.promo-window\.paused,\.promo-window\.ended\{padding:8px 11px;border-radius:10px;background:#f3f0e4;color:#8a6d1f\}/);
});

test("photos (job condition, a customer's uploaded slip, expense receipts) open in a popup instead of a new tab, everywhere in the app", async () => {
  const pos = await read("app/pos.tsx");
  const css = await read("app/globals.css");
  // no image link left opening in a new tab - only the unrelated Facebook/LINE external links remain
  const fileLinks = [...pos.matchAll(/<a[^>]*href=\{[^}]*api\/files[^}]*\}[^>]*target="_blank"/g)];
  assert.equal(fileLinks.length, 0, "every /api/files link that used to open in a new tab is now a popup trigger");
  assert.match(pos, /import \{createPortal\} from 'react-dom';/);
  assert.match(pos, /function PhotoThumb\(\{id,alt,onOpen\}:\{id:string;alt:string;onOpen:\(id:string\)=>void\}\)\{return <button type="button" className="photo-thumb" onClick=\{\(\)=>onOpen\(id\)\}/);
  // portaled to <body> and stops the click from reaching Radix's own "outside click closes the dialog" listener,
  // since a photo is usually opened from inside a Dialog (job detail, payment, expense gallery) and this popup is
  // a separate portal, not nested inside that Dialog's DOM
  assert.match(pos, /return createPortal\(<div className="lightbox-overlay" role="dialog" aria-modal="true" aria-label="ดูรูปขยาย" onPointerDownCapture=\{e=>e\.stopPropagation\(\)\}/);
  assert.match(pos, /,document\.body\);/);
  assert.match(pos, /window\.addEventListener\('keydown',onKey\);return\(\)=>window\.removeEventListener\('keydown',onKey\)/, "Escape closes it too");
  assert.match(pos, /\[lightbox,setLightbox\]=useState<string\|null>\(null\)/);
  assert.match(pos, /<Lightbox id=\{lightbox\} onClose=\{\(\)=>setLightbox\(null\)\}\/>/);
  // every former thumbnail/text-link site now routes through PhotoThumb/setLightbox
  assert.match(pos, /<PhotoThumb key=\{id\} id=\{id\} alt="สภาพไม้ก่อนขึ้นเอ็น" onOpen=\{setLightbox\}\/>/);
  assert.match(pos, /<PhotoThumb id=\{selected\.slip\} alt="สลิปโอนเงินจากลูกค้า" onOpen=\{setLightbox\}\/>/);
  assert.match(pos, /<PhotoThumb key=\{id\} id=\{id\} alt=\{'รูปแนบ '\+\(i\+1\)\} onOpen=\{setLightbox\}\/>/);
  assert.match(pos, /<PhotoThumb id=\{id\} alt="รูปแนบค่าใช้จ่าย" onOpen=\{setLightbox\}\/>/);
  for (const text of ["ดูสลิป", "ดูสลิปที่ลูกค้าแนบ"]) assert.match(pos, new RegExp(`className="text-button" onClick=\\{\\(\\)=>setLightbox\\(form\\.slip\\)\\}>${text}</button>`));
  // CSS: the overlay must explicitly re-enable pointer-events, since Radix sets body{pointer-events:none} while a
  // Dialog is open and this popup, as a plain body child, would otherwise inherit that and become unclickable
  assert.match(css, /\.lightbox-overlay\{[^}]*pointer-events:auto\}/);
  assert.match(css, /\.photo-thumb\{all:unset;cursor:pointer;/);
});

test("job intake: when the customer brings their own string (บริการขึ้นเอ็น), staff can note what it was", async () => {
  const form = await read("app/job-form.tsx");
  const route = await read("app/api/data/route.ts");
  const pos = await read("app/pos.tsx");
  const migration = await read("supabase/migrations/20260924010000_job_customer_string.sql");
  assert.match(migration, /alter table public\.jobs add column if not exists customer_string text;/);
  assert.match(form, /const isStringingService=\(p:any\)=>!!p\?\.name\?\.startsWith\('บริการขึ้นเอ็น'\);/, "matches both \"บริการขึ้นเอ็น\" and \"บริการขึ้นเอ็น 4 ปม\"");
  assert.match(form, /\{isStringingService\(products\.find\(\(p:any\)=>p\.id===form\.productId\)\)&&<Field className="f-full" label="ชื่อเอ็นที่ลูกค้านำมาเอง \(ไม่บังคับ\)">/, "hidden unless a stringing-service product is selected");
  assert.match(form, /maxLength=\{200\}.*value=\{form\.customerString\|\|''\} onChange=\{e=>setForm\(\{\.\.\.form,customerString:e\.target\.value\}\)\}/);
  // server: defensive since the migration may not have run yet, same pattern as pickup_at, combined into one query
  const job = route.slice(route.indexOf("else if(action==='job')"), route.indexOf("else if(action==='payJob')"));
  assert.match(job, /const jobCols=await all\("SELECT column_name FROM information_schema\.columns WHERE table_schema='public' AND table_name='jobs' AND column_name IN \('pickup_at','customer_string'\)"\);/);
  assert.match(job, /hasCustomerString=jobCols\.some\(\(r:any\)=>r\.column_name==='customer_string'\)/);
  assert.match(job, /if\(hasCustomerString\)\{cols\.push\('customer_string'\);vals\.push\(String\(b\.customerString\|\|''\)\.trim\(\)\.slice\(0,200\)\|\|null\);\}/);
  assert.match(route, /to_jsonb\(jobs\)->>'customer_string' AS customer_string FROM jobs/, "read defensively too, so the jobs list never errors before the migration runs");
  assert.match(pos, /\{selected\.customer_string&&<p>เอ็นที่ลูกค้านำมาเอง: \{selected\.customer_string\}<\/p>\}/, "staff see it later in the job detail");
});

test("second reward tier: 5 stars redeems free socks (a real POS discount), redeeming either tier resets the star count", async () => {
  const migration = await read("supabase/migrations/20260924030000_member_socks_reward.sql");
  const lib = await read("lib/customers.ts");
  const settings = await read("app/shop-settings.tsx");
  const dataRoute = await read("app/api/data/route.ts");
  const redeemSocks = await read("app/api/track/[token]/redeem-socks/route.ts");
  const trackApi = await readTrackApi();
  const trackPage = await read("app/track/[token]/page.tsx");
  const membersPage = await read("app/members-page.tsx");
  const pos = await read("app/pos.tsx");

  assert.match(migration, /add column if not exists member_socks_stamps_required integer not null default 5/);
  assert.match(migration, /add column if not exists member_socks_product_id text references public\.products\(id\);/);

  assert.match(lib, /export const SOCK_REWARD_REASON = "สิทธิ์สมาชิก: ถุงเท้าฟรี";/);
  assert.match(lib, /if \(sale\.discount_reason === SOCK_REWARD_REASON\) customer\.socksUsed \+= 1;/, "counted as a redemption, never as a new star");
  assert.match(lib, /const since = \[/, "the reset point is the most recent redemption of either tier");
  assert.match(lib, /customer\.socksAvailable = customer\.stars >= socksNeed;/);
  assert.match(lib, /customer\.stringAvailable = customer\.stars >= stringNeed;/);

  // settings: two new fields, and the panel stays off until BOTH the migration ran and a product is picked
  assert.match(settings, /if\('member_socks_stamps_required' in config\)\{[\s\S]{0,200}payload\.memberSocksProductId=form\.memberSocksProductId\?\?\(config\.member_socks_product_id\|\|''\);/);
  assert.match(settings, /const socksReady=ready&&'member_socks_stamps_required' in config;/);
  assert.match(settings, /<select value=\{form\.memberSocksProductId\?\?\(config\.member_socks_product_id\|\|''\)\}/);
  const settingsAction = dataRoute.slice(dataRoute.indexOf("action==='settings'"), dataRoute.indexOf("else if(action==='expense')"));
  assert.match(settingsAction, /if\(!Number\.isFinite\(n\)\|\|n<1\|\|n>100\)throw new Error\('จำนวนครั้งที่ครบสิทธิ์ถุงเท้าต้องอยู่ระหว่าง 1–100'\)/);
  assert.match(settingsAction, /const p=await one\('SELECT id FROM products WHERE id=\? AND active=1',b\.memberSocksProductId\);if\(!p\)throw new Error\('ไม่พบสินค้าที่เลือกเป็นของรางวัลถุงเท้า'\)/, "the chosen product must actually exist and be active");

  // staff job-intake still redeems only the string tier, gated on the shared star count meeting stringNeed, with
  // an advisory lock now too (three redemption paths share one star pool and must serialize against each other)
  const job = dataRoute.slice(dataRoute.indexOf("else if(action==='job')"), dataRoute.indexOf("else if(action==='payJob')"));
  assert.match(job, /statements\.push\(q\('SELECT pg_advisory_xact_lock\(hashtext\(\?\)\)','member-reward:'\+digits\)\);/);

  // the new customer-facing redeem-socks endpoint: same-origin, token-scoped, gated by an INSERT...SELECT...WHERE
  // (mirrors /redeem's gated UPDATE) under the SAME per-phone lock, a real stock decrement and a real cost
  assert.match(redeemSocks, /req\.headers\.get\('origin'\)!==new URL\(req\.url\)\.origin/);
  assert.match(redeemSocks, /pg_advisory_xact_lock\(hashtext\(\?\)\)'\)\.bind\('member-reward:'\+digits\)/, "same lock name as /redeem and job intake - one shared star pool");
  assert.match(redeemSocks, /INSERT INTO sales\(id,staff_id,created,total,discount,discount_reason,method,customer_key,customer_name\) SELECT \?,\?,\?,0,\?,\?,'สิทธิ์สมาชิก',\?,\? WHERE \$\{stars\.sql\}>=\? RETURNING id/, "total is really 0 baht, the listed price is booked as the discount");
  assert.match(redeemSocks, /INSERT INTO items\(id,sale_id,product_id,name,category,qty,price,original,net,cost,note,line_discount\) VALUES\(\?,\?,\?,\?,\?,1,\?,\?,0,\?,\?,\?\)/, "real cost recorded, net is 0");
  assert.match(redeemSocks, /UPDATE products SET stock=stock-1 WHERE id=\?/, "a real stock decrement, not just a marker");
  assert.match(redeemSocks, /if\(String\(e\.message\|\|''\)\.includes\('foreign key'\)\)return \[\];/, "0 rows from the gated insert makes the dependent items insert fail its FK, aborting the whole batch atomically");
  assert.match(redeemSocks, /job\.staff_id/, "attributed to the job's own staff (a customer isn't a member), same reason the uploaded slip is");

  // tracking API + page: the socks tier stays hidden unless a product is actually configured, and both CTAs can
  // show at once (10 stars qualifies for both, since redeeming either resets both)
  assert.match(trackApi, /const socksProduct=config\.member_socks_product_id\?await one\('SELECT name FROM products WHERE id=\? AND active=1',config\.member_socks_product_id\):null;/);
  assert.match(trackPage, /fetch\('\/api\/track\/'\+token\+'\/redeem-socks',\{method:'POST'\}\)/);
  assert.match(trackPage, /const bothReady=member\.socksAvailable&&member\.stringAvailable;/);
  assert.match(trackPage, /\{bothReady&&<p className="stamp-both-notice">/);
  assert.match(trackPage, /member\.socksProductName&&<div className=\{'stamp-reward'\+\(member\.socksAvailable\?' is-ready':''\)\}>/, "hidden entirely when no product is configured");

  // staff-facing members page and dashboard
  assert.match(membersPage, /socksProductName=config\?\.member_socks_product_id\?\(products\|\|\[\]\)\.find\(\(p:any\)=>p\.id===config\.member_socks_product_id\)\?\.name:null;/);
  assert.match(membersPage, /i===customer\.socksNeed-1\?'is-milestone':''/, "the socks threshold is marked on the shared star bar");
  assert.match(pos, /sockSales=sales\.filter\(\(x:any\)=>x\.discount_reason===SOCK_REWARD_REASON\)/);
  assert.match(pos, /<MembersPage jobs=\{jobs\} sales=\{data\.sales\|\|\[\]\} config=\{data\.config\} products=\{allProducts\}/);
});

test("ระบบสมาชิก settings: each reward tier gets its own labelled section, native <select> matches the other inputs", async () => {
  const settings = await read("app/shop-settings.tsx");
  const css = await read("app/globals.css");
  assert.match(settings, /<h3 className="reward-tier-title">🎁 ขึ้นเอ็นฟรี<\/h3>/);
  assert.match(settings, /<h3 className="reward-tier-title">🧦 ถุงเท้าฟรี<\/h3>/);
  // the socks star-count and the product picker are each their own full-width row now, not squeezed into a
  // 2-column grid next to a much shorter label (which used to wrap to 3 lines and throw the row off balance)
  assert.match(settings, /<Field label="สะสมครบกี่ดาว"><input className="field-narrow" type="number"/);
  assert.doesNotMatch(settings, /สะสมครบกี่ดาวแลกถุงเท้าฟรี/, "the old long label that used to wrap awkwardly is gone");
  assert.match(css, /^select\{width:100%;border:1px solid var\(--border\);border-radius:8px;padding:10px 12px;min-width:0;background:#fff;color:var\(--foreground\);font-size:15px;height:44px\}/m, "a bare <select> now looks like every other input, not the raw browser default");
  assert.match(css, /\.field-narrow\{max-width:160px\}/);
});

test("งานขึ้นเอ็น: status cards filter the list, a date filter (with its own default of showing everything), and pagination", async () => {
  const pos = await read("app/pos.tsx");
  const css = await read("app/globals.css");
  assert.match(pos, /\[jobRange,setJobRange\]=useState\('all'\),\[jobDate,setJobDate\]=useState\(today\(\)\),\[showAllJobs,setShowAllJobs\]=useState\(false\)/);
  assert.match(pos, /const jobInRange=\(s:string\)=>\{if\(jobRange==='all'\)return true;/, "no date chosen is its own state, not just \"today\"");
  assert.match(pos, /const jobDateControl=<div className="date-controls job-date-controls"><Tabs value=\{jobRange\} onValueChange=\{setJobRange\}><TabsList>\{\[\['all','ทั้งหมด'\],\['day','วัน'\],\['month','เดือน'\],\['year','ปี'\]\]/, "independent of the dashboard's own date filter");
  // the default landing view (no date, no explicit status picked) shows only work still pending; picking a date
  // or a specific status always overrides that
  assert.match(pos, /const pendingStatuses=\['รอขึ้นเอ็น','กำลังขึ้นเอ็น','พร้อมรับไม้'\];/);
  assert.match(pos, /const statusMatch=\(j:any\)=>jobFilter!=='ทั้งหมด'\?j\.status===jobFilter:jobRange==='all'\?pendingStatuses\.includes\(j\.status\):true;/);
  // status cards are clickable filters (same idea as the inventory status cards), toggling off on a second click
  assert.match(pos, /className=\{jobFilter===s\?'is-active':''\} onClick=\{\(\)=>setJobFilter\(f=>f===s\?'ทั้งหมด':s\)\}/);
  assert.match(pos, /dated\.filter\(\(j:any\)=>j\.status===s\)\.length/, "the card counts respect the date filter, matching what the list below shows");
  // pagination: capped at 6 with a "show all" toggle, same convention as the inventory category breakdown already uses
  assert.match(pos, /\{\(showAllJobs\?shownJobs:shownJobs\.slice\(0,6\)\)\.map/);
  assert.match(pos, /\{shownJobs\.length>6&&<button type="button" className="secondary small report-show-all" onClick=\{\(\)=>setShowAllJobs\(v=>!v\)\}>\{showAllJobs\?'แสดงน้อยลง':'แสดงทั้งหมด \('\+shownJobs\.length\+'\)'\}<\/button>\}/);
  assert.match(css, /\.job-status-cards>button\{all:unset;cursor:pointer;/, "clickable cards reset the default button chrome instead of turning into a solid blue pill");
  assert.match(css, /\.job-status-cards>button\.is-active/);
});

test("customer transfer slips are compressed client-side before upload, and the job card's slip badge opens it directly", async () => {
  const compress = await read("lib/image-compress.ts");
  const pos = await read("app/pos.tsx");
  const trackPage = await read("app/track/[token]/page.tsx");
  const css = await read("app/globals.css");
  assert.match(compress, /export async function compressImage\(file: File, \{ maxDim = 1280, quality = 0\.72, force = false \} = \{\}\): Promise<File>/);
  assert.match(compress, /export const compressSlip = \(file: File, maxDim = 1280, quality = 0\.72\) => compressImage\(file, \{ maxDim, quality \}\);/);
  assert.match(compress, /if \(!file\.type\.startsWith\("image\/"\)\) return file;/, "never touches a non-image file");
  assert.match(compress, /if \(!blob \|\| \(!force && blob\.size >= file\.size\)\) return file;/, "never makes an already-small slip bigger");
  assert.match(compress, /\} catch \{\n    return file;\n  \}/, "compression failing (an odd format, an old browser) never blocks the upload itself");
  // staff-side: only the slip key is compressed - job condition photos and product images are untouched
  assert.match(pos, /import \{compressSlip\} from '@\/lib\/image-compress';/);
  assert.match(pos, /fd\.append\('file',key==='slip'\?await compressSlip\(file\):file\);/);
  // customer's own slip upload (tracking page) is always a slip, so always compressed
  assert.match(trackPage, /import \{compressSlip\} from '@\/lib\/image-compress';/);
  assert.match(trackPage, /body\.append\('file',await compressSlip\(files\[0\]\)\);/);
  // job card: the "มีสลิปรอตรวจ" badge opens the slip popup directly, without opening the card's own job detail
  assert.match(pos, /className="badge amber slip-badge" role="button" tabIndex=\{0\} aria-label=\{'ดูสลิปโอนเงินของ '\+j\.customer\} onClick=\{e=>\{e\.stopPropagation\(\);setLightbox\(j\.slip\)\}\}/);
  assert.match(pos, /onKeyDown=\{e=>\{if\(e\.key==='Enter'\|\|e\.key===' '\)\{e\.preventDefault\(\);e\.stopPropagation\(\);setLightbox\(j\.slip\)\}\}\}/, "keyboard-activatable too, since it's nested inside another button and can't be a real <button>");
  assert.match(css, /\.slip-badge\{cursor:pointer\}/);
});

test("รับสินค้าเข้า (PO): status cards are clickable filters, counted against the current date range", async () => {
  const po = await read("app/purchase-orders.tsx");
  const css = await read("app/globals.css");
  assert.match(po, /\[expanded,setExpanded\]=useState<string>\(''\),\[statusFilter,setStatusFilter\]=useState\('pending_approval'\);/, "lands on this month's still-pending POs, not \"today, any status\"");
  assert.match(po, /const datedOrders=useMemo\(\(\)=>orders\.filter/, "the date-only filter, kept separate from status so a card's own count never promises rows the date filter is hiding");
  assert.match(po, /const filteredOrders=useMemo\(\(\)=>statusFilter\?datedOrders\.filter\(\(order:any\)=>order\.status===statusFilter\):datedOrders,\[datedOrders,statusFilter\]\);/);
  assert.match(po, /<button type="button" key=\{status\} className=\{statusFilter===status\?'is-active':''\} onClick=\{\(\)=>setStatusFilter\(f=>f===status\?'':status\)\}><span>\{statusName\[status\]\}<\/span><strong>\{datedOrders\.filter\(\(o:any\)=>o\.status===status\)\.length\}<\/strong><\/button>/, "toggles off on a second click; counted against datedOrders, not the unfiltered lifetime total");
  assert.match(css, /\.po-status-summary>button\{all:unset;cursor:pointer;/, "resets the default button chrome instead of turning into a solid blue pill");
  assert.match(css, /\.po-status-summary>button\.is-active\{border-color:#4275d5;/);
});

test("PO editing: also allowed while รออนุมัติ, and the sale price (not just cost/qty) can be edited and is applied at receiving", async () => {
  const migration = await read("supabase/migrations/20260925010000_po_item_price.sql");
  const po = await read("app/purchase-orders.tsx");
  const dataRoute = await read("app/api/data/route.ts");
  assert.match(migration, /alter table public\.purchase_order_items add column if not exists price integer check \(price is null or price >= 0\);/);

  // client: the edit button now shows for pending_approval too, and prefills price from the PO item if it has one,
  // else from the product's current price (for PO items saved before this feature, or a cashier's earlier save)
  assert.match(po, /\{\(order\.status==='draft'\|\|order\.status==='pending_approval'\)&&<button className="secondary" onClick=\{\(\)=>setEditing/);
  assert.match(po, /const priceSource=x\.price\?\?products\.find\(\(p:any\)=>p\.id===x\.product_id\)\?\.price;/);
  // a new item (added while editing) also gets the product's current price prefilled, same as cost already does
  assert.match(po, /price:product\.price==null\?'':product\.price\/100/);
  // ราคาขาย/ชิ้น is owner-only, same gating as ต้นทุน\/ชิ้น already has
  assert.match(po, /\{owner&&<label><span>ราคาขาย\/ชิ้น<\/span><input type="number" min="0" step="0\.01" value=\{item\.price\}/);

  const save = dataRoute.slice(dataRoute.indexOf("action==='purchaseOrderSave'"), dataRoute.indexOf("else if(action==='purchaseOrderStatus')"));
  assert.match(save, /const editableStatuses=\['draft','pending_approval'\];/);
  assert.match(save, /if\(b\.id&&\(!existing\|\|!editableStatuses\.includes\(existing\.status\)\)\)throw new Error\('แก้ไขได้เฉพาะใบ PO สถานะร่างหรือรออนุมัติ'\);/);
  assert.match(save, /WHERE id=\? AND status IN \('draft','pending_approval'\)/, "the UPDATE's own guard was widened to match, not just the earlier throw");
  assert.match(save, /const hasItemPrice=!!\(await one\("SELECT 1 FROM information_schema\.columns WHERE table_schema='public' AND table_name='purchase_order_items' AND column_name='price'"\)\);/, "defensive - saving a PO must never break before the migration runs");
  assert.match(save, /const itemPrice=isOwner&&hasItemPrice&&x\.price!==''&&x\.price!=null\?money\(x\.price\):null;/, "a cashier's submission is never trusted, mirroring how cost already works");
  assert.match(save, /if\(hasItemPrice\)\{cols\.push\('price'\);vals\.push\(row\.price\);\}/, "price only added to the INSERT once the column exists");

  const receive = dataRoute.slice(dataRoute.indexOf("else if(action==='purchaseOrderStatus')"), dataRoute.indexOf("else if(action==='customerEdit')"));
  assert.match(receive, /statements\.push\('price' in row\?q\(`UPDATE products SET stock=stock\+\?,\$\{averaged\},price=COALESCE\(\?,price\) WHERE id=\?`,row\.qty,row\.qty,row\.cost,row\.qty,row\.cost,row\.price,row\.product_id\):q\(`UPDATE products SET stock=stock\+\?,\$\{averaged\} WHERE id=\?`,row\.qty,row\.qty,row\.cost,row\.qty,row\.cost,row\.product_id\)\);/, "COALESCE - a row with no recorded price (old PO, or a cashier's save) never wipes the product's price to null");

  const getQuery = dataRoute.slice(0, dataRoute.indexOf("export async function POST"));
  assert.match(getQuery, /to_jsonb\(purchase_order_items\)->>'price' AS price FROM purchase_order_items/, "read defensively too, so the PO list never errors before the migration runs");
});

test("sidebar: รับสินค้าเข้า (PO) shows a count badge for POs still waiting on approval", async () => {
  const pos = await read("app/pos.tsx");
  assert.match(pos, /\{id==='purchaseOrders'&&\(data\.purchaseOrders\|\|\[\]\)\.some\(\(o:any\)=>o\.status==='pending_approval'\)&&<b className="nav-count">\{\(data\.purchaseOrders\|\|\[\]\)\.filter\(\(o:any\)=>o\.status==='pending_approval'\)\.length\}<\/b>\}/, "hidden entirely when nothing is waiting, same as the other nav badges");
});

test("รับสินค้าเข้า (PO) lands on this month's still-pending-approval orders by default", async () => {
  const po = await read("app/purchase-orders.tsx");
  assert.match(po, /\[groupBy,setGroupBy\]=useState<'day'\|'month'\|'year'>\('month'\)/, "the date grouping defaults to the whole month, not just today");
  assert.match(po, /\[statusFilter,setStatusFilter\]=useState\('pending_approval'\);/);
});

test("LINE OA rich menu: 6 buttons over the menu image, installed by the owner from ตั้งค่าร้าน", async t => {
  const route = await read("app/api/line/richmenu/route.ts");
  const pos = await read("app/pos.tsx");
  const settings = await read("app/shop-settings.tsx");
  assert.match(route, /const me=await auth\(\);owner\(me\);/, "only the owner can replace the shop's LINE menu");
  assert.match(route, /line\(`richmenu\/\$\{richMenuId\}\/content`,\{method:'POST',headers:\{'Content-Type':'image\/jpeg'\}[^\n]*'api-data\.line\.me'\)/, "the image goes to the data host");
  assert.match(route, /line\(`user\/all\/richmenu\/\$\{richMenuId\}`,\{method:'POST'\}\)/, "set as every customer's default menu");
  assert.match(pos, /<LineMenuPanel [^>]*onDone=\{load\}\/><PromotionPanel Field=\{Field\} onAction=\{act\}\/>/);
  assert.match(await read("app/api/promotions/route.ts"), /const me=await auth\(\);owner\(me\);/, "the promotion list (drafts too) is owner-only");
  assert.match(settings, /fetch\('\/api\/line\/richmenu',\{method:'POST'/);
  let menu;
  try { menu = await import("../lib/line-richmenu.ts"); }
  catch { t.skip("this Node version cannot import .ts files directly"); return; }
  const body = menu.richMenuBody({ facebook: "https://www.facebook.com/share/1Cso5TZikx/?mibextid=wwXIfr", phone: "087-0954441" });
  assert.deepEqual(body.size, { width: 2500, height: 1686 });
  assert.equal(body.areas.length, 6);
  const actions = body.areas.map(a => a.action);
  assert.deepEqual(actions.filter(a => a.type === "postback").map(a => a.data), ["action=track", "action=points", "action=promo", "action=price"]);
  assert.ok(actions.some(a => a.uri === "tel:0870954441"), "the call button dials digits only");
  assert.ok(actions.some(a => a.uri === "https://www.facebook.com/share/1Cso5TZikx/?mibextid=wwXIfr"));
  for (const a of body.areas) assert.ok(a.bounds.x + a.bounds.width <= 2500 && a.bounds.y + a.bounds.height <= 1686);
  const area = a => a.bounds.width * a.bounds.height;
  assert.equal(body.areas.reduce((sum, a) => sum + area(a), 0), 2500 * 1686, "the buttons tile the whole image - no dead spot, no overlap");
});

test("LINE webhook: track by phone shows only a compact card; linked jobs get the full card; promotions are a carousel", async t => {
  const webhook = await read("app/api/line/route.ts");
  const data = await read("app/api/data/route.ts");
  const migration = await read("supabase/migrations/20260925020000_promotions.sql");
  const promoImage = await read("app/api/line/promo-image/[id]/route.ts");
  assert.match(webhook, /crypto\.subtle\.verify\('HMAC'/, "every webhook call is signature-checked");
  assert.match(webhook, /regexp_replace\(phone,'\\\\D','','g'\)=\?/);
  assert.match(webhook, /WHERE active=1 ORDER BY created DESC LIMIT 12/, "a LINE carousel holds at most 12 cards");
  assert.match(migration, /revoke all on public\.promotions from anon, authenticated;/);
  assert.match(promoImage, /active=1/, "a promotion's picture is public only while that promotion is on");
  assert.match(data, /action==='promotionSave'/);
  assert.doesNotMatch(data.slice(data.indexOf("export async function GET()"), data.indexOf("export async function POST")), /promotions/, "the main snapshot doesn't depend on the promotions migration");
  assert.match(data, /action==='promotionDelete'/);
  let line;
  try { line = await import("../lib/line-message.ts"); }
  catch { t.skip("this Node version cannot import .ts files directly"); return; }
  const steps = ["รอขึ้นเอ็น", "กำลังขึ้นเอ็น", "พร้อมรับไม้", "คืนไม้แล้ว"];
  const job = (id, line_user) => ({ id, token: "t" + id, racket: "Yonex " + id, status: "กำลังขึ้นเอ็น", paid: 0, amount: 25000, created: "2026-09-25T03:00:00Z", line_user });
  const msg = line.trackJobsMessage([job("a", "U1"), job("b", null)], { steps, siteUrl: "https://shop.example", lineUser: "U1" });
  assert.equal(msg.contents.type, "carousel");
  const [mine, stranger] = msg.contents.contents.map(b => JSON.stringify(b));
  assert.match(mine, /\/track\/ta/, "your own linked job links to its tracking page");
  assert.doesNotMatch(stranger, /\/track\/|250/, "someone typing a phone number sees no tracking link or amount");
  assert.equal(line.promotionsMessage([], {}), null);
  const promos = Array.from({ length: 14 }, (_, i) => ({ id: "p" + i, title: "โปร " + i, body: "", image: i ? "img" + i : null }));
  const carousel = line.promotionsMessage(promos, { siteUrl: "https://shop.example", phone: "087-0954441" });
  assert.equal(carousel.contents.contents.length, 12);
  assert.equal(carousel.contents.contents[0].hero, undefined, "a promotion without a picture has no broken image");
  assert.equal(carousel.contents.contents[1].hero.url, "https://shop.example/api/line/promo-image/img1");
});

test("LINE เช็คคะแนนสะสม: stars card shared with the tracking page's rule; link only for the customer's own linked job", async t => {
  const webhook = await read("app/api/line/route.ts");
  const track = await read("app/api/track/[token]/route.ts");
  assert.match(track, /import \{memberStatus\} from '@\/lib\/member-status';/, "one memberStatus() for both, so LINE and the tracking page always agree");
  assert.match(webhook, /else if\(action==='points'\)await replyLine\(replyToken,await onPoints\(lineUser\)\);/);
  assert.match(webhook, /SELECT phone FROM jobs WHERE line_user=\?/, "a linked LINE account is recognised without typing a phone");
  assert.match(webhook, /const card=await pointsCard\(digits\);/, "a typed phone gets the card with no tracking link");
  let line;
  try { line = await import("../lib/line-message.ts"); }
  catch { t.skip("this Node version cannot import .ts files directly"); return; }
  const member = { stars: 6, stringNeed: 10, socksNeed: 5, stringAvailable: false, socksAvailable: true, stringUsed: 0, socksUsed: 1, rewardCap: 30000, socksProductName: "ถุงเท้าข้อสั้น", posMinAmount: 0, promo: { phase: "during", start: null, end: "2026-12-31" } };
  const card = line.memberCardMessage(member);
  const json = JSON.stringify(card);
  assert.equal(card.altText, "คะแนนสะสม 6 ดาว");
  assert.match(json, /แลกถุงเท้าข้อสั้นฟรีได้แล้ว/);
  assert.match(json, /สะสมอีก 4 ดาว รับสิทธิ์ขึ้นเอ็นฟรี \(ครบ 10 ดาว · เอ็นมูลค่าไม่เกิน ฿300\.00\)/);
  assert.match(json, /สะสมแต้มได้ถึง/);
  assert.equal(card.contents.footer, undefined, "no link without a linked job");
  const grid = card.contents.body.contents.find(c => c.backgroundColor === "#F7F4FF").contents;
  assert.equal(grid.length, 2, "10 stamps = 2 rows of 5");
  const stamps = grid.flatMap(row => row.contents).map(c => c.text);
  assert.equal(stamps.filter(x => x === "★").length, 6, "a filled star per stamp earned");
  assert.equal(stamps[9], "🎁", "the free-stringing milestone is marked");
  // LINE rejects the whole reply over one unknown Flex property (the chat just stays silent) - keep to known ones.
  const allowed = new Set(["type", "text", "contents", "layout", "size", "color", "weight", "align", "flex", "wrap", "spacing", "paddingAll", "paddingTop",
    "backgroundColor", "cornerRadius", "margin", "style", "height", "action", "label", "uri", "altText", "header", "body", "footer", "hero", "url", "aspectRatio", "aspectMode"]);
  const walk = node => { if (Array.isArray(node)) return node.forEach(walk); if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) { assert.ok(allowed.has(k), "unexpected Flex property " + k); walk(v); } };
  walk(card);
  // No stars yet / unknown phone: the programme card - how to earn, both rewards, the stamping period.
  const fresh = JSON.stringify(line.memberCardMessage({ ...member, stars: 0, socksAvailable: false, promo: { phase: "before", start: "2026-10-01", end: "2026-12-31" } }, { known: false }));
  assert.match(fresh, /บัตรสะสมดาว Wingpro Badminton/);
  assert.match(fresh, /ขึ้นเอ็นและชำระแล้ว 1 ครั้ง = 1 ดาว/);
  assert.match(fresh, /ครบ 5 ดาว แลกถุงเท้าข้อสั้นฟรี/);
  assert.match(fresh, /ครบ 10 ดาว ขึ้นเอ็นฟรี 1 ครั้ง \(เอ็นมูลค่าไม่เกิน ฿300\.00\)/);
  assert.match(fresh, /ยังไม่มีดาวสะสมของเบอร์นี้/);
  assert.match(fresh, /โปรโมชั่นสะสมแต้ม/);
  walk(JSON.parse(fresh));
  const linked = line.memberCardMessage(member, { trackUrl: "https://shop.example/track/abc" });
  assert.equal(linked.contents.footer.contents[0].action.uri, "https://shop.example/track/abc");
  assert.equal(linked.contents.footer.contents[0].action.label, "แลกของรางวัล");
});

test("LINE ราคาขึ้นเอ็น: owner edits the price text + picture in ตั้งค่าร้าน; LINE gets the whole picture, then the text", async t => {
  const migration = await read("supabase/migrations/20260925030000_string_price_info.sql");
  const data = await read("app/api/data/route.ts");
  const webhook = await read("app/api/line/route.ts");
  const image = await read("app/api/line/promo-image/[id]/route.ts");
  const pos = await read("app/pos.tsx");
  const settings = await read("app/shop-settings.tsx");
  assert.match(migration, /add column if not exists string_price_text text not null default ''/);
  assert.match(migration, /add column if not exists string_price_image text references public\.files\(id\) on delete set null/);
  assert.match(data, /else if\(action==='stringPriceSave'\)\{owner\(me\);/, "owner only");
  assert.match(data, /if\(priceImage\)await ownedFiles\(\[priceImage\]\);/, "only an uploaded file of this shop can be linked");
  assert.match(webhook, /else if\(action==='price'\)await replyLine\(replyToken,await onPrice\(\)\);/);
  assert.match(image, /to_jsonb\(c\)->>'string_price_image'/, "the price picture is public only while it is the current one");
  assert.match(pos, /<StringPricePanel key=\{'string-price-'/);
  assert.match(settings, /await priceListImage\(files\[0\]\)/);
  let line;
  try { line = await import("../lib/line-message.ts"); }
  catch { t.skip("this Node version cannot import .ts files directly"); return; }
  const both = line.stringPriceMessages({ text: "BG80 320 บาท", image: "img1", siteUrl: "https://shop.example/", phone: "087-0954441" });
  assert.deepEqual(both[0], { type: "image", originalContentUrl: "https://shop.example/api/line/promo-image/img1", previewImageUrl: "https://shop.example/api/line/promo-image/img1" });
  assert.equal(both[1].text, "BG80 320 บาท\n\nสอบถามเพิ่มเติม โทร 087-0954441");
  const empty = line.stringPriceMessages({ phone: "087-0954441" });
  assert.equal(empty.length, 1);
  assert.match(empty[0].text, /สอบถามราคาขึ้นเอ็นแบดมินตันได้ที่ร้านเลย/);
  assert.equal(line.stringPriceMessages({ text: "x", image: "img1", siteUrl: "http://insecure" }).length, 1, "LINE only takes https images");
});

test("ตั้งค่าร้าน is split into sub-menus: ร้านค้า / รับชำระเงิน / ระบบสมาชิก / LINE OA", async () => {
  const pos = await read("app/pos.tsx");
  const settings = pos.slice(pos.indexOf("page==='settings'&&owner&&"), pos.indexOf("</main>"));
  assert.match(pos, /\[settingsTab,setSettingsTab\]=useState\('shop'\)/);
  assert.match(settings, /\[\['shop','ร้านค้า',Store\],\['payment','รับชำระเงิน',Wallet\],\['member','ระบบสมาชิก',Gift\],\['line','LINE OA',MessageCircle\]\]/);
  const tab = id => settings.slice(settings.indexOf(`{settingsTab==='${id}'&&<>`), settings.indexOf("</>}", settings.indexOf(`{settingsTab==='${id}'&&<>`)));
  assert.match(tab("shop"), /<BasicPanel [\s\S]*<ContactPanel [\s\S]*หลักการคำนวณ/);
  assert.match(tab("payment"), /<BankPanel /);
  assert.match(tab("member"), /<MemberPanel /);
  assert.match(tab("line"), /LINE และหน้าติดตามลูกค้า[\s\S]*<LineMenuPanel [\s\S]*<PromotionPanel [\s\S]*<StringPricePanel /);
  assert.equal((settings.match(/<(BasicPanel|ContactPanel|BankPanel|MemberPanel|LineMenuPanel|PromotionPanel|StringPricePanel) /g) || []).length, 7, "every panel is in exactly one tab");
});

test("LINE product questions: typed names match however they are spelled; unclear ones list, unknown ones are logged", async t => {
  let search;
  try { search = await import("../lib/product-search.ts"); }
  catch { t.skip("this Node version cannot import .ts files directly"); return; }
  const P = [
    { id: "1", name: "Li-Ning No.1", category: "เอ็นแบดมินตัน" }, { id: "2", name: "Li-Ning No.5", category: "เอ็นแบดมินตัน" },
    { id: "3", name: "Yonex BG80", category: "เอ็นแบดมินตัน" }, { id: "4", name: "Yonex BG65 Titanium", category: "เอ็นแบดมินตัน", aliases: "bg65ti" },
    { id: "5", name: "Yonex Exbolt 63", category: "เอ็นแบดมินตัน" }, { id: "6", name: "Yonex Super Grap AC102", category: "กริป" },
    { id: "8", name: "ถุงเท้าข้อสั้น Wingpro", category: "ถุงเท้า" },
  ];
  const pick = q => { const r = search.pickMatches(search.searchProducts(q, P)); return [r.kind, r.products.map(p => p.id)]; };
  for (const q of ["Li-ning no1", "Lining no1", "Li-ning no.1", "LI NING NO 1 ราคาเท่าไหร่ครับ", "หลี่หนิง เบอร์1 มีไหม", "no1"]) assert.deepEqual(pick(q), ["one", ["1"]], q);
  assert.deepEqual(pick("bg 80 ราคา"), ["one", ["3"]]);
  assert.deepEqual(pick("bg65ti"), ["one", ["4"]], "the owner's own alias for a product");
  assert.deepEqual(pick("lining"), ["many", ["1", "2"]], "a brand alone lists that brand");
  assert.deepEqual(pick("เอ็น yonex มีอะไรบ้าง")[1].sort(), ["3", "4", "5"], "a brand + a kind lists only that brand's strings");
  assert.deepEqual(pick("มีกริปไหม"), ["one", ["6"]]);
  assert.deepEqual(pick("Yonex Astrox 88D มีไหม"), ["none", []], "a model the shop doesn't have is not swapped for a similar one");
  assert.deepEqual(pick("ขอบคุณครับ"), ["none", []]);
  assert.equal(search.PRODUCT_INTENT.test("Yonex Astrox 88D มีไหม"), true);
  assert.equal(search.PRODUCT_INTENT.test("ขอบคุณครับ"), false);
  assert.equal(search.inquiryKey("Li-Ning No.1 มีไหมครับ"), search.inquiryKey("lining no1"), "one request however it was typed");
  assert.equal(search.isGeneralStringingQuestion("ขึ้นเอ็นราคาเท่าไหร่ครับ"), true, "stringing in general -> the shop's price sheet");
  assert.equal(search.isGeneralStringingQuestion("เอ็น bg80 ราคา"), false);
});

test("LINE product answers: price + stock left from the database; AI only picks ids; falls back to rules", async t => {
  const webhook = await read("app/api/line/route.ts");
  const ai = await read("lib/product-ai.ts");
  const migration = await read("supabase/migrations/20260925040000_product_inquiries.sql");
  const data = await read("app/api/data/route.ts");
  const pos = await read("app/pos.tsx");
  assert.match(migration, /alter table public\.products add column if not exists aliases text not null default '';/);
  assert.match(migration, /unique \(kind, query_key\)/);
  assert.match(migration, /revoke all on public\.product_inquiries from anon, authenticated;/);
  assert.match(webhook, /stock-\(SELECT COUNT\(\*\) FROM jobs WHERE product_id=products\.id AND paid=0 AND returned IS NULL AND status<>'ยกเลิก'\) AS available/, "strings reserved for queued rackets are not offered");
  assert.match(webhook, /if\(ai\)\{\s*if\(!ai\.isProductQuestion\)return \[\];/, "the AI can keep the bot quiet for non-product messages");
  assert.match(webhook, /if\(rule\.kind!=='none'\)return productReply/, "no AI (or AI failed) -> rule matching");
  assert.match(webhook, /if\(rule\.kind!=='none'&&ranked\[0\]\.score>=0\.85\)return productReply/, "a strong name match skips the AI (no cost)");
  assert.match(webhook, /const again=ai\.wanted\?searchProducts\(ai\.wanted,products\):\[\];/, "the AI's cleaned-up name gets a second search before 'ไม่มี'");
  assert.match(webhook, /AND category<>'สินค้าเทียบ'/);
  assert.match(webhook, /else if\(action==='all'\|\|action==='brand'\)\{const params=new URLSearchParams\(e\.postback\?\.data\|\|''\);await replyLine\(replyToken,await onAllProducts\(params\.get\('q'\)\|\|'',action==='brand'\?params\.get\('b'\)\|\|'':''\)\);\}/, "ดูทั้งหมด and the brand chips re-run the search without the AI");
  assert.match(webhook, /let q=\(coreQuery\(query\)\|\|String\(query\|\|''\)\)\.trim\(\)\.slice\(0,120\);/, "the short normalized query goes in the postback, not the whole sentence");
  assert.match(webhook, /while\(q&&\('action=all&q='\+encodeURIComponent\(q\)\)\.length>300\)q=q\.slice\(0,-1\);/, "postback data stays within LINE's 300 characters");
  assert.match(webhook, /if\(PRODUCT_INTENT\.test\(message\)&&coreQuery\(message\)\)return notFoundReply/, "rules only log 'not stocked' for a clear buying question");
  assert.match(webhook, /\/\^\(สอบถาม\)\?ราคา\(ขึ้นเอ็น\|เอ็น\)\?/, "a bare 'ราคา' still gets the shop's price sheet");
  assert.match(ai, /filter\(\(id: string\) => known\.has\(id\)\)/, "an id the AI made up is dropped");
  assert.match(ai, /tool_choice: \{ type: "tool", name: TOOL\.name \}/);
  assert.match(ai, /controller\.abort\(\), timeoutMs/);
  assert.match(data, /aiReady:isOwner&&!!runtime\(\)\.ANTHROPIC_API_KEY/);
  assert.match(data, /if\(b\.aliases!==undefined&&'aliases' in p\)/, "aliases only saved once the column exists");
  assert.match(pos, /<InquiryPanel aiReady=\{data\.aiReady\} onAction=\{act\}\/>/);
  let line;
  try { line = await import("../lib/line-message.ts"); }
  catch { t.skip("this Node version cannot import .ts files directly"); return; }
  const one = line.productAnswerMessage([{ id: "1", name: "Li-Ning No.1", category: "เอ็นแบดมินตัน", price: 32000, available: 4, unit: "ชุด", image: "img" }], { siteUrl: "https://shop.example", phone: "087-0954441" });
  const json = JSON.stringify(one);
  assert.equal(one.contents.type, "bubble");
  assert.match(json, /฿320\.00/);
  assert.match(json, /ราคารวมค่าขึ้นเอ็นแล้ว/);
  assert.match(json, /มีสินค้า 4 ชุด/);
  assert.match(json, /https:\/\/shop\.example\/api\/line\/promo-image\/img/);
  const out = JSON.stringify(line.productAnswerMessage([{ id: "6", name: "Grip", category: "กริป", price: 9000, available: 0 }]));
  assert.match(out, /สินค้าหมดชั่วคราว/);
  assert.doesNotMatch(out, /ราคารวมค่าขึ้นเอ็น/, "only strings include stringing");
  // Several products: only what is in stock is listed ("มีสินค้า N รายการ"), services last and not counted,
  // price 0 -> "สอบถามราคา"; more than 15 -> a "ดูทั้งหมด (แยกตามยี่ห้อ)" button.
  const list = line.productAnswerMessage([
    { id: "a", name: "เอ็น Yonex BG80 Yellow", category: "เอ็นแบดมินตัน", price: 32000, available: 0 },
    { id: "b", name: "เอ็น Yonex BG80 White", category: "เอ็นแบดมินตัน", price: 32000, available: 3 },
    { id: "c", name: "เอ็น Yonex BG80 Power", category: "เอ็นแบดมินตัน", price: 0, available: 1 },
    { id: "s", name: "บริการขึ้นเอ็น", category: "เอ็นแบดมินตัน", price: 10000, available: -6 },
  ], { allQuery: "action=all&q=bg80" });
  const listJson = JSON.stringify(list);
  assert.equal(list.contents.type, "bubble");
  assert.match(listJson, /มีสินค้า 2 รายการ/, "the sold-out one and the service are not counted");
  assert.doesNotMatch(listJson, /BG80 Yellow/, "sold out -> not listed");
  assert.match(listJson, /ราคาเอ็นรวมค่าขึ้นเอ็นแล้ว/);
  assert.match(listJson, /สอบถามราคา/);
  assert.ok(listJson.indexOf("BG80 White") < listJson.indexOf("บริการขึ้นเอ็น"), "services come last");
  assert.doesNotMatch(listJson, /ดูทั้งหมด/, "no button when everything fits");
  const soldOut = JSON.stringify(line.productAnswerMessage([{ id: "a", name: "A", category: "กริป", price: 100, available: 0 }, { id: "b", name: "B", category: "กริป", price: 100, available: 0 }]));
  assert.match(soldOut, /หมดชั่วคราวทุกรายการ \(2\)/, "all sold out: still shown, marked หมด");
  const many = line.productAnswerMessage(Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: "P" + i, price: 100, available: 1 })), { allQuery: "action=all&q=x" });
  assert.match(JSON.stringify(many), /และอีก 5 รายการ กด “ดูทั้งหมด” ด้านล่าง/);
  assert.equal(many.contents.footer.contents[0].action.data, "action=all&q=x");
  // ดูทั้งหมด: a card per brand, in stock only, big brands split so no card gets too large.
  assert.equal(line.brandOf("เอ็น Lining No.1 Blue"), "Li-Ning");
  assert.equal(line.brandOf("เอ็น Aerosonic Bright Pink"), "Yonex", "a Yonex model written without the brand");
  assert.equal(line.brandOf("เอ็น Kizuna Z58"), "Kizuna");
  const car = line.productBrandCarousel([
    ...Array.from({ length: 27 }, (_, i) => ({ id: "y" + i, name: "เอ็น Yonex BG" + i, category: "เอ็นแบดมินตัน", price: 100, available: 1 })),
    { id: "l", name: "เอ็น Li-Ning No.1", category: "เอ็นแบดมินตัน", price: 100, available: 2 },
    { id: "z", name: "เอ็น Li-Ning No.5", category: "เอ็นแบดมินตัน", price: 100, available: 0 },
  ]);
  assert.deepEqual(car.contents.contents.map(b => b.body.contents[0].text), ["Yonex (1/2)", "Yonex (2/2)", "Li-Ning"]);
  assert.doesNotMatch(JSON.stringify(car), /No\.5/, "sold out -> not in ดูทั้งหมด either");
  // Brand chips (quick reply) on a list with 2+ brands in stock: most items first, postback per brand.
  const mixed = line.productAnswerMessage([
    { id: "y1", name: "เอ็น Yonex BG80", category: "เอ็นแบดมินตัน", price: 100, available: 1 },
    { id: "y2", name: "เอ็น Yonex BG65", category: "เอ็นแบดมินตัน", price: 100, available: 1 },
    { id: "l1", name: "เอ็น Li-Ning No.1", category: "เอ็นแบดมินตัน", price: 100, available: 1 },
    { id: "v1", name: "เอ็น Victor VBS-63", category: "เอ็นแบดมินตัน", price: 100, available: 0 },
  ], { allQuery: "action=all&q=" + encodeURIComponent("เอ็น") });
  assert.deepEqual(mixed.quickReply.items.map(i => i.action.label), ["Yonex (2)", "Li-Ning (1)"], "sold-out brands get no chip");
  assert.equal(new URLSearchParams(mixed.quickReply.items[1].action.data).get("b"), "Li-Ning");
  assert.equal(line.productAnswerMessage([{ id: "y1", name: "เอ็น Yonex BG80", price: 100, available: 1 }, { id: "y2", name: "เอ็น Yonex BG65", price: 100, available: 1 }], { allQuery: "action=all&q=x" }).quickReply, undefined, "one brand -> no chips");
  const service = JSON.stringify(line.productAnswerMessage([{ id: "s", name: "บริการขึ้นเอ็น", category: "เอ็นแบดมินตัน", price: 10000, available: -6 }]));
  assert.doesNotMatch(service, /หมด|มีสินค้า|รวมค่าขึ้นเอ็น/, "a service has no stock and is not a string");
  assert.match(line.productNotFoundMessage("Yonex Astrox 88D", "087-0954441").text, /ยังไม่มี “Yonex Astrox 88D” ร้านบันทึกไว้แล้ว/);
});

test("product cost: moving weighted average on receiving a PO; owner edits it in แก้ไขสินค้า; sold items keep their own cost", async () => {
  const data = await read("app/api/data/route.ts");
  const pos = await read("app/pos.tsx");
  const editor = await read("app/cost-editor.tsx");
  // (stock on hand x current cost + received qty x lot cost) / new stock - or the lot's cost when there is nothing to average.
  assert.match(data, /const averaged='cost=CASE WHEN stock>0 AND cost IS NOT NULL THEN ROUND\(\(stock::numeric\*cost\+\?::numeric\*\?\)\/\(stock\+\?\)\)::integer ELSE \? END';/);
  // Every sale line still snapshots the cost at the moment of sale.
  assert.match(data, /INSERT INTO items\(id,sale_id,product_id,name,category,qty,price,original,net,cost,note,line_discount\) VALUES\(\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?\)',uid\(\),id,x\.p\.id,x\.p\.name,x\.p\.category,x\.qty,x\.price,x\.p\.price,net,x\.p\.cost/);
  // Owner's edit: blank = unchanged; only sales/receipts that never had a cost are filled in.
  assert.match(data, /if\(b\.cost!==undefined&&b\.cost!==null&&String\(b\.cost\)\.trim\(\)!==''\)\{const cost=money\(b\.cost\);if\(cost!==p\.cost\)statements\.push\(q\('UPDATE products SET cost=\? WHERE id=\?',cost,p\.id\),q\('UPDATE receipts SET cost=\? WHERE product_id=\? AND cost IS NULL',cost,p\.id\),q\('UPDATE items SET cost=\? WHERE product_id=\? AND cost IS NULL',cost,p\.id\)\);\}/);
  assert.match(pos, /\{owner&&modal==='editProduct'&&<CostEditor form=\{form\} setForm=\{setForm\} receipts=\{data\.receipts\} Field=\{Field\}\/>\}/);
  assert.match(pos, /cost:p\.cost===null\|\|p\.cost===undefined\?'':p\.cost\/100/);
  assert.match(editor, /ประวัติรับเข้า/);
});

test("คลังสินค้า: change the sale price of many selected products at once, previewed before saving", async t => {
  const data = await read("app/api/data/route.ts");
  const pos = await read("app/pos.tsx");
  assert.match(data, /else if\(action==='bulkProductPrice'\)\{owner\(me\);/, "owner only");
  assert.match(data, /const price=bulkPrice\(p\.price,mode,b\.value\);/, "recomputed from the database price with the preview's own rule");
  assert.match(pos, />เปลี่ยนหมวดหมู่<\/button><button type="button" className="secondary" disabled=\{busy\} onClick=\{\(\)=>open\('bulkPrice',\{productIds:\[\.\.\.inventorySelected\],mode:'set',value:''\}\)\}>แก้ราคาขาย<\/button>/);
  assert.match(pos, /else if\(modal==='bulkPrice'\)\{const d=await act\('bulkProductPrice',\{productIds:form\.productIds,mode:form\.mode,value:form\.value\}\);if\(d\)setInventorySelected\(\[\]\);\}/);
  let lib;
  try { lib = await import("../lib/bulk-price.ts"); }
  catch { t.skip("this Node version cannot import .ts files directly"); return; }
  assert.equal(lib.bulkPrice(32000, "set", "350"), 35000);
  assert.equal(lib.bulkPrice(32000, "add", "20"), 34000);
  assert.equal(lib.bulkPrice(32000, "add", "-20"), 30000);
  assert.equal(lib.bulkPrice(32000, "percent", "10"), 35200);
  assert.equal(lib.bulkPrice(31990, "percent", "10"), 35200, "a % change lands on whole baht");
  assert.equal(lib.bulkPrice(32000, "percent", "-10"), 28800);
  assert.equal(lib.bulkPrice(1000, "add", "-20"), null, "never negative");
  assert.equal(lib.bulkPrice(32000, "set", ""), null);
  assert.equal(lib.bulkPrice(32000, "set", "abc"), null);
});

test("แปลงสินค้าขายย่อย: open packs into single units - stock moves, the unit's cost is the pack's cost / ratio", async () => {
  const data = await read("app/api/data/route.ts");
  const pos = await read("app/pos.tsx");
  const api = await read("app/api/breakdowns/route.ts");
  const migration = await read("supabase/migrations/20260926010000_product_breakdowns.sql");
  assert.match(migration, /ratio integer not null check \(ratio between 2 and 10000\)/);
  assert.match(migration, /unique \(parent_id, child_id\)/);
  assert.match(migration, /staff_id uuid not null references public\.members\(id\)/);
  assert.match(migration, /revoke all on public\.product_conversions from anon, authenticated;/);
  assert.match(pos, /\['inventory','คลังสินค้า',Package\],\['breakdown','แปลงสินค้าขายย่อย',PackageOpen\]/, "right under คลังสินค้า");
  assert.match(pos, /\{page==='breakdown'&&can\('inventory'\)&&<BreakdownPage /);
  assert.match(data, /if\(action==='breakdownRule'\)\{owner\(me\);/, "only the owner sets up what breaks into what");
  assert.match(data, /else\{permit\(me,'inventory'\);const rule=/, "staff with stock access can open packs");
  assert.match(data, /unitCost=parent\.cost===null\|\|parent\.cost===undefined\?null:Math\.round\(parent\.cost\/rule\.ratio\)/, "690 / 12 = 57.50");
  assert.match(data, /WITH taken AS \(UPDATE products SET stock=stock-\? WHERE id=\? AND stock>=\? RETURNING id\) INSERT INTO product_conversions/, "never takes more packs than the system has");
  assert.match(data, /q\('SELECT 1\/\(SELECT COUNT\(\*\)::int FROM product_conversions WHERE id=\?\) AS ok',id\)/, "a lost race rolls the whole conversion back");
  assert.match(data, /INSERT INTO stock_adjustments\(id,product_id,delta,reason,staff_id,created\) VALUES\(\?,\?,\?,\?,\?,\?\)',id\+'-out',parent\.id,-qty,reason/, "both sides show in the stock movement history");
  assert.match(api, /const cost=\(t:string\)=>isOwner\?`\$\{t\}\.cost`:'NULL::integer';/, "costs stay owner-only");
});

test("PO payment terms: transfer or credit (creditor + due date); credit debts listed in เจ้าหนี้ค้างชำระ until paid", async t => {
  const migration = await read("supabase/migrations/20260926020000_po_payment_terms.sql");
  const data = await read("app/api/data/route.ts");
  const po = await read("app/purchase-orders.tsx");
  const payables = await read("app/payables-page.tsx");
  const pos = await read("app/pos.tsx");
  assert.match(migration, /check \(payment_method in \('transfer','credit'\)\)/);
  assert.match(migration, /add column if not exists due_date text/);
  assert.match(data, /if\(paymentMethod==='credit'&&\(!creditor\|\|!\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(dueDate\|\|''\)\)\)throw new Error\('ซื้อแบบเครดิต กรุณาระบุชื่อเจ้าหนี้และวันที่ต้องชำระ'\);/);
  assert.match(data, /else if\(action==='purchaseOrderPayDebt'\)\{owner\(me\);/);
  assert.match(data, /UPDATE purchase_orders SET paid_at=\?,debt_paid_by=\?,updated=\? WHERE id=\? AND paid_at IS NULL/, "settling a received credit PO keeps it 'received'");
  assert.match(data, /UPDATE purchase_orders SET status='received',received_at=\?,updated=\? WHERE id=\? AND status=\?",stamp,stamp,po\.id,po\.status/);
  assert.match(po, /\['transfer','โอนเงิน'\],\['credit','เครดิต \(ค้างจ่าย\)'\]/);
  assert.match(po, /\[\['received','รับสินค้าเข้าคลัง \(ค้างชำระ\)'\],\['paid','ชำระหนี้แล้ว'\]\]/);
  assert.match(pos, /\.\.\.\(owner\?\[\['payables','เจ้าหนี้ค้างชำระ',Landmark\]\]:\[\]\)/, "owner-only menu");
  assert.match(pos, /\{page==='payables'&&owner&&<PayablesPage /);
  assert.match(payables, /export const openDebts=\(orders:any\[\]\)=>\(orders\|\|\[\]\)\.filter\(\(o:any\)=>o\.payment_method==='credit'&&!o\.paid_at&&\(o\.status==='approved'\|\|o\.status==='received'\)\);/);
});
