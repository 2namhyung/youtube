import {guard,failure} from '../../../../../../visualmaker/core/http';
import {artifactFile} from '../../../../../../visualmaker/core/jobs';
import type {ArtifactName} from '../../../../../../visualmaker/core/jobs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{
    guard(request);
    const query=new URL(request.url).searchParams;
    const name=query.get('name') as ArtifactName;
    const {bytes}=artifactFile(query.get('jobId')||'',name);
    return new Response(bytes,{headers:{
      'Content-Type':name==='scenes.csv'?'text/csv; charset=utf-8':'application/json; charset=utf-8',
      'Content-Disposition':`attachment; filename="${name}"`,
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'none'; sandbox",
    }});
  }catch(error){return failure(error);}
}
