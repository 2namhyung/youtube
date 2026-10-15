import type {NarrationTake,NarrationTiming,NarrationTimingSegment,Plan} from '../../../visualmaker/core/model';
import type {NarrationScope} from './narration-client';

export type TimingEstimate={method:'text-weighted-estimate';saved:false;observedSpeech:false;productionAuthority:false;durationSeconds:number;segments:NarrationTimingSegment[]};
export type TimingHistory=NarrationTiming & {currentScriptMatch:boolean};
export type TimingReport={projectId:string;revision:number;scriptSha256:string;take:NarrationTake;currentScriptMatch:boolean;
  current:NarrationTiming|null;history:TimingHistory[];estimate:TimingEstimate|null;productionAuthority:false};
export type TimingInput={segmentId:string;startSeconds:number;endSeconds:number};

function object(value:unknown):value is Record<string,unknown>{return !!value && typeof value==='object' && !Array.isArray(value);}
function exact(value:Record<string,unknown>,keys:string[]){return Object.keys(value).length===keys.length && keys.every(key=>Object.hasOwn(value,key));}
function validRanges(rows:unknown):rows is NarrationTimingSegment[]{
  return Array.isArray(rows) && rows.every(row=>object(row) && exact(row,['segmentId','start','end','text','startSeconds','endSeconds']) &&
    typeof row.segmentId==='string' && typeof row.text==='string' && Number.isInteger(row.start) && Number.isInteger(row.end) &&
    typeof row.startSeconds==='number' && Number.isFinite(row.startSeconds) && typeof row.endSeconds==='number' && Number.isFinite(row.endSeconds) &&
    row.startSeconds>=0 && row.endSeconds>row.startSeconds && Number(row.end)>Number(row.start)) &&
    rows.every((row,index)=>index===0 || row.startSeconds>=rows[index-1].endSeconds);
}
function validTiming(value:unknown,plan:Plan,take:NarrationTake):value is NarrationTiming{
  if(!object(value))return false;
  const confirmed=Object.hasOwn(value,'manualReviewConfirmed');
  if(confirmed!==Object.hasOwn(value,'manualReviewConfirmedAt') ||
    !exact(value,['id','projectId','capturedRevision','takeId','audioSha256','scriptSha256','createdAt','method','reviewStatus','productionAuthority','segments',
      ...(confirmed?['manualReviewConfirmed','manualReviewConfirmedAt']:[])]))return false;
  if(confirmed && (value.manualReviewConfirmed!==true || typeof value.manualReviewConfirmedAt!=='string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.manualReviewConfirmedAt) ||
    Number.isNaN(Date.parse(value.manualReviewConfirmedAt)) ||
    new Date(value.manualReviewConfirmedAt).toISOString()!==value.manualReviewConfirmedAt))return false;
  return typeof value.id==='string' && value.projectId===plan.id && value.takeId===take.id && value.audioSha256===take.sha256 &&
    typeof value.scriptSha256==='string' && Number.isInteger(value.capturedRevision) && typeof value.createdAt==='string' &&
    value.method==='manual-timing-draft' && value.reviewStatus==='draft' && value.productionAuthority===false && validRanges(value.segments);
}
function matchesCurrentSegments(rows:NarrationTimingSegment[],plan:Plan){
  const current=plan.script.segments.filter(segment=>segment.kind==='narration');
  return rows.length===current.length && rows.every((row,index)=>row.segmentId===current[index].id && row.start===current[index].start && row.end===current[index].end && row.text===current[index].text);
}

