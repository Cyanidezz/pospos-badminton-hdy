import {auth,owner,all,one} from '@/lib/server';

// What LINE customers asked for that the shop couldn't sell them (see logInquiry in app/api/line/route.ts), for the
// owner's "สินค้าที่ลูกค้าถามหา" list. {inquiries:null} means the migration hasn't run yet.
export const dynamic='force-dynamic';

export async function GET(){
  try{
    const me=await auth();owner(me);
    const ready:any=await one("SELECT to_regclass('public.product_inquiries') AS t");
    const inquiries=ready?.t?await all(`SELECT i.id,i.kind,i.query,i.product_id,p.name AS product_name,i.count,cardinality(i.line_users) AS customers,i.first_asked,i.last_asked
      FROM product_inquiries i LEFT JOIN products p ON p.id=i.product_id WHERE i.dismissed=0 ORDER BY cardinality(i.line_users) DESC,i.count DESC,i.last_asked DESC LIMIT 200`):null;
    return Response.json({inquiries},{headers:{'Cache-Control':'no-store'}});
  }catch(e:any){return Response.json({error:e.message},{status:403});}
}
