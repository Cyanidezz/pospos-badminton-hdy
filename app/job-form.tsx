'use client';
import {useEffect,useMemo,useState} from 'react';
import {Gift,ImagePlus,ScanBarcode,UserCheck} from 'lucide-react';
import {buildCustomers,knownRackets,matchCustomers,phoneDigits,rewardDiscount,type Customer} from '@/lib/customers';

// A text box that suggests returning customers while staff type.
export function CustomerInput({value,onChange,onPick,suggestions,...input}:any){
  const [open,setOpen]=useState(false);
  return <div className="suggest-wrap">
    <input {...input} value={value} autoComplete="off" onChange={e=>{onChange(e.target.value);setOpen(true)}} onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),150)}/>
    {open&&suggestions.length>0&&<ul className="suggest-list">{suggestions.map((c:Customer)=><li key={c.key}><button type="button" onClick={()=>{onPick(c);setOpen(false)}}><b>{c.name}</b><span>{c.phone||'ไม่มีเบอร์'} · มาแล้ว {c.visits} ครั้ง{c.rackets[0]?' · '+c.rackets[0].name:''}</span></button></li>)}</ul>}
  </div>;
}

const thaiDate=(iso:string)=>iso?new Date(iso).toLocaleDateString('th-TH',{day:'numeric',month:'short',timeZone:'Asia/Bangkok'}):'';

// The datetime-local input's own min: staff can't pick a pickup time in the past. No timezone math needed - the
// picker already shows/returns the device's local wall-clock time, same as what gets stored and displayed later.
const nowLocal=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};

// The เอ็น field: type to search a string by name, or (since a hardware scanner is just a keyboard) type/scan its
// barcode and press Enter to pick it directly - the same barcode either matches here or via the camera-scan button.
function StringInput({value,onChange,products}:{value:string;onChange:(id:string)=>void;products:any[]}){
  const strings=useMemo(()=>products.filter((p:any)=>p.category==='เอ็นแบดมินตัน'),[products]);
  const selected=strings.find((p:any)=>p.id===value);
  const [query,setQuery]=useState(selected?.name||'');
  const [open,setOpen]=useState(false);
  useEffect(()=>{setQuery(selected?.name||'')},[value]);
  const text=query.trim().toLowerCase();
  const matches=text?strings.filter((p:any)=>p.name.toLowerCase().includes(text)||(p.barcode||'').includes(text)||(p.scan_code||'').includes(text)).slice(0,8):[];
  const pick=(p:any)=>{onChange(p.id);setQuery(p.name);setOpen(false)};
  return <div className="suggest-wrap">
    <input required value={query} autoComplete="off" placeholder="พิมพ์ชื่อเอ็น หรือยิงบาร์โค้ด" onChange={e=>{setQuery(e.target.value);setOpen(true)}} onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),150)}
      onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();const code=query.trim(),byCode=strings.find((p:any)=>p.barcode===code||p.scan_code===code);if(byCode)pick(byCode);else if(matches.length===1)pick(matches[0])}}}/>
    {open&&matches.length>0&&<ul className="suggest-list">{matches.map((p:any)=><li key={p.id}><button type="button" onClick={()=>pick(p)}><b>{p.name}</b><span>฿{(p.price/100).toLocaleString('th-TH')}{p.barcode?' · '+p.barcode:''}</span></button></li>)}</ul>}
  </div>;
}

