import {createHash} from 'node:crypto';
import {closeSync,fstatSync,openSync,readSync,realpathSync} from 'node:fs';
import type {Plan, NarrationTimingSegment} from './model.ts';
import {listJobs} from './jobs.ts';
import type {Job} from './jobs.ts';
import {currentPlanForCanonical, safeCanonicalFile} from './canonical-cut-render.ts';
import {EPISODE_SPEC_PATH, PRODUCTION_STATE_PATH} from './adoption-review.ts';
import {importEpisode} from './episode.ts';
import {narrationTimingReport} from './narration-timing.ts';
import {StoreError, verifyNarrationTakes} from './store.ts';

export const TIMELINE_SCHEMA='visualmaker-timeline-inspection-v1' as const;
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
type Cut={shot_id:string;draft_narration:string;estimated_voice_seconds:number;duration_frames:number;visual_purpose:string;production_mode:string};
type Spec={episode_id:string;narration_contract:{fps:number};cuts:Cut[]};
type State={episode_id:string;stage:string;expected_cut_count:number;active_cut_root:string|null;render_authority?:{cut_root?:string|null};draft_inputs?:{episode_spec_sha256?:string}};
export type TimelineRow={cutId:string;order:number;sceneId:string|null;windowStartSeconds:number;windowEndSeconds:number;durationFrames:number;fps:number;estimatedVoiceSeconds:number;preview:{available:boolean;jobId:string|null;attempt:number|null;sha256:string|null;reason:string}};
export type TimelineInspection={schemaVersion:typeof TIMELINE_SCHEMA;episodeId:'episode-001';scope:{projectId:string;revision:number;scriptSha256:string;snapshotSha256:string;episodeSpecSha256:string;productionStateSha256:string};stage:string;originCurrent:boolean;originReason:string|null;activeCutRootPresent:boolean;blockers:string[];inspectionLimits:{recentJobs:number;candidatesPerScene:number;artifactValidation:'not-performed'};rows:TimelineRow[];coverageComplete:boolean;narration:{status:'absent'|'stale'|'current-draft';takeId:string|null;audioSha256:string|null;durationSeconds:number|null;timingId:string|null;manualReviewConfirmed:boolean;segments:NarrationTimingSegment[];reason:string};productionAuthority:false;reviewApproved:false;audioSynchronized:false};

export function timelineCandidateWindowReason(detail:string):string{
  return `${detail} 최근 작업 최대 50개와 장면당 최대 2개 후보만 확인하며 이전 결과는 미확인입니다.`;
}

export function timelineCandidateMetadataReason(group:Pick<Job,'status'|'projectId'|'sceneId'|'requestedRevision'|'snapshotSha256'|'attempt'>[],
  scope:{projectId:string;sceneId:string;revision:number;snapshotSha256:string}):string{
  const current=group.some(job=>job.status==='succeeded'&&job.projectId===scope.projectId&&job.sceneId===scope.sceneId&&
    job.requestedRevision===scope.revision&&job.snapshotSha256===scope.snapshotSha256&&job.attempt>=1);
  return timelineCandidateWindowReason(current?
    '현재 범위의 성공 작업 기록이 있습니다. 이 점검에서는 영상·입력을 재검증하지 않습니다. 작업 패널에서 정식 컷 영상을 확인하세요.':
    group.length?'최근 작업 기록은 완료 상태 또는 현재 계획의 결속과 다릅니다.':'조회한 최근 작업에서 이 컷의 완료 영상을 확인하지 않았습니다.');
}

