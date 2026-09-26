'use client';
import {useEffect,useState} from 'react';

// สมาชิก Wingpro - opened from the "บัตรสมาชิก" button in the shop's LINE chat. The link carries a signed token
// naming the customer's LINE account (see lib/line-member.ts); everything here goes through /api/line/member.
// Sign up (name + phone), see each linked phone's stamp card and stringing jobs, add another phone.

const baht=(satang:number)=>(satang/100).toLocaleString('th-TH',{maximumFractionDigits:0});
const day=(iso:string)=>new Date(iso).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit',timeZone:'Asia/Bangkok'});
const thaiDay=(date:string)=>new Date(date+'T12:00:00').toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit',timeZone:'Asia/Bangkok'});
const formatPhone=(d:string)=>d.length===10?`${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`:d;
const promoText=(p:any)=>!p?.phase?'':p.phase==='off'?'ปิดรับสะสมแต้มชั่วคราว':p.phase==='before'?`เริ่มสะสมแต้ม ${thaiDay(p.start)}${p.end?` – ${thaiDay(p.end)}`:''}`:p.phase==='after'?`โปรโมชั่นสะสมแต้มสิ้นสุดแล้ว (${thaiDay(p.end)})`:p.end?`สะสมแต้มได้ถึง ${thaiDay(p.end)}`:'';

function Stamps({member}:{member:any}){
  const need=Math.max(1,member.stringNeed||10),stars=Math.max(0,member.stars||0);
  const socksAt=member.socksProductName?member.socksNeed:0;
  const cap=member.rewardCap==null?'ฟรีค่าขึ้นเอ็นทั้งหมด':`เอ็นมูลค่าไม่เกิน ฿${baht(member.rewardCap)}`;
  return <div className="lm-stamps">
    <div className="lm-stars"><b>{stars}</b><span>/ {need} ดาว</span></div>
    {need<=20&&<div className="lm-dots">{Array.from({length:need},(_,i)=><i key={i} className={(i<stars?'is-on ':'')+(i+1===socksAt||i+1===need?'is-goal':'')}>{i<stars?'★':i+1===need?'🎁':i+1===socksAt?'🧦':''}</i>)}</div>}
    {member.socksProductName&&<p className={member.socksAvailable?'is-ready':''}>{member.socksAvailable?`🧦 แลก${member.socksProductName}ฟรีได้แล้ว!`:`🧦 อีก ${Math.max(0,member.socksNeed-stars)} ดาว แลก${member.socksProductName}ฟรี`}</p>}
    <p className={member.stringAvailable?'is-ready':''}>{member.stringAvailable?`🎁 ขึ้นเอ็นฟรีได้แล้ว! (${cap})`:`🎁 อีก ${Math.max(0,need-stars)} ดาว ขึ้นเอ็นฟรี (${cap})`}</p>
    {(member.stringAvailable||member.socksAvailable)&&<small>แลกได้ที่หน้าติดตามสถานะไม้ หรือแจ้งพนักงานที่ร้าน</small>}
    {promoText(member.promo)&&<small className="lm-promo">{promoText(member.promo)}</small>}
  </div>;
}

function RegisterForm({token,initialPhone='',initialName='',suggestedPhone='',needsJob=false,onDone,onCancel}:any){
  const [name,setName]=useState(initialName),[phone,setPhone]=useState(initialPhone||suggestedPhone),[jobNumber,setJobNumber]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const submit=async(e:any)=>{
    e.preventDefault();setBusy(true);setError('');
    try{
      const r=await fetch('/api/line/member',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({t:token,name,phone,jobNumber})});
      const d=await r.json();if(!r.ok)throw new Error(d.error);
      onDone(d);
    }catch(err:any){setError(err.message)}finally{setBusy(false)}
  };
  return <form className="lm-form" onSubmit={submit}>
    <label><span>ชื่อ</span><input required maxLength={100} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} placeholder="ชื่อ-นามสกุล หรือชื่อเล่น"/></label>
    <label><span>เบอร์โทร</span><input required type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="0812345678" readOnly={!!initialPhone}/></label>
    <label><span>เลขรับไม้ {needsJob?'':'(ถ้าเคยขึ้นเอ็นที่ร้าน)'}</span><input value={jobNumber} onChange={e=>setJobNumber(e.target.value)} placeholder="เช่น 502E4A3F" autoCapitalize="characters"/>
      <small>ดูได้จากใบรับไม้หรือข้อความแจ้งสถานะใน LINE (#XXXXXXXX) ใส่แล้วยืนยันได้ทันที ถ้าไม่มี ร้านจะตรวจสอบและยืนยันให้</small></label>
    {error&&<p className="lm-error">{error}</p>}
    <div className="lm-actions">{onCancel&&<button type="button" className="lm-secondary" onClick={onCancel}>ยกเลิก</button>}<button disabled={busy}>{busy?'กำลังบันทึก…':needsJob?'ยืนยันด้วยเลขรับไม้':'สมัครสมาชิก'}</button></div>
  </form>;
}

