import assert from 'node:assert/strict';
import test from 'node:test';

import {evaluateBriefCandidate, summarizeCutSequence} from '../video/source-intake/episode-001/source-selection-v02/sequence-coverage.mjs';

const brief={brief_id:'SH001-action',role:'production-visible'};
const candidate={candidate_id:'A',media_type:'video',fit:'subject-fit',subject_family:'document-handoff',brief_evidence:{}};

test('subject-fit label alone cannot satisfy a visual brief',()=>{
  const row=evaluateBriefCandidate(candidate,brief,'source-video');
  assert.equal(row.exact_fit,false);
  assert.equal(row.gap_reason,'missing-brief-specific-action-place-viewpoint-evidence');
});

test('exact video evidence requires subject, action, place, viewpoint, and a positive source moment',()=>{
  const complete={...candidate,brief_evidence:{[brief.brief_id]:{observed_subject:'담당자와 문서',observed_action:'문서를 건네고 받는다',observed_place_context:'기관 접수 창구',viewpoint_or_scale:'손과 문서가 보이는 근경',exact_source_moment:{start_seconds:2.1,end_seconds:4.4}}}};
  assert.equal(evaluateBriefCandidate(complete,brief,'source-video').exact_fit,true);
  const incomplete=structuredClone(complete);delete incomplete.brief_evidence[brief.brief_id].observed_action;
  assert.equal(evaluateBriefCandidate(incomplete,brief,'source-video').exact_fit,false);
});

test('multiple crops or files do not make a cut sequence ready while a required beat lacks exact evidence',()=>{
  const cut={briefs:[{...brief,status:'exact-brief-evidence-pending-human-review',candidates:[{candidate_id:'A',exact_fit:true}]},{brief_id:'SH001-place',role:'production-visible',status:'partial-candidate-gap',candidates:[{candidate_id:'B',exact_fit:false}]}]};
  const summary=summarizeCutSequence(cut,[candidate,{...candidate,candidate_id:'B',subject_family:'document-handoff'}]);
  assert.equal(summary.sequence_ready,false);
  assert.equal(summary.exact_briefs,1);
  assert.equal(summary.partial_briefs,1);
});

test('photo cannot satisfy a source-video brief even with complete still evidence',()=>{
  const photo={...candidate,media_type:'photo',brief_evidence:{[brief.brief_id]:{observed_subject:'문서',observed_action:'정지된 문서',observed_place_context:'책상',viewpoint_or_scale:'근경',exact_source_moment:{still_frame:true}}}};
  assert.equal(evaluateBriefCandidate(photo,brief,'source-video').gap_reason,'production-mode-mismatch');
});
