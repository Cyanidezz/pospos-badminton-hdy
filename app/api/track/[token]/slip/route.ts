import {all,one,saveUploadedFile} from '@/lib/server';

// A customer attaches their transfer slip from the public tracking page - no login, scoped only to their own
// job by its (long, unguessable) token. This never marks the job paid; staff still confirm it themselves.
export const dynamic='force-dynamic';

export async function POST(req:Request,{params}:any){
  try{
    if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)throw new Error('คำขอไม่ถูกต้อง');
    const ready=await one("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='jobs' AND column_name='slip'");
    if(!ready)throw new Error('ระบบแนบสลิปยังไม่พร้อมใช้งาน กรุณาติดต่อร้านโดยตรง');
    const {token}=await params;
    const job:any=await one('SELECT id,status,paid,staff_id FROM jobs WHERE token=?',token);
    if(!job)throw new Error('ไม่พบใบรับไม้');
    if(job.status==='ยกเลิก')throw new Error('งานนี้ถูกยกเลิกแล้ว');
    if(job.paid)throw new Error('ชำระเงินแล้ว ไม่ต้องอัปโหลดสลิปอีก');
    const form=await req.formData(),file=form.get('file');
    if(!(file instanceof File))throw new Error('ไม่พบไฟล์');
    const {id}=await saveUploadedFile(file,job.staff_id);
    const rows=await all('UPDATE jobs SET slip=? WHERE token=? AND paid=0 RETURNING id',id,token);
    if(!rows.length)throw new Error('บันทึกสลิปไม่สำเร็จ งานนี้อาจชำระเงินไปแล้ว');
    return Response.json({ok:true});
  }catch(e:any){return Response.json({error:e.message},{status:400});}
}
