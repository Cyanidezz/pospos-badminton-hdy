'use client';
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';
import {DEFAULT_SHOP,bangkokNow,groupHours,isOpenNow,parseHours} from '@/lib/shop-hours';

const steps=['รอขึ้นเอ็น','กำลังขึ้นเอ็น','พร้อมรับไม้','คืนไม้แล้ว'];
const baht=(satang:number)=>(satang/100).toLocaleString('th-TH',{maximumFractionDigits:0});

// The reward text matches the shop's setting: a capped amount, or the whole job when there is no cap.
const rewardText=(cap:number|null)=>cap===null||cap===undefined?'ฟรีค่าขึ้นเอ็นทั้งหมด':`เอ็นมูลค่าไม่เกิน ฿${baht(cap)}`;

// Customer-facing stamp card: same idea as the staff page, worded for the customer reading their own link.
function MemberStamps({member}:{member:any}){
  if(!member)return null;
  const dots=member.need<=20?Array.from({length:member.need},(_,i)=>i):[];
  return <section className="member-stamps" aria-label="สะสมแต้มขึ้นเอ็น">
    <div className="stamp-card">
      <div className="stamp-head"><b>สะสมแต้มขึ้นเอ็น</b><span>{member.progress}/{member.need} ครั้ง · ครบแล้ว {member.earned} รอบ</span></div>
      {dots.length>0?<div className="stamp-dots">{dots.map(i=><span key={i} className={i<member.progress?'is-filled':''}>{i<member.progress?'✓':i+1}</span>)}</div>:<div className="stamp-bar"><i style={{width:(member.progress/member.need*100)+'%'}}/></div>}
      <div className={'stamp-reward'+(member.available>0?' is-ready':'')}>
        {member.available>0?<span>🎁 <b>คุณมีสิทธิ์ขึ้นเอ็นฟรี {member.available} ครั้ง!</b> แจ้งพนักงานตอนมาส่งไม้ครั้งถัดไปเพื่อใช้สิทธิ์ ({rewardText(member.rewardCap)})</span>
        :<span>สะสมอีก {member.need-member.progress} ครั้ง รับสิทธิ์ขึ้นเอ็นฟรี 1 ครั้ง ({rewardText(member.rewardCap)})</span>}
      </div>
    </div>
  </section>;
}

// Shop contact details come from "ตั้งค่าร้าน" via the tracking API (defaults are used until the owner saves them).
function ShopContact({shop}:any){
  const info=shop||DEFAULT_SHOP,hours=parseHours(info.hours),rows=groupHours(hours),now=bangkokNow(),openNow=isOpenNow(hours,now),today=rows.find(r=>r.days.includes(now.day));
  return <section className="shop-contact" aria-label="ติดต่อร้าน">
    <h3>ติดต่อร้าน</h3>
    {(info.phone||info.facebook)&&<div className="contact-links">
      {info.phone&&<a className="contact-link" href={'tel:'+String(info.phone).replace(/[^0-9+]/g,'')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>
        <span>โทร {info.phone}</span>
      </a>}
      {info.facebook&&<a className="contact-link" href={info.facebook} target="_blank" rel="noreferrer">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 22v-8.2h2.8l.5-3.3h-3.3V8.4c0-.9.4-1.7 1.8-1.7h1.6V3.9a20 20 0 0 0-2.4-.1c-2.5 0-4.1 1.5-4.1 4.2v2.5H7.6v3.3h2.8V22z"/></svg>
        <span>Facebook ของร้าน</span>
      </a>}
    </div>}
    <div className="hours">
      <div className="hours-head"><b>เวลาเปิดร้าน</b><span className={'open-badge '+(openNow?'is-open':'')}>{openNow?'เปิดอยู่ตอนนี้':'ปิดอยู่ตอนนี้'}</span></div>
      {rows.map(r=><div className={'hours-row'+(r===today?' today':'')} key={r.label}><span>{r.label}</span><b>{r.time}</b></div>)}
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
    {error?<><p>{error}</p><ShopContact shop={null}/></>:!job?<p>กำลังโหลด…</p>:<>
      <p>ใบรับไม้ #{job.id.slice(0,8).toUpperCase()}</p>
      <h2>{job.racket}</h2>
      <div className="track-status">{job.status}</div>
      {job.status!=='ยกเลิก'&&<ol>{steps.map((s,i)=><li className={i<=steps.indexOf(job.status)?'done':''} key={s}>{s}</li>)}</ol>}
      {job.status==='ยกเลิก'?<p>งานนี้ถูกยกเลิก หากมีข้อสงสัยกรุณาติดต่อร้าน</p>:<p>{job.paid?'ชำระเงินแล้ว':`ชำระวันรับไม้ ${(job.amount/100).toLocaleString('th-TH')} บาท`}</p>}
      {job.status!=='ยกเลิก'&&<MemberStamps member={job.member}/>}
      {job.lineOa&&<>
        <a className="line-cta" href={'https://line.me/R/oaMessage/'+encodeURIComponent(job.lineOa)+'/?'+encodeURIComponent('LINK '+token)} target="_blank" rel="noreferrer">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.9-.9L3 21l1.9-5A8.4 8.4 0 1 1 21 11.5z"/><path d="M8.5 11.5h7M8.5 14.5h4.5"/></svg>
          <div><strong>รับการแจ้งเตือนผ่าน LINE</strong><span>เพิ่มเพื่อนร้านแล้วกดส่งรหัสที่แสดงในแชท</span></div>
        </a>
      </>}
      <ShopContact shop={job.shop}/>
      <small>อัปเดตอัตโนมัติทุก 30 วินาที · เก็บลิงก์นี้ไว้เป็นส่วนตัว</small>
    </>}
  </main>;
}
