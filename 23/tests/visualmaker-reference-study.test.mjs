import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  buildReferenceStudyReadiness,
  canonicalizeYouTubeUrl,
  createReferenceStudy,
  REFERENCE_DIMENSIONS,
  validateReferenceStudy,
} from '../visualmaker/core/reference-study.ts';

const videoId = 'AbCdEf_1234';
const draft = (url=`https://www.youtube.com/watch?v=${videoId}`) => createReferenceStudy({
  studyId:'study-001',url,objective:'화면 구성, 모션, 편집 문법을 관찰하고 VisualMaker 기능 공백을 찾는다.',
});
const sha = value => createHash('sha256').update(value).digest('hex');
const evidence = (id,timeSeconds) => ({id,kind:'local-frame',frameId:`frame-${id}`,path:`references/${id}.png`,sha256:sha(`${id}:${timeSeconds}`),timeSeconds});
const complete = () => {
  const study = draft();
  const frames = [evidence('frame-a',0),evidence('frame-b',1)];
  study.observations.push({
    id:'observation-1',startSeconds:0,endSeconds:2,evidence:frames,
    dimensions:Object.fromEntries(REFERENCE_DIMENSIONS.map(dimension => [dimension,
      {status:'observed',note:`관찰된 ${dimension}`,evidenceIds:frames.map(frame => frame.id)}])),
    borrowedElements:['화면 분할 관계'],excludedElements:['원본 인물 이미지'],
    originalSubjectReplacementIntent:'원본 소재는 별도 승인된 우리 소재로 대체한다.',
  });
  return study;
};
const gapWithComparison = (targetObservationId='observation-1',sourceEvidenceIds=['frame-a','frame-b']) => ({
  id:'gap-timeline',basis:'observed',target:{kind:'observation',observationId:targetObservationId},
  requiredBehavior:'같은 원본 구간의 두 시점과 재현 결과를 짝지어 비교할 수 있어야 함',
  currentLimitation:'비교를 실행했을 때 장면 전환 시점이 대응되지 않음',
  evidence:{kind:'comparison',sourceEvidenceIds,
    reproductionEvidence:[
      {id:'repro-a',kind:'reproduction-frame',mediaType:'image/png',path:'comparisons/repro-a.png',sha256:sha('repro-a'),timeSeconds:0},
      {id:'repro-b',kind:'probe-artifact',mediaType:'application/json',path:'comparisons/repro-b.json',sha256:sha('repro-b'),timeSeconds:1},
    ],
    pairedTimepoints:[
      {sourceEvidenceId:sourceEvidenceIds[0],reproductionEvidenceId:'repro-a',sourceTimeSeconds:0,reproductionTimeSeconds:0},
      {sourceEvidenceId:sourceEvidenceIds[1],reproductionEvidenceId:'repro-b',sourceTimeSeconds:1,reproductionTimeSeconds:1},
    ],comparisonNote:'원본 1초에는 화면이 전환되었지만 재현 결과에서는 같은 시점에 전환되지 않았다.'},
  testableAcceptanceCriterion:'같은 원본·재현 시점 쌍에서 전환 위치가 일치하는지 검증한다.',
});

test('canonicalizes watch, shorts, embed and youtu.be identities while dropping tracking parameters',()=>{
  for (const url of [
    `https://www.youtube.com/watch?v=${videoId}&si=secret&utm_source=track`,
    `https://youtube.com/shorts/${videoId}?feature=share`,
    `https://www.youtube.com/embed/${videoId}?start=4`,
    `https://youtu.be/${videoId}?si=secret`,
    `https://youtube-nocookie.com/embed/${videoId}`,
  ]) {
    const parsed=canonicalizeYouTubeUrl(url);
    assert.equal(parsed.ok,true,url);
    assert.deepEqual(parsed,{ok:true,videoId,canonicalUrl:`https://www.youtube.com/watch?v=${videoId}`});
  }
});

