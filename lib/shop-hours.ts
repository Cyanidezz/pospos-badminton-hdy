// Shop opening hours: stored as JSON text in config.opening_hours, edited in "ตั้งค่าร้าน",
// shown to customers on the tracking page. Pure functions (no imports) so they are easy to test.

export type DayHours = [string, string] | null; // ["15:00","23:00"], or null when closed
export type WeekHours = Record<string, DayHours>; // keys "0".."6" (Sunday..Saturday)

export const DAY_NAMES = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
export const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

const MON_FRI: DayHours = ["15:00", "23:00"];
export const DEFAULT_SHOP = {
  phone: "080-539-0444",
  facebook: "https://www.facebook.com/profile.php?id=61583314268963",
  hours: { "0": null, "1": MON_FRI, "2": MON_FRI, "3": MON_FRI, "4": MON_FRI, "5": MON_FRI, "6": ["13:00", "21:00"] } as WeekHours,
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// Strict check for what the settings form sends. Throws a Thai message on bad input.
export function normalizeHours(input: any): WeekHours {
  const source = typeof input === "string" ? JSON.parse(input) : input;
  if (!source || typeof source !== "object") throw new Error("เวลาเปิดร้านไม่ถูกต้อง");
  const hours: WeekHours = {};
  for (let day = 0; day < 7; day++) {
    const value = source[String(day)] ?? source[day];
    if (value === null || value === undefined) { hours[String(day)] = null; continue; }
    if (!Array.isArray(value) || value.length !== 2 || !TIME.test(value[0]) || !TIME.test(value[1])) throw new Error(`เวลาเปิดร้านของวัน${DAY_NAMES[day]}ไม่ถูกต้อง`);
    if (value[0] >= value[1]) throw new Error(`เวลาปิดต้องหลังเวลาเปิด (วัน${DAY_NAMES[day]})`);
    hours[String(day)] = [value[0], value[1]];
  }
  return hours;
}

// Lenient read for display: falls back to the defaults when nothing valid is saved.
export function parseHours(value: unknown): WeekHours {
  if (!value) return DEFAULT_SHOP.hours;
  try { return normalizeHours(value as any); } catch { return DEFAULT_SHOP.hours; }
}

const dot = (time: string) => time.replace(":", ".");

// One display row per run of consecutive days with identical hours, e.g. "จันทร์ – ศุกร์  15.00 – 23.00 น.".
export function groupHours(hours: WeekHours) {
  const key = (day: number) => (hours[String(day)] ? hours[String(day)]!.join("-") : "closed");
  const rows: { label: string; time: string; days: number[]; open: string | null; close: string | null }[] = [];
  for (const day of DISPLAY_ORDER) {
    const last = rows[rows.length - 1];
    if (last && key(last.days[last.days.length - 1]) === key(day)) { last.days.push(day); continue; }
    const value = hours[String(day)];
    rows.push({ label: "", time: value ? `${dot(value[0])} – ${dot(value[1])} น.` : "หยุด", days: [day], open: value?.[0] ?? null, close: value?.[1] ?? null });
  }
  for (const row of rows) row.label = row.days.length === 1 ? DAY_NAMES[row.days[0]] : `${DAY_NAMES[row.days[0]]} – ${DAY_NAMES[row.days[row.days.length - 1]]}`;
  return rows;
}

// Current weekday and minutes since midnight in Thailand time.
export function bangkokNow(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date).map(part => [part.type, part.value]));
  return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday), minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute) };
}

export function isOpenNow(hours: WeekHours, now = bangkokNow()) {
  const today = hours[String(now.day)];
  if (!today) return false;
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  return now.minutes >= minutes(today[0]) && now.minutes < minutes(today[1]);
}
