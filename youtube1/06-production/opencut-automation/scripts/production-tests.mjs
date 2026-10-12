import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  allocateFramesFromDurations,
  allocateSceneFrames,
  allocateSceneFramesFromCaptionAnchors,
  alignAuthoritativeCaptionCues,
  assertHandoffSceneAssetNames,
  buildSentenceAwareSilenceCuts,
  buildSentencePauseEdits,
  buildSilenceCuts,
  buildAss,
  buildCalibrationAss,
  escapeFilterPath,
  keptAudioSegments,
  isSentenceEndingText,
  parseSilenceDetect,
  remapCuesForSpeechTempo,
  remapCuesForSentencePauseEdits,
  formatReferenceCaptionCues,
  splitOverflowingReferenceCaptionCues,
  assertCaptionPresetMatchesTokens,
  REFERENCE_CAPTION_PRESET,
  REFERENCE_CAPTION_RULES,
  QWEN3_TTS_STYLES,
  QWEN3_TTS_STYLE_MODES,
  segmentCaptionText,
  segmentReferenceCaptionCues,
  thumbnailSeek,
  validateThumbnailOverride,
  validateProject,
  buildMotionCameraFilter,
  fitTitleFontSize,
  SCENE_CAMERA_MODES,
} from './production-lib.mjs';
import {
  canSplitKoreanAt,
  splitKoreanCaptionText,
  verifyKoreanCaptionNumbers,
} from './korean-caption-splitter.mjs';

