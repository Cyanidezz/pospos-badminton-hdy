import {runtime,db,all,one,uid,now,notifyJob,replyLine,siteUrl,statuses,normalizeJobStatus} from '@/lib/server';
import {DEFAULT_SHOP} from '@/lib/shop-hours';
import {isService,memberCardMessage,productAnswerMessage,productBrandCarousel,productNotFoundMessage,promotionsMessage,stringPriceMessages,trackJobsMessage} from '@/lib/line-message';
import {PRODUCT_INTENT,coreQuery,inquiryKey,isGeneralStringingQuestion,pickMatches,searchProducts} from '@/lib/product-search';
import {askProductAi} from '@/lib/product-ai';
import {memberProgram,memberStatus} from '@/lib/member-status';

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
const ASK_PHONE_POINTS=text('พิมพ์เบอร์โทรที่ให้ไว้กับร้านได้เลย เช่น 0812345678 ระบบจะแสดงดาวสะสมและงานขึ้นเอ็นที่ยังอยู่ที่ร้าน');

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

async function pointsCard(phone:string,trackToken=''){
  const config:any=await one('SELECT * FROM config WHERE id=1');
  const member=await memberStatus(config,phone);
  const base=siteUrl().replace(/\/$/,'');
  if(member)return memberCardMessage(member,{trackUrl:trackToken&&base?`${base}/track/${trackToken}`:''});
  // Not a member yet: the programme card (how to earn, the rewards, the period) - still worth showing.
  const program=await memberProgram(config);
  return program?memberCardMessage(program,{known:false}):null;
}

// A typed phone number answers both menu buttons at once (there is no conversation state to know which one asked):
// that number's stars, then its jobs still at the shop. Anyone can type any number, so both stay compact - no name,
// no link into the job (see trackJobsMessage / memberCardMessage).
async function onPhone(digits:string,lineUser:string){
  const jobs=await all(`SELECT id,token,racket,status,paid,amount,created,line_user FROM jobs WHERE regexp_replace(phone,'\\D','','g')=? AND ${ACTIVE_JOBS} ORDER BY created DESC LIMIT 10`,digits);
  const card=await pointsCard(digits);
  const messages=[...(card?[card]:[]),...await trackReply(jobs,lineUser)];
  return messages.length?messages:[text('ไม่พบข้อมูลของเบอร์นี้ ถ้าคิดว่าไม่ถูกต้อง ติดต่อร้านได้เลย')];
}

// "เช็คคะแนนสะสม": a LINE account already linked to a job (via the QR on its receipt) gets its card straight away,
// with a button to its newest open job's tracking page where rewards are redeemed; otherwise ask for a phone.
async function onPoints(lineUser:string){
  const latest:any=await one("SELECT phone FROM jobs WHERE line_user=? AND phone IS NOT NULL AND phone<>'' ORDER BY created DESC LIMIT 1",lineUser);
  if(!latest)return [ASK_PHONE_POINTS];
  const open:any=await one(`SELECT token FROM jobs WHERE line_user=? AND paid=0 AND ${ACTIVE_JOBS} ORDER BY created DESC LIMIT 1`,lineUser);
  const card=await pointsCard(latest.phone,open?.token||'');
  return card?[card]:[ASK_PHONE_POINTS];
}

async function onPromotions(){
  const ready=await one("SELECT to_regclass('public.promotions') AS t");
  const promos=ready?.t?await all('SELECT id,title,body,image FROM promotions WHERE active=1 ORDER BY created DESC LIMIT 12'):[];
  const config:any=await one('SELECT contact_phone FROM config WHERE id=1');
  const message=promotionsMessage(promos as any[],{siteUrl:siteUrl(),phone:config?.contact_phone??DEFAULT_SHOP.phone});
  return message?[message]:[text('ตอนนี้ยังไม่มีโปรโมชั่น ติดตามข่าวสารได้ที่ Facebook ของร้าน')];
}

async function onPrice(){
  const config:any=await one('SELECT * FROM config WHERE id=1');
  return stringPriceMessages({text:config?.string_price_text??'',image:config?.string_price_image??null,siteUrl:siteUrl(),phone:config?.contact_phone??DEFAULT_SHOP.phone});
}

