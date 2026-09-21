// Stock counting rules shared by the API and the counting screens. Pure functions (no imports) so they are easy to test.

export const COUNT_REASONS = ["ของหาย", "ของเสีย / ชำรุด", "รับเข้าผิด / สแกนผิดตัว", "นับผิด / ปรับตามการนับ"];

export type CountItem = {
  product_id: string; name: string; category: string; unit?: string;
  barcode?: string; scan_code?: string | null;
  expected: number | null; // hidden (null) while counting
  counted: number; touched: number; applied?: number; reason?: string | null;
  has_stock?: boolean; cost?: number | null;
};

const cost = (item: CountItem) => Number(item.cost) || 0;
export const diffOf = (item: CountItem) => item.counted - (item.expected ?? 0);
export const diffValue = (item: CountItem) => Math.abs(diffOf(item)) * cost(item);

// Split a finished count into missing (counted < system), surplus (counted > system) and matching items.
// An item nobody scanned counts as 0, so a product the system says is in stock but was never found is "missing".
export function classify(items: CountItem[]) {
  const missing = items.filter(i => diffOf(i) < 0).sort((a, b) => diffValue(b) - diffValue(a) || a.name.localeCompare(b.name));
  const surplus = items.filter(i => diffOf(i) > 0).sort((a, b) => diffValue(b) - diffValue(a) || a.name.localeCompare(b.name));
  const matched = items.filter(i => diffOf(i) === 0);
  const sum = (list: CountItem[]) => list.reduce((total, i) => total + diffValue(i), 0);
  return { missing, surplus, matched, missingValue: sum(missing), surplusValue: sum(surplus), missingUnits: missing.reduce((n, i) => n - diffOf(i), 0), surplusUnits: surplus.reduce((n, i) => n + diffOf(i), 0) };
}

export type Swap = { missing: CountItem; surplus: CountItem; qty: number; similarCost: boolean };

// A product that is short by N next to one in the same category that is over by N was probably sold, received or
// counted under the wrong barcode, not lost. Each product is suggested at most once.
export function possibleSwaps(items: CountItem[]): Swap[] {
  const { missing, surplus } = classify(items);
  const used = new Set<string>();
  const swaps: Swap[] = [];
  for (const m of missing) {
    const qty = -diffOf(m);
    const candidates = surplus.filter(s => !used.has(s.product_id) && s.category === m.category && diffOf(s) === qty);
    if (!candidates.length) continue;
    const near = (s: CountItem) => cost(m) > 0 && cost(s) > 0 ? Math.abs(Math.log(cost(s) / cost(m))) : Infinity;
    candidates.sort((a, b) => near(a) - near(b));
    const s = candidates[0];
    used.add(s.product_id);
    swaps.push({ missing: m, surplus: s, qty, similarCost: near(s) <= Math.log(2) });
  }
  return swaps;
}

// Default reason offered for a row in the review screen.
export function defaultReason(item: CountItem, swappedIds: Set<string> = new Set()) {
  if (swappedIds.has(item.product_id)) return COUNT_REASONS[2];
  return diffOf(item) < 0 ? COUNT_REASONS[0] : COUNT_REASONS[3];
}

// Progress while counting: how many products the system says are in stock have been counted.
export function progress(items: CountItem[]) {
  const shouldHave = items.filter(i => i.has_stock);
  const counted = shouldHave.filter(i => i.touched).length;
  return { shouldHave: shouldHave.length, counted, remaining: shouldHave.length - counted, units: items.reduce((n, i) => n + i.counted, 0), products: items.filter(i => i.touched).length };
}