const root = path.resolve('.');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'short-production-'));
function run(command, args, expectFailure = false) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (expectFailure) {
    assert.notEqual(result.status, 0, `${command} unexpectedly succeeded`);
    return `${result.stdout}\n${result.stderr}`;
  }
  assert.equal(result.status, 0, `${command} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

try {
  assert.equal(fitTitleFontSize('제주 초등학교', 120, 920), 120, 'short established titles retain the reference size');
  const fittedPoliceTitle = fitTitleFontSize('[단독] "아들이 여교사 상대로', 120, 920);
  assert.ok(fittedPoliceTitle >= 42 && fittedPoliceTitle < 70, 'long Korean titles shrink into the safe band without becoming unreadably small');
  assert.throws(() => fitTitleFontSize('', 120, 920), /non-empty text/u);
  assert.equal(assertHandoffSceneAssetNames([path.join(temp, 'a', 'scene.png'), path.join(temp, 'a', 'scene.png')]), true);
  assert.throws(() => assertHandoffSceneAssetNames([path.join(temp, 'a', 'scene.png'), path.join(temp, 'b', 'scene.png')]), /share a handoff basename/);
  assert.throws(() => assertHandoffSceneAssetNames([path.join(temp, 'thumbnail.png')]), /reserved/);
  assert.throws(() => assertHandoffSceneAssetNames([path.join(temp, 'CAPTIONS.SRT')]), /reserved/);
  const audio = path.join(temp, 'voice.mp3');
  fs.writeFileSync(audio, 'placeholder');
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' } }, temp), /narration is required/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts' }, unknown: true }, temp), /unknown project properties/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b', unknown: true }, narration: { mode: 'edge-tts' } }, temp), /unknown title properties/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts', unknown: true } }, temp), /unknown narration properties/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts', speechTempo: 0.4 } }, temp), /speechTempo/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts', removeSilence: 'yes' } }, temp), /removeSilence/);
assert.equal(validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts', speechTempo: 0.8366, removeSilence: true } }, temp).narration.speechTempo, 0.8366);
assert.throws(() => validateProject({ id: 'x', productionAuthorityMode: true, title: { line1: '가'.repeat(20), line2: '나' }, narration: { mode: 'edge-tts' } }, temp), /approved headline/u);
assert.throws(() => validateProject({ id: 'x', productionAuthorityMode: true, title: { line1: '짧은 제목', line2: '두번째 줄' }, narration: { mode: 'edge-tts' } }, temp), /preplanned hash-locked owner-voice-v1 Qwen3-TTS output/u);
  const releaseGate = { publishable: false, releaseStatus: 'preview', uploadBlocked: true, blockers: [{ id: 'legal', stage: '07-quality-assurance', severity: 'block', claim: 'fixed claim', reason: 'requires legal review', authority: { case: '2021도7538', url: 'https://www.scourt.go.kr/example' } }] };
  assert.equal(validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts' }, releaseGate }, temp).releaseGate.publishable, false);
  const approval = { reportVersionId: 'version-1', reportSha256: 'a'.repeat(64), scriptSha256: 'b'.repeat(64), reviewer: 'reviewer', approvedAt: '2026-08-03T00:00:00.000Z' };
  const approvedGate = { publishable: true, releaseStatus: 'approved', uploadBlocked: false, blockers: [], approval };
  assert.equal(validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts' }, releaseGate: approvedGate }, temp).releaseGate.publishable, true);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts' }, releaseGate: { ...approvedGate, approval: undefined } }, temp), /approval/);
  assert.deepEqual(validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts' } }, temp).captionPreset, REFERENCE_CAPTION_PRESET);
  assert.deepEqual(validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts' }, captionProtectedTerms: ['전기버스 요금'] }, temp).captionProtectedTerms, ['전기버스 요금']);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts' }, captionProtectedTerms: ['전기버스', '전기버스'] }, temp), /unique/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts' }, captionProtectedTerms: [''] }, temp), /between 2 and 100/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, captionPreset: { ...REFERENCE_CAPTION_PRESET, fontSize: 100 }, narration: { mode: 'edge-tts' } }, temp), /captionPreset.fontSize/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts', sentencePauseSeconds: 0.004, joinSafetySeconds: 0.005 } }, temp), /at least/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts', sentencePauseSeconds: 0.2, semanticPauseSeconds: 0.3 } }, temp), /at least/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'file', audio } }, temp), /SRT|transcribe/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'file', audio, srt: 'missing.srt', transcribe: true } }, temp), /SRT/);
  assert.equal(validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'local-clone', style: 'hook' } }, temp).narration.style, 'hook');
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'local-clone', style: 'tension' } }, temp), /style/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'qwen3-tts' } }, temp), /neutral style/);
  assert.equal(validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'qwen3-tts', style: 'hook' } }, temp).narration.style, 'hook');
assert.equal(validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'qwen3-tts', style: 'auto' } }, temp).narration.style, 'auto');
assert.equal(validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'qwen3-tts', style: 'hook', maxSegmentChars: 220, criticalPhrases: ['key phrase'] } }, temp).narration.maxSegmentChars, 220);
assert.deepEqual(validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'qwen3-tts', style: 'hook', criticalPhraseModels: ['medium'] } }, temp).narration.criticalPhraseModels, ['medium']);
const pitchCorrection = { id: 'seongjeok-final-syllable', phrase: '\uC131\uC801 \uBAA9\uC801', word: '\uC131\uC801', activeFractionStart: 0.55, semitones: 3, crossfadeSeconds: 0.012 };
assert.deepEqual(validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'qwen3-tts', style: 'hook', pitchCorrections: [pitchCorrection] } }, temp).narration.pitchCorrections, [pitchCorrection]);
assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'qwen3-tts', style: 'hook', pitchCorrections: [{ ...pitchCorrection, crossfadeSeconds: 0.04 }] } }, temp), /crossfadeSeconds/);
assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'qwen3-tts', style: 'hook', pitchCorrections: [pitchCorrection, { ...pitchCorrection, id: 'duplicate' }] } }, temp), /phrase must be unique/);
const prosodyProfile = path.join(temp, 'prosody-profile.json');
fs.writeFileSync(prosodyProfile, '{}');
assert.equal(validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'qwen3-tts', style: 'hook', maxAttempts: 3, prosodyProfile: 'prosody-profile.json', prosodyCandidates: 2 } }, temp).narration.prosodyCandidates, 2);
assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'qwen3-tts', style: 'hook', prosodyCandidates: 2 } }, temp), /requires narration.prosodyProfile/);
assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'qwen3-tts', style: 'hook', maxAttempts: 2, prosodyProfile: 'prosody-profile.json', prosodyCandidates: 3 } }, temp), /cannot exceed/);
assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'qwen3-tts', style: 'hook', maxSegmentChars: 79 } }, temp), /maxSegmentChars/);
assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'qwen3-tts', style: 'hook', criticalPhrases: [''] } }, temp), /criticalPhrases/);
assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'qwen3-tts', style: 'hook', criticalPhraseModels: ['small', 'small'] } }, temp), /criticalPhraseModels/);
  const autoOverride = { segmentIndex: 1, textSha256: 'a'.repeat(64), style: 'tension' };
  assert.equal(validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'qwen3-tts', style: 'auto', stylePlan: [autoOverride] } }, temp).narration.stylePlan[0].style, 'tension');
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'qwen3-tts', style: 'hook', stylePlan: [autoOverride] } }, temp), /only valid/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'qwen3-tts', style: 'auto', stylePlan: [{ ...autoOverride, textSha256: 'A'.repeat(64) }] } }, temp), /lowercase SHA-256/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'qwen3-tts', style: 'auto', stylePlan: [autoOverride, { ...autoOverride, style: 'hook' }] } }, temp), /duplicates/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'qwen3-tts', style: 'auto', referenceAudio: audio } }, temp), /rejects caller-supplied/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'qwen3-tts', style: 'dramatic' } }, temp), /style/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'local-clone', cloneSpeed: 2.1 } }, temp), /cloneSpeed/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'local-clone', fallbackVoice: 'ko-KR-SunHiNeural' } }, temp), /requires/);
  assert.equal(validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'local-clone', fallback: 'edge-tts', fallbackVoice: 'ko-KR-SunHiNeural' } }, temp).narration.fallback, 'edge-tts');
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts' }, scenes: [] }, temp), /non-empty/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts' }, scenes: [{ asset: 'x.mp4' }, { asset: 'y.mp4', duration: 1 }] }, temp), /all scenes or none/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts' }, scenes: [{ asset: 'x.mp4', captionAnchor: '첫 장면' }, { asset: 'y.mp4' }] }, temp), /captionAnchor values must be provided for all scenes or none/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts' }, scenes: [{ asset: 'x.mp4', duration: 1, captionAnchor: '첫 장면' }] }, temp), /mutually exclusive/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts' }, scenes: [{ asset: 'x.mp4', captionAnchor: '첫 장면' }, { asset: 'y.mp4', captionAnchor: '첫 장면' }] }, temp), /must be unique/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts' }, scenes: [{ asset: 'x.mp4', extra: true }] }, temp), /only support/);
  assert.deepEqual(SCENE_CAMERA_MODES, ['none', 'push-in', 'pull-out', 'drift-left', 'drift-right', 'handheld']);
  assert.equal(validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts' }, scenes: [{ asset: 'x.mp4', camera: 'push-in', intensity: 0.4 }] }, temp).scenes[0].intensity, 0.4);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts' }, scenes: [{ asset: 'x.mp4', camera: 'zoom' }] }, temp), /camera/);
  assert.throws(() => validateProject({ id: 'x', title: { line1: 'a', line2: 'b' }, narration: { mode: 'edge-tts' }, scenes: [{ asset: 'x.mp4', intensity: 1.1 }] }, temp), /intensity/);
  const pushCameraFilter = buildMotionCameraFilter({ camera: 'push-in', intensity: 0.75, width: 1080, height: 972, frames: 90 });
  const noneCameraFilter = buildMotionCameraFilter({ camera: 'none', intensity: 1, width: 1080, height: 972, frames: 90 });
  const pullCameraFilter = buildMotionCameraFilter({ camera: 'pull-out', intensity: 0.75, width: 1080, height: 972, frames: 90 });
  const driftCameraFilter = buildMotionCameraFilter({ camera: 'drift-right', intensity: 0.5, width: 1080, height: 972, frames: 90 });
  const handheldCameraFilter = buildMotionCameraFilter({ camera: 'handheld', intensity: 0.5, width: 1080, height: 972, frames: 90 });
  assert.match(pushCameraFilter, /force_original_aspect_ratio=increase/);
  assert.doesNotMatch(pushCameraFilter, /pad=/);
  assert.match(pushCameraFilter, /eval=frame/);
  assert.match(pushCameraFilter, /n\/89/);
  assert.doesNotMatch(noneCameraFilter, /eval=frame|sin\(|cos\(/);
  assert.match(noneCameraFilter, /force_original_aspect_ratio=increase,crop=1080:972/);
  assert.notEqual(pushCameraFilter, pullCameraFilter);
  assert.match(driftCameraFilter, /0\.35\*0\.500000/);
  assert.match(handheldCameraFilter, /sin\(n\*0\.37\)/);
  assert.deepEqual(allocateSceneFrames(5, 3), [2, 2, 1]);
  assert.throws(() => allocateSceneFrames(2, 3), /zero-length/);
  assert.deepEqual(allocateFramesFromDurations(10, [1, 2, 1]), [3, 5, 2]);
  const anchoredCues = [
    { start: 0, end: 1, text: '첫 장면입니다.' },
    { start: 1.5, end: 3, text: '두 번째 사건이 시작됩니다.' },
    { start: 4, end: 6, text: '마지막 해결책입니다.' },
  ];
  assert.deepEqual(allocateSceneFramesFromCaptionAnchors(180, [
    { captionAnchor: '첫 장면' },
    { captionAnchor: '두 번째 사건' },
    { captionAnchor: '마지막 해결책' },
  ], anchoredCues, 30), [45, 75, 60]);
  assert.deepEqual(allocateSceneFramesFromCaptionAnchors(300, [
    { captionAnchor: 'ab' },
    { captionAnchor: 'fg' },
  ], [{ start: 0, end: 10, text: 'abcdefghij' }], 30), [150, 150]);
  assert.throws(() => allocateSceneFramesFromCaptionAnchors(180, [{ captionAnchor: '없는 장면' }], anchoredCues, 30), /not found/);
  assert.equal(thumbnailSeek(1, 1 / 30), 0);
  assert.equal(thumbnailSeek(2, 2 / 30), 1 / 30);
  const thumbnailFixture = path.resolve(root, '../../04-visual-assets/runs/jeju-school-intrusion-thumbnail-20260803/jeju-school-intrusion-thumbnail-layout-v2-caption-free.png');
  const thumbnailFixtureSha = '69d44e54ac5158af8e286e286d9f3affa0d7be648ba630f2fb96a7df8170645b';
  assert.equal(validateThumbnailOverride({ image: thumbnailFixture, sha256: thumbnailFixtureSha, source: 'fixture' }, root).width, 1080);
  assert.throws(() => validateThumbnailOverride({ image: thumbnailFixture, sha256: '0'.repeat(64), source: 'fixture' }, root), /does not match/);
  assert.throws(() => validateThumbnailOverride({ image: thumbnailFixture, sha256: thumbnailFixtureSha, source: 'fixture', extra: true }, root), /unknown thumbnail/);
  const detectedSilences = parseSilenceDetect('[x] silence_start: 2\n[x] silence_end: 3 | silence_duration: 1\n[x] silence_start: 5\n[x] silence_end: 7 | silence_duration: 2');
  assert.deepEqual(detectedSilences, [{ start: 2, end: 3 }, { start: 5, end: 7 }]);
  const silenceCuts = buildSilenceCuts(detectedSilences, 10, 0.001);
  assert.deepEqual(silenceCuts, [{ start: 2.0005, end: 2.9995 }, { start: 5.0005, end: 6.9995 }]);
  assert.deepEqual(keptAudioSegments(10, silenceCuts), [
    { start: 0, end: 2.0005 },
    { start: 2.9995, end: 5.0005 },
    { start: 6.9995, end: 10 },
  ]);
  const retimed = remapCuesForSpeechTempo([{ start: 1, end: 4, text: 'cue' }, { start: 7, end: 9, text: 'next' }], silenceCuts, 0.8366);
  assert.ok(Math.abs(retimed[0].start - 1 / 0.8366) < 1e-9);
  assert.ok(Math.abs(retimed[0].end - (4 - 0.999) / 0.8366) < 1e-9);
  assert.ok(Math.abs(retimed[1].start - (7 - 2.998) / 0.8366) < 1e-9);
  assert.ok(Math.abs(retimed[1].end - (9 - 2.998) / 0.8366) < 1e-9);
  assert.equal(isSentenceEndingText('문장입니다.'), true);
  assert.equal(isSentenceEndingText('질문인가요?”'), true);
  assert.equal(isSentenceEndingText('이어지는 조각'), false);
  const pacedCuts = buildSentenceAwareSilenceCuts(
    [{ start: 0, end: 1 }, { start: 2, end: 3 }, { start: 5, end: 7 }],
    10,
    [{ start: 1, end: 2.5, text: '문장입니다.' }, { start: 4, end: 6, text: '이어지는 조각' }],
    { speechTempo: 1.0106, sentencePauseSeconds: 0.62, semanticPauseSeconds: 0.3, joinSafetySeconds: 0.005 },
  );
  assert.equal(pacedCuts.filter((cut) => cut.sentenceBoundary).length, 1);
  assert.equal(pacedCuts.filter((cut) => cut.semanticBoundary).length, 1);
  assert.ok(Math.abs(pacedCuts[0].outputPauseSeconds - 0.005) < 1e-12);
  assert.ok(Math.abs(pacedCuts[1].outputPauseSeconds - 0.62) < 1e-12);
  assert.ok(Math.abs(pacedCuts[2].outputPauseSeconds - 0.3) < 1e-12);
  assert.throws(() => buildSentenceAwareSilenceCuts(
    [{ start: 2, end: 2.1 }],
    3,
    [{ start: 1, end: 2.05, text: '문장입니다.' }],
    { speechTempo: 1.0106, sentencePauseSeconds: 0.62, semanticPauseSeconds: 0.3, joinSafetySeconds: 0.005 },
  ), /shorter/);
  const projectedDuration = (130.728 - 56.963 + 34 * 0.62 * 1.0106 + 14 * 0.3 * 1.0106 + 0.005 * 1.0106) / 1.0106;
  assert.ok(projectedDuration > 98.2 && projectedDuration < 98.4);
  const pauseEdits = buildSentencePauseEdits(
    [{ start: 1.493, end: 1.658 }, { start: 2.464, end: 2.904 }, { start: 7.447, end: 7.615 }],
    10,
    [{ start: 0, end: 1.52, text: '첫 문장.' }, { start: 1.52, end: 2.48, text: '둘째 문장.' }, { start: 2.48, end: 7.28, text: '중간 문장.' }],
    { targetPauseSeconds: 0.45, maxPauseSeconds: 0.5 },
  );
  assert.equal(pauseEdits.length, 2);
  assert.ok(Math.abs(pauseEdits[0].outputPauseSeconds - 0.285) < 1e-9);
  const remappedPauseCues = remapCuesForSentencePauseEdits([{ start: 0, end: 1.52, text: '첫 문장.' }, { start: 1.52, end: 2.48, text: '둘째 문장.' }], pauseEdits, 1);
  assert.equal(remappedPauseCues[0].end, 1.52);
  assert.ok(remappedPauseCues[1].start > 1.9);
  assert.equal(buildSentencePauseEdits([{ start: 2.526, end: 2.719 }], 4, [{ start: 0, end: 2.5, text: '경계 문장.' }], { targetPauseSeconds: 0.45 }).length, 0);
  const semanticCueLines = [
    '넷플릭스 시리즈 <참교육> 속', '교권보호국.', '현실에도 진짜 필요한 거 아니에요?',
    '지난 4월 제주 한 초등학교 교실에 누군가 침입했습니다.',
    '다음 날 여교사의 텀블러에서 발견된 액체는 충격적이게도 남성의 정액이었습니다.',
    '한 달 뒤.', '같은 침입자가 교사용 의자에 소변을 보았습니다.', '범인은 16살 고등학생.',
    '혐의를 모두 인정했지만 교사를 노린 것도, 성적 목적도 아니고 화장실이 급했다고 진술했습니다.',
    '피해 교사 측이 요청한 휴대전화와 컴퓨터 포렌식 영장은 기각됐고,', '혐의는 건조물침입과 재물손괴뿐.',
    '물건 오염만으로 성범죄가 적용되진 않기 때문입니다.', '이게 말이 되나요?',
    '범인이 잡혔는데도 누구인지도 몰라서', '피해자는 늘 공포에 시달리며', '아직도 일상으로 돌아가지 못하고 있습니다.',
    '드라마처럼 응징을 하자는 게 아닙니다.', '하지만 수사 상황 통지와 피해자 보호는 필요하지 않을까요?',
  ];
  const semanticCues = semanticCueLines.map((text, index) => ({ start: index, end: index + 0.8, text }));
  const semanticEdits = buildSentencePauseEdits([], 20, semanticCues, { targetPauseSeconds: 0.45, maxPauseSeconds: 0.5 });
  assert.equal(semanticEdits.length, 13);
  assert.equal(semanticEdits.filter((edit) => edit.boundaryCueIndex === 5).length, 1);
  assert.equal(semanticEdits.some((edit) => edit.boundaryCueIndex === 17), false);
  assert.equal(semanticEdits.some((edit) => edit.boundaryCueIndex === 2), true);
  const multiline = buildSentencePauseEdits([], 8, [
    { start: 0, end: 1, text: '첫 문장.' },
    { start: 1, end: 2, text: '같은 문장의 이어지는 조각,' },
    { start: 2, end: 3, text: '둘째 문장.' },
    { start: 3, end: 4, text: '마지막 질문?' },
  ], { targetPauseSeconds: 0.45, maxPauseSeconds: 0.5 });
  assert.deepEqual(multiline.map((edit) => edit.boundaryCueIndex), [0, 2]);
  const inlineBoundaries = buildSentencePauseEdits([], 4, [{ start: 0, end: 2, text: '첫 문장. 둘째 문장.' }, { start: 2, end: 4, text: '마지막 질문?' }], { targetPauseSeconds: 0.45, maxPauseSeconds: 0.5 });
  assert.equal(inlineBoundaries.length, 2);
  assert.equal(inlineBoundaries[0].boundaryCueIndex, 0);
  assert.ok(inlineBoundaries[0].boundaryTime < 1.5);
  const inlineAnchoredBoundaries = buildSentencePauseEdits([], 4, [{
    start: 0,
    end: 2,
    text: '첫 문장. 둘째 문장.',
    anchors: [
      { startChar: 0, endChar: 3, start: 0.1, end: 0.7 },
      { startChar: 3, endChar: 7, start: 0.9, end: 1.8 },
    ],
  }, { start: 2, end: 4, text: '마지막 질문?' }], { targetPauseSeconds: 0.45, maxPauseSeconds: 0.5, unitBoundaryTimes: [2] });
  assert.deepEqual(inlineAnchoredBoundaries.map((edit) => edit.start), [0.7, 2]);
  assert.deepEqual(inlineAnchoredBoundaries.map((edit) => edit.boundaryCharOffset), [5, 12]);
  const syntheticSamples = new Int16Array(24000 * 3); for (let index = 0; index < syntheticSamples.length; index += 1) syntheticSamples[index] = index / 24000 < 1.46 && index % 120 < 60 ? 12000 : (index / 24000 < 1.46 ? -12000 : 0);
  const anchored = buildSentencePauseEdits([], 3, [{ start: 0, end: 1.4, text: '경계.', anchors: [{ start: 0, end: 1.41 }] }, { start: 1.4, end: 2.8, text: '끝?' }], { audioSamples: syntheticSamples, sampleRate: 24000 });
  assert.equal(anchored.length, 1);
  assert.equal(anchored[0].sourceKind, 'word-anchor-boundary');
  assert.equal(anchored[0].start, 1.41);
  const anchorBeatsProjectedCueEnd = buildSentencePauseEdits([], 3, [
    { start: 0, end: 1.5, text: 'sentence.', anchors: [{ start: 0, end: 1.4 }] },
    { start: 1.5, end: 2.8, text: 'next.' },
  ]);
  assert.equal(anchorBeatsProjectedCueEnd[0].start, 1.4);
  assert.equal(anchorBeatsProjectedCueEnd[0].sourceKind, 'word-anchor-boundary');
  const unitSnapped = buildSentencePauseEdits([], 3, [{ start: 0, end: 1.2, text: '경계.' }, { start: 1.2, end: 2.8, text: '끝?' }], { audioSamples: syntheticSamples, sampleRate: 24000, unitBoundaryTimes: [1.4] });
  assert.equal(unitSnapped[0].sourceKind, 'qwen-unit-tail-preserved');
  assert.equal(unitSnapped[0].start, 1.4);
  const preservedDetectedTail = buildSentencePauseEdits([{ start: 0.9, end: 1.1 }], 3, [{ start: 0, end: 1, text: '경계.' }, { start: 1, end: 2.8, text: '끝?' }]);
  assert.equal(preservedDetectedTail[0].sourceKind, 'detected-silence-extended');
  assert.ok(Math.abs(preservedDetectedTail[0].start - 1.1) < 1e-9);
  assert.ok(Math.abs(preservedDetectedTail[0].naturalPauseSeconds - 0.2) < 1e-9);
  assert.ok(Math.abs(preservedDetectedTail[0].outputPauseSeconds - 0.25) < 1e-9);
  const rejectedFalseSilence = buildSentencePauseEdits([{ start: 0.9, end: 1.1 }], 3, [
    { start: 0, end: 1, text: 'sentence.', anchors: [{ start: 0, end: 1.2 }] },
    { start: 1, end: 2.8, text: 'next.' },
  ]);
  assert.equal(rejectedFalseSilence[0].sourceKind, 'word-anchor-boundary');
  assert.equal(rejectedFalseSilence[0].start, 1.2);

  const longCaption = '교권보호를 위한 아주 긴 한국어 문장 https://example.com/path/to/a-very-long-url';
  const longChunks = segmentCaptionText(longCaption, 8);
  assert.ok(longChunks.length > 3);
  assert.ok(longChunks.every((chunk) => [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(chunk)].length <= 8));
  const koreanSemanticChunks = splitKoreanCaptionText(
    '혐의를 모두 인정했지만 교사를 노린 것도, 성적인 목적도 아니고 화장실이 급했다고 진술했습니다.',
    { maxWords: 8, maxGraphemes: 16 },
  );
  assert.deepEqual(koreanSemanticChunks, [
    '혐의를 모두 인정했지만',
    '교사를 노린 것도,',
    '성적인 목적도 아니고',
    '화장실이 급했다고',
    '진술했습니다.',
  ]);
  assert.deepEqual(
    splitKoreanCaptionText(
      '하지만 수사 상황 통지와 피해자 보호는 필요하지 않을까요?',
      { maxWords: 8, maxGraphemes: 16 },
    ),
    ['하지만 수사 상황 통지와', '피해자 보호는', '필요하지 않을까요?'],
  );
  const newsroomRelationCases = [
    ['누군가 살충제를 넣기 전까지는 말입니다.', '넣기 전까지는'],
    ['간호조무사 A씨는 업무로 핀잔을 주던 B씨에게 불만이 있었습니다.', '업무로 핀잔을 주던'],
    ['B씨는 한 모금 뒤 이상한 맛에 멈췄지만', '이상한 맛에'],
    ['위장장애와 불안장애를 겪었습니다.', '불안장애를 겪었습니다'],
    ['사람이 먹으면 안 되는 살충제잖아요.', '안 되는 살충제잖아요'],
    ['잠깐 비운 자리까지 의심하게 될지도 모릅니다.', '의심하게 될지도'],
    ['이 사건은 판결만으로 끝난 게 아닙니다.', '끝난 게 아닙니다'],
  ];
  for (const [source, relation] of newsroomRelationCases) {
    const chunks = splitKoreanCaptionText(source, { maxWords: 8, maxGraphemes: 24, minGraphemes: 4 });
    assert.ok(chunks.some((chunk) => chunk.includes(relation)), `protected Korean relation was split: ${relation}`);
  }
  assert.equal(canSplitKoreanAt(['하지만', '결론은'], 1), false);
  assert.equal(canSplitKoreanAt(['말했습니다.', '하지만', '결론은'], 1), true);
  assert.equal(canSplitKoreanAt(['A씨는', '업무를', '마쳤습니다.'], 1), true);
  assert.equal(canSplitKoreanAt(['오늘은', '전국에서', '비가', '옵니다.'], 1), true);
  assert.equal(
    verifyKoreanCaptionNumbers(
      '지난 4월, 피해자는 1.29초 뒤 움직였습니다.',
      splitKoreanCaptionText(
        '지난 4월, 피해자는 1.29초 뒤 움직였습니다.',
        { maxWords: 8, maxGraphemes: 16 },
      ),
    ),
    true,
  );
  assert.deepEqual(segmentCaptionText('앞😀뒤', 1), ['앞', '😀', '뒤']);
  assert.equal(REFERENCE_CAPTION_RULES.id, 'newsroom-semantic-2line-v3');
  assert.equal(REFERENCE_CAPTION_RULES.semanticMaxWords, 8);
  assert.equal(REFERENCE_CAPTION_RULES.semanticMaxGraphemes, 45);
  assert.equal(REFERENCE_CAPTION_RULES.targetGraphemesPerLine, 16);
  const singleLineReferenceCues = segmentReferenceCaptionCues([
    { start: 0, end: 4, text: '혐의는 건조물침입과 재물손괴뿐입니다.' },
  ]);
  assert.ok(singleLineReferenceCues.length >= 2);
  assert.equal(singleLineReferenceCues[0].start, 0);
  assert.equal(singleLineReferenceCues.at(-1).end, 4);
  assert.ok(singleLineReferenceCues.every((cue) => !cue.text.includes('\n')));
  assert.ok(singleLineReferenceCues.every((cue) => [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(cue.text)].length <= REFERENCE_CAPTION_RULES.semanticMaxGraphemes));
  assert.equal(singleLineReferenceCues.map((cue) => cue.text).join(' ').replace(/\s+/g, ''), '혐의는건조물침입과재물손괴뿐입니다.');
  const qaBoundedCues = segmentReferenceCaptionCues([
    { start: 0, end: 2, text: '현실에도 진짜 필요한 거 아니에요?' },
  ], { ...REFERENCE_CAPTION_RULES, minDurationSeconds: 0.6 });
  assert.ok(qaBoundedCues.every((cue) => cue.end - cue.start >= 0.599999));
  const longShortTextCues = segmentReferenceCaptionCues([
    { start: 0, end: 4.46, text: '피해자는 어떻게 살아갈까요?' },
  ], { ...REFERENCE_CAPTION_RULES, minDurationSeconds: 0.6 });
  assert.equal(longShortTextCues.length, 2);
  assert.equal(longShortTextCues.map((cue) => cue.text).join(' ').replace(/\s+/g, ''), '피해자는어떻게살아갈까요?');
  assert.ok(longShortTextCues.every((cue) => cue.end - cue.start >= 0.599999 && cue.end - cue.start <= REFERENCE_CAPTION_RULES.maxDurationSeconds + 1e-9));
  const referenceCues = formatReferenceCaptionCues([
    { start: 0, end: 4, text: '또 마주칠 수 있다는 불안에 시달리고 있다고 호소하고 있습니다.' },
  ], { maxCharsPerLine: 16, maxLines: 2 });
  assert.equal(referenceCues.length, 1);
  assert.ok(referenceCues.every((cue) => cue.text.split('\n').length <= 2));
  const fitting = splitOverflowingReferenceCaptionCues(referenceCues, [{ renderedWidth: 900 }], { safeWidth: 920, outlineWidth: 5, maxCharsPerLine: 16 });
  assert.equal(fitting.splitCount, 0);
  assert.equal(fitting.cues.length, 1);
  const overflowing = splitOverflowingReferenceCaptionCues(referenceCues, [{ renderedWidth: 911 }], { safeWidth: 920, outlineWidth: 5, maxCharsPerLine: 16 });
  assert.equal(overflowing.splitCount, 1);
  assert.equal(overflowing.cues.length, 2);
  assert.equal(overflowing.cues[0].start, 0);
  assert.equal(overflowing.cues[1].end, 4);
  assert.ok(overflowing.cues.every((cue) => cue.text.split('\n').length <= 2));
  assert.ok(overflowing.cues.every((cue) => cue.end - cue.start >= 0.599999));
  const preservedSourceTextOverflow = splitOverflowingReferenceCaptionCues(referenceCues, [{ renderedWidth: 911 }], { safeWidth: 920, outlineWidth: 5, maxCharsPerLine: 16, preserveCueBoundaries: true });
  assert.equal(preservedSourceTextOverflow.cues.length, 2);
  assert.equal(preservedSourceTextOverflow.cues[0].start, referenceCues[0].start);
  assert.equal(preservedSourceTextOverflow.cues.at(-1).end, referenceCues[0].end);
  assert.equal(preservedSourceTextOverflow.cues.map((cue) => cue.text).join(' ').replace(/\s+/g, ''), referenceCues[0].text.replace(/\s+/g, ''));
  const authoritativeFixture = [
    { number: 1, text: '첫 번째 문장은 대본 그대로 표시합니다.' },
    { number: 2, text: '두 번째 문장도, 쉼표와 문장부호를 보존합니다.' },
    { number: 3, text: '화면이 좁다면 같은 자막 안에서 두 줄로만 보여줍니다.' },
  ];
  const timingFixture = [
    { start: 0, end: 1.2, text: 'ASR은' },
    { start: 1.2, end: 3.8, text: '타이밍만 제공합니다' },
    { start: 3.8, end: 7.5, text: '자막 원문은 바꾸지 않습니다' },
  ];
  const authoritativeAligned = alignAuthoritativeCaptionCues(authoritativeFixture, timingFixture);
  assert.equal(authoritativeAligned.length, authoritativeFixture.length);
  assert.deepEqual(authoritativeAligned.map((cue) => cue.text), authoritativeFixture.map((cue) => cue.text));
  assert.equal(authoritativeAligned[0].start, timingFixture[0].start);
  assert.equal(authoritativeAligned.at(-1).end, timingFixture.at(-1).end);
  const exactAligned = alignAuthoritativeCaptionCues(
    [{ text: 'first.' }, { text: 'second.' }],
    [{ start: 0, end: 2, text: 'first.second.', anchors: [
      { startChar: 0, endChar: 5, start: 0, end: 0.9 },
      { startChar: 5, endChar: 11, start: 1.1, end: 2 },
    ] }],
  );
  assert.equal(exactAligned[0].anchors.length, 1);
  assert.equal(exactAligned[1].anchors.length, 1);
  assert.equal(exactAligned[0].anchors[0].end, 0.9);
  assert.equal(exactAligned[1].anchors[0].start, 1.1);
  assert.equal(exactAligned[0].end, 0.9);
  assert.equal(exactAligned[1].start, 0.9);
  const authoritativeVisualCues = formatReferenceCaptionCues(
    segmentReferenceCaptionCues(authoritativeAligned, { ...REFERENCE_CAPTION_RULES, minDurationSeconds: 0.6 }),
    { maxCharsPerLine: 16, maxLines: 2 },
  );
  assert.ok(authoritativeVisualCues.length >= authoritativeFixture.length);
  assert.equal(
    authoritativeVisualCues.map((cue) => cue.text).join('').replace(/\s+/g, ''),
    authoritativeFixture.map((cue) => cue.text).join('').replace(/\s+/g, ''),
  );
  assert.ok(authoritativeVisualCues.every((cue) => cue.text.split('\n').length <= 2));
  const anchoredVisual = segmentReferenceCaptionCues([
    {
      start: 0, end: 2, text: 'abcde fghij', anchors: [
        { startChar: 0, endChar: 5, start: 0, end: 0.2 },
        { startChar: 5, endChar: 10, start: 0.2, end: 2 },
      ],
    },
  ], { ...REFERENCE_CAPTION_RULES, semanticMaxGraphemes: 5, minDurationSeconds: 0.1, maxDurationSeconds: 3, wordAnchors: true });
  assert.deepEqual(anchoredVisual.map((cue) => [cue.text, cue.start, cue.end]), [['abcde', 0, 0.2], ['fghij', 0.2, 2]]);
  const boundedAnchoredVisual = segmentReferenceCaptionCues([{
    start: 0, end: 2, text: 'abcde fghij', anchors: [
      { startChar: 0, endChar: 5, start: 0, end: 0.2 },
      { startChar: 5, endChar: 10, start: 0.2, end: 2 },
    ],
  }], { ...REFERENCE_CAPTION_RULES, semanticMaxGraphemes: 5, minDurationSeconds: 0.6, maxDurationSeconds: 3, wordAnchors: true });
  assert.deepEqual(boundedAnchoredVisual.map((cue) => [cue.text, cue.start, cue.end]), [['abcde', 0, 0.6], ['fghij', 0.6, 2]]);
  const punctuatedAnchoredVisual = segmentReferenceCaptionCues([{
    start: 0, end: 2, text: '가나다. 라마바', anchors: [
      { startChar: 0, endChar: 3, start: 0, end: 0.9 },
      { startChar: 3, endChar: 6, start: 0.9, end: 2 },
    ],
  }], { ...REFERENCE_CAPTION_RULES, semanticMaxGraphemes: 4, minGraphemesPerCue: 1, minDurationSeconds: 0.1, maxDurationSeconds: 3, wordAnchors: true });
  assert.deepEqual(punctuatedAnchoredVisual.map((cue) => [cue.text, cue.start, cue.end]), [['가나다.', 0, 0.9], ['라마바', 0.9, 2]]);
  const pausedAnchoredVisual = segmentReferenceCaptionCues([{
    start: 0, end: 4.46, text: 'abcdefghij abcdef abcdefghij abcdef', anchors: [
      { startChar: 0, endChar: 10, start: 0.36, end: 1.84 },
      { startChar: 10, endChar: 16, start: 1.84, end: 2.6 },
      { startChar: 16, endChar: 26, start: 2.6, end: 4.08 },
      { startChar: 26, endChar: 32, start: 4.08, end: 4.46 },
    ],
  }], { ...REFERENCE_CAPTION_RULES, semanticMaxGraphemes: 10, minGraphemesPerCue: 1, minDurationSeconds: 0.6, maxDurationSeconds: 3, wordAnchors: true });
  assert.deepEqual(pausedAnchoredVisual.map((cue) => Number(cue.end.toFixed(2))), [1.84, 2.6, 3.86, 4.46]);
  const shortTailBalanced = segmentReferenceCaptionCues([{
    start: 0, end: 2, text: '피해자는 그 이후를 살아가야 합니다.', anchors: [
      { startChar: 0, endChar: 4, start: 0, end: 0.4 },
      { startChar: 4, endChar: 5, start: 0.4, end: 0.55 },
      { startChar: 5, endChar: 8, start: 0.55, end: 0.85 },
      { startChar: 8, endChar: 12, start: 0.85, end: 1.48 },
      { startChar: 12, endChar: 15, start: 1.48, end: 2 },
    ],
  }], { ...REFERENCE_CAPTION_RULES, semanticMaxGraphemes: 16, minGraphemesPerCue: 4, minDurationSeconds: 0.6, maxDurationSeconds: 3, wordAnchors: true });
  assert.deepEqual(shortTailBalanced.map((cue) => cue.text), ['피해자는 그 이후를', '살아가야 합니다.']);
  const escaped = escapeFilterPath("C:/a folder/100%,odd:'title'.txt");
  assert.match(escaped, /\\:/);
  assert.match(escaped, /\\%/);
  assert.match(escaped, /\\,/);
  assert.match(escaped, /\\'/);

  const schema = JSON.parse(fs.readFileSync(path.join(root, 'production', 'project.schema.json'), 'utf8'));
  assert.equal(schema.additionalProperties, false);
  const captionRulesSchema = JSON.parse(fs.readFileSync(path.join(root, 'production', 'caption-rules.schema.json'), 'utf8'));
  assert.equal(captionRulesSchema.additionalProperties, false);
  assert.equal(captionRulesSchema.properties.id.const, REFERENCE_CAPTION_RULES.id);
  assert.equal(captionRulesSchema.properties.upstreamCommit.const, REFERENCE_CAPTION_RULES.upstreamCommit);
  assert.ok(captionRulesSchema.required.every((key) => Object.hasOwn(REFERENCE_CAPTION_RULES, key)));
  assert.equal(schema.properties.scenes.minItems, 1);
  assert.deepEqual(schema.properties.scenes.items.required, ['asset']);
  assert.equal(schema.properties.scenes.items.additionalProperties, false);
  assert.equal(schema.properties.scenes.items.properties.captionAnchor.minLength, 2);
  assert.deepEqual(schema.properties.scenes.items.properties.camera.enum, SCENE_CAMERA_MODES);
  assert.equal(schema.properties.scenes.items.properties.intensity.minimum, 0);
  assert.equal(schema.properties.scenes.items.properties.intensity.maximum, 1);
  assert.deepEqual(schema.properties.scenes.items.not.required, ['duration', 'captionAnchor']);
  assert.equal(schema.properties.narration.oneOf[0].properties.speechTempo.minimum, 0.5);
  assert.equal(schema.properties.narration.oneOf[0].properties.removeSilence.type, 'boolean');
  assert.equal(schema.properties.narration.oneOf[0].properties.sentencePauseSeconds.maximum, 2);
  assert.equal(schema.properties.narration.oneOf[0].properties.semanticPauseSeconds.maximum, 1);
  assert.equal(schema.properties.narration.oneOf[0].properties.joinSafetySeconds.maximum, 0.05);
  assert.equal(schema.properties.narration.oneOf[2].properties.mode.const, 'local-clone');
  assert.deepEqual(schema.properties.narration.oneOf[2].properties.style.enum, ['neutral', 'hook', 'solution']);
  const qwenNarrationSchema = schema.properties.narration.oneOf.find((item) => item.properties?.mode?.const === 'qwen3-tts');
  assert.deepEqual(qwenNarrationSchema.properties.style.enum, QWEN3_TTS_STYLE_MODES);
  assert.deepEqual(qwenNarrationSchema.required, ['mode']);
  const lockedNarrationSchema = schema.properties.narration.oneOf.find((item) => item.properties?.mode?.const === 'approved-locked');
  assert.deepEqual(lockedNarrationSchema.required, ['mode', 'audio', 'handoff', 'audioSha256', 'cueCount']);
  assert.equal(schema.properties.narration.oneOf[2].properties.cloneSpeed.maximum, 2);
  assert.deepEqual(schema.properties.captionPreset.required.sort(), Object.keys(REFERENCE_CAPTION_PRESET).sort());
  for (const [key, value] of Object.entries(REFERENCE_CAPTION_PRESET)) {
    if (key === 'id') assert.ok(schema.properties.captionPreset.properties.id.enum.includes(value));
    else if (key === 'background') assert.ok(schema.properties.captionPreset.properties.background.enum.includes(value));
    else assert.equal(schema.properties.captionPreset.properties[key].const, value);
  }
  assert.ok(schema.allOf.some((rule) => rule.if?.properties?.scenes?.contains && rule.then?.properties?.scenes?.items?.required?.includes('duration')));
  assert.ok(schema.allOf.some((rule) => rule.if?.properties?.scenes?.contains?.required?.includes('captionAnchor') && rule.then?.properties?.scenes?.items?.required?.includes('captionAnchor')));

  const tokens = JSON.parse(fs.readFileSync(path.join(root, 'production', 'templates', 'reference-v3.tokens.json'), 'utf8'));
  assert.equal(tokens.semantic.titleAccent, '#27D3E8');
  assert.equal(tokens.semantic.titleSecondary, '#FFFFFF');
  assert.equal(tokens.semantic.caption, '#FFFFFF');
  assert.equal(tokens.semantic.captionOutline, '#000000');
  assert.equal(tokens.semantic.captionBackground, 'none');
  assert.equal(tokens.component.caption.outlineWidth, 5);
  assert.equal(tokens.component.caption.shadow, 0);
  assert.equal(tokens.component.caption.background, 'none');
  assert.deepEqual(tokens.primitive.canvas, { width: 1080, height: 1920, fps: 30 });
  assert.deepEqual(tokens.primitive.bands, { top: 474, middle: 972, bottom: 474 });
  assert.deepEqual(tokens.component.media, { x: 0, y: 474, width: 1080, height: 972, fit: 'cover' });
  assert.deepEqual(tokens.component.title, { line1Y: 201, line2Y: 326, line1Size: 120, line2Size: 143 });
  assert.deepEqual(tokens.component.sequence, { sceneCount: 12, frameAllocation: 'balanced', imageFirst: true });
  assert.deepEqual(tokens.component.narration, { speechTempo: 1.0106, terminalPauseSeconds: 0.62, semanticPauseSeconds: 0.3, joinSafetySeconds: 0.005, removeSilence: true });
  assert.equal(tokens.semantic.safeWidth, 920);
  assert.equal(tokens.semantic.captionScaleX, 94);
  assert.equal(tokens.primitive.font.weight, 800);
  assert.equal(tokens.component.caption.fontSize, 88);
  assert.equal(tokens.component.caption.x, 540);
  assert.equal(tokens.component.caption.y, 1400);
  assert.equal(tokens.component.caption.maxLines, 2);
  assert.equal(tokens.component.caption.lineHeight, 1.08);
  assert.equal(assertCaptionPresetMatchesTokens(REFERENCE_CAPTION_PRESET, tokens), true);
  const newShortSource = fs.readFileSync(path.join(root, 'scripts', 'new-short.mjs'), 'utf8');
  assert.match(newShortSource, /captionPreset:\s*REFERENCE_CAPTION_PRESET/);
  assert.match(newShortSource, /scriptSource:\s*'script\.final\.json'/);
  assert.match(newShortSource, /style:\s*'auto'/);
  assert.doesNotMatch(newShortSource, /gyogwon|교권보호국|f4_ref_/i);
  const producerSource = fs.readFileSync(path.join(root, 'scripts', 'produce-short.mjs'), 'utf8');
  assert.match(producerSource, /scriptPath:\s*providerScriptPath/);
  assert.match(producerSource, /'--file',\s*providerScriptPath/);
  assert.match(producerSource, /project\.narration\.mode === 'fish-speech-lora'/);
  assert.doesNotMatch(producerSource, /project\.narration\.provider === 'fish-speech-lora'/);
  assert.match(producerSource, /x=w-tw-72/);
  assert.doesNotMatch(producerSource, /x=w-tw-232/);
  assert.match(producerSource, /if \(scene\.label\) aiDisclosureIntervals/);
  assert.match(producerSource, /buildMotionCameraFilter\(\{ camera: scene\.camera/);
  assert.match(producerSource, /if \(isMotionAsset\) inputs\.push\('-i', asset\);/);
  assert.match(producerSource, /fps=30,tpad=stop_mode=clone:stop_duration=/);
  assert.match(producerSource, /trim=end_frame=\$\{frames\}/);
  assert.doesNotMatch(producerSource, /isMotionAsset\)\s*inputs\.push\('-stream_loop'/);
  assert.doesNotMatch(producerSource, /force_original_aspect_ratio=decrease,pad=/);
  const shortMotionPath = path.join(temp, 'short-motion-source.mp4');
  const paddedMotionPath = path.join(temp, 'short-motion-padded.mp4');
  const shortMotionSourceMd5 = path.join(temp, 'short-motion-source.framemd5');
  const shortMotionPaddedMd5 = path.join(temp, 'short-motion-padded.framemd5');
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=24:duration=0.4',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', shortMotionPath,
  ]);
  const shortMotionFilter = `fps=30,tpad=stop_mode=clone:stop_duration=1.2,${buildMotionCameraFilter({ camera: 'none', intensity: 0, width: 160, height: 120, frames: 36 })},trim=end_frame=36,setpts=PTS-STARTPTS`;
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', shortMotionPath,
    '-vf', shortMotionFilter, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', paddedMotionPath,
  ]);
  const paddedProbe = JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames,r_frame_rate', '-of', 'json', paddedMotionPath]));
  assert.equal(Number(paddedProbe.streams?.[0]?.nb_read_frames), 36);
  assert.equal(paddedProbe.streams?.[0]?.r_frame_rate, '30/1');
  const staticMotionFilter = `fps=30,${buildMotionCameraFilter({ camera: 'none', intensity: 0, width: 160, height: 120, frames: 36 })},trim=end_frame=36,setpts=PTS-STARTPTS`;
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', shortMotionPath, '-vf', staticMotionFilter, '-f', 'framemd5', shortMotionSourceMd5]);
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', shortMotionPath, '-vf', shortMotionFilter, '-f', 'framemd5', shortMotionPaddedMd5]);
  const md5Frames = (filePath) => fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter((line) => /^\s*0,/.test(line)).map((line) => line.split(',').at(-1).trim());
  const sourceMd5Frames = md5Frames(shortMotionSourceMd5);
  const paddedMd5Frames = md5Frames(shortMotionPaddedMd5);
  assert.equal(paddedMd5Frames.length, 36);
  assert.equal(paddedMd5Frames.at(-1), sourceMd5Frames.at(-1));
  assert.match(producerSource, /path\.extname\(finalAudioPath\).*=== '\.m4a'/s);
  assert.match(producerSource, /\? \['-c:a', 'copy'\]/);
  assert.match(producerSource, /textAlign:\s*'right',\s*centerXPx:\s*810/);
  assert.doesNotMatch(producerSource, /textAlign:\s*'right',\s*centerXPx:\s*650/);
  const thumbnailGeneratorSource = fs.readFileSync(path.join(root, 'scripts', 'generate-jeju-thumbnail.mjs'), 'utf8');
  assert.match(thumbnailGeneratorSource, /x=w-text_w-72/);
  assert.doesNotMatch(thumbnailGeneratorSource, /x=w-text_w-232/);
  assert.equal(tokens.hook, false);
  for (const generatorPath of [path.join(root, 'scripts', 'production-lib.mjs'), path.join(root, 'scripts', 'build-v3-ass.mjs')]) {
    const generatorSource = fs.readFileSync(generatorPath, 'utf8');
    assert.doesNotMatch(generatorSource, /CaptionBox|captionBoxWidths|\\p1/);
  }
  const canonicalProjectPath = path.join(root, 'production', 'projects', 'jeju-school-intrusion-short-v1', 'project.json');
  const canonicalProject = JSON.parse(fs.readFileSync(canonicalProjectPath, 'utf8'));
  const canonicalBaseline = JSON.parse(fs.readFileSync(path.join(path.dirname(canonicalProjectPath), 'canonical-baseline.json'), 'utf8'));
  const validatedCanonicalProject = validateProject(canonicalProject, path.dirname(canonicalProjectPath));
  assert.deepEqual(validatedCanonicalProject.narration.pitchCorrections, canonicalProject.narration.pitchCorrections);
  assert.equal(canonicalBaseline.schemaVersion, 2);
  assert.equal(canonicalProject.scenes.length, canonicalBaseline.sceneCounts.total);
  assert.equal(new Set(canonicalProject.scenes.map((scene) => scene.asset)).size, canonicalBaseline.sceneCounts.total);
  assert.deepEqual(canonicalProject.scenes.map((scene) => scene.asset.replaceAll('\\', '/')), canonicalBaseline.scenes.map((scene) => scene.asset));
  canonicalProject.scenes.forEach((scene) => {
    assert.ok(scene.asset.includes(scene.asset.endsWith('.mp4') ? 'v9-source-grounded-hybrid-hq/' : 'v8-source-grounded-hybrid/'));
    assert.notEqual(scene.camera, 'none');
    assert.ok(scene.intensity >= 0.08 && scene.intensity <= 0.16);
    assert.equal(scene.label, canonicalBaseline.disclosure.text);
  });
  assert.equal(canonicalProject.scenes.filter((scene) => scene.asset.endsWith('.mp4')).length, canonicalBaseline.sceneCounts.motion);
  assert.equal(canonicalProject.scenes.filter((scene) => scene.asset.endsWith('.png')).length, canonicalBaseline.sceneCounts.still);
  assert.ok(canonicalProject.scenes.every((scene) => typeof scene.captionAnchor === 'string' && scene.captionAnchor.length >= 2));
  assert.equal(canonicalProject.bgm?.provider, 'local-file');
  assert.equal(canonicalProject.bgm?.sha256, '9fe2ddabf1a7274706c3888ecd3316dcfef7447eb4b211617dd512762709c899');
  assert.equal(canonicalProject.bgm?.volumeDb, -16);
  assert.equal(canonicalProject.bgm?.duckUnderNarration, true);
  assert.equal(canonicalProject.bgm?.fadeSeconds, 1.2);
  const canonicalHandoffPath = path.join(root, 'out', 'registry', 'versions', `${canonicalBaseline.versionId}.handoff.json`);
  const canonicalHandoff = JSON.parse(fs.readFileSync(canonicalHandoffPath, 'utf8'));
  const canonicalCues = canonicalHandoff.cues ?? [];
  assert.equal(canonicalHandoff.sourceIntegrity?.sourceCueCount, canonicalBaseline.sourceIntegrity.sourceCueCount);
  assert.equal(canonicalCues.length, canonicalBaseline.cueCount);
  const srtTimestamp = (seconds) => {
    const milliseconds = Math.max(0, Math.round(seconds * 1000));
    const hours = Math.floor(milliseconds / 3600000);
    const minutes = Math.floor((milliseconds % 3600000) / 60000);
    const wholeSeconds = Math.floor((milliseconds % 60000) / 1000);
    const remainder = milliseconds % 1000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')},${String(remainder).padStart(3, '0')}`;
  };
  const canonicalSrtPath = path.join(temp, 'jeju-school-intrusion-canonical-v2.srt');
  fs.writeFileSync(canonicalSrtPath, canonicalCues.map((cue, index) => `${index + 1}\n${srtTimestamp(cue.start)} --> ${srtTimestamp(cue.end)}\n${cue.text}\n`).join('\n'));
  const canonicalAssPath = path.join(temp, 'canonical-v2.ass');
  run('node', [
    path.join(root, 'scripts', 'build-v3-ass.mjs'),
    canonicalSrtPath,
    canonicalAssPath,
  ]);
  const canonicalAss = fs.readFileSync(canonicalAssPath, 'utf8');
  assert.match(canonicalAss, /Style: Caption,School Shorts V3 Noto Sans KR,88,&H00FFFFFF,&H00FFFFFF,&H00000000,&HFF000000,1,0,0,0,94,100,0,0,1,5,0,2,/);
  assert.doesNotMatch(canonicalAss, /CaptionBox|\\p1|}\s*m -?\d/);
  const canonicalEvents = [...canonicalAss.matchAll(/^Dialogue:.*$/gm)].map((match) => match[0]);
  assert.equal(canonicalEvents.length, canonicalCues.length);
  assert.ok(canonicalEvents.every((event) => event.includes(',Caption,') && event.includes('\\fscx94')));
  tokens.primitive.font.family = 'School Shorts V3 Noto Sans KR';
  const fontPath = path.join(temp, 'NotoSansKR-ExtraBold.ttf');
  run('python', [path.join(root, 'scripts', 'build-v3-font.py'), 'C:/Windows/Fonts/NotoSansKR-VF.ttf', fontPath, '800']);

  const texts = ['교권보호국.', ...longChunks];
  const cues = texts.map((text, index) => ({ text, start: index, end: index + 0.99 }));
  const textsPath = path.join(temp, 'texts.json');
  const calibrationAssPath = path.join(temp, 'calibration.ass');
  const calibrationFramesPath = path.join(temp, 'calibration.rgb');
  const calibrationPath = path.join(temp, 'calibration.json');
  fs.writeFileSync(textsPath, JSON.stringify(texts));
  const provisionalAss = buildCalibrationAss(cues, tokens);
  assert.match(provisionalAss, /Style: Caption,School Shorts V3 Noto Sans KR,88,&H00FFFFFF,&H00FFFFFF,&H00000000,&HFF000000,1,0,0,0,94,100,0,0,1,5,0,2,/);
  fs.writeFileSync(calibrationAssPath, provisionalAss);
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `color=c=black:s=1080x1920:r=1:d=${texts.length}`,
    '-vf', `subtitles='${escapeFilterPath(calibrationAssPath)}':fontsdir='${escapeFilterPath(temp)}',crop=1080:360:0:1220,format=rgb24`,
    '-frames:v', String(texts.length), '-f', 'rawvideo', calibrationFramesPath,
  ]);
  run('python', [path.join(root, 'scripts', 'analyze-libass-calibration.py'), fontPath, textsPath, calibrationFramesPath, calibrationPath]);
  const calibration = JSON.parse(fs.readFileSync(calibrationPath, 'utf8'));
  assert.equal(calibration.length, texts.length);
  assert.ok(calibration.every((measurement) => measurement.renderedWidth > 0));

  const calibratedCues = cues.map((cue, index) => ({ ...cue, ...calibration[index] }));
  const finalAss = buildAss(calibratedCues, tokens);
  assert.doesNotMatch(finalAss, /CaptionBox|\\p1|}\s*m -?\d/);
  assert.doesNotMatch(finalAss, /\\N/);
  assert.equal([...finalAss.matchAll(/^Dialogue:/gm)].length, calibratedCues.length);
  assert.ok(calibratedCues.every((cue) => cue.renderedWidth + tokens.component.caption.outlineWidth * 2 <= tokens.semantic.safeWidth));

  const finalAssPath = path.join(temp, 'final.ass');
  const finalFramesPath = path.join(temp, 'final.rgb');
  const finalMeasurementPath = path.join(temp, 'final-measurements.json');
  fs.writeFileSync(finalAssPath, finalAss);
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `color=c=#27D3E8:s=1080x1920:r=1:d=${texts.length}`,
    '-vf', `subtitles='${escapeFilterPath(finalAssPath)}':fontsdir='${escapeFilterPath(temp)}',crop=1080:360:0:1220,format=rgb24`,
    '-frames:v', String(texts.length), '-f', 'rawvideo', finalFramesPath,
  ]);
  run('python', [path.join(root, 'scripts', 'analyze-libass-calibration.py'), fontPath, textsPath, finalFramesPath, finalMeasurementPath]);
  const finalMeasurements = JSON.parse(fs.readFileSync(finalMeasurementPath, 'utf8'));
  assert.ok(finalMeasurements.every((measurement) => Math.abs(measurement.calibrationCenterX - 540) <= 1), JSON.stringify(finalMeasurements));
  assert.ok(finalMeasurements.every((measurement) => measurement.renderedWidth + tokens.component.caption.outlineWidth * 2 <= tokens.semantic.safeWidth));
  const finalPixels = fs.readFileSync(finalFramesPath);
  const frameSize = 1080 * 360 * 3;
  for (let frameIndex = 0; frameIndex < texts.length; frameIndex += 1) {
    const frame = finalPixels.subarray(frameIndex * frameSize, (frameIndex + 1) * frameSize);
    let blackPixels = 0;
    let whitePixels = 0;
    for (let y = 0; y < 360; y += 1) {
      for (let x = 0; x < 1080; x += 1) {
        const offset = (y * 1080 + x) * 3;
        const red = frame[offset];
        const green = frame[offset + 1];
        const blue = frame[offset + 2];
        if (Math.max(red, green, blue) <= 16) {
          blackPixels += 1;
        }
        if (Math.min(red, green, blue) >= 200 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 8) whitePixels += 1;
      }
    }
    assert.ok(whitePixels > 0, `frame ${frameIndex + 1} has no white caption core`);
    assert.ok(blackPixels > 0, `frame ${frameIndex + 1} has no black caption outline`);
    const [left, top, right, bottom] = finalMeasurements[frameIndex].calibrationBounds;
    let sideSamples = 0;
    let cyanSidePixels = 0;
    for (let y = Math.max(0, top - 1050); y < Math.min(360, bottom - 1050); y += 1) {
      for (const x of [...Array.from({ length: 9 }, (_, index) => left - 20 + index), ...Array.from({ length: 9 }, (_, index) => right + 11 + index)]) {
        if (x < 0 || x >= 1080) continue;
        const offset = (y * 1080 + x) * 3;
        sideSamples += 1;
        if (frame[offset] < 100 && frame[offset + 1] > 150 && frame[offset + 2] > 180) cyanSidePixels += 1;
      }
    }
    assert.ok(sideSamples > 0 && cyanSidePixels / sideSamples > 0.9, `frame ${frameIndex + 1} has a box-like background beside the outlined glyphs`);
  }

  const emojiTextsPath = path.join(temp, 'emoji-texts.json');
  fs.writeFileSync(emojiTextsPath, JSON.stringify(['😀']));
  const emojiError = run('python', [path.join(root, 'scripts', 'analyze-libass-calibration.py'), fontPath, emojiTextsPath, calibrationFramesPath, path.join(temp, 'emoji.json')], true);
  assert.match(emojiError, /U\+1F600/);

  const registry = JSON.parse(fs.readFileSync(path.join(root, 'out', 'latest-render.json'), 'utf8'));
  const electricBusSource = '전기 버스 요금이 12.5% 조정됐습니다';
  const electricBusChunks = splitKoreanCaptionText(electricBusSource, { maxWords: 3, maxGraphemes: 16, protectedTerms: ['전기 버스'] });
  assert.equal(electricBusChunks.join(' ').replace(/\s+/g, ''), electricBusSource.replace(/\s+/g, ''));
  assert.ok(electricBusChunks.every((chunk) => !(/^전기$|^버스$/.test(chunk))));
  const repeatedBusChunks = splitKoreanCaptionText('전기 버스 도입 뒤 전기 버스 요금도 바뀝니다', { maxWords: 4, maxGraphemes: 14, protectedTerms: ['전기 버스'] });
  assert.equal(repeatedBusChunks.join(' ').replace(/\s+/g, ''), '전기버스도입뒤전기버스요금도바뀝니다');
  assert.ok(repeatedBusChunks.every((chunk) => chunk !== '전기' && chunk !== '버스'));
  assert.ok(registry.versionId);
  assert.equal(path.basename(registry.fileName), registry.fileName);
  assert.equal(path.extname(registry.fileName), '.mp4');
  assert.equal(path.basename(registry.thumbnailFileName), registry.thumbnailFileName);
  assert.equal(path.extname(registry.thumbnailFileName), '.png');
  assert.equal(path.resolve(registry.path), path.resolve('out', registry.fileName));
  assert.equal(path.resolve(registry.thumbnailPath), path.resolve('out', registry.thumbnailFileName));
  if (registry.sourceIntegrity?.slug === 'jeju-school-intrusion') {
    const canonical = JSON.parse(fs.readFileSync(path.join(root, 'production', 'projects', 'jeju-school-intrusion-short-v1', 'canonical-baseline.json'), 'utf8'));
    assert.deepEqual(registry.thumbnailOverride, canonical.thumbnail);
    const thumbnailHash = crypto.createHash('sha256').update(fs.readFileSync(registry.thumbnailPath)).digest('hex');
    assert.equal(thumbnailHash, canonical.thumbnail.sha256);
  }
  console.log(`production tests passed (${texts.length} libass cue regressions; final centers within 1px)`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
