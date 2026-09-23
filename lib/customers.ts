// Members ("ลูกค้าสมาชิก"): customers found from the stringing job history and from POS bills that
// were linked to a member. Pure functions (no imports) so the rules are easy to test.

export type CustomerRacket = { name: string; tension: string; last: string };
export type Customer = {
  key: string; name: string; phone: string;
  visits: number; last: string; rackets: CustomerRacket[];
  // Stamp card: one stamp per paid stringing job and per POS bill linked to the member
  // (free reward jobs earn no stamp; POS bills below the minimum amount earn none).
  stamps: number; jobStamps: number; posStamps: number;
  need: number; earned: number; used: number; available: number; progress: number;
  spent: number; // satang: paid stringing jobs + linked POS bills
  jobs: any[]; sales: any[]; // newest first
  note: string;
};

const digitsOf = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export const DEFAULT_STAMPS_REQUIRED = 10;
export const phoneDigits = digitsOf;

// 0812345678 -> 081-234-5678 (other lengths are left as digits)
export function formatPhone(value: string) {
  const digits = digitsOf(value);
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : digits;
}

export type Promo = { enabled?: boolean; start?: string | null; end?: string | null } | null;
type Options = { stampsRequired?: number; sales?: any[]; posMinAmount?: number; notes?: Record<string, string> | null; manualMembers?: Record<string, { name: string; phone: string }> | null; promo?: Promo };

// Does a visit on this date earn a stamp under the shop's promotion window ("1 ต.ค. 2569 - 31 ธ.ค. 2569", say)? No
// `promo` at all means the feature isn't configured (or the caller didn't pass it) - unrestricted, same as before
// this existed. `enabled: false` stops every new stamp outright; a set start/end only counts visits inside it.
// A reward already earned is unaffected either way - this only gates new stamps, never takes one back.
export function withinPromo(dateIso: string, promo?: Promo): boolean {
  if (!promo) return true;
  if (promo.enabled === false) return false;
  const day = String(dateIso ?? "").slice(0, 10);
  if (promo.start && day < promo.start) return false;
  if (promo.end && day > promo.end) return false;
  return true;
}

// Reads the promo window straight off the config row (however it was fetched: SELECT * on the server, or the
// `config` the client already has). Before the migration is run the columns are simply missing, which this reads
// the same as "not configured" - unrestricted, exactly the behavior before this feature existed.
export function promoOf(config: any): Promo {
  if (!config || !("member_promo_enabled" in config)) return null;
  return { enabled: config.member_promo_enabled !== 0, start: config.member_promo_start || null, end: config.member_promo_end || null };
}

function emptyCustomer(key: string, name: string, phone: string, last: string, need: number, note: string): Customer {
  return { key, name, phone, visits: 0, last, rackets: [], stamps: 0, jobStamps: 0, posStamps: 0, need, earned: 0, used: 0, available: 0, progress: 0, spent: 0, jobs: [], sales: [], note };
}

