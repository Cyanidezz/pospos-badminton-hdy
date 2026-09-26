// Read-only: checks the database connection and lists which recent migrations are applied (by looking for the
// table / column each one adds). Never prints the connection string. Run: npm run db:status
// Uses POSTGRES_URL (or DATABASE_URL) from the environment - a cloud session's environment variables - or, on a
// developer machine, from .env.local.
import { existsSync, readFileSync } from "node:fs";
import postgres from "postgres";

function connectionUrl() {
  const fromEnv = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (fromEnv) return fromEnv;
  if (!existsSync(".env.local")) return "";
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = line.match(/^\s*(POSTGRES_URL|DATABASE_URL)\s*=\s*(.*)$/);
    const value = match?.[2].trim().replace(/^["']|["']$/g, "");
    if (value && value !== "[SENSITIVE]") return value;
  }
  return "";
}

// [migration file, table, column] or [migration file, "constraint", constraint name, text its definition contains].
// Every schema-changing migration is listed; the two data-only ones (20260921120000_remove_receive_status,
// 20260923020000_reward_discount_backfill) leave nothing to look for and are skipped. Newest last.
const CHECKS = [
  ["20260916012411_cashier_permissions.sql", "members", "permissions"],
  ["20260916080000_sale_corrections.sql", "sales", "discount_reason"],
  ["20260917001000_purchase_orders.sql", "suppliers"],
  ["20260917010000_purchase_order_approval.sql", "constraint", "purchase_orders_status_check", "pending_approval"],
  ["20260921130000_job_cancel_status.sql", "constraint", "jobs_status_check", "ยกเลิก"],
  ["20260922000000_shop_contact_and_bank.sql", "config", "bank_name"],
  ["20260922010000_members.sql", "config", "member_stamps_required"],
  ["20260922020000_member_notes_and_pos_stamps.sql", "config", "customer_notes"],
  ["20260922030000_stock_counts.sql", "stock_counts"],
  ["20260922040000_manual_members.sql", "config", "manual_members"],
  ["20260922050000_job_slip.sql", "jobs", "slip"],
  ["20260923010000_member_promo_window.sql", "config", "member_promo_enabled"],
  ["20260923030000_job_pickup_at.sql", "jobs", "pickup_at"],
  ["20260924010000_job_customer_string.sql", "jobs", "customer_string"],
  ["20260924030000_member_socks_reward.sql", "config", "member_socks_stamps_required"],
  ["20260925010000_po_item_price.sql", "purchase_order_items", "price"],
  ["20260925020000_promotions.sql", "promotions"],
  ["20260925030000_string_price_info.sql", "config", "string_price_text"],
  ["20260925040000_product_inquiries.sql", "product_inquiries"],
  ["20260926010000_product_breakdowns.sql", "product_breakdowns"],
  ["20260926020000_po_payment_terms.sql", "purchase_orders", "payment_method"],
  ["20260926030000_line_members.sql", "line_members"],
  ["20260926040000_line_member_codes.sql", "line_members", "verify_code"],
];

const url = connectionUrl();
if (!url) {
  console.error("ไม่พบ POSTGRES_URL / DATABASE_URL (ตั้งใน environment variables หรือ .env.local)");
  process.exit(1);
}
const host = (() => { try { return new URL(url).hostname; } catch { return "(อ่าน host ไม่ได้)"; } })();
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 15, ssl: "require" });
try {
  const [{ now }] = await sql`SELECT now()::text AS now`;
  console.log(`✓ เชื่อมต่อฐานข้อมูลได้ (${host}) เวลาเซิร์ฟเวอร์ ${now}`);
  const pending = [];
  for (const [file, table, column, contains] of CHECKS) {
    const [row] = table === "constraint"
      ? await sql`SELECT COALESCE(bool_or(position(${contains} in pg_get_constraintdef(oid)) > 0), false) AS ok FROM pg_constraint WHERE conname=${column}`
      : column
      ? await sql`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=${table} AND column_name=${column}) AS ok`
      : await sql`SELECT to_regclass(${"public." + table}) IS NOT NULL AS ok`;
    console.log(`${row.ok ? "✓" : "✗"} ${file}`);
    if (!row.ok) pending.push(file);
  }
  console.log(pending.length ? `\nยังไม่ได้รัน ${pending.length} ไฟล์: ${pending.join(", ")}` : "\nรัน migration ครบทุกไฟล์แล้ว");
} catch (error) {
  console.error(`✗ เชื่อมต่อไม่ได้ (${host}): ${error.message}`);
  console.error("ถ้ารันบน Claude Code บนคลาวด์ ให้ตั้ง Network access ของ environment เป็น Custom (*.supabase.com) หรือ Full");
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
