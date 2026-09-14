import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
export const runtime=()=>env as unknown as {DB:any;BUCKET:any;LINE_CHANNEL_ACCESS_TOKEN?:string;LINE_CHANNEL_SECRET?:string;POS_OWNER_EMAIL?:string};
export const db=()=>{const d=runtime().DB;if(!d)throw new Error('ระบบจัดเก็บข้อมูลยังไม่พร้อม กรุณาลองอีกครั้ง');return d};
export const uid=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();
export const all=async(sql:string,...v:any[])=>(await db().prepare(sql).bind(...v).all()).results;
export const one=async(sql:string,...v:any[])=>db().prepare(sql).bind(...v).first();
export async function auth(){
  const user=await getChatGPTUser();
  if(!user)throw new Error('กรุณาเข้าสู่ระบบ');
  const ownerEmail=runtime().POS_OWNER_EMAIL?.trim().toLowerCase();
  if(!ownerEmail)throw new Error('ยังไม่ได้ตั้งค่าบัญชีเจ้าของร้าน');
  const email=user.email.trim().toLowerCase();
  // The bootstrap identity comes only from the verified Site owner configuration.
  // Never grant ownership to the first visitor or automated screenshot service.
  await db().batch([
    db().prepare("INSERT OR IGNORE INTO config(id,shop) VALUES(1,'Wingpro')"),
    db().prepare("UPDATE config SET shop='Wingpro' WHERE id=1 AND shop IN ('Badminton Shop','Badminton POS')"),
    db().prepare("INSERT INTO members(id,email,name,role,active) VALUES(?,?,?,'owner',1) ON CONFLICT(email) DO UPDATE SET role='owner',active=1 WHERE members.role!='owner' OR members.active!=1").bind(uid(),ownerEmail,email===ownerEmail?user.displayName:ownerEmail),
    db().prepare("UPDATE members SET active=0 WHERE email=? AND active!=0").bind('sites-screenshot-service-noreply@chatgpt.com'),
  ]);
  const member=await one('SELECT * FROM members WHERE email=?',email);
  if(!member||!member.active)throw new Error('บัญชีนี้ยังไม่ได้รับสิทธิ์จากเจ้าของร้าน');
  return member;
}
export function owner(m:any){if(m.role!=='owner')throw new Error('เฉพาะเจ้าของร้านเท่านั้น');}
export function str(v:any,max=200){if(typeof v!=='string'||!v.trim()||v.length>max)throw new Error('กรุณากรอกข้อมูลให้ครบและไม่ยาวเกินกำหนด');return v.trim();}
export function num(v:any,min=0,max=100000000){const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)throw new Error('จำนวนไม่ถูกต้อง');return n;}
export const money=(v:any)=>Math.round(num(v)*100);
export function integer(v:any,min=1){const n=num(v,min,100000);if(!Number.isInteger(n))throw new Error('จำนวนต้องเป็นจำนวนเต็ม');return n;}
export const categories=['ไม้แบดมินตัน','เอ็นแบดมินตัน','รองเท้า','เสื้อผ้า','กระเป๋า','อุปกรณ์เสริม'];
export async function getCategories(){return (await all('SELECT name FROM product_categories ORDER BY name')).map((r:any)=>r.name);}
export const statuses=['รับไม้','รอขึ้นเอ็น','กำลังขึ้นเอ็น','พร้อมรับไม้','คืนไม้แล้ว'];
export async function transaction(id:string,m:any,action:string,rev:number,statements:any[]){await db().batch([db().prepare('INSERT INTO operations(id,staff_id,action,created,valid) VALUES(?,?,?,?, CASE WHEN (SELECT revision FROM config WHERE id=1)=? THEN 1 ELSE NULL END)').bind(id,m.id,action,now(),rev),...statements,db().prepare('UPDATE config SET revision=revision+1 WHERE id=1')]);}
export async function ownedFiles(ids:any){if(!Array.isArray(ids)||ids.length>8)throw new Error('แนบได้ไม่เกิน 8 รูป');for(const id of ids){if(!await one('SELECT id FROM files WHERE id=?',str(id)))throw new Error('ไม่พบไฟล์แนบ');}return ids;}
export async function notifyJob(id:string){const j=await one('SELECT * FROM jobs WHERE id=?',id);const token=runtime().LINE_CHANNEL_ACCESS_TOKEN;let state='ยังไม่เชื่อม LINE';if(j?.line_user&&token){try{const r=await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({to:j.line_user,messages:[{type:'text',text:`สถานะไม้ ${j.racket}: ${j.status}\nเลขรับไม้ ${j.id.slice(0,8).toUpperCase()}${j.paid?'\nชำระเงินแล้ว':`\nยอดชำระ ${(j.amount/100).toFixed(2)} บาท`}`}]})});state=r.ok?'แจ้ง LINE แล้ว':'ส่งไม่สำเร็จ กดลองส่งอีกครั้ง';}catch{state='ส่งไม่สำเร็จ กดลองส่งอีกครั้ง';}}await db().prepare('UPDATE jobs SET notify=? WHERE id=?').bind(state,id).run();return state;}
