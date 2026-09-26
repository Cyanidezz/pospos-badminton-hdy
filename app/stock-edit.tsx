'use client';

// แก้ไขสินค้า: the count on hand, with a reason whenever it changes - saved as a stock adjustment (same record as
// "ปรับยอดสต๊อก"), so the movement history shows who changed it, by how much and why.
const REASONS=['นับสต๊อกแล้วไม่ตรง','สินค้าชำรุด / เสียหาย','สินค้าสูญหาย','ใช้ภายในร้าน / แจกลูกค้า','แก้ไขที่บันทึกผิด'];

export function StockEdit({form,setForm,unit,Field}:any){
  const before=Number(form.stockBefore)||0,raw=String(form.stockQty??'').trim(),next=raw===''?before:Math.round(Number(raw));
  const changed=raw!==''&&Number.isFinite(next)&&next!==before,diff=next-before;
  return <div className="stock-edit">
    <Field label={`จำนวนคงเหลือ (${unit||'ชิ้น'})`}>
      <div className="stock-edit-row">
        <input type="number" inputMode="numeric" min="0" step="1" value={form.stockQty??''} onChange={e=>setForm({...form,stockQty:e.target.value})}/>
        <span className={'stock-edit-diff'+(changed?(diff>0?' is-up':' is-down'):'')}>{changed?`${diff>0?'+':''}${diff} จากเดิม ${before}`:`ในระบบตอนนี้ ${before}`}</span>
      </div>
    </Field>
    {changed&&<Field label="เหตุผลที่ปรับจำนวน">
      <div className="stock-edit-reasons">{REASONS.map(r=><button type="button" key={r} className={form.stockReason===r?'is-active':''} onClick={()=>setForm({...form,stockReason:r})}>{r}</button>)}</div>
      <textarea required rows={2} maxLength={1000} placeholder="เลือกด้านบน หรือพิมพ์เหตุผลเอง" value={form.stockReason||''} onChange={e=>setForm({...form,stockReason:e.target.value})}/>
    </Field>}
  </div>;
}