function boundedAuthority(relative:string):Buffer{
  const root=realpathSync(process.cwd());
  let file:string;
  try{file=safeCanonicalFile(root,relative);}catch{throw new StoreError('에피소드 명세 또는 상태를 안전하게 읽을 수 없습니다.',409);}
  let fd:number|undefined;
  try{
    fd=openSync(file,'r');const size=fstatSync(fd).size;
    if(size<1||size>25_000_000)throw new StoreError('에피소드 명세 또는 상태 크기가 허용 범위를 벗어났습니다.',409);
    const bytes=Buffer.allocUnsafe(size+1);let used=0;
    while(used<bytes.length){const amount=readSync(fd,bytes,used,bytes.length-used,null);if(!amount)break;used+=amount;}
    if(used!==size||fstatSync(fd).size!==size)throw new StoreError('에피소드 명세 또는 상태가 읽는 중 변경됐습니다.',409);
    return bytes.subarray(0,used);
  }catch(error){if(error instanceof StoreError)throw error;
    throw new StoreError('에피소드 명세 또는 상태를 안전하게 읽을 수 없습니다.',409);
  }finally{if(fd!==undefined)closeSync(fd);}
}
function parseAuthority(specBytes:Buffer,stateBytes:Buffer):{spec:Spec;state:State}{
  let spec:Spec,state:State;
  try{spec=JSON.parse(specBytes.toString('utf8')) as Spec;state=JSON.parse(stateBytes.toString('utf8')) as State;}
  catch{throw new StoreError('에피소드 명세 또는 상태 JSON을 읽을 수 없습니다.',409);}
  const cuts=spec?.cuts;
  if(spec?.episode_id!=='episode-001'||state?.episode_id!=='episode-001'||!Array.isArray(cuts)||cuts.length<1||cuts.length>100||
    !Number.isSafeInteger(spec.narration_contract?.fps)||spec.narration_contract.fps<1||spec.narration_contract.fps>120||
    cuts.some(c=>!/^SH\d{3}$/.test(c?.shot_id)||!Number.isSafeInteger(c.duration_frames)||c.duration_frames<1||c.duration_frames>1_000_000||!Number.isFinite(c.estimated_voice_seconds)||c.estimated_voice_seconds<0)||
    new Set(cuts.map(c=>c.shot_id)).size!==cuts.length||typeof state.stage!=='string')
    throw new StoreError('현재 에피소드 컷·시간 명세가 올바르지 않습니다.',409);
  return {spec,state};
}

function originMatch(plan:Plan,spec:Spec,specSha256:string):boolean{
  if(plan.origin?.kind!=='episode-spec'||plan.origin.path!==EPISODE_SPEC_PATH||plan.origin.sha256!==specSha256||
    plan.scenes.length!==spec.cuts.length||plan.script.rawText!==spec.cuts.map(c=>c.draft_narration).join('\n\n'))return false;
  // The importer is the only source of the scene/beat/candidate mapping. Asset review and locks may change independently.
  const baseline=importEpisode();
  return plan.scenes.every((scene,i)=>{
    const original=baseline.scenes[i],cut=spec.cuts[i];
    const beat=plan.beats.find(item=>item.id===scene.beatIds[0]);
    const originalBeat=baseline.beats.find(item=>item.id===original.beatIds[0]);
    const segment=plan.script.segments.find(item=>item.id===beat?.segmentIds[0]);
    const originalSegment=baseline.script.segments.find(item=>item.id===originalBeat?.segmentIds[0]);
    return scene.originCutIds?.length===1&&scene.originCutIds[0]===cut.shot_id&&
      JSON.stringify(scene.beatIds)===JSON.stringify(original.beatIds)&&
      JSON.stringify(scene.candidates)===JSON.stringify(original.candidates)&&
      (scene.selectedCandidateId===null||scene.selectedCandidateId===original.candidates[0].id)&&
      beat?.intent===originalBeat?.intent&&beat?.role===originalBeat?.role&&
      JSON.stringify(beat?.segmentIds)===JSON.stringify(originalBeat?.segmentIds)&&
      segment?.text===originalSegment?.text&&segment?.kind===originalSegment?.kind&&
      segment?.start===originalSegment?.start&&segment?.end===originalSegment?.end;
  });
}

