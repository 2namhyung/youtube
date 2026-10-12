import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, ContractError, createPlan, planCsv, requirementsExport, scriptDiff, validatePlan } from '../visualmaker/core/director.ts';

const firstCandidate = (plan, index = 0) => plan.scenes[index].candidates[0];

test('createPlan uses Unicode code point spans and excludes notes/references from beats', () => {
  const plan = createPlan('unicode', '😀 첫 문장\n\nNOTE: 카메라 메모\n\nREFERENCE: 출처 메모\n\n둘째 문장');
  assert.equal(plan.script.segments.length, 4);
  assert.deepEqual(plan.script.segments.map((item) => item.kind), ['narration', 'note', 'reference', 'narration']);
  assert.equal(plan.beats.length, 2);
  assert.equal(plan.scenes.length, 2);
  assert.equal(plan.script.segments[0].start, 0);
  assert.equal(plan.script.segments[0].end, Array.from('😀 첫 문장').length);
  assert.equal(plan.productionAuthority, false);
});

test('draft scenes cover every beat exactly once and alternatives stay source-compatible', () => {
  const plan = createPlan('coverage', '사람이 문을 엽니다.\n\n법은 3년의 기간을 둡니다.');
  assert.deepEqual(plan.scenes.flatMap((scene) => scene.beatIds).sort(), plan.beats.map((beat) => beat.id).sort());
  for (const scene of plan.scenes) {
    assert.equal(scene.candidates.length, 2);
    assert.equal(new Set(scene.candidates.map((candidate) => candidate.mode)).size, 1);
    for (const candidate of scene.candidates) assert.equal(candidate.layers.filter((layer) => layer.role === 'focal').length, 1);
  }
  assert.equal(plan.scenes[1].candidates[0].mode, 'remotion');
  assert.equal(plan.scenes[0].candidates[0].mode, 'source-video');
});

test('select and lock preserve the selection and reject later scene edits', () => {
  let plan = createPlan('lock', '한 문장입니다.');
  const scene = plan.scenes[0];
  plan = applyCommand(plan, { type: 'select', sceneId: scene.id, candidateId: firstCandidate(plan).id });
  plan = applyCommand(plan, { type: 'lock', sceneId: scene.id, locked: true });
  assert.equal(plan.scenes[0].locked, true);
  assert.throws(() => applyCommand(plan, { type: 'edit-candidate', sceneId: scene.id, candidateId: firstCandidate(plan).id, changes: { reason: '수정' } }), (error) => error instanceof ContractError && error.status === 423);
});

test('script revision increments once and invalidates only the affected scene', () => {
  let plan = createPlan('revision', '그대로 둡니다.\n\n바뀔 문장입니다.');
  const stableId = plan.scenes[0].id;
  plan = applyCommand(plan, { type: 'select', sceneId: stableId, candidateId: firstCandidate(plan).id });
  const revised = applyCommand(plan, { type: 'revise-script', text: '그대로 둡니다.\n\n새로운 문장입니다.' });
  assert.equal(revised.revision, 3);
  assert.equal(revised.scenes[0].id, stableId);
  assert.equal(revised.scenes[0].selectedCandidateId, firstCandidate(plan).id);
  assert.equal(revised.scenes[1].selectedCandidateId, null);
  assert.equal(revised.script.history.length, 1);
  assert.deepEqual(scriptDiff(plan, '그대로 둡니다.\n\n새로운 문장입니다.').changedSceneIds, [plan.scenes[1].id]);
});

test('malformed imports, unknown references, focal violations, and readiness injection fail closed', () => {
  const plan = createPlan('invalid', '한 문장입니다.');
  assert.throws(() => validatePlan({ ...plan, productionAuthority: true }), /production authority/u);
  assert.throws(() => validatePlan({ ...plan, scenes: [{ ...plan.scenes[0], beatIds: ['missing'] }] }), /unknown beat/u);
  assert.throws(() => validatePlan({ ...plan, scenes: [{ ...plan.scenes[0], candidates: [{ ...plan.scenes[0].candidates[0], layers: plan.scenes[0].candidates[0].layers.filter((layer) => layer.role !== 'focal') }] }] }), /exactly one focal/u);
  assert.throws(() => validatePlan({ ...plan, approved: true }), /draft contract/u);
});

