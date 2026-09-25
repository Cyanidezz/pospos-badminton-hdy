import {all,one} from './server';
import {bangkokToday} from './shop-hours';
import {DEFAULT_SOCKS_STAMPS_REQUIRED,DEFAULT_STAMPS_REQUIRED,buildCustomers,promoOf,promoPhase} from './customers';

// A customer's own stamp progress, by phone: shown on their tracking page and on LINE ("เช็คคะแนนสะสม"). Only their
// numbers (not their whole job/sale history, and not the staff-only note) - built the same way as the "ลูกค้าสมาชิก"
// page, from just their own rows. promo mirrors the shop's own setting exactly (promoPhase, the same rule that gates
// new stamps) so the customer sees why their stamps did or didn't move, not just the raw count.
export async function memberStatus(config:any,phone:string){
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
  const program=await memberProgram(config);
  return {...program!,stars:customer.stars,stringNeed:customer.stringNeed,socksNeed:customer.socksNeed,stringAvailable:customer.stringAvailable,socksAvailable:customer.socksAvailable&&!!program!.socksProductName,stringUsed:customer.stringUsed,socksUsed:customer.socksUsed};
}

// The programme itself (no customer): what it takes to earn each reward, the reward cap, and the stamping period -
// for a customer with no stars yet, or a phone the shop doesn't know ("บัตรสะสมดาว" card on LINE).
export async function memberProgram(config:any){
  if(!('member_stamps_required' in config))return null;
  const promo=promoOf(config);
  // The socks reward stays off (even after the migration runs) until an owner actually picks a product for it.
  const socksProduct=config.member_socks_product_id?await one('SELECT name FROM products WHERE id=? AND active=1',config.member_socks_product_id):null;
  // Same rounding/defaults as buildCustomers() in lib/customers.ts.
  const need=(value:any,fallback:number)=>Math.max(1,Math.round(Number(value))||fallback);
  return {stars:0,stringNeed:need(config.member_stamps_required,DEFAULT_STAMPS_REQUIRED),socksNeed:need(config.member_socks_stamps_required,DEFAULT_SOCKS_STAMPS_REQUIRED),stringAvailable:false,socksAvailable:false,stringUsed:0,socksUsed:0,rewardCap:config.member_reward_cap??null,socksProductName:socksProduct?.name??null,posMinAmount:Number(config.member_pos_min_amount)||0,
    promo:{phase:promoPhase(promo,bangkokToday()),start:promo?.start??null,end:promo?.end??null}};
}
