'use client';
import {ImagePlus} from 'lucide-react';
import {Switch} from '@/components/ui/switch';
import {DAY_NAMES,DISPLAY_ORDER,parseHours} from '@/lib/shop-hours';

const BANKS=['กสิกรไทย (KBank)','ไทยพาณิชย์ (SCB)','กรุงเทพ (BBL)','กรุงไทย (KTB)','กรุงศรีอยุธยา (BAY)','ทหารไทยธนชาต (ttb)','ออมสิน (GSB)','ธ.ก.ส. (BAAC)','PromptPay พร้อมเพย์'];

// What the "ตั้งค่าร้าน" panels save. Fields that were not touched fall back to the saved config, and the
// new columns are only sent once the database has them (i.e. after the migration was applied).
export function settingsPayload(form:any,config:any){
  const payload:any={shop:form.shop??config.shop,lineOa:form.lineOa??config.line_oa,showEarnings:form.showEarnings??!!config.show_earnings};
  if('bank_name' in config){
    payload.contactPhone=form.contactPhone??config.contact_phone;
    payload.contactFacebook=form.contactFacebook??config.contact_facebook;
    payload.openingHours=form.hours??parseHours(config.opening_hours);
    payload.bankName=form.bankName??config.bank_name;
    payload.bankAccountName=form.bankAccountName??config.bank_account_name;
    payload.bankAccountNo=form.bankAccountNo??config.bank_account_no;
    payload.bankQr=form.bankQr??config.bank_qr??'';
  }
  if('member_stamps_required' in config){
    payload.memberStampsRequired=form.memberStampsRequired??config.member_stamps_required;
    payload.memberRewardCap=form.memberRewardCap??(config.member_reward_cap===null||config.member_reward_cap===undefined?'':config.member_reward_cap/100);
  }
  return payload;
}

const NeedsMigration=()=><div className="notice">ยังไม่ได้อัปเดตฐานข้อมูลสำหรับส่วนนี้ ให้รัน migration <code>20260922000000_shop_contact_and_bank.sql</code> บน Supabase ก่อน</div>;

export function BasicPanel({form,setForm,config,busy,onSave,Field}:any){
  return <div className="panel report"><h2>ร้านค้าและสิทธิ์</h2>
    <form onSubmit={e=>{e.preventDefault();onSave()}}>
      <Field label="ชื่อร้าน"><input value={form.shop??config.shop} onChange={e=>setForm({...form,shop:e.target.value})}/></Field>
      <div className="switch-row"><div><b>แสดงค่าแรง / คอมมิชชั่นให้พนักงาน</b><p>เมื่อปิด พนักงานจะไม่เห็นหน้าและข้อมูลยอดนี้</p></div><Switch checked={form.showEarnings??!!config.show_earnings} onCheckedChange={v=>setForm({...form,showEarnings:v})}/></div>
      <Field label="LINE OA ID (เช่น @yourshop)"><input value={form.lineOa??config.line_oa} onChange={e=>setForm({...form,lineOa:e.target.value})}/></Field>
      <button disabled={busy}>บันทึกการตั้งค่า</button>
    </form></div>;
}

export function ContactPanel({form,setForm,config,busy,onSave,Field}:any){
  const ready='bank_name' in config,hours=form.hours??parseHours(config.opening_hours);
  const setDay=(day:number,value:[string,string]|null)=>setForm({...form,hours:{...hours,[String(day)]:value}});
  const fallback:[string,string]=(Object.values(hours).find(Boolean) as [string,string]|undefined)||['09:00','18:00'];
  return <div className="panel report"><h2>ข้อมูลติดต่อร้าน</h2>
    <p className="muted">แสดงให้ลูกค้าเห็นในหน้าติดตามสถานะไม้ (ที่ลูกค้าเปิดจาก QR ในใบรับไม้)</p>
    {!ready&&<NeedsMigration/>}
    <form onSubmit={e=>{e.preventDefault();onSave()}}>
      <div className="form-grid">
        <Field label="เบอร์โทร"><input type="tel" inputMode="tel" disabled={!ready} placeholder="เช่น 080-000-0000" value={form.contactPhone??config.contact_phone??''} onChange={e=>setForm({...form,contactPhone:e.target.value})}/></Field>
        <Field label="ลิงก์ Facebook"><input type="url" disabled={!ready} placeholder="https://www.facebook.com/…" value={form.contactFacebook??config.contact_facebook??''} onChange={e=>setForm({...form,contactFacebook:e.target.value})}/></Field>
      </div>
      <div className="field"><span>เวลาเปิดร้าน</span>
        <div className="hours-edit">{DISPLAY_ORDER.map(day=>{const value=hours[String(day)];return <div className="hours-edit-row" key={day}>
          <b>{DAY_NAMES[day]}</b>
          <label className="hours-open"><input type="checkbox" disabled={!ready} checked={!!value} onChange={e=>setDay(day,e.target.checked?fallback:null)}/>เปิด</label>
          {value?<><input type="time" aria-label={'เวลาเปิด '+DAY_NAMES[day]} disabled={!ready} value={value[0]} onChange={e=>setDay(day,[e.target.value,value[1]])}/><span>–</span><input type="time" aria-label={'เวลาปิด '+DAY_NAMES[day]} disabled={!ready} value={value[1]} onChange={e=>setDay(day,[value[0],e.target.value])}/></>:<span className="muted">หยุด</span>}
        </div>})}</div>
      </div>
      <button disabled={busy||!ready}>บันทึกข้อมูลติดต่อ</button>
    </form></div>;
}

