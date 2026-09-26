'use client';
import {useState} from 'react';

// ภาพรวมร้าน: products sold in the period that still have no cost ("ต้นทุน ยังไม่ครบ" / กำไร "รอต้นทุน"), each with a
// cost field right here. Saving uses the same "cost" action as กรอกต้นทุนสินค้า: it becomes the product's cost and is
// filled into every earlier sale / receipt of it that had none, so the profit can be worked out straight away.
const baht=(satang:number)=>(satang/100).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});

export function MissingCostPanel({missing,products,busy,onAction}:any){
  const [costs,setCosts]=useState<Record<string,string>>({}),[saving,setSaving]=useState('');
  const groups=Object.values((missing||[]).reduce((acc:any,x:any)=>{const key=x.product_id||'deleted:'+x.name;(acc[key]=acc[key]||{key,productId:x.product_id,name:x.name,qty:0,sales:0}).qty+=x.qty;acc[key].sales+=x.net||0;return acc},{})) as any[];
  groups.sort((a,b)=>b.qty-a.qty);
  const save=async(g:any)=>{
    const value=costs[g.key];
    if(!g.productId||value===undefined||value===''||Number(value)<0)return;
    setSaving(g.key);
    try{if(await onAction('cost',{productId:g.productId,cost:value,requestId:crypto.randomUUID()},false))setCosts(c=>{const n={...c};delete n[g.key];return n})}finally{setSaving('')}
  };
  return <div className="panel report missing-cost" id="missing-cost"><h2>ใส่ต้นทุนสินค้าที่ยังขาด ({groups.length})</h2>
    <p className="muted">สินค้าที่ขายในช่วงนี้แต่ยังไม่มีต้นทุน ใส่ต้นทุนต่อชิ้นแล้วกดบันทึก ระบบจะใส่ให้ทุกบิลที่ขายไปแล้วของสินค้านั้นด้วย กำไรจะคำนวณได้ทันที</p>
    <ul>{groups.map(g=>{const p=products.find((x:any)=>x.id===g.productId),value=costs[g.key]??'';return <li key={g.key}>
      <div className="missing-cost-name"><b>{g.name}</b><small>ขายไป {g.qty} {p?.unit||'ชิ้น'} · ยอดขาย ฿{baht(g.sales)}{p?` · ราคาขาย ฿${baht(p.price)}`:''}</small></div>
      {g.productId&&p?<form className="missing-cost-form" onSubmit={e=>{e.preventDefault();save(g)}}>
        <label><span>ต้นทุน/ชิ้น (บาท)</span><input type="number" inputMode="decimal" min="0" step="0.01" required value={value} placeholder="0.00" onChange={e=>setCosts(c=>({...c,[g.key]:e.target.value}))}/></label>
        <button disabled={busy||!!saving||value===''}>{saving===g.key?'กำลังบันทึก…':'บันทึก'}</button>
        {value!==''&&p.price>0&&Number(value)>=0&&<small className={Math.round(Number(value)*100)<p.price?'is-good':'is-bad'}>กำไร/ชิ้น ฿{baht(p.price-Math.round(Number(value)*100))}</small>}
      </form>:<small className="muted">สินค้านี้ถูกลบไปแล้ว ใส่ต้นทุนไม่ได้</small>}
    </li>})}</ul>
  </div>;
}
