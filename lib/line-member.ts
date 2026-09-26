import { randomInt } from "node:crypto";
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
// The verification codes (20260926040000_line_member_codes.sql). Without them nobody can be verified at the counter.
const codesReady = async () => !!(await one("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='line_members' AND column_name='verify_code'"));
const CODES_MIGRATION = "ระบบยืนยันสมาชิกยังไม่พร้อม (ร้านต้องรัน migration 20260926040000_line_member_codes.sql)";
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

// A 6-digit code no other waiting request is using. Only the customer's own member page shows it (and staff type it
// in) - it is what proves the person at the counter is the one who signed up in LINE.
async function freshCode() {
  for (let i = 0; i < 20; i++) {
    const code = String(randomInt(0, 1000000)).padStart(6, "0");
    if (!(await one("SELECT 1 FROM line_members WHERE verify_code=? AND status='pending'", code))) return code;
  }
  throw new Error("สร้างรหัสยืนยันไม่สำเร็จ กรุณาลองอีกครั้ง");
}

// สมัครสมาชิก / เพิ่มเบอร์. Knowing a phone number proves nothing (anyone can type anyone's), so every request waits
// ('pending') until one of: the customer shows staff the code on their member page, or scans the QR on a stringing
// receipt for that number (onLink). Until then nothing about the number is shown to this LINE account and its jobs
// don't notify it.
export async function registerLineMember({ lineUser, name, phone }: { lineUser: string; name: string; phone: string }): Promise<RegisterResult> {
  const digits = digitsOf(phone), cleanName = String(name || "").trim().slice(0, 100);
  if (!/^0\d{8,9}$/.test(digits)) throw new Error("เบอร์โทรไม่ถูกต้อง (ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0)");
  if (!cleanName) throw new Error("กรุณากรอกชื่อ");
  if (!(await codesReady())) throw new Error(CODES_MIGRATION);
  const existing: any = await one("SELECT status,verify_code FROM line_members WHERE line_user=? AND phone=?", lineUser, digits);
  if (existing?.status === "verified") {
    await db().prepare("UPDATE line_members SET name=? WHERE line_user=? AND phone=?").bind(cleanName, lineUser, digits).run();
    return { status: "verified", method: "", phone: digits };
  }
  if ((await all("SELECT 1 FROM line_members WHERE line_user=? AND status='pending'", lineUser)).length >= 5 && !existing) throw new Error("มีเบอร์รอยืนยันอยู่หลายเบอร์แล้ว กรุณายืนยันที่ร้านก่อน");
  const code = existing?.verify_code || (await freshCode()), stamp = now();
  await db().prepare("INSERT INTO line_members(line_user,phone,name,status,method,created,verify_code,code_created) VALUES(?,?,?,'pending','',?,?,?) ON CONFLICT (line_user,phone) DO UPDATE SET name=EXCLUDED.name,verify_code=COALESCE(line_members.verify_code,EXCLUDED.verify_code),code_created=COALESCE(line_members.code_created,EXCLUDED.code_created)").bind(lineUser, digits, cleanName, stamp, code, stamp).run();
  return { status: "pending", method: "", phone: digits };
}

// The receipt QR ("LINK <token>"): whoever holds the paper receipt owns that job's number - verify it for this LINE
// account, and let its open jobs notify it.
export async function verifyByReceipt(lineUser: string, phone: string, name: string) {
  const digits = digitsOf(phone);
  if (!/^\d{9,10}$/.test(digits)) return;
  const stamp = now(), clearCode = (await codesReady()) ? ",verify_code=NULL" : "";
  await db().batch([
    db().prepare(`INSERT INTO line_members(line_user,phone,name,status,method,created,verified_at) VALUES(?,?,?,'verified','link',?,?) ON CONFLICT (line_user,phone) DO UPDATE SET status='verified',method=CASE WHEN line_members.status='verified' THEN line_members.method ELSE 'link' END,verified_at=COALESCE(line_members.verified_at,EXCLUDED.verified_at)${clearCode}`).bind(lineUser, digits, String(name || "").slice(0, 100), stamp, stamp),
    db().prepare("UPDATE jobs SET line_user=? WHERE regexp_replace(phone,'\\D','','g')=? AND line_user IS NULL AND status NOT IN ('ยกเลิก','คืนไม้แล้ว')").bind(lineUser, digits),
  ]);
}

// Everything the member page shows for one LINE account: each phone, its stamp card, its jobs still at the shop.
export async function memberView(lineUser: string) {
  const phones = await linePhones(lineUser);
  const config: any = await one("SELECT * FROM config WHERE id=1");
  const withCodes = await codesReady();
  const cards = [];
  for (const row of phones) {
    const verified = row.status === "verified";
    let code = "";
    if (!verified && withCodes) {
      code = ((await one("SELECT verify_code FROM line_members WHERE line_user=? AND phone=?", lineUser, row.phone)) as any)?.verify_code || "";
      if (!code) { code = await freshCode(); await db().prepare("UPDATE line_members SET verify_code=?,code_created=? WHERE line_user=? AND phone=? AND status='pending'").bind(code, now(), lineUser, row.phone).run(); }
    }
    cards.push({
      phone: row.phone, name: row.name, status: row.status, method: row.method, code,
      member: verified ? await memberStatus(config, row.phone) : null,
      jobs: verified ? await all("SELECT token,racket,status,paid,amount,created FROM jobs WHERE regexp_replace(phone,'\\D','','g')=? AND status NOT IN ('ยกเลิก','คืนไม้แล้ว') ORDER BY created DESC LIMIT 10", row.phone) : [],
    });
  }
  return { phones: cards, program: await memberProgram(config || {}), shop: config?.shop || "Wingpro" };
}
