import {one} from '@/lib/server';
import {createSupabaseAdminClient} from '@/lib/supabase/admin';

// A picture LINE shows customers, public and unauthenticated (LINE's servers fetch it, with no login) - but only
// while an ACTIVE promotion or the "ราคาขึ้นเอ็น" setting actually uses that file, so this can't be used to read any
// other upload.
export const dynamic='force-dynamic';

export async function GET(_req:Request,{params}:any){
  try{
    const {id}=await params;
    const fileId=String(id).slice(0,80);
    const ready:any=await one("SELECT to_regclass('public.promotions') AS t,EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='config' AND column_name='string_price_image') AS price");
    const f:any=(ready?.t?await one('SELECT f.mime FROM promotions p JOIN files f ON f.id=p.image WHERE p.image=? AND p.active=1 LIMIT 1',fileId):null)
      ||(ready?.price?await one("SELECT f.mime FROM config c JOIN files f ON f.id=to_jsonb(c)->>'string_price_image' WHERE c.id=1 AND f.id=?",fileId):null);
    if(!f)return new Response('Not found',{status:404});
    const {data,error}=await createSupabaseAdminClient().storage.from('wingpro-files').download(id);
    if(error||!data)return new Response('Not found',{status:404});
    return new Response(await data.arrayBuffer(),{headers:{'Content-Type':f.mime,'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
  }catch{return new Response('Not found',{status:404});}
}
