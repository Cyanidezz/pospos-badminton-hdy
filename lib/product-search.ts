// Finding the shop's products from what a customer types on LINE ("lining no1 เท่าไหร่", "มีกริป yonex ไหม").
// Pure functions (no database, no network) so the matching is easy to test. Used on its own when the AI is off or
// fails (the "rule" fallback), and to pick the shortlist the AI chooses from - so it never sees the whole catalogue.

export type SearchProduct = { id: string; name: string; category?: string | null; aliases?: string | null };

// Brand names customers write many ways (Thai spelling, with/without the dash) -> one spelling.
const BRANDS: [string, RegExp][] = [
  ["lining", /li[\s.\-_]*ning|หลี่\s*หนิง|หลี\s*หนิง|ลี่\s*หนิง|ลี\s*หนิง|ลินนิ่ง|ลีนิง|หลีนิง/g],
  ["yonex", /yo[\s\-]*nex|โย\s*เน็?[กค]ซ์?|โยเนก|โยแน็กซ์/g],
  ["victor", /วิ[คก]เตอร์/g],
  ["mizuno", /มิซูโน่?/g],
  ["apacs", /อาแพ[คค]ส?/g],
  ["kawasaki", /คาวาซากิ/g],
  ["felet", /เฟเลท|เฟเล็ท/g],
  ["babolat", /บาโบ?ลาต/g],
];

// "no.1", "no 1", "เบอร์ 1", "number 1", "นัมเบอร์1" -> "no1".
const NUMBER_WORDS = /(?:no\.?|number|nr\.?|เบอร์|นัมเบอร์|หมายเลข)\s*(?=\d)/g;

// Words that are about asking, not about the product - dropped before matching. Only words unlikely to sit inside
// a product name (Thai has no spaces, so "มี" alone would also cut "มีเดียม").
const FILLER = [
  "สอบถาม", "ขอถาม", "ขอสอบถาม", "ราคา", "เท่าไหร่", "เท่าไร", "เท่าไห", "กี่บาท", "บาท", "ยังมี", "มีไหม", "มีมั้ย", "มีมั๊ย", "มีป่าว", "มีขาย",
  "ขายไหม", "ขายมั้ย", "เหลือไหม", "เหลือมั้ย", "เหลือ", "มีของ", "ของ", "ไหม", "มั้ย", "มั๊ย", "ครับ", "คับ", "ค่ะ", "คะ", "ค่า", "จ้า", "จ้ะ", "นะ",
  "หน่อย", "บ้าง", "อะไร", "อยากได้", "อยากซื้อ", "สั่งซื้อ", "หาซื้อ", "ต้องการ", "ยี่ห้อ", "ทั้งหมด", "ที่มีสินค้า", "มีสินค้า", "สินค้า", "ในร้าน", "ที่ร้าน", "พร้อมขาย",
  "price", "how much", "do you have", "available", "please",
].sort((a, b) => b.length - a.length);

// A message that is clearly asking about buying / price / stock (used when the AI isn't available).
export const PRODUCT_INTENT = /ราคา|เท่าไหร่|เท่าไร|เท่าไห|กี่บาท|มีไหม|มีมั้ย|มีมั๊ย|มีป่าว|มีขาย|ขายไหม|ขายมั้ย|เหลือไหม|เหลือมั้ย|ยังมี|มีของ|หาซื้อ|อยากได้|อยากซื้อ|สั่งซื้อ|price|how much|in stock/i;

// Product kinds a customer names in Thai; a category whose own name contains the key counts as that kind.
const KINDS: [string, RegExp][] = [
  ["เอ็น", /เอ็น|string/],
  ["กริป", /กริป|grip|ด้ามจับ|พันด้าม/],
  ["รองเท้า", /รองเท้า|shoe/],
  ["ถุงเท้า", /ถุงเท้า|sock/],
  ["ลูกแบด", /ลูกแบด|ลูกขนไก่|shuttle/],
  ["ไม้", /ไม้แบด|racket|racquet|ไม้/],
  ["กระเป๋า", /กระเป๋า|bag/],
  ["เสื้อ", /เสื้อ|shirt/],
];

export function normalize(value: string) {
  let s = String(value || "").normalize("NFKC").toLowerCase();
  for (const [brand, pattern] of BRANDS) s = s.replace(pattern, ` ${brand} `);
  s = s.replace(NUMBER_WORDS, "no");
  // Space between Thai and Latin/digits so "เอ็นyonexราคา" splits into words.
  s = s.replace(/([฀-๿])(?=[a-z0-9])/g, "$1 ").replace(/([a-z0-9])(?=[฀-๿])/g, "$1 ");
  return s.replace(/[^a-z0-9฀-๿]+/g, " ").replace(/\s+/g, " ").trim();
}

const compact = (value: string) => value.replace(/\s+/g, "");

