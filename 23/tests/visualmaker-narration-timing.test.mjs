import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createPlan, prepareImportedCopy, validatePlan} from '../visualmaker/core/director.ts';
import {attachNarrationUpload} from '../visualmaker/core/narration.ts';
import {createManualTimingDraft, estimateNarrationTiming, narrationTimingReport} from '../visualmaker/core/narration-timing.ts';
import {getProject, insertProject, narrationFile, saveNarrationTiming, updateProject} from '../visualmaker/core/store.ts';

function wav(seconds = 2) {
  const rate = 8000; const payload = Math.round(rate * seconds) * 2;
  const bytes = Buffer.alloc(44 + payload);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + payload, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(payload, 40);
  return bytes;
}
function setup(text = '한글 😀.\n\n[메모] 이 줄은 발화가 아닙니다.\n\n다음 문장입니다.') {
  process.env.VISUALMAKER_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'visualmaker-timing-'));
  const initial = insertProject(createPlan('시간 초안', text));
  const uploaded = attachNarrationUpload(initial.id, initial.revision, initial.script.rawSha256, 'narration.wav', wav());
  return {initial, uploaded};
}
function rows(plan, take) {
  return estimateNarrationTiming(plan, take).segments.map(row => ({segmentId:row.segmentId,
    startSeconds:row.startSeconds, endSeconds:row.endSeconds}));
}

test('Unicode text weights exclude notes and end at the measured audio duration', () => {
  const {uploaded} = setup();
  const estimate = estimateNarrationTiming(uploaded.plan, uploaded.take);
  const narration = uploaded.plan.script.segments.filter(item => item.kind === 'narration');
  assert.equal(estimate.method, 'text-weighted-estimate');
  assert.equal(estimate.observedSpeech, false);
  assert.deepEqual(estimate.segments.map(item => item.segmentId), narration.map(item => item.id));
  assert.ok(estimate.segments.every(item => !item.text.includes('메모')));
  assert.equal(estimate.segments[0].startSeconds, 0);
  assert.equal(estimate.segments.at(-1).endSeconds, uploaded.take.durationSeconds);
  const weights = narration.map(item => [...item.text].filter(char => !/\s/u.test(char)).length);
  assert.ok(Math.abs(estimate.segments[0].endSeconds - uploaded.take.durationSeconds * weights[0] / (weights[0] + weights[1])) < 1e-10);
});

test('saved timing is an immutable draft, survives reload and unrelated edits, then becomes stale with script change', () => {
  const {initial, uploaded} = setup();
  const beforeScenes = structuredClone(uploaded.plan.scenes);
  const estimate = rows(uploaded.plan, uploaded.take);
  estimate[0].endSeconds -= 0.05;
  estimate[1].startSeconds += 0.05;
  const saved = saveNarrationTiming(initial.id, uploaded.plan.revision, uploaded.take.id,
    uploaded.plan.script.rawSha256, uploaded.take.sha256, estimate, true);
  assert.equal(saved.timing.method, 'manual-timing-draft');
  assert.equal(saved.timing.productionAuthority, false);
  assert.deepEqual(saved.plan.scenes, beforeScenes);
  assert.deepEqual(getProject(initial.id).narrationTimings, [saved.timing]);
  let report = narrationTimingReport(getProject(initial.id), uploaded.take.id);
  assert.equal(report.current.id, saved.timing.id);
  assert.equal(report.estimate, null);
  const edited = updateProject(initial.id, saved.plan.revision, {type:'edit-beat', beatId:initial.beats[0].id,
    intent:'발화는 그대로 두고 장면 의도만 변경', role:'context'});
  report = narrationTimingReport(edited, uploaded.take.id);
  assert.equal(report.current.id, saved.timing.id);
  const second = saveNarrationTiming(initial.id, edited.revision, uploaded.take.id, edited.script.rawSha256, uploaded.take.sha256, rows(edited, uploaded.take), true);
  assert.notEqual(second.timing.id, saved.timing.id);
  assert.equal(second.plan.narrationTimings.length, 2);
  assert.equal(narrationTimingReport(second.plan, uploaded.take.id).current.id, second.timing.id);
  const revised = updateProject(initial.id, second.plan.revision, {type:'revise-script', text:'변경된 대본입니다.'});
  report = narrationTimingReport(revised, uploaded.take.id);
  assert.equal(report.current, null);
  assert.equal(report.estimate, null);
  assert.equal(report.history.length, 2);
  assert.equal(report.currentScriptMatch, false);
  const reverted = updateProject(initial.id, revised.revision, {type:'revise-script', text:initial.script.rawText});
  const renamed = structuredClone(reverted);
  const segmentIds = new Map(renamed.script.segments.map(item => [item.id, `${item.id}-replanned`]));
  renamed.script.segments = renamed.script.segments.map(item => ({...item, id:segmentIds.get(item.id)}));
  renamed.beats = renamed.beats.map(item => ({...item, segmentIds:item.segmentIds.map(id => segmentIds.get(id))}));
  report = narrationTimingReport(validatePlan(renamed), uploaded.take.id);
  assert.equal(report.currentScriptMatch, true);
  assert.equal(report.current, null);
  assert.ok(report.estimate);
  assert.equal(report.history.length, 2);
  assert.notDeepEqual(report.estimate.segments.map(item => item.segmentId), saved.timing.segments.map(item => item.segmentId));
  assert.deepEqual(insertProject(prepareImportedCopy(reverted), true).narrationTimings, []);
});

