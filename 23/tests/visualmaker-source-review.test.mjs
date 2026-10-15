import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {applyCommand, createPlan, prepareImportedCopy, requirementsExport, reviewStates, validatePlan} from '../visualmaker/core/director.ts';
import {assetFile, getProject, insertProject, updateProject} from '../visualmaker/core/store.ts';
import {attachUpload} from '../visualmaker/core/upload.ts';
import {artifactFile, enqueueJob, runJob} from '../visualmaker/core/jobs.ts';
import {reviewBadge} from '../visualmaker/core/review-badge.ts';

const hash = value => createHash('sha256').update(value).digest('hex');
const review = (plan, requirementId, dimension, decision = 'acceptable', rationale = '원본과 내레이션의 대상이 일치합니다.') =>
  applyCommand(plan, {type:'review-source', requirementId, dimension, decision, rationale});
function asset(mediaType = 'image', evidenceOnly = false, mimeType = 'image/png') {
  const sha256 = hash(randomUUID());
  return {id:`asset_${randomUUID()}`, originalName:'fixture.png', mediaType, path:`assets/${sha256}.png`, sha256,
    mimeType, width:10, height:10, durationSeconds:null, sourceUrl:'https://example.org/source', creator:'Test fixture',
    rightsNote:'Test only', semanticNote:'Local synthetic fixture', status:'pending-review', evidenceOnly};
}

test('legacy plans keep byte-stable snapshots, and imported copies reset observations', () => {
  process.env.VISUALMAKER_DATA_DIR = mkdtempSync(path.join(os.tmpdir(),'vm-review-legacy-'));
  const old = createPlan('legacy', '자료를 확인합니다.');
  const original = JSON.stringify(old);
  assert.equal(Object.hasOwn(old,'sourceReviews'), false);
  assert.equal(JSON.stringify(validatePlan(JSON.parse(original))), original);
  const saved = insertProject(old);
  const job = enqueueJob(saved.id, saved.revision, 'planning-package', 'old-snapshot');
  assert.equal(runJob(job.id).status, 'succeeded');
  assert.equal(JSON.parse(artifactFile(job.id,'plan.json').bytes).sourceReviews, undefined);
  const req = old.requirements[0];
  let updated = applyCommand(old,{type:'attach-asset', requirementId:req.id, asset:asset()});
  updated = review(updated,req.id,'source');
  assert.equal(updated.sourceReviews.at(-1).decision,'acceptable');
  const imported = prepareImportedCopy(updated);
  assert.deepEqual(imported.sourceReviews,[]);
  assert.equal(imported.requirements[0].assetId,updated.requirements[0].assetId);
  assert.equal(imported.productionAuthority,false);
});

test('assign, detach, reassign and meaning revert keep prior accepted evidence historical', () => {
  let plan = createPlan('reuse','첫 자료를 확인합니다.\n\n다른 자료를 설명합니다.');
  const [first, second] = [plan.requirements[0],plan.requirements.find(item=>item.id.startsWith('scene-2-'))];
  const registered = asset();
  plan = applyCommand(plan,{type:'attach-asset',requirementId:first.id,asset:registered});
  plan = review(plan,first.id,'source');
  plan = review(plan,first.id,'rights');
  plan = review(plan,first.id,'semantic');
  assert.ok(Object.values(reviewStates(plan)[0].current).every(item=>item.decision==='acceptable'));
  plan = applyCommand(plan,{type:'assign-asset',requirementId:second.id,assetId:registered.id});
  assert.equal(reviewStates(plan)[0].current.source.decision,'acceptable');
  assert.equal(reviewStates(plan).find(item=>item.requirementId===second.id).current.source.decision,'pending');
  plan = applyCommand(plan,{type:'detach-asset',requirementId:first.id});
  assert.equal(plan.assets.length,1);
  plan = applyCommand(plan,{type:'assign-asset',requirementId:first.id,assetId:registered.id});
  assert.equal(reviewStates(plan)[0].current.source.decision,'pending');
  plan = review(plan,first.id,'source');
  const firstCandidate = plan.scenes[0].candidates[0];
  const oldReason = firstCandidate.reason;
  plan = applyCommand(plan,{type:'edit-candidate',sceneId:plan.scenes[0].id,candidateId:firstCandidate.id,changes:{reason:'변경된 장면 의미'}});
  assert.equal(reviewStates(plan)[0].current.source.decision,'pending');
  plan = applyCommand(plan,{type:'edit-candidate',sceneId:plan.scenes[0].id,candidateId:firstCandidate.id,changes:{reason:oldReason}});
  assert.equal(reviewStates(plan)[0].current.source.decision,'pending');
  assert.ok(reviewStates(plan)[0].history.some(item=>item.decision==='acceptable'));
  const originalScript=plan.script.rawText;
  plan=applyCommand(plan,{type:'revise-script',text:'새 의미의 사진입니다.\n\n다른 자료를 설명합니다.'});
  plan=applyCommand(plan,{type:'revise-script',text:originalScript});
  assert.ok(reviewStates(plan).every(state=>state.current.source?.decision!=='acceptable'));
  assert.equal(requirementsExport(plan).productionAuthority,false);
});

