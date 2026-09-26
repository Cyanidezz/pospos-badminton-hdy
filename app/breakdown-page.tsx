'use client';
import {useEffect,useMemo,useState} from 'react';
import {toast} from 'sonner';
import {ArrowRight,Minus,PackageOpen,Plus,Search,Trash2} from 'lucide-react';

// แปลงสินค้าขายย่อย: open a pack and sell what is inside one by one - 1 หลอดลูกแบด (฿690, 12 ลูก) -> 12 ลูก at ฿90 each,
// each shuttle costing 690/12 = ฿57.50. The owner sets up the pair once (the single-unit product is an ordinary
// product with its own price); after that anyone with stock access opens packs here, like receiving goods.

const baht=(satang:number)=>'฿'+(satang/100).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const when=(iso:string)=>new Date(iso).toLocaleString('th-TH',{day:'numeric',month:'short',year:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'});

function ProductSearch({products,value,onChange,placeholder,exclude}:{products:any[];value:any;onChange:(p:any)=>void;placeholder:string;exclude?:string}){
  const [query,setQuery]=useState('');
  const found=useMemo(()=>{
    const words=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if(!words.length)return [];
    return products.filter(p=>p.id!==exclude&&words.every(w=>`${p.name} ${p.barcode||''}`.toLowerCase().includes(w))).slice(0,8);
  },[query,products,exclude]);
  if(value)return <div className="breakdown-picked"><div><b>{value.name}</b><small>{value.category} · คงเหลือ {value.stock} {value.unit} · ขาย {baht(value.price)}</small></div><button type="button" className="secondary small" onClick={()=>{onChange(null);setQuery('')}}>เปลี่ยน</button></div>;
  return <div className="breakdown-search">
    <div className="search-box"><Search size={17}/><input placeholder={placeholder} value={query} onChange={e=>setQuery(e.target.value)}/></div>
    {found.length>0&&<ul>{found.map(p=><li key={p.id}><button type="button" onClick={()=>{onChange(p);setQuery('')}}><span>{p.name}</span><small>คงเหลือ {p.stock} {p.unit} · {baht(p.price)}</small></button></li>)}</ul>}
    {query.trim()&&!found.length&&<p className="muted">ไม่พบสินค้า</p>}
  </div>;
}

function RuleForm({products,categories,onAction,onSaved,onCancel}:any){
  const [parent,setParent]=useState<any>(null),[ratio,setRatio]=useState('12'),[mode,setMode]=useState<'new'|'existing'>('new');
  const [child,setChild]=useState<any>(null),[name,setName]=useState(''),[unit,setUnit]=useState('ลูก'),[price,setPrice]=useState(''),[busy,setBusy]=useState(false);
  const n=Math.round(Number(ratio));
  const ratioOk=Number.isInteger(n)&&n>=2&&n<=10000;
  const unitCost=parent?.cost!=null&&ratioOk?Math.round(parent.cost/n):null;
  const sell=mode==='new'?Math.round((Number(price)||0)*100):child?.price??0;
  const ready=parent&&ratioOk&&(mode==='new'?name.trim()&&unit.trim()&&String(price).trim()!==''&&Number(price)>=0:child);
  const pickParent=(p:any)=>{setParent(p);if(p&&!name)setName(p.name+' (แบ่งขาย)')};
  const save=async()=>{
    if(!ready)return;
    setBusy(true);
    try{
      let childId=child?.id;
      if(mode==='new'){
        const newId=crypto.randomUUID();
        const category=categories.includes(parent.category)?parent.category:categories[0];
        const made=await onAction('product',{requestId:newId,name:name.trim(),category,price:Number(price),unit:unit.trim(),qty:0,lowStock:0},false);
        if(!made)return;
        childId=made.id||newId;
      }
      const d=await onAction('breakdownRule',{parentId:parent.id,childId,ratio:n,requestId:crypto.randomUUID()},false);
      if(d)onSaved();
    }finally{setBusy(false)}
  };
  return <div className="panel report breakdown-form"><h2>เพิ่มสินค้าขายย่อย</h2>
    <div className="field"><span>1. สินค้าที่จะแกะออกขายย่อย (เช่น ลูกแบด 1 หลอด)</span><ProductSearch products={products} value={parent} onChange={pickParent} placeholder="ค้นหาสินค้าต้นทาง"/></div>
    <div className="field"><span>2. 1 {parent?.unit||'หน่วย'} แยกได้กี่ชิ้น</span><input type="number" inputMode="numeric" min="2" max="10000" step="1" value={ratio} onChange={e=>setRatio(e.target.value)}/></div>
    <div className="field"><span>3. สินค้าขายย่อย</span>
      <div className="breakdown-mode">
        <label><input type="radio" checked={mode==='new'} onChange={()=>setMode('new')}/>สร้างสินค้าใหม่</label>
        <label><input type="radio" checked={mode==='existing'} onChange={()=>setMode('existing')}/>เลือกสินค้าที่มีอยู่แล้ว</label>
      </div>
      {mode==='new'?<div className="form-grid breakdown-new">
        <label className="field"><span>ชื่อสินค้าขายย่อย</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="เช่น ลูกแบด RSL (แบ่งขาย)"/></label>
        <label className="field"><span>หน่วย</span><input value={unit} onChange={e=>setUnit(e.target.value)} placeholder="ลูก / ชิ้น / เส้น"/></label>
        <label className="field"><span>ราคาขายต่อ{unit||'ชิ้น'} (บาท)</span><input type="number" inputMode="decimal" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} placeholder="เช่น 90"/></label>
      </div>:<ProductSearch products={products} value={child} onChange={setChild} placeholder="ค้นหาสินค้าขายย่อย" exclude={parent?.id}/>}
    </div>
    {parent&&ratioOk&&<div className="breakdown-preview">
      <div><span>ต้นทุนต่อ{mode==='new'?unit||'ชิ้น':child?.unit||'ชิ้น'}</span><b>{unitCost===null?'— (ยังไม่มีต้นทุนของ '+parent.name+')':`${baht(unitCost)} (${baht(parent.cost)} ÷ ${n})`}</b></div>
      {sell>0&&<div><span>ขายครบ {n} ชิ้น ได้</span><b>{baht(sell*n)} <small>(ขายทั้ง{parent.unit} {baht(parent.price)})</small></b></div>}
      {sell>0&&unitCost!==null&&<div><span>กำไรต่อชิ้น</span><b className={sell-unitCost>=0?'is-good':'is-bad'}>{baht(sell-unitCost)}</b></div>}
    </div>}
    <div className="actions"><button type="button" className="secondary" disabled={busy} onClick={onCancel}>ยกเลิก</button><button type="button" disabled={busy||!ready} onClick={save}>{busy?'กำลังบันทึก…':'บันทึกสินค้าขายย่อย'}</button></div>
  </div>;
}

function RuleCard({rule,isOwner,onConvert,onDelete,busy}:any){
  const [qty,setQty]=useState(1);
  const enough=rule.parent_stock>=qty;
  return <div className="breakdown-rule">
    <div className="breakdown-pair">
      <div><small>แกะจาก</small><b>{rule.parent_name}</b><span>คงเหลือ {rule.parent_stock} {rule.parent_unit} · {baht(rule.parent_price)}</span></div>
      <ArrowRight size={20}/>
      <div><small>ขายย่อย</small><b>{rule.child_name}</b><span>คงเหลือ {rule.child_stock} {rule.child_unit} · {baht(rule.child_price)}</span></div>
    </div>
    <p className="breakdown-ratio">1 {rule.parent_unit} = {rule.ratio} {rule.child_unit}{isOwner&&rule.parent_cost!=null&&<> · ต้นทุนต่อ{rule.child_unit} {baht(Math.round(rule.parent_cost/rule.ratio))}</>}</p>
    <div className="breakdown-convert">
      <div className="count-stepper" role="group" aria-label="จำนวนที่จะแกะ">
        <button type="button" className="secondary" aria-label="ลด" disabled={qty<=1} onClick={()=>setQty(qty-1)}><Minus size={16}/></button>
        <input inputMode="numeric" aria-label="จำนวนที่จะแกะ" value={qty} onChange={e=>setQty(Math.max(1,Math.min(1000,parseInt(e.target.value.replace(/\D/g,''),10)||1)))}/>
        <button type="button" className="secondary" aria-label="เพิ่ม" onClick={()=>setQty(qty+1)}><Plus size={16}/></button>
      </div>
      <button type="button" disabled={busy||!enough} onClick={()=>onConvert(rule,qty)}><PackageOpen size={17}/>แกะ {qty} {rule.parent_unit} → ได้ {qty*rule.ratio} {rule.child_unit}</button>
      {isOwner&&<button type="button" className="secondary small danger" aria-label="ลบรายการนี้" title="ลบรายการแปลงนี้ (สินค้าไม่ถูกลบ)" disabled={busy} onClick={()=>onDelete(rule)}><Trash2 size={15}/></button>}
    </div>
    {!enough&&<small className="breakdown-warn">{rule.parent_name} ในระบบเหลือ {rule.parent_stock} {rule.parent_unit} ถ้าของจริงมีมากกว่านี้ ให้ปรับยอดสต๊อกในคลังสินค้าก่อน</small>}
  </div>;
}

export function BreakdownPage({products,categories,onAction,onChanged}:any){
  const [state,setState]=useState<any>(undefined),[adding,setAdding]=useState(false),[busy,setBusy]=useState(false);
  const reload=async()=>{try{const r=await fetch('/api/breakdowns',{cache:'no-store'}),d:any=await r.json();if(!r.ok)throw new Error(d.error);setState(d)}catch(e:any){toast.error(e.message);setState({ready:true,rules:[],history:[]})}};
  useEffect(()=>{reload()},[]);
  const active=useMemo(()=>(products||[]).filter((p:any)=>p.active!==0),[products]);
  const convert=async(rule:any,qty:number)=>{
    setBusy(true);
    try{const d=await onAction('breakdownConvert',{id:rule.id,qty,requestId:crypto.randomUUID()},false);if(d){toast.success(`แกะ ${qty} ${rule.parent_unit} ได้ ${qty*rule.ratio} ${rule.child_unit} แล้ว`);await reload();onChanged?.()}}
    finally{setBusy(false)}
  };
  const remove=async(rule:any)=>{
    if(!confirm(`ลบการแปลง “${rule.parent_name} → ${rule.child_name}”? (สินค้าและสต๊อกไม่เปลี่ยน)`))return;
    setBusy(true);try{if(await onAction('breakdownDelete',{id:rule.id,requestId:crypto.randomUUID()},false))await reload()}finally{setBusy(false)}
  };
  if(state===undefined)return <p className="muted">กำลังโหลด…</p>;
  if(!state.ready)return <div className="notice">ต้องรัน migration <code>20260926010000_product_breakdowns.sql</code> บน Supabase ก่อน</div>;
  return <div className="breakdown-page">
    {state.isOwner&&(adding?<RuleForm products={active} categories={categories} onAction={onAction} onCancel={()=>setAdding(false)} onSaved={async()=>{setAdding(false);await reload();onChanged?.()}}/>
      :<button type="button" className="breakdown-add" onClick={()=>setAdding(true)}><Plus size={18}/>เพิ่มสินค้าขายย่อย</button>)}
    {state.rules.length?<div className="breakdown-rules">{state.rules.map((rule:any)=><RuleCard key={rule.id} rule={rule} isOwner={state.isOwner} busy={busy} onConvert={convert} onDelete={remove}/>)}</div>
      :!adding&&<div className="panel empty"><PackageOpen size={36}/><h3>ยังไม่มีสินค้าขายย่อย</h3><p className="muted">{state.isOwner?'กด “เพิ่มสินค้าขายย่อย” เช่น ลูกแบด 1 หลอด แยกขายเป็นลูก':'ให้เจ้าของร้านตั้งค่าสินค้าขายย่อยก่อน'}</p></div>}
    {state.history.length>0&&<div className="panel report breakdown-history"><h2>ประวัติการแกะสินค้า</h2><ul>{state.history.map((h:any)=><li key={h.id}>
      <div><b>{h.parent_qty} {h.parent_unit} {h.parent_name||'(สินค้าถูกลบ)'} → {h.child_qty} {h.child_unit} {h.child_name||''}</b><small>{when(h.created)} · {h.staff_name||'—'}{h.unit_cost!=null&&` · ต้นทุน ${baht(h.unit_cost)}/${h.child_unit}`}</small></div>
    </li>)}</ul></div>}
  </div>;
}
