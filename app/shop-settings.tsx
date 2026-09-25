'use client';
import {useEffect,useState} from 'react';
import {ImagePlus} from 'lucide-react';
import {toast} from 'sonner';
import {promoImage} from '@/lib/image-compress';
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
  if('member_socks_stamps_required' in config){
    payload.memberSocksStampsRequired=form.memberSocksStampsRequired??config.member_socks_stamps_required;
    payload.memberSocksProductId=form.memberSocksProductId??(config.member_socks_product_id||'');
  }
  if('member_promo_enabled' in config){
    payload.memberPromoEnabled=form.memberPromoEnabled??!!config.member_promo_enabled;
    payload.memberPromoStart=form.memberPromoStart??(config.member_promo_start||'');
    payload.memberPromoEnd=form.memberPromoEnd??(config.member_promo_end||'');
  }
  if('member_pos_min_amount' in config)payload.memberPosMinAmount=form.memberPosMinAmount??(config.member_pos_min_amount||0)/100;
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

export function MemberPanel({form,setForm,config,products,busy,onSave,Field}:any){
  const ready='member_stamps_required' in config;
  const socksReady=ready&&'member_socks_stamps_required' in config;
  const stringNeed=Number(form.memberStampsRequired??config.member_stamps_required)||10;
  const socksNeed=Number(form.memberSocksStampsRequired??config.member_socks_stamps_required)||5;
  return <div className="panel report"><h2>ระบบสมาชิก</h2>
    <p className="muted">ขึ้นเอ็นและชำระแล้ว 1 ครั้ง = 1 ดาว และบิลหน้าร้านที่ผูกสมาชิก 1 บิล = 1 ดาว สะสมครบ {socksNeed} ดาวแลกถุงเท้าฟรีได้ 1 คู่ หรือสะสมต่อจนครบ {stringNeed} ดาวแลกเอ็นฟรี 1 เส้น แลกอย่างใดอย่างหนึ่งแล้วเริ่มนับดาวใหม่ (ลูกค้าจัดกลุ่มตามเบอร์โทรอัตโนมัติ)</p>
    {!ready&&<div className="notice">ยังไม่ได้อัปเดตฐานข้อมูลสำหรับส่วนนี้ ให้รัน migration <code>20260922010000_members.sql</code> บน Supabase ก่อน</div>}
    <form onSubmit={e=>{e.preventDefault();onSave()}}>
      <h3 className="reward-tier-title">🎁 ขึ้นเอ็นฟรี</h3>
      <div className="form-grid">
        <Field label="สะสมครบกี่ดาว"><input type="number" min="1" max="100" step="1" disabled={!ready} value={form.memberStampsRequired??config.member_stamps_required??10} onChange={e=>setForm({...form,memberStampsRequired:e.target.value})}/></Field>
        <Field label="ส่วนลดสูงสุดต่อสิทธิ์ (บาท)"><input type="number" min="0" step="0.01" disabled={!ready} placeholder="ว่าง = ฟรีทั้งงาน" value={form.memberRewardCap??(config.member_reward_cap===null||config.member_reward_cap===undefined?'':config.member_reward_cap/100)} onChange={e=>setForm({...form,memberRewardCap:e.target.value})}/></Field>
      </div>
      <p className="muted">ถ้าใส่ส่วนลดสูงสุด เช่น 100 บาท สิทธิ์จะลดให้ไม่เกิน 100 บาทต่องาน (ลูกค้าจ่ายส่วนที่เหลือ) ปล่อยว่างเพื่อให้ฟรีทั้งงาน</p>
      <hr className="panel-divider"/>
      <h3 className="reward-tier-title">🧦 ถุงเท้าฟรี</h3>
      {!socksReady?<div className="notice">แลกถุงเท้าฟรีต้องรัน migration <code>20260924030000_member_socks_reward.sql</code> ก่อน</div>:<>
        <Field label="สะสมครบกี่ดาว"><input className="field-narrow" type="number" min="1" max="100" step="1" value={form.memberSocksStampsRequired??config.member_socks_stamps_required??5} onChange={e=>setForm({...form,memberSocksStampsRequired:e.target.value})}/></Field>
        <Field label="สินค้าที่ให้เป็นถุงเท้าฟรี">
          <select value={form.memberSocksProductId??(config.member_socks_product_id||'')} onChange={e=>setForm({...form,memberSocksProductId:e.target.value})}>
            <option value="">— ยังไม่เลือก (ปิดการแลกถุงเท้า) —</option>
            {(products||[]).filter((p:any)=>p.active!==0).map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <p className="muted">ตัดสต๊อกสินค้าที่เลือกจริง 1 ชิ้นต่อการแลก 1 ครั้ง และนับต้นทุนตามจริง แต่ราคาขายบันทึกเป็น 0 บาท (ลดเต็มราคา) โชว์ในรายงานยอดขายว่าเป็นส่วนลด</p>
      </>}
      {ready&&!('member_pos_min_amount' in config)&&<div className="notice">แต้มจากบิลหน้าร้านต้องรัน migration <code>20260922020000_member_notes_and_pos_stamps.sql</code> ก่อน</div>}
      <hr className="panel-divider"/>
      <Field label="บิลหน้าร้าน (POS) ที่ผูกสมาชิก ได้ 1 แต้มเมื่อยอดตั้งแต่ (บาท)"><input type="number" min="0" step="0.01" disabled={!('member_pos_min_amount' in config)} placeholder="0 = ทุกบิลได้แต้ม" value={form.memberPosMinAmount??((config.member_pos_min_amount||0)/100)} onChange={e=>setForm({...form,memberPosMinAmount:e.target.value})}/></Field>
      <hr className="panel-divider"/>
      <h3>ช่วงเวลาโปรโมชั่น</h3>
      <p className="muted">จำกัดให้สะสมแต้มได้เฉพาะบางช่วง เช่น 1 ต.ค. – 31 ธ.ค. หรือปิดโปรโมชั่นชั่วคราวโดยไม่ต้องลบวันที่ สิทธิ์ที่ลูกค้าสะสมครบแล้วยังใช้ได้ตามปกติ ไม่ถูกริบคืน</p>
      {ready&&!('member_promo_enabled' in config)&&<div className="notice">ตั้งช่วงเวลาโปรโมชั่นต้องรัน migration <code>20260923010000_member_promo_window.sql</code> ก่อน</div>}
      <div className="switch-row"><div><b>เปิดใช้งานการสะสมแต้ม</b><p>เมื่อปิด ลูกค้าจะไม่ได้แต้มใหม่จนกว่าจะเปิดอีกครั้ง</p></div><Switch disabled={!('member_promo_enabled' in config)} checked={form.memberPromoEnabled??!!config.member_promo_enabled} onCheckedChange={v=>setForm({...form,memberPromoEnabled:v})}/></div>
      <div className="form-grid">
        <Field label="เริ่มสะสม (ไม่บังคับ)"><input type="date" disabled={!('member_promo_enabled' in config)} value={form.memberPromoStart??(config.member_promo_start||'')} onChange={e=>setForm({...form,memberPromoStart:e.target.value})}/></Field>
        <Field label="สิ้นสุด (ไม่บังคับ)"><input type="date" disabled={!('member_promo_enabled' in config)} value={form.memberPromoEnd??(config.member_promo_end||'')} onChange={e=>setForm({...form,memberPromoEnd:e.target.value})}/></Field>
      </div>
      <p className="muted">เว้นว่างทั้งสองช่องเพื่อสะสมแต้มได้ตลอดไป (ไม่จำกัดช่วงเวลา)</p>
      <button disabled={busy||!ready}>บันทึกระบบสมาชิก</button>
    </form></div>;
}

// ---------------------------------------------------------------- LINE OA: rich menu + promotions

// Installs the 5-button rich menu (ติดตามงานขึ้นเอ็น / เช็คคะแนนสะสม / โปรโมชั่น / Facebook / โทร) on the shop's LINE OA. The link and
// phone number are saved as the shop's contact details too, so every customer-facing place shows the same ones.
export function LineMenuPanel({config,lineReady,Field,onDone}:any){
  const [facebook,setFacebook]=useState(config.contact_facebook||''),[phone,setPhone]=useState(config.contact_phone||''),[busy,setBusy]=useState(false);
  const install=async()=>{
    setBusy(true);
    try{
      const r=await fetch('/api/line/richmenu',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({facebook,phone})});
      const d:any=await r.json();
      if(!r.ok)throw new Error(d.error||'ติดตั้งไม่สำเร็จ');
      toast.success('ติดตั้ง rich menu บน LINE OA แล้ว');onDone?.();
    }catch(e:any){toast.error(e.message)}finally{setBusy(false)}
  };
  return <div className="panel report line-menu-panel"><h2>เมนูบน LINE OA (Rich menu)</h2>
    <p className="muted">เมนู 5 ปุ่มด้านล่างแชท LINE ของร้าน: ติดตามงานขึ้นเอ็น, เช็คคะแนนสะสม (ลูกค้าพิมพ์เบอร์โทรเพื่อเช็ค), โปรโมชั่น, Facebook ร้าน และโทรหาร้าน · กดติดตั้งซ้ำเมื่อเปลี่ยนเมนู</p>
    <img className="line-menu-preview" src="/line-richmenu.jpg" alt="ตัวอย่าง rich menu"/>
    {!lineReady&&<div className="notice">ยังไม่ได้ตั้งค่า LINE Channel access token / secret จึงติดตั้งเมนูไม่ได้</div>}
    <Field label="ลิงก์ Facebook ร้าน"><input type="url" placeholder="https://www.facebook.com/..." value={facebook} onChange={e=>setFacebook(e.target.value)}/></Field>
    <Field label="เบอร์โทรร้าน"><input type="tel" inputMode="tel" placeholder="เช่น 087-095-4441" value={phone} onChange={e=>setPhone(e.target.value)}/></Field>
    <p className="muted">ลิงก์และเบอร์นี้จะใช้กับหน้าติดตามสถานะไม้และการ์ดโปรโมชั่นด้วย ต้องเปิด Webhook ของ LINE OA ไว้ที่ <code>/api/line</code> ปุ่ม “ติดตามงานขึ้นเอ็น” และ “โปรโมชั่น” จึงจะตอบกลับได้</p>
    <button type="button" disabled={busy||!lineReady||!facebook||!phone} onClick={install}>{busy?'กำลังติดตั้ง…':'ติดตั้ง / อัปเดต rich menu บน LINE OA'}</button>
  </div>;
}

