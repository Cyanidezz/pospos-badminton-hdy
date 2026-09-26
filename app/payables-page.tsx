'use client';
import {useMemo,useState} from 'react';
import {Landmark} from 'lucide-react';
import {daysUntil,dueText} from './purchase-orders';

// เจ้าหนี้ค้างชำระ (owner): what the shop still owes for goods bought on credit - approved credit POs whose debt has
// not been recorded as paid yet - by creditor, soonest due first, overdue ones flagged.
const money=(satang:number)=>'฿'+(Number(satang||0)/100).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const thaiDate=(date:string)=>date?new Date(date.slice(0,10)+'T00:00:00').toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit'}):'—';

export const openDebts=(orders:any[])=>(orders||[]).filter((o:any)=>o.payment_method==='credit'&&!o.paid_at&&(o.status==='approved'||o.status==='received'));

export function PayablesPage({data,busy,onAction}:any){
  const [filter,setFilter]=useState<'all'|'overdue'|'soon'>('all');
  const suppliers=data.suppliers||[];
  const debts=useMemo(()=>openDebts(data.purchaseOrders).sort((a:any,b:any)=>String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))),[data.purchaseOrders]);
  const overdue=debts.filter((o:any)=>o.due_date&&daysUntil(o.due_date)<0),soon=debts.filter((o:any)=>o.due_date&&daysUntil(o.due_date)>=0&&daysUntil(o.due_date)<=7);
  const sum=(list:any[])=>list.reduce((s:number,o:any)=>s+Number(o.total||0),0);
  const shown=filter==='overdue'?overdue:filter==='soon'?soon:debts;
  const creditorOf=(o:any)=>o.creditor||suppliers.find((s:any)=>s.id===o.supplier_id)?.name||'ไม่ระบุเจ้าหนี้';
  const groups=useMemo(()=>{const map=new Map<string,any[]>();for(const o of shown)map.set(creditorOf(o),[...(map.get(creditorOf(o))||[]),o]);return [...map.entries()]},[shown]);// eslint-disable-line react-hooks/exhaustive-deps
  const paid=(data.purchaseOrders||[]).filter((o:any)=>o.payment_method==='credit'&&o.paid_at).sort((a:any,b:any)=>String(b.paid_at).localeCompare(String(a.paid_at))).slice(0,10);
  const payDebt=(o:any)=>{if(confirm(`บันทึกว่าชำระหนี้ ${creditorOf(o)} ${money(o.total)} (PO-${o.id.slice(0,8).toUpperCase()}) แล้ว?`))onAction('purchaseOrderPayDebt',{id:o.id},false)};
  return <section className="payables-page">
    <div className="payables-summary">
      <button type="button" className={filter==='all'?'is-active':''} onClick={()=>setFilter('all')}><span>ยอดค้างชำระทั้งหมด</span><strong>{money(sum(debts))}</strong><small>{debts.length} ใบ</small></button>
      <button type="button" className={'is-overdue '+(filter==='overdue'?'is-active':'')} onClick={()=>setFilter(f=>f==='overdue'?'all':'overdue')}><span>เกินกำหนดชำระ</span><strong>{money(sum(overdue))}</strong><small>{overdue.length} ใบ</small></button>
      <button type="button" className={'is-soon '+(filter==='soon'?'is-active':'')} onClick={()=>setFilter(f=>f==='soon'?'all':'soon')}><span>ครบกำหนดใน 7 วัน</span><strong>{money(sum(soon))}</strong><small>{soon.length} ใบ</small></button>
    </div>
    {!shown.length?<div className="panel empty"><Landmark size={34}/><h3>{debts.length?'ไม่มีรายการในกลุ่มนี้':'ไม่มีหนี้ค้างชำระ'}</h3><p className="muted">ใบ PO ที่เลือกจ่ายแบบ “เครดิต” จะแสดงที่นี่หลังอนุมัติ จนกว่าจะกด “ชำระหนี้แล้ว”</p></div>
    :groups.map(([creditor,list])=><div className="panel payables-group" key={creditor}>
      <div className="payables-group-head"><b>{creditor}</b><span>{list.length} ใบ · {money(sum(list))}</span></div>
      {list.map((o:any)=>{const days=o.due_date?daysUntil(o.due_date):null;return <div className="payables-row" key={o.id}>
        <div><b>PO-{o.id.slice(0,8).toUpperCase()}</b><small>สั่งซื้อ {thaiDate(o.date)} · {o.status==='received'?'รับสินค้าแล้ว':'ยังไม่รับสินค้า'}</small></div>
        <div className="payables-due"><span>ครบกำหนด {thaiDate(o.due_date)}</span>{o.due_date&&<em className={days!<0?'is-overdue':days!<=7?'is-soon':''}>{dueText(o.due_date)}</em>}</div>
        <strong>{money(o.total)}</strong>
        <button type="button" disabled={busy} onClick={()=>payDebt(o)}>ชำระหนี้แล้ว</button>
      </div>})}
    </div>)}
    {paid.length>0&&<div className="panel report payables-paid"><h2>ชำระหนี้ล่าสุด</h2><ul>{paid.map((o:any)=><li key={o.id}><span>{creditorOf(o)} · PO-{o.id.slice(0,8).toUpperCase()}</span><span>ชำระ {thaiDate(o.paid_at)}</span><b>{money(o.total)}</b></li>)}</ul></div>}
  </section>;
}
