'use client';
import {BULK_PRICE_MODES,bulkPrice} from '@/lib/bulk-price';

const baht=(satang:number)=>(satang/100).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});

// Fields of the "แก้ราคาขายหลายรายการ" dialog, with a before -> after preview of every selected product, so the
// owner sees exactly what will be saved (the server applies the same bulkPrice rule to the database prices).
export function BulkPriceFields({form,setForm,products,Field,Choice}:any){
  const rows=(form.productIds||[]).map((id:string)=>products.find((p:any)=>p.id===id)).filter(Boolean);
  const changes=rows.map((p:any)=>({p,next:bulkPrice(p.price,form.mode,form.value)}));
  const invalid=String(form.value??'').trim()!==''&&changes.some((c:any)=>c.next===null);
  const changed=changes.filter((c:any)=>c.next!==null&&c.next!==c.p.price).length;
  return <>
    <Field label="วิธีแก้ราคา"><Choice value={form.mode} onChange={(v:string)=>setForm({...form,mode:v})} options={BULK_PRICE_MODES}/></Field>
    <Field label={form.mode==='set'?'ราคาขายใหม่ (บาท)':form.mode==='add'?'เพิ่ม / ลด (บาท) เช่น 20 หรือ -20':'เพิ่ม / ลด (%) เช่น 10 หรือ -10'}>
      <input required autoFocus type="number" inputMode="decimal" step="0.01" min={form.mode==='set'?0:undefined} value={form.value??''} onChange={e=>setForm({...form,value:e.target.value})}/>
    </Field>
    {form.mode==='percent'&&<p className="muted">ราคาที่คำนวณจาก % จะปัดเป็นบาทเต็ม</p>}
    {invalid&&<div className="notice">มีบางรายการที่ราคาใหม่ติดลบ กรุณาแก้ตัวเลข</div>}
    <div className="bulk-price-preview">
      <b>ตัวอย่างราคาใหม่ · {rows.length} รายการ{changed?` (เปลี่ยน ${changed})`:''}</b>
      <ul>{changes.map(({p,next}:any)=><li key={p.id} className={next!==null&&next!==p.price?'is-changed':''}>
        <span>{p.name}</span><span className="old">฿{baht(p.price)}</span><span>→</span><strong>{next===null?'—':'฿'+baht(next)}</strong>
      </li>)}</ul>
    </div>
  </>;
}
