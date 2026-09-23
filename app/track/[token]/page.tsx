'use client';
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';
import {DEFAULT_SHOP,bangkokNow,groupHours,isOpenNow,parseHours} from '@/lib/shop-hours';
import {BankTransfer} from '@/app/bank-transfer';

const steps=['รอขึ้นเอ็น','กำลังขึ้นเอ็น','พร้อมรับไม้','คืนไม้แล้ว'];
const baht=(satang:number)=>(satang/100).toLocaleString('th-TH',{maximumFractionDigits:0});

// The reward text matches the shop's setting: a capped amount, or the whole job when there is no cap.
const rewardText=(cap:number|null)=>cap===null||cap===undefined?'ฟรีค่าขึ้นเอ็นทั้งหมด':`เอ็นมูลค่าไม่เกิน ฿${baht(cap)}`;
const thaiDay=(date:string)=>new Date(date+'T12:00:00').toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit',timeZone:'Asia/Bangkok'});

// The promotion's stamping period, worded the same way as "ตั้งค่าร้าน" describes it to staff - matches
// lib/customers.ts's promoPhase() exactly, so this can never disagree with whether a visit actually earns a
// stamp right now. `null` (the feature isn't configured, or an unbounded "always on") shows nothing.
function promoNotice(promo:{phase:string|null;start:string|null;end:string|null}|undefined){
  if(!promo?.phase)return null;
  const {phase,start,end}=promo;
  if(phase==='off')return {tone:'paused',text:'ปิดรับสะสมแต้มชั่วคราว · แต้มและสิทธิ์ที่มีอยู่ยังใช้ได้ตามปกติ'};
  if(phase==='before')return {tone:'upcoming',text:end?`โปรโมชั่นสะสมแต้ม ${thaiDay(start!)} – ${thaiDay(end)}`:`โปรโมชั่นสะสมแต้มเริ่ม ${thaiDay(start!)}`};
  if(phase==='after')return {tone:'ended',text:`โปรโมชั่นสะสมแต้มสิ้นสุดแล้วเมื่อ ${thaiDay(end!)} · แต้มและสิทธิ์ที่มีอยู่ยังใช้ได้ตามปกติ`};
  if(end)return {tone:'active',text:`สะสมแต้มได้ถึง ${thaiDay(end)}`};
  if(start)return {tone:'active',text:`สะสมแต้มได้ตั้งแต่ ${thaiDay(start)} เป็นต้นไป`};
  return null;
}

