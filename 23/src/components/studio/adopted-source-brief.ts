import type {Plan} from '../../../visualmaker/core/model.ts';
import {expectedDraft} from './ai-analysis-adoption-client.ts';

export type AdoptedSourceBrief={ko:string;en:string};
const hash=/^[a-f0-9]{64}$/u;
// AI proposal schema permits internal tabs and line breaks; source providers do not.
const text=(value:unknown)=>typeof value==='string'&&value.length>=1&&value.length<=600&&
  value.trim().length>0&&value.trim()===value&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);
const same=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);

/** A receipt is only a suggestion while its original, selected draft still describes this requirement. */
export function adoptedSourceBrief(plan:Plan,requirementId:string):AdoptedSourceBrief|null{
  const receipt=plan.aiAnalysisAdoption;
  if(!receipt||receipt.schemaVersion!=='visualmaker-ai-analysis-adoption-v1'||
    receipt.productionAuthority!==false||receipt.requiresHumanReview!==true||
    receipt.scope.projectId!==plan.id||receipt.scope.scriptSha256!==plan.script.rawSha256||
    receipt.scriptSha256!==plan.script.rawSha256||!hash.test(receipt.artifactSha256)||
    !hash.test(receipt.scope.snapshotSha256)||!Number.isSafeInteger(receipt.beforeRevision)||
    !Number.isSafeInteger(receipt.afterRevision)||receipt.beforeRevision<1||
    receipt.scope.revision!==receipt.beforeRevision||receipt.afterRevision!==receipt.beforeRevision+1||
    receipt.afterRevision>plan.revision||!Array.isArray(receipt.records)||receipt.records.length<1||
    new Set(receipt.records.map(row=>row.segmentId)).size!==receipt.records.length||
    new Set(receipt.records.map(row=>row.beatId)).size!==receipt.records.length||
    new Set(receipt.records.map(row=>row.sceneId)).size!==receipt.records.length)return null;

  const requirementOwners=plan.scenes.filter(scene=>scene.candidates.some(candidate=>
    candidate.requirementIds.includes(requirementId)));
  if(requirementOwners.length!==1)return null;
  const scene=requirementOwners[0],candidate=scene.candidates.find(item=>item.id===scene.selectedCandidateId);
  const requirement=plan.requirements.find(item=>item.id===requirementId);
  if(scene.locked||!candidate||!requirement||
    plan.requirements.filter(item=>item.id===requirementId).length!==1||
    !candidate.requirementIds.includes(requirementId)||
    candidate.layers.filter(layer=>layer.role==='focal'&&layer.requirementId===requirementId).length!==1||
    requirement.assetId!==null||!['image','video'].includes(requirement.mediaType)||
    !['external','official'].includes(requirement.acquisition))return null;

  const rows=receipt.records.filter(row=>row.sceneId===scene.id);
  if(rows.length!==1||scene.beatIds.length!==1)return null;
  const row=rows[0],beat=plan.beats.find(item=>item.id===row.beatId);
  const segment=plan.script.segments.find(item=>item.id===row.segmentId);
  if(!beat||!segment||!row.source||plan.beats.filter(item=>item.id===row.beatId).length!==1||
    plan.script.segments.filter(item=>item.id===row.segmentId).length!==1||
    beat.segmentIds.length!==1||beat.segmentIds[0]!==row.segmentId||scene.beatIds[0]!==beat.id||
    plan.scenes.filter(item=>item.beatIds.includes(beat.id)).length!==1||
    row.source.start!==segment.start||row.source.end!==segment.end||
    row.source.text!==segment.text||row.source.kind!==segment.kind||
    !text(row.mainMessage)||row.appliedIntent!==row.mainMessage||
    row.beforeIntent===row.appliedIntent||beat.intent!==row.appliedIntent||
    !text(row.searchBriefKo)||!text(row.searchBriefEn))return null;

  const draft=expectedDraft(scene,beat,row.appliedIntent,receipt.afterRevision);
  const expected=draft.requirements.find(item=>item.id===requirementId);
  if(!expected||!same(scene.candidates,draft.candidates)||!same(requirement,expected))return null;
  return {ko:row.searchBriefKo,en:row.searchBriefEn};
}

/** Local form state only. Calling this never searches, mutates a Plan, or truncates a brief. */
export function selectedBriefQuery(brief:AdoptedSourceBrief,language:'ko'|'en'):string{
  return brief[language];
}
