import {one} from '@/lib/server';
import {createSupabaseAdminClient} from '@/lib/supabase/admin';

// The shop's own bank transfer QR, public and unauthenticated (unlike /api/files/[id]) - it's meant for any
// customer to scan, the same code already shown to walk-in customers at checkout. Not tied to a job/token:
// there is only ever one, set from "ตั้งค่าร้าน".
export const dynamic='force-dynamic';

export async function GET(){
  try{
    const config:any=await one('SELECT bank_qr FROM config WHERE id=1');
    if(!config?.bank_qr)return new Response('Not found',{status:404});
    const f:any=await one('SELECT mime FROM files WHERE id=?',config.bank_qr);
    if(!f)return new Response('Not found',{status:404});
    const {data,error}=await createSupabaseAdminClient().storage.from('wingpro-files').download(config.bank_qr);
    if(error||!data)return new Response('Not found',{status:404});
    return new Response(await data.arrayBuffer(),{headers:{'Content-Type':f.mime,'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
  }catch{return new Response('Not found',{status:404});}
}
