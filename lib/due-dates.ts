// Credit-PO due dates (เจ้าหนี้ค้างชำระ), shared by the PO page, the payables page and the sidebar badge - kept apart
// from those pages so the always-loaded POS shell doesn't have to pull them in just for the badge.
const localDate = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

// Days until a credit PO's due date (negative = overdue), counted in Thai calendar days.
export const daysUntil = (date: string) => Math.round((new Date(date + "T00:00:00").getTime() - new Date(localDate() + "T00:00:00").getTime()) / 86400000);
export const dueText = (date: string) => { const d = daysUntil(date); return d < 0 ? `เกินกำหนด ${-d} วัน` : d === 0 ? "ครบกำหนดวันนี้" : `อีก ${d} วัน`; };
// Approved credit POs whose debt hasn't been recorded as paid.
export const openDebts = (orders: any[]) => (orders || []).filter((o: any) => o.payment_method === "credit" && !o.paid_at && (o.status === "approved" || o.status === "received"));
