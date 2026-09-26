'use client';

const baht=(satang:number)=>(satang/100).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const day=(iso:string)=>new Date(iso).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit',timeZone:'Asia/Bangkok'});

// แก้ไขสินค้า (owner only): the product's current cost - a moving weighted average that every PO received updates -
// plus the lots it came from, so a wrong figure is easy to spot. Changing it only affects sales from now on.
export function CostEditor({form,setForm,receipts,Field}:any){
  const lots=(receipts||[]).filter((r:any)=>r.product_id===form.productId&&r.cost!==null&&r.cost!==undefined).sort((a:any,b:any)=>String(b.created).localeCompare(String(a.created)));
  const shown=lots.slice(0,8);
  return <div className="cost-editor">
    <Field label="ต้นทุนต่อหน่วย (บาท) — ทุนเฉลี่ย"><input type="number" inputMode="decimal" min="0" step="0.01" value={form.cost??''} placeholder="ยังไม่มีต้นทุน" onChange={e=>setForm({...form,cost:e.target.value})}/></Field>
    <p className="muted">ทุกครั้งที่รับสินค้าเข้าจากใบ PO ระบบคำนวณทุนเฉลี่ยให้อัตโนมัติ แก้ตรงนี้เมื่อทุนผิดเท่านั้น มีผลกับการขายครั้งถัดไป สินค้าที่ขายไปแล้วยังใช้ทุน ณ วันที่ขาย</p>
    {shown.length>0&&<div className="cost-lots"><b>ประวัติรับเข้า</b><ul>{shown.map((r:any)=><li key={r.id}><span>{day(r.created)}</span><span>{r.qty} ชิ้น</span><span>@ ฿{baht(r.cost)}</span></li>)}</ul>{lots.length>shown.length&&<small className="muted">และอีก {lots.length-shown.length} ครั้งก่อนหน้า</small>}</div>}
  </div>;
}
