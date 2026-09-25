import {one} from '@/lib/server';
import {DEFAULT_SHOP,parseHours} from '@/lib/shop-hours';
import {rewardDiscount} from '@/lib/customers';
import {memberStatus} from '@/lib/member-status';

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
