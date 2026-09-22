'use client';
import {useMemo,useState} from 'react';
import {Gift,Pencil,Phone,Search} from 'lucide-react';
import {billEarnsStamp,buildCustomers,matchCustomers,phoneDigits,type Customer} from '@/lib/customers';
import {CustomerInput} from './job-form';

const baht=(satang:number)=>'฿'+(satang/100).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const day=(iso:string)=>iso?new Date(iso).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit',timeZone:'Asia/Bangkok'}):'—';
const options=(config:any,sales:any[])=>({stampsRequired:config?.member_stamps_required,sales,posMinAmount:Number(config?.member_pos_min_amount)||0,notes:config?.customer_notes,manualMembers:config?.manual_members});

// The customer's stamp card: one circle per stamp needed for the next free stringing.
export function StampCard({customer}:{customer:Customer}){
  const circles=customer.need<=20?Array.from({length:customer.need},(_,i)=>i):[];
  return <div className="stamp-card stamp-card-panel">
    <div className="stamp-head"><b>บัตรสะสมแต้ม</b><span>{customer.progress}/{customer.need} ครั้ง · ครบแล้ว {customer.earned} รอบ</span></div>
    {circles.length>0?<div className="stamp-dots">{circles.map(i=><span key={i} className={i<customer.progress?'is-filled':''}>{i<customer.progress?'✓':i+1}</span>)}</div>:<div className="stamp-bar"><i style={{width:(customer.progress/customer.need*100)+'%'}}/></div>}
    <div className="stamp-sources">แต้มทั้งหมด {customer.stamps} · จากขึ้นเอ็น {customer.jobStamps} · จากซื้อหน้าร้าน {customer.posStamps}</div>
    <div className={'stamp-reward'+(customer.available>0?' is-ready':'')}><Gift size={18}/><span>{customer.available>0?<><b>ใช้สิทธิ์ขึ้นเอ็นฟรีได้ {customer.available} ครั้ง</b> · เลือกตอนรับไม้ใหม่</>:<>ใช้สิทธิ์แล้ว {customer.used} ครั้ง · สะสมอีก {customer.need-customer.progress} ครั้งได้สิทธิ์ถัดไป</>}</span></div>
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

function Detail({customer,posMin,onSave,setKey}:any){
  const [editing,setEditing]=useState(false);
  return <div className="member-detail">
    <div className="member-title"><div><h2>{customer.name}</h2>{customer.phone&&<a className="contact-link" href={'tel:'+customer.phone.replace(/[^0-9+]/g,'')}><Phone size={16}/>{customer.phone}</a>}</div>
      <div className="member-figures"><div><span>มาแล้ว</span><b>{customer.visits} ครั้ง</b></div><div><span>ใช้จ่ายรวม</span><b>{baht(customer.spent)}</b></div><div><span>ล่าสุด</span><b>{day(customer.last)}</b></div></div></div>
    {editing?<EditForm key={customer.key} customer={customer} onSave={onSave} onDone={(newKey?:string)=>{setEditing(false);if(newKey)setKey(newKey)}}/>:<>
      <div className="member-note-row">{customer.note?<div className="member-note"><b>บันทึก</b><p>{customer.note}</p></div>:<span className="muted">ยังไม่มีบันทึกเกี่ยวกับลูกค้า</span>}<button type="button" className="secondary small" onClick={()=>setEditing(true)}><Pencil size={14}/> แก้ไขข้อมูล</button></div>
    </>}
    <StampCard customer={customer}/>
    {customer.rackets.length>0&&<div className="member-block"><h3>ไม้ที่เคยขึ้นเอ็น</h3><div className="racket-chips">{customer.rackets.map((r:any)=><span className="chip" key={r.name}>{r.name}{r.tension?' · '+r.tension:''}</span>)}</div></div>}
    {customer.jobs.length>0&&<div className="member-block"><h3>ประวัติขึ้นเอ็น</h3>
      <div className="table-scroll"><table className="member-table"><thead><tr><th>วันที่</th><th>ไม้</th><th>สถานะ</th><th>ยอด</th></tr></thead><tbody>
        {customer.jobs.map((j:any)=><tr key={j.id}><td>{day(j.created)}</td><td>{j.racket}{j.reward_used===1&&<span className="badge green"> ใช้สิทธิ์ฟรี</span>}</td><td>{j.status}</td><td>{j.paid?(j.amount===0?'ฟรี':baht(j.amount)):'รอชำระ'}</td></tr>)}
      </tbody></table></div></div>}
    {customer.sales.length>0&&<div className="member-block"><h3>ซื้อที่หน้าร้าน (POS)</h3>
      <div className="table-scroll"><table className="member-table"><thead><tr><th>วันที่</th><th>ชำระโดย</th><th>ยอด</th><th>แต้ม</th></tr></thead><tbody>
        {customer.sales.map((s:any)=><tr key={s.id}><td>{day(s.created)}</td><td>{s.method}</td><td>{baht(s.total)}</td><td>{billEarnsStamp(s,posMin)?'+1':'—'}</td></tr>)}
      </tbody></table></div></div>}
  </div>;
}

export function MembersPage({jobs,sales,config,onSave}:any){
  const [query,setQuery]=useState(''),[key,setKey]=useState('');
  const posMin=Number(config?.member_pos_min_amount)||0;
  const customers=useMemo(()=>buildCustomers(jobs,options(config,sales)),[jobs,sales,config?.member_stamps_required,config?.member_pos_min_amount,config?.customer_notes]);
  const text=query.trim().toLowerCase(),digits=phoneDigits(query);
  const shown=customers.filter(c=>!text||c.name.toLowerCase().includes(text)||(digits.length>=3&&phoneDigits(c.phone).includes(digits)));
  const selected=customers.find(c=>c.key===key)||shown[0]||null;
  const ready=customers.filter(c=>c.available>0).length;
  return <div className="members-layout">
    <section className="panel members-list">
      <div className="panel-tools"><div className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ค้นหาชื่อหรือเบอร์โทร"/></div></div>
      <div className="members-summary"><span>สมาชิก {customers.length} คน</span>{ready>0&&<span className="badge green">มีสิทธิ์ฟรี {ready} คน</span>}</div>
      {shown.length===0?<div className="empty"><h3>{customers.length?'ไม่พบลูกค้าที่ค้นหา':'ยังไม่มีสมาชิก'}</h3><p>{customers.length?'ลองค้นหาด้วยชื่อหรือเบอร์โทรอื่น':'ลูกค้าจะขึ้นที่นี่อัตโนมัติหลังรับไม้งานแรก หรือเพิ่มสมาชิกตอนคิดเงินที่หน้าร้าน'}</p></div>:
      <ul className="members-rows">{shown.map(c=><li key={c.key}><button type="button" className={'member-row'+(selected?.key===c.key?' is-active':'')} onClick={()=>setKey(c.key)}>
        <div><b>{c.name}</b><small>{c.phone||'ไม่มีเบอร์'} · มาแล้ว {c.visits} ครั้ง</small></div>
        <div className="member-row-side">{c.available>0?<span className="badge green"><Gift size={12}/> ฟรี {c.available}</span>:<span className="stamp-mini">{c.progress}/{c.need}</span>}</div>
      </button></li>)}</ul>}
    </section>
    <section className="panel members-detail">{selected?<Detail customer={selected} posMin={posMin} onSave={onSave} setKey={setKey}/>:<div className="empty"><h3>เลือกลูกค้าเพื่อดูรายละเอียด</h3></div>}</section>
  </div>;
}

// Pick a member while checking out at the POS: the bill is linked to them (and earns a stamp).
export function MemberPicker({jobs,sales,config,value,onChange,total}:any){
  const posMin=Number(config?.member_pos_min_amount)||0,need=Number(config?.member_stamps_required)||10;
  const customers=useMemo(()=>buildCustomers(jobs,options(config,sales)),[jobs,sales,config?.member_stamps_required,config?.member_pos_min_amount,config?.customer_notes]);
  const [query,setQuery]=useState(''),[adding,setAdding]=useState(false),[newName,setNewName]=useState(''),[newPhone,setNewPhone]=useState('');
  const digits=phoneDigits(newPhone);
  if(value){
    const earns=(Number(total)||0)>=posMin;
    return <div className="member-pill picked"><b>{value.name}</b><span>{value.phone} · สะสม {value.progress}/{value.need}{value.available>0?' · มีสิทธิ์ขึ้นเอ็นฟรี '+value.available+' ครั้ง':''}</span><span className={'stamp-note'+(earns?'':' none')}>{earns?'บิลนี้ได้ +1 แต้ม':'ยอดไม่ถึง ฿'+(posMin/100).toLocaleString('th-TH')+' จึงไม่ได้แต้ม'}</span><button type="button" className="secondary small" onClick={()=>{onChange(null);setQuery('')}}>เปลี่ยน</button></div>;
  }
  if(adding)return <div className="member-new">
    <input placeholder="ชื่อลูกค้า" maxLength={100} value={newName} onChange={e=>setNewName(e.target.value)}/>
    <input type="tel" inputMode="tel" placeholder="เบอร์โทร" maxLength={30} value={newPhone} onChange={e=>setNewPhone(e.target.value)}/>
    <button type="button" className="secondary small" disabled={!newName.trim()||digits.length<9||digits.length>20} onClick={()=>{const existing=customers.find(c=>c.key===digits);onChange(existing||{key:digits,name:newName.trim(),phone:newPhone.trim(),progress:0,need,available:0,stamps:0,isNew:true});setAdding(false)}}>เพิ่ม</button>
    <button type="button" className="secondary small" onClick={()=>setAdding(false)}>ยกเลิก</button>
  </div>;
  return <div className="member-search"><CustomerInput value={query} onChange={setQuery} onPick={onChange} suggestions={matchCustomers(customers,query,'name')} placeholder="พิมพ์ชื่อหรือเบอร์สมาชิก (ไม่บังคับ)"/><button type="button" className="link-button" onClick={()=>{setAdding(true);setNewName(/\d/.test(query)?'':query);setNewPhone(/\d/.test(query)?query:'')}}>+ เพิ่มสมาชิกใหม่</button></div>;
}
