import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {applyAIAnalysisIntentBatch,applyCommand,createPlan,validatePlan} from '../visualmaker/core/director.ts';
import {adoptedSourceBrief,selectedBriefQuery} from '../src/components/studio/adopted-source-brief.ts';

const clone=value=>structuredClone(value);
const hash='a'.repeat(64);
const ko='실제 종이배 물 위 움직임 원본',en='real paper boat moving on water original';
function fixture(role){
  const before=createPlan('검색 제안 테스트','종이배가 물 위를 움직입니다.');
  if(role)before.beats[0].role=role;
  const beat=before.beats[0],scene=before.scenes[0],segment=before.script.segments[0],meaning='종이배의 실제 움직임과 맥락';
  let plan=applyAIAnalysisIntentBatch(before,[{beatId:beat.id,intent:meaning}]);
  plan=applyCommand(plan,{type:'select',sceneId:scene.id,candidateId:plan.scenes[0].candidates[0].id});
  plan.aiAnalysisAdoption={schemaVersion:'visualmaker-ai-analysis-adoption-v1',id:`adopt_${randomUUID()}`,
    createdAt:new Date().toISOString(),jobId:`job_${randomUUID()}`,artifactSha256:hash,
    scope:{projectId:plan.id,revision:before.revision,scriptSha256:plan.script.rawSha256,snapshotSha256:hash},
    model:{adapter:'codex-cli',requestedModelId:'codex/test',responseModelId:null},
    beforeRevision:before.revision,afterRevision:before.revision+1,scriptSha256:plan.script.rawSha256,
    productionAuthority:false,requiresHumanReview:true,
    records:[{segmentId:segment.id,beatId:beat.id,sceneId:scene.id,
      source:{start:segment.start,end:segment.end,text:segment.text,kind:segment.kind},
      mainMessage:meaning,uncertainty:'원본 확인 필요',visualMeaningBrief:'종이배 움직임',
      searchBriefKo:ko,searchBriefEn:en,beforeIntent:beat.intent,appliedIntent:meaning}]};
  return {plan:validatePlan(plan),requirementId:plan.scenes[0].candidates[0].layers[0].requirementId};
}

test('selected adopted draft provides complete Korean and English suggestions after candidate selection advanced revision',()=>{
  const {plan,requirementId}=fixture(),brief=adoptedSourceBrief(plan,requirementId);
  assert.ok(brief);assert.deepEqual(brief,{ko,en});
  assert.equal(plan.revision,plan.aiAnalysisAdoption.afterRevision+1);
  assert.equal(selectedBriefQuery(brief,'ko'),ko);
  assert.equal(selectedBriefQuery(brief,'en'),en);
  assert.equal(plan.requirements.find(item=>item.id===requirementId).queryEn,'');
  assert.equal(plan.productionAuthority,false);
});

