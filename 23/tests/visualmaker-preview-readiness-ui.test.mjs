import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlan,applyCommand} from '../visualmaker/core/director.ts';
import {buildPreviewReadiness} from '../visualmaker/core/preview-readiness.ts';
import {parsePreviewReadiness,PreviewReadinessController} from '../src/components/studio/preview-readiness-client.ts';

test('client accepts current scoped report and rejects authority, revision, script and snapshot substitution',async()=>{
  const plan=createPlan('client','대상의 맥락입니다.');const report=buildPreviewReadiness(plan,()=>null);
  assert.equal((await parsePreviewReadiness(report,plan)).projectId,plan.id);
  for(const changed of [
    {...report,productionAuthority:true},
    {...report,renderEligible:true},
    {...report,previewExists:true},
    {...report,eligibleForCutReview:true},
    {...report,revision:plan.revision+1},
    {...report,projectId:'plan-other'},
    {...report,scriptSha256:'0'.repeat(64)},
    {...report,snapshotSha256:'a'.repeat(64)},
    {...report,scenes:[{...report.scenes[0],productionAuthority:true}]},
    {...report,scenes:[{...report.scenes[0],blockers:[]}]},
  ])await assert.rejects(parsePreviewReadiness(changed,plan));
});

test('client ignores late responses after a project or script/revision switch and aborts the old request',async()=>{
  const plan=createPlan('client','대상의 맥락입니다.');const revised=applyCommand(plan,{type:'revise-script',text:'새 주제의 맥락입니다.'});
  const report=buildPreviewReadiness(plan,()=>null);
  let finish;let observedSignal;const states=[];
  const controller=new PreviewReadinessController(async(_plan,signal)=>{observedSignal=signal;return new Promise(resolve=>{finish=resolve;});},state=>states.push(state));
  const running=controller.open(plan);assert.equal(controller.snapshot.status,'loading');
  controller.contextChanged(revised);assert.equal(observedSignal.aborted,true);assert.equal(controller.snapshot.status,'idle');
  finish(report);await running;assert.equal(controller.snapshot.status,'idle');
  assert.ok(!states.some(state=>state.status==='ready'));
  controller.dispose();
});

test('client validates selected-only requirement rows and unique original counts before display',async()=>{
  let plan=createPlan('client','대상의 맥락입니다.');
  plan=applyCommand(plan,{type:'select',sceneId:plan.scenes[0].id,candidateId:plan.scenes[0].candidates[0].id});
  const report=buildPreviewReadiness(plan,()=>null);
  assert.equal((await parsePreviewReadiness(report,plan)).scenes[0].requirements.length,1);
  const extra={...report,scenes:[{...report.scenes[0],requirements:[...report.scenes[0].requirements,{...report.scenes[0].requirements[0],requirementId:plan.scenes[0].candidates[1].requirementIds[0]}]}]};
  await assert.rejects(parsePreviewReadiness(extra,plan));
  await assert.rejects(parsePreviewReadiness({...report,selectedAssignedOriginalSha256Count:1},plan));
});