test('attach-asset requires a matching media type and assets remain pending review', () => {
  let plan = createPlan('asset', '사진이 필요합니다.');
  const requirement = plan.requirements[0];
  const asset = { id: 'asset-1', originalName: 'photo.jpg', mediaType: 'image', path: 'uploads/photo.jpg', sha256: 'a'.repeat(64), mimeType: 'image/jpeg', width: 100, height: 100, durationSeconds: null, sourceUrl: '', creator: '', rightsNote: '검토 필요', semanticNote: '사진', status: 'pending-review', evidenceOnly: true };
  assert.throws(() => applyCommand(plan, { type: 'attach-asset', requirementId: requirement.id, asset: { ...asset, mediaType: 'video' } }), /media type/u);
  assert.throws(() => applyCommand(plan, { type: 'attach-asset', requirementId: requirement.id, asset }), /evidence-only/u);
  asset.evidenceOnly = false;
  plan = applyCommand(plan, { type: 'attach-asset', requirementId: requirement.id, asset });
  assert.equal(plan.assets[0].status, 'pending-review');
  assert.equal(requirementsExport(plan).requirements[0].status, 'pending-review');
});

test('planCsv escapes spreadsheet formulas and exports note rows without fake readiness', () => {
  const plan = createPlan('csv', '=SUM 위험 문장\n\nNOTE: 메모');
  const csv = planCsv(plan);
  assert.match(csv, /'=SUM 위험 문장/u);
  assert.equal(plan.assets.length, 0);
  assert.equal(plan.scenes.some((scene) => scene.reviewStatus === 'direction-selected'), false);
});

test('script revision rebuilds affected candidates and requirements instead of retaining old narrative', () => {
  let plan = createPlan('stale', '오래된 대상과 행동을 보여줍니다.');
  const oldCandidateId = plan.scenes[0].candidates[0].id;
  plan = applyCommand(plan, { type: 'select', sceneId: plan.scenes[0].id, candidateId: oldCandidateId });
  const revised = applyCommand(plan, { type: 'revise-script', text: '완전히 다른 법률 기간을 비교합니다.' });
  assert.equal(revised.scenes[0].selectedCandidateId, null);
  assert.notEqual(revised.scenes[0].candidates[0].id, oldCandidateId);
  assert.equal(revised.scenes[0].candidates.some((candidate) => candidate.reason.includes('오래된')), false);
  assert.equal(revised.requirements.some((requirement) => requirement.description.includes('오래된')), false);
});

test('merge requires compatible modes and merged alternatives cover both beats and requirements', () => {
  const plan = createPlan('merge', '첫 번째 맥락입니다.\n\n두 번째 맥락입니다.');
  plan.scenes[0].originCutIds = ['cut-1'];
  plan.scenes[1].originCutIds = ['cut-2'];
  validatePlan(plan);
  const merged = applyCommand(plan, { type: 'merge-next', sceneId: plan.scenes[0].id });
  assert.equal(merged.scenes.length, 1);
  assert.equal(merged.scenes[0].beatIds.length, 2);
  const union = new Set([...plan.scenes[0].candidates[0].requirementIds, ...plan.scenes[1].candidates[0].requirementIds]);
  assert.deepEqual(new Set(merged.scenes[0].candidates[0].requirementIds), union);
  assert.deepEqual(merged.scenes[0].originCutIds, ['cut-1', 'cut-2']);
  const incompatible = createPlan('merge', '사람이 걷습니다.\n\n법은 3년의 기간입니다.');
  assert.throws(() => applyCommand(incompatible, { type: 'merge-next', sceneId: incompatible.scenes[0].id }), /incompatible candidate modes/u);
});

test('repeated insertions create unique revision, beat, and scene identities', () => {
  const n = String.fromCharCode(10);
  let plan = createPlan('history', '기존 문장.');
  plan = applyCommand(plan, { type: 'revise-script', text: '새 문장.' + n + n + '기존 문장.' });
  const stableSceneId = plan.scenes.find((scene) => plan.script.segments.some((segment) => segment.text === '기존 문장.' && scene.beatIds.some((beatId) => plan.beats.find((beat) => beat.id === beatId)?.segmentIds.includes(segment.id))))?.id;
  plan = applyCommand(plan, { type: 'revise-script', text: '또 다른 문장.' + n + n + '새 문장.' + n + n + '기존 문장.' });
  plan = applyCommand(plan, { type: 'revise-script', text: '세 번째 문장.' + n + n + '또 다른 문장.' + n + n + '새 문장.' + n + n + '기존 문장.' });
  assert.equal(new Set(plan.script.history.map((entry) => entry.id)).size, plan.script.history.length);
  assert.equal(new Set(plan.beats.map((beat) => beat.id)).size, plan.beats.length);
  assert.equal(new Set(plan.scenes.map((scene) => scene.id)).size, plan.scenes.length);
  assert.equal(plan.scenes.some((scene) => scene.id === stableSceneId), true);
});

test('reuse keeps target meaning and requirements as an unselected compatible alternative', () => {
  const plan = createPlan('reuse', '사람이 걷습니다.\n\n사람이 움직입니다.');
  const reused = applyCommand(plan, { type: 'reuse', sceneId: plan.scenes[1].id, fromSceneId: plan.scenes[0].id, reason: '같은 인물 행동의 맥락을 이어 보여줌' });
  const candidate = reused.scenes[1].candidates[0];
  assert.equal(reused.scenes[1].selectedCandidateId, null);
  assert.equal(candidate.reuseFromSceneId, plan.scenes[0].id);
  assert.equal(candidate.requirementIds.some((id) => plan.scenes[1].candidates[0].requirementIds.includes(id)), true);
});

test('repeated reuse and regeneration keep layer IDs unique', () => {
  let plan = createPlan('reuse layers', '도시의 풍경이 보입니다.\n\n강가의 건물이 보입니다.\n\n저녁 하늘이 보입니다.');
  const targetSceneId = plan.scenes[1].id;
  plan = applyCommand(plan, { type: 'reuse', sceneId: targetSceneId, fromSceneId: plan.scenes[0].id, reason: '같은 장소 맥락을 이어 보여줌' });
  plan = applyCommand(plan, { type: 'reuse', sceneId: targetSceneId, fromSceneId: plan.scenes[2].id, reason: '같은 장소 맥락의 다른 시점을 보여줌' });
  plan = applyCommand(plan, { type: 'merge-next', sceneId: targetSceneId });
  const merged = plan.scenes[1].candidates[0];
  assert.equal(new Set(merged.layers.map((layer) => layer.id)).size, merged.layers.length);
  plan = applyCommand(plan, { type: 'regenerate', sceneId: targetSceneId });
  const regenerated = plan.scenes[1].candidates[0];
  assert.equal(new Set(regenerated.layers.map((layer) => layer.id)).size, regenerated.layers.length);
});

test('reuse rejects source and target candidates with incompatible modes', () => {
  const plan = createPlan('reuse modes', '사람이 걷습니다.\n\n도시의 풍경이 보입니다.');
  assert.equal(plan.scenes[0].candidates[0].mode, 'source-video');
  assert.equal(plan.scenes[1].candidates[0].mode, 'source-photo');
  assert.throws(() => applyCommand(plan, { type: 'reuse', sceneId: plan.scenes[1].id, fromSceneId: plan.scenes[0].id, reason: '행동을 맥락에 재사용' }), (error) => error?.status === 409);
});

test('narration timing uses compact text length and survives beat edits', () => {
  const shortText = '짧은 문장.';
  const longText = '이 장면은 시청자가 핵심 맥락과 변화를 충분히 읽도록 길게 설명하는 내레이션입니다.';
  let plan = createPlan('timing', `${shortText}\n\n${longText}`);
  assert.equal(plan.scenes[0].estimatedSeconds, 2);
  assert.equal(plan.scenes[1].estimatedSeconds > 2, true);
  const originalLongTiming = plan.scenes[1].estimatedSeconds;
  const editedBeat = plan.beats.find((beat) => beat.id === plan.scenes[1].beatIds[0]);
  plan = applyCommand(plan, { type: 'edit-beat', beatId: editedBeat.id, intent: '실제 행동의 순서를 다시 설명합니다.', role: 'action' });
  assert.equal(plan.scenes[1].estimatedSeconds, originalLongTiming);

  const revised = applyCommand(plan, { type: 'revise-script', text: `${longText} 더 긴 설명을 덧붙여 낭독 시간을 다시 계산합니다.\n\n${longText}` });
  assert.equal(revised.scenes[0].estimatedSeconds > originalLongTiming, true);
  assert.equal(revised.scenes[1].estimatedSeconds, originalLongTiming);
});

test('editing a local beat to explicit fiction rebuilds the mode and keyframe requirement', () => {
  const plan = createPlan('role', '사람이 걷습니다.');
  const edited = applyCommand(plan, { type: 'edit-beat', beatId: plan.beats[0].id, intent: '상상 장면으로 비인물 관계를 보여줍니다.', role: 'fiction' });
  assert.equal(edited.scenes[0].selectedCandidateId, null);
  assert.equal(edited.scenes[0].candidates[0].mode, 'omni');
  assert.equal(edited.scenes[0].candidates[0].requirementIds.some((id) => edited.requirements.find((requirement) => requirement.id === id)?.acquisition === 'generated-keyframe'), true);
});

test('episode-origin scenes preserve authoritative Omni mode across wording edits', async () => {
  const { importEpisode } = await import('../visualmaker/core/episode.ts');
  const plan = importEpisode();
  const paragraphs = plan.script.rawText.split('\n\n');
  paragraphs[0] = '판매 장면의 설명을 다시 씁니다.';
  const revised = applyCommand(plan, { type: 'revise-script', text: paragraphs.join('\n\n') });
  assert.deepEqual(revised.scenes[0].originCutIds, ['SH001']);
  assert.equal(revised.scenes[0].candidates.every((candidate) => candidate.mode === 'omni'), true);
  assert.equal(revised.scenes[0].candidates.every((candidate) => candidate.requirementIds.some((id) => revised.requirements.find((requirement) => requirement.id === id)?.acquisition === 'generated-keyframe')), true);

  paragraphs[0] = '판매 장면의 핵심을 한 번 더 다시 씁니다.';
  const revisedTwice = applyCommand(revised, { type: 'revise-script', text: paragraphs.join('\n\n') });
  assert.deepEqual(revisedTwice.scenes[0].originCutIds, ['SH001']);
  assert.equal(revisedTwice.scenes[0].candidates.every((candidate) => candidate.mode === 'omni'), true);

  const sourcePlan = importEpisode();
  const sourceIndex = sourcePlan.scenes.findIndex((scene) => scene.candidates[0]?.mode === 'source-video');
  assert.notEqual(sourceIndex, -1);
  const sourceParagraphs = sourcePlan.script.rawText.split('\n\n');
  sourceParagraphs[sourceIndex] = '실제 행동 장면의 설명을 다시 씁니다.';
  const sourceRevised = applyCommand(sourcePlan, { type: 'revise-script', text: sourceParagraphs.join('\n\n') });
  sourceParagraphs[sourceIndex] = '실제 행동 장면의 핵심을 한 번 더 다시 씁니다.';
  const sourceRevisedTwice = applyCommand(sourceRevised, { type: 'revise-script', text: sourceParagraphs.join('\n\n') });
  assert.equal(sourceRevisedTwice.scenes[sourceIndex].candidates.every((candidate) => candidate.mode === 'source-video'), true);
});

test('episode-origin beat edits are explicit work-copy replans and retain cut mapping', async () => {
  const { importEpisode } = await import('../visualmaker/core/episode.ts');
  const plan = importEpisode();
  const beat = plan.beats.find((item) => item.id === plan.scenes[0].beatIds[0]);
  const edited = applyCommand(plan, { type: 'edit-beat', beatId: beat.id, intent: '실제 행동 자료로 다시 설명합니다.', role: 'action' });
  assert.deepEqual(edited.scenes[0].originCutIds, ['SH001']);
  assert.equal(edited.scenes[0].candidates.every((candidate) => candidate.mode === 'source-video'), true);
  assert.equal(edited.scenes[0].selectedCandidateId, null);
});
