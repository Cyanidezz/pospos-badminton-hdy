import {runtime,db,all,one,notifyJob,replyLine,siteUrl,statuses,normalizeJobStatus} from '@/lib/server';
import {DEFAULT_SHOP} from '@/lib/shop-hours';
import {promotionsMessage,trackJobsMessage} from '@/lib/line-message';

// LINE OA webhook. Every request is signed with the channel secret; anything unsigned is rejected before parsing.
async function verified(req:Request){
  const secret=runtime().LINE_CHANNEL_SECRET;
  if(!secret)return {error:new Response('LINE not configured',{status:503})};
  const raw=await req.text(),signature=req.headers.get('x-line-signature');
  if(!signature)return {error:new Response('Unauthorized',{status:401})};
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  let valid=false;
  try{valid=await crypto.subtle.verify('HMAC',key,Uint8Array.from(atob(signature),x=>x.charCodeAt(0)),new TextEncoder().encode(raw));}catch{}
  return valid?{raw}:{error:new Response('Unauthorized',{status:401})};
}

const ACTIVE_JOBS="status<>'ยกเลิก' AND status<>'คืนไม้แล้ว'";
const text=(value:string)=>({type:'text',text:value});
const ASK_PHONE=text('พิมพ์เบอร์โทรที่ใช้ตอนฝากไม้ได้เลย เช่น 0812345678 ระบบจะแสดงสถานะงานขึ้นเอ็นที่ยังอยู่ที่ร้าน');

async function trackReply(jobs:any[],lineUser:string){
  const message=trackJobsMessage(jobs.map(j=>({...j,status:normalizeJobStatus(j.status)})),{steps:statuses,siteUrl:siteUrl(),lineUser});
  return message?[message]:[];
}

// "ติดตามงานขึ้นเอ็น": jobs already linked to this LINE account come back straight away; otherwise ask for a phone.
async function onTrack(lineUser:string){
  const linked=await all(`SELECT id,token,racket,status,paid,amount,created,line_user FROM jobs WHERE line_user=? AND ${ACTIVE_JOBS} ORDER BY created DESC LIMIT 10`,lineUser);
  if(!linked.length)return [ASK_PHONE];
  return [...await trackReply(linked,lineUser),text('ถ้ามีไม้ที่ฝากด้วยเบอร์อื่น พิมพ์เบอร์นั้นมาได้เลย')];
}

async function onPhone(digits:string,lineUser:string){
  const jobs=await all(`SELECT id,token,racket,status,paid,amount,created,line_user FROM jobs WHERE regexp_replace(phone,'\\D','','g')=? AND ${ACTIVE_JOBS} ORDER BY created DESC LIMIT 10`,digits);
  if(!jobs.length)return [text('ไม่พบงานขึ้นเอ็นที่ยังอยู่ที่ร้านของเบอร์นี้ ถ้าคิดว่าไม่ถูกต้อง ติดต่อร้านได้เลย')];
  return trackReply(jobs,lineUser);
}

async function onPromotions(){
  const ready=await one("SELECT to_regclass('public.promotions') AS t");
  const promos=ready?.t?await all('SELECT id,title,body,image FROM promotions WHERE active=1 ORDER BY created DESC LIMIT 12'):[];
  const config:any=await one('SELECT contact_phone FROM config WHERE id=1');
  const message=promotionsMessage(promos as any[],{siteUrl:siteUrl(),phone:config?.contact_phone??DEFAULT_SHOP.phone});
  return message?[message]:[text('ตอนนี้ยังไม่มีโปรโมชั่น ติดตามข่าวสารได้ที่ Facebook ของร้าน')];
}

async function onLink(token:string,lineUser:string){
  const j=await db().prepare('SELECT id FROM jobs WHERE token=? AND (line_user IS NULL OR line_user=?)').bind(token,lineUser).first();
  if(!j)return;
  await db().prepare('UPDATE jobs SET line_user=? WHERE id=? AND (line_user IS NULL OR line_user=?)').bind(lineUser,j.id,lineUser).run();
  await notifyJob(j.id);
}

export async function POST(req:Request){
  const check=await verified(req);
  if(check.error)return check.error;
  for(const e of JSON.parse(check.raw).events||[]){
    if(e.source?.type!=='user')continue;
    const lineUser=e.source.userId,replyToken=e.replyToken;
    try{
      if(e.type==='postback'){
        const action=new URLSearchParams(e.postback?.data||'').get('action');
        if(action==='track')await replyLine(replyToken,await onTrack(lineUser));
        else if(action==='promo')await replyLine(replyToken,await onPromotions());
        continue;
      }
      if(e.type!=='message'||e.message?.type!=='text')continue;
      const message=String(e.message.text||'').trim();
      const link=message.match(/^LINK ([a-f0-9-]{50,80})$/i);
      if(link){await onLink(link[1],lineUser);continue;}
      // Typed text works the same as the rich-menu buttons, for anyone who types instead of tapping.
      if(/^ติดตาม/.test(message))await replyLine(replyToken,await onTrack(lineUser));
      else if(/^โปรโมชั่น|^โปร$/.test(message))await replyLine(replyToken,await onPromotions());
      else{
        const digits=message.replace(/[\s-]/g,'');
        if(/^0\d{8,9}$/.test(digits))await replyLine(replyToken,await onPhone(digits,lineUser));
      }
    }catch(error:any){console.error('LINE webhook event failed',error?.message);}
  }
  return Response.json({ok:true});
}
