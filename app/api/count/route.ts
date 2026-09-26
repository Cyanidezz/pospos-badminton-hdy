import {auth,permissions,owner,db,all,one,now,str,integer,money,uid,getCategories,transaction} from '@/lib/server';
import {COUNT_REASONS} from '@/lib/stock-count';
import {checkLowStockAlerts} from '@/lib/low-stock';

// Stock counting ("รอบนับสต๊อก"). Kept apart from /api/data so a scan is one small request instead of a full reload.
export const dynamic='force-dynamic';
const noStore={'Cache-Control':'no-store'};
const fail=(message:string,status=400,code?:string)=>Response.json({error:message,...(code?{code}:{})},{status});
const canCount=(me:any)=>me.role==='owner'||!!permissions(me).inventory;
const ready=async()=>!!((await one("SELECT to_regclass('public.stock_counts') AS t") as any)?.t);
const MIGRATION='ต้องรัน migration 20260922030000_stock_counts.sql บน Supabase ก่อนจึงจะใช้ระบบนับสต๊อกได้';

export async function GET(req:Request){
  try{
    const me=await auth();if(!canCount(me))return fail('ไม่มีสิทธิ์นับสต๊อก',403);
    if(!(await ready()))return Response.json({ready:false},{headers:noStore});
    const url=new URL(req.url),isOwner=me.role==='owner';
    if(url.searchParams.get('view')==='detail'){
      owner(me);
      const session=await one('SELECT * FROM stock_counts WHERE id=?',str(url.searchParams.get('id'),60));
      if(!session)return fail('ไม่พบรอบนับ',404);
      const items=await all('SELECT i.product_id,i.expected,i.counted,i.applied,i.reason,p.name,p.category,p.unit,p.cost FROM stock_count_items i JOIN products p ON p.id=i.product_id WHERE i.count_id=? AND i.counted<>i.expected ORDER BY p.name',session.id);
      return Response.json({ready:true,session,items},{headers:noStore});
    }
    const session:any=await one("SELECT * FROM stock_counts WHERE status IN ('counting','review') ORDER BY started DESC LIMIT 1");
    const history=await all("SELECT id,name,scope,status,started,finished,closed,summary FROM stock_counts WHERE status IN ('closed','cancelled') ORDER BY started DESC LIMIT 15");
    let items:any[]=[],since=null;
    if(session){
      // Counting is blind: nobody sees the system quantity until the owner reviews the result.
      const showExpected=isOwner&&session.status!=='counting';
      items=await all(`SELECT i.product_id,i.counted,i.touched,i.applied,i.reason,${showExpected?'i.expected':'NULL::integer AS expected'},(i.expected<>0) AS has_stock,p.name,p.barcode,p.scan_code,p.category,p.unit,${showExpected?'p.cost':'NULL::integer AS cost'} FROM stock_count_items i JOIN products p ON p.id=i.product_id WHERE i.count_id=? ORDER BY p.name`,session.id);
      const bills:any=await one("SELECT COUNT(*)::int AS n FROM sales WHERE created>? AND status='active'",session.started);
      const received:any=await one('SELECT COUNT(*)::int AS n FROM receipts WHERE created>?',session.started);
      since={bills:bills?.n||0,receipts:received?.n||0};
    }
    return Response.json({ready:true,me:{id:me.id,role:me.role},session,items,since,history},{headers:noStore});
  }catch(e:any){return fail(e.message,403)}
}

