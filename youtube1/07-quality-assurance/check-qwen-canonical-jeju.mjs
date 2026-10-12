#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(workspace, '03-script-voice', 'releases', 'qwen-jeju-canonical-20260801', 'manifest.json');
const manifestDir = path.dirname(manifestPath);
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const resolve = (relative) => path.resolve(manifestDir, relative);
const sha256 = async (file) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const args = process.argv.slice(2);
const versionIndex = args.indexOf('--version');
const exactVersion = versionIndex >= 0 ? args[versionIndex + 1] : null;
if (versionIndex >= 0 && !/^[A-Za-z0-9_-]+$/.test(exactVersion || '')) throw new Error('--version requires a safe exact version ID');
const probe = (file) => {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,codec_type,sample_rate,channels,channel_layout:format=duration', '-of', 'json', file], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, `ffprobe failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
};
const manifest = await readJson(manifestPath);
const selectedRegistry = exactVersion
  ? await readJson(path.join(workspace, '06-production', 'opencut-automation', 'out', 'registry', 'versions', `${exactVersion}.json`))
  : null;
if (selectedRegistry && selectedRegistry.versionId !== exactVersion) throw new Error('selected registry version mismatch');
if (selectedRegistry && selectedRegistry.handoffFile !== `${exactVersion}.handoff.json`) throw new Error('selected registry handoff mismatch');
const handoffPath = selectedRegistry
  ? path.join(workspace, '06-production', 'opencut-automation', 'out', 'registry', 'versions', selectedRegistry.handoffFile)
  : resolve(manifest.goldenEvidence.handoff);
const handoff = await readJson(handoffPath);
const scriptPath = resolve(manifest.source.authoritative);
const promptManifestPath = resolve(manifest.promptBank.manifest);
const projectPath = resolve(manifest.visualBaseline.project);
const project = await readJson(projectPath);
const visualManifestPath = resolve(manifest.visualBaseline.generationManifest);
const visualManifest = await readJson(visualManifestPath);
const expectedVisualAssets = manifest.visualBaseline.assetFiles;
const reusedFrom = handoff.narrationProvider?.reusedFrom;
const isReusedHandoff = typeof reusedFrom === 'string';
const reusedHandoff = isReusedHandoff
  ? await readJson(path.join(workspace, '06-production', 'opencut-automation', reusedFrom, 'handoff.json'))
  : null;
const acceptanceNarration = isReusedHandoff
  ? (handoff.narrationProvider?.postAcceptanceSignal ? handoff.narrationProvider : reusedHandoff.narrationProvider)
  : handoff.narrationProvider;

