import {guard,failure} from '../../../../../visualmaker/core/http.ts';
import {evaluateAudioAssembly,audioAssemblyFingerprintsStillMatch} from '../../../../../visualmaker/core/audio-assembly.ts';
import {StoreError} from '../../../../../visualmaker/core/store.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{
    guard(request);const query=new URL(request.url).searchParams;
    if([...query.keys()].some(key=>!['projectId','baseRevision'].includes(key)))throw new StoreError('오디오 조립 요청 범위가 올바르지 않습니다.');
    const projectId=query.get('projectId')??'',revision=query.get('baseRevision')??'';
    if(!/^plan-[a-f0-9-]{36}$/u.test(projectId)||!/^[1-9]\d*$/u.test(revision)||!Number.isSafeInteger(Number(revision)))throw new StoreError('프로젝트·리비전이 올바르지 않습니다.');
    const report=await evaluateAudioAssembly(projectId,Number(revision));
    if(!audioAssemblyFingerprintsStillMatch(report))throw new StoreError('오디오 조립 준비 상태를 읽는 중 입력이 변경됐습니다.',409);
    const body=JSON.stringify({report});if(Buffer.byteLength(body)>5_000_000)throw new StoreError('오디오 조립 준비 응답이 너무 큽니다.',413);
    return new Response(body,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Visualmaker-Schema':report.schemaVersion,'X-Visualmaker-Production-Authority':'false'}});
  }catch(error){return failure(error);}
}