test('long suggestions remain complete local draft text, without silent 120-character slicing',()=>{
  const {plan,requirementId}=fixture(),long='원본 자료 '.repeat(65).trim();
  assert.ok(long.length>120&&long.length<=600);
  plan.aiAnalysisAdoption.records[0].searchBriefKo=long;
  const suggestion=adoptedSourceBrief(plan,requirementId);
  assert.equal(selectedBriefQuery(suggestion,'ko'),long);
  const ui=readFileSync(new URL('../src/components/studio/live-source.tsx',import.meta.url),'utf8');
  assert.match(ui,/onClick=\{\(\)=>\{invalidate\(\);setQuery\(selectedBriefQuery\(adoptedBrief,'ko'\)\);\}\}/);
  assert.match(ui,/queryLength<=120/);
  assert.match(ui,/!queryValid/);
  assert.doesNotMatch(ui,/maxLength=\{120\}/);
  assert.doesNotMatch(ui,/selectedBriefQuery\([^\n]*slice\(/);
});

test('canonical multiline Korean and English briefs survive selection unchanged while search waits for editing',()=>{
  const {plan,requirementId}=fixture();
  const multilineKo='종이배 원본\n물 위 움직임',multilineEn='paper boat source\r\nmoving on water';
  plan.aiAnalysisAdoption.records[0].searchBriefKo=multilineKo;
  plan.aiAnalysisAdoption.records[0].searchBriefEn=multilineEn;
  const brief=adoptedSourceBrief(plan,requirementId);
  assert.ok(brief);
  assert.equal(selectedBriefQuery(brief,'ko'),multilineKo);
  assert.equal(selectedBriefQuery(brief,'en'),multilineEn);
  const ui=readFileSync(new URL('../src/components/studio/live-source.tsx',import.meta.url),'utf8');
  assert.match(ui,/queryValid=queryLength>=2&&queryLength<=120&&/);
  assert.match(ui,/!\/\[\\u0000-\\u001f\\u007f\]\/u\.test\(query\)/);
  assert.match(ui,/if\(!queryValid\|\|/);
  assert.match(ui,/여러 줄 제안은 직접 다듬어 주세요/);
  assert.doesNotMatch(ui,/replace\(\/\\[nr]/);
});

test('stale receipt scope, source, intent, revision and malformed brief all fail closed',()=>{
  const {plan,requirementId}=fixture(),original=clone(plan);
  const changes=[
    p=>{p.aiAnalysisAdoption.scope.projectId='another-project';},
    p=>{p.aiAnalysisAdoption.scope.scriptSha256='b'.repeat(64);},
    p=>{p.aiAnalysisAdoption.scriptSha256='b'.repeat(64);},
    p=>{p.script.rawSha256='b'.repeat(64);},
    p=>{p.aiAnalysisAdoption.scope.revision++;},
    p=>{p.aiAnalysisAdoption.afterRevision=p.revision+1;},
    p=>{p.aiAnalysisAdoption.afterRevision=-1;},
    p=>{p.aiAnalysisAdoption.beforeRevision=0;},
    p=>{p.aiAnalysisAdoption.records[0].source.start++;},
    p=>{p.aiAnalysisAdoption.records[0].source.text='다른 문장';},
    p=>{p.aiAnalysisAdoption.records[0].source.kind='reference';},
    p=>{p.beats[0].intent='다시 수정한 의미';},
    p=>{p.aiAnalysisAdoption.records[0].appliedIntent='다른 의미';},
    p=>{p.aiAnalysisAdoption.records[0].searchBriefKo=' 공백';},
    p=>{p.aiAnalysisAdoption.records[0].searchBriefKo='제어\u000b문자';},
    p=>{p.aiAnalysisAdoption.records[0].searchBriefEn='control\u0000code';},
    p=>{p.aiAnalysisAdoption.records[0].searchBriefKo='';},
    p=>{p.aiAnalysisAdoption.records[0].searchBriefEn='a'.repeat(601);},
    p=>{p.aiAnalysisAdoption.productionAuthority=true;},
    p=>{p.aiAnalysisAdoption.requiresHumanReview=false;},
    p=>{p.aiAnalysisAdoption=undefined;},
  ];
  for(const change of changes){const altered=clone(original);change(altered);
    assert.equal(adoptedSourceBrief(altered,requirementId),null,change.toString());}
});

test('scene mapping, selected candidate, exact layer and original draft must still match',()=>{
  const {plan,requirementId}=fixture(),changes=[
    p=>{p.scenes[0].locked=true;},
    p=>{p.scenes[0].selectedCandidateId=null;},
    p=>{p.scenes[0].selectedCandidateId='foreign';},
    p=>{p.scenes[0].candidates[0].label='edited';},
    p=>{p.scenes[0].candidates[0].layers[0].requirementId=null;},
    p=>{p.scenes[0].candidates[0].requirementIds=[];},
    p=>{p.scenes.push({...clone(p.scenes[0]),id:'another-scene'});},
    p=>{p.scenes[0].beatIds.push('extra-beat');},
    p=>{p.beats[0].segmentIds.push('extra-segment');},
    p=>{p.aiAnalysisAdoption.records[0].sceneId='foreign';},
    p=>{p.aiAnalysisAdoption.records[0].beatId='foreign';},
    p=>{p.aiAnalysisAdoption.records.push({...clone(p.aiAnalysisAdoption.records[0])});},
    p=>{p.requirements.find(item=>item.id===requirementId).queryKo='edited';},
    p=>{p.requirements.find(item=>item.id===requirementId).description='regenerated';},
    p=>{p.requirements.find(item=>item.id===requirementId).assetId='already-acquired';},
  ];
  for(const change of changes){const altered=clone(plan);change(altered);
    assert.equal(adoptedSourceBrief(altered,requirementId),null,change.toString());}
  assert.equal(adoptedSourceBrief(plan,'foreign-requirement'),null);
});

test('unsupported or acquired requirements are never suggested',()=>{
  const {plan,requirementId}=fixture('comparison');
  const evidence=plan.scenes[0].candidates[0].requirementIds.find(id=>id!==requirementId);
  assert.equal(adoptedSourceBrief(plan,evidence),null);
  assert.ok(adoptedSourceBrief(plan,requirementId));
  const altered=clone(plan);altered.requirements.find(item=>item.id===requirementId).acquisition='generated-keyframe';
  assert.equal(adoptedSourceBrief(altered,requirementId),null);
});

test('suggestion control has no network handler; only a separate form submission calls search',()=>{
  const ui=readFileSync(new URL('../src/components/studio/live-source.tsx',import.meta.url),'utf8');
  const controls=ui.match(/onClick=\{\(\)=>\{invalidate\(\);setQuery\(selectedBriefQuery\(adoptedBrief,'(?:ko|en)'\)\);\}\}/g);
  assert.equal(controls?.length,2);
  assert.match(ui,/<form onSubmit=\{event=>void search\(event\)\}>/);
  assert.match(ui,/currentLiveRequest\(expected,scopeRef\.current,epoch,epochRef\.current,controller\.signal\.aborted\)/);
  const studio=readFileSync(new URL('../src/components/studio/studio.tsx',import.meta.url),'utf8');
  assert.match(studio,/adoptedBrief=\{adoptedSourceBrief\(plan,id\)\}/);
  assert.match(studio,/key=\{`\$\{plan\.id\}:\$\{plan\.revision\}:\$\{plan\.script\.rawSha256\}:\$\{id\}`\}/);
});
