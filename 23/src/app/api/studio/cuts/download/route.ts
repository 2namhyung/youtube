import {guard,failure} from '../../../../../../visualmaker/core/http.ts';
import {canonicalArtifactFile} from '../../../../../../visualmaker/core/jobs.ts';
import {StoreError} from '../../../../../../visualmaker/core/store.ts';

export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{guard(request);const params=new URL(request.url).searchParams;
    if([...params.keys()].some(key=>!['jobId','projectId','sceneId','attempt','name'].includes(key)))throw new StoreError('컷 파일 요청 범위가 올바르지 않습니다.');
    const name=params.get('name');if(name!=='provisional-cut.mp4'&&name!=='provisional-cut.json')throw new StoreError('컷 파일 이름이 올바르지 않습니다.');
    const scope={projectId:params.get('projectId')||'',sceneId:params.get('sceneId')||'',attempt:Number(params.get('attempt'))};
    if(!Number.isSafeInteger(scope.attempt)||scope.attempt<1)throw new StoreError('시도 번호가 올바르지 않습니다.');
    const {job,bytes}=await canonicalArtifactFile(params.get('jobId')||'',name,scope);
    return new Response(bytes,{headers:{'Content-Type':name.endsWith('.mp4')?'video/mp4':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`attachment; filename="${name}"`,'X-Visualmaker-Project-Id':job.projectId,'X-Visualmaker-Job-Id':job.id,'X-Visualmaker-Scene-Id':scope.sceneId,'X-Visualmaker-Attempt':String(job.attempt)}});
  }catch(error){return failure(error);}
}
