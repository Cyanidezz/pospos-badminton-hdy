// Returning-customer lookup for the "รับไม้ใหม่" form, built from the stringing job history.
// Pure functions (no imports) so the matching rules are easy to test.

export type CustomerRacket = { name: string; tension: string; last: string };
export type Customer = {
  key: string; name: string; phone: string;
  visits: number; last: string; rackets: CustomerRacket[];
  // Stamp card: one stamp per paid stringing job (free reward jobs do not earn stamps).
  stamps: number; need: number; earned: number; used: number; available: number; progress: number;
  spent: number; // satang: paid stringing jobs + linked POS bills
  jobs: any[]; sales: any[]; // newest first
};

const digitsOf = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export const DEFAULT_STAMPS_REQUIRED = 10;

// One entry per phone number (or per name when a job has no phone), newest activity first.
// Cancelled jobs are ignored: they never became a visit.
export function buildCustomers(jobs: any[], { stampsRequired = DEFAULT_STAMPS_REQUIRED, sales = [] }: { stampsRequired?: number; sales?: any[] } = {}): Customer[] {
  const need = Math.max(1, Math.round(Number(stampsRequired)) || DEFAULT_STAMPS_REQUIRED);
  const customers = new Map<string, Customer>();
  const newestFirst = [...jobs].sort((a, b) => String(b.created).localeCompare(String(a.created)));
  for (const job of newestFirst) {
    if (job.status === "ยกเลิก") continue;
    const name = String(job.customer ?? "").trim();
    if (!name) continue;
    const key = digitsOf(job.phone) || `name:${name.toLowerCase()}`;
    let customer = customers.get(key);
    if (!customer) {
      customer = { key, name, phone: String(job.phone ?? "").trim(), visits: 0, last: String(job.created ?? ""), rackets: [], stamps: 0, need, earned: 0, used: 0, available: 0, progress: 0, spent: 0, jobs: [], sales: [] };
      customers.set(key, customer);
    }
    customer.visits += 1;
    customer.jobs.push(job);
    if (job.reward_used === 1) customer.used += 1;
    else if (job.paid) customer.stamps += 1;
    if (job.paid) customer.spent += Number(job.amount) || 0;
    const racket = String(job.racket ?? "").trim();
    if (racket && !customer.rackets.some(r => same(r.name, racket))) {
      customer.rackets.push({ name: racket, tension: String(job.tension ?? "").trim(), last: String(job.created ?? "") });
    }
  }
  for (const sale of [...sales].sort((a, b) => String(b.created).localeCompare(String(a.created)))) {
    const customer = sale.customer_key ? customers.get(String(sale.customer_key)) : undefined;
    if (!customer || sale.status === "voided") continue;
    customer.sales.push(sale);
    customer.spent += Number(sale.total) || 0;
    if (String(sale.created) > customer.last) customer.last = String(sale.created);
  }
  for (const customer of customers.values()) {
    customer.earned = Math.floor(customer.stamps / need);
    customer.progress = customer.stamps % need;
    customer.available = Math.max(0, customer.earned - customer.used);
  }
  return [...customers.values()].sort((a, b) => b.last.localeCompare(a.last));
}

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

export const phoneDigits = digitsOf;
