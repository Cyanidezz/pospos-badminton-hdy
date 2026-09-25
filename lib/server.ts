import postgres, { type Sql, type TransactionSql } from "postgres";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jobStatusMessage, jobStatusText } from "@/lib/line-message";

export const runtime = () => ({
  LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET,
  POS_OWNER_EMAIL: process.env.POS_OWNER_EMAIL,
});

let sqlClient: Sql | undefined;
function sql() {
  if (sqlClient) return sqlClient;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("ยังไม่ได้ตั้งค่าฐานข้อมูล Supabase");
  sqlClient = postgres(url, { max: 5, idle_timeout: 20, connect_timeout: 15, prepare: false, ssl: "require" });
  return sqlClient;
}

function pgPlaceholders(query: string) {
  let index = 0;
  return query.replace(/\?/g, () => `$${++index}`);
}

class Statement {
  values: unknown[] = [];
  constructor(public query: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async all(executor: Sql | TransactionSql = sql()) {
    const rows = await executor.unsafe(pgPlaceholders(this.query), this.values as never[]);
    return { results: Array.from(rows) };
  }
  async first(executor: Sql | TransactionSql = sql()) {
    const rows = await executor.unsafe(pgPlaceholders(this.query), this.values as never[]);
    return rows[0] ?? null;
  }
  async run(executor: Sql | TransactionSql = sql()) { return executor.unsafe(pgPlaceholders(this.query), this.values as never[]); }
}

class Database {
  prepare(query: string) { return new Statement(query); }
  async batch(statements: Statement[]) {
    return sql().begin(async transaction => {
      const results = [];
      for (const statement of statements) results.push(await statement.run(transaction));
      return results;
    });
  }
}

const database = new Database();
export const db = () => database;
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const all = async (query: string, ...values: unknown[]) => (await db().prepare(query).bind(...values).all()).results;
export const one = async (query: string, ...values: unknown[]) => db().prepare(query).bind(...values).first();
// Runs several read-only queries as ONE statement (one round trip) and returns the rows of each, in order.
export async function allInOne(queries: [string, ...unknown[]][]) {
  const values: unknown[] = [];
  const parts = queries.map(([query, ...params], index) => {
    values.push(...params);
    return `'q${index}',(SELECT coalesce(json_agg(t),'[]'::json) FROM (${query}) t)`;
  });
  const rows = await sql().unsafe(pgPlaceholders(`SELECT json_build_object(${parts.join(",")}) AS d`), values as never[]);
  return queries.map((_, index) => (rows[0].d as any)[`q${index}`] as any[]);
}

export async function auth() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) throw new Error("กรุณาเข้าสู่ระบบ");
  const email = data.user.email.trim().toLowerCase();
  const ownerEmail = runtime().POS_OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) throw new Error("ยังไม่ได้ตั้งค่าบัญชีเจ้าของร้าน");

  await db().batch([
    db().prepare("INSERT INTO config(id,shop) VALUES(1,'Wingpro') ON CONFLICT(id) DO NOTHING"),
    db().prepare("UPDATE config SET shop='Wingpro' WHERE id=1 AND shop IN ('Badminton Shop','Badminton POS')"),
    ...(email === ownerEmail ? [
      db().prepare("INSERT INTO members(id,email,name,role,active) VALUES(?,?,?,'owner',1) ON CONFLICT((lower(email))) DO UPDATE SET id=excluded.id,name=excluded.name,role='owner',active=1")
        .bind(data.user.id,email,String(data.user.user_metadata?.full_name || email)),
    ] : []),
  ]);
  const member = await one("SELECT * FROM members WHERE id=? AND email=?", data.user.id, email);
  if (!member || !(member as any).active) throw new Error("บัญชีนี้ยังไม่ได้รับสิทธิ์จากเจ้าของร้าน");
  return member as any;
}

