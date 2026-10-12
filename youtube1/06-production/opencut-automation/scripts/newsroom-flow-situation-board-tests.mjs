import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { stableStringify } from './evidence-bundle.mjs';
import {
  _test,
  FLOW_MANNEQUIN_PRESERVATION,
  FLOW_PROMPT_HEADER,
  admitFlowPostProduction,
  approveFlowSituationBoard,
  compileFlowSituationBoard,
  regenerateFlowSituationShot,
  revalidateFlowSituationBoardImport,
  verifyFlowHandoffBundle,
} from './newsroom-flow-situation-board.mjs';

const hashRecord = (value) => crypto.createHash('sha256').update(stableStringify(value)).digest('hex');

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'newsroom-flow-situation-board-'));
const preservedV27Root = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(process.platform === 'win32' ? 1 : 0)), '../out/newsroom/flow-preview/v27-flow10-infinite-canvas-20260910/deliverable-v3');
const preservedV27Hashes = ['1e35eb9df6beba71e4408c1e2726d30f6778b7dfd9b65b28d3aa1d52b7b3f45a', 'aeb1cee19d145b508adf6cf5fa44c7a268804c57e8dfccbf3963718d6d39e660', 'a602a2be4c933173b7abdef6c3bb2c9032ad951645fe3035ab45fe244d96575e', 'b98b12795496a1daea75d5d2efda9f8c24a2c695d957533461cdb81a8ee5ea79', '09647e1ae97d0afe2f960c48165855335bd851bcf553f1c1f3509234845dd49c', '580c10c549bd2dda42578471d5905278674d7a17e8b940276d5c9636775a8bd0', '97afc1fb4c7faf0bcafcd5f4a9311b88dea41e9a7fbdcb2be78dd860c4770ccd', '91d65cec6a62ee97c981159d4681db5b513b716dacfa85d2817c7cd8c719c747'];
for (const [index, expected] of preservedV27Hashes.entries()) {
  const bytes = await fs.readFile(path.join(preservedV27Root, `flow-prompts-and-shot-plan/flow-ready-batches/B${index + 1}.txt`));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected, `preserved v27 B${index + 1} prompt artifact must remain byte-identical`);
}
assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(preservedV27Root, 'SHA256SUMS.json'))).digest('hex'), 'ce62836fe0726fb98884b05ec1e01f0da3e4df422e4305827d71a588fded1ad4', 'preserved v27 checksum manifest must remain byte-identical');
const writeRef = async (name, value) => {
  const relativePath = `refs/${name}.png`;
  await fs.mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
  await fs.writeFile(path.join(root, relativePath), Buffer.from(value));
  return relativePath;
};

const references = [
  { assetId: 'CHAR-DRIVER', roleTag: 'CHAR_DRIVER', kind: 'character', description: 'adult driver, realistic body proportions, smooth blank matte face', imageRelativePath: await writeRef('driver', 'driver') },
  { assetId: 'CHAR-DAUGHTER', roleTag: 'CHAR_DAUGHTER', kind: 'character', description: 'teen passenger seated front-right and facing forward', imageRelativePath: await writeRef('daughter', 'daughter') },
  { assetId: 'CAR-IVORY', roleTag: 'CAR_IVORY', kind: 'vehicle', description: 'ivory sedan, fixed screen-left heading', imageRelativePath: await writeRef('ivory', 'ivory') },
  { assetId: 'CAR-CHARCOAL', roleTag: 'CAR_CHARCOAL', kind: 'vehicle', description: 'charcoal sedan, same road heading', imageRelativePath: await writeRef('charcoal', 'charcoal') },
  { assetId: 'BG-ROAD', roleTag: 'BG_URBAN_ROAD', kind: 'background', description: 'ordinary urban road in bright daylight', imageRelativePath: await writeRef('road', 'road') },
  { assetId: 'FRAME-B01', roleTag: 'FRAME_B01', kind: 'frame', description: '검토된 시작 구도: 같은 방향으로 달리는 두 차량, 검은 차량이 뒤에 있음', imageRelativePath: await writeRef('frame-b01', 'frame-b01') },
  { assetId: 'FRAME-B02', roleTag: 'FRAME_B02', kind: 'frame', description: '검토된 시작 구도: 검은 차량이 아이보리 차량 앞에 있음', imageRelativePath: await writeRef('frame-b02', 'frame-b02') },
  { assetId: 'FRAME-B03', roleTag: 'FRAME_B03', kind: 'frame', description: '검토된 시작 구도: 앞을 막은 차량의 운전석 문이 닫혀 있음', imageRelativePath: await writeRef('frame-b03', 'frame-b03') },
];

