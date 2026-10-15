import {guard,failure} from '../../../../../visualmaker/core/http.ts';
import {evaluateFinalization} from '../../../../../visualmaker/core/finalization.ts';
import {StoreError} from '../../../../../visualmaker/core/store.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{
    guard(request);const query=new URL(request.url).searchParams;
    if([...query.keys()].some(key=>!['projectId','baseRevision'].includes(key)))throw new StoreError('최종화 확인 요청 범위가 올바르지 않습니다.');
    const projectId=query.get('projectId')||'',baseRevision=Number(query.get('baseRevision'));
    if(!/^plan-[a-f0-9-]{36}$/u.test(projectId)||!Number.isSafeInteger(baseRevision)||baseRevision<1)throw new StoreError('최종화 확인 요청 범위가 올바르지 않습니다.');
    const report=await evaluateFinalization(projectId,baseRevision);
    return Response.json({readiness:{schemaVersion:report.schemaVersion,scope:report.scope,composition:report.composition,validators:report.validators,blockers:report.blockers.map(blocker=>({code:blocker.code,detail:'제작 입력 또는 승인을 확인하세요.'})),renderEligible:report.renderEligible,productionAuthority:false,reviewApproved:false}},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error instanceof StoreError?new StoreError('최종화 확인을 완료하지 못했습니다.',error.status):new StoreError('최종화 확인을 완료하지 못했습니다.',409));}
}
