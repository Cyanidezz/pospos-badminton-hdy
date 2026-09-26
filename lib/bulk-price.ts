// คลังสินค้า > เลือกหลายรายการ > แก้ราคาขาย. One rule for the preview in the browser and for the save on the server,
// so what the owner sees before saving is exactly what gets written. Prices are satang (integers).
export type BulkPriceMode = "set" | "add" | "percent";

export const BULK_PRICE_MODES: { id: BulkPriceMode; name: string }[] = [
  { id: "set", name: "ตั้งราคาเดียวกันทั้งหมด (บาท)" },
  { id: "add", name: "เพิ่ม / ลด เป็นบาท (ใส่ลบเพื่อลด)" },
  { id: "percent", name: "เพิ่ม / ลด เป็น % (ใส่ลบเพื่อลด)" },
];

// null = the value can't be used (empty, not a number, or the result would be negative).
export function bulkPrice(price: number, mode: BulkPriceMode, value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const current = Math.max(0, Math.round(Number(price) || 0));
  // A percentage lands on whole baht (฿352 rather than ฿351.75) - how a shop actually prices.
  const next = mode === "set" ? Math.round(n * 100)
    : mode === "add" ? current + Math.round(n * 100)
    : mode === "percent" ? Math.round(current * (1 + n / 100) / 100) * 100
    : NaN;
  return Number.isFinite(next) && next >= 0 && next <= 10_000_000_000 ? next : null;
}