// Promotions shown when a customer taps "โปรโมชั่น" on LINE: one Flex card each (image + title + text), newest first.
export function PromotionPanel({Field,onAction}:any){
  const blank={id:'',title:'',body:'',image:'',active:true};
  const [promotions,setPromotions]=useState<any[]|null|undefined>(undefined);
  const [form,setForm]=useState<any>(null),[uploading,setUploading]=useState(false),[saving,setSaving]=useState(false);
  const reload=async()=>{try{const r=await fetch('/api/promotions',{cache:'no-store'}),d:any=await r.json();if(!r.ok)throw new Error(d.error);setPromotions(d.promotions)}catch(e:any){toast.error(e.message);setPromotions([])}};
  useEffect(()=>{reload()},[]);
  const act=async(action:string,body:any)=>{const d=await onAction(action,body,false);await reload();return d};
  if(promotions===undefined)return <div className="panel report"><h2>โปรโมชั่นบน LINE</h2><p className="muted">กำลังโหลด…</p></div>;
  if(promotions===null)return <div className="panel report"><h2>โปรโมชั่นบน LINE</h2><div className="notice">ต้องรัน migration <code>20260925020000_promotions.sql</code> บน Supabase ก่อน</div></div>;
  const list=promotions||[],activeCount=list.filter((p:any)=>p.active).length;
  const upload=async(files:FileList|null)=>{
    if(!files?.[0])return;
    setUploading(true);
    try{
      const fd=new FormData();fd.append('file',await promoImage(files[0]));
      const r=await fetch('/api/upload',{method:'POST',body:fd}),d:any=await r.json();
      if(!r.ok)throw new Error(d.error);
      setForm((f:any)=>({...f,image:d.id}));
    }catch(e:any){toast.error(e.message)}finally{setUploading(false)}
  };
  const save=async(p:any)=>{setSaving(true);const d=await act('promotionSave',{id:p.id||undefined,title:p.title,body:p.body,image:p.image||null,active:!!p.active,requestId:crypto.randomUUID()});setSaving(false);return d};
  return <div className="panel report promo-panel"><h2>โปรโมชั่นบน LINE</h2>
    <p className="muted">ลูกค้ากด “โปรโมชั่น” ในเมนู LINE จะเห็นทุกโปรที่เปิดอยู่เรียงเป็นการ์ดเลื่อนดูได้ (สูงสุด 12 รายการ) · เปิดอยู่ {activeCount} รายการ</p>
    {!form&&<button type="button" className="secondary" onClick={()=>setForm(blank)}>+ เพิ่มโปรโมชั่น</button>}
    {form&&<div className="promo-form">
      <Field label="หัวข้อโปรโมชั่น"><input maxLength={120} placeholder="เช่น ขึ้นเอ็น BG80 ลด 50 บาท" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></Field>
      <Field label="รายละเอียด"><textarea rows={3} maxLength={500} placeholder="เงื่อนไข ระยะเวลา หรือรายละเอียดเพิ่มเติม" value={form.body} onChange={e=>setForm({...form,body:e.target.value})}/></Field>
      <div className="field"><span>รูปโปรโมชั่น</span>
        <div className="promo-image-row">{form.image?<img src={'/api/files/'+form.image} alt="รูปโปรโมชั่น"/>:<div className="promo-image-empty">ยังไม่มีรูป</div>}
          <label className={'attach-button secondary'+(uploading?' is-busy':'')}>{uploading?'กำลังอัปโหลด…':form.image?'เปลี่ยนรูป':'อัปโหลดรูป'}<input type="file" accept="image/*" disabled={uploading} onChange={e=>{upload(e.target.files);e.target.value=''}}/></label>
          {form.image&&<button type="button" className="link-button" onClick={()=>setForm({...form,image:''})}>เอารูปออก</button>}
        </div>
        <small className="muted">แนะนำรูปแนวนอน สัดส่วนประมาณ 20:13 ระบบย่อรูปให้อัตโนมัติ</small>
      </div>
      <div className="switch-row"><div><b>เปิดแสดงบน LINE</b><p>ปิดไว้ก่อนได้ ถ้ายังไม่อยากให้ลูกค้าเห็น</p></div><Switch checked={!!form.active} onCheckedChange={v=>setForm({...form,active:v})}/></div>
      <div className="actions"><button type="button" className="secondary" disabled={saving} onClick={()=>setForm(null)}>ยกเลิก</button><button type="button" disabled={saving||uploading||!form.title.trim()} onClick={async()=>{if(await save(form))setForm(null)}}>{saving?'กำลังบันทึก…':'บันทึกโปรโมชั่น'}</button></div>
    </div>}
    {list.length>0&&<ul className="promo-list">{list.map((p:any)=><li key={p.id} className={p.active?'':'is-off'}>
      {p.image?<img src={'/api/files/'+p.image} alt=""/>:<div className="promo-image-empty">ไม่มีรูป</div>}
      <div><b>{p.title}</b>{p.body&&<p>{p.body}</p>}<small>{p.active?'แสดงบน LINE':'ปิดอยู่'}</small></div>
      <div className="promo-actions">
        <Switch checked={!!p.active} aria-label={'เปิด/ปิด '+p.title} onCheckedChange={v=>save({...p,active:v})}/>
        <button type="button" className="secondary small" onClick={()=>setForm({...p,image:p.image||'',active:!!p.active})}>แก้ไข</button>
        <button type="button" className="secondary small danger" onClick={()=>{if(confirm('ลบโปรโมชั่น “'+p.title+'”?'))act('promotionDelete',{id:p.id,requestId:crypto.randomUUID()})}}>ลบ</button>
      </div>
    </li>)}</ul>}
    {!list.length&&!form&&<p className="muted">ยังไม่มีโปรโมชั่น</p>}
  </div>;
}
