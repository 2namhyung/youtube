import {guard,failure} from '../../../../../visualmaker/core/http';
import {buildPreviewReadiness,readPreviewPlan} from '../../../../../visualmaker/core/preview-readiness';
import {StoreError} from '../../../../../visualmaker/core/store';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:Request){
  try{
    guard(request);
    const query=new URL(request.url).searchParams;
    const id=query.get('id');const revision=query.get('baseRevision');
    if(!id||revision===null||!/^(0|[1-9]\d*)$/.test(revision)||!Number.isSafeInteger(Number(revision)))
      throw new StoreError('프로젝트 ID와 정확한 리비전이 필요합니다.');
    const plan=readPreviewPlan(id,Number(revision));
    return Response.json(buildPreviewReadiness(plan),{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
