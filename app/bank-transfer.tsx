'use client';
import {toast} from 'sonner';

// Shown when a customer pays by transfer: the shop's QR code and account details.
export function BankTransfer({config,amountText}:any){
  const qr=config?.bank_qr,no=config?.bank_account_no,name=config?.bank_account_name,bank=config?.bank_name;
  if(!qr&&!no)return <p className="muted">ยังไม่ได้ตั้งค่าบัญชีรับโอนเงิน เจ้าของร้านตั้งค่าได้ที่หน้า “ตั้งค่าร้าน”</p>;
  const copy=async()=>{try{await navigator.clipboard.writeText(String(no).replace(/[^0-9]/g,''));toast.success('คัดลอกเลขที่บัญชีแล้ว')}catch{toast.error('คัดลอกไม่สำเร็จ')}};
  return <div className="bank-card">
    {qr&&<img className="bank-qr" src={'/api/files/'+qr} alt="QR โอนเงินของร้าน"/>}
    <div className="bank-info">
      {amountText&&<div className="bank-amount"><span>ยอดที่ต้องโอน</span><b>฿{amountText}</b></div>}
      {bank&&<span className="bank-bank">{bank}</span>}
      {name&&<b className="bank-name">{name}</b>}
      {no&&<div className="bank-no"><code>{no}</code><button type="button" className="secondary small" onClick={copy}>คัดลอก</button></div>}
    </div>
  </div>;
}
