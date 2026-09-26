import {auth,permissions,all,one} from '@/lib/server';

// แปลงสินค้าขายย่อย page data: the owner's rules (which product breaks into which, and how many) with both products'
// current stock, plus recent conversions. Costs only for the owner, like everywhere else.
// {ready:false} = the migration hasn't run yet.
export const dynamic='force-dynamic';

export async function GET(){
  try{
    const me=await auth(),isOwner=me.role==='owner';
    if(!isOwner&&!permissions(me).inventory)return Response.json({error:'ไม่มีสิทธิ์ใช้งานส่วนนี้'},{status:403});
    if(!(await one("SELECT to_regclass('public.product_breakdowns') AS t") as any)?.t)return Response.json({ready:false},{headers:{'Cache-Control':'no-store'}});
    const cost=(t:string)=>isOwner?`${t}.cost`:'NULL::integer';
    const rules=await all(`SELECT r.id,r.ratio,
        p.id AS parent_id,p.name AS parent_name,p.unit AS parent_unit,p.stock AS parent_stock,p.price AS parent_price,${cost('p')} AS parent_cost,
        c.id AS child_id,c.name AS child_name,c.unit AS child_unit,c.stock AS child_stock,c.price AS child_price,${cost('c')} AS child_cost
      FROM product_breakdowns r JOIN products p ON p.id=r.parent_id AND p.active=1 JOIN products c ON c.id=r.child_id AND c.active=1 ORDER BY p.name,c.name`);
    const history=await all(`SELECT v.id,v.parent_qty,v.child_qty,${isOwner?'v.unit_cost':'NULL::integer AS unit_cost'},v.created,p.name AS parent_name,p.unit AS parent_unit,c.name AS child_name,c.unit AS child_unit,m.name AS staff_name
      FROM product_conversions v LEFT JOIN products p ON p.id=v.parent_id LEFT JOIN products c ON c.id=v.child_id LEFT JOIN members m ON m.id=v.staff_id ORDER BY v.created DESC LIMIT 30`);
    return Response.json({ready:true,isOwner,rules,history},{headers:{'Cache-Control':'no-store'}});
  }catch(e:any){return Response.json({error:e.message},{status:403});}
}
