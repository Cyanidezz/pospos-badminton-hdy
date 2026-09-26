import {auth,permissions,all,one} from '@/lib/server';

// Staff view of สมาชิกผ่าน LINE: sign-ups waiting to be verified at the counter, and which phones are linked to a LINE
// account. {ready:false} = no migration.
export const dynamic='force-dynamic';

export async function GET(req:Request){
  try{
    const me=await auth(),access=permissions(me);
    if(!(me.role==='owner'||access.stringing||access.pos))return Response.json({error:'ไม่มีสิทธิ์ดูข้อมูลสมาชิก'},{status:403});
    if(!(await one("SELECT to_regclass('public.line_members') AS t") as any)?.t)return Response.json({ready:false},{headers:{'Cache-Control':'no-store'}});
    // ?code=123456: the request whose code the customer is showing at the counter (the codes themselves are never
    // listed, so staff can't verify anyone without the customer's own phone in front of them).
    const code=new URL(req.url).searchParams.get('code');
    if(code!==null){
      if(!/^\d{6}$/.test(code))return Response.json({error:'รหัสยืนยันต้องเป็นตัวเลข 6 หลัก'},{status:400});
      if(!(await one("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='line_members' AND column_name='verify_code'")))return Response.json({error:'ต้องรัน migration 20260926040000_line_member_codes.sql ก่อน'},{status:400});
      const row=await one(`SELECT l.line_user,l.phone,l.name,l.created,(SELECT customer FROM jobs WHERE regexp_replace(phone,'\\D','','g')=l.phone ORDER BY created DESC LIMIT 1) AS shop_name
        FROM line_members l WHERE l.verify_code=? AND l.status='pending'`,code);
      return row?Response.json({ready:true,match:row},{headers:{'Cache-Control':'no-store'}}):Response.json({error:'ไม่พบรหัสนี้ หรือยืนยันไปแล้ว'},{status:404});
    }
    const rows=await all(`SELECT l.line_user,l.phone,l.name,l.status,l.method,l.created,l.verified_at,m.name AS verified_by_name,
        (SELECT customer FROM jobs WHERE regexp_replace(phone,'\\D','','g')=l.phone ORDER BY created DESC LIMIT 1) AS shop_name
      FROM line_members l LEFT JOIN members m ON m.id=l.verified_by ORDER BY l.status DESC,l.created DESC LIMIT 500`);
    return Response.json({ready:true,rows},{headers:{'Cache-Control':'no-store'}});
  }catch(e:any){return Response.json({error:e.message},{status:403});}
}
