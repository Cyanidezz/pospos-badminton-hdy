import {db,one} from '@/lib/server';
import {starsSql} from '@/lib/member-reward';
import {rewardDiscount} from '@/lib/customers';

// A member redeems their free stringing on this job themselves, from the public tracking page - no login, scoped
// to the job by its (long, unguessable) token. The job ends up exactly as if staff had ticked "ใช้สิทธิ์" at intake
// (reward_used=1, reward_discount = the waived amount, amount lowered), so paying it books the discount on the POS
// bill the same way. Entitlement is re-checked inside the UPDATE itself, under a per-phone lock, so a double tap or
// two of the customer's jobs redeemed at once can never spend the same reward twice.
export const dynamic='force-dynamic';

const REDEEM_NOTE='ลูกค้ากดแลกสิทธิ์ขึ้นเอ็นฟรีเองจากหน้าติดตามสถานะ';

export async function POST(req:Request,{params}:any){
  try{
    if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)throw new Error('คำขอไม่ถูกต้อง');
    const {token}=await params;
    const config:any=await one('SELECT * FROM config WHERE id=1');
    if(!config||!('member_stamps_required' in config))throw new Error('ระบบสะสมแต้มยังไม่พร้อมใช้งาน กรุณาติดต่อร้าน');
    const job:any=await one("SELECT id,phone,status,paid,amount,reward_used,to_jsonb(jobs)->>'slip' AS slip FROM jobs WHERE token=?",token);
    if(!job)throw new Error('ไม่พบใบรับไม้');
    if(job.status==='ยกเลิก')throw new Error('งานนี้ถูกยกเลิกแล้ว');
    if(job.paid)throw new Error('งานนี้ชำระเงินแล้ว ใช้สิทธิ์กับงานถัดไปได้');
    if(job.reward_used===1)throw new Error('งานนี้ใช้สิทธิ์ไปแล้ว');
    if(job.slip)throw new Error('แนบสลิปไปแล้ว กรุณาแจ้งพนักงานหากต้องการใช้สิทธิ์');
    if(!(job.amount>0))throw new Error('งานนี้ไม่มีค่าใช้จ่าย');
    const digits=String(job.phone||'').replace(/\D/g,'');
    if(digits.length<9)throw new Error('ใบรับไม้นี้ไม่มีเบอร์โทรสมาชิก');
    const off=rewardDiscount(job.amount,config.member_reward_cap);
    const stars=starsSql(config,digits),need=Number(config.member_stamps_required)||10;
    const [,rows]:any=await db().batch([
      db().prepare('SELECT pg_advisory_xact_lock(hashtext(?))').bind('member-reward:'+digits),
      db().prepare(`UPDATE jobs SET reward_used=1,reward_discount=?,amount=amount-?,note=TRIM(BOTH E'\\n' FROM COALESCE(note,'')||E'\\n'||?) WHERE token=? AND paid=0 AND reward_used=0 AND status<>'ยกเลิก' AND amount=? AND to_jsonb(jobs)->>'slip' IS NULL AND ${stars.sql}>=? RETURNING id`).bind(off,off,REDEEM_NOTE,token,job.amount,...stars.args,need),
    ]);
    if(!rows.length)throw new Error('ใช้สิทธิ์ไม่สำเร็จ สิทธิ์อาจถูกใช้ไปแล้ว กรุณาโหลดหน้าใหม่');
    return Response.json({ok:true,amount:job.amount-off,discount:off});
  }catch(e:any){return Response.json({error:e.message},{status:400});}
}
