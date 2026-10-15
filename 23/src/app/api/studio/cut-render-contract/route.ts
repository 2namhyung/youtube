import {guard,failure} from '../../../../../visualmaker/core/http.ts';
import {currentPlanForCanonical,evaluateCanonicalCut} from '../../../../../visualmaker/core/canonical-cut-render.ts';
import {StoreError} from '../../../../../visualmaker/core/store.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:Request){
  try{
    guard(request);
    const params=new URL(request.url).searchParams;
    if([...params.keys()].some(key=>!['id','baseRevision','sceneId'].includes(key)))throw new StoreError('컷 계약 요청에 허용되지 않은 항목이 있습니다.');
    const id=params.get('id')||'';const revision=Number(params.get('baseRevision'));const sceneId=params.get('sceneId')||'';
    const plan=currentPlanForCanonical(id,revision);
    const report=await evaluateCanonicalCut(plan,sceneId);
    return Response.json({report},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
