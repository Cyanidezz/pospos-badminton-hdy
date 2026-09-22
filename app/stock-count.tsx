'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {toast} from 'sonner';
import {Camera,ClipboardCheck,Minus,Plus,ScanLine,Search,TriangleAlert} from 'lucide-react';
import {CountScanner} from './count-scanner';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {COUNT_REASONS,classify,defaultReason,diffOf,diffValue,possibleSwaps,progress,scopeStats,type CountItem,type ScopeStat} from '@/lib/stock-count';

const baht=(satang:number)=>'฿'+(satang/100).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const num=(n:number)=>n.toLocaleString('th-TH');
const dateTime=(iso:string)=>iso?new Date(iso).toLocaleString('th-TH',{day:'numeric',month:'short',year:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'}):'—';

async function call(method:'GET'|'POST',path:string,body?:any){
  const response=await fetch(path,{method,cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const data:any=await response.json().catch(()=>({}));
  if(!response.ok){const err:any=new Error(data.error||'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง');err.code=data.code;throw err}
  return data;
}

let audio:AudioContext|undefined;
function feedback(ok:boolean){
  try{
    const AudioCtor=window.AudioContext||(window as any).webkitAudioContext;
    audio=audio||new AudioCtor();
    const osc=audio.createOscillator(),gain=audio.createGain();
    osc.frequency.value=ok?880:220;gain.gain.value=.08;osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+.09);
  }catch{}
  try{navigator.vibrate?.(ok?30:[60,40,60])}catch{}
}

function Stepper({value,onChange,label}:{value:number;onChange:(n:number)=>void;label:string}){
  return <div className="count-stepper" role="group" aria-label={label}>
    <button type="button" className="secondary" aria-label="ลดหนึ่งชิ้น" disabled={value<=0} onClick={()=>onChange(value-1)}><Minus size={16}/></button>
    <input aria-label={'จำนวนที่นับ '+label} inputMode="numeric" value={value} onChange={e=>{const n=Math.max(0,Math.min(100000,parseInt(e.target.value.replace(/\D/g,''),10)||0));onChange(n)}}/>
    <button type="button" className="secondary" aria-label="เพิ่มหนึ่งชิ้น" onClick={()=>onChange(value+1)}><Plus size={16}/></button>
  </div>;
}

// ---------------------------------------------------------------- counting (everyone with inventory access)
function Counting({data,isOwner,categories,reload}:any){
  const [items,setItems]=useState<CountItem[]>(data.items);
  const [code,setCode]=useState(''),[camera,setCamera]=useState(false),[tab,setTab]=useState<'done'|'todo'>('todo'),[search,setSearch]=useState(''),[last,setLast]=useState<string>(''),[confirming,setConfirming]=useState(''),[busy,setBusy]=useState(false);
  const [newProduct,setNewProduct]=useState<{code:string;name:string;price:string;category:string}|null>(null),[addBusy,setAddBusy]=useState(false);
  const pending=useRef(0),queue=useRef<Promise<unknown>>(Promise.resolve()),input=useRef<HTMLInputElement>(null);
  const session=data.session;

  // Pick up other people's counts, but never while one of our own requests is still on its way.
  useEffect(()=>{setItems(current=>pending.current?current:data.items)},[data.items]);
  useEffect(()=>{
    const timer=setInterval(()=>{if(!pending.current&&!document.hidden)reload()},20000);
    return()=>clearInterval(timer);
  },[reload]);

  const send=useCallback((body:any,rollback:()=>void)=>{
    pending.current+=1;
    queue.current=queue.current.then(async()=>{
      try{
        const result=await call('POST','/api/count',{countId:session.id,...body});
        setItems(list=>list.map(i=>i.product_id===result.productId?{...i,counted:result.counted,touched:1}:i));
      }catch(e:any){rollback();feedback(false);toast.error(e.message)}
      finally{pending.current-=1}
    });
  },[session.id]);

  const byCode=useMemo(()=>{const map=new Map<string,CountItem>();for(const i of items){if(i.barcode)map.set(i.barcode,i);if(i.scan_code)map.set(i.scan_code,i)}return map},[items]);
  const change=(productId:string,delta:number,absolute?:number)=>{
    const before=items.find(i=>i.product_id===productId);if(!before)return;
    const next=absolute!==undefined?absolute:Math.max(0,before.counted+delta);
    setItems(list=>list.map(i=>i.product_id===productId?{...i,counted:next,touched:1}:i));
    setLast(productId);
    send(absolute!==undefined||delta<0?{action:'set',productId,qty:next}:{action:'scan',code:before.barcode,qty:delta},()=>setItems(list=>list.map(i=>i.product_id===productId?before:i)));
  };
  // A barcode not in this count's item list (either it belongs to a product outside the count's scope, or the
  // product was never registered at all) is checked against the server, which can tell the two apart; a genuinely
  // unknown one offers to register it on the spot instead of a dead end.
  const scan=async(raw:string)=>{
    const value=raw.trim();if(!value)return;
    const item=byCode.get(value);
    if(item){feedback(true);change(item.product_id,1);return}
    try{
      const result=await call('POST','/api/count',{action:'scan',countId:session.id,code:value,qty:1});
      feedback(true);
      setItems(list=>list.map(i=>i.product_id===result.productId?{...i,counted:result.counted,touched:1}:i));
      setLast(result.productId);
    }catch(e:any){
      feedback(false);
      // Default the category to whatever this count is scoped to (a barcode found during a "Support"-only count
      // is almost certainly also "Support"); a whole-shop count has no such hint, so fall back to the first one.
      if(e.code==='not_found')setNewProduct({code:value,name:'',price:'',category:session.scope||categories[0]||''});
      else toast.error(e.message);
    }
  };
  const addNew=async(e:any)=>{
    e.preventDefault();if(!newProduct)return;
    setAddBusy(true);
    try{
      const result=await call('POST','/api/count',{action:'scanNew',countId:session.id,code:newProduct.code,name:newProduct.name,price:newProduct.price,category:newProduct.category});
      feedback(true);
      setItems(list=>[...list,{product_id:result.productId,name:newProduct.name,category:newProduct.category,barcode:newProduct.code,scan_code:null,expected:0,counted:result.counted,touched:1,applied:0,reason:null,has_stock:false,cost:null,unit:'ชิ้น'}]);
      setLast(result.productId);
      setNewProduct(null);
      toast.success('เพิ่มสินค้าและนับแล้ว');
    }catch(e:any){toast.error(e.message)}
    finally{setAddBusy(false)}
  };

  const stats=progress(items),done=items.filter(i=>i.touched),todo=items.filter(i=>!i.touched&&i.has_stock);
  const lastItem=items.find(i=>i.product_id===last);
  const text=search.trim().toLowerCase();
  const found=text?items.filter(i=>i.name.toLowerCase().includes(text)||(i.barcode||'').includes(text)).slice(0,8):[];
  const list=(tab==='done'?done:todo).slice(0,300);

  const act=async(action:string,extra:any={})=>{setBusy(true);try{await call('POST','/api/count',{action,countId:session.id,...extra});await reload();setConfirming('')}catch(e:any){toast.error(e.message)}finally{setBusy(false)}};

  return <div className="count-layout">
    <section className="panel count-main">
      <div className="count-head"><div><h2>{session.name}</h2><small>เริ่ม {dateTime(session.started)} · {session.scope||'ทั้งร้าน'} · นับแบบไม่แสดงยอดในระบบ</small></div></div>
      <div className="count-progress"><div className="count-bar"><i style={{width:(stats.shouldHave?Math.min(100,stats.counted/stats.shouldHave*100):100)+'%'}}/></div>
        <span>นับแล้ว <b>{stats.counted}</b> จาก <b>{stats.shouldHave}</b> รายการที่ระบบว่ามีของ · รวม {stats.units.toLocaleString('th-TH')} ชิ้น ({stats.products} รายการ)</span></div>
      <form className="count-scan" onSubmit={e=>{e.preventDefault();scan(code);setCode('');input.current?.focus()}}>
        <div className="search-box"><ScanLine size={18}/><input ref={input} autoFocus value={code} onChange={e=>setCode(e.target.value)} placeholder="สแกนหรือพิมพ์บาร์โค้ด แล้วกด Enter" autoComplete="off"/></div>
        <button type="button" className={camera?'':'secondary'} onClick={()=>setCamera(v=>!v)}><Camera size={18}/>{camera?'ปิดกล้อง':'เปิดกล้องสแกน'}</button>
      </form>
      <CountScanner active={camera} onCode={scan}/>
      {lastItem&&<div className="count-last"><div><small>สแกนล่าสุด</small><b>{lastItem.name}</b><span>{lastItem.category}</span></div><Stepper value={lastItem.counted} label={lastItem.name} onChange={n=>change(lastItem.product_id,0,n)}/></div>}
      <div className="count-find"><div className="search-box"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาชื่อสินค้า เพื่อใส่จำนวนเอง (ของกองใหญ่ / บาร์โค้ดสแกนไม่ติด)"/></div>
        {found.length>0&&<ul className="count-found">{found.map(i=><li key={i.product_id}><div><b>{i.name}</b><small>{i.category}</small></div><Stepper value={i.counted} label={i.name} onChange={n=>change(i.product_id,0,n)}/></li>)}</ul>}</div>
    </section>

    <section className="panel count-side">
      <div className="count-tabs" role="tablist"><button role="tab" aria-selected={tab==='todo'} className={tab==='todo'?'is-active':''} onClick={()=>setTab('todo')}>ยังไม่ได้นับ ({todo.length})</button><button role="tab" aria-selected={tab==='done'} className={tab==='done'?'is-active':''} onClick={()=>setTab('done')}>นับแล้ว ({done.length})</button></div>
      {tab==='todo'&&<p className="muted">สินค้าที่ระบบว่ามีของแต่ยังไม่ได้นับ ถ้าหาเจอให้สแกน ถ้าไม่มีของจริงให้กด “ไม่มีของ”</p>}
      <ul className="count-rows">{list.map(i=><li key={i.product_id}><div><b>{i.name}</b><small>{i.category}</small></div>
        {tab==='done'?<Stepper value={i.counted} label={i.name} onChange={n=>change(i.product_id,0,n)}/>:<button type="button" className="secondary small" onClick={()=>change(i.product_id,0,0)}>ไม่มีของ</button>}</li>)}
        {list.length===0&&<li className="count-empty">{tab==='todo'?'นับครบทุกรายการที่ระบบว่ามีของแล้ว':'ยังไม่ได้นับอะไร'}</li>}</ul>
      {isOwner?<div className="count-owner">
        {confirming==='finish'?<div className="void-notice"><TriangleAlert size={20}/><div><b>จบการนับ?</b><span>{todo.length>0?`ยังมี ${todo.length} รายการที่ระบบว่ามีของแต่ไม่ได้นับ จะถือว่านับได้ 0 (ขาด)`:'นับครบทุกรายการแล้ว'} หลังจบจะดูผลขาด/เกินก่อน ยังไม่ปรับสต๊อกจนกว่าจะยืนยัน</span></div></div>:null}
        {confirming==='cancel'?<div className="void-notice"><TriangleAlert size={20}/><div><b>ยกเลิกรอบนับ?</b><span>ผลที่นับไว้จะไม่ถูกใช้ และไม่มีการปรับสต๊อก</span></div></div>:null}
        <div className="actions wrap">
          {confirming?<><button type="button" className="secondary" disabled={busy} onClick={()=>setConfirming('')}>ไม่ใช่</button><button type="button" disabled={busy} onClick={()=>act(confirming)}>{confirming==='finish'?'ยืนยันจบการนับ':'ยืนยันยกเลิก'}</button></>:<><button type="button" className="secondary danger" onClick={()=>setConfirming('cancel')}>ยกเลิกรอบนับ</button><button type="button" onClick={()=>setConfirming('finish')}>จบการนับ</button></>}
        </div>
      </div>:<p className="muted">นับเสร็จแล้วแจ้งเจ้าของร้านให้กด “จบการนับ”</p>}
    </section>
    {newProduct&&<Dialog open onOpenChange={v=>{if(!v&&!addBusy)setNewProduct(null)}}><DialogContent className="pos-dialog">
      <DialogHeader><DialogTitle>เพิ่มสินค้าใหม่จากบาร์โค้ด</DialogTitle><DialogDescription>ยังไม่พบสินค้านี้ในระบบ กรอกข้อมูลเพื่อเพิ่มเข้าสต๊อกและนับเป็นของที่เจอ 1 ชิ้นเลย</DialogDescription></DialogHeader>
      <form onSubmit={addNew}>
        <div className="field"><span>บาร์โค้ดที่สแกน</span><input readOnly value={newProduct.code}/></div>
        <div className="field"><span>ชื่อสินค้า</span><input autoFocus required maxLength={200} value={newProduct.name} onChange={e=>setNewProduct({...newProduct,name:e.target.value})}/></div>
        <div className="field"><span>ราคาขาย (บาท)</span><input required type="number" inputMode="decimal" min="0" step="0.01" value={newProduct.price} onChange={e=>setNewProduct({...newProduct,price:e.target.value})}/></div>
        <div className="field"><span id="new-product-category">หมวดหมู่</span>
          <Select value={newProduct.category} onValueChange={v=>setNewProduct({...newProduct,category:v})}>
            <SelectTrigger className="choice" aria-labelledby="new-product-category"><SelectValue placeholder="เลือกหมวดหมู่"/></SelectTrigger>
            <SelectContent>{categories.map((c:string)=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <p className="muted">เพิ่มเป็นสินค้าใหม่ ยอดในระบบเริ่มที่ 0 เพราะไม่เคยมีในสต๊อกมาก่อน จำนวนที่นับได้ในรอบนี้จะขึ้นเป็น "เกิน" ให้ตรวจสอบตอนปิดรอบนับ</p>
        <div className="dialog-actions"><button type="button" className="secondary" disabled={addBusy} onClick={()=>setNewProduct(null)}>ยกเลิก</button><button disabled={addBusy||!newProduct.name.trim()||!newProduct.category}>{addBusy?'กำลังบันทึก…':'เพิ่มและนับเลย'}</button></div>
      </form>
    </DialogContent></Dialog>}
  </div>;
}

// ---------------------------------------------------------------- review and confirm (owner)
function Review({data,isOwner,reload,onStockChanged}:any){
  const items:CountItem[]=data.items,session=data.session,since=data.since||{bills:0,receipts:0};
  const result=useMemo(()=>classify(items),[items]),swaps=useMemo(()=>possibleSwaps(items),[items]);
  const swapIds=useMemo(()=>new Set(swaps.flatMap(s=>[s.missing.product_id,s.surplus.product_id])),[swaps]);
  const rows=useMemo(()=>[...result.missing,...result.surplus],[result]);
  const [sel,setSel]=useState<Record<string,{on:boolean;reason:string}>>(()=>Object.fromEntries(rows.map(i=>[i.product_id,{on:true,reason:defaultReason(i,swapIds)}])));
  const [filter,setFilter]=useState<'all'|'missing'|'surplus'>('all'),[confirming,setConfirming]=useState(''),[busy,setBusy]=useState(false);
  const shown=filter==='missing'?result.missing:filter==='surplus'?result.surplus:rows;
  const chosen=rows.filter(i=>sel[i.product_id]?.on);
  const set=(id:string,patch:any)=>setSel(s=>({...s,[id]:{...s[id],...patch}}));
  const run=async(action:string,extra:any={},message='')=>{setBusy(true);try{await call('POST','/api/count',{action,countId:session.id,...extra});if(message)toast.success(message);await reload();if(action==='apply')onStockChanged?.()}catch(e:any){toast.error(e.message)}finally{setBusy(false);setConfirming('')}};
  if(!isOwner)return <section className="panel count-review"><h2>{session.name}</h2><p className="muted">นับเสร็จแล้ว รอเจ้าของร้านตรวจสอบผลและยืนยันการปรับสต๊อก</p></section>;
  return <div className="count-review-wrap">
    <div className="count-cards">
      <div className="count-card missing"><span>ขาด (นับได้น้อยกว่าในระบบ)</span><b>{result.missing.length} รายการ · {result.missingUnits} ชิ้น</b><em>{baht(result.missingValue)}</em></div>
      <div className="count-card surplus"><span>เกิน (นับได้มากกว่าในระบบ)</span><b>{result.surplus.length} รายการ · {result.surplusUnits} ชิ้น</b><em>{baht(result.surplusValue)}</em></div>
      <div className="count-card ok"><span>ตรงกับระบบ</span><b>{result.matched.length} รายการ</b><em>ไม่ต้องปรับ</em></div>
    </div>
    {(since.bills>0||since.receipts>0)&&<div className="notice"><b>ระหว่างนับมีความเคลื่อนไหว:</b> ขายไป {since.bills} บิล · รับสินค้าเข้า {since.receipts} ครั้ง ระบบจะปรับสต๊อก “เพิ่ม/ลดตามผลนับ” โดยไม่ทับยอดขายที่เกิดหลังเริ่มนับ แต่ตัวเลขขาด/เกินของสินค้าที่ขายระหว่างนับอาจคลาดเคลื่อน</div>}
    {swaps.length>0&&<section className="panel count-swaps"><h3>อาจไม่ใช่ของหาย แต่สแกนหรือขายผิดตัว ({swaps.length})</h3><p className="muted">สินค้าหมวดเดียวกันที่ตัวหนึ่งขาด อีกตัวเกินเท่ากัน ลองตรวจว่าบิลขายหรือใบรับเข้าใช้บาร์โค้ดผิดตัวหรือไม่</p>
      <ul>{swaps.map(s=><li key={s.missing.product_id}><b>{s.missing.name}</b> ขาด {s.qty} <span>⇄</span> <b>{s.surplus.name}</b> เกิน {s.qty}{s.similarCost&&<em className="badge green">ราคาใกล้กัน</em>}</li>)}</ul></section>}
    <section className="panel count-review">
      <div className="count-review-head"><h2>ผลต่างที่ต้องปรับ ({rows.length})</h2>
        <div className="count-tabs" role="tablist">{([['all','ทั้งหมด'],['missing','ขาด'],['surplus','เกิน']] as const).map(([id,label])=><button key={id} role="tab" aria-selected={filter===id} className={filter===id?'is-active':''} onClick={()=>setFilter(id)}>{label}</button>)}</div>
        <div className="actions"><button type="button" className="secondary small" onClick={()=>setSel(s=>Object.fromEntries(Object.entries(s).map(([k,v])=>[k,{...v,on:true}])))}>เลือกทั้งหมด</button><button type="button" className="secondary small" onClick={()=>setSel(s=>Object.fromEntries(Object.entries(s).map(([k,v])=>[k,{...v,on:false}])))}>ไม่เลือก</button></div></div>
      {rows.length===0?<div className="empty"><h3>สต๊อกตรงกับของจริงทุกรายการ</h3><p>ไม่มีอะไรต้องปรับ กดปิดรอบนับได้เลย</p></div>:
      <div className="table-scroll"><table className="member-table count-table"><thead><tr><th></th><th>สินค้า</th><th>ในระบบ</th><th>นับได้</th><th>ผลต่าง</th><th>มูลค่า</th><th>เหตุผล</th></tr></thead><tbody>
        {shown.map(i=>{const d=diffOf(i);return <tr key={i.product_id} className={sel[i.product_id]?.on?'':'is-off'}>
          <td><input type="checkbox" aria-label={'ปรับ '+i.name} checked={!!sel[i.product_id]?.on} onChange={e=>set(i.product_id,{on:e.target.checked})}/></td>
          <td><b>{i.name}</b><small>{i.category}{!i.touched&&i.has_stock?' · ไม่ได้สแกน':''}{(i.expected??0)<0?' · ยอดติดลบในระบบ':''}</small></td>
          <td>{i.expected}</td><td>{i.counted}</td><td className={d<0?'neg':'pos'}>{d>0?'+':''}{d}</td><td>{baht(diffValue(i))}</td>
          <td><select aria-label={'เหตุผล '+i.name} value={sel[i.product_id]?.reason} onChange={e=>set(i.product_id,{reason:e.target.value})}>{COUNT_REASONS.map(r=><option key={r}>{r}</option>)}</select></td></tr>})}
      </tbody></table></div>}
      <div className="count-owner">
        {confirming==='apply'&&<div className="void-notice"><TriangleAlert size={20}/><div><b>ยืนยันปรับสต๊อก {chosen.length} รายการ?</b><span>ระบบจะปรับยอดสินค้าตามผลนับและบันทึกลงประวัติสต๊อก ย้อนกลับไม่ได้จากหน้านี้</span></div></div>}
        {confirming==='cancel'&&<div className="void-notice"><TriangleAlert size={20}/><div><b>ยกเลิกรอบนับนี้?</b><span>ไม่มีการปรับสต๊อก ผลที่นับไว้จะไม่ถูกใช้</span></div></div>}
        <div className="actions wrap">{confirming?<><button type="button" className="secondary" disabled={busy} onClick={()=>setConfirming('')}>ไม่ใช่</button><button type="button" disabled={busy} onClick={()=>confirming==='apply'?run('apply',{requestId:crypto.randomUUID(),rows:chosen.map(i=>({productId:i.product_id,reason:sel[i.product_id].reason}))},'ปรับสต๊อกตามผลนับแล้ว'):run('cancel',{},'ยกเลิกรอบนับแล้ว')}>{confirming==='apply'?'ยืนยันปรับสต๊อก':'ยืนยันยกเลิก'}</button></>:<>
          <button type="button" className="secondary danger" onClick={()=>setConfirming('cancel')}>ยกเลิกรอบนี้</button>
          <button type="button" className="secondary" disabled={busy} onClick={()=>run('reopen')}>กลับไปนับต่อ</button>
          <button type="button" onClick={()=>setConfirming('apply')}>{rows.length===0?'ปิดรอบนับ':`ปรับสต๊อก ${chosen.length} รายการ`}</button></>}</div>
      </div>
    </section>
  </div>;
}

// ---------------------------------------------------------------- start screen and history
// One row of the scope picker: the name on the left, "N รายการ · M ชิ้น" on the right.
const ScopeLabel=({name,stat}:{name:string;stat:ScopeStat})=><span className="scope-row"><b>{name}</b><small className="scope-count">{num(stat.items)} รายการ · {num(stat.units)} ชิ้น</small></span>;

function Start({data,isOwner,categories,products,reload}:any){
  const stats=useMemo(()=>scopeStats(products||[],categories),[products,categories]);
  const [scope,setScope]=useState(''),[busy,setBusy]=useState(false),[detail,setDetail]=useState<any>(null);
  const shown=scope?stats.byCategory[scope]:stats.all;
  const start=async()=>{setBusy(true);try{await call('POST','/api/count',{action:'start',scope,requestId:crypto.randomUUID()});await reload()}catch(e:any){toast.error(e.message)}finally{setBusy(false)}};
  const open=async(id:string)=>{try{setDetail(await call('GET','/api/count?view=detail&id='+id))}catch(e:any){toast.error(e.message)}};
  return <div className="count-layout single">
    <section className="panel count-main">
      <h2><ClipboardCheck size={20}/> เริ่มรอบนับสต๊อก</h2>
      {isOwner?<>
        <p className="muted">ระบบจะจำยอดในระบบ ณ ตอนกดเริ่ม ให้พนักงานสแกนนับของที่มีอยู่จริง แล้วเทียบให้ว่าสินค้าไหนขาด (หาย) หรือเกิน แนะนำให้นับตอนร้านปิด</p>
        <div className="field"><span id="scope-label">ขอบเขตการนับ</span>
          <Select value={scope||'__all'} onValueChange={v=>setScope(v==='__all'?'':v)}>
            <SelectTrigger className="choice scope-trigger" aria-labelledby="scope-label"><SelectValue/></SelectTrigger>
            <SelectContent position="popper" sideOffset={6} className="scope-menu">
              <SelectItem value="__all" className="scope-item"><ScopeLabel name="ทั้งร้าน" stat={stats.all}/></SelectItem>
              {categories.map((c:string)=>{const st=stats.byCategory[c];return <SelectItem key={c} value={c} className="scope-item" disabled={!st.items}><ScopeLabel name={c} stat={st}/></SelectItem>})}
            </SelectContent>
          </Select>
        </div>
        <p className="scope-summary">รอบนี้จะนับ <b>{num(shown.items)} รายการ</b> · ในระบบมีรวม <b>{num(shown.units)} ชิ้น</b></p>
        <button disabled={busy||!shown.items} onClick={start}>{busy?'กำลังสร้างรอบนับ…':'เริ่มรอบนับ'}</button>
      </>:<p className="muted">ยังไม่มีรอบนับที่เปิดอยู่ ให้เจ้าของร้านเริ่มรอบนับก่อน</p>}
    </section>
    {data.history.length>0&&<section className="panel count-history"><h2>ประวัติการนับ</h2>
      <ul>{data.history.map((h:any)=>{let s:any={};try{s=JSON.parse(h.summary||'{}')}catch{}return <li key={h.id}>
        <div><b>{h.name}</b><small>{dateTime(h.closed||h.started)} · {h.status==='closed'?'ปรับสต๊อกแล้ว':'ยกเลิก'}</small></div>
        {h.status==='closed'&&<div className="count-history-nums"><span className="neg">ขาด {s.missingItems??0} · {baht(s.missingValue||0)}</span><span className="pos">เกิน {s.surplusItems??0} · {baht(s.surplusValue||0)}</span></div>}
        {isOwner&&h.status==='closed'&&<button type="button" className="secondary small" onClick={()=>open(h.id)}>ดูรายการ</button>}</li>})}</ul>
      {detail&&<div className="count-detail"><h3>{detail.session.name}</h3><div className="table-scroll"><table className="member-table"><thead><tr><th>สินค้า</th><th>ในระบบ</th><th>นับได้</th><th>ผลต่าง</th><th>เหตุผล</th></tr></thead><tbody>
        {detail.items.map((i:any)=>{const d=i.counted-i.expected;return <tr key={i.product_id}><td>{i.name}</td><td>{i.expected}</td><td>{i.counted}</td><td className={d<0?'neg':'pos'}>{d>0?'+':''}{d}</td><td>{i.applied?i.reason:'ไม่ได้ปรับ'}</td></tr>})}
      </tbody></table></div></div>}
    </section>}
  </div>;
}

export function StockCountPage({isOwner,categories,products,onStockChanged}:any){
  const [data,setData]=useState<any>(null),[error,setError]=useState('');
  const reload=useCallback(async()=>{try{setData(await call('GET','/api/count'));setError('')}catch(e:any){setError(e.message)}},[]);
  useEffect(()=>{reload()},[reload]);
  if(error&&!data)return <div className="panel report"><div className="notice">{error}</div></div>;
  if(!data)return <div className="panel report"><p>กำลังโหลด…</p></div>;
  if(!data.ready)return <div className="panel report"><div className="notice">ระบบนับสต๊อกต้องอัปเดตฐานข้อมูลก่อน ให้รัน migration <code>20260922030000_stock_counts.sql</code> บน Supabase แล้วรีเฟรชหน้านี้</div></div>;
  if(!data.session)return <Start data={data} isOwner={isOwner} categories={categories} products={products} reload={reload}/>;
  return data.session.status==='counting'?<Counting key={data.session.id} data={data} isOwner={isOwner} categories={categories} reload={reload}/>:<Review key={data.session.id+data.session.status} data={data} isOwner={isOwner} reload={reload} onStockChanged={onStockChanged}/>;
}
