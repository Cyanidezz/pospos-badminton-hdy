import {auth,permissions,all,one} from '@/lib/server';

// Staff view of สมาชิกผ่าน LINE: requests waiting for approval (a number with shop history that the customer couldn't
// prove with a receipt number) and which phones are already linked to a LINE account. {ready:false} = no migration.
export const dynamic='force-dynamic';

export async function GET(){
  try{
    const me=await auth(),access=permissions(me);
    if(!(me.role==='owner'||access.stringing||access.pos))return Response.json({error:'ไม่มีสิทธิ์ดูข้อมูลสมาชิก'},{status:403});
    if(!(await one("SELECT to_regclass('public.line_members') AS t") as any)?.t)return Response.json({ready:false},{headers:{'Cache-Control':'no-store'}});
    const rows=await all(`SELECT l.line_user,l.phone,l.name,l.status,l.method,l.created,l.verified_at,m.name AS verified_by_name,
        (SELECT customer FROM jobs WHERE regexp_replace(phone,'\\D','','g')=l.phone ORDER BY created DESC LIMIT 1) AS shop_name
      FROM line_members l LEFT JOIN members m ON m.id=l.verified_by ORDER BY l.status DESC,l.created DESC LIMIT 500`);
    return Response.json({ready:true,rows},{headers:{'Cache-Control':'no-store'}});
  }catch(e:any){return Response.json({error:e.message},{status:403});}
}