const cameraCard = (startState, endState, overrides = {}) => ({
  size: 'wide shot',
  angle: 'eye level',
  position: 'exterior road shoulder, perpendicular to the vehicle action axis',
  composition: 'both vehicles fully visible with safe lead room',
  movement: { type: 'locked-off', direction: 'none' },
  axis: 'road travel is the action axis; remain on the same camera side',
  screenDirection: 'both vehicles travel screen-left throughout',
  seat: 'not-applicable',
  focus: 'both vehicles in clear focus',
  startState,
  endState,
  ...overrides,
});

const shots = [
  { shotId: 'B01', narrationText: '여성의 차량이 큰 도로에 합류했습니다.', narrationStartSeconds: 0, narrationEndSeconds: 2.3, selectedRoleTags: ['CHAR_DRIVER', 'CAR_IVORY', 'CAR_CHARCOAL', 'BG_URBAN_ROAD', 'FRAME_B01'], situationImageRoleTag: 'FRAME_B01', startState: 'The ivory sedan has just entered the road; the charcoal sedan is behind it in the same direction.', action: 'The charcoal sedan advances toward the ivory sedan while both vehicles keep the same heading.', actionCount: 1, endState: 'The charcoal sedan is closer behind the ivory sedan; no vehicle changes direction.', cameraCard: cameraCard('The ivory sedan has just entered the road; the charcoal sedan is behind it in the same direction.', 'The charcoal sedan is closer behind the ivory sedan; no vehicle changes direction.') },
  { shotId: 'B02', narrationText: '뒤따르던 남성은 추월해 앞을 막았습니다.', narrationStartSeconds: 2.3, narrationEndSeconds: 5.1, selectedRoleTags: ['CHAR_DRIVER', 'CAR_IVORY', 'CAR_CHARCOAL', 'BG_URBAN_ROAD', 'FRAME_B02'], situationImageRoleTag: 'FRAME_B02', startState: 'The charcoal sedan is behind the ivory sedan on the same road.', action: 'The charcoal sedan overtakes the ivory sedan and stops ahead in the same lane.', actionCount: 1, endState: 'The charcoal sedan is ahead and stopped; the ivory sedan remains behind it.', cameraCard: cameraCard('The charcoal sedan is behind the ivory sedan on the same road.', 'The charcoal sedan is ahead and stopped; the ivory sedan remains behind it.', { position: 'exterior three-quarter road view on the established axis side' }) },
  { shotId: 'B03', narrationText: '남성은 운전석 문을 열고 내리기 시작했습니다.', narrationStartSeconds: 5.1, narrationEndSeconds: 8.4, selectedRoleTags: ['CHAR_DRIVER', 'CAR_IVORY', 'CAR_CHARCOAL', 'BG_URBAN_ROAD', 'FRAME_B03'], situationImageRoleTag: 'FRAME_B03', startState: 'The charcoal sedan is stopped ahead of the ivory sedan; its driver remains inside.', action: 'The charcoal sedan driver opens the driver-side door and begins to step out.', actionCount: 1, endState: 'The driver-side door is open and the driver has started exiting.', cameraCard: cameraCard('The charcoal sedan is stopped ahead of the ivory sedan; its driver remains inside.', 'The driver-side door is open and the driver has started exiting.', { position: 'exterior front-left three-quarter view toward the stopped charcoal sedan' }) },
];

