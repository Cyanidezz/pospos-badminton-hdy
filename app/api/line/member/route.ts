import {lineMembersReady,memberView,readMemberToken,registerLineMember} from '@/lib/line-member';

// The LINE member page's data (app/line/member). Public - a customer isn't logged in to the website - but every
// request carries the signed token from the LINE chat button (see lib/line-member.ts), which names the LINE account;
// without a valid, unexpired one nothing is read or written.
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
const fail=(error:string,status=400)=>Response.json({error},{status,headers});

export async function GET(req:Request){
  const lineUser=readMemberToken(new URL(req.url).searchParams.get('t'));
  if(!lineUser)return fail('ลิงก์หมดอายุหรือไม่ถูกต้อง กรุณากด “บัตรสมาชิก” ใน LINE ของร้านอีกครั้ง',401);
  if(!(await lineMembersReady()))return fail('ระบบสมาชิกผ่าน LINE ยังไม่พร้อมใช้งาน',503);
  return Response.json(await memberView(lineUser),{headers});
}

export async function POST(req:Request){
  try{
    if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return fail('คำขอไม่ถูกต้อง',403);
    const b:any=await req.json().catch(()=>({}));
    const lineUser=readMemberToken(b.t);
    if(!lineUser)return fail('ลิงก์หมดอายุหรือไม่ถูกต้อง กรุณากด “บัตรสมาชิก” ใน LINE ของร้านอีกครั้ง',401);
    if(!(await lineMembersReady()))return fail('ระบบสมาชิกผ่าน LINE ยังไม่พร้อมใช้งาน',503);
    const result=await registerLineMember({lineUser,name:String(b.name||''),phone:String(b.phone||'')});
    return Response.json({...result,view:await memberView(lineUser)},{headers});
  }catch(e:any){return fail(e.message||'บันทึกไม่สำเร็จ')}
}
