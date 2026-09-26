'use client';
import {useEffect,useMemo,useState} from 'react';
import {Gift,MessageCircle,Pencil,Phone,Search} from 'lucide-react';
import {billEarnsStamp,buildCustomers,matchCustomers,phoneDigits,promoOf,type Customer} from '@/lib/customers';
import {CustomerInput} from './job-form';

const baht=(satang:number)=>'฿'+(satang/100).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const day=(iso:string)=>iso?new Date(iso).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit',timeZone:'Asia/Bangkok'}):'—';
const options=(config:any,sales:any[])=>({stampsRequired:config?.member_stamps_required,socksStampsRequired:config?.member_socks_stamps_required,sales,posMinAmount:Number(config?.member_pos_min_amount)||0,notes:config?.customer_notes,manualMembers:config?.manual_members,promo:promoOf(config)});

// The customer's stamp card: one circle per star needed for the free-stringing reward (the bigger of the two
// tiers), with the socks-reward milestone marked partway along. Redeeming EITHER resets the star count to zero.
export function StampCard({customer,socksProductName}:{customer:Customer;socksProductName?:string|null}){
  const circles=customer.stringNeed<=20?Array.from({length:customer.stringNeed},(_,i)=>i):[];
  return <div className="stamp-card stamp-card-panel">
    <div className="stamp-head"><b>บัตรสะสมแต้ม</b><span>{customer.stars} ดาว · แลกไปแล้ว {customer.stringUsed+customer.socksUsed} ครั้ง</span></div>
    {circles.length>0?<div className="stamp-dots">{circles.map(i=><span key={i} className={(i<customer.stars?'is-filled ':'')+(i===customer.socksNeed-1?'is-milestone':'')}>{i<customer.stars?'✓':i+1}</span>)}</div>:<div className="stamp-bar"><i style={{width:(customer.stars/customer.stringNeed*100)+'%'}}/></div>}
    <div className="stamp-sources">แต้มทั้งหมด {customer.stamps} · จากขึ้นเอ็น {customer.jobStamps} · จากซื้อหน้าร้าน {customer.posStamps}</div>
    {socksProductName&&<div className={'stamp-reward'+(customer.socksAvailable?' is-ready':'')}><Gift size={18}/><span>{customer.socksAvailable?<><b>มีสิทธิ์แลก{socksProductName}ฟรี</b> · ครบ {customer.socksNeed} ดาว</>:<>สะสมอีก {Math.max(0,customer.socksNeed-customer.stars)} ดาวแลก{socksProductName}ฟรี (ครบ {customer.socksNeed} ดาว)</>}</span></div>}
    <div className={'stamp-reward'+(customer.stringAvailable?' is-ready':'')}><Gift size={18}/><span>{customer.stringAvailable?<><b>มีสิทธิ์ขึ้นเอ็นฟรี</b> · เลือกตอนรับไม้ใหม่ (ครบ {customer.stringNeed} ดาว)</>:<>สะสมอีก {Math.max(0,customer.stringNeed-customer.stars)} ดาวได้สิทธิ์ขึ้นเอ็นฟรี (ครบ {customer.stringNeed} ดาว)</>}</span></div>
  </div>;
}

function EditForm({customer,onSave,onDone}:any){
  const [name,setName]=useState(customer.name),[phone,setPhone]=useState(customer.phone),[note,setNote]=useState(customer.note||''),[busy,setBusy]=useState(false);
  return <form className="member-edit" onSubmit={async e=>{e.preventDefault();setBusy(true);const saved=await onSave({key:customer.key,name,phone,note});setBusy(false);if(saved)onDone(saved.key)}}>
    <div className="form-grid">
      <label className="field"><span>ชื่อลูกค้า</span><input required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>
      <label className="field"><span>เบอร์โทร</span><input type="tel" inputMode="tel" maxLength={30} value={phone} onChange={e=>setPhone(e.target.value)}/></label>
    </div>
    <label className="field"><span>บันทึกเกี่ยวกับลูกค้า</span><textarea rows={2} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} placeholder="เช่น ชอบความตึงสูง / มารับหลัง 18.00 / สนใจไม้รุ่นใหม่"/></label>
    <p className="muted">แก้ชื่อหรือเบอร์ จะอัปเดตงานขึ้นเอ็นและบิลหน้าร้านทั้งหมดของลูกค้าคนนี้ให้ตรงกัน (เบอร์ที่มีลูกค้าอื่นใช้อยู่แล้วจะบันทึกไม่ได้)</p>
    <div className="actions"><button type="button" className="secondary" disabled={busy} onClick={()=>onDone()}>ยกเลิก</button><button disabled={busy}>{busy?'กำลังบันทึก…':'บันทึก'}</button></div>
  </form>;
}

