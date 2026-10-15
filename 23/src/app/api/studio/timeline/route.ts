import {guard,failure} from '../../../../../visualmaker/core/http.ts';
import {StoreError} from '../../../../../visualmaker/core/store.ts';
import {buildTimelineInspection,timelineStillCurrent} from '../../../../../visualmaker/core/timeline-inspection.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:Request){
  try{
    guard(request);
    const query=new URL(request.url).searchParams;
    if([...query.keys()].some(key=>!['id','baseRevision','format'].includes(key)))throw new StoreError('타임라인 요청 범위가 올바르지 않습니다.');
    const id=query.get('id')??'',revision=query.get('baseRevision')??'',format=query.get('format');
    if(!/^plan-[a-f0-9-]{36}$/.test(id)||!/^[1-9]\d*$/.test(revision)||!Number.isSafeInteger(Number(revision))||
      (format!==null&&format!=='download'))throw new StoreError('프로젝트·리비전 또는 다운로드 형식이 올바르지 않습니다.');
    const report=await buildTimelineInspection(id,Number(revision));
    if(!timelineStillCurrent(report))throw new StoreError('타임라인을 읽는 중 계획 또는 제작 명세가 변경됐습니다. 다시 확인하세요.',409);
    const body=JSON.stringify(report);
    if(Buffer.byteLength(body)>1_000_000)throw new StoreError('타임라인 응답이 크기 제한을 넘었습니다.',413);
    const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff','X-Visualmaker-Schema':report.schemaVersion,
      'X-Visualmaker-Project-Id':report.scope.projectId,'X-Visualmaker-Revision':String(report.scope.revision),
      'X-Visualmaker-Script-Sha256':report.scope.scriptSha256,'X-Visualmaker-Snapshot-Sha256':report.scope.snapshotSha256,
      'X-Visualmaker-Episode-Spec-Sha256':report.scope.episodeSpecSha256,
      'X-Visualmaker-Production-State-Sha256':report.scope.productionStateSha256,
      'X-Visualmaker-Production-Authority':'false'};
    if(format==='download')headers['Content-Disposition']=`attachment; filename="timeline-inspection-${report.episodeId}-r${report.scope.revision}.json"`;
    return new Response(body,{headers});
  }catch(error){return failure(error);}
}