async function onLink(token:string,lineUser:string){
  const j=await db().prepare('SELECT id FROM jobs WHERE token=? AND (line_user IS NULL OR line_user=?)').bind(token,lineUser).first();
  if(!j)return;
  await db().prepare('UPDATE jobs SET line_user=? WHERE id=? AND (line_user IS NULL OR line_user=?)').bind(lineUser,j.id,lineUser).run();
  await notifyJob(j.id);
}

// ---------------------------------------------------------------- product questions ("lining no1 เท่าไหร่")

// Active products (not the POS's "สินค้าเทียบ" stand-in items) with what is actually left to sell: stock minus strings reserved for rackets still in the queue
// (the same "reserved" the POS shows). aliases is read through to_jsonb so this works before its migration.
async function shopProducts(){
  return await all(`SELECT id,name,category,price,unit,image,to_jsonb(products)->>'aliases' AS aliases,stock-(SELECT COUNT(*) FROM jobs WHERE product_id=products.id AND paid=0 AND returned IS NULL AND status<>'ยกเลิก') AS available FROM products WHERE active=1 AND category<>'สินค้าเทียบ' ORDER BY name`) as any[];
}

// Remember what customers asked for but couldn't buy. Counted per request and per distinct LINE customer; a
// request the owner dismissed comes back to the list if someone asks again. Never allowed to break the reply.
async function logInquiry(kind:'missing'|'out_of_stock',key:string,query:string,lineUser:string,productId:string|null=null){
  if(!key)return;
  try{
    if(!(await one("SELECT to_regclass('public.product_inquiries') AS t") as any)?.t)return;
    const stamp=now();
    await db().prepare(`INSERT INTO product_inquiries(id,kind,query_key,query,product_id,count,line_users,first_asked,last_asked) VALUES(?,?,?,?,?,1,ARRAY[?]::text[],?,?)
      ON CONFLICT (kind,query_key) DO UPDATE SET count=product_inquiries.count+1,query=EXCLUDED.query,product_id=COALESCE(EXCLUDED.product_id,product_inquiries.product_id),last_asked=EXCLUDED.last_asked,dismissed=0,
      line_users=CASE WHEN ?=ANY(product_inquiries.line_users) THEN product_inquiries.line_users ELSE array_append(product_inquiries.line_users,?) END`)
      .bind(uid(),kind,key.slice(0,120),query.slice(0,200),productId,lineUser,stamp,stamp,lineUser,lineUser).run();
  }catch(error:any){console.error('Product inquiry log failed',error?.message);}
}

// Postback data for "ดูทั้งหมด (แยกตามยี่ห้อ)": the search text, trimmed until it fits LINE's 300-character limit
// (Thai letters take 9 characters each once URL-encoded).
function allQueryData(query:string){
  let q=String(query||'').trim().slice(0,120);
  while(q&&('action=all&q='+encodeURIComponent(q)).length>300)q=q.slice(0,-1);
  return q?'action=all&q='+encodeURIComponent(q):'';
}

async function productReply(found:any[],lineUser:string,query=''){
  const config:any=await one('SELECT contact_phone FROM config WHERE id=1');
  const phone=config?.contact_phone??DEFAULT_SHOP.phone;
  // A sold-out product someone asked for specifically (not one of a long list) is worth restocking - log it.
  if(found.length<=3)for(const p of found)if(!isService(p))if(Number(p.available)<=0)await logInquiry('out_of_stock',p.id,p.name,lineUser,p.id);
  const message=productAnswerMessage(found.map(p=>({...p,available:Math.max(0,Number(p.available)||0),price:Number(p.price)||0})),{siteUrl:siteUrl(),phone,allQuery:allQueryData(query)});
  return message?[message]:[];
}

// "ดูทั้งหมด (แยกตามยี่ห้อ)": the same search again (rules only - no AI, no cost), every in-stock match, a card per brand.
async function onAllProducts(query:string){
  const products=await shopProducts();
  const found=pickMatches(searchProducts(query,products)).products.map((p:any)=>products.find(x=>x.id===p.id)).filter(Boolean);
  const config:any=await one('SELECT contact_phone FROM config WHERE id=1');
  const message=productBrandCarousel(found.map((p:any)=>({...p,available:Math.max(0,Number(p.available)||0),price:Number(p.price)||0})),{phone:config?.contact_phone??DEFAULT_SHOP.phone});
  return message?[message]:[text('ตอนนี้สินค้าที่ตรงกับที่ถามหมดชั่วคราว สอบถามร้านได้เลย')];
}

