'use client';
import {toast} from 'sonner';

// Shown when a customer pays by transfer: the shop's QR code (large) and account details.
// The amount is already shown big at the top of the payment dialog, so it is not repeated here.
// `qrSrc` overrides where the QR image loads from - the staff dialog uses the authenticated /api/files/[id],
// the public tracking page passes the unauthenticated /api/track/bank-qr instead.
export function BankTransfer({config,qrSrc}:any){
  const qr=config?.bank_qr,no=config?.bank_account_no,name=config?.bank_account_name,bank=config?.bank_name;
  if(!qr&&!no)return <p className="muted">ยังไม่ได้ตั้งค่าบัญชีรับโอนเงิน เจ้าของร้านตั้งค่าได้ที่หน้า “ตั้งค่าร้าน”</p>;
  const copy=async()=>{try{await navigator.clipboard.writeText(String(no).replace(/[^0-9]/g,''));toast.success('คัดลอกเลขที่บัญชีแล้ว')}catch{toast.error('คัดลอกไม่สำเร็จ')}};
  // Two blocks so the payment dialog can put the QR in its own column and keep the account details with the fields.
  return <>
    {qr&&<div className="bank-qr-card"><img className="bank-qr" src={qrSrc||('/api/files/'+qr)} alt="QR โอนเงินของร้าน"/></div>}
    {(bank||name||no)&&<div className="bank-info-card">
      {bank&&<span className="bank-bank">{bank}</span>}
      {name&&<b className="bank-name">{name}</b>}
      {no&&<div className="bank-no"><code>{no}</code><button type="button" className="secondary small" onClick={copy}>คัดลอก</button></div>}
    </div>}
  </>;
}