export default function LineMemberPage(){
  const [token,setToken]=useState(''),[prefill,setPrefill]=useState(''),[view,setView]=useState<any>(null),[error,setError]=useState(''),[adding,setAdding]=useState(false),[verifying,setVerifying]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search),t=params.get('t')||'';setToken(t);
    // ?phone= comes from "สมัครสมาชิกด้วยเบอร์นี้" in the chat: the number the customer just looked up.
    const phone=(params.get('phone')||'').replace(/\D/g,'');if(/^0\d{8,9}$/.test(phone)){setPrefill(phone);setAdding(true)}
    fetch('/api/line/member?t='+encodeURIComponent(t),{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setView(d)}).catch(e=>setError(e.message));
  },[]);
  const done=(d:any)=>{setView(d.view);setAdding(false);setPrefill('');setVerifying('');setNotice(d.status==='verified'?`เชื่อมเบอร์ ${formatPhone(d.phone)} กับ LINE นี้แล้ว`:`ส่งคำขอแล้ว ร้านจะตรวจสอบและยืนยันเบอร์ ${formatPhone(d.phone)} ให้เร็วที่สุด`);window.scrollTo({top:0,behavior:'smooth'})};
  if(error)return <main className="lm-page"><div className="lm-card lm-center"><h1>สมาชิก Wingpro</h1><p>{error}</p></div></main>;
  if(!view)return <main className="lm-page"><div className="lm-card lm-center"><p>กำลังโหลด…</p></div></main>;
  const phones=view.phones||[];
  return <main className="lm-page">
    <header className="lm-head"><small>WINGPRO BADMINTON</small><h1>บัตรสมาชิก</h1><p>สะสมดาวทุกครั้งที่ขึ้นเอ็น แลกถุงเท้าหรือขึ้นเอ็นฟรี และรับแจ้งสถานะไม้ใน LINE อัตโนมัติ</p></header>
    {notice&&<div className="lm-notice">{notice}</div>}
    {!phones.length&&<section className="lm-card"><h2>สมัครสมาชิก</h2><p className="lm-muted">กรอกชื่อและเบอร์โทรที่ใช้กับร้าน ถ้าเคยขึ้นเอ็นหรือซื้อของที่ร้าน ดาวสะสมเดิมจะรวมให้อัตโนมัติ</p><RegisterForm token={token} suggestedPhone={prefill} onDone={done}/></section>}
    {phones.map((p:any)=><section className="lm-card" key={p.phone}>
      <div className="lm-card-head"><div><h2>{p.name||'สมาชิก'}</h2><span>{formatPhone(p.phone)}</span></div><em className={p.status==='verified'?'is-ok':'is-wait'}>{p.status==='verified'?'✓ ยืนยันแล้ว':'รอร้านยืนยัน'}</em></div>
      {p.status==='verified'?<>
        <Stamps member={p.member||view.program}/>
        {p.jobs.length>0&&<div className="lm-jobs"><b>ไม้ที่อยู่ที่ร้าน</b>{p.jobs.map((j:any)=><a key={j.token} href={'/track/'+j.token}><span>{j.racket}<small>รับไม้ {day(j.created)}</small></span><em>{j.status==='รับไม้'?'รอขึ้นเอ็น':j.status}</em></a>)}</div>}
      </>:verifying===p.phone?<RegisterForm token={token} initialPhone={p.phone} initialName={p.name} needsJob onDone={done} onCancel={()=>setVerifying('')}/>
      :<div className="lm-pending"><p>เบอร์นี้มีประวัติที่ร้านอยู่แล้ว เพื่อความปลอดภัยของข้อมูล ร้านจะตรวจสอบก่อนแสดงดาวสะสมและประวัติ</p><button type="button" className="lm-secondary" onClick={()=>setVerifying(p.phone)}>มีเลขรับไม้? ยืนยันเองได้ทันที</button></div>}
    </section>)}
    {phones.length>0&&(adding?<section className="lm-card"><h2>เพิ่มเบอร์โทร</h2><p className="lm-muted">เช่น เบอร์ของลูกที่มาขึ้นเอ็นกับร้าน จะได้ดูดาวสะสมและรับแจ้งสถานะไม้ของเบอร์นั้นด้วย</p><RegisterForm token={token} suggestedPhone={prefill} onDone={done} onCancel={()=>setAdding(false)}/></section>
      :<button type="button" className="lm-add" onClick={()=>setAdding(true)}>+ เพิ่มเบอร์โทรอื่น</button>)}
    <footer className="lm-foot">ข้อมูลของคุณใช้เฉพาะสะสมแต้มและแจ้งสถานะไม้ของร้าน Wingpro Badminton เท่านั้น</footer>
  </main>;
}