test('range, coverage, type and binding errors fail without creating a revision', () => {
  const {initial, uploaded} = setup();
  const valid = rows(uploaded.plan, uploaded.take);
  const malformed = [
    valid.slice(1),
    [{...valid[0]}, {...valid[0]}],
    valid.map((item, i) => i === 0 ? {...item, segmentId:'note-id'} : item),
    valid.map((item, i) => i === 0 ? {...item, startSeconds:-0.1} : item),
    valid.map((item, i) => i === 0 ? {...item, endSeconds:item.startSeconds} : item),
    valid.map((item, i) => i === 1 ? {...item, startSeconds:valid[0].endSeconds - 0.001} : item),
    valid.map((item, i) => i === 1 ? {...item, endSeconds:uploaded.take.durationSeconds + 0.001} : item),
    valid.map((item, i) => i === 0 ? {...item, startSeconds:NaN} : item),
    valid.map((item, i) => i === 0 ? {...item, endSeconds:'1'} : item),
    valid.map((item, i) => i === 0 ? {...item, approved:true} : item),
  ];
  for (const candidate of malformed) assert.throws(() => createManualTimingDraft(uploaded.plan, uploaded.take, candidate, true));
  assert.throws(() => saveNarrationTiming(initial.id, 1, uploaded.take.id, uploaded.plan.script.rawSha256, uploaded.take.sha256, valid, true), error => error.status === 409);
  assert.throws(() => saveNarrationTiming(initial.id, 2, uploaded.take.id, '0'.repeat(64), uploaded.take.sha256, valid, true), error => error.status === 409);
  assert.throws(() => saveNarrationTiming(initial.id, 2, uploaded.take.id, uploaded.plan.script.rawSha256, '0'.repeat(64), valid, true), error => error.status === 409);
  assert.throws(() => saveNarrationTiming(initial.id, 2, 'take_missing', uploaded.plan.script.rawSha256, uploaded.take.sha256, valid, true), error => error.status === 404);
  assert.equal(getProject(initial.id).revision, 2);
  assert.throws(() => createManualTimingDraft(uploaded.plan, uploaded.take, valid, false));
  const draft = createManualTimingDraft(uploaded.plan, uploaded.take, valid, true);
  for (const changed of [
    {...draft, approved:true},
    {...draft, productionAuthority:true},
    {...draft, method:'forced-alignment'},
    {...draft, reviewStatus:'approved'},
    {...draft, segments:[{...draft.segments[0], extra:'claim'}, ...draft.segments.slice(1)]},
    {...draft, segments:[{...draft.segments[0], text:'바뀐 문장'}, ...draft.segments.slice(1)]},
  ]) assert.throws(() => validatePlan({...uploaded.plan, revision:3, narrationTimings:[changed]}));
  writeFileSync(narrationFile(uploaded.take), Buffer.from('tampered'));
  assert.throws(() => saveNarrationTiming(initial.id, 2, uploaded.take.id, uploaded.plan.script.rawSha256, uploaded.take.sha256, valid, true), /검증 기록/);
});
