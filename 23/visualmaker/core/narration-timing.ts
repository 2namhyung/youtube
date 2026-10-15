import {randomUUID} from 'node:crypto';
import type {NarrationTake, NarrationTiming, NarrationTimingSegment, Plan, Segment} from './model.ts';

export class TimingError extends Error {
  status = 400;
}

function narrationSegments(plan: Plan) {
  const segments = plan.script.segments.filter(segment => segment.kind === 'narration');
  if (!segments.length) throw new TimingError('시간을 지정할 내레이션 문단이 없습니다.');
  return segments;
}

function textWeight(segment: Segment) { return [...segment.text].filter(point => !/\s/u.test(point)).length; }

export function estimateNarrationTiming(plan: Plan, take: NarrationTake) {
  if (take.scriptSha256 !== plan.script.rawSha256) throw new TimingError('이 녹음은 현재 대본과 다릅니다. 대본에 맞는 녹음을 선택하세요.');
  const segments = narrationSegments(plan);
  const weights = segments.map(textWeight);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) throw new TimingError('내레이션 텍스트에서 시간 비율을 계산할 수 없습니다.');
  let elapsed = 0;
  const ranges: NarrationTimingSegment[] = segments.map((segment, index) => {
    const startSeconds = elapsed;
    elapsed = index === segments.length - 1 ? take.durationSeconds : take.durationSeconds * weights.slice(0, index + 1).reduce((sum, weight) => sum + weight, 0) / total;
    return {segmentId:segment.id, start:segment.start, end:segment.end, text:segment.text, startSeconds, endSeconds:elapsed};
  });
  if (ranges.some(range => range.endSeconds <= range.startSeconds)) throw new TimingError('녹음 길이가 너무 짧아 모든 문단에 양수 시간을 배정할 수 없습니다.');
  return {method:'text-weighted-estimate' as const, saved:false as const, observedSpeech:false as const,
    productionAuthority:false as const, durationSeconds:take.durationSeconds, segments:ranges};
}

export function narrationTimingReport(plan: Plan, takeId: string) {
  const take = (plan.narrationTakes ?? []).find(item => item.id === takeId);
  if (!take) throw new TimingError('녹음을 찾을 수 없습니다.');
  const currentScriptMatch = take.scriptSha256 === plan.script.rawSha256;
  const history = (plan.narrationTimings ?? []).filter(item => item.takeId === take.id).slice().reverse();
  const currentSegments = plan.script.segments.filter(segment => segment.kind === 'narration');
  const matchesCurrent = (item: NarrationTiming) => item.scriptSha256 === plan.script.rawSha256 && item.audioSha256 === take.sha256 &&
    item.segments.length === currentSegments.length && item.segments.every((segment, i) =>
      segment.segmentId === currentSegments[i].id && segment.start === currentSegments[i].start &&
      segment.end === currentSegments[i].end && segment.text === currentSegments[i].text);
  const current = currentScriptMatch ? history.find(matchesCurrent) ?? null : null;
  return {projectId:plan.id, revision:plan.revision, scriptSha256:plan.script.rawSha256,
    take, currentScriptMatch, current, history:history.map(item => ({...item, currentScriptMatch:matchesCurrent(item)})),
    estimate:current || !currentScriptMatch ? null : estimateNarrationTiming(plan, take),
    productionAuthority:false as const};
}

export function createManualTimingDraft(plan: Plan, take: NarrationTake, input: unknown, manualReviewConfirmed: boolean): NarrationTiming {
  if(manualReviewConfirmed!==true)throw new TimingError('녹음을 들으며 문단 구간을 수동 확인했다는 표시가 필요합니다.');
  if (!Array.isArray(input)) throw new TimingError('문단별 시작·끝 시간을 입력하세요.');
  const expected = narrationSegments(plan);
  if (input.length !== expected.length) throw new TimingError('현재 대본의 모든 내레이션 문단에 시간을 입력하세요.');
  let previousEnd = 0;
  const ranges: NarrationTimingSegment[] = input.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TimingError('시간 입력은 문단별 객체여야 합니다.');
    const item = value as Record<string, unknown>;
    const keys = Object.keys(item);
    if (keys.length !== 3 || keys.some(key => !['segmentId', 'startSeconds', 'endSeconds'].includes(key)))
      throw new TimingError('시간 입력에는 문단 ID와 시작·끝 초만 사용할 수 있습니다.');
    const segment = expected[index];
    if (item.segmentId !== segment.id) throw new TimingError('문단 순서 또는 ID가 현재 대본과 다릅니다.');
    const startSeconds = item.startSeconds; const endSeconds = item.endSeconds;
    if (typeof startSeconds !== 'number' || !Number.isFinite(startSeconds) ||
        typeof endSeconds !== 'number' || !Number.isFinite(endSeconds) ||
        startSeconds < 0 || endSeconds <= startSeconds || startSeconds < previousEnd || endSeconds > take.durationSeconds)
      throw new TimingError('시작·끝 시간은 녹음 길이 안의 양수 구간이어야 하며 서로 겹칠 수 없습니다.');
    previousEnd = endSeconds;
    return {segmentId:segment.id, start:segment.start, end:segment.end, text:segment.text, startSeconds, endSeconds};
  });
  return {id:`timing_${randomUUID()}`, projectId:plan.id, capturedRevision:plan.revision,
    takeId:take.id, audioSha256:take.sha256, scriptSha256:plan.script.rawSha256, createdAt:new Date().toISOString(),
    method:'manual-timing-draft', reviewStatus:'draft', manualReviewConfirmed:true,manualReviewConfirmedAt:new Date().toISOString(),
    productionAuthority:false, segments:ranges};
}