// The compact "รับไม้ลูกค้า" form body. Field and Choice come from the POS screen so the look stays in one place.
export function JobFormFields({form,setForm,products,members,jobs,sales,config,upload,onScanString,Field,Choice}:any){
  const customers=useMemo(()=>buildCustomers(jobs,{stampsRequired:config?.member_stamps_required,sales:sales||[],posMinAmount:Number(config?.member_pos_min_amount)||0,notes:config?.customer_notes}),[jobs,sales,config?.member_stamps_required,config?.member_pos_min_amount,config?.customer_notes]),rackets=useMemo(()=>knownRackets(jobs),[jobs]);
  const member:Customer|undefined=form.member,photos=(form.photos||[]).length;
  const pick=(c:Customer)=>setForm((f:any)=>({...f,member:c,useReward:false,customer:c.name,phone:c.phone||f.phone,racket:f.racket||c.rackets[0]?.name||'',tension:f.tension||(f.racket?'':c.rackets[0]?.tension)||''}));
  const pickRacket=(r:{name:string;tension:string})=>setForm((f:any)=>({...f,racket:r.name,tension:r.tension||f.tension}));
  const setPhone=(phone:string)=>setForm((f:any)=>({...f,phone,member:f.member&&phoneDigits(phone)!==phoneDigits(f.member.phone)?undefined:f.member,useReward:f.member&&phoneDigits(phone)!==phoneDigits(f.member.phone)?false:f.useReward}));
  const req=<i className="req" aria-hidden="true">*</i>;
  return <div className="job-form">
    <section className="job-section" aria-label="ลูกค้า"><h4>ลูกค้า</h4>
      <div className="job-fields">
        <Field className="f-wide" label={<>ชื่อลูกค้า{req}</>}><CustomerInput required value={form.customer||''} onChange={(customer:string)=>setForm((f:any)=>({...f,customer}))} onPick={pick} suggestions={matchCustomers(customers,form.customer||'','name')} placeholder="พิมพ์ชื่อหรือเบอร์เพื่อค้นหาลูกค้าเดิม"/></Field>
        <Field className="f-narrow" label={<>เบอร์โทร{req}</>}><CustomerInput required type="tel" inputMode="tel" value={form.phone||''} onChange={setPhone} onPick={pick} suggestions={matchCustomers(customers,form.phone||'','phone')}/></Field>
        {member&&<div className="member-pill f-full"><UserCheck size={16}/><b>ลูกค้าเดิม</b><span>มาแล้ว {member.visits} ครั้ง · สะสม {member.progress}/{member.need} · ล่าสุด {thaiDate(member.last)}</span>{member.note&&<span className="member-note-inline">📝 {member.note}</span>}</div>}
        {member&&member.available>0&&<label className={'reward-box f-full'+(form.useReward?' is-on':'')}><input type="checkbox" checked={!!form.useReward} onChange={e=>setForm({...form,useReward:e.target.checked})}/><Gift size={18}/><span><b>มีสิทธิ์ขึ้นเอ็นฟรี {member.available} ครั้ง</b> <small>{form.useReward?`ใช้สิทธิ์ครั้งนี้ · ลด ฿${(rewardDiscount(Math.round(Number(form.amount||0)*100),config?.member_reward_cap)/100).toLocaleString('th-TH')}`:'ติ๊กเพื่อใช้สิทธิ์กับงานนี้'}</small></span></label>}
      </div>
    </section>
    <section className="job-section" aria-label="ไม้และเอ็น"><h4>ไม้และเอ็น</h4>
      <div className="job-fields">
        <Field className="f-wide" label={<>ยี่ห้อ / รุ่นไม้{req}</>}>
          <input required list="known-rackets" value={form.racket||''} onChange={e=>setForm({...form,racket:e.target.value})}/>
          <datalist id="known-rackets">{rackets.map(r=><option key={r} value={r}/>)}</datalist>
          {member&&member.rackets.length>0&&<div className="racket-chips">{member.rackets.slice(0,4).map(r=><button type="button" className={'secondary'+(r.name===form.racket?' is-active':'')} key={r.name} onClick={()=>pickRacket(r)}>{r.name}</button>)}</div>}
        </Field>
        <Field className="f-narrow" label={<>ความตึง{req}</>}><input required placeholder="เช่น 25 lbs" value={form.tension||''} onChange={e=>setForm({...form,tension:e.target.value})}/></Field>
        <Field className="f-wide" label={<>เอ็น{req}</>}><div className="with-scan"><StringInput value={form.productId} onChange={(v:string)=>setForm({...form,productId:v,amount:(products.find((p:any)=>p.id===v)?.price||0)/100})} products={products}/><button type="button" className="secondary scan-string" aria-label="สแกนบาร์โค้ดเอ็น" title="สแกนบาร์โค้ดเอ็น" onClick={onScanString}><ScanBarcode size={20}/></button></div></Field>
        <Field className="f-narrow" label={<>ยอดชำระรวม (บาท){req}</>}><input required type="number" min="0" step="0.01" inputMode="decimal" value={form.amount??''} onChange={e=>setForm({...form,amount:e.target.value})}/></Field>
      </div>
    </section>
    <section className="job-section optional" aria-label="เพิ่มเติม"><h4>เพิ่มเติม <small>ไม่บังคับ</small></h4>
      <div className="job-fields">
        <Field className="f-s3" label="พนักงานขึ้นเอ็น"><Choice value={form.stringerId} onChange={(v:string)=>setForm({...form,stringerId:v})} options={members.filter((m:any)=>m.active)}/></Field>
        <div className="field attach f-s2"><span>รูปสภาพไม้</span>
          <label className={'attach-button secondary'+(photos?' has-photos':'')} title="สูงสุด 8 รูป รูปละ 8 MB"><ImagePlus size={18}/>{photos?`แนบแล้ว ${photos} รูป`:'แนบรูป'}<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>{upload(e.target.files,'photos');e.target.value=''}}/></label>
        </div>
        <Field className="f-s4" label="สภาพไม้ / จุดตำหนิ (ถ้ามี)"><textarea rows={1} placeholder="เช่น สีถลอกที่ขอบ" value={form.condition||''} onChange={e=>setForm({...form,condition:e.target.value})}/></Field>
        <Field className="f-s3" label="วันเวลาที่นัดรับ (ถ้าทราบ)"><input type="datetime-local" min={nowLocal()} value={form.pickupAt||''} onChange={e=>setForm({...form,pickupAt:e.target.value})}/></Field>
      </div>
    </section>
  </div>;
}