// Customer-facing stamp card: same idea as the staff page, worded for the customer reading their own link. Two
// reward tiers share one star count - 5 stars for socks, 10 for a free stringing - and redeeming EITHER resets it
// to zero, so at most one of the two boxes below can ever be "used" per cycle.
function MemberStamps({member,reward,token,onRedeemed}:{member:any;reward:any;token:string;onRedeemed:()=>void}){
  const [confirmString,setConfirmString]=useState(false),[busyString,setBusyString]=useState(false),[errorString,setErrorString]=useState('');
  const [confirmSocks,setConfirmSocks]=useState(false),[busySocks,setBusySocks]=useState(false),[errorSocks,setErrorSocks]=useState(''),[socksDone,setSocksDone]=useState('');
  if(!member)return null;
  const redeemString=async()=>{
    setBusyString(true);setErrorString('');
    try{
      const r=await fetch('/api/track/'+token+'/redeem',{method:'POST'});
      const d:any=await r.json();
      if(!r.ok)throw new Error(d.error||'ใช้สิทธิ์ไม่สำเร็จ');
      setConfirmString(false);onRedeemed();
    }catch(e:any){setErrorString(e.message||'ใช้สิทธิ์ไม่สำเร็จ')}
    finally{setBusyString(false)}
  };
  const redeemSocks=async()=>{
    setBusySocks(true);setErrorSocks('');
    try{
      const r=await fetch('/api/track/'+token+'/redeem-socks',{method:'POST'});
      const d:any=await r.json();
      if(!r.ok)throw new Error(d.error||'ใช้สิทธิ์ไม่สำเร็จ');
      setConfirmSocks(false);setSocksDone(d.product||'ถุงเท้า');onRedeemed();
    }catch(e:any){setErrorSocks(e.message||'ใช้สิทธิ์ไม่สำเร็จ')}
    finally{setBusySocks(false)}
  };
  const dots=member.stringNeed<=20?Array.from({length:member.stringNeed},(_,i)=>i):[];
  const promo=promoNotice(member.promo);
  const bothReady=member.socksAvailable&&member.stringAvailable;
  return <section className="member-stamps" aria-label="สะสมแต้มขึ้นเอ็น">
    <div className="stamp-card">
      <div className="stamp-head"><b>สะสมแต้มขึ้นเอ็น</b><span>{member.stars} ดาว · แลกไปแล้ว {member.stringUsed+member.socksUsed} ครั้ง</span></div>
      {promo&&<p className={'promo-window '+promo.tone}>{promo.text}</p>}
      {dots.length>0?<div className="stamp-dots">{dots.map(i=><span key={i} className={(i<member.stars?'is-filled ':'')+(i===member.socksNeed-1?'is-milestone':'')}>{i<member.stars?'✓':i+1}</span>)}</div>:<div className="stamp-bar"><i style={{width:(member.stars/member.stringNeed*100)+'%'}}/></div>}
      {bothReady&&<p className="stamp-both-notice">มีสิทธิ์แลกได้ 2 อย่าง เลือกแลกอย่างใดอย่างหนึ่ง ระบบจะเริ่มนับดาวใหม่หลังแลก</p>}
      {member.socksProductName&&<div className={'stamp-reward'+(member.socksAvailable?' is-ready':'')}>
        {member.socksAvailable?<span>🧦 <b>คุณมีสิทธิ์แลก{member.socksProductName}ฟรี!</b> (ครบ {member.socksNeed} ดาว)</span>
        :<span>สะสมอีก {Math.max(0,member.socksNeed-member.stars)} ดาว แลก{member.socksProductName}ฟรีได้ (ครบ {member.socksNeed} ดาว)</span>}
        {socksDone&&<p className="reward-done">✓ แลก{socksDone}ฟรีสำเร็จ!</p>}
        {member.socksAvailable&&!socksDone&&(!confirmSocks?<button type="button" className="redeem-cta socks" onClick={()=>setConfirmSocks(true)}>🧦 แลก{member.socksProductName}ฟรี</button>
        :<div className="redeem-confirm">
          <p>แลก{member.socksProductName}ฟรี 1 ชิ้น? ดาวจะเริ่มนับใหม่จาก 0</p>
          <div><button type="button" className="secondary" disabled={busySocks} onClick={()=>{setConfirmSocks(false);setErrorSocks('')}}>ยกเลิก</button><button type="button" disabled={busySocks} onClick={redeemSocks}>{busySocks?'กำลังใช้สิทธิ์…':'ยืนยันใช้สิทธิ์'}</button></div>
        </div>)}
        {errorSocks&&<p role="alert" className="notice">{errorSocks}</p>}
      </div>}
      <div className={'stamp-reward'+(member.stringAvailable?' is-ready':'')}>
        {member.stringAvailable?<span>🎁 <b>คุณมีสิทธิ์ขึ้นเอ็นฟรี!</b> {reward?.canRedeem?'กดใช้สิทธิ์กับไม้นี้ได้เลย':'ใช้ได้กับไม้ครั้งถัดไป'} (ครบ {member.stringNeed} ดาว · {rewardText(member.rewardCap)})</span>
        :<span>สะสมอีก {Math.max(0,member.stringNeed-member.stars)} ดาว รับสิทธิ์ขึ้นเอ็นฟรี (ครบ {member.stringNeed} ดาว · {rewardText(member.rewardCap)})</span>}
      </div>
      {reward?.used&&<p className="reward-done">✓ ใช้สิทธิ์ขึ้นเอ็นฟรีกับไม้นี้แล้ว · ลด ฿{baht(reward.discount)}</p>}
      {reward?.canRedeem&&(!confirmString?<button type="button" className="redeem-cta" onClick={()=>setConfirmString(true)}>🎁 แลกสิทธิ์ขึ้นเอ็นฟรี</button>
      :<div className="redeem-confirm">
        <p>ใช้สิทธิ์ 1 ครั้งกับไม้นี้? ลด <b>฿{baht(reward.redeemOff)}</b> เหลือชำระ <b>฿{baht(reward.amount-reward.redeemOff)}</b></p>
        <div><button type="button" className="secondary" disabled={busyString} onClick={()=>{setConfirmString(false);setErrorString('')}}>ยกเลิก</button><button type="button" disabled={busyString} onClick={redeemString}>{busyString?'กำลังใช้สิทธิ์…':'ยืนยันใช้สิทธิ์'}</button></div>
      </div>)}
      {errorString&&<p role="alert" className="notice">{errorString}</p>}
    </div>
  </section>;
}

