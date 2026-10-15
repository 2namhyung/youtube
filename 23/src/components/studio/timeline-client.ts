import type {Plan} from '../../../visualmaker/core/model.ts';
import type {TimelineInspection} from '../../../visualmaker/core/timeline-inspection.ts';

async function sha(value:string):Promise<string>{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');}

export async function currentTimeline(value:unknown,plan:Plan):Promise<TimelineInspection|null>{
  if(!value||typeof value!=='object')return null;
  const report=value as TimelineInspection;
  if(report.schemaVersion!=='visualmaker-timeline-inspection-v1'||report.episodeId!=='episode-001'||
    report.scope?.projectId!==plan.id||report.scope.revision!==plan.revision||report.scope.scriptSha256!==plan.script.rawSha256||
    report.productionAuthority!==false||report.reviewApproved!==false||report.audioSynchronized!==false||
    report.coverageComplete!==false||report.inspectionLimits?.artifactValidation!=='not-performed'||
    report.inspectionLimits.recentJobs!==50||report.inspectionLimits.candidatesPerScene!==2||
    !/^[a-f0-9]{64}$/.test(report.scope.episodeSpecSha256)||!/^[a-f0-9]{64}$/.test(report.scope.productionStateSha256)||
    !Array.isArray(report.rows)||report.rows.length>100||!Array.isArray(report.blockers)||
    new Set(report.rows.map(row=>row.cutId)).size!==report.rows.length||
    report.rows.some((row,index)=>row.order!==index+1||!/^SH\d{3}$/.test(row.cutId)||
      row.sceneId!==null&&!plan.scenes.some(scene=>scene.id===row.sceneId)||
      !row.preview||row.preview.available!==false||row.preview.jobId!==null||
      row.preview.attempt!==null||row.preview.sha256!==null||typeof row.preview.reason!=='string')||
    !report.narration||!Array.isArray(report.narration.segments))return null;
  return await sha(JSON.stringify(plan))===report.scope.snapshotSha256?report:null;
}

export function timelineResponseScope(response:Response,plan:Plan,report:TimelineInspection):boolean{
  return response.ok&&response.headers.get('content-type')?.split(';')[0]==='application/json'&&
    response.headers.get('x-visualmaker-schema')===report.schemaVersion&&
    response.headers.get('x-visualmaker-project-id')===plan.id&&
    response.headers.get('x-visualmaker-revision')===String(plan.revision)&&
    response.headers.get('x-visualmaker-script-sha256')===plan.script.rawSha256&&
    response.headers.get('x-visualmaker-snapshot-sha256')===report.scope.snapshotSha256&&
    response.headers.get('x-visualmaker-episode-spec-sha256')===report.scope.episodeSpecSha256&&
    response.headers.get('x-visualmaker-production-state-sha256')===report.scope.productionStateSha256&&
    response.headers.get('x-visualmaker-production-authority')==='false';
}