function Detail({customer,posMin,promo,socksProductName,onSave,setKey}:any){
  const [editing,setEditing]=useState(false);
  return <div className="member-detail">
    <div className="member-title"><div><h2>{customer.name}</h2>{customer.phone&&<a className="contact-link" href={'tel:'+customer.phone.replace(/[^0-9+]/g,'')}><Phone size={16}/>{customer.phone}</a>}</div>
      <div className="member-figures"><div><span>มาแล้ว</span><b>{customer.visits} ครั้ง</b></div><div><span>ใช้จ่ายรวม</span><b>{baht(customer.spent)}</b></div><div><span>ล่าสุด</span><b>{day(customer.last)}</b></div></div></div>
    {editing?<EditForm key={customer.key} customer={customer} onSave={onSave} onDone={(newKey?:string)=>{setEditing(false);if(newKey)setKey(newKey)}}/>:<>
      <div className="member-note-row">{customer.note?<div className="member-note"><b>บันทึก</b><p>{customer.note}</p></div>:<span className="muted">ยังไม่มีบันทึกเกี่ยวกับลูกค้า</span>}<button type="button" className="secondary small" onClick={()=>setEditing(true)}><Pencil size={14}/> แก้ไขข้อมูล</button></div>
    </>}
    <StampCard customer={customer} socksProductName={socksProductName}/>
    {customer.rackets.length>0&&<div className="member-block"><h3>ไม้ที่เคยขึ้นเอ็น</h3><div className="racket-chips">{customer.rackets.map((r:any)=><span className="chip" key={r.name}>{r.name}{r.tension?' · '+r.tension:''}</span>)}</div></div>}
    {customer.jobs.length>0&&<div className="member-block"><h3>ประวัติขึ้นเอ็น</h3>
      <div className="table-scroll"><table className="member-table"><thead><tr><th>วันที่</th><th>ไม้</th><th>สถานะ</th><th>ยอด</th></tr></thead><tbody>
        {customer.jobs.map((j:any)=><tr key={j.id}><td>{day(j.created)}</td><td>{j.racket}{j.reward_used===1&&<span className="badge green"> ใช้สิทธิ์ฟรี</span>}</td><td>{j.status}</td><td>{j.paid?(j.amount===0?'ฟรี':baht(j.amount)):'รอชำระ'}</td></tr>)}
      </tbody></table></div></div>}
    {customer.sales.length>0&&<div className="member-block"><h3>ซื้อที่หน้าร้าน (POS)</h3>
      <div className="table-scroll"><table className="member-table"><thead><tr><th>วันที่</th><th>ชำระโดย</th><th>ยอด</th><th>แต้ม</th></tr></thead><tbody>
        {customer.sales.map((s:any)=><tr key={s.id}><td>{day(s.created)}</td><td>{s.method}</td><td>{baht(s.total)}</td><td>{billEarnsStamp(s,posMin,promo)?'+1':'—'}</td></tr>)}
      </tbody></table></div></div>}
  </div>;
}