if (project.narration.mode === 'approved-locked') {
  assert.deepEqual(project.narration, manifest.liveNarrationContract, 'approved locked narration contract drift');
  assert.equal(project.narration.source, 'approved-locked-owner-audio');
  assert.equal(project.narration.cueCount, manifest.goldenEvidence.captionCueCount);
  assert.equal(manifest.pitchCorrections, undefined, 'legacy pitch correction contract must be removed');
  assert.equal(handoff.narrationProvider?.actualProvider, 'approved-locked');
  assert.equal(handoff.narrationProvider?.locked, true);
  assert.equal(handoff.narrationProvider?.fallbackUsed, false);
  assert.equal(handoff.narrationProvider?.approvedAudioSha256, manifest.goldenEvidence.audioSha256);
  assert.equal(await sha256(resolve(manifest.goldenEvidence.audio)), manifest.goldenEvidence.audioSha256);
  assert.equal(await sha256(scriptPath), manifest.source.authoritativeFileSha256);
  const approvedDraft = (await readJson(scriptPath)).draft.replace(/\r\n/g, '\n').trim();
  assert.equal(crypto.createHash('sha256').update(approvedDraft, 'utf8').digest('hex'), manifest.source.draftTextSha256);
  const approvedCueText = (handoff.cues ?? []).map((cue) => cue.text ?? '').join('').normalize('NFC').replace(/\s+/g, '');
  assert.equal(approvedCueText, approvedDraft.normalize('NFC').replace(/\s+/g, ''), 'approved caption text drift from canonical draft');
  assert.equal(handoff.cues?.length, manifest.goldenEvidence.captionCueCount);
  assert.equal(handoff.sourceIntegrity?.scriptSha256, manifest.source.draftTextSha256);
  assert.equal(handoff.sourceIntegrity?.sourceCueCount, manifest.source.sourceCueCount);
  // The historical approved narration handoff is narration-only. An exact
  // selected production handoff must also carry its rendered BGM track.
  assert.ok(project.bgm && project.bgm.provider === 'local-file', 'canonical BGM contract missing');
  assert.equal(project.bgm.sha256, '9fe2ddabf1a7274706c3888ecd3316dcfef7447eb4b211617dd512762709c899');
  assert.equal(project.bgm.volumeDb, -16);
  assert.equal(project.bgm.duckUnderNarration, true);
  assert.equal(project.bgm.fadeSeconds, 1.2);
  const approvedProbe = probe(resolve(manifest.goldenEvidence.audio));
  const approvedStream = approvedProbe.streams?.find((stream) => stream.codec_type === 'audio');
  assert.equal(approvedStream?.codec_name, 'aac');
  assert.equal(Number(approvedStream?.sample_rate), 24000);
  assert.equal(Number(approvedStream?.channels), 1);
  assert.equal(handoff.tracks?.filter((track) => track.type === 'audio').length, exactVersion ? 2 : 1);
  assert.equal(handoff.tracks?.some((track) => /bgm|music/i.test(`${track.src ?? ''} ${track.name ?? ''}`)), Boolean(exactVersion));
  const qwenSourcePath = resolve(manifest.goldenEvidence.qwenSourceHandoff);
  assert.equal(await sha256(qwenSourcePath), manifest.goldenEvidence.qwenSourceHandoffSha256);
  const qwenSource = await readJson(qwenSourcePath);
  assert.equal(qwenSource.narrationProvider?.actualProvider, 'qwen3-tts');
  assert.equal(qwenSource.narrationProvider?.fallbackUsed, false);
  assert.equal(qwenSource.narrationProvider?.speechAcceptance?.final?.accepted, true);
  // The immutable Qwen source evidence predates the approved AAC promotion;
  // accept either its historical source hash or the promoted release hash.
  assert.ok([manifest.goldenEvidence.audioSha256, '1c79277b74c41c5afda58acae106a91ceda7d88a49266e944942348047aff8b4'].includes(qwenSource.narrationProvider?.postAcceptanceAudioSha256));
  const qwenPauses = qwenSource.narrationProvider?.postAcceptanceSentencePauseEdits ?? [];
  assert.equal(qwenPauses.length, manifest.pauses.semanticBoundaryCount);
  const sourceAnchors = qwenSource.narrationProvider?.speechAcceptance?.evidence?.globalWordAnchors ?? [];
  assert.equal(sourceAnchors.length, manifest.goldenEvidence.globalWordAnchorCount);
  for (const pause of qwenPauses) {
    assert.equal(pause.start, pause.end, 'sentence pause must not delete source audio');
    assert.equal(pause.sentenceBoundary, true);
    assert.ok(pause.outputPauseSeconds > 0 && pause.outputPauseSeconds <= manifest.pauses.maximumSeconds);
    assert.equal(sourceAnchors.some((anchor) => pause.start > anchor.start + 1e-6 && pause.start < anchor.end - 1e-6), false, 'sentence pause overlaps a spoken word');
  }
  const visualContract = spawnSync(process.execPath, [path.join(workspace, '06-production', 'opencut-automation', 'scripts', 'verify-jeju-canonical-contract.mjs'), ...(exactVersion ? ['--version', exactVersion] : [])], {
    cwd: workspace,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(visualContract.status, 0, `visual canonical contract failed: ${visualContract.stderr || visualContract.stdout}`);
  console.log(JSON.stringify({ status: 'approved-locked-passed', audioSha256: manifest.goldenEvidence.audioSha256, cueCount: handoff.cues.length, visualContract: JSON.parse(visualContract.stdout) }, null, 2));
  process.exit(0);
}

assert.equal(manifest.status, 'locked-preview');
assert.equal(manifest.productionDefaults, true);
assert.equal(manifest.source.sourceCueCount, 18);
assert.equal(manifest.goldenEvidence.captionCueCount, 35);
assert.equal(manifest.engine.model, 'Qwen/Qwen3-TTS-12Hz-0.6B-Base');
assert.equal(manifest.engine.revision, '5d83992436eae1d760afd27aff78a71d676296fc');
assert.equal(manifest.engine.dtype, 'bfloat16');
assert.equal(manifest.engine.loraAllowed, false);
assert.equal(manifest.engine.adapterAllowed, false);
assert.equal(manifest.engine.fallbackAllowed, false);
assert.equal(await sha256(promptManifestPath), manifest.promptBank.manifestSha256);
assert.equal(await sha256(resolve(manifest.promptBank.question.asset)), manifest.promptBank.question.sha256);
assert.equal(await sha256(resolve(manifest.promptBank.declarativeGuide.asset)), manifest.promptBank.declarativeGuide.sha256);
const ownerSourcePath = process.env.QWEN_OWNER_SOURCE_AUDIO;
if (ownerSourcePath) {
  await fs.access(ownerSourcePath);
  assert.equal(await sha256(ownerSourcePath), manifest.promptBank.question.sourceAudioSha256);
}
assert.equal(await sha256(scriptPath), manifest.source.authoritativeFileSha256);
const handoffScriptAsset = handoff.assets?.find((asset) => asset.name === 'script.json');
const handoffScriptPath = handoffScriptAsset
  ? path.join(workspace, '06-production', 'opencut-automation', handoffScriptAsset.path)
  : path.join(path.dirname(handoffPath), 'script.json');
assert.equal(await sha256(handoffScriptPath), manifest.source.authoritativeFileSha256);
assert.equal(project.scriptSource, '../../newsroom/projects/jeju-school-intrusion.json');
assert.equal(handoff.sourceIntegrity?.authority, 'production/newsroom/projects/jeju-school-intrusion.json');

assert.equal(await sha256(visualManifestPath), manifest.visualBaseline.generationManifestSha256);
assert.equal(visualManifest.version, 'canonical-v2');
assert.equal(visualManifest.scriptTextSha256, manifest.source.draftTextSha256);
assert.equal(visualManifest.scriptSource, '../../../../newsroom/projects/jeju-school-intrusion.json');
assert.deepEqual(visualManifest.policy, {
  fictionalReenactment: true,
  visibleFaces: false,
  identifiableSchool: false,
  embeddedText: false,
  legacyAssetsAllowed: false,
});
assert.deepEqual(visualManifest.assets.map((asset) => asset.file), expectedVisualAssets);
for (const asset of visualManifest.assets) {
  const assetPath = path.join(path.dirname(visualManifestPath), asset.file);
  await fs.access(assetPath);
  assert.equal(await sha256(assetPath), asset.sha256, `visual asset hash drift: ${asset.file}`);
}
assert.deepEqual(project.scenes.map((scene) => path.basename(scene.asset)), expectedVisualAssets);
assert.equal(project.scenes.every((scene) => scene.asset.startsWith('assets/images/')), true);
const handoffVideoNames = (handoff.tracks ?? []).filter((track) => track.type === 'video').map((track) => path.basename(track.src));
assert.deepEqual(handoffVideoNames, expectedVisualAssets);
assert.equal(handoffVideoNames.some((name) => !name.startsWith('canonical-v2-')), false, 'legacy visual asset reference present');
const handoffImageAssets = (handoff.assets ?? []).filter((asset) => asset.mime === 'image/png').map((asset) => asset.name).filter((name) => name !== 'thumbnail.png');
assert.deepEqual(handoffImageAssets, expectedVisualAssets);

const liveNarration = project.narration;
const expectedNarration = manifest.liveNarrationContract;
for (const key of ['mode', 'style', 'device', 'seed', 'maxAttempts', 'temperature', 'promptBank', 'finalTempo', 'maxSegmentChars', 'pitchCorrections', 'removeSilence', 'sentencePauseSeconds', 'semanticPauseSeconds', 'joinSafetySeconds']) {
  assert.deepEqual(liveNarration?.[key], expectedNarration[key], `live narration contract drift: ${key}`);
}
assert.deepEqual(liveNarration.questionSentences, expectedNarration.questionSentences);
assert.deepEqual(liveNarration.criticalPhrases, expectedNarration.criticalPhrases);
assert.deepEqual(liveNarration.criticalPhraseModels, expectedNarration.criticalPhraseModels);
const normalizedDraft = JSON.parse(await fs.readFile(scriptPath, 'utf8')).draft.replace(/\r\n/g, '\n').trim();
const liveDraftHash = crypto.createHash('sha256').update(normalizedDraft, 'utf8').digest('hex');
const liveProjectText = await fs.readFile(projectPath, 'utf8');
const liveProjectHash = crypto.createHash('sha256').update(liveProjectText.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
const liveNarrationConfigHash = crypto.createHash('sha256').update(JSON.stringify({ scriptSha256: liveDraftHash, narration: liveNarration }), 'utf8').digest('hex');
assert.equal(liveDraftHash, manifest.source.draftTextSha256);
const normalizedVisualCaptionText = (handoff.cues ?? []).map((cue) => cue.text ?? '').join('').normalize('NFC').replace(/\s+/g, '');
assert.equal(normalizedVisualCaptionText, normalizedDraft.normalize('NFC').replace(/\s+/g, ''), 'visual caption text drift from canonical draft');
assert.equal(handoff.sourceIntegrity?.projectConfigSha256, liveProjectHash);
assert.equal(handoff.sourceIntegrity?.narrationConfigSha256, liveNarrationConfigHash);

assert.equal(handoff.versionId, manifest.goldenEvidence.versionId);
assert.equal(handoff.publishable, false);
assert.equal(handoff.releaseStatus, 'preview');
assert.equal(handoff.releaseGate?.uploadBlocked, true);
assert.deepEqual(handoff.releaseGate, project.releaseGate);
const legalBlocker = project.releaseGate?.blockers?.find((blocker) => blocker.id === 'legal-claim-review-2021do7538');
assert.ok(legalBlocker, 'required legal blocker missing');
assert.equal(legalBlocker.severity, 'block');
assert.equal(legalBlocker.claim, '물건 오염만으로 성범죄가 적용되진 않기 때문입니다');
assert.equal(legalBlocker.authority?.case, '대법원 2021도7538');
assert.equal(legalBlocker.authority?.url, 'https://www.scourt.go.kr/supreme/news/NewsViewAction2.work?gubun=4&searchOption=&searchWord=&seqnum=8043');
assert.equal(handoff.sourceIntegrity?.status, 'final');
// sourceIntegrity.scriptSha256 is the normalized finalized draft-text hash;
// the byte hash of the authoritative JSON and handoff copy is checked above.
assert.equal(handoff.sourceIntegrity?.scriptSha256, manifest.source.draftTextSha256);
assert.equal(handoff.sourceIntegrity?.sourceCueCount, manifest.source.sourceCueCount);
assert.equal(handoff.cues?.length, manifest.goldenEvidence.captionCueCount);
assert.equal(handoff.narrationProvider?.modelId, manifest.engine.model);
assert.equal(handoff.narrationProvider?.modelRevision, manifest.engine.revision);
assert.equal(handoff.narrationProvider?.dtype, manifest.engine.dtype);
assert.equal(handoff.narrationProvider?.fallbackUsed, false);
assert.equal(handoff.narrationProvider?.loraLoaded, false);
assert.equal(handoff.narrationProvider?.adapterLoaded, false);
const expectedPromptBankManifestSha256 = isReusedHandoff
  ? manifest.promptBank.historicalGoldenManifestSha256
  : manifest.promptBank.manifestSha256;
assert.equal(handoff.narrationProvider?.promptBankManifestSha256, expectedPromptBankManifestSha256);
assert.equal(handoff.narrationProvider?.promptBankProvenance?.manifestSha256, expectedPromptBankManifestSha256);
if (isReusedHandoff) {
  assert.equal(reusedHandoff.versionId, 'msa88n03-34276-4w0ivx');
  assert.equal(reusedHandoff.sourceIntegrity?.scriptSha256, manifest.source.draftTextSha256);
  assert.equal(reusedHandoff.narrationProvider?.postAcceptanceAudioSha256, manifest.goldenEvidence.audioSha256);
  assert.deepEqual(handoff.narrationProvider?.globalWordAnchors, reusedHandoff.narrationProvider?.globalWordAnchors);
  assert.deepEqual(
    (handoff.cues ?? []).map(({ text, start, end }) => ({ text, start, end })),
    (reusedHandoff.cues ?? []).map(({ text, start, end }) => ({ text, start, end })),
    'caption timing/text drift from accepted narration reuse handoff',
  );
}
assert.notEqual(manifest.promptBank.manifestSha256, manifest.promptBank.historicalGoldenManifestSha256);
assert.equal(handoff.narrationProvider?.promptHashes?.question, manifest.promptBank.question.sha256);
for (const style of manifest.promptBank.declarativeGuide.styles) {
  assert.equal(handoff.narrationProvider?.promptHashes?.[style], manifest.promptBank.declarativeGuide.sha256, `${style} prompt drift`);
}

const accepted = (handoff.narrationProvider?.speechAcceptance?.attempts ?? [])
  .flatMap((attempt) => attempt.segments ?? [])
  .filter((segment) => segment.accepted === true);
const acceptedStyles = accepted.map((segment) => segment.style);
assert.deepEqual(acceptedStyles, ['hook', 'question', 'news_exposition', 'news_exposition', 'criticism', 'question', 'tension', 'solution_closing', 'question']);
assert.equal(accepted.length, manifest.routing.acceptedUnitCount);
const questions = accepted.filter((segment) => segment.style === manifest.routing.questionStyle);
assert.equal(questions.length, manifest.routing.acceptedQuestionUnitCount);
assert.deepEqual(questions.map((segment) => segment.sourceText), manifest.routing.questionTexts);
assert.deepEqual(questions.map((segment) => segment.spokenText), manifest.routing.questionTexts);
assert.equal(manifest.pitchCorrections?.exactlyOnce, true);
assert.ok(Array.isArray(manifest.pitchCorrections?.required) && manifest.pitchCorrections.required.length > 0, 'pitch correction contract missing');
const pitchEvidence = accepted.flatMap((segment) => segment.pitchCorrections ?? []);
assert.equal(pitchEvidence.length, manifest.pitchCorrections.required.length, 'pitch correction evidence count drift');
for (const required of manifest.pitchCorrections.required) {
  const matches = pitchEvidence.filter((evidence) => evidence.id === required.id);
  assert.equal(matches.length, 1, `pitch correction must apply exactly once: ${required.id}`);
  const evidence = matches[0];
  assert.equal(evidence.phrase, required.phrase);
  assert.equal(evidence.word, required.word);
  assert.equal(evidence.alignmentModel, required.alignmentModel);
  assert.equal(evidence.semitones, required.semitones);
  assert.equal(evidence.formantPreserved, required.formantPreserved);
  assert.equal(evidence.durationPreserved, required.durationPreserved);
  assert.equal(evidence.asrRevalidatedAfterCorrection, required.asrRevalidatedAfterCorrection);
  assert.ok(Number.isFinite(evidence.f0BeforeSyllableHz));
  assert.ok(Number.isFinite(evidence.f0AfterSyllableHz));
  assert.ok(evidence.syllableDeltaSemitones >= required.minimumSyllableDeltaSemitones);
}
const exactPitchSegment = accepted.find((segment) => segment.sourceText?.includes('성적 목적'));
assert.ok(exactPitchSegment, 'exact 성적 목적 segment missing');
assert.equal(exactPitchSegment.spokenText, exactPitchSegment.sourceText, 'pitch-corrected phrase must remain exact script');
assert.equal(exactPitchSegment.pitchCorrections?.length, 1);
assert.equal(handoff.narrationProvider?.speechAcceptance?.final?.pitchCorrectionsExactlyOnce, true);
const finalQuestionAttempts = (handoff.narrationProvider?.speechAcceptance?.attempts ?? []).filter((attempt) => attempt.segmentIndex === 9);
assert.deepEqual(finalQuestionAttempts.map((attempt) => attempt.seed), manifest.nonDeterminism.finalQuestionAttemptSeeds);
assert.equal(finalQuestionAttempts.at(-1)?.accepted, true);
const exactBrandSegment = accepted.find((segment) => segment.sourceText?.includes('<참교육>'));
assert.ok(exactBrandSegment, 'exact <참교육> segment missing');
assert.equal(exactBrandSegment.spokenText, exactBrandSegment.sourceText.replace(/[<>]/g, ''), 'non-spoken angle brackets must be the only brand-text normalization');
for (const segment of accepted) {
  if (segment.generationMode === 'owner-recording-segment') {
    assert.equal(segment.verificationMode, 'pinned-owner-asset-hash-and-span');
    assert.deepEqual(segment.asrChecks, [], 'owner segment must not be represented as synthesized dual-ASR evidence');
    assert.equal(segment.seed, null);
    assert.match(segment.ownerRecordingSegment?.sourceAudioSha256 ?? '', /^[0-9a-f]{64}$/);
    assert.match(segment.ownerRecordingSegment?.promptAssetSha256 ?? '', /^[0-9a-f]{64}$/);
    assert.ok(segment.ownerRecordingSegment?.endSeconds > segment.ownerRecordingSegment?.startSeconds);
  } else {
    assert.equal(segment.asrChecks?.length, 2, 'dual-ASR evidence missing');
    assert.deepEqual(segment.asrChecks.map((check) => check.model), manifest.gates.dualAsr.models, `ASR model set drift for ${segment.index}`);
    assert.equal(new Set(segment.asrChecks.map((check) => check.model)).size, manifest.gates.dualAsr.models.length, `duplicate ASR model evidence for ${segment.index}`);
    for (const check of segment.asrChecks) assert.ok(check.cer <= manifest.gates.dualAsr.maxCharacterErrorRate, `CER gate failed for ${segment.index}`);
  }
  assert.equal(segment.signal?.sampleRate, manifest.gates.signal.sampleRate);
  assert.equal(segment.signal?.clippedSamples ?? 0, manifest.gates.signal.clippedSamples);
}
assert.deepEqual(handoff.narrationProvider?.asrValidation?.models, manifest.gates.dualAsr.models);
assert.equal(handoff.narrationProvider?.asrValidation?.maxCharacterErrorRate, manifest.gates.dualAsr.maxCharacterErrorRate);
assert.equal(handoff.narrationProvider?.asrValidation?.failClosed, true);
assert.deepEqual(handoff.narrationProvider?.asrValidation?.criticalPhraseModels, manifest.gates.criticalPhrases.models);
for (const phrase of manifest.gates.criticalPhrases.required) {
  const checks = accepted.flatMap((segment) => segment.criticalPhraseChecks ?? []);
  assert.ok(checks.some((check) => manifest.gates.criticalPhrases.models.includes(check.model) && check.required?.includes(phrase) && (check.missing ?? []).length === 0), `critical phrase evidence missing: ${phrase}`);
}

const pauses = acceptanceNarration?.postAcceptanceSentencePauseEdits ?? [];
assert.equal(pauses.length, manifest.pauses.semanticBoundaryCount);
for (const pause of pauses) {
  assert.equal(pause.outputPauseSeconds, manifest.pauses.targetSeconds);
  assert.equal(pause.sentenceBoundary, true);
  if (pause.sourceKind === 'anchor-forward-rms-zero-crossing') {
    assert.equal(pause.guardSeconds, manifest.pauses.guardSeconds);
    assert.equal(pause.searchRadiusSeconds, manifest.pauses.searchRadiusSeconds);
  }
}
const anchors = handoff.narrationProvider?.globalWordAnchors ?? [];
assert.equal(anchors.length, manifest.goldenEvidence.globalWordAnchorCount);
const anchorKeys = new Set();
let previousStart = -Infinity;
let previousEnd = -Infinity;
for (const anchor of anchors) {
  assert.ok(anchor.endChar >= anchor.startChar);
  assert.ok(anchor.end >= anchor.start);
  assert.ok(anchor.start >= previousStart && anchor.end >= previousEnd, 'global anchors are not monotonic');
  const key = JSON.stringify([anchor.startChar, anchor.endChar, anchor.start, anchor.end]);
  assert.equal(anchorKeys.has(key), false, 'duplicate global anchor');
  anchorKeys.add(key);
  previousStart = anchor.start;
  previousEnd = anchor.end;
}

const tracks = handoff.tracks ?? [];
assert.equal(tracks.filter((track) => track.type === 'video').length, manifest.goldenEvidence.videoTrackCount);
const audioTracks = tracks.filter((track) => track.type === 'audio');
assert.equal(audioTracks.length, manifest.goldenEvidence.audioTrackCount);
assert.equal(audioTracks[0]?.src, 'narration-retimed.m4a');
assert.equal(tracks.some((track) => /bgm|music/i.test(`${track.src ?? ''} ${track.name ?? ''}`)), false, 'BGM track present');
assert.equal(project.bgm, undefined, 'live project BGM config present');
assert.equal(handoff.bgm, undefined, 'handoff BGM provenance present');
assert.equal(handoff.narrationProvider?.speechAcceptance?.final?.accepted, true);
const finalSpeechAcceptance = handoff.narrationProvider?.speechAcceptance?.final;
if (finalSpeechAcceptance?.failClosedVerification === true) {
  assert.equal(finalSpeechAcceptance.synthesizedSegmentsDualAsr, true);
  assert.equal(finalSpeechAcceptance.ownerSegmentsPinnedAsset, true);
  assert.equal(finalSpeechAcceptance.ownerSegmentCount + finalSpeechAcceptance.synthesizedSegmentCount, finalSpeechAcceptance.segmentCount);
  assert.equal(finalSpeechAcceptance.segmentCount, accepted.length);
} else {
  assert.equal(finalSpeechAcceptance?.failClosedDualAsr, true);
}
assert.equal(acceptanceNarration?.postAcceptanceSignal?.clippedSamples ?? 0, 0);
assert.equal(acceptanceNarration?.postAcceptanceSignal?.sampleRate, manifest.gates.signal.sampleRate);
assert.ok((acceptanceNarration?.postAcceptanceSignal?.endpointAmplitude ?? 0) <= manifest.gates.signal.endpointAmplitudeMax);
assert.equal(typeof acceptanceNarration?.postAcceptanceSignal, 'object');
assert.equal(acceptanceNarration.postAcceptanceSignal.clippedSamples, manifest.gates.signal.clippedSamples);
assert.equal(acceptanceNarration.postAcceptanceAudioSha256, manifest.goldenEvidence.audioSha256);
const audioProbe = probe(resolve(manifest.goldenEvidence.audio));
const audioStream = audioProbe.streams?.find((stream) => stream.codec_type === 'audio');
assert.equal(audioStream?.codec_name, 'aac');
assert.equal(Number(audioStream?.sample_rate), 24000);
assert.equal(Number(audioStream?.channels), 1);
assert.equal(Number(audioStream?.channels), manifest.gates.signal.channels);
const videoProbe = probe(resolve(manifest.goldenEvidence.video));
const videoStream = videoProbe.streams?.find((stream) => stream.codec_type === 'video');
const videoAudioStream = videoProbe.streams?.find((stream) => stream.codec_type === 'audio');
assert.equal(videoStream?.codec_name, 'h264');
assert.equal(videoAudioStream?.codec_name, 'aac');
assert.equal(Number(videoAudioStream?.sample_rate), 24000);
assert.equal(Number(videoAudioStream?.channels), 1);
assert.equal(videoProbe.streams?.filter((stream) => stream.codec_type === 'audio').length, 1);

for (const [key, expected] of Object.entries({
  handoff: manifest.goldenEvidence.handoffSha256,
  video: manifest.goldenEvidence.videoSha256,
  audio: manifest.goldenEvidence.audioSha256,
  questionPreview: manifest.goldenEvidence.questionPreviewSha256,
})) {
  const file = resolve(manifest.goldenEvidence[key]);
  assert.equal(await sha256(file), expected, `${key} golden hash drift`);
}

console.log(JSON.stringify({
  status: 'canonical-passed',
  versionId: handoff.versionId,
  model: manifest.engine.model,
  revision: manifest.engine.revision,
  acceptedUnits: accepted.length,
  questionUnits: questions.length,
  cueCount: handoff.cues.length,
  pauseCount: pauses.length,
  anchorCount: anchors.length,
  videoSha256: manifest.goldenEvidence.videoSha256,
  audioSha256: manifest.goldenEvidence.audioSha256,
  handoffSha256: manifest.goldenEvidence.handoffSha256,
  publishable: handoff.publishable,
  uploadBlocked: handoff.releaseGate?.uploadBlocked,
}, null, 2));