// The part of a message that names the thing: normalized, asking words removed.
export function coreQuery(message: string) {
  let s = normalize(message);
  for (const word of FILLER) s = s.split(normalize(word)).join(" ");
  return s.replace(/\s+/g, " ").trim();
}

const trigrams = (value: string) => {
  const s = `  ${value} `;
  const grams = new Set<string>();
  for (let i = 0; i < s.length - 2; i++) grams.add(s.slice(i, i + 3));
  return grams;
};
const dice = (a: string, b: string) => {
  if (!a || !b) return 0;
  const x = trigrams(a), y = trigrams(b);
  let common = 0;
  for (const g of x) if (y.has(g)) common++;
  return (2 * common) / (x.size + y.size);
};

const kindOf = (text: string) => KINDS.filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind);

// 0..1: how well one of the product's names (its own name, or one of the shop's "ชื่อที่ลูกค้าเรียก") matches.
function scoreName(core: string, field: string) {
  const name = normalize(field);
  const q = compact(core), n = compact(name);
  if (!q || !n) return 0;
  if (q.includes(n) || (q.length >= 4 && n.includes(q) && q.length >= n.length * 0.6)) return 1;
  // Word coverage both ways, model numbers (anything with a digit - bg80, no1, 88d) weighing double since they are
  // what tells two products of one brand apart:
  //  - of the product's name: "lining no1 boost blue" typed in full;
  //  - of what the customer typed: "bg80" is all there in "เอ็น Yonex BG80 Power Red", so every BG80 scores high
  //    (and gets listed together - most products here are one model in several colours).
  const covered = (words: string[], within: string) => {
    let total = 0, hit = 0;
    for (const word of words.filter(w => w.length >= 2)) {
      const weight = /\d/.test(word) ? 2 : 1;
      total += word.length * weight;
      if (within.includes(word)) hit += word.length * weight;
    }
    return total ? hit / total : 0;
  };
  let score = Math.max(covered(name.split(" "), q), covered(core.split(" "), n) * 0.85, dice(q, n) * 0.9);
  // A model number the customer typed that this product doesn't have means it is a different product.
  const typedModels = core.split(" ").filter(w => (/\d/.test(w) && /[a-z\u0E00-\u0E7F]/.test(w)) || /^\d{2,}$/.test(w));
  if (typedModels.length && !typedModels.some(m => n.includes(m))) score *= 0.5;
  return score;
}

export type Match = { product: SearchProduct; score: number };

export function searchProducts(message: string, products: SearchProduct[]): Match[] {
  const core = coreQuery(message);
  const kinds = kindOf(normalize(message));
  const brands = BRANDS.map(([brand]) => brand).filter(brand => normalize(message).split(" ").includes(brand));
  const matches: Match[] = [];
  for (const product of products) {
    const names = [product.name, ...String(product.aliases || "").split(/[,\n]/)].map(x => x.trim()).filter(Boolean);
    let score = core ? Math.max(...names.map(n => scoreName(core, n))) : 0;
    const productKinds = kindOf(normalize(`${product.category || ""} ${product.name}`));
    if (kinds.length && kinds.some(k => productKinds.includes(k))) score = Math.max(score + 0.15, 0.45);
    else if (kinds.length && productKinds.length) score *= 0.7; // asked for grips, this is a string
    // Asked for a brand, this is another one.
    if (brands.length && !brands.some(brand => names.some(n => normalize(n).split(" ").includes(brand)))) score *= 0.5;
    if (score >= 0.3) matches.push({ product, score: Math.min(1, score) });
  }
  return matches.sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
}

// What the rule-based fallback does with the ranking: one clear winner, a short list to choose from, or nothing.
// "เอ็น yonex มีอะไรบ้าง" scores every Yonex string about the same, so it lists them rather than guessing one.
export function pickMatches(matches: Match[]) {
  const candidates = matches.filter(m => m.score >= 0.45);
  if (!candidates.length) return { kind: "none" as const, products: [] };
  const [top, next] = candidates;
  if (candidates.length === 1 || (top.score >= 0.6 && top.score - next.score >= 0.15)) return { kind: "one" as const, products: [top.product] };
  // Near-equal matches (one model in several colours) are all listed; weaker ones only fill up a short list.
  const close = candidates.filter(m => m.score >= top.score - 0.1);
  const list = close.length >= 5 ? close : candidates;
  return { kind: "many" as const, products: list.map(m => m.product) };
}

// A key for grouping "what customers asked for" so "Lining No.1" and "lining no1" count as one request.
export const inquiryKey = (message: string) => compact(coreQuery(message)).slice(0, 120);

// "ขึ้นเอ็นเท่าไหร่" / "ราคาเอ็น" - asking about stringing in general, not one string: the shop's own price sheet
// (ราคาขึ้นเอ็น) answers that better than a list of every string.
export const isGeneralStringingQuestion = (message: string) => /^(ค่า)?(ขึ้น)?เอ็น(แบด(มินตัน)?)?$/.test(compact(coreQuery(message)));