test('rejects spoofed hosts, credentials, unsafe schemes, ports, malformed IDs, duplicate IDs and playlist-only links',()=>{
  for (const [url,reason] of [
    [`https://youtube.com.evil.test/watch?v=${videoId}`,'unsupported-youtube-host'],
    [`https://evil.test@youtube.com/watch?v=${videoId}`,'credentials-not-allowed'],
    [`javascript:alert(1)`,'unsupported-scheme'],
    [`https://youtube.com:8443/watch?v=${videoId}`,'nonstandard-port-not-allowed'],
    ['https://youtube.com/watch?v=short','invalid-video-id'],
    [`https://youtube.com/watch?v=${videoId}&v=${videoId}`,'duplicate-video-id'],
    ['https://youtube.com/playlist?list=PL123','single-video-required'],
    ['https://youtube.com/watch?list=PL123','single-video-required'],
  ]) assert.deepEqual(canonicalizeYouTubeUrl(url),{ok:false,reason});
});

test('starts with a valid empty draft and visibly blocked, unavailable capabilities',()=>{
  const study=draft('https://youtu.be/'+videoId+'?si=private');
  assert.deepEqual(validateReferenceStudy(study),{valid:true,errors:[]});
  assert.deepEqual(study.observations,[]);
  assert.equal(study.source.canonicalUrl,`https://www.youtube.com/watch?v=${videoId}`);
  assert.deepEqual(study.capabilities,{automaticAnalysis:false,remoteAccess:false,rendering:false,productionAuthority:false});
  const readiness=buildReferenceStudyReadiness(study);
  assert.equal(readiness.status,'blocked');
  assert.equal(readiness.structurallyValid,true);
  assert.equal(readiness.observationCount,0);
  assert.ok(readiness.reasons.includes('no-observations-yet'));
  assert.equal(readiness.productionAuthority,false);
});

test('rejects malformed records, unexpected fields and any declared authority',()=>{
  const base=draft();
  for (const altered of [
    {...base,productionAuthority:true},
    {...base,capabilities:{...base.capabilities,productionAuthority:true}},
    {...base,capabilities:{...base.capabilities,automaticAnalysis:true}},
    {...base,source:{...base.source,canonicalUrl:`https://youtube.com/watch?v=${videoId}&utm_source=x`}},
    {...base,source:{...base.source,videoId:'different-id'}},
  ]) assert.equal(validateReferenceStudy(altered).valid,false);
});

test('rejects malformed time windows, dimension matrices and unlinked observed notes',()=>{
  const variants=[];
  const badTime=complete(); badTime.observations[0].endSeconds=badTime.observations[0].startSeconds; variants.push(badTime);
  const badDimension=complete(); delete badDimension.observations[0].dimensions.depth; variants.push(badDimension);
  const unlinked=complete(); unlinked.observations[0].dimensions.focal.evidenceIds=['missing']; variants.push(unlinked);
  const badHash=complete(); badHash.observations[0].evidence[0].sha256='0'.repeat(64); variants.push(badHash);
  const badTimecode=complete(); badTimecode.observations[0].evidence[0].timeSeconds=9; variants.push(badTimecode);
  for (const value of variants) assert.equal(validateReferenceStudy(value).valid,false);
});

test('only safe relative POSIX evidence paths are accepted, without filename substring false positives',()=>{
  for (const path of ['/tmp/frame.png','C:/captures/frame.png','../frame.png','frames/../frame.png',
    '//server/share/frame.png','\\\\server\\share\\frame.png','frames\\frame.png','frames/C:/frame.png','frames/\0frame.png',
    'frames/placeholder.png','frames/.placeholder.png','frames/example.png','frames/fake.png','frames/dummy.png','frames/todo.png']) {
    const study=complete(); study.observations[0].evidence[0].path=path;
    assert.equal(validateReferenceStudy(study).valid,false,JSON.stringify(path));
  }
  for (const path of ['references/real-example-board.png','references/fake-blue-layout.png','references/todo-list-card.png']) {
    const study=complete(); study.observations[0].evidence[0].path=path;
    assert.equal(validateReferenceStudy(study).valid,true,path);
  }
});

test('a still alone cannot substantiate an observed motion or hold dimension',()=>{
  const study=complete();
  study.observations[0].evidence=study.observations[0].evidence.slice(0,1);
  for (const dimension of ['entrance','internal-change','transition','hold']) {
    study.observations[0].dimensions[dimension].evidenceIds=['frame-a'];
  }
  const validation=validateReferenceStudy(study);
  assert.equal(validation.valid,false);
  assert.ok(validation.errors.filter(error=>error.code==='motion-needs-distinct-time-evidence').length>=4);
  assert.equal(buildReferenceStudyReadiness(study).status,'blocked');
});