// สมาชิกผ่าน LINE at the counter. A customer signs up in LINE and gets a 6-digit code on their member page; staff type
// that code here (the codes are never listed - only the customer's own phone shows it), check the name and number,
// and confirm. Also: requests still waiting (reject only), and linked members (unlink if linked to the wrong person).
function LineMembersPanel({rows,onAction,reload}:any){
  const [code,setCode]=useState(''),[match,setMatch]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[showLinked,setShowLinked]=useState(false);
  const pending=(rows||[]).filter((r:any)=>r.status==='pending'),linked=(rows||[]).filter((r:any)=>r.status==='verified');
  const fmtPhone=(p:string)=>p.replace(/(\d{3})(\d{3})(\d+)/,'$1-$2-$3');
  const find=async(e:any)=>{e.preventDefault();setError('');setMatch(null);
    try{const r=await fetch('/api/line-members?code='+encodeURIComponent(code.replace(/\D/g,'')),{cache:'no-store'}),d:any=await r.json();if(!r.ok)throw new Error(d.error);setMatch(d.match)}catch(err:any){setError(err.message)}};
  const run=async(action:string,r:any,extra:any={})=>{setBusy(true);try{if(await onAction(action,{lineUser:r.line_user,phone:r.phone,...extra,requestId:crypto.randomUUID()},false)){setMatch(null);setCode('');await reload()}}finally{setBusy(false)}};
  return <section className="panel line-requests"><h2><MessageCircle size={18}/> สมาชิกผ่าน LINE {pending.length>0&&<span className="badge amber">รอยืนยัน {pending.length}</span>}</h2>
    <p className="muted">ลูกค้าสมัครใน LINE แล้ว ให้เปิด “บัตรสมาชิก” แล้วแสดงรหัส 6 หลักบนมือถือ กรอกรหัสที่นี่เพื่อยืนยันว่าเป็นเจ้าของเบอร์ (หรือให้ลูกค้าสแกน QR บนใบรับไม้ ระบบยืนยันให้อัตโนมัติ)</p>
    <form className="line-code-form" onSubmit={find}><input inputMode="numeric" maxLength={7} placeholder="รหัส 6 หลักจากมือถือลูกค้า" value={code} onChange={e=>setCode(e.target.value)}/><button disabled={code.replace(/\D/g,'').length!==6}><Search size={17}/>ค้นหา</button></form>
    {error&&<p className="line-code-error">{error}</p>}
    {match&&<div className="line-code-match"><div><b>{match.name||'—'}</b><small>{fmtPhone(match.phone)}{match.shop_name?` · ชื่อในประวัติร้าน: ${match.shop_name}`:' · ลูกค้าใหม่'} · สมัคร {day(match.created)}</small></div>
      <button type="button" disabled={busy} onClick={()=>run('lineMemberApprove',match,{code:code.replace(/\D/g,'')})}>ยืนยันเป็นสมาชิก</button></div>}
    {pending.length>0&&<details className="line-list"><summary>รอยืนยัน {pending.length} คำขอ</summary><ul>{pending.map((r:any)=><li key={r.line_user+r.phone}>
      <div><b>{r.name||'—'}</b><small>{fmtPhone(r.phone)}{r.shop_name?` · ชื่อในประวัติร้าน: ${r.shop_name}`:''} · ขอเมื่อ {day(r.created)}</small></div>
      <button type="button" className="secondary small danger" disabled={busy} onClick={()=>{if(confirm(`ปฏิเสธคำขอของ ${r.name||r.phone}?`))run('lineMemberReject',r)}}>ปฏิเสธ</button>
    </li>)}</ul></details>}
    {linked.length>0&&<details className="line-list" open={showLinked} onToggle={(e:any)=>setShowLinked(e.currentTarget.open)}><summary>เชื่อม LINE แล้ว {linked.length} เบอร์</summary><ul>{linked.map((r:any)=><li key={r.line_user+r.phone}>
      <div><b>{r.name||r.shop_name||'—'}</b><small>{fmtPhone(r.phone)} · {r.method==='link'?'สแกน QR ใบรับไม้':r.method==='code'?`ยืนยันที่ร้าน${r.verified_by_name?` โดย ${r.verified_by_name}`:''}`:'ยืนยันแล้ว'} · {day(r.verified_at||r.created)}</small></div>
      <button type="button" className="secondary small danger" disabled={busy} onClick={()=>{if(confirm(`ยกเลิกการเชื่อม LINE ของเบอร์ ${fmtPhone(r.phone)}? LINE นั้นจะไม่เห็นข้อมูลและไม่ได้รับแจ้งเตือนของเบอร์นี้อีก`))run('lineMemberUnlink',r)}}>ยกเลิกการเชื่อม</button>
    </li>)}</ul></details>}
  </section>;
}