const transportBatches = [{ batchId: 'FLOW10-01', shotIds: ['B01', 'B02', 'B03'] }];
const factSpineCore = {
  schema: 'newsroom-fact-spine-v1', authorityId: 'AUTH-TEST', authoritySha256: '1'.repeat(64),
  units: [
    { unitId: 'U01', order: 1, exactText: shots[0].narrationText, claimIds: ['CLAIM-01'] },
    { unitId: 'U02', order: 2, exactText: shots[1].narrationText, claimIds: ['CLAIM-02'] },
    { unitId: 'U03', order: 3, exactText: shots[2].narrationText, claimIds: ['CLAIM-03'] },
  ],
};
const factSpine = { ...factSpineCore, sha256: hashRecord(factSpineCore) };
const timingModelCore = {
  schema: 'newsroom-owner-speech-timing-model-v1', ownerProfileId: 'OWNER-01', settingsSha256: '2'.repeat(64),
  recordings: [
    { recordingId: 'REC-PESTICIDE', storyLabel: '살충제 승인본', ownerProfileId: 'OWNER-01', settingsSha256: '2'.repeat(64), audioSha256: '3'.repeat(64), approved: true, sentenceRates: [6, 7] },
    { recordingId: 'REC-JEJU', storyLabel: '제주 승인본', ownerProfileId: 'OWNER-01', settingsSha256: '2'.repeat(64), audioSha256: '4'.repeat(64), approved: true, sentenceRates: [6.5, 7.5] },
  ],
  rateDistribution: { unit: 'non-whitespace-characters-per-second', sampleCount: 4, min: 6, p50: 6.75, p90: 7.35, max: 7.5 },
};
const timingModel = { ...timingModelCore, sha256: hashRecord(timingModelCore) };
const timingDraftCore = {
  schema: 'newsroom-fact-preserving-timing-draft-v1', provisional: true, factSpineSha256: factSpine.sha256, timingModelSha256: timingModel.sha256,
  segments: [{ unitId: 'U01', order: 1, startSeconds: 0, endSeconds: 2.3, estimatedRate: 6.75 }, { unitId: 'U02', order: 2, startSeconds: 2.3, endSeconds: 5.1, estimatedRate: 6.75 }, { unitId: 'U03', order: 3, startSeconds: 5.1, endSeconds: 8.4, estimatedRate: 6.75 }],
};
const timingDraft = { ...timingDraftCore, sha256: hashRecord(timingDraftCore) };
const successorAuthorities = { factSpine, timingModel, timingDraft };

const packet = await compileFlowSituationBoard({
  assetRoot: root,
  storyId: 'flow-situation-test-story',
  scriptText: '여성의 차량이 큰 도로에 합류했습니다. 뒤따르던 남성은 추월해 앞을 막았습니다. 남성은 운전석 문을 열고 내리기 시작했습니다.',
  factSpine,
  timingModel,
  timingDraft,
  globalStyle: 'Bright grounded editorial reenactment, realistic proportions, faceless matte mannequins, no branding.',
  references,
  shots,
  transportBatches,
});

