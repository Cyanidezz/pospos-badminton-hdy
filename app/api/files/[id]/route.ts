import {auth,one} from '@/lib/server';
// A file id never gets new content (every upload is a new id), so the browser may keep it for good - opening a
// product list or a job again doesn't download its pictures again.
import {createSupabaseAdminClient} from '@/lib/supabase/admin';
export async function GET(req:Request,{params}:any){try{await auth();const {id}=await params,f:any=await one('SELECT * FROM files WHERE id=?',id);if(!f)return new Response('Not found',{status:404});const {data,error}=await createSupabaseAdminClient().storage.from('wingpro-files').download(id);if(error||!data)return new Response('Not found',{status:404});return new Response(await data.arrayBuffer(),{headers:{'Content-Type':f.mime,'Cache-Control':'private, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});}catch{return new Response('Forbidden',{status:403});}}