export function validateTimingReport(value:unknown,plan:Plan,take:NarrationTake,scope:NarrationScope):TimingReport{
  if(!object(value) || !exact(value,['projectId','revision','scriptSha256','take','currentScriptMatch','current','history','estimate','productionAuthority']) ||
    value.projectId!==scope.projectId || value.revision!==scope.revision || value.scriptSha256!==scope.scriptSha256 || value.productionAuthority!==false ||
    !object(value.take) || value.take.id!==take.id || value.take.sha256!==take.sha256 || value.take.productionAuthority!==false ||
    value.currentScriptMatch!==(take.scriptSha256===scope.scriptSha256) || !Array.isArray(value.history))throw new Error('시간 초안 응답이 현재 프로젝트·녹음과 맞지 않습니다.');
  for(const row of value.history){
    if(!object(row) || !exact(row,['id','projectId','capturedRevision','takeId','audioSha256','scriptSha256','createdAt','method','reviewStatus','productionAuthority','segments','currentScriptMatch',
      ...(Object.hasOwn(row,'manualReviewConfirmed')?['manualReviewConfirmed','manualReviewConfirmedAt']:[])]))
      throw new Error('시간 초안 이력 형식이 올바르지 않습니다.');
    const {currentScriptMatch,...record}=row;
    if(!validTiming(record,plan,take) || typeof currentScriptMatch!=='boolean' ||
      currentScriptMatch!==(record.scriptSha256===scope.scriptSha256 && matchesCurrentSegments(record.segments,plan)))
      throw new Error('시간 초안 이력 결속을 확인할 수 없습니다.');
  }
  if(value.current!==null && (!validTiming(value.current,plan,take) || value.current.scriptSha256!==scope.scriptSha256 ||
    !matchesCurrentSegments(value.current.segments,plan) || !value.history.some(item=>object(item)&&item.id===(value.current as NarrationTiming).id && item.currentScriptMatch===true)))
    throw new Error('현재 시간 초안 결속을 확인할 수 없습니다.');
  if(value.estimate!==null){
    const estimate=value.estimate;
    if(!object(estimate) || !exact(estimate,['method','saved','observedSpeech','productionAuthority','durationSeconds','segments']) ||
      estimate.method!=='text-weighted-estimate' || estimate.saved!==false || estimate.observedSpeech!==false || estimate.productionAuthority!==false ||
      estimate.durationSeconds!==take.durationSeconds || !validRanges(estimate.segments) || !matchesCurrentSegments(estimate.segments,plan))
      throw new Error('추정 시간 응답 결속을 확인할 수 없습니다.');
  }
  if(!value.currentScriptMatch && (value.current!==null || value.estimate!==null))throw new Error('이전 대본 녹음에 현재 시간 초안이 표시됐습니다.');
  if(value.current!==null && value.estimate!==null)throw new Error('저장 시간과 추정 시간이 함께 표시됐습니다.');
  if(value.currentScriptMatch && value.current===null && value.estimate===null)throw new Error('현재 녹음의 시간 구간이 없습니다.');
  if(value.current===null && value.history.some(item=>object(item)&&item.currentScriptMatch===true))throw new Error('현재 초안 이력이 누락됐습니다.');
  return value as TimingReport;
}

export function parseTimingInputs(rows:Array<{segmentId:string;startSeconds:string;endSeconds:string}>,durationSeconds:number):TimingInput[]{
  let previousEnd=0;
  return rows.map((row,index)=>{
    const startText=row.startSeconds.trim();const endText=row.endSeconds.trim();
    const startSeconds=Number(startText);const endSeconds=Number(endText);
    if(!startText || !endText || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) ||
      startSeconds<0 || endSeconds<=startSeconds || startSeconds<previousEnd || endSeconds>durationSeconds)
      throw new Error(`${index+1}번 문단의 시간이 녹음 길이를 벗어나거나 앞 문단과 겹칩니다.`);
    previousEnd=endSeconds;
    return {segmentId:row.segmentId,startSeconds,endSeconds};
  });
}

export function validateTimingSave(value:unknown,plan:Plan,take:NarrationTake,scope:NarrationScope):{plan:Plan;timing:NarrationTiming}{
  if(!object(value) || !exact(value,['plan','timing']) || !object(value.plan) || !validTiming(value.timing,plan,take) ||
    value.plan.id!==scope.projectId || value.plan.revision!==scope.revision+1 || value.plan.productionAuthority!==false ||
    !object(value.plan.script) || value.plan.script.rawSha256!==scope.scriptSha256 ||
    value.timing.scriptSha256!==scope.scriptSha256 || value.timing.manualReviewConfirmed!==true ||
    !matchesCurrentSegments(value.timing.segments,plan) ||
    !Array.isArray(value.plan.narrationTimings) || !value.plan.narrationTimings.some(item=>object(item)&&item.id===(value.timing as NarrationTiming).id))
    throw new Error('저장된 시간 초안이 현재 대본·녹음과 맞지 않습니다. 최신 내용을 다시 불러오세요.');
  return value as {plan:Plan;timing:NarrationTiming};
}

