import {auth,owner,all,one} from '@/lib/server';

// The owner's list of LINE promotions (ตั้งค่าร้าน). Kept out of /api/data so the main snapshot stays one round trip
// and a not-yet-run migration only affects this panel: {promotions:null} means the table doesn't exist yet.
export const dynamic='force-dynamic';

export async function GET(){
  try{
    const me=await auth();owner(me);
    const ready:any=await one("SELECT to_regclass('public.promotions') AS t");
    const promotions=ready?.t?await all('SELECT id,title,body,image,active,created FROM promotions ORDER BY created DESC'):null;
    return Response.json({promotions},{headers:{'Cache-Control':'no-store'}});
  }catch(e:any){return Response.json({error:e.message},{status:403});}
}
