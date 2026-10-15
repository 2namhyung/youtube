import {createHash,randomUUID} from 'node:crypto';
import {readAIProposalWithDb} from './ai-analysis-job.ts';
import {applyAIAnalysisIntentBatch,validatePlan} from './director.ts';
import {initializeJobStorage} from './jobs.ts';
import type {AIAnalysisAdoption,Plan} from './model.ts';
import {openDb,StoreError,verifyAssets,verifyNarrationTakes} from './store.ts';

export type AIAdoptionRequest={projectId:string;baseRevision:number;jobId:string;expectedArtifactSha256:string;segmentIds:string[];confirmDirectionReset:true};
const PROJECT=/^plan-[a-f0-9-]{36}$/u,JOB=/^job_[a-f0-9-]{36}$/u,HASH=/^[a-f0-9]{64}$/u;
const fail=(status=400):never=>{throw new StoreError('AI 제안 반영 범위 또는 상태를 확인하세요.',status);};
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');

export function adoptAIAnalysis(request:AIAdoptionRequest):{plan:Plan;adoption:AIAnalysisAdoption}{
  if(!request||typeof request!=='object'||Array.isArray(request)||
    Object.keys(request).sort().join('|')!==['projectId','baseRevision','jobId','expectedArtifactSha256','segmentIds','confirmDirectionReset'].sort().join('|')||
    typeof request.projectId!=='string'||!PROJECT.test(request.projectId)||!Number.isSafeInteger(request.baseRevision)||request.baseRevision<1||
    typeof request.jobId!=='string'||!JOB.test(request.jobId)||typeof request.expectedArtifactSha256!=='string'||!HASH.test(request.expectedArtifactSha256)||
    request.confirmDirectionReset!==true||!Array.isArray(request.segmentIds)||request.segmentIds.length<1||request.segmentIds.length>40||
    request.segmentIds.some(id=>typeof id!=='string'||id.length<1||id.length>200)||new Set(request.segmentIds).size!==request.segmentIds.length)fail();
  initializeJobStorage();
  const db=openDb();try{
    db.exec('BEGIN IMMEDIATE');
    const row=db.prepare('SELECT revision,document FROM projects WHERE id=?').get(request.projectId) as {revision:number;document:string}|undefined;
    if(!row)throw new StoreError('프로젝트를 찾을 수 없습니다.',404);
    if(row.revision!==request.baseRevision)fail(409);
    const current=validatePlan(JSON.parse(row.document));
    if(current.id!==request.projectId||current.revision!==row.revision||sha(row.document)!==sha(JSON.stringify(current)))fail(409);
    verifyAssets(current);verifyNarrationTakes(current);
    const {job,proposal}=readAIProposalWithDb(db,current,request.projectId,request.baseRevision,request.jobId);
    if(job.artifact?.sha256!==request.expectedArtifactSha256)fail(409);
    const bySegment=new Map(proposal.records.map((record,index)=>[record.segmentId,{record,index}]));
    let previous=-1;const seenScenes=new Set<string>();
    const selected=request.segmentIds.map(segmentId=>{
      const match=bySegment.get(segmentId);if(!match)throw new StoreError('AI 분석 구간을 찾을 수 없습니다.',409);
      if(match.index<=previous)fail(409);previous=match.index;
      const beats=current.beats.filter(beat=>beat.segmentIds.length===1&&beat.segmentIds[0]===segmentId);
      if(beats.length!==1)fail(409);
      const beat=beats[0],owners=current.scenes.filter(scene=>scene.beatIds.includes(beat.id));
      if(owners.length!==1||owners[0].beatIds.length!==1)fail(409);
      const scene=owners[0];if(scene.locked)fail(423);
      if(seenScenes.has(scene.id))fail(409);seenScenes.add(scene.id);
      return {record:match.record,beat,scene};
    });
    const revised=applyAIAnalysisIntentBatch(current,selected.map(({record,beat})=>({beatId:beat.id,intent:record.mainMessage})));
    const adoption:AIAnalysisAdoption={schemaVersion:'visualmaker-ai-analysis-adoption-v1',id:`adopt_${randomUUID()}`,createdAt:new Date().toISOString(),
      jobId:job.jobId,artifactSha256:request.expectedArtifactSha256,scope:{...proposal.scope},model:{...proposal.model},
      beforeRevision:current.revision,afterRevision:revised.revision,scriptSha256:proposal.scope.scriptSha256,
      productionAuthority:false,requiresHumanReview:true,
      records:selected.map(({record,beat,scene})=>({segmentId:record.segmentId,beatId:beat.id,sceneId:scene.id,source:{...record.source},
        mainMessage:record.mainMessage,uncertainty:record.uncertainty,visualMeaningBrief:record.visualMeaningBrief,
        searchBriefKo:record.searchBriefKo,searchBriefEn:record.searchBriefEn,beforeIntent:beat.intent,appliedIntent:record.mainMessage}))};
    if(Buffer.byteLength(JSON.stringify(adoption),'utf8')>200_000)fail(413);
    const next=validatePlan({...revised,aiAnalysisAdoption:adoption});
    verifyNarrationTakes(next);verifyAssets(next);
    const doc=JSON.stringify(next);
    const update=db.prepare('UPDATE projects SET title=?,revision=?,updated_at=?,document=? WHERE id=? AND revision=?').run(next.title,next.revision,next.updatedAt,doc,next.id,current.revision);
    if(update.changes!==1)fail(409);
    db.prepare('INSERT INTO revisions VALUES(?,?,?)').run(next.id,next.revision,doc);
    db.exec('COMMIT');return {plan:next,adoption:next.aiAnalysisAdoption!};
  }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}finally{db.close();}
}