export function MembersPage({jobs,sales,config,products,onSave,onAction}:any){
  const [query,setQuery]=useState(''),[key,setKey]=useState('');
  const posMin=Number(config?.member_pos_min_amount)||0;
  const socksProductName=config?.member_socks_product_id?(products||[]).find((p:any)=>p.id===config.member_socks_product_id)?.name:null;
  const customers=useMemo(()=>buildCustomers(jobs,options(config,sales)),[jobs,sales,config?.member_stamps_required,config?.member_socks_stamps_required,config?.member_pos_min_amount,config?.customer_notes,config?.member_promo_enabled,config?.member_promo_start,config?.member_promo_end]);
  const text=query.trim().toLowerCase(),digits=phoneDigits(query);
  const shown=customers.filter(c=>!text||c.name.toLowerCase().includes(text)||(digits.length>=3&&phoneDigits(c.phone).includes(digits)));
  const selected=customers.find(c=>c.key===key)||shown[0]||null;
  const ready=customers.filter(c=>c.stringAvailable||(socksProductName&&c.socksAvailable)).length;
  const [lineRows,setLineRows]=useState<any[]>([]);
  const [lineReady,setLineReady]=useState(false);
  const reloadLine=async()=>{try{const r=await fetch('/api/line-members',{cache:'no-store'}),d:any=await r.json();setLineReady(r.ok&&!!d.ready);setLineRows(r.ok&&d.ready?d.rows:[])}catch{setLineRows([])}};
  useEffect(()=>{reloadLine()},[]);
  const onLine=useMemo(()=>new Set(lineRows.filter((r:any)=>r.status==='verified').map((r:any)=>r.phone)),[lineRows]);
  return <>{onAction&&lineReady&&<LineMembersPanel rows={lineRows} onAction={onAction} reload={reloadLine}/>}<div className="members-layout">
    <section className="panel members-list">
      <div className="panel-tools"><div className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ค้นหาชื่อหรือเบอร์โทร"/></div></div>
      <div className="members-summary"><span>สมาชิก {customers.length} คน</span>{ready>0&&<span className="badge green">มีสิทธิ์ฟรี {ready} คน</span>}</div>
      {shown.length===0?<div className="empty"><h3>{customers.length?'ไม่พบลูกค้าที่ค้นหา':'ยังไม่มีสมาชิก'}</h3><p>{customers.length?'ลองค้นหาด้วยชื่อหรือเบอร์โทรอื่น':'ลูกค้าจะขึ้นที่นี่อัตโนมัติหลังรับไม้งานแรก หรือเพิ่มสมาชิกตอนคิดเงินที่หน้าร้าน'}</p></div>:
      <ul className="members-rows">{shown.map(c=><li key={c.key}><button type="button" className={'member-row'+(selected?.key===c.key?' is-active':'')} onClick={()=>setKey(c.key)}>
        <div><b>{c.name}{onLine.has(phoneDigits(c.phone))&&<span className="line-chip" title="เชื่อม LINE แล้ว">LINE</span>}</b><small>{c.phone||'ไม่มีเบอร์'} · มาแล้ว {c.visits} ครั้ง</small></div>
        <div className="member-row-side">{c.stringAvailable||(socksProductName&&c.socksAvailable)?<span className="badge green"><Gift size={12}/> มีสิทธิ์ฟรี</span>:<span className="stamp-mini">{c.stars}/{c.stringNeed} ดาว</span>}</div>
      </button></li>)}</ul>}
    </section>
    <section className="panel members-detail">{selected?<Detail customer={selected} posMin={posMin} promo={promoOf(config)} socksProductName={socksProductName} onSave={onSave} setKey={setKey}/>:<div className="empty"><h3>เลือกลูกค้าเพื่อดูรายละเอียด</h3></div>}</section>
  </div></>;
}

// Pick a member while checking out at the POS: the bill is linked to them (and earns a stamp).
export function MemberPicker({jobs,sales,config,value,onChange,total}:any){
  const posMin=Number(config?.member_pos_min_amount)||0,need=Number(config?.member_stamps_required)||10;
  const customers=useMemo(()=>buildCustomers(jobs,options(config,sales)),[jobs,sales,config?.member_stamps_required,config?.member_socks_stamps_required,config?.member_pos_min_amount,config?.customer_notes,config?.member_promo_enabled,config?.member_promo_start,config?.member_promo_end]);
  const [query,setQuery]=useState(''),[adding,setAdding]=useState(false),[newName,setNewName]=useState(''),[newPhone,setNewPhone]=useState('');
  const digits=phoneDigits(newPhone);
  if(value){
    const earns=(Number(total)||0)>=posMin;
    return <div className="member-pill picked"><b>{value.name}</b><span>{value.phone} · สะสม {value.stars}/{value.stringNeed} ดาว{value.stringAvailable?' · มีสิทธิ์ขึ้นเอ็นฟรี':''}</span><span className={'stamp-note'+(earns?'':' none')}>{earns?'บิลนี้ได้ +1 แต้ม':'ยอดไม่ถึง ฿'+(posMin/100).toLocaleString('th-TH')+' จึงไม่ได้แต้ม'}</span><button type="button" className="secondary small" onClick={()=>{onChange(null);setQuery('')}}>เปลี่ยน</button></div>;
  }
  if(adding)return <div className="member-new">
    <input placeholder="ชื่อลูกค้า" maxLength={100} value={newName} onChange={e=>setNewName(e.target.value)}/>
    <input type="tel" inputMode="tel" placeholder="เบอร์โทร" maxLength={30} value={newPhone} onChange={e=>setNewPhone(e.target.value)}/>
    <button type="button" className="secondary small" disabled={!newName.trim()||digits.length<9||digits.length>20} onClick={()=>{const existing=customers.find(c=>c.key===digits);onChange(existing||{key:digits,name:newName.trim(),phone:newPhone.trim(),stars:0,stringNeed:need,stringAvailable:false,stamps:0,isNew:true});setAdding(false)}}>เพิ่ม</button>
    <button type="button" className="secondary small" onClick={()=>setAdding(false)}>ยกเลิก</button>
  </div>;
  return <div className="member-search"><CustomerInput value={query} onChange={setQuery} onPick={onChange} suggestions={matchCustomers(customers,query,'name')} placeholder="พิมพ์ชื่อหรือเบอร์สมาชิก (ไม่บังคับ)"/><button type="button" className="link-button" onClick={()=>{setAdding(true);setNewName(/\d/.test(query)?'':query);setNewPhone(/\d/.test(query)?query:'')}}>+ เพิ่มสมาชิกใหม่</button></div>;
}
