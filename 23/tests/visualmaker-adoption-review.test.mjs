import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createPlan} from '../visualmaker/core/director.ts';
import {importEpisode,handoff} from '../visualmaker/core/episode.ts';
import {buildAdoptionReview,EPISODE_SPEC_PATH,PRODUCTION_STATE_PATH} from '../visualmaker/core/adoption-review.ts';
import {reviewContext} from '../visualmaker/core/source-review.ts';

const hash = value => createHash('sha256').update(value).digest('hex');
const specBytes = readFileSync(EPISODE_SPEC_PATH);
const stateBytes = readFileSync(PRODUCTION_STATE_PATH);
const review = (plan,spec=specBytes,state=stateBytes) => buildAdoptionReview(plan,spec,state);

test('unchanged EP001 maps all current IDs and preserves production boundaries and files',()=>{
  const beforeSpec=hash(readFileSync(EPISODE_SPEC_PATH)), beforeState=hash(readFileSync(PRODUCTION_STATE_PATH));
  const plan=importEpisode();
  const report=review(plan);
  const spec=JSON.parse(specBytes);
  assert.equal(report.schemaVersion,'visualmaker-adoption-review-v1');
  assert.equal(report.originMatch,true);
  assert.equal(report.scenes.length,spec.cuts.length);
  assert.deepEqual(report.scenes.flatMap(row=>row.originCutIds),spec.cuts.map(cut=>cut.shot_id));
  assert.deepEqual(report.unmappedCurrentCuts,[]);
  assert.deepEqual(report.mappingConflicts,[]);
  assert.equal(report.currentState.stage,JSON.parse(stateBytes).stage);
  assert.equal(report.currentState.activeCutRoot,JSON.parse(stateBytes).active_cut_root);
  assert.equal(report.productionAuthority,false);
  assert.equal(report.renderEligible,false);
  assert.equal(report.appliesChanges,false);
  assert.equal(report.scenes[0].direction,'unselected');
  assert.deepEqual(report.scenes[0].selectedRequirements,[]);
  assert.equal(report.scenes[0].before[0].narration,spec.cuts[0].draft_narration);
  assert.equal(report.scenes[0].after.narration,spec.cuts[0].draft_narration);
  assert.equal(report.scenes[0].timing.productionTiming,'not-compared-no-frame-conversion');
  assert.equal(hash(readFileSync(EPISODE_SPEC_PATH)),beforeSpec);
  assert.equal(hash(readFileSync(PRODUCTION_STATE_PATH)),beforeState);
});

test('selected edit compares narration and action while excluding notes and reference URLs',()=>{
  const plan=importEpisode();
  const scene=plan.scenes[0];
  scene.selectedCandidateId=scene.candidates[0].id;
  scene.candidates[0].change='변경된 화면 행동';
  const segment=plan.script.segments.find(item=>item.id===plan.beats.find(beat=>beat.id===scene.beatIds[0]).segmentIds[0]);
  segment.text='변경된 내레이션';
  plan.script.segments.push({id:'note_test',start:0,end:4,text:'연출 메모',kind:'note'});
  plan.script.segments.push({id:'ref_test',start:0,end:4,text:'https://example.com/reference',kind:'reference'});
  plan.beats.find(beat=>beat.id===scene.beatIds[0]).segmentIds.push('note_test','ref_test');
  const row=review(plan).scenes[0];
  assert.equal(row.comparisons.narration,'proposed-change');
  assert.equal(row.after.narration,'변경된 내레이션');
  assert.equal(row.after.observableAction,'변경된 화면 행동');
  assert.equal(row.comparisons.observableAction,'proposed-change');
  assert.equal(row.selectedRequirements.length,scene.candidates[0].requirementIds.length);
  assert.equal(row.alternatives.length,1);
  assert.equal(row.lockedPlanningOnly,false);
});

test('default selected end-state stays a separate planning intent, while edits remain explicit',()=>{
  const plan=importEpisode();
  const scene=plan.scenes[0];
  scene.selectedCandidateId=scene.candidates[0].id;
  let row=review(plan).scenes[0];
  assert.equal(row.before[0].takeaway,JSON.parse(specBytes).cuts[0].viewer_takeaway);
  assert.equal(row.after.candidateEndState,scene.candidates[0].endState);
  assert.equal(row.comparisons.takeaway,'not-compared-distinct-meaning');
  assert.equal(Object.hasOwn(row.after,'takeaway'),false);
  scene.candidates[0].endState='편집자가 변경한 장면 끝 상태';
  row=review(plan).scenes[0];
  assert.equal(row.after.candidateEndState,'편집자가 변경한 장면 끝 상태');
  assert.equal(row.comparisons.takeaway,'not-compared-distinct-meaning');
});

