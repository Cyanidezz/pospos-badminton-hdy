import { all, db, one, pushLineMessages, siteUrl } from "./server";

// แจ้งเตือนสินค้าสำคัญใกล้หมด (see 20260926050000_low_stock_alerts.sql). Called after anything that can move stock
// (a sale, a job, a stock adjustment, opening a pack, a stock count...). Cheap when nothing changed: one query.
// Each product alerts once when it drops below its line and is re-armed when it is back above it, so the owner gets
// one message per shortage - not one per sale - and the OA's monthly push quota isn't spent on repeats.
const AVAILABLE = "stock-(SELECT COUNT(*) FROM jobs WHERE product_id=products.id AND paid=0 AND returned IS NULL AND status<>'ยกเลิก')";

export async function checkLowStockAlerts() {
  try {
    const config: any = await one("SELECT to_jsonb(config) AS c FROM config WHERE id=1");
    const c = config?.c || {};
    if (!("low_stock_line" in c)) return;
    // Back above the line -> ready to alert again next time.
    await db().prepare(`UPDATE products SET low_alerted=0 WHERE important=1 AND low_alerted=1 AND ${AVAILABLE}>=low_stock`).run();
    const recipients: any[] = Array.isArray(c.alert_line_users) ? c.alert_line_users : [];
    if (!c.low_stock_line || !recipients.length) return;
    const low: any[] = await all(`SELECT id,name,unit,low_stock,${AVAILABLE} AS available FROM products WHERE active=1 AND important=1 AND low_alerted=0 AND ${AVAILABLE}<low_stock ORDER BY name LIMIT 30`);
    if (!low.length) return;
    // Mark first: two requests finishing at once must not both send the same alert.
    const claimed: any[] = await all(`UPDATE products SET low_alerted=1 WHERE id IN (${low.map(() => "?").join(",")}) AND low_alerted=0 RETURNING id`, ...low.map(p => p.id));
    const fresh = new Set(claimed.map(c => c.id));
    if (!fresh.size) return;
    // The message lists EVERY important product that is low right now (not only the ones that just crossed the line),
    // so each alert is the whole picture - the newly low ones first, marked 🆕, then the rest, emptiest first.
    const allLow: any[] = await all(`SELECT id,name,unit,low_stock,${AVAILABLE} AS available FROM products WHERE active=1 AND important=1 AND ${AVAILABLE}<low_stock`);
    allLow.sort((a, b) => Number(fresh.has(b.id)) - Number(fresh.has(a.id)) || Number(a.available) - Number(b.available) || String(a.name).localeCompare(String(b.name)));
    const shown = allLow.slice(0, 40);
    const lines = shown.map(p => `${fresh.has(p.id) ? "🆕" : "•"} ${p.name} เหลือ ${Math.max(0, Number(p.available))} ${p.unit || "ชิ้น"} (แจ้งเมื่อน้อยกว่า ${p.low_stock})`);
    const base = siteUrl().replace(/\/$/, "");
    const message = { type: "text", text: `⚠️ สินค้าสำคัญใกล้หมด ${allLow.length} รายการ${fresh.size < allLow.length ? ` (ใหม่ ${fresh.size})` : ""}\n${lines.join("\n")}${allLow.length > shown.length ? `\nและอีก ${allLow.length - shown.length} รายการ` : ""}${base ? `\n\nเปิดคลังสินค้า: ${base}` : ""}`.slice(0, 4900) };
    for (const r of recipients.slice(0, 5)) if (typeof r?.lineUser === "string") await pushLineMessages(r.lineUser, [message]);
  } catch (error: any) {
    console.error("Low stock alert failed", error?.message);
  }
}