test('time-bound frame evidence can describe motion but remains unapproved and blocked',()=>{
  const study=complete();
  assert.equal(validateReferenceStudy(study).valid,true);
  const report=buildReferenceStudyReadiness(study);
  assert.equal(report.structurallyValid,true);
  assert.equal(report.localBytesVerified,false);
  assert.equal(report.humanReviewRequired,true);
  assert.equal(report.referenceFidelityPass,false);
  assert.equal(report.styleFrameEligible,false);
  assert.equal(report.cutPass,false);
  assert.equal(report.productionAuthority,false);
});

test('unknown and not-applicable dimensions stay explicit and block calibration without invalidating the draft',()=>{
  const study=complete();
  study.observations[0].dimensions.depth={status:'unknown',reason:'겹침을 판독할 충분한 프레임이 없음'};
  study.observations[0].dimensions.hold={status:'not-applicable',reason:'관찰 구간이 정지 타이틀 카드임'};
  assert.equal(validateReferenceStudy(study).valid,true);
  assert.equal(buildReferenceStudyReadiness(study).unknownDimensionCount,2);
  assert.ok(buildReferenceStudyReadiness(study).reasons.includes('dimensions-unknown-or-not-applicable'));
});

test('tool gaps and capability upgrades remain distinct from the source observations',()=>{
  const study=complete();
  const observationBefore=structuredClone(study.observations);
  study.toolGaps.push(gapWithComparison());
  study.capabilityUpgradeProposals.push({id:'upgrade-timeline',toolGapId:'gap-timeline',
    proposedCapability:'사용자 지정 프레임 쌍을 정렬해 보여주는 참조 비교 화면',
    acceptanceCriterion:'두 프레임과 편집 메모의 순서가 입력한 시간과 일치하고 원본 관찰을 덮어쓰지 않음',
    changesSourceGrammar:false,status:'proposal'});
  assert.equal(validateReferenceStudy(study).valid,true);
  assert.deepEqual(study.observations,observationBefore);
  assert.equal(buildReferenceStudyReadiness(study).localBytesVerified,false);
  const invalid=structuredClone(study); invalid.capabilityUpgradeProposals[0].changesSourceGrammar=true;
  assert.equal(validateReferenceStudy(invalid).valid,false);
  const unbound=structuredClone(study);
  unbound.toolGaps[0].basis='hypothesis';
  unbound.toolGaps[0].target={kind:'unbound',reason:'아직 원본의 특정 구간과 연결하지 않음'};
  unbound.toolGaps[0].evidence={kind:'unknown',reason:'원본과 재현 결과를 짝지은 비교를 아직 수행하지 않음'};
  assert.equal(validateReferenceStudy(unbound).valid,true);
  const falselyObserved=structuredClone(unbound); falselyObserved.toolGaps[0].basis='observed';
  assert.equal(validateReferenceStudy(falselyObserved).valid,false);
});

test('source-only evidence, cross-observation evidence, and unpaired reproduction claims cannot assert an observed gap',()=>{
  const sourceOnly=complete();
  sourceOnly.toolGaps.push({...gapWithComparison(),evidence:{kind:'comparison',sourceEvidenceIds:['frame-a','frame-b'],
    reproductionEvidence:[],pairedTimepoints:[],comparisonNote:'원본에서만 프레임을 관찰함'}});
  assert.equal(validateReferenceStudy(sourceOnly).valid,false);

  const crossObservation=complete();
  const second=structuredClone(crossObservation.observations[0]);
  second.id='observation-2'; second.evidence=[evidence('frame-c',0),evidence('frame-d',1)];
  second.dimensions=Object.fromEntries(REFERENCE_DIMENSIONS.map(dimension=>[dimension,
    {status:'observed',note:`두 번째 ${dimension}`,evidenceIds:['frame-c','frame-d']}]));
  crossObservation.observations.push(second);
  crossObservation.toolGaps.push(gapWithComparison('observation-2',['frame-a','frame-b']));
  assert.equal(validateReferenceStudy(crossObservation).valid,false);

  const noPair=complete();
  const gap=gapWithComparison(); gap.evidence.pairedTimepoints=[]; noPair.toolGaps.push(gap);
  assert.equal(validateReferenceStudy(noPair).valid,false);
});

test('validation and readiness do not mutate caller-owned study data',()=>{
  const study=complete();
  const before=structuredClone(study);
  validateReferenceStudy(study);
  buildReferenceStudyReadiness(study);
  assert.deepEqual(study,before);
});