test('merge, reorder, unbound, unknown, repeated and missing mappings stay visible',()=>{
  const plan=importEpisode();
  const [a,b,c,d]=plan.scenes;
  a.originCutIds=['SH002','SH001'];
  b.originCutIds=['SH002'];
  c.originCutIds=[];
  d.originCutIds=['UNKNOWN','UNKNOWN'];
  const result=review(plan);
  assert.equal(result.scenes[0].structuralReview,'merge-proposal');
  assert.equal(result.scenes[2].structuralReview,'unbound');
  assert.ok(result.mappingConflicts.some(item=>item.kind==='reordered-cuts'));
  assert.ok(result.mappingConflicts.some(item=>item.kind==='cut-used-by-multiple-scenes'));
  assert.ok(result.mappingConflicts.some(item=>item.kind==='unknown-cut'));
  assert.ok(result.mappingConflicts.some(item=>item.kind==='duplicate-in-scene'));
  assert.ok(result.unmappedCurrentCuts.includes('SH003'));
});

test('origin mismatch, unbound plans and invalid fixed targets block without becoming ready',()=>{
  const plan=importEpisode();
  plan.origin.sha256='0'.repeat(64);
  assert.equal(review(plan).originMatch,false);
  assert.match(review(plan).editorialBlockers.join(' '),/SHA-256/);
  const unbound=review(createPlan('Synthetic','테스트 내레이션.'));
  assert.equal(unbound.originMatch,false);
  assert.match(unbound.editorialBlockers.join(' '),/결속되지/);
  const withCutIds=importEpisode();
  delete withCutIds.origin;
  let row=review(withCutIds).scenes[0];
  assert.deepEqual(row.originCutIds,['SH001']);
  assert.equal(row.originBinding,'unsupported');
  assert.equal(row.structuralReview,'unbound');
  assert.deepEqual(row.before,[]);
  assert.equal(row.comparisons.narration,'unbound');
  withCutIds.origin={kind:'episode-spec',path:'another/episode-spec.json',sha256:hash(specBytes)};
  row=review(withCutIds).scenes[0];
  assert.equal(row.structuralReview,'unbound');
  assert.equal(row.originBinding,'unsupported');
  const missing=review(plan,null,null);
  assert.equal(missing.target.spec.status,'unavailable');
  assert.equal(missing.target.state.status,'unavailable');
  assert.equal(missing.currentState,null);
  assert.ok(missing.productionBlockers.length);
  const invalid=review(plan,Buffer.from('{bad'),Buffer.from('{bad'));
  assert.equal(invalid.target.spec.status,'invalid');
  assert.equal(invalid.target.state.status,'invalid');
  const malformedState=Buffer.from(JSON.stringify({...JSON.parse(stateBytes),stage:undefined}));
  assert.equal(review(plan,specBytes,malformedState).target.state.status,'invalid');
  const state=JSON.parse(stateBytes);
  for (const render_authority of [{}, {...state.render_authority,status:17},
    {...state.render_authority,production_authority:'yes'}]) {
    const report=review(plan,specBytes,Buffer.from(JSON.stringify({...state,render_authority})));
    assert.equal(report.target.state.status,'invalid');
    assert.equal(report.target.state.reason,'unsupported-or-invalid-target-contract');
    assert.equal(report.currentState,null);
  }
  assert.equal(review(plan,Buffer.from(JSON.stringify({...JSON.parse(specBytes),schema_version:999})),stateBytes).target.spec.status,'invalid');
  assert.equal(review(plan,specBytes,Buffer.from(JSON.stringify({...state,schema_version:999}))).target.state.status,'invalid');
  assert.equal(handoff(plan).originUnchanged,false);
});

test('source observations remain non-authoritative and absent legacy reviews stay absent',()=>{
  const plan=importEpisode();
  assert.equal(Object.hasOwn(plan,'sourceReviews'),false);
  const oldHash=hash(JSON.stringify(plan));
  assert.equal(review(plan).plan.sha256,oldHash);
  assert.equal(Object.hasOwn(plan,'sourceReviews'),false);
  const scene=plan.scenes[0], candidate=scene.candidates[0], req=plan.requirements.find(item=>item.id===candidate.requirementIds[0]);
  scene.selectedCandidateId=candidate.id;
  const asset={id:'asset_test',originalName:'synthetic.png',mediaType:req.mediaType,path:'assets/synthetic.png',
    sha256:'a'.repeat(64),mimeType:'image/png',width:10,height:10,durationSeconds:null,
    sourceUrl:'https://example.com/synthetic',creator:'Test',rightsNote:'test-only',semanticNote:'test-only',
    status:'pending-review',evidenceOnly:false};
  plan.assets.push(asset); req.assetId=asset.id;
  const contextSha256=reviewContext(plan,req);
  plan.sourceReviews=['source','rights','semantic'].map((dimension,index)=>({id:`test_${index}`,requirementId:req.id,
    assetId:asset.id,assetSha256:asset.sha256,contextSha256,dimension,decision:'acceptable',rationale:'synthetic test only',
    recordedAt:'2026-01-01T00:00:00.000Z',recordedBy:'local-session',productionAuthority:false}));
  const result=review(plan);
  const item=result.scenes[0].selectedRequirements[0];
  assert.equal(item.asset.sha256,asset.sha256);
  assert.equal(item.sourceReviewState.current.rights.decision,'acceptable');
  assert.equal(item.observationsOnly,true);
  assert.equal(result.productionAuthority,false);
  assert.equal(result.renderEligible,false);
  assert.match(result.productionBlockers.join(' '),/승인 아님/);
});
