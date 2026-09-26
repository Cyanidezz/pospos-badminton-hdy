import { all, db, now, one, runtime } from "./server";
import { memberProgram, memberStatus } from "./member-status";
import { readLineToken, signLineToken } from "./line-token";

// สมาชิกผ่าน LINE (table line_members, see its migration). The sign-up / member page is an ordinary web page opened
// from a button in the LINE chat, so it needs to know WHICH LINE account opened it without a LINE login: the button
// carries a token signed with the channel secret (never shown to anyone) that names the LINE user and expires.

// The member page's link token (signing lives in lib/line-token.ts, keyed on the channel secret).
export const memberToken = (lineUser: string) => signLineToken(lineUser, runtime().LINE_CHANNEL_SECRET || "");
export const readMemberToken = (token: unknown) => readLineToken(token, runtime().LINE_CHANNEL_SECRET || "");

export const lineMembersReady = async () => !!((await one("SELECT to_regclass('public.line_members') AS t")) as any)?.t;
export const digitsOf = (phone: unknown) => String(phone ?? "").replace(/\D/g, "");
export const maskPhone = (digits: string) => digits.length >= 9 ? `${digits.slice(0, 3)}-xxx-${digits.slice(-4)}` : digits;

// Does this number already have a history at the shop (so its stamps / jobs are someone's to protect)?
// (jsonb's own "?" operator can't be used here - every "?" is a bind placeholder - hence ->? IS NOT NULL; and
// manual_members is read through to_jsonb(config) so a not-yet-run 20260922040000 migration isn't an error.)
export async function phoneHasHistory(digits: string) {
  const row: any = await one(`SELECT EXISTS(SELECT 1 FROM jobs WHERE regexp_replace(phone,'\\D','','g')=? AND status<>'ยกเลิก')
      OR EXISTS(SELECT 1 FROM sales WHERE customer_key=? AND status='active')
      OR COALESCE((SELECT (to_jsonb(config)->'manual_members'->?) IS NOT NULL FROM config WHERE id=1),false) AS used`, digits, digits, digits);
  return !!row?.used;
}

// A LINE account's phones. Accounts that linked a receipt the old way (sending "LINK ..." after scanning the QR)
// already proved they hold that job, so those phones are recorded as verified the first time this is asked.
export async function linePhones(lineUser: string): Promise<{ phone: string; name: string; status: string; method: string; created: string }[]> {
  const legacy: any[] = await all("SELECT DISTINCT ON (regexp_replace(phone,'\\D','','g')) regexp_replace(phone,'\\D','','g') AS phone,customer FROM jobs WHERE line_user=? ORDER BY regexp_replace(phone,'\\D','','g'),created DESC", lineUser);
  const stamp = now();
  for (const job of legacy) if (/^\d{9,10}$/.test(job.phone)) await db().prepare("INSERT INTO line_members(line_user,phone,name,status,method,created,verified_at) VALUES(?,?,?,'verified','link',?,?) ON CONFLICT (line_user,phone) DO UPDATE SET status='verified',method=CASE WHEN line_members.status='verified' THEN line_members.method ELSE 'link' END,verified_at=COALESCE(line_members.verified_at,EXCLUDED.verified_at)").bind(lineUser, job.phone, String(job.customer || "").slice(0, 100), stamp, stamp).run();
  return (await all("SELECT phone,name,status,method,created FROM line_members WHERE line_user=? ORDER BY status DESC,created", lineUser)) as any[];
}

export type RegisterResult = { status: "verified" | "pending"; method: string; phone: string };

// สมัครสมาชิก / เพิ่มเบอร์. A number new to the shop is verified straight away (and becomes a member, like
// "เพิ่มสมาชิก" on the website). A number with history needs proof: the number (#XXXXXXXX) of any of its stringing
// receipts - or it waits for a staff member to approve it on the ลูกค้าสมาชิก page.
export async function registerLineMember({ lineUser, name, phone, jobNumber }: { lineUser: string; name: string; phone: string; jobNumber?: string }): Promise<RegisterResult> {
  const digits = digitsOf(phone), cleanName = String(name || "").trim().slice(0, 100);
  if (!/^0\d{8,9}$/.test(digits)) throw new Error("เบอร์โทรไม่ถูกต้อง (ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0)");
  if (!cleanName) throw new Error("กรุณากรอกชื่อ");
  const existing: any = await one("SELECT status FROM line_members WHERE line_user=? AND phone=?", lineUser, digits);
  if (existing?.status === "verified") {
    await db().prepare("UPDATE line_members SET name=? WHERE line_user=? AND phone=?").bind(cleanName, lineUser, digits).run();
    return { status: "verified", method: "", phone: digits };
  }
  const stamp = now();
  let method = "";
  if (!(await phoneHasHistory(digits))) method = "new";
  else {
    const code = String(jobNumber || "").replace(/[^0-9a-f]/gi, "").toLowerCase();
    if (code.length >= 6 && (await one("SELECT 1 FROM jobs WHERE regexp_replace(phone,'\\D','','g')=? AND lower(left(id,8)) LIKE ? AND status<>'ยกเลิก'", digits, `${code.slice(0, 8)}%`))) method = "job";
  }
  const status = method ? "verified" : "pending";
  const statements = [db().prepare("INSERT INTO line_members(line_user,phone,name,status,method,created,verified_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT (line_user,phone) DO UPDATE SET name=EXCLUDED.name,status=EXCLUDED.status,method=EXCLUDED.method,verified_at=EXCLUDED.verified_at").bind(lineUser, digits, cleanName, status, method, stamp, method ? stamp : null)];
  // A brand-new number joins the member list the same way "เพิ่มสมาชิก" on the website does (config.manual_members).
  // Skipped (the LINE link alone still makes them a member) if that migration hasn't run.
  const hasManual = !!(await one("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='config' AND column_name='manual_members'"));
  if (method === "new" && hasManual) statements.push(db().prepare("UPDATE config SET manual_members=COALESCE(manual_members,'{}'::jsonb)||jsonb_build_object(?::text,jsonb_build_object('name',?::text,'phone',?::text)) WHERE id=1 AND (COALESCE(manual_members,'{}'::jsonb)->?) IS NULL").bind(digits, cleanName, digits, digits));
  // Verified: the customer's open jobs on that number start sending LINE updates here too.
  if (method) statements.push(db().prepare("UPDATE jobs SET line_user=? WHERE regexp_replace(phone,'\\D','','g')=? AND line_user IS NULL AND status NOT IN ('ยกเลิก','คืนไม้แล้ว')").bind(lineUser, digits));
  await db().batch(statements);
  return { status, method, phone: digits };
}

// Everything the member page shows for one LINE account: each phone, its stamp card, its jobs still at the shop.
export async function memberView(lineUser: string) {
  const phones = await linePhones(lineUser);
  const config: any = await one("SELECT * FROM config WHERE id=1");
  const cards = [];
  for (const row of phones) {
    const verified = row.status === "verified";
    cards.push({
      phone: row.phone, name: row.name, status: row.status, method: row.method,
      member: verified ? await memberStatus(config, row.phone) : null,
      jobs: verified ? await all("SELECT token,racket,status,paid,amount,created FROM jobs WHERE regexp_replace(phone,'\\D','','g')=? AND status NOT IN ('ยกเลิก','คืนไม้แล้ว') ORDER BY created DESC LIMIT 10", row.phone) : [],
    });
  }
  return { phones: cards, program: await memberProgram(config || {}), shop: config?.shop || "Wingpro" };
}
