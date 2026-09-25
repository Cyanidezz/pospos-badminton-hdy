import {one} from '@/lib/server';
import {createSupabaseAdminClient} from '@/lib/supabase/admin';

// A promotion's picture, public and unauthenticated (LINE's servers fetch it to show the Flex card, with no login)
// - but only while an ACTIVE promotion actually uses that file, so this can't be used to read any other upload.
export const dynamic='force-dynamic';

export async function GET(_req:Request,{params}:any){
  try{
    const {id}=await params;
    const ready:any=await one("SELECT to_regclass('public.promotions') AS t");
    if(!ready?.t)return new Response('Not found',{status:404});
    const f:any=await one('SELECT f.mime FROM promotions p JOIN files f ON f.id=p.image WHERE p.image=? AND p.active=1 LIMIT 1',String(id).slice(0,80));
    if(!f)return new Response('Not found',{status:404});
    const {data,error}=await createSupabaseAdminClient().storage.from('wingpro-files').download(id);
    if(error||!data)return new Response('Not found',{status:404});
    return new Response(await data.arrayBuffer(),{headers:{'Content-Type':f.mime,'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
  }catch{return new Response('Not found',{status:404});}
}