async function notFoundReply(wanted:string,message:string,lineUser:string){
  const config:any=await one('SELECT contact_phone FROM config WHERE id=1');
  await logInquiry('missing',inquiryKey(wanted||message),wanted||coreQuery(message)||message,lineUser);
  return [productNotFoundMessage(wanted||coreQuery(message),config?.contact_phone??DEFAULT_SHOP.phone)];
}

// Any other text. Claude Haiku decides whether it is a product question and which products match (from a
// shortlist the rule matcher picked - or the whole list when that is small); prices and stock always come from the
// database. With no key, or if the AI fails for any reason, the rules decide instead (lib/product-search.ts):
// answer a clear match, list close ones, and only say "ไม่มี" (and log it) when the message clearly asks to buy.
// Returns [] to stay silent - thanks, greetings and the like are left for the staff.
async function onProductQuestion(message:string,lineUser:string){
  if(isGeneralStringingQuestion(message))return onPrice();
  const products=await shopProducts();
  const ranked=searchProducts(message,products);
  const rule=pickMatches(ranked);
  const byId=new Map(products.map(p=>[p.id,p]));
  // A strong name match ("lining no1", "bg80") needs no AI - answered straight away, at no cost.
  if(rule.kind!=='none'&&ranked[0].score>=0.85)return productReply(rule.products.map(p=>byId.get(p.id)),lineUser,message);
  const env=runtime();
  if(env.ANTHROPIC_API_KEY){
    const shortlist=products.length<=60?products:ranked.slice(0,30).map(m=>byId.get(m.product.id));
    const ai=await askProductAi(message,shortlist,{apiKey:env.ANTHROPIC_API_KEY,model:env.ANTHROPIC_MODEL});
    if(ai){
      if(!ai.isProductQuestion)return [];
      if(ai.productIds.length)return productReply(ai.productIds.map(id=>byId.get(id)).filter(Boolean),lineUser,ai.wanted||message);
      // The AI's cleaned-up name ("ลีนนิ่งนัมเบอวัน" -> "Li-Ning No.1") may find what the raw text couldn't.
      const again=ai.wanted?searchProducts(ai.wanted,products):[];
      if(again.length&&again[0].score>=0.6)return productReply(pickMatches(again).products.map(p=>byId.get(p.id)),lineUser,ai.wanted);
      return notFoundReply(ai.wanted,message,lineUser);
    }
  }
  if(rule.kind!=='none')return productReply(rule.products.map(p=>byId.get(p.id)),lineUser,message);
  if(PRODUCT_INTENT.test(message)&&coreQuery(message))return notFoundReply('',message,lineUser);
  return [];
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
        else if(action==='points')await replyLine(replyToken,await onPoints(lineUser));
        else if(action==='price')await replyLine(replyToken,await onPrice());
        else if(action==='all')await replyLine(replyToken,await onAllProducts(new URLSearchParams(e.postback?.data||'').get('q')||''));
        continue;
      }
      if(e.type!=='message'||e.message?.type!=='text')continue;
      const message=String(e.message.text||'').trim();
      const link=message.match(/^LINK ([a-f0-9-]{50,80})$/i);
      if(link){await onLink(link[1],lineUser);continue;}
      // Typed text works the same as the rich-menu buttons, for anyone who types instead of tapping.
      if(/^ติดตาม/.test(message))await replyLine(replyToken,await onTrack(lineUser));
      else if(/^(เช็ค|เช็ก)?(คะแนน|แต้ม|ดาว)/.test(message))await replyLine(replyToken,await onPoints(lineUser));
      // Just "ราคา" / "ราคาขึ้นเอ็น" -> the shop's own price sheet; "ราคา BG80" is a product question (below).
      else if(/^(สอบถาม)?ราคา(ขึ้นเอ็น|เอ็น)?(ครับ|คับ|ค่ะ|คะ)?$/.test(message.replace(/\s+/g,'')))await replyLine(replyToken,await onPrice());
      else if(/^โปรโมชั่น|^โปร$/.test(message))await replyLine(replyToken,await onPromotions());
      else{
        const digits=message.replace(/[\s-]/g,'');
        if(/^0\d{8,9}$/.test(digits))await replyLine(replyToken,await onPhone(digits,lineUser));
        else{const reply=await onProductQuestion(message,lineUser);if(reply.length)await replyLine(replyToken,reply);}
      }
    }catch(error:any){console.error('LINE webhook event failed',error?.message);}
  }
  return Response.json({ok:true});
}