export function BankPanel({form,setForm,config,busy,uploading,upload,onSave,Field}:any){
  const ready='bank_name' in config,qr=form.bankQr??config.bank_qr??'';
  return <div className="panel report"><h2>บัญชีรับโอนเงิน</h2>
    <p className="muted">เมื่อลูกค้าเลือกจ่ายแบบ “โอนเงิน” ระบบจะแสดง QR และเลขที่บัญชีนี้ให้ลูกค้าสแกน</p>
    {!ready&&<NeedsMigration/>}
    <form onSubmit={e=>{e.preventDefault();onSave()}}>
      <div className="form-grid">
        <Field label="ธนาคาร"><input list="bank-list" disabled={!ready} value={form.bankName??config.bank_name??''} onChange={e=>setForm({...form,bankName:e.target.value})}/><datalist id="bank-list">{BANKS.map(b=><option key={b} value={b}/>)}</datalist></Field>
        <Field label="เลขที่บัญชี / เบอร์พร้อมเพย์"><input inputMode="numeric" disabled={!ready} placeholder="000-0-00000-0" value={form.bankAccountNo??config.bank_account_no??''} onChange={e=>setForm({...form,bankAccountNo:e.target.value})}/></Field>
      </div>
      <Field label="ชื่อบัญชี"><input disabled={!ready} value={form.bankAccountName??config.bank_account_name??''} onChange={e=>setForm({...form,bankAccountName:e.target.value})}/></Field>
      <div className="field"><span>QR Code รับโอนเงินของร้าน <small>(รูป JPG / PNG / WebP ไม่เกิน 8 MB)</small></span>
        <div className="qr-upload">
          {qr?<img className="bank-qr-preview" src={'/api/files/'+qr} alt="QR โอนเงินของร้าน"/>:<div className="bank-qr-empty">ยังไม่มี QR</div>}
          <div className="qr-actions">
            <label className={'attach-button secondary'+(qr?' has-photos':'')}><ImagePlus size={18}/>{qr?'เปลี่ยนรูป QR':'อัปโหลด QR'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!ready||uploading} onChange={e=>{upload(e.target.files,'bankQr');e.target.value=''}}/></label>
            {qr&&<button type="button" className="secondary small" onClick={()=>setForm({...form,bankQr:''})}>ลบ QR</button>}
            {form.bankQr!==undefined&&form.bankQr!==(config.bank_qr??'')&&<small className="muted">ยังไม่ได้บันทึก กด “บันทึกบัญชีรับโอน”</small>}
          </div>
        </div>
      </div>
      <button disabled={busy||uploading||!ready}>บันทึกบัญชีรับโอน</button>
    </form></div>;
}

export function MemberPanel({form,setForm,config,busy,onSave,Field}:any){
  const ready='member_stamps_required' in config;
  return <div className="panel report"><h2>ระบบสมาชิก</h2>
    <p className="muted">ขึ้นเอ็นและชำระแล้ว 1 ครั้ง = 1 แต้ม ครบตามจำนวนที่ตั้ง ลูกค้าได้สิทธิ์ขึ้นเอ็นฟรี 1 ครั้ง (ลูกค้าจัดกลุ่มตามเบอร์โทรอัตโนมัติ)</p>
    {!ready&&<div className="notice">ยังไม่ได้อัปเดตฐานข้อมูลสำหรับส่วนนี้ ให้รัน migration <code>20260922010000_members.sql</code> บน Supabase ก่อน</div>}
    <form onSubmit={e=>{e.preventDefault();onSave()}}>
      <div className="form-grid">
        <Field label="ขึ้นเอ็นครบกี่ครั้งได้สิทธิ์ฟรี"><input type="number" min="1" max="100" step="1" disabled={!ready} value={form.memberStampsRequired??config.member_stamps_required??10} onChange={e=>setForm({...form,memberStampsRequired:e.target.value})}/></Field>
        <Field label="ส่วนลดสูงสุดต่อสิทธิ์ (บาท)"><input type="number" min="0" step="0.01" disabled={!ready} placeholder="ว่าง = ฟรีทั้งงาน" value={form.memberRewardCap??(config.member_reward_cap===null||config.member_reward_cap===undefined?'':config.member_reward_cap/100)} onChange={e=>setForm({...form,memberRewardCap:e.target.value})}/></Field>
      </div>
      <p className="muted">ถ้าใส่ส่วนลดสูงสุด เช่น 100 บาท สิทธิ์จะลดให้ไม่เกิน 100 บาทต่องาน (ลูกค้าจ่ายส่วนที่เหลือ) ปล่อยว่างเพื่อให้ฟรีทั้งงาน</p>
      <button disabled={busy||!ready}>บันทึกระบบสมาชิก</button>
    </form></div>;
}
