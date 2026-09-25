import {auth,owner,db,runtime} from '@/lib/server';
import {RICH_MENU_IMAGE,RICH_MENU_NAME,richMenuBody} from '@/lib/line-richmenu';

// Installs (or re-installs) the shop's rich menu on the LINE OA: create it, upload public/line-richmenu.jpg, make it
// the default for every follower, then remove any older copy this app made. The Facebook link and phone number it
// opens are saved as the shop's contact details too, so the tracking page, promotion cards and menu always agree.
export const dynamic='force-dynamic';

const line=(path:string,init:RequestInit={},host='api.line.me')=>fetch(`https://${host}/v2/bot/${path}`,{...init,headers:{Authorization:`Bearer ${runtime().LINE_CHANNEL_ACCESS_TOKEN}`,...(init.headers||{})}});
async function fail(response:Response,step:string){
  const detail=(await response.text().catch(()=>'')).slice(0,300);
  console.error('LINE rich menu '+step+' failed',response.status,detail);
  throw new Error(response.status===401?'Channel access token ไม่ถูกต้องหรือหมดอายุ':`LINE ตอบกลับไม่สำเร็จตอน${step} (${response.status})`);
}

export async function POST(req:Request){
  try{
    if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)throw new Error('คำขอไม่ถูกต้อง');
    const me=await auth();owner(me);
    if(!runtime().LINE_CHANNEL_ACCESS_TOKEN)throw new Error('ยังไม่ได้ตั้งค่า LINE Channel access token');
    const b:any=await req.json();
    const facebook=String(b.facebook||'').trim(),phone=String(b.phone||'').trim();
    if(!/^https:\/\/\S+$/.test(facebook)||facebook.length>300)throw new Error('ลิงก์ Facebook ต้องขึ้นต้นด้วย https://');
    const digits=phone.replace(/[^0-9]/g,'');
    if(digits.length<9||digits.length>10||!/^[0-9+\-\s()]*$/.test(phone))throw new Error('เบอร์โทรไม่ถูกต้อง');
    const body=richMenuBody({facebook,phone});
    let r=await line('richmenu',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!r.ok)await fail(r,'สร้างเมนู');
    const {richMenuId}=await r.json();
    const image=await fetch(new URL(RICH_MENU_IMAGE,req.url));
    if(!image.ok)throw new Error('โหลดรูปเมนูไม่สำเร็จ');
    r=await line(`richmenu/${richMenuId}/content`,{method:'POST',headers:{'Content-Type':'image/jpeg'},body:await image.arrayBuffer()},'api-data.line.me');
    if(!r.ok){await line(`richmenu/${richMenuId}`,{method:'DELETE'});await fail(r,'อัปโหลดรูป');}
    r=await line(`user/all/richmenu/${richMenuId}`,{method:'POST'});
    if(!r.ok)await fail(r,'ตั้งเป็นเมนูหลัก');
    // Clean up menus left over from earlier installs (only ones this app created - matched by name).
    const list=await line('richmenu/list');
    if(list.ok)for(const m of (await list.json()).richmenus||[])if(m.name===RICH_MENU_NAME&&m.richMenuId!==richMenuId)await line(`richmenu/${m.richMenuId}`,{method:'DELETE'});
    await db().prepare('UPDATE config SET contact_facebook=?,contact_phone=? WHERE id=1').bind(facebook,phone).run();
    return Response.json({ok:true,richMenuId});
  }catch(e:any){return Response.json({error:e.message},{status:400});}
}