export function buildTimelineBase(plan:Plan,specBytes:Buffer,stateBytes:Buffer):TimelineInspection{
  const {spec,state}=parseAuthority(specBytes,stateBytes);
  const specSha256=sha(specBytes),stateSha256=sha(stateBytes);
  const originCurrent=originMatch(plan,spec,specSha256);
  const activeCutRootPresent=typeof state.active_cut_root==='string'&&state.active_cut_root.length>0&&state.active_cut_root===state.render_authority?.cut_root;
  const blockers:string[]=[];
  if(!originCurrent)blockers.push('현재 EP001 명세에서 가져온 원본 구조와 계획이 다릅니다. 컷 연결을 수동으로 추정하지 않습니다.');
  if(!activeCutRootPresent)blockers.push('활성 컷 루트가 없습니다. 컷 영상 미리보기를 사용할 수 없습니다.');
  if(state.expected_cut_count!==spec.cuts.length||state.draft_inputs?.episode_spec_sha256!==specSha256)blockers.push('제작 상태의 컷 수 또는 명세 해시가 현재 컷 명세와 다릅니다.');
  const rows:TimelineRow[]=[];let frame=0;
  for(const [index,cut] of spec.cuts.entries()){
    const sceneId=originCurrent?plan.scenes[index].id:null;
    rows.push({cutId:cut.shot_id,order:index+1,sceneId,windowStartSeconds:frame/spec.narration_contract.fps,
      windowEndSeconds:(frame+cut.duration_frames)/spec.narration_contract.fps,durationFrames:cut.duration_frames,
      fps:spec.narration_contract.fps,estimatedVoiceSeconds:cut.estimated_voice_seconds,
      preview:{available:false,jobId:null,attempt:null,sha256:null,reason:!originCurrent?'현재 명세에 연결된 장면이 없습니다.':!activeCutRootPresent?'활성 컷 루트가 없습니다.':'영상 작업은 아직 확인하지 않았습니다.'}});
    frame+=cut.duration_frames;
  }
  const narration:TimelineInspection['narration']={status:'absent',takeId:null,audioSha256:null,durationSeconds:null,timingId:null,manualReviewConfirmed:false,segments:[],reason:'현재 대본에 맞는 녹음이 없습니다.'};
  const take=[...(plan.narrationTakes??[])].reverse().find(item=>item.scriptSha256===plan.script.rawSha256);
  if(take){
    narration.status='stale';narration.reason='녹음 파일 또는 현재 시간 초안의 결속을 확인할 수 없습니다.';
    try{
      verifyNarrationTakes({...plan,narrationTakes:[take]});
      narration.takeId=take.id;narration.audioSha256=take.sha256;narration.durationSeconds=take.durationSeconds;
      const timing=narrationTimingReport(plan,take.id).current;
      if(timing){narration.status='current-draft';narration.timingId=timing.id;
        narration.manualReviewConfirmed=timing.manualReviewConfirmed===true&&!!timing.manualReviewConfirmedAt;
        narration.segments=timing.segments;narration.reason='녹음과 대본에 결속된 수동 문단 시간 초안입니다. 컷 시간과 동기화된 결과가 아닙니다.';
      }else narration.reason='녹음은 현재 대본과 일치하지만 저장된 현재 문단 시간 초안이 없습니다.';
    }catch{narration.reason='녹음 파일 또는 검증 기록을 확인할 수 없습니다.';}
  }else if((plan.narrationTakes??[]).length){narration.status='stale';narration.reason='등록된 녹음은 현재 대본과 다릅니다.';}
  return {schemaVersion:TIMELINE_SCHEMA,episodeId:'episode-001',scope:{projectId:plan.id,revision:plan.revision,scriptSha256:plan.script.rawSha256,
    snapshotSha256:sha(JSON.stringify(plan)),episodeSpecSha256:specSha256,productionStateSha256:stateSha256},
    stage:state.stage,originCurrent,originReason:originCurrent?null:blockers[0],activeCutRootPresent,blockers,
    inspectionLimits:{recentJobs:50,candidatesPerScene:2,artifactValidation:'not-performed'},rows,
    coverageComplete:false,narration,productionAuthority:false,reviewApproved:false,audioSynchronized:false};
}

export async function buildTimelineInspection(projectId:string,baseRevision:number):Promise<TimelineInspection>{
  const plan=currentPlanForCanonical(projectId,baseRevision);
  const specBytes=boundedAuthority(EPISODE_SPEC_PATH),stateBytes=boundedAuthority(PRODUCTION_STATE_PATH);
  const report=buildTimelineBase(plan,specBytes,stateBytes);
  if(!report.originCurrent||!report.activeCutRootPresent||report.blockers.length)return report;
  const jobs=listJobs(plan.id).filter(job=>job.kind==='canonical-cut-preview');
  for(const row of report.rows){const sceneId=row.sceneId;if(!sceneId)continue;
    const group=jobs.filter(job=>job.sceneId===sceneId).slice(0,2);
    row.preview.reason=timelineCandidateMetadataReason(group,{projectId:plan.id,sceneId,revision:plan.revision,snapshotSha256:report.scope.snapshotSha256});
  }
  return report;
}

export function timelineStillCurrent(report:TimelineInspection):boolean{
  try{const plan=currentPlanForCanonical(report.scope.projectId,report.scope.revision);
    return sha(JSON.stringify(plan))===report.scope.snapshotSha256&&
      sha(boundedAuthority(EPISODE_SPEC_PATH))===report.scope.episodeSpecSha256&&
      sha(boundedAuthority(PRODUCTION_STATE_PATH))===report.scope.productionStateSha256;
  }catch{return false;}
}
