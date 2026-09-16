import postgres, { type Sql } from "postgres";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  async all(executor: Sql = sql()) {
    const rows = await executor.unsafe(pgPlaceholders(this.query), this.values as never[]);
    return { results: Array.from(rows) };
  }
  async first(executor: Sql = sql()) {
    const rows = await executor.unsafe(pgPlaceholders(this.query), this.values as never[]);
    return rows[0] ?? null;
  }
  async run(executor: Sql = sql()) { return executor.unsafe(pgPlaceholders(this.query), this.values as never[]); }
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
export async function getCategories() { return (await all("SELECT name FROM product_categories ORDER BY name")).map((row: any) => row.name); }
export const statuses = ["รับไม้","รอขึ้นเอ็น","กำลังขึ้นเอ็น","พร้อมรับไม้","คืนไม้แล้ว"];
export async function transaction(id: string, member: any, action: string, revision: number, statements: Statement[]) {
  await db().batch([
    db().prepare("INSERT INTO operations(id,staff_id,action,created,valid) VALUES(?,?,?,?, CASE WHEN (SELECT revision FROM config WHERE id=1)=? THEN 1 ELSE NULL END)").bind(id,member.id,action,now(),revision),
    ...statements,
    db().prepare("UPDATE config SET revision=revision+1 WHERE id=1"),
  ]);
}
export async function ownedFiles(ids: any) {
  if (!Array.isArray(ids) || ids.length > 8) throw new Error("แนบได้ไม่เกิน 8 รูป");
  for (const id of ids) if (!(await one("SELECT id FROM files WHERE id=?", str(id)))) throw new Error("ไม่พบไฟล์แนบ");
  return ids;
}
export async function notifyJob(id: string) {
  const job: any = await one("SELECT * FROM jobs WHERE id=?", id);
  const token = runtime().LINE_CHANNEL_ACCESS_TOKEN;
  let state = "ยังไม่เชื่อม LINE";
  if (job?.line_user && token) {
    try {
      const response = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: job.line_user, messages: [{ type: "text", text: `สถานะไม้ ${job.racket}: ${job.status}\nเลขรับไม้ ${job.id.slice(0,8).toUpperCase()}${job.paid?'\nชำระเงินแล้ว':`\nยอดชำระ ${(job.amount/100).toFixed(2)} บาท`}` }] }),
      });
      state = response.ok ? "แจ้ง LINE แล้ว" : "ส่งไม่สำเร็จ กดลองส่งอีกครั้ง";
    } catch { state = "ส่งไม่สำเร็จ กดลองส่งอีกครั้ง"; }
  }
  await db().prepare("UPDATE jobs SET notify=? WHERE id=?").bind(state,id).run();
  return state;
}
