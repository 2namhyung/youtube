import {readFileSync} from 'node:fs';
import {guard,failure} from '../../../../../visualmaker/core/http';
import {getProject,verifyAssets,assetFile} from '../../../../../visualmaker/core/store';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{
    guard(request);
    const query=new URL(request.url).searchParams;
    const plan=getProject(query.get('id')||'');
    const asset=plan.assets.find(a=>a.id===query.get('assetId'));
    if(!asset)return Response.json({error:'등록 자료를 찾을 수 없습니다.'},{status:404});
    verifyAssets({...plan,assets:[asset]});
    const allowed=['image/png','image/jpeg','image/webp','video/mp4','video/webm','text/plain'];
    if(!allowed.includes(asset.mimeType))throw new Error('표시할 수 없는 파일 형식입니다.');
    return new Response(readFileSync(assetFile(asset.path)),{headers:{'Content-Type':asset.mimeType,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
  }catch(error){return failure(error);}
}
