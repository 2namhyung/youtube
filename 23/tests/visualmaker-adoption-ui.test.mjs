import test from 'node:test';
import assert from 'node:assert/strict';
import {AdoptionReviewController, parseAdoptionHandoff} from '../src/components/studio/adoption-review-client.ts';

const hash='a'.repeat(64);
const target=path=>({path,sha256:hash,status:'available',reason:null});
function fixture(projectId='project-one',revision=1){return {
  schemaVersion:'visualmaker-editorial-handoff-v1',status:'proposal-only',productionAuthority:false,
  renderEligible:false,appliesChanges:false,manualAdoptionRequired:true,projectId,revision,
  adoptionReview:{schemaVersion:'visualmaker-adoption-review-v1',status:'blocked-proposal',productionAuthority:false,
    manualAdoptionRequired:true,renderEligible:false,appliesChanges:false,target:{
      spec:target('video/episodes/episode-001/episode-spec.json'),
      state:target('video/episodes/episode-001/production-state.json')},
    originMatch:true,plan:{projectId,revision,sha256:hash,
      origin:{kind:'episode-spec',path:'video/episodes/episode-001/episode-spec.json',sha256:hash}},
    currentState:{stage:'timing-draft',expectedCutCount:1,
      activeCutRoot:null,renderAuthorityStatus:'blocked',declaredProductionAuthority:false,note:'validator PASS 아님'},
    currentCutCount:1,scenes:[{sceneId:'scene-1',proposedOrder:1,originCutIds:['SH001'],originalOrder:[1],
      structuralReview:'single-cut-comparison',originBinding:'current',lockedPlanningOnly:false,
      selectedCandidateId:'candidate-1',direction:'selected',alternatives:[{id:'candidate-2',label:'대안',mode:'remotion',reason:'비교'}],
      before:[{shotId:'SH001',narration:'전',purpose:'전 목적',mode:'source-photo',observableAction:'전 행동',takeaway:'원본 이해'}],
      after:{narration:'후',purpose:['후 목적'],beatRoles:['comparison'],mode:'remotion',observableAction:'후 행동',
        candidateEndState:'제안 끝 상태',startState:'시작'},
      comparisons:{narration:'proposed-change',purpose:'proposed-change',mode:'proposed-change',observableAction:'proposed-change',takeaway:'not-compared-distinct-meaning'},
      timing:{planningEstimatedSeconds:4,productionTiming:'not-compared-no-frame-conversion'},
      selectedRequirements:[{requirementId:'req-1',description:'자료',asset:null,sourceReviewState:null,observationsOnly:true,productionAuthority:false}],
      productionAuthority:false}],unmappedCurrentCuts:[],mappingConflicts:[],editorialBlockers:[],
    productionBlockers:['사람 검토 필요'],manualSteps:['수동 반영'],rendererStatus:'not-implemented'}
};}
const deferred=()=>{let resolve;let reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('rejects wrong project/revision, false authority flags and malformed rows',()=>{
  const good=fixture();
  assert.equal(parseAdoptionHandoff(good,'project-one',1).scenes.length,1);
  assert.throws(()=>parseAdoptionHandoff(good,'project-two',1));
  assert.throws(()=>parseAdoptionHandoff(good,'project-one',2));
  for(const change of [
    payload=>{payload.productionAuthority=true;},
    payload=>{payload.adoptionReview.renderEligible=true;},
    payload=>{payload.adoptionReview.scenes[0].productionAuthority=true;},
    payload=>{payload.adoptionReview.scenes[0].selectedRequirements[0].productionAuthority=true;},
    payload=>{payload.adoptionReview.scenes[0].before[0].narration=null;},
    payload=>{payload.adoptionReview.scenes[0].selectedRequirements=null;},
    payload=>{payload.adoptionReview.scenes[0].selectedCandidateId=null;},
    payload=>{payload.adoptionReview.scenes[0].direction='unselected';},
    payload=>{payload.adoptionReview.scenes[0].after.mode=null;},
    payload=>{payload.adoptionReview.scenes[0].after.candidateEndState=null;},
    payload=>{payload.adoptionReview.scenes[0].before[0].shotId='SH999';},
    payload=>{payload.adoptionReview.scenes[0].structuralReview='ready';},
    payload=>{payload.adoptionReview.scenes[0].originBinding='approved';},
    payload=>{payload.adoptionReview.scenes[0].comparisons.narration='unchanged-verified';},
    payload=>{payload.adoptionReview.scenes[0].comparisons.takeaway='same';},
    payload=>{payload.adoptionReview.target.spec.sha256=null;},
    payload=>{payload.adoptionReview.target.spec.path='other/spec.json';},
    payload=>{payload.adoptionReview.target.state.status='unavailable';},
    payload=>{payload.adoptionReview.originMatch=true;payload.adoptionReview.plan.origin.sha256='b'.repeat(64);},
    payload=>{payload.adoptionReview.productionBlockers=[];},
    payload=>{payload.adoptionReview.scenes[0].selectedRequirements[0].asset={id:'asset-1',path:'a.png',sha256:hash,sourceUrl:'https://example.test',creator:'Test',rightsNote:'pending',semanticNote:'pending',status:'approved',evidenceOnly:false};},
  ]){const payload=fixture();change(payload);assert.throws(()=>parseAdoptionHandoff(payload,'project-one',1));}
});

test('valid unselected and merge or partially unknown cut mappings stay reviewable',()=>{
  const unselected=fixture();const row=unselected.adoptionReview.scenes[0];
  row.selectedCandidateId=null;row.direction='unselected';row.after.mode=null;
  row.after.startState=null;row.after.observableAction=null;row.after.candidateEndState=null;
  row.selectedRequirements=[];row.comparisons.mode='direction-unselected';
  row.comparisons.observableAction='direction-unselected';row.comparisons.takeaway='direction-unselected';
  assert.equal(parseAdoptionHandoff(unselected,'project-one',1).scenes[0].direction,'unselected');

  const merge=fixture();const merged=merge.adoptionReview.scenes[0];
  merged.originCutIds=['SH001','SH002','UNKNOWN'];merged.originalOrder=[1,2,null];
  merged.structuralReview='merge-proposal';merged.before.push({...merged.before[0],shotId:'SH002'});
  merge.adoptionReview.currentCutCount=2;
  assert.equal(parseAdoptionHandoff(merge,'project-one',1).scenes[0].before.length,2);
});

test('late previous project response cannot replace the current report',async()=>{
  const old=deferred(),latest=deferred();const requests=[];
  const controller=new AdoptionReviewController((id,signal)=>{requests.push({id,signal});return id==='project-one'?old.promise:latest.promise;},()=>{});
  const first=controller.open('project-one',1);
  controller.contextChanged('project-two',2);
  const second=controller.open('project-two',2);
  assert.equal(requests[0].signal.aborted,true);
  latest.resolve(fixture('project-two',2));await second;
  old.resolve(fixture('project-one',1));await first;
  assert.equal(controller.snapshot.status,'ready');
  assert.equal(controller.snapshot.report.plan.projectId,'project-two');
  assert.deepEqual(requests.map(item=>item.id),['project-one','project-two']);
});

test('close and unmount invalidate late responses',async()=>{
  const closeRequest=deferred();const controller=new AdoptionReviewController(()=>closeRequest.promise,()=>{});
  const first=controller.open('project-one',1);controller.close();closeRequest.resolve(fixture());await first;
  assert.equal(controller.snapshot.status,'closed');
  const unmountRequest=deferred();const secondController=new AdoptionReviewController(()=>unmountRequest.promise,()=>{});
  const second=secondController.open('project-one',1);secondController.dispose();unmountRequest.resolve(fixture());await second;
  assert.equal(secondController.snapshot.status,'closed');
});

test('failed fetch has visible error state and refetch replaces it with current hashes',async()=>{
  let calls=0;const controller=new AdoptionReviewController(async()=>{
    calls++;if(calls===1)throw new Error('일시적 오류');
    const value=fixture();value.adoptionReview.target.spec.sha256='b'.repeat(64);value.adoptionReview.originMatch=false;
    value.adoptionReview.scenes[0].originBinding='stale';return value;
  },()=>{});
  await controller.open('project-one',1);
  assert.equal(controller.snapshot.status,'error');assert.match(controller.snapshot.error,/일시적 오류/);
  await controller.open('project-one',1);
  assert.equal(controller.snapshot.status,'ready');
  assert.equal(controller.snapshot.report.target.spec.sha256,'b'.repeat(64));
  assert.equal(calls,2);
});
