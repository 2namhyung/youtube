import {guard, failure, readJson} from '../../../../../../visualmaker/core/http';
import {getProject, saveNarrationTiming, StoreError} from '../../../../../../visualmaker/core/store';
import {narrationTimingReport, serializeSubtitleDraft, TimingError} from '../../../../../../visualmaker/core/narration-timing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    guard(request);
    const query = new URL(request.url).searchParams;
    const plan = getProject(query.get('id') ?? '');
    const format=query.get('format');
    const takeId=query.get('takeId')??'';
    if(format==='srt'||format==='vtt'){
      const baseRevision=Number(query.get('baseRevision'));
      if(!query.has('baseRevision')||!Number.isSafeInteger(baseRevision)||baseRevision!==plan.revision)
        throw new StoreError('프로젝트 리비전이 바뀌었습니다. 최신 시간 초안을 다시 확인하세요.',409);
      const take=(plan.narrationTakes??[]).find(item=>item.id===takeId);
      if(!take)throw new StoreError('녹음을 찾을 수 없습니다.',404);
      const timing=(plan.narrationTimings??[]).find(item=>item.id===query.get('timingId')&&item.takeId===take.id);
      if(!timing)throw new StoreError('저장된 시간 초안을 찾을 수 없습니다.',404);
      let body:string;
      try{body=serializeSubtitleDraft(plan,take,timing,format);}
      catch(error){if(error instanceof TimingError)throw new StoreError(error.message,409);throw error;}
      return new Response(body,{headers:{'Content-Type':format==='srt'?'application/x-subrip; charset=utf-8':'text/vtt; charset=utf-8',
        'Content-Disposition':`attachment; filename="subtitle-draft-${timing.id}.${format}"`,
        'Content-Length':String(Buffer.byteLength(body,'utf8')),'Cache-Control':'no-store',
        'X-Visualmaker-Schema':'visualmaker-subtitle-draft-v1','X-Visualmaker-Project-Id':plan.id,
        'X-Visualmaker-Revision':String(plan.revision),'X-Visualmaker-Take-Id':take.id,
        'X-Visualmaker-Timing-Id':timing.id,'X-Visualmaker-Script-Sha256':plan.script.rawSha256,
        'X-Visualmaker-Audio-Sha256':take.sha256,'X-Visualmaker-Production-Authority':'false'}});
    }
    const report = narrationTimingReport(plan,takeId);
    if (format === 'json') {
      const timing = (plan.narrationTimings ?? []).find(item => item.id === query.get('timingId') && item.takeId === report.take.id);
      if (!timing) throw new StoreError('저장된 시간 초안을 찾을 수 없습니다.', 404);
      return Response.json({exportKind:'provisional-narration-timing-draft', timing, productionAuthority:false},
        {headers:{'Cache-Control':'no-store', 'Content-Disposition':`attachment; filename="${timing.id}.json"`}});
    }
    if (query.has('format')) throw new StoreError('지원하지 않는 시간 초안 형식입니다.');
    return Response.json(report, {headers:{'Cache-Control':'no-store'}});
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    guard(request);
    const body = await readJson(request);
    const fields = new Set(['id', 'baseRevision', 'takeId', 'scriptSha256', 'audioSha256', 'segments', 'manualReviewConfirmed']);
    if (Object.keys(body).some(key => !fields.has(key)) || [...fields].some(key => !Object.hasOwn(body, key)))
      throw new StoreError('시간 초안 요청 필드가 올바르지 않습니다.');
    if (typeof body.id !== 'string' || typeof body.takeId !== 'string' ||
        typeof body.baseRevision !== 'number' || !Number.isInteger(body.baseRevision) ||
        typeof body.scriptSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(body.scriptSha256) ||
        typeof body.audioSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(body.audioSha256) ||
        body.manualReviewConfirmed!==true)
      throw new StoreError('프로젝트·녹음·대본 결속을 확인하세요.');
    const result = saveNarrationTiming(body.id, body.baseRevision, body.takeId,
      body.scriptSha256, body.audioSha256, body.segments, true);
    return Response.json(result, {status:201, headers:{'Cache-Control':'no-store'}});
  } catch (error) { return failure(error); }
}