// One entry per phone number (or per name when a job has no phone), newest activity first.
// Cancelled jobs and voided bills are ignored: they never became a visit.
export function buildCustomers(jobs: any[], { stampsRequired = DEFAULT_STAMPS_REQUIRED, sales = [], posMinAmount = 0, notes = {}, manualMembers = {}, promo = null }: Options = {}): Customer[] {
  const need = Math.max(1, Math.round(Number(stampsRequired)) || DEFAULT_STAMPS_REQUIRED);
  const minAmount = Math.max(0, Number(posMinAmount) || 0);
  const noteOf = (key: string) => String((notes || {})[key] ?? "");
  const customers = new Map<string, Customer>();
  const newestFirst = (list: any[]) => [...list].sort((a, b) => String(b.created).localeCompare(String(a.created)));

  for (const job of newestFirst(jobs)) {
    if (job.status === "ยกเลิก") continue;
    const name = String(job.customer ?? "").trim();
    if (!name) continue;
    const key = digitsOf(job.phone) || `name:${name.toLowerCase()}`;
    let customer = customers.get(key);
    if (!customer) {
      customer = emptyCustomer(key, name, String(job.phone ?? "").trim(), String(job.created ?? ""), need, noteOf(key));
      customers.set(key, customer);
    }
    customer.visits += 1;
    customer.jobs.push(job);
    if (job.reward_used === 1) customer.used += 1;
    else if (job.paid && withinPromo(job.created, promo)) { customer.stamps += 1; customer.jobStamps += 1; }
    if (job.paid) customer.spent += Number(job.amount) || 0;
    const racket = String(job.racket ?? "").trim();
    if (racket && !customer.rackets.some(r => same(r.name, racket))) {
      customer.rackets.push({ name: racket, tension: String(job.tension ?? "").trim(), last: String(job.created ?? "") });
    }
  }

  for (const sale of newestFirst(sales)) {
    if (!sale.customer_key || sale.status === "voided") continue;
    const key = String(sale.customer_key);
    let customer = customers.get(key);
    if (!customer) { // a member who has only shopped at the POS
      const name = String(sale.customer_name ?? "").trim() || key;
      customer = emptyCustomer(key, name, /^\d+$/.test(key) ? formatPhone(key) : "", String(sale.created ?? ""), need, noteOf(key));
      customers.set(key, customer);
    }
    const total = Number(sale.total) || 0;
    customer.sales.push(sale);
    customer.visits += 1;
    customer.spent += total;
    if (!sale.job_id && total >= minAmount && withinPromo(sale.created, promo)) { customer.stamps += 1; customer.posStamps += 1; }
    if (String(sale.created) > customer.last) customer.last = String(sale.created);
  }

  // Members added by hand before they ever had a job or a sale (see the "เพิ่มสมาชิกใหม่" button): they show up
  // with no visits yet. Real activity always wins, so this never overwrites a customer already built above.
  for (const [key, member] of Object.entries(manualMembers || {})) {
    if (customers.has(key)) continue;
    customers.set(key, emptyCustomer(key, String(member?.name ?? "").trim() || key, String(member?.phone ?? "").trim(), "", need, noteOf(key)));
  }

  for (const customer of customers.values()) {
    customer.earned = Math.floor(customer.stamps / need);
    customer.progress = customer.stamps % need;
    customer.available = Math.max(0, customer.earned - customer.used);
  }
  return [...customers.values()].sort((a, b) => b.last.localeCompare(a.last));
}

// Does a POS bill earn a stamp? (linked to a member, not a job payment, big enough, and within the promo window)
export function billEarnsStamp(sale: any, posMinAmount = 0, promo: Promo = null) {
  return !!sale.customer_key && sale.status !== "voided" && !sale.job_id && (Number(sale.total) || 0) >= Math.max(0, Number(posMinAmount) || 0) && withinPromo(sale.created, promo);
}

// The discount reason on the bill of a job paid with a member reward (the POS dashboard totals these up).
export const REWARD_REASON = "สิทธิ์สมาชิก: ขึ้นเอ็นฟรี";

// What a free-stringing reward takes off a job price (satang). `cap` is null/undefined for the whole job.
export function rewardDiscount(price: number, cap?: number | null) {
  return cap === null || cap === undefined ? price : Math.min(price, cap);
}

// Suggestions for what staff are typing in the name or phone box.
export function matchCustomers(customers: Customer[], query: string, field: "name" | "phone", limit = 5): Customer[] {
  const text = query.trim().toLowerCase();
  const digits = digitsOf(query);
  const found = customers.filter(customer => {
    const phoneMatch = digits.length >= 3 && digitsOf(customer.phone).includes(digits);
    if (field === "phone") return phoneMatch;
    return (text.length >= 1 && customer.name.toLowerCase().includes(text)) || phoneMatch;
  });
  return found.slice(0, limit);
}

// Every racket seen before, most used first, for the racket box's autocomplete.
export function knownRackets(jobs: any[], limit = 200): string[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const job of jobs) {
    if (job.status === "ยกเลิก") continue;
    const name = String(job.racket ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { name, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit).map(entry => entry.name);
}
