'use client';
import {useMemo,useState} from 'react';
import {ImagePlus,UserCheck} from 'lucide-react';
import {buildCustomers,knownRackets,matchCustomers,phoneDigits,type Customer} from '@/lib/customers';

// A text box that suggests returning customers while staff type.
function CustomerInput({value,onChange,onPick,suggestions,...input}:any){
  const [open,setOpen]=useState(false);
  return <div className="suggest-wrap">
    <input {...input} value={value} autoComplete="off" onChange={e=>{onChange(e.target.value);setOpen(true)}} onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),150)}/>
    {open&&suggestions.length>0&&<ul className="suggest-list">{suggestions.map((c:Customer)=><li key={c.key}><button type="button" onClick={()=>{onPick(c);setOpen(false)}}><b>{c.name}</b><span>{c.phone||'ไม่มีเบอร์'} · มาแล้ว {c.visits} ครั้ง{c.rackets[0]?' · '+c.rackets[0].name:''}</span></button></li>)}</ul>}
  </div>;
}

const thaiDate=(iso:string)=>iso?new Date(iso).toLocaleDateString('th-TH',{day:'numeric',month:'short',timeZone:'Asia/Bangkok'}):'';

// The compact "รับไม้ลูกค้า" form body. Field and Choice come from the POS screen so the look stays in one place.
export function JobFormFields({form,setForm,products,members,jobs,upload,Field,Choice}:any){
  const customers=useMemo(()=>buildCustomers(jobs),[jobs]),rackets=useMemo(()=>knownRackets(jobs),[jobs]);
  const member:Customer|undefined=form.member,photos=(form.photos||[]).length;
  const pick=(c:Customer)=>setForm((f:any)=>({...f,member:c,customer:c.name,phone:c.phone||f.phone,racket:f.racket||c.rackets[0]?.name||'',tension:f.tension||(f.racket?'':c.rackets[0]?.tension)||''}));
  const pickRacket=(r:{name:string;tension:string})=>setForm((f:any)=>({...f,racket:r.name,tension:r.tension||f.tension}));
  const setPhone=(phone:string)=>setForm((f:any)=>({...f,phone,member:f.member&&phoneDigits(phone)!==phoneDigits(f.member.phone)?undefined:f.member}));
  return <div className="job-form">
    {member&&<div className="member-pill"><UserCheck size={16}/><b>ลูกค้าเดิม</b><span>มาแล้ว {member.visits} ครั้ง · ล่าสุด {thaiDate(member.last)}</span></div>}
    <Field label="ชื่อลูกค้า"><CustomerInput required value={form.customer||''} onChange={(customer:string)=>setForm((f:any)=>({...f,customer}))} onPick={pick} suggestions={matchCustomers(customers,form.customer||'','name')} placeholder="พิมพ์ชื่อหรือเบอร์เพื่อค้นหาลูกค้าเดิม"/></Field>
    <Field label="เบอร์โทร"><CustomerInput required type="tel" inputMode="tel" value={form.phone||''} onChange={setPhone} onPick={pick} suggestions={matchCustomers(customers,form.phone||'','phone')}/></Field>
    <Field label="ยี่ห้อ / รุ่นไม้" className="wide">
      <input required list="known-rackets" value={form.racket||''} onChange={e=>setForm({...form,racket:e.target.value})}/>
      <datalist id="known-rackets">{rackets.map(r=><option key={r} value={r}/>)}</datalist>
      {member&&member.rackets.length>0&&<div className="racket-chips">{member.rackets.slice(0,4).map(r=><button type="button" className={'secondary'+(r.name===form.racket?' is-active':'')} key={r.name} onClick={()=>pickRacket(r)}>{r.name}</button>)}</div>}
    </Field>
    <Field label="ความตึง (เช่น 25 lbs)"><input required value={form.tension||''} onChange={e=>setForm({...form,tension:e.target.value})}/></Field>
    <Field label="เอ็น" className="wide"><Choice value={form.productId} onChange={(v:string)=>setForm({...form,productId:v,amount:(products.find((p:any)=>p.id===v)?.price||0)/100})} options={products.filter((p:any)=>p.category==='เอ็นแบดมินตัน')}/></Field>
    <Field label="ยอดชำระรวม (บาท)"><input required type="number" min="0" step="0.01" value={form.amount??''} onChange={e=>setForm({...form,amount:e.target.value})}/></Field>
    <Field label="พนักงานขึ้นเอ็น"><Choice value={form.stringerId} onChange={(v:string)=>setForm({...form,stringerId:v})} options={members.filter((m:any)=>m.active)}/></Field>
    <div className="field attach">
      <span>รูปสภาพไม้ <small>(สูงสุด 8 รูป · รูปละ 8 MB)</small></span>
      <label className={'attach-button secondary'+(photos?' has-photos':'')}><ImagePlus size={18}/>{photos?`แนบแล้ว ${photos} รูป`:'แนบรูป'}<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>{upload(e.target.files,'photos');e.target.value=''}}/></label>
    </div>
    <Field label="สภาพไม้ / จุดตำหนิ (ถ้ามี)" className="wide"><textarea rows={1} value={form.condition||''} onChange={e=>setForm({...form,condition:e.target.value})}/></Field>
    <Field label="หมายเหตุ" className="wide"><textarea rows={1} value={form.note||''} onChange={e=>setForm({...form,note:e.target.value})}/></Field>
    <p className="muted job-hint">บันทึกแล้วเอ็นจะถูกจอง จากนั้นเลือกรับชำระเงินทันที หรือชำระภายหลังได้</p>
  </div>;
}