assert.equal(packet.schema, 'newsroom-flow-situation-board-v3');
assert.deepEqual(packet.workflow.stages, ['fact-spine', 'historical-owner-timing-model', 'provisional-fact-preserving-timing-draft', 'semantic-shot-camera-imagegen', 'reviewed-animatic', 'frozen-flow-transport-batch', 'source-qa-usable-windows', 'opencut-picture-rough', 'semantic-reconciliation', 'final-script-expression-conform', 'final-owner-narration-lock', 'one-bounded-audio-conform', 'captions-title-bgm', 'final-factual-av-qa']);
assert.equal(packet.timingDraft.provisional, true);
assert.deepEqual(packet.workflow.multishotPolicy, { requestedDurationSeconds: 10, shotsPerBatch: 3, shotDurationsSeconds: [3, 3, 4], plannedBatchCount: 9, plannedShotSlotCount: 27, plannedSourceCoverageSeconds: 90, durationVerified: false, providerVideosDownloadedBeforeSourceQA: true });
assert.deepEqual(packet.pictureSourcePlan, { schema: 'newsroom-picture-source-coverage-plan-v1', plannedOnly: true, plannedSourceCoverageSeconds: 90, standardBatchCount: 9, standardShotSlotCount: 27, standardBatchDurationSeconds: 10, standardShotDurationsSeconds: [3, 3, 4], finalRuntimeAuthority: 'final-owner-narration-after-picture-rough', allProviderVideosDownloadedBeforeSourceQA: true, allProviderBytesPreservedBeforeSourceQA: true });
assert.deepEqual(packet.firstLastFramePath, { schema: 'newsroom-first-last-frame-provider-path-v1', role: 'high-risk-authored-shot-or-recovery-only', minimumProviderSourceDurationSeconds: 4, finalTimingAuthority: 'downloaded-source-qa-and-picture-conform', automaticBaselineCredit: false });
assert.equal(packet.shots[0].situationFrame.binding, 'reviewed-entry-frame-reference');
assert.equal(packet.nativeBindings.singleShotRecovery, 'new-reviewed-entry-frame-required-before-native-first-frame-i2v');
assert.equal(packet.nativeBindings.multishot, 'ordered-reference-images-plus-shot-prompt-excluding-native-first-frame-claim');
assert.match(packet.sequenceSignature, /^[a-f0-9]{64}$/);
assert.equal(packet.transportBatches[0].nativeFirstFrameLocksVerified, false);
assert.deepEqual(packet.transportBatches[0].shotIds, ['B01', 'B02', 'B03']);
assert.deepEqual(packet.transportBatches[0].shotDurationsSeconds, [3, 3, 4]);
assert.deepEqual(packet.transportBatches[0].imageUploadOrder.map((item) => item.roleTag), ['FRAME_B01', 'FRAME_B02', 'FRAME_B03']);
assert.deepEqual(packet.transportBatches[0].shots[0].cameraCard, packet.shots[0].cameraCard);
assert.equal(packet.transportBatches[0].imageUploadOrder[0].sha256, packet.shots[0].situationFrame.sha256);
assert.equal(packet.transportBatches[0].prompt.split('\n')[0], FLOW_PROMPT_HEADER);
assert.equal(packet.transportBatches[0].prompt.split('\n')[1], FLOW_MANNEQUIN_PRESERVATION);
assert.equal(packet.transportBatches[0].prompt.split('\n')[2], '');
assert.equal(packet.transportBatches[0].prompt.match(/realistic 3D ivory-toned mannequins/g)?.length, 1);
assert.match(packet.transportBatches[0].prompt, /\[Shot 1\]/);
assert.match(packet.transportBatches[0].prompt, /\[Shot 2\]/);
assert.match(packet.transportBatches[0].prompt, /\[Shot 3\]/);
assert.match(packet.transportBatches[0].prompt, /\[참조 이미지: frame-b01\.png - 검토된 시작 구도:/);
assert.doesNotMatch(packet.transportBatches[0].prompt, /sha256:|@FRAME_/);
assert.match(packet.transportBatches[0].prompt, /One observable action:/);
assert.equal(packet.transportBatches[0].requestedDurationSeconds, 10);
assert.equal(packet.transportBatches[0].requestTimingAuthority, 'provider-source-request-intent-only');
assert.equal(packet.transportBatches[0].finalTimingAuthority, 'final-owner-lock-after-picture-reconciliation');
assert.equal(packet.promptFreeze.batches[0].exactPrompt, packet.transportBatches[0].prompt);
assert.equal(packet.promptFreeze.batches[0].promptSha256, packet.transportBatches[0].promptSha256);
assert.equal(packet.promptFreeze.header, FLOW_PROMPT_HEADER);
assert.equal(packet.transportBatches[0].promptSha256, '63258fb5b5ac0245c82557686f5f0fc4c66b1253cde2e957f597dfa2b17c9170', 'frozen Flow prompt bytes changed');
assert.equal(packet.singleShotRecovery[0].requiresNewEntryFrameVersion, true);
assert.equal(packet.singleShotRecovery[0].requiresNewHumanReview, true);
assert.equal(packet.singleShotRecovery[0].requiresCurrentSequenceAnimaticApproval, true);
assert.equal(packet.production.provider, false);

const forgedCameraBinding = JSON.parse(JSON.stringify(packet));
forgedCameraBinding.transportBatches[0].shots[0].cameraCard.position = 'opposite side of the action axis';
forgedCameraBinding.integrity.sha256 = _test.hashWithout(forgedCameraBinding, 'integrity');
assert.throws(
  () => approveFlowSituationBoard({ packet: forgedCameraBinding, review: {}, animatic: {} }),
  /shot binding does not match|CODEX_ADMIN_BLOCKED/i,
);

const forgedImageOrder = structuredClone(packet);
[forgedImageOrder.transportBatches[0].imageUploadOrder[0], forgedImageOrder.transportBatches[0].imageUploadOrder[1]] = [forgedImageOrder.transportBatches[0].imageUploadOrder[1], forgedImageOrder.transportBatches[0].imageUploadOrder[0]];
forgedImageOrder.integrity.sha256 = _test.hashWithout(forgedImageOrder, 'integrity');
assert.throws(
  () => approveFlowSituationBoard({ packet: forgedImageOrder, review: {}, animatic: {} }),
  /image upload order does not match|CODEX_ADMIN_BLOCKED/i,
);

const approved = approveFlowSituationBoard({
  packet,
  review: {
    reviewerId: 'reviewer-test',
    sequenceSignature: packet.sequenceSignature,
    shots: packet.shots.map((shot) => ({ shotId: shot.shotId, status: 'pass', checks: { composition: true, actors: true, vehicles: true, direction: true, seats: true, noExtraText: true, cameraCard: true, actionReadiness: true, adjacentContinuity: true }, note: 'entry frame and camera card reviewed' })),
  },
  animatic: { status: 'approved', sequenceSignature: packet.sequenceSignature, sha256: crypto.createHash('sha256').update('animatic').digest('hex') },
});
assert.equal(approved.status, 'test-only / handoff-bundle-required');
assert.equal(approved.submissionGate.handoffBundleVerified, false);
assert.equal(approved.review.status, 'approved');
assert.equal(approved.review.currentPassId.length, 16);

const bundleRoot = path.join(root, 'handoff-bundle');
const bundleDirectories = approved.handoffBundle.requiredLayout.requiredDirectories;
for (const directory of bundleDirectories) await fs.mkdir(path.join(bundleRoot, directory), { recursive: true });
await fs.writeFile(path.join(bundleRoot, 'README.md'), 'Verified Flow handoff bundle.');
const shotImages = [];
for (const shot of approved.shots) {
  const target = `shot-images/${path.basename(shot.situationFrame.imageRelativePath)}`;
  await fs.copyFile(path.join(root, shot.situationFrame.imageRelativePath), path.join(bundleRoot, target));
  shotImages.push({ shotId: shot.shotId, path: target });
}
const combinedBase = 'flow-prompts-and-shot-plan/combined';
await fs.writeFile(path.join(bundleRoot, `${combinedBase}.txt`), approved.transportBatches.map((batch) => batch.prompt).join('\n\n'));
await fs.writeFile(path.join(bundleRoot, `${combinedBase}.json`), JSON.stringify({ batches: approved.transportBatches.map(({ batchId, prompt }) => ({ batchId, prompt })) }));
await fs.writeFile(path.join(bundleRoot, `${combinedBase}.md`), '# Flow prompts');
const flowReadyBatches = [];
for (const [index, batch] of approved.transportBatches.entries()) {
  const target = `flow-prompts-and-shot-plan/flow-ready-batches/B${index + 1}.txt`;
  await fs.writeFile(path.join(bundleRoot, target), batch.prompt);
  flowReadyBatches.push({ batchId: batch.batchId, path: target });
}
await fs.writeFile(path.join(bundleRoot, 'infinite-canvas/board.html'), '<html>board</html>');
const referenceAssets = [];
for (const ref of approved.references.filter((item) => item.kind !== 'frame')) {
  const category = { character: 'people', vehicle: 'vehicles', prop: 'props', background: 'backgrounds' }[ref.kind];
  const target = `base-reference-assets/${category}/${path.basename(ref.imageRelativePath)}`;
  await fs.copyFile(path.join(root, ref.imageRelativePath), path.join(bundleRoot, target));
  referenceAssets.push({ assetId: ref.assetId, roleTag: ref.roleTag, kind: ref.kind, usage: approved.shots.some((shot) => shot.selectedRoleTags.includes(ref.roleTag)) ? 'used' : 'unused', provenance: 'verified byte-identical copy from the admitted reference catalog', path: target });
}
await fs.writeFile(path.join(bundleRoot, 'base-reference-assets/manifest.json'), JSON.stringify({ referenceAssets }));
await fs.writeFile(path.join(bundleRoot, 'base-reference-assets/generation-records/record.json'), JSON.stringify({ status: 'verified-copy' }));
const handoffManifestPath = 'manifests-and-verification/handoff-bundle-manifest.json';
await fs.writeFile(path.join(bundleRoot, handoffManifestPath), JSON.stringify({
  schema: 'newsroom-flow-handoff-bundle-manifest-v1', verifiedCopy: true, historicalSourcesImmutable: true,
  shotImages, combinedFiles: { text: `${combinedBase}.txt`, json: `${combinedBase}.json`, markdown: `${combinedBase}.md` },
  flowReadyBatches, infiniteCanvasFiles: ['infinite-canvas/board.html'], baseReferenceManifest: 'base-reference-assets/manifest.json', referenceAssets,
  generationRecords: ['base-reference-assets/generation-records/record.json'], verificationFiles: [handoffManifestPath],
}));
const walkFiles = async (directory, prefix = '') => {
  const output = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) output.push(...await walkFiles(path.join(directory, entry.name), relative)); else output.push(relative);
  }
  return output;
};
const checksumFiles = [];
for (const relative of (await walkFiles(bundleRoot)).filter((item) => item !== 'SHA256SUMS.json').sort()) {
  const bytes = await fs.readFile(path.join(bundleRoot, relative));
  checksumFiles.push({ path: relative, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
}
await fs.writeFile(path.join(bundleRoot, 'SHA256SUMS.json'), JSON.stringify({ fileCount: checksumFiles.length, files: checksumFiles }));
const verified = await verifyFlowHandoffBundle({ packet: approved, bundleRoot, manifestRelativePath: handoffManifestPath });
assert.equal(verified.status, 'test-only / flow-submission-ready');
assert.equal(verified.handoffBundle.status, 'verified');
assert.equal(verified.handoffBundle.shotCount, approved.shots.length);
assert.equal(verified.handoffBundle.batchCount, approved.transportBatches.length);
assert.equal(verified.submissionGate.handoffBundleVerified, true);
assert.equal(verified.submissionGate.renderEligible, false);

const postProductionInput = {
  usableSourceWindows: { schema: 'newsroom-usable-source-windows-v1', status: 'approved', promptFreezeSha256: verified.promptFreeze.sha256, allProviderVideosDownloaded: true, allProviderBytesPreserved: true, windows: verified.shots.map((shot, index) => ({ shotId: shot.shotId, batchId: 'FLOW10-01', sourceSha256: '5'.repeat(64), inSeconds: index * 2.5, outSeconds: index * 2.5 + 2.4, semanticQAPass: true, continuous: true, noReversal: true })), sha256: '6'.repeat(64) },
  pictureRough: { schema: 'newsroom-opencut-picture-rough-v1', status: 'approved', sha256: '7'.repeat(64), durationSeconds: 5.1, sourceWindowsSha256: '6'.repeat(64), sequenceSignature: verified.sequenceSignature },
  reconciliation: { schema: 'newsroom-semantic-reconciliation-v1', status: 'approved', factSpineSha256: verified.factSpine.sha256, pictureRoughSha256: '7'.repeat(64), units: verified.factSpine.units.map((unit) => ({ unitId: unit.unitId, order: unit.order, disposition: 'trim', note: 'usable window reconciled to the semantic unit' })), sha256: '8'.repeat(64) },
  finalScriptConform: { schema: 'newsroom-final-script-expression-conform-v1', status: 'approved', exactText: verified.script.exactText, sha256: verified.script.sha256, factSpineSha256: verified.factSpine.sha256, factSpinePreserved: true, legalClaimsUnchanged: true, allowedChanges: ['connectives', 'duplication', 'expression'], units: verified.factSpine.units.map((unit) => ({ unitId: unit.unitId, order: unit.order, sourceExactText: unit.exactText, finalExactText: unit.exactText, claimIds: unit.claimIds })), reviewerId: 'legal-editor', reviewSha256: '9'.repeat(64) },
  finalOwnerNarration: { schema: 'newsroom-final-owner-narration-v1', status: 'accepted-locked', ownerProfileId: verified.timingModel.ownerProfileId, settingsSha256: verified.timingModel.settingsSha256, scriptSha256: verified.script.sha256, audioSha256: 'a'.repeat(64), durationSeconds: 5.1, approvalSha256: 'b'.repeat(64) },
  audioConform: { schema: 'newsroom-one-bounded-audio-conform-v1', status: 'approved', iteration: 1, maxIterations: 1, timeScale: 1, inputNarrationSha256: 'a'.repeat(64), pictureRoughSha256: '7'.repeat(64), outputAudioSha256: 'c'.repeat(64), durationSeconds: 5.1 },
  finalAVQA: { schema: 'newsroom-final-factual-av-qa-v1', status: 'pass', factSpineSha256: verified.factSpine.sha256, finalScriptSha256: verified.script.sha256, finalAudioSha256: 'c'.repeat(64), pictureRoughSha256: '7'.repeat(64), titleSha256: 'd'.repeat(64), captionsSha256: 'e'.repeat(64), bgmSha256: 'f'.repeat(64), checks: { factSpine: true, legalClaims: true, semanticCoverage: true, avSync: true, captions: true, title: true, bgm: true, providerAudioRemoved: true }, reviewerId: 'final-av-reviewer', qaSha256: '0'.repeat(64) },
};
const finalReady = admitFlowPostProduction({ packet: verified, ...postProductionInput });
assert.equal(finalReady.status, 'test-only / final-render-ready');
assert.equal(finalReady.submissionGate.renderEligible, true);
assert.equal(finalReady.production.render, false);
assert.equal(finalReady.postProduction.audioConform.maxIterations, 1);
assert.throws(() => admitFlowPostProduction({ packet: verified, ...postProductionInput, audioConform: { ...postProductionInput.audioConform, iteration: 2 } }), /single bounded conform|CODEX_ADMIN_BLOCKED/i);
assert.throws(() => admitFlowPostProduction({ packet: verified, ...postProductionInput, finalScriptConform: { ...postProductionInput.finalScriptConform, factSpinePreserved: false } }), /change only|CODEX_ADMIN_BLOCKED/i);

const forgedPromptFreeze = structuredClone(packet);
forgedPromptFreeze.promptFreeze.batches[0].exactPrompt += ' ';
forgedPromptFreeze.integrity.sha256 = _test.hashWithout(forgedPromptFreeze, 'integrity');
assert.throws(() => approveFlowSituationBoard({ packet: forgedPromptFreeze, review: {}, animatic: {} }), /frozen Flow prompt bytes|CODEX_ADMIN_BLOCKED/i);

const replacementPath = await writeRef('frame-b02-replacement', 'frame-b02-replacement');
const revised = await regenerateFlowSituationShot({ packet: approved, assetRoot: root, references, shotId: 'B02', replacementFrame: { assetId: 'FRAME-B02-REVISED', roleTag: 'FRAME_B02_REVISED', imageRelativePath: replacementPath, description: '수정된 B02 시작 구도' } });
assert.equal(revised.status, 'test-only / semantic-design-review-required');
assert.equal(revised.shots[1].situationImageRoleTag, 'FRAME_B02_REVISED');
assert.equal(revised.shots[1].flowReferenceBinding.roleTag, 'FRAME_B02_REVISED');
assert.match(revised.transportBatches[0].prompt, /\[참조 이미지: frame-b02-replacement\.png - 수정된 B02 시작 구도\]/);
assert.equal(revised.transportBatches[0].imageUploadOrder[1].sha256, revised.shots[1].situationFrame.sha256);
assert.equal(revised.review.status, 'pending');
assert.equal(revised.animatic.status, 'pending');
assert.equal(revised.revision.shotId, 'B02');
assert.notEqual(revised.integrity.sha256, approved.integrity.sha256);

const unchangedImport = await revalidateFlowSituationBoardImport({ packet: approved, assetRoot: root, references });
assert.equal(unchangedImport.valid, true);
assert.equal(unchangedImport.reason, 'import-review-required');
assert.equal(unchangedImport.packet.review.status, 'pending');
assert.equal(unchangedImport.packet.animatic.status, 'pending');
assert.equal(unchangedImport.packet.submissionGate.preGenerationReview, false);
await fs.writeFile(path.join(root, references[2].imageRelativePath), Buffer.from('ivory-changed'));
const invalidatedImport = await revalidateFlowSituationBoardImport({ packet: approved, assetRoot: root, references });
assert.equal(invalidatedImport.valid, false);
assert.deepEqual(invalidatedImport.changedRoleTags, ['CAR_IVORY']);
assert.equal(invalidatedImport.packet.review.status, 'pending');
assert.equal(invalidatedImport.packet.animatic.status, 'pending');
assert.equal(invalidatedImport.packet.submissionGate.preGenerationReview, false);
assert.equal(invalidatedImport.packet.importInvalidation.invalidated, true);

await assert.rejects(
  () => compileFlowSituationBoard({ assetRoot: root, ...successorAuthorities, storyId: 'bad', scriptText: packet.script.exactText, globalStyle: 'style', references, shots: [{ ...shots[0], selectedRoleTags: shots[0].selectedRoleTags.filter((tag) => tag !== 'FRAME_B01'), situationImageRoleTag: 'FRAME_B01' }, shots[1]], transportBatches }),
  /exactly one FRAME|CODEX_ADMIN_BLOCKED/i,
);
await assert.rejects(
  () => compileFlowSituationBoard({ assetRoot: root, ...successorAuthorities, storyId: 'bad', scriptText: packet.script.exactText, globalStyle: 'style', references, shots: [{ ...shots[0], actionCount: 2 }, shots[1]], transportBatches }),
  /exactly one observable action|CODEX_ADMIN_BLOCKED/i,
);
await assert.rejects(
  () => compileFlowSituationBoard({ assetRoot: root, ...successorAuthorities, storyId: 'bad', scriptText: packet.script.exactText, globalStyle: 'style', references: references.map((ref) => ref.roleTag === 'FRAME_B01' ? { ...ref, kind: 'background' } : ref), shots, transportBatches }),
  /prefix and kind disagree|CODEX_ADMIN_BLOCKED/i,
);
await assert.rejects(
  () => compileFlowSituationBoard({ assetRoot: root, ...successorAuthorities, storyId: 'bad', scriptText: packet.script.exactText, globalStyle: 'style', references, shots: [shots[0], { ...shots[1], shotId: 'B01' }], transportBatches }),
  /duplicate shotId|CODEX_ADMIN_BLOCKED/i,
);
await assert.rejects(
  () => compileFlowSituationBoard({ assetRoot: root, ...successorAuthorities, storyId: 'bad', scriptText: '다른 대본', globalStyle: 'style', references, shots, transportBatches }),
  /exact script excerpt|factSpine\.units|CODEX_ADMIN_BLOCKED/i,
);
await assert.rejects(
  async () => approveFlowSituationBoard({ packet, review: { reviewerId: 'reviewer-test', sequenceSignature: packet.sequenceSignature, shots: packet.shots.map((shot) => ({ shotId: shot.shotId, status: 'revise', checks: { composition: true, actors: true, vehicles: true, direction: true, seats: true, noExtraText: true, cameraCard: true, actionReadiness: true, adjacentContinuity: true }, note: 'needs revision' })) }, animatic: { status: 'approved', sequenceSignature: packet.sequenceSignature, sha256: 'a'.repeat(64) } }),
  /every shot situation review must pass|CODEX_ADMIN_BLOCKED/i,
);

await assert.rejects(
  () => compileFlowSituationBoard({ assetRoot: root, ...successorAuthorities, storyId: 'bad-camera', scriptText: packet.script.exactText, globalStyle: 'style', references, shots: [{ ...shots[0], cameraCard: { ...shots[0].cameraCard, movement: { type: 'locked-off', direction: 'none', secondary: 'pan' } } }, shots[1]], transportBatches }),
  /exactly one movement|complete canonical camera-card|CODEX_ADMIN_BLOCKED/i,
);
await assert.rejects(
  () => compileFlowSituationBoard({ assetRoot: root, ...successorAuthorities, storyId: 'bad-batch', scriptText: packet.script.exactText, globalStyle: 'style', references, shots, transportBatches: [{ batchId: 'FLOW10-01', shotIds: ['B01'] }, { batchId: 'FLOW10-02', shotIds: ['B02'] }] }),
  /exactly three shots|CODEX_ADMIN_BLOCKED/i,
);
await assert.rejects(
  async () => approveFlowSituationBoard({ packet, review: { reviewerId: 'reviewer-test', sequenceSignature: 'b'.repeat(64), shots: [] }, animatic: { status: 'approved', sequenceSignature: packet.sequenceSignature, sha256: 'a'.repeat(64) } }),
  /sequenceSignature is stale|CODEX_ADMIN_BLOCKED/i,
);

console.log('newsroom-flow-situation-board tests passed');