function subtitleText(value:string){
  const normalized=value.replace(/\r\n/g,'\n');
  if(!normalized.trim()||/[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u2028\u2029\uFEFF]/u.test(normalized)||
    normalized.split('\n').some(line=>!line.trim()))
    throw new TimingError('자막 문단에 지원하지 않는 제어 문자 또는 빈 줄이 있습니다. 대본은 바꾸지 않고 JSON 초안으로 확인하세요.');
  return normalized.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function clock(milliseconds:number,separator:','|'.'){
  const hours=Math.floor(milliseconds/3_600_000);const minutes=Math.floor(milliseconds%3_600_000/60_000);
  const seconds=Math.floor(milliseconds%60_000/1000);const milli=milliseconds%1000;
  return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}${separator}${String(milli).padStart(3,'0')}`;
}

/** Deterministic, paragraph-level plaintext draft. Never derives word timing or review authority. */
export function serializeSubtitleDraft(plan:Plan,take:NarrationTake,timing:NarrationTiming,format:'srt'|'vtt'){
  if(!['srt','vtt'].includes(format))throw new TimingError('지원하지 않는 자막 형식입니다.');
  if(timing.manualReviewConfirmed!==true||!timing.manualReviewConfirmedAt)
    throw new TimingError('이전 시간 초안은 수동 구간 확인 기록이 없습니다. 녹음을 다시 확인해 새 초안을 저장하세요.');
  if(timing.projectId!==plan.id||timing.takeId!==take.id||timing.scriptSha256!==plan.script.rawSha256||
    timing.audioSha256!==take.sha256||take.scriptSha256!==plan.script.rawSha256)
    throw new TimingError('대본·녹음·시간 초안의 현재 결속이 다릅니다.');
  const expected=narrationSegments(plan);
  if(timing.segments.length!==expected.length)throw new TimingError('현재 내레이션 문단 전체를 포함하지 않습니다.');
  const durationMs=Math.floor(take.durationSeconds*1000);
  if(!Number.isSafeInteger(durationMs)||durationMs<=0)throw new TimingError('녹음 길이를 밀리초로 확인할 수 없습니다.');
  let previousEnd=0;
  const cues=timing.segments.map((row,index)=>{
    const segment=expected[index];
    if(row.segmentId!==segment.id||row.start!==segment.start||row.end!==segment.end||row.text!==segment.text)
      throw new TimingError('시간 초안의 문단이 현재 대본과 다릅니다.');
    if(!Number.isFinite(row.startSeconds)||!Number.isFinite(row.endSeconds)||row.startSeconds<0||
      row.endSeconds<=row.startSeconds||row.endSeconds>take.durationSeconds)
      throw new TimingError('문단 시간이 녹음 길이와 맞지 않습니다.');
    const start=Math.round(row.startSeconds*1000),end=Math.round(row.endSeconds*1000);
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<previousEnd||end<=start||end>durationMs)
      throw new TimingError('밀리초 반올림 후 문단이 겹치거나 길이가 0이 되거나 녹음을 벗어납니다.');
    previousEnd=end;
    const times=`${clock(start,format==='srt'?',':'.')} --> ${clock(end,format==='srt'?',':'.')}`;
    return `${format==='srt'?`${index+1}\n`:''}${times}\n${subtitleText(row.text)}`;
  });
  const result=`${format==='vtt'?'WEBVTT\n\n':''}${cues.join('\n\n')}\n`;
  if(Buffer.byteLength(result,'utf8')>1_000_000)throw new TimingError('자막 초안이 내보내기 크기를 넘습니다.');
  return result;
}