export async function POST(req:Request){
  try{
    if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return fail('คำขอไม่ถูกต้อง',403);
    const me=await auth();if(!canCount(me))return fail('ไม่มีสิทธิ์นับสต๊อก',403);
    if(!(await ready()))return fail(MIGRATION);
    const b:any=await req.json(),action=str(b.action);

    if(action==='scan'||action==='set'||action==='scanNew'){
      const countId=str(b.countId,60),actor=me.id,stamp=now();
      if(action==='scan'){
        const code=str(b.code,80),qty=integer(b.qty??1,1);
        const rows=await all("UPDATE stock_count_items i SET counted=i.counted+?,touched=1,staff_id=?,updated=? FROM stock_counts c,products p WHERE i.count_id=? AND c.id=i.count_id AND c.status='counting' AND p.id=i.product_id AND (p.barcode=? OR p.scan_code=?) RETURNING i.product_id,i.counted",qty,actor,stamp,countId,code,code);
        if(rows.length)return Response.json({ok:true,productId:rows[0].product_id,counted:rows[0].counted},{headers:noStore});
        const session:any=await one('SELECT status FROM stock_counts WHERE id=?',countId);
        if(!session||session.status!=='counting')return fail('รอบนับนี้ปิดการนับแล้ว');
        const exists=await one('SELECT id FROM products WHERE (barcode=? OR scan_code=?) AND active=1',code,code);
        return fail(exists?'สินค้านี้ไม่อยู่ในขอบเขตรอบนับนี้':'ไม่พบสินค้าจากบาร์โค้ดนี้',400,exists?'out_of_scope':'not_found');
      }
      if(action==='scanNew'){
        // The scanned barcode matches nothing in the catalog at all - register it as a new product and count the
        // first one found in the same step. It starts at 0 in the system, so whatever gets counted here (and any
        // more of it found later in this round) shows up as "surplus" once the owner reviews the count.
        const code=str(b.code,80),name=str(b.name,200),category=str(b.category,60),price=money(b.price);
        if(!(await getCategories()).includes(category))return fail('หมวดสินค้าไม่ถูกต้อง');
        if(await one('SELECT id FROM products WHERE barcode=? OR scan_code=?',code,code))return fail('มีสินค้านี้ในระบบอยู่แล้ว กรุณาลองสแกนใหม่');
        const session:any=await one("SELECT status FROM stock_counts WHERE id=? AND status='counting'",countId);
        if(!session)return fail('รอบนับนี้ปิดการนับแล้ว');
        const productId=uid();
        await db().batch([
          db().prepare('INSERT INTO products(id,name,barcode,category,price,active,stock,unit) VALUES(?,?,?,?,?,1,0,?)').bind(productId,name,code,category,price,'ชิ้น'),
          db().prepare('INSERT INTO stock_count_items(count_id,product_id,expected,counted,touched,staff_id,updated) VALUES(?,?,0,1,1,?,?)').bind(countId,productId,actor,stamp),
        ]);
        return Response.json({ok:true,productId,counted:1},{headers:noStore});
      }
      const productId=str(b.productId,60),qty=integer(b.qty,0);
      const rows=await all("UPDATE stock_count_items i SET counted=?,touched=1,staff_id=?,updated=? FROM stock_counts c WHERE i.count_id=? AND i.product_id=? AND c.id=i.count_id AND c.status='counting' RETURNING i.product_id,i.counted",qty,actor,stamp,countId,productId);
      if(!rows.length)return fail('บันทึกจำนวนไม่สำเร็จ รอบนับอาจปิดการนับแล้ว');
      return Response.json({ok:true,productId:rows[0].product_id,counted:rows[0].counted},{headers:noStore});
    }

    owner(me); // everything below is the owner's decision
    if(action==='start'){
      const id=str(b.requestId,60);
      if(await one('SELECT id FROM stock_counts WHERE id=?',id))return Response.json({ok:true,id});
      const scope=String(b.scope||'').trim();
      if(scope&&!(await getCategories()).includes(scope))throw new Error('หมวดหมู่ไม่ถูกต้อง');
      if(await one("SELECT id FROM stock_counts WHERE status IN ('counting','review') LIMIT 1"))throw new Error('มีรอบนับที่ยังไม่ปิดอยู่ กรุณายืนยันหรือยกเลิกรอบนั้นก่อน');
      const day=new Date(Date.now()+7*3600e3).toISOString().slice(0,10),name=String(b.name||'').trim().slice(0,100)||`นับสต๊อก ${day}${scope?' · '+scope:''}`;
      const config:any=await one('SELECT revision FROM config WHERE id=1');
      await transaction(id,me,'countStart',config.revision,[
        db().prepare("INSERT INTO stock_counts(id,name,scope,status,started,started_by) VALUES(?,?,?,'counting',?,?)").bind(id,name,scope,now(),me.id),
        db().prepare(`INSERT INTO stock_count_items(count_id,product_id,expected) SELECT ?,id,stock FROM products WHERE active=1${scope?' AND category=?':''}`).bind(...(scope?[id,scope]:[id])),
      ]);
      return Response.json({ok:true,id});
    }

    const countId=str(b.countId,60);
    const move=async(from:string,to:string,extra:string,label:string)=>{
      const rows=await all(`UPDATE stock_counts SET status='${to}'${extra} WHERE id=? AND status='${from}' RETURNING id`,...(extra?[now()]:[]),countId);
      if(!rows.length)throw new Error(label);
    };
    if(action==='finish'){await move('counting','review',',finished=?','รอบนับนี้ไม่ได้อยู่ในสถานะกำลังนับ');return Response.json({ok:true});}
    if(action==='reopen'){await move('review','counting','','รอบนับนี้ไม่ได้อยู่ในขั้นตรวจสอบ');return Response.json({ok:true});}
    if(action==='cancel'){
      const rows=await all("UPDATE stock_counts SET status='cancelled',closed=?,closed_by=? WHERE id=? AND status IN ('counting','review') RETURNING id",now(),me.id,countId);
      if(!rows.length)throw new Error('ยกเลิกไม่ได้ รอบนับนี้ปิดไปแล้ว');
      return Response.json({ok:true});
    }

    if(action==='apply'){
      const requestId=str(b.requestId,60),session:any=await one('SELECT * FROM stock_counts WHERE id=?',countId);
      if(await one('SELECT id FROM operations WHERE id=?',requestId))return Response.json({ok:true});
      if(!session||session.status!=='review')throw new Error('รอบนับนี้ยังไม่อยู่ในขั้นตรวจสอบ หรือปิดไปแล้ว');
      const picked=(Array.isArray(b.rows)?b.rows:[]).slice(0,2000).map((r:any)=>({product_id:str(r.productId,60),reason:COUNT_REASONS.includes(r.reason)?r.reason:COUNT_REASONS[3]}));
      // Totals for the history list are computed from everything that was counted, not only the ticked rows.
      const agg:any=await one("SELECT COUNT(*) FILTER (WHERE i.counted<i.expected)::int AS missing_items,COALESCE(SUM(GREATEST(i.expected-i.counted,0)*COALESCE(p.cost,0)),0)::bigint AS missing_value,COUNT(*) FILTER (WHERE i.counted>i.expected)::int AS surplus_items,COALESCE(SUM(GREATEST(i.counted-i.expected,0)*COALESCE(p.cost,0)),0)::bigint AS surplus_value,COUNT(*) FILTER (WHERE i.counted=i.expected)::int AS matched_items FROM stock_count_items i JOIN products p ON p.id=i.product_id WHERE i.count_id=?",countId);
      const summary=JSON.stringify({missingItems:agg.missing_items,missingValue:Number(agg.missing_value),surplusItems:agg.surplus_items,surplusValue:Number(agg.surplus_value),matchedItems:agg.matched_items,applied:picked.length});
      const config:any=await one('SELECT revision FROM config WHERE id=1');
      // Set-based statements (a per-product loop would be one slow round trip per item). The change is applied as a
      // relative delta (counted - expected) so sales or receipts made since the count started are not overwritten.
      await transaction(requestId,me,'countApply',config.revision,[
        db().prepare("UPDATE stock_count_items i SET reason=r.reason FROM jsonb_to_recordset((?::text)::jsonb) AS r(product_id text,reason text) WHERE i.count_id=? AND i.product_id=r.product_id AND i.applied=0").bind(JSON.stringify(picked),countId),
        db().prepare("INSERT INTO stock_adjustments(id,product_id,delta,reason,staff_id,created) SELECT gen_random_uuid()::text,i.product_id,i.counted-i.expected,?::text||': '||i.reason,?::uuid,?::text FROM stock_count_items i WHERE i.count_id=? AND i.applied=0 AND i.reason IS NOT NULL AND i.counted<>i.expected").bind('นับสต๊อก ('+session.name+')',me.id,now(),countId),
        db().prepare("UPDATE products p SET stock=p.stock+(i.counted-i.expected) FROM stock_count_items i WHERE i.count_id=? AND i.product_id=p.id AND i.applied=0 AND i.reason IS NOT NULL AND i.counted<>i.expected").bind(countId),
        db().prepare("UPDATE stock_count_items SET applied=1 WHERE count_id=? AND applied=0 AND reason IS NOT NULL AND counted<>expected").bind(countId),
        db().prepare("UPDATE stock_counts SET status='closed',closed=?,closed_by=?,summary=? WHERE id=? AND status='review'").bind(now(),me.id,summary,countId),
      ]);
      await checkLowStockAlerts();
      return Response.json({ok:true,applied:picked.length});
    }
    return fail('ไม่พบคำสั่ง');
  }catch(e:any){
    console.error('Stock count failed',e.message);
    const message=String(e.message||'');
    return fail(message.includes('duplicate key')?'ข้อมูลซ้ำ กรุณาโหลดหน้าใหม่':message);
  }
}