export function owner(member: any) { if (member.role !== "owner") throw new Error("เฉพาะเจ้าของร้านเท่านั้น"); }
export function str(value: any, max = 200) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("กรุณากรอกข้อมูลให้ครบและไม่ยาวเกินกำหนด");
  return value.trim();
}
export function num(value: any, min = 0, max = 100000000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error("จำนวนไม่ถูกต้อง");
  return parsed;
}
export const money = (value: any) => Math.round(num(value) * 100);
export function integer(value: any, min = 1) {
  const parsed = num(value, min, 100000);
  if (!Number.isInteger(parsed)) throw new Error("จำนวนต้องเป็นจำนวนเต็ม");
  return parsed;
}
export const categories = ["ไม้แบดมินตัน","เอ็นแบดมินตัน","รองเท้า","เสื้อผ้า","กระเป๋า","อุปกรณ์เสริม"];
export const permissionKeys = ["pos","discount","inventory","stringing","expenses","leave","earnings"] as const;
export const defaultCashierPermissions = { pos: true, discount: true, inventory: true, stringing: true, expenses: false, leave: true, earnings: false };
export function permissions(member: any) {
  if (member.role === "owner") return Object.fromEntries(permissionKeys.map(key => [key, true]));
  const saved = member.permissions && typeof member.permissions === "object" ? member.permissions : {};
  return Object.fromEntries(permissionKeys.map(key => [key, typeof saved[key] === "boolean" ? saved[key] : defaultCashierPermissions[key]]));
}
export function permit(member: any, key: typeof permissionKeys[number]) {
  if (!permissions(member)[key]) throw new Error("บัญชีนี้ไม่มีสิทธิ์ใช้งานส่วนนี้");
}
export async function getCategories() { return (await all("SELECT name FROM product_categories ORDER BY name")).map((row: any) => row.name); }
export const statuses = ["รอขึ้นเอ็น","กำลังขึ้นเอ็น","พร้อมรับไม้","คืนไม้แล้ว"];
// Jobs saved before the "รับไม้" step was removed are treated as waiting for stringing.
export const normalizeJobStatus = (status: string) => status === "รับไม้" ? "รอขึ้นเอ็น" : status;
export async function transaction(id: string, member: any, action: string, revision: number, statements: Statement[]) {
  await db().batch([
    db().prepare("INSERT INTO operations(id,staff_id,action,created,valid) VALUES(?,?,?,?, CASE WHEN (SELECT revision FROM config WHERE id=1)=? THEN 1 ELSE NULL END)").bind(id,member.id,action,now(),revision),
    ...statements,
    db().prepare("UPDATE config SET revision=revision+1 WHERE id=1"),
  ]);
}
// Validate, sniff the real image type from its bytes, and store an uploaded file (shared by the staff-only
// /api/upload and the token-scoped, unauthenticated slip upload from the public tracking page). The caller
// picks who the file is attributed to: /api/upload uses the signed-in staff member, the tracking page uses
// the job's own staff_id (a customer is not a member, and the files table requires one).
export async function saveUploadedFile(file: File, staffId: string) {
  if (!(file instanceof File) || file.size > 8 * 1024 * 1024) throw new Error("รูปต้องมีขนาดไม่เกิน 8 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = bytes[0] === 255 && bytes[1] === 216 ? "image/jpeg"
    : bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 ? "image/png"
    : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" ? "image/webp"
    : null;
  if (!mime) throw new Error("รองรับรูป JPG, PNG หรือ WebP");
  const id = uid(), storage = createSupabaseAdminClient().storage.from("wingpro-files");
  const uploaded = await storage.upload(id, bytes, { contentType: mime, upsert: false });
  if (uploaded.error) throw new Error("อัปโหลดรูปไม่สำเร็จ");
  try { await db().prepare("INSERT INTO files(id,staff_id,mime,name) VALUES(?,?,?,?)").bind(id, staffId, mime, file.name.slice(0, 200)).run(); }
  catch (e) { await storage.remove([id]); throw e; }
  return { id };
}
export async function ownedFiles(ids: any) {
  if (!Array.isArray(ids) || ids.length > 8) throw new Error("แนบได้ไม่เกิน 8 รูป");
  for (const id of ids) if (!(await one("SELECT id FROM files WHERE id=?", str(id)))) throw new Error("ไม่พบไฟล์แนบ");
  return ids;
}
export const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
const pushLine = (token: string, to: string, messages: unknown[]) => fetch("https://api.line.me/v2/bot/message/push", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ to, messages }),
});
// Answers a customer's own message or rich-menu tap. Replies are free (unlike pushes, which count against the
// monthly quota) but the reply token is single-use and short-lived, so each event gets exactly one reply.
export async function replyLine(replyToken: string, messages: unknown[]) {
  const token = runtime().LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !replyToken || !messages.length) return;
  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
  }).catch(() => null);
  if (response && !response.ok) console.error("LINE reply failed", response.status, (await response.text().catch(() => "")).slice(0, 300));
}
export async function notifyJob(id: string) {
  const job: any = await one("SELECT * FROM jobs WHERE id=?", id);
  const token = runtime().LINE_CHANNEL_ACCESS_TOKEN;
  let state = "ยังไม่เชื่อม LINE";
  if (job?.line_user && token) {
    try {
      const current = { ...job, status: normalizeJobStatus(job.status) };
      let response = await pushLine(token, job.line_user, [jobStatusMessage(current, { steps: statuses, siteUrl: siteUrl() })]);
      if (response.status === 400) {
        console.error("LINE flex message rejected", (await response.text().catch(() => "")).slice(0, 300));
        response = await pushLine(token, job.line_user, [jobStatusText(current)]);
      }
      if (response.ok) state = "แจ้ง LINE แล้ว";
      else {
        const detail = (await response.text().catch(() => "")).slice(0, 300);
        console.error("LINE push failed", response.status, detail);
        const hint = response.status === 401 ? "Channel access token ไม่ถูกต้องหรือหมดอายุ"
          : response.status === 429 ? "ข้อความเกินโควตาของ LINE เดือนนี้"
          : response.status === 400 ? "ลูกค้าอาจบล็อกหรือลบร้านออกจากเพื่อนแล้ว"
          : "กดลองส่งอีกครั้ง";
        state = `ส่งไม่สำเร็จ (${response.status}): ${hint}`;
      }
    } catch (error: any) {
      console.error("LINE push failed", error?.message);
      state = "ส่งไม่สำเร็จ: เชื่อมต่อ LINE ไม่ได้ กดลองส่งอีกครั้ง";
    }
  }
  await db().prepare("UPDATE jobs SET notify=? WHERE id=?").bind(state,id).run();
  return state;
}
