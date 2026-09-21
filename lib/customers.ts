// Returning-customer lookup for the "รับไม้ใหม่" form, built from the stringing job history.
// Pure functions (no imports) so the matching rules are easy to test.

export type CustomerRacket = { name: string; tension: string; last: string };
export type Customer = { key: string; name: string; phone: string; visits: number; last: string; rackets: CustomerRacket[] };

const digitsOf = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// One entry per phone number (or per name when a job has no phone), newest activity first.
// Cancelled jobs are ignored: they never became a visit.
export function buildCustomers(jobs: any[]): Customer[] {
  const customers = new Map<string, Customer>();
  const newestFirst = [...jobs].sort((a, b) => String(b.created).localeCompare(String(a.created)));
  for (const job of newestFirst) {
    if (job.status === "ยกเลิก") continue;
    const name = String(job.customer ?? "").trim();
    if (!name) continue;
    const key = digitsOf(job.phone) || `name:${name.toLowerCase()}`;
    let customer = customers.get(key);
    if (!customer) {
      customer = { key, name, phone: String(job.phone ?? "").trim(), visits: 0, last: String(job.created ?? ""), rackets: [] };
      customers.set(key, customer);
    }
    customer.visits += 1;
    const racket = String(job.racket ?? "").trim();
    if (racket && !customer.rackets.some(r => same(r.name, racket))) {
      customer.rackets.push({ name: racket, tension: String(job.tension ?? "").trim(), last: String(job.created ?? "") });
    }
  }
  return [...customers.values()];
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
