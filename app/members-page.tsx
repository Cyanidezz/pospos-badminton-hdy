'use client';
import {useMemo,useState} from 'react';
import {Gift,Phone,Search} from 'lucide-react';
import {buildCustomers,phoneDigits,type Customer} from '@/lib/customers';
import {CustomerInput} from './job-form';
import {matchCustomers} from '@/lib/customers';

const baht=(satang:number)=>'฿'+(satang/100).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const day=(iso:string)=>iso?new Date(iso).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit',timeZone:'Asia/Bangkok'}):'—';

// The customer's stamp card: one circle per stamp needed for the next free stringing.
export function StampCard({customer}:{customer:Customer}){
  const circles=customer.need<=20?Array.from({length:customer.need},(_,i)=>i):[];
  return <div className="stamp-card">
    <div className="stamp-head"><b>บัตรสะสมแต้ม</b><span>{customer.progress}/{customer.need} ครั้ง · ครบแล้ว {customer.earned} รอบ</span></div>
    {circles.length>0?<div className="stamp-dots">{circles.map(i=><span key={i} className={i<customer.progress?'is-filled':''}>{i<customer.progress?'✓':i+1}</span>)}</div>:<div className="stamp-bar"><i style={{width:(customer.progress/customer.need*100)+'%'}}/></div>}
    <div className={'stamp-reward'+(customer.available>0?' is-ready':'')}><Gift size={18}/><span>{customer.available>0?<><b>ใช้สิทธิ์ขึ้นเอ็นฟรีได้ {customer.available} ครั้ง</b> · เลือกตอนรับไม้ใหม่</>:<>ใช้สิทธิ์แล้ว {customer.used} ครั้ง · ขึ้นเอ็นอีก {customer.need-customer.progress} ครั้งได้สิทธิ์ถัดไป</>}</span></div>
  </div>;
}

function Detail({customer}:{customer:Customer}){
  return <div className="member-detail">
    <div className="member-title"><div><h2>{customer.name}</h2>{customer.phone&&<a className="contact-link" href={'tel:'+customer.phone.replace(/[^0-9+]/g,'')}><Phone size={16}/>{customer.phone}</a>}</div>
      <div className="member-figures"><div><span>มาแล้ว</span><b>{customer.visits} ครั้ง</b></div><div><span>ใช้จ่ายรวม</span><b>{baht(customer.spent)}</b></div><div><span>ล่าสุด</span><b>{day(customer.last)}</b></div></div></div>
    <StampCard customer={customer}/>
    {customer.rackets.length>0&&<div className="member-block"><h3>ไม้ที่เคยขึ้นเอ็น</h3><div className="racket-chips">{customer.rackets.map(r=><span className="chip" key={r.name}>{r.name}{r.tension?' · '+r.tension:''}</span>)}</div></div>}
    <div className="member-block"><h3>ประวัติขึ้นเอ็น</h3>
      <div className="table-scroll"><table className="member-table"><thead><tr><th>วันที่</th><th>ไม้</th><th>สถานะ</th><th>ยอด</th></tr></thead><tbody>
        {customer.jobs.map((j:any)=><tr key={j.id}><td>{day(j.created)}</td><td>{j.racket}{j.reward_used===1&&<span className="badge green"> ใช้สิทธิ์ฟรี</span>}</td><td>{j.status}</td><td>{j.paid?(j.amount===0?'ฟรี':baht(j.amount)):'รอชำระ'}</td></tr>)}
      </tbody></table></div></div>
    {customer.sales.length>0&&<div className="member-block"><h3>ซื้อที่หน้าร้าน (POS)</h3>
      <div className="table-scroll"><table className="member-table"><thead><tr><th>วันที่</th><th>ชำระโดย</th><th>ยอด</th></tr></thead><tbody>
        {customer.sales.map((s:any)=><tr key={s.id}><td>{day(s.created)}</td><td>{s.method}</td><td>{baht(s.total)}</td></tr>)}
      </tbody></table></div></div>}
  </div>;
}

export function MembersPage({jobs,sales,config}:any){
  const [query,setQuery]=useState(''),[key,setKey]=useState('');
  const customers=useMemo(()=>buildCustomers(jobs,{stampsRequired:config?.member_stamps_required,sales}),[jobs,sales,config?.member_stamps_required]);
  const text=query.trim().toLowerCase(),digits=phoneDigits(query);
  const shown=customers.filter(c=>!text||c.name.toLowerCase().includes(text)||(digits.length>=3&&phoneDigits(c.phone).includes(digits)));
  const selected=customers.find(c=>c.key===key)||shown[0]||null;
  const ready=customers.filter(c=>c.available>0).length;
  return <div className="members-layout">
    <section className="panel members-list">
      <div className="panel-tools"><div className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ค้นหาชื่อหรือเบอร์โทร"/></div></div>
      <div className="members-summary"><span>สมาชิก {customers.length} คน</span>{ready>0&&<span className="badge green">มีสิทธิ์ฟรี {ready} คน</span>}</div>
      {shown.length===0?<div className="empty"><h3>{customers.length?'ไม่พบลูกค้าที่ค้นหา':'ยังไม่มีสมาชิก'}</h3><p>{customers.length?'ลองค้นหาด้วยชื่อหรือเบอร์โทรอื่น':'ลูกค้าจะขึ้นที่นี่อัตโนมัติหลังรับไม้งานแรก'}</p></div>:
      <ul className="members-rows">{shown.map(c=><li key={c.key}><button type="button" className={'member-row'+(selected?.key===c.key?' is-active':'')} onClick={()=>setKey(c.key)}>
        <div><b>{c.name}</b><small>{c.phone||'ไม่มีเบอร์'} · มาแล้ว {c.visits} ครั้ง</small></div>
        <div className="member-row-side">{c.available>0?<span className="badge green"><Gift size={12}/> ฟรี {c.available}</span>:<span className="stamp-mini">{c.progress}/{c.need}</span>}</div>
      </button></li>)}</ul>}
    </section>
    <section className="panel members-detail">{selected?<Detail customer={selected}/>:<div className="empty"><h3>เลือกลูกค้าเพื่อดูรายละเอียด</h3></div>}</section>
  </div>;
}

// Pick a member while checking out at the POS: the bill is linked to them for purchase history.
export function MemberPicker({jobs,sales,config,value,onChange}:any){
  const customers=useMemo(()=>buildCustomers(jobs,{stampsRequired:config?.member_stamps_required,sales}),[jobs,sales,config?.member_stamps_required]);
  const [query,setQuery]=useState('');
  if(value)return <div className="member-pill picked"><b>{value.name}</b><span>{value.phone} · สะสม {value.progress}/{value.need}{value.available>0?' · มีสิทธิ์ขึ้นเอ็นฟรี '+value.available+' ครั้ง':''}</span><button type="button" className="secondary small" onClick={()=>{onChange(null);setQuery('')}}>เปลี่ยน</button></div>;
  return <CustomerInput value={query} onChange={setQuery} onPick={onChange} suggestions={matchCustomers(customers,query,'name')} placeholder="พิมพ์ชื่อหรือเบอร์สมาชิก (ไม่บังคับ)"/>;
}
