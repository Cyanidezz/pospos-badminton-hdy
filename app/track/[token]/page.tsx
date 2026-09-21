'use client';
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';

const steps=['รอขึ้นเอ็น','กำลังขึ้นเอ็น','พร้อมรับไม้','คืนไม้แล้ว'];

// Shop contact details shown to customers. Times are minutes from midnight, Thailand time.
const SHOP={
  phone:'080-539-0444',
  facebook:'https://www.facebook.com/profile.php?id=61583314268963',
  hours:[
    {label:'จันทร์ – ศุกร์',days:[1,2,3,4,5],time:'15.00 – 23.00 น.',open:15*60,close:23*60},
    {label:'เสาร์',days:[6],time:'13.00 – 21.00 น.',open:13*60,close:21*60},
    {label:'อาทิตย์',days:[0],time:'หยุด',open:0,close:0},
  ],
};

function bangkokNow(){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  return {day:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday),minutes:(Number(parts.hour)%24)*60+Number(parts.minute)};
}

function ShopContact(){
  const {day,minutes}=bangkokNow(),today=SHOP.hours.find(h=>h.days.includes(day)),openNow=!!today&&minutes>=today.open&&minutes<today.close;
  return <section className="shop-contact" aria-label="ติดต่อร้าน">
    <h3>ติดต่อร้าน</h3>
    <div className="contact-links">
      <a className="contact-link" href={'tel:'+SHOP.phone.replaceAll('-','')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>
        <span>โทร {SHOP.phone}</span>
      </a>
      <a className="contact-link" href={SHOP.facebook} target="_blank" rel="noreferrer">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 22v-8.2h2.8l.5-3.3h-3.3V8.4c0-.9.4-1.7 1.8-1.7h1.6V3.9a20 20 0 0 0-2.4-.1c-2.5 0-4.1 1.5-4.1 4.2v2.5H7.6v3.3h2.8V22z"/></svg>
        <span>Facebook ของร้าน</span>
      </a>
    </div>
    <div className="hours">
      <div className="hours-head"><b>เวลาเปิดร้าน</b><span className={'open-badge '+(openNow?'is-open':'')}>{openNow?'เปิดอยู่ตอนนี้':'ปิดอยู่ตอนนี้'}</span></div>
      {SHOP.hours.map(h=><div className={'hours-row'+(h===today?' today':'')} key={h.label}><span>{h.label}</span><b>{h.time}</b></div>)}
    </div>
  </section>;
}

export default function Track(){
  const {token}=useParams(),[job,setJob]=useState<any>(null),[error,setError]=useState('');
  useEffect(()=>{
    const load=()=>fetch('/api/track/'+token).then(r=>r.json()).then((j:any)=>j.error?setError(j.error):setJob(j)).catch(()=>setError('โหลดไม่สำเร็จ กรุณาลองอีกครั้ง'));
    load();
    const timer=setInterval(load,30000);
    return()=>clearInterval(timer);
  },[token]);
  return <main className="tracking">
    <div className="eyebrow">BADMINTON · STRINGING SERVICE</div>
    <h1>ติดตามสถานะไม้</h1>
    {error?<><p>{error}</p><ShopContact/></>:!job?<p>กำลังโหลด…</p>:<>
      <p>ใบรับไม้ #{job.id.slice(0,8).toUpperCase()}</p>
      <h2>{job.racket}</h2>
      <div className="track-status">{job.status}</div>
      {job.status!=='ยกเลิก'&&<ol>{steps.map((s,i)=><li className={i<=steps.indexOf(job.status)?'done':''} key={s}>{s}</li>)}</ol>}
      {job.status==='ยกเลิก'?<p>งานนี้ถูกยกเลิก หากมีข้อสงสัยกรุณาติดต่อร้าน</p>:<p>{job.paid?'ชำระเงินแล้ว':`ชำระวันรับไม้ ${(job.amount/100).toLocaleString('th-TH')} บาท`}</p>}
      {job.lineOa&&<>
        <a className="line-cta" href={'https://line.me/R/oaMessage/'+encodeURIComponent(job.lineOa)+'/?'+encodeURIComponent('LINK '+token)} target="_blank" rel="noreferrer">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.9-.9L3 21l1.9-5A8.4 8.4 0 1 1 21 11.5z"/><path d="M8.5 11.5h7M8.5 14.5h4.5"/></svg>
          <div><strong>รับการแจ้งเตือนผ่าน LINE</strong><span>เพิ่มเพื่อนร้านแล้วกดส่งรหัสที่แสดงในแชท</span></div>
        </a>
      </>}
      <ShopContact/>
      <small>อัปเดตอัตโนมัติทุก 30 วินาที · เก็บลิงก์นี้ไว้เป็นส่วนตัว</small>
    </>}
  </main>;
}
