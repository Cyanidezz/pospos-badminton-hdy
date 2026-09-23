import {all,one} from '@/lib/server';
import {DEFAULT_SHOP,bangkokToday,parseHours} from '@/lib/shop-hours';
import {buildCustomers,promoOf,promoPhase,rewardDiscount} from '@/lib/customers';

// The customer's own stamp progress, shown on their tracking page. Only their numbers (not their whole job/sale
// history, and not the staff-only note) - built the same way as the "ลูกค้าสมาชิก" page, from just their own rows.
// promo mirrors the shop's own setting exactly (lib/customers.ts's promoPhase, the same rule that gates new
// stamps) so the customer sees why their stamps did or didn't move, not just the raw count.
async function memberStatus(config:any,phone:string){
  if(!('member_stamps_required' in config))return null;
  const key=String(phone||'').replace(/\D/g,'');
  if(key.length<9)return null;
  const [jobs,sales]=await Promise.all([
    all("SELECT customer,phone,racket,tension,created,status,paid,amount,reward_used FROM jobs WHERE regexp_replace(phone,'\\D','','g')=?",key),
    all('SELECT created,total,customer_key,job_id,status,discount_reason FROM sales WHERE customer_key=?',key),
  ]);
  const promo=promoOf(config);
  const [customer]=buildCustomers(jobs,{stampsRequired:config.member_stamps_required,socksStampsRequired:config.member_socks_stamps_required,sales,posMinAmount:config.member_pos_min_amount,promo});
  if(!customer)return null;
  // The socks reward stays off (even after the migration runs) until an owner actually picks a product for it.
  const socksProduct=config.member_socks_product_id?await one('SELECT name FROM products WHERE id=? AND active=1',config.member_socks_product_id):null;
  return {stars:customer.stars,stringNeed:customer.stringNeed,socksNeed:customer.socksNeed,stringAvailable:customer.stringAvailable,socksAvailable:customer.socksAvailable&&!!socksProduct,stringUsed:customer.stringUsed,socksUsed:customer.socksUsed,rewardCap:config.member_reward_cap??null,socksProductName:socksProduct?.name??null,
    promo:{phase:promoPhase(promo,bangkokToday()),start:promo?.start??null,end:promo?.end??null}};
}

export async function GET(req:Request,{params}:any){
  const {token}=await params;
  // to_jsonb(jobs)->>'slip' reads the new "slip" column without erroring when the migration adding it has not
  // run yet (a missing jsonb key is just null, unlike naming the column directly in the SELECT list).
  const j:any=await one("SELECT id,racket,status,paid,amount,phone,created,to_jsonb(jobs)->>'slip' AS slip,to_jsonb(jobs)->>'reward_used' AS reward_used,to_jsonb(jobs)->>'reward_discount' AS reward_discount FROM jobs WHERE token=?",token);
  if(!j)return Response.json({error:'ไม่พบใบรับไม้'},{status:404});
  const config:any=await one("SELECT * FROM config WHERE id=1");
  const member=await memberStatus(config,j.phone);
  const payable=!j.paid&&j.status!=='ยกเลิก';
  // The customer can spend a free stringing on this very job themselves (POST ./redeem) while it is still unpaid,
  // has a price, and no slip is waiting for the shop to check against the old amount.
  const rewardUsed=j.reward_used==='1',canRedeem=payable&&!rewardUsed&&!j.slip&&j.amount>0&&!!member?.stringAvailable;
  const reward={used:rewardUsed,discount:rewardUsed?Number(j.reward_discount)||0:0,canRedeem,redeemOff:canRedeem?rewardDiscount(j.amount,config.member_reward_cap):0};
  const bank=payable&&j.amount>0?{name:config?.bank_name||'',accountName:config?.bank_account_name||'',accountNo:config?.bank_account_no||'',hasQr:!!config?.bank_qr}:null;
  return Response.json({id:j.id,racket:j.racket,paid:j.paid,amount:j.amount,created:j.created,status:j.status==='รับไม้'?'รอขึ้นเอ็น':j.status,lineOa:config?.line_oa||'',member,reward,bank,slipUploaded:payable&&!!j.slip,shop:{phone:config?.contact_phone??DEFAULT_SHOP.phone,facebook:config?.contact_facebook??DEFAULT_SHOP.facebook,hours:parseHours(config?.opening_hours)}},{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}