test('badges distinguish first registration, partial current review and invalidated review', () => {
  let plan=createPlan('badge','대상의 맥락입니다.');
  const requirement=plan.requirements[0];
  plan=applyCommand(plan,{type:'attach-asset',requirementId:requirement.id,asset:asset()});
  let state=reviewStates(plan)[0];
  assert.equal(reviewBadge(plan.assets[0],state),'등록 · 검토 대기');
  plan=review(plan,requirement.id,'source');
  state=reviewStates(plan)[0];
  assert.equal(reviewBadge(plan.assets[0],state),'등록 · 검토 진행 중');
  const candidate=plan.scenes[0].candidates[0];
  plan=applyCommand(plan,{type:'edit-candidate',sceneId:plan.scenes[0].id,candidateId:candidate.id,changes:{reason:'새로운 자료 의미'}});
  state=reviewStates(plan)[0];
  assert.equal(reviewBadge(plan.assets[0],state),'등록 · 재검토 대기');
  plan=applyCommand(plan,{type:'detach-asset',requirementId:requirement.id});
  assert.equal(reviewBadge(null,reviewStates(plan)[0]),'미확보 · 과거 검토 이력 있음');
});

test('review decisions are dimension-specific and require reasons; locks and media constraints reject mutations', () => {
  let plan=createPlan('constraints','대상의 맥락입니다.\n\n사람이 문을 열고 이동합니다.');
  const imageReq=plan.requirements[0];
  const videoReq=plan.requirements.find(item=>item.mediaType==='video');
  const image=asset();
  plan=applyCommand(plan,{type:'attach-asset',requirementId:imageReq.id,asset:image});
  assert.throws(()=>review(plan,imageReq.id,'source','acceptable','  '));
  plan=review(plan,imageReq.id,'source','rejected','대상과 일치하지 않습니다.');
  plan=review(plan,imageReq.id,'source','acceptable','대상을 확인했습니다.');
  assert.equal(reviewStates(plan)[0].current.source.decision,'acceptable');
  assert.equal(reviewStates(plan)[0].current.rights.decision,'pending');
  assert.throws(()=>applyCommand(plan,{type:'assign-asset',requirementId:videoReq.id,assetId:image.id}),e=>e.status===409);
  plan=applyCommand(plan,{type:'select',sceneId:plan.scenes[0].id,candidateId:plan.scenes[0].candidates[0].id});
  plan=applyCommand(plan,{type:'lock',sceneId:plan.scenes[0].id,locked:true});
  assert.throws(()=>review(plan,imageReq.id,'semantic'),e=>e.status===423);
  assert.throws(()=>applyCommand(plan,{type:'detach-asset',requirementId:imageReq.id}),e=>e.status===423);
  let shared=createPlan('shared','첫 대상의 맥락입니다.\n\n둘째 대상의 맥락입니다.');
  shared=applyCommand(shared,{type:'attach-asset',requirementId:shared.requirements[0].id,asset:asset()});
  shared=applyCommand(shared,{type:'select',sceneId:shared.scenes[0].id,candidateId:shared.scenes[0].candidates[0].id});
  shared=applyCommand(shared,{type:'reuse',sceneId:shared.scenes[1].id,fromSceneId:shared.scenes[0].id,reason:'대상의 원본을 함께 검토합니다.'});
  shared=applyCommand(shared,{type:'select',sceneId:shared.scenes[1].id,candidateId:shared.scenes[1].candidates[0].id});
  shared=applyCommand(shared,{type:'lock',sceneId:shared.scenes[1].id,locked:true});
  assert.throws(()=>review(shared,shared.requirements[0].id,'source'),e=>e.status===423);
  const evidence=asset('image',true);
  const unlocked=createPlan('evidence','대상의 맥락입니다.');
  assert.throws(()=>applyCommand(unlocked,{type:'attach-asset',requirementId:unlocked.requirements[0].id,asset:evidence}),e=>e.status===409);
  const omni=createPlan('omni','가상 장면을 보여줍니다.');
  const wrong=asset('image',false,'image/jpeg');
  let withCatalog=applyCommand(omni,{type:'attach-asset',requirementId:omni.requirements[0].id,asset:asset()});
  withCatalog={...withCatalog,assets:[...withCatalog.assets,wrong]};
  withCatalog=applyCommand(withCatalog,{type:'detach-asset',requirementId:omni.requirements[0].id});
  assert.throws(()=>applyCommand(withCatalog,{type:'assign-asset',requirementId:omni.requirements[0].id,assetId:wrong.id}),e=>e.status===409);
});

test('transactional revisions verify bytes and receipts before recording review', async () => {
  process.env.VISUALMAKER_DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'vm-review-store-'));
  const plan=insertProject(createPlan('receipt','사진의 대상과 맥락입니다.'));
  const req=plan.requirements[0];
  const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#fff'}}).png().toBuffer();
  const uploaded=await attachUpload(plan.id,plan.revision,req.id,bytes,{originalName:'fixture.png',sourceUrl:'https://example.org/photo',creator:'Test',rightsNote:'Test only',semanticNote:'White synthetic test image',evidenceOnly:'false'});
  assert.throws(()=>updateProject(plan.id,plan.revision,{type:'review-source',requirementId:req.id,dimension:'source',decision:'acceptable',rationale:'확인'}),e=>e.status===409);
  const reviewed=updateProject(plan.id,uploaded.revision,{type:'review-source',requirementId:req.id,dimension:'source',decision:'acceptable',rationale:'원본 출처 확인'});
  assert.equal(getProject(plan.id).sourceReviews.at(-1).decision,'acceptable');
  const receipt=path.join(process.env.VISUALMAKER_DATA_DIR,'receipts',`${uploaded.assets[0].id}.json`);
  const original=readFileSync(receipt);
  writeFileSync(receipt,'{}');
  assert.throws(()=>updateProject(plan.id,reviewed.revision,{type:'review-source',requirementId:req.id,dimension:'rights',decision:'acceptable',rationale:'조건 확인'}),/검증 기록/);
  writeFileSync(receipt,original);
  writeFileSync(assetFile(uploaded.assets[0].path),'tampered');
  assert.throws(()=>updateProject(plan.id,reviewed.revision,{type:'detach-asset',requirementId:req.id}),/검증 기록/);
});
