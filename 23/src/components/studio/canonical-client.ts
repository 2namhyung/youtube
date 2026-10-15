import type {CanonicalReport} from '../../../visualmaker/core/canonical-cut-render.ts';
import type {Plan} from '../../../visualmaker/core/model.ts';
import type {Job} from '../../../visualmaker/core/jobs.ts';
import type {CanonicalExecutionContract} from '../../../visualmaker/renderer/canonical-contract.ts';

async function sha(value:string):Promise<string>{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');}

export async function currentCanonicalReport(value:unknown,plan:Plan,sceneId:string):Promise<CanonicalReport|null>{
  if(!value||typeof value!=='object')return null;
  const report=value as CanonicalReport;
  if(report.schemaVersion!=='visualmaker-canonical-cut-render-v1'||report.episodeId!=='episode-001'||report.scope?.projectId!==plan.id||report.scope.revision!==plan.revision||report.scope.sceneId!==sceneId||report.scriptSha256!==plan.script.rawSha256||report.productionAuthority!==false||report.cutPass!==false||report.stylePass!==false||report.playableParity!==false||!Array.isArray(report.blockers)||!Array.isArray(report.validators)||!Array.isArray(report.inputs))return null;
  const snapshot=await sha(JSON.stringify(plan));
  if(snapshot!==report.snapshotSha256)return null;
  if(report.renderEligible&&(!report.composition||!report.scope.cutId||report.blockers.length||report.validators.length!==4||report.validators.some(v=>!v.passed)))return null;
  return report;
}

export async function currentCanonicalEnqueue(value:unknown,report:CanonicalReport,plan:Plan,sceneId:string):Promise<Job|null>{
  if(!value||typeof value!=='object'||!('job' in value)||!('executionContract' in value))return null;
  const pair=value as {job:Job;executionContract:CanonicalExecutionContract};const {job,executionContract:contract}=pair;
  if(!job||!contract||job.kind!=='canonical-cut-preview'||job.status!=='queued'||job.projectId!==plan.id||job.requestedRevision!==plan.revision||job.sceneId!==sceneId||job.snapshotSha256!==report.snapshotSha256||job.productionAuthority!==false||typeof job.executionContractSha256!=='string'||!/^[a-f0-9]{64}$/.test(job.executionContractSha256)||contract.schemaVersion!=='visualmaker-canonical-execution-v1'||contract.report.renderEligible!==true||contract.report.productionAuthority!==false||contract.report.cutPass!==false||contract.report.stylePass!==false||contract.report.playableParity!==false)return null;
  if(await sha(JSON.stringify(report))!==contract.reportSha256||JSON.stringify(contract.report)!==JSON.stringify(report)||await sha(JSON.stringify(contract))!==job.executionContractSha256)return null;
  return job;
}

export function currentCanonicalMedia(response:Response,scope:{projectId:string;jobId:string;sceneId:string;attempt:number}):boolean{
  return response.ok&&response.headers.get('content-type')?.split(';')[0]==='video/mp4'&&response.headers.get('x-visualmaker-project-id')===scope.projectId&&response.headers.get('x-visualmaker-job-id')===scope.jobId&&response.headers.get('x-visualmaker-scene-id')===scope.sceneId&&response.headers.get('x-visualmaker-attempt')===String(scope.attempt);
}

export function currentStudioDownload(initial:{projectId:string;revision:number;sceneId:string},current:{projectId:string;revision:number;sceneId:string},job:Job,latest:Job|undefined):boolean{
  return initial.projectId===current.projectId&&initial.revision===current.revision&&initial.sceneId===current.sceneId&&job.projectId===current.projectId&&job.requestedRevision===current.revision&&!!latest&&latest.status==='succeeded'&&latest.attempt===job.attempt&&latest.sceneId===job.sceneId;
}
