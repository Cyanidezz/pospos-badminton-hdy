import {db,one,str,uid} from '@/lib/server';
import {starsSql} from '@/lib/member-reward';
import {SOCK_REWARD_REASON} from '@/lib/customers';

// A member redeems the socks reward (5 stars) themselves, from the public tracking page - no login, scoped to the
// job by its (long, unguessable) token, which only gives us the customer's phone and a staff_id to attribute the
// giveaway to (a customer isn't a member, and sales.staff_id is required - same reason the customer's uploaded
// slip is attributed to the job's own staff_id). Recorded as a real ฿0 POS sale (real stock and cost, full price
// booked as a discount) so it shows up in stock and in the shop's reports, not just as a marker. Booked as a
// separate sale, not on this job's own bill, since the socks aren't part of stringing this particular racket.
// Entitlement is re-checked inside the INSERT itself (an INSERT...SELECT...WHERE, the same "gate the write on the
// current SQL truth" trick /redeem uses on an UPDATE), under the SAME per-phone lock /redeem and job intake use,
// so redeeming any of the three ways at once can never spend the same star count twice.
export const dynamic='force-dynamic';

export async function POST(req:Request,{params}:any){
  try{
    if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)throw new Error('คำขอไม่ถูกต้อง');
    const {token}=await params;
    const config:any=await one('SELECT * FROM config WHERE id=1');
    if(!config||!('member_socks_product_id' in config))throw new Error('ระบบแลกถุงเท้ายังไม่พร้อมใช้งาน กรุณาติดต่อร้าน');
    if(!config.member_socks_product_id)throw new Error('ร้านยังไม่ได้ตั้งค่าของรางวัลถุงเท้า กรุณาติดต่อร้าน');
    const job:any=await one('SELECT id,customer,phone,staff_id FROM jobs WHERE token=?',token);
    if(!job)throw new Error('ไม่พบใบรับไม้');
    const digits=String(job.phone||'').replace(/\D/g,'');
    if(digits.length<9)throw new Error('ใบรับไม้นี้ไม่มีเบอร์โทรสมาชิก');
    const product:any=await one('SELECT id,name,category,price,cost FROM products WHERE id=? AND active=1',config.member_socks_product_id);
    if(!product)throw new Error('ของรางวัลถุงเท้ายังไม่พร้อมใช้งาน กรุณาติดต่อร้าน');
    const stars=starsSql(config,digits),saleId=uid(),itemId=uid();
    const results:any=await db().batch([
      db().prepare('SELECT pg_advisory_xact_lock(hashtext(?))').bind('member-reward:'+digits),
      db().prepare(`INSERT INTO sales(id,staff_id,created,total,discount,discount_reason,method,customer_key,customer_name) SELECT ?,?,?,0,?,?,'สิทธิ์สมาชิก',?,? WHERE ${stars.sql}>=? RETURNING id`).bind(saleId,job.staff_id,new Date().toISOString(),product.price,SOCK_REWARD_REASON,digits,str(job.customer,100),...stars.args,Number(config.member_socks_stamps_required)||5),
      db().prepare('INSERT INTO items(id,sale_id,product_id,name,category,qty,price,original,net,cost,note,line_discount) VALUES(?,?,?,?,?,1,?,?,0,?,?,?)').bind(itemId,saleId,product.id,product.name,product.category,product.price,product.price,product.cost,'แลกถุงเท้าฟรี (สะสมแต้ม)',product.price),
      db().prepare('UPDATE products SET stock=stock-1 WHERE id=?').bind(product.id),
    ]).catch((e:any)=>{
      // The gated INSERT above matched no row (stars<need, or a race with another redeem already spent them) - the
      // dependent items row then fails its foreign key, aborting the whole batch. Anything else is a real error.
      if(String(e.message||'').includes('foreign key'))return [];
      throw e;
    });
    if(!results[1]?.length)throw new Error('ใช้สิทธิ์ไม่สำเร็จ สิทธิ์อาจถูกใช้ไปแล้ว กรุณาโหลดหน้าใหม่');
    return Response.json({ok:true,product:product.name});
  }catch(e:any){return Response.json({error:e.message},{status:400});}
}
