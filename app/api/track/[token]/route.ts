import {all,one} from '@/lib/server';
import {DEFAULT_SHOP,parseHours} from '@/lib/shop-hours';
import {buildCustomers} from '@/lib/customers';

// The customer's own stamp progress, shown on their tracking page. Only their numbers (not their whole job/sale
// history, and not the staff-only note) - built the same way as the "ลูกค้าสมาชิก" page, from just their own rows.
async function memberStatus(config:any,phone:string){
  if(!('member_stamps_required' in config))return null;
  const key=String(phone||'').replace(/\D/g,'');
  if(key.length<9)return null;
  const [jobs,sales]=await Promise.all([
    all("SELECT customer,phone,racket,tension,created,status,paid,amount,reward_used FROM jobs WHERE regexp_replace(phone,'\\D','','g')=?",key),
    all('SELECT created,total,customer_key,job_id,status FROM sales WHERE customer_key=?',key),
  ]);
  const [customer]=buildCustomers(jobs,{stampsRequired:config.member_stamps_required,sales,posMinAmount:config.member_pos_min_amount});
  if(!customer)return null;
  return {stamps:customer.stamps,need:customer.need,progress:customer.progress,earned:customer.earned,used:customer.used,available:customer.available,rewardCap:config.member_reward_cap??null};
}

export async function GET(req:Request,{params}:any){
  const {token}=await params;
  const j=await one('SELECT id,racket,status,paid,amount,phone,created FROM jobs WHERE token=?',token);
  if(!j)return Response.json({error:'ไม่พบใบรับไม้'},{status:404});
  const config:any=await one("SELECT * FROM config WHERE id=1");
  const member=await memberStatus(config,j.phone);
  return Response.json({id:j.id,racket:j.racket,paid:j.paid,amount:j.amount,created:j.created,status:j.status==='รับไม้'?'รอขึ้นเอ็น':j.status,lineOa:config?.line_oa||'',member,shop:{phone:config?.contact_phone??DEFAULT_SHOP.phone,facebook:config?.contact_facebook??DEFAULT_SHOP.facebook,hours:parseHours(config?.opening_hours)}},{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}