export function validateTimingExport(value:unknown,plan:Plan,take:NarrationTake,timingId:string):{exportKind:'provisional-narration-timing-draft';timing:NarrationTiming;productionAuthority:false}{
  if(!object(value) || !exact(value,['exportKind','timing','productionAuthority']) || value.exportKind!=='provisional-narration-timing-draft' ||
    value.productionAuthority!==false || !validTiming(value.timing,plan,take) || value.timing.id!==timingId)
    throw new Error('내보낼 시간 초안의 결속을 확인할 수 없습니다.');
  return value as {exportKind:'provisional-narration-timing-draft';timing:NarrationTiming;productionAuthority:false};
}

export type SubtitleFormat='srt'|'vtt';
export function currentSubtitleDownload(requested:NarrationScope,current:NarrationScope,aborted:boolean){
  return !aborted&&requested.projectId===current.projectId&&requested.revision===current.revision&&
    requested.scriptSha256===current.scriptSha256&&requested.epoch===current.epoch;
}
function subtitleClock(milliseconds:number,separator:','|'.'){
  const hours=Math.floor(milliseconds/3_600_000),minutes=Math.floor(milliseconds%3_600_000/60_000);
  const seconds=Math.floor(milliseconds%60_000/1000),millis=milliseconds%1000;
  return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}${separator}${String(millis).padStart(3,'0')}`;
}
function expectedSubtitle(plan:Plan,take:NarrationTake,timing:NarrationTiming,format:SubtitleFormat){
  const current=plan.script.segments.filter(item=>item.kind==='narration');
  if(timing.segments.length!==current.length)throw new Error('자막 문단 수가 현재 대본과 다릅니다.');
  const cues=timing.segments.map((row,index)=>{
    if(row.segmentId!==current[index].id||row.start!==current[index].start||row.end!==current[index].end||row.text!==current[index].text)
      throw new Error('자막 문단이 현재 대본과 다릅니다.');
    const start=Math.round(row.startSeconds*1000),end=Math.round(row.endSeconds*1000);
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=start||end>Math.floor(take.durationSeconds*1000))
      throw new Error('자막 밀리초 범위가 올바르지 않습니다.');
    const text=row.text.replace(/\r\n/g,'\n').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `${format==='srt'?`${index+1}\n`:''}${subtitleClock(start,format==='srt'?',':'.')} --> ${subtitleClock(end,format==='srt'?',':'.')}\n${text}`;
  });
  return `${format==='vtt'?'WEBVTT\n\n':''}${cues.join('\n\n')}\n`;
}
export function validateSubtitleDownload(response:Response,bytes:Uint8Array,plan:Plan,take:NarrationTake,timing:NarrationTiming,
  scope:NarrationScope,format:SubtitleFormat){
  const h=response.headers;
  const type=format==='srt'?'application/x-subrip; charset=utf-8':'text/vtt; charset=utf-8';
  if(!response.ok||h.get('content-type')?.toLowerCase()!==type||h.get('cache-control')!=='no-store'||
    h.get('x-visualmaker-schema')!=='visualmaker-subtitle-draft-v1'||
    h.get('x-visualmaker-project-id')!==scope.projectId||h.get('x-visualmaker-revision')!==String(scope.revision)||
    h.get('x-visualmaker-take-id')!==take.id||h.get('x-visualmaker-timing-id')!==timing.id||
    h.get('x-visualmaker-script-sha256')!==scope.scriptSha256||h.get('x-visualmaker-audio-sha256')!==take.sha256||
    h.get('x-visualmaker-production-authority')!=='false'||
    h.get('content-disposition')!==`attachment; filename="subtitle-draft-${timing.id}.${format}"`||
    bytes.length>1_000_000||Number(h.get('content-length'))!==bytes.length||
    timing.manualReviewConfirmed!==true||timing.scriptSha256!==scope.scriptSha256||timing.audioSha256!==take.sha256)
    throw new Error('자막 응답의 형식·범위·크기를 확인할 수 없습니다.');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(text!==expectedSubtitle(plan,take,timing,format))throw new Error('자막 내용이 저장된 문단·시간과 다릅니다.');
  return text;
}