// Lets the customer pay before staff process the job in person: shows the shop's transfer QR and takes a photo
// of the slip. This never marks the job paid by itself - the shop still reviews the slip before confirming.
function PaySection({job,token,onUploaded}:{job:any;token:string;onUploaded:()=>void}){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  if(job.paid||job.status==='ยกเลิก'||!(job.amount>0))return null;
  if(job.slipUploaded)return <div className="track-pay"><p className="notice">ส่งสลิปแล้ว ร้านจะตรวจสอบและอัปเดตสถานะการชำระเงินให้เร็วๆ นี้ หากส่งผิดรูปหรือต้องการแก้ไข ติดต่อร้านได้เลย</p></div>;
  const upload=async(files:FileList|null)=>{
    if(!files?.[0])return;
    setBusy(true);setError('');
    try{
      const body=new FormData();body.append('file',files[0]);
      const r=await fetch('/api/track/'+token+'/slip',{method:'POST',body});
      const d:any=await r.json();
      if(!r.ok)throw new Error(d.error||'อัปโหลดไม่สำเร็จ');
      onUploaded();
    }catch(e:any){setError(e.message||'อัปโหลดไม่สำเร็จ')}
    finally{setBusy(false)}
  };
  return <div className="track-pay">
    {!open?<button type="button" className="pay-cta" onClick={()=>setOpen(true)}>จ่ายเงิน</button>:<>
      <BankTransfer config={{bank_name:job.bank?.name,bank_account_name:job.bank?.accountName,bank_account_no:job.bank?.accountNo,bank_qr:job.bank?.hasQr?'ready':null}} qrSrc="/api/track/bank-qr"/>
      <label className={'attach-button'+(busy?' is-busy':'')}>{busy?'กำลังอัปโหลด…':'แนบรูปสลิปโอนเงิน'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{upload(e.target.files);e.target.value=''}}/></label>
      {error&&<p role="alert" className="notice">{error}</p>}
      <p className="muted">ร้านจะตรวจสอบยอดในสลิปอีกครั้งก่อนยืนยันการชำระเงิน</p>
    </>}
  </div>;
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
  const load=()=>fetch('/api/track/'+token).then(r=>r.json()).then((j:any)=>j.error?setError(j.error):setJob(j)).catch(()=>setError('โหลดไม่สำเร็จ กรุณาลองอีกครั้ง'));
  useEffect(()=>{
    load();
    const timer=setInterval(load,30000);
    return()=>clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[token]);
  return <main className="tracking">
    <div className="eyebrow">BADMINTON · STRINGING SERVICE</div>
    <h1>ติดตามสถานะไม้</h1>
    {error?<><p>{error}</p><ShopContact shop={null}/></>:!job?<p>กำลังโหลด…</p>:<>
      <p>ใบรับไม้ #{job.id.slice(0,8).toUpperCase()}</p>
      <h2>{job.racket}</h2>
      <div className="track-status">{job.status}</div>
      {job.status!=='ยกเลิก'&&<ol>{steps.map((s,i)=><li className={i<=steps.indexOf(job.status)?'done':''} key={s}>{s}</li>)}</ol>}
      {job.status==='ยกเลิก'?<p>งานนี้ถูกยกเลิก หากมีข้อสงสัยกรุณาติดต่อร้าน</p>:<p>{job.paid?'ชำระเงินแล้ว':job.amount>0?`ชำระวันรับไม้ ${(job.amount/100).toLocaleString('th-TH')} บาท`:'ไม่มีค่าใช้จ่าย (ใช้สิทธิ์สมาชิก)'}</p>}
      <PaySection job={job} token={String(token)} onUploaded={()=>setJob((j:any)=>({...j,slipUploaded:true}))}/>
      {job.status!=='ยกเลิก'&&<MemberStamps member={job.member} reward={job.reward&&{...job.reward,amount:job.amount}} token={String(token)} onRedeemed={load}/>}
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
