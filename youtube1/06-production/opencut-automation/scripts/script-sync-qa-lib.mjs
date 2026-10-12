import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { REFERENCE_CAPTION_RULES } from './production-lib.mjs';
import { canSplitKoreanAt } from './korean-caption-splitter.mjs';

export const QA_NORMALIZATION = {
  id: 'ko-caption-layout-v1',
  unicode: 'NFC',
  ignoredForIntegrityComparison: ['Unicode layout whitespace', 'Unicode punctuation', 'Unicode symbols'],
  preserved: ['letters', 'numbers', 'word order'],
};

export const QA_THRESHOLDS = {
  minCueDurationSeconds: 0.6,
  maxCueDurationSeconds: 3.6,
  maxInterCueGapSeconds: 0.35,
  maxCaptionLeadSeconds: 0.5,
  maxCaptionLagSeconds: 0.35,
  maxCaptionLateStartSeconds: 0.25,
  maxCaptionEarlyEndSeconds: 0.25,
};

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function assertUniqueScriptBindings(bindings) {
  if (!Array.isArray(bindings)) throw new Error('script bindings must be an array');
  const seen = { newsroomSlug: new Set(), productionProjectId: new Set(), authoritativeScript: new Set() };
  for (const [index, binding] of bindings.entries()) {
    if (!binding || typeof binding !== 'object') throw new Error(`script binding ${index} is invalid`);
    for (const field of Object.keys(seen)) {
      const value = String(binding[field] ?? '');
      if (!value) throw new Error(`script binding ${index} is missing ${field}`);
      if (seen[field].has(value)) throw new Error(`duplicate script binding ${field}: ${value}`);
      seen[field].add(value);
    }
  }
  return bindings;
}

export function normalizeCaptionIntegrity(value) {
  return String(value ?? '').normalize('NFC').replace(/[\s\p{P}\p{S}]/gu, '');
}

export function normalizeSpokenEquivalence(value) {
  return String(value ?? '').normalize('NFC').replace(/\s/gu, '');
}

function graphemeCount(value) {
  return [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(value)].length;
}

function check(id, status, summary, details = []) {
  return { id, status, summary, details };
}

function firstStringMismatch(expected, actual) {
  const limit = Math.min(expected.length, actual.length);
  let offset = 0;
  while (offset < limit && expected[offset] === actual[offset]) offset += 1;
  if (offset === expected.length && offset === actual.length) return null;
  return { offset, expected: expected.slice(offset, offset + 24), actual: actual.slice(offset, offset + 24) };
}

function cueAtNormalizedOffset(cues, offset) {
  let cursor = 0;
  for (let index = 0; index < cues.length; index += 1) {
    const length = normalizeCaptionIntegrity(cues[index].text).length;
    if (offset < cursor + length) return { cue: index + 1, offsetInCue: offset - cursor };
    cursor += length;
  }
  return { cue: cues.length, offsetInCue: Math.max(0, offset - cursor) };
}

function selectedNarrationSegments(handoff) {
  const attempts = handoff?.narrationProvider?.speechAcceptance?.attempts;
  if (!Array.isArray(attempts)) return [];
  return attempts.flatMap((attempt) => Array.isArray(attempt.segments) ? attempt.segments : []).filter((segment) => segment?.selected === true).sort((a, b) => Number(a.index) - Number(b.index));
}

function liveRenderHashes(project, projectText, projectDirectory, scriptSha256) {
  const effectiveCaptionRules = Array.isArray(project.captionProtectedTerms) && project.captionProtectedTerms.length
    ? { ...REFERENCE_CAPTION_RULES, protectedTerms: project.captionProtectedTerms }
    : null;
  const contractPath = project.pipelineContract?.path ? path.resolve(projectDirectory, project.pipelineContract.path) : null;
  return {
    projectConfigSha256: sha256(projectText.replace(/\r\n/g, '\n')),
    contractSha256: contractPath && fs.existsSync(contractPath) ? sha256(fs.readFileSync(contractPath)) : null,
    narrationConfigSha256: sha256(JSON.stringify({ scriptSha256, narration: project.narration })),
    visualConfigSha256: effectiveCaptionRules ? sha256(JSON.stringify({ title: project.title, assets: project.assets, scenes: project.scenes, captionPreset: project.captionPreset, captionRules: effectiveCaptionRules, media: project.media, transitionContract: project.transitionContract, motionEvidence: project.motionEvidence })) : null,
  };
}

export function evaluateScriptQa({ binding, handoff, handoffPath, handoffSha256, project, projectText, projectDirectory, alternativeAuthorities = [], bgmSourceSha256 = null, profileManifestSha256 = null }) {
  const cues = Array.isArray(handoff?.cues) ? handoff.cues : [];
  const authoritative = binding.authority.draft;
  const expected = normalizeCaptionIntegrity(authoritative);
  const actual = normalizeCaptionIntegrity(cues.map((cue) => cue.text).join(' '));
  const checks = [];
  const mismatch = firstStringMismatch(expected, actual);
  checks.push(mismatch
    ? check('script-caption-integrity', 'fail', '자막 결합문이 권위 대본과 다릅니다.', [{ ...mismatch, ...cueAtNormalizedOffset(cues, mismatch.offset) }])
    : check('script-caption-integrity', 'pass', `자막 ${cues.length}개의 결합문이 권위 대본과 일치합니다.`));

  const rules = handoff?.captionRules ?? {};
  const structureDetails = [];
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    const duration = Number(cue.end) - Number(cue.start);
    const gap = index ? Number(cue.start) - Number(cues[index - 1].end) : 0;
    const lines = String(cue.text ?? '').split('\n');
    if (!Number.isFinite(duration) || duration <= 0) structureDetails.push({ cue: index + 1, code: 'non-positive-duration', start: cue.start, end: cue.end });
    if (index && Number(cue.start) < Number(cues[index - 1].end) - 1e-6) structureDetails.push({ cue: index + 1, code: 'overlap', seconds: -gap });
    if (index && gap > QA_THRESHOLDS.maxInterCueGapSeconds) structureDetails.push({ cue: index + 1, code: 'unsafe-gap', seconds: gap });
    if (duration < QA_THRESHOLDS.minCueDurationSeconds - 1e-6 || duration > QA_THRESHOLDS.maxCueDurationSeconds + 1e-6) structureDetails.push({ cue: index + 1, code: 'readability-duration', duration });
    if (lines.length > Number(rules.maxLines ?? 2)) structureDetails.push({ cue: index + 1, code: 'too-many-lines', lines: lines.length });
    if (graphemeCount(lines.join(' ')) > Number(rules.semanticMaxGraphemes ?? 45)) structureDetails.push({ cue: index + 1, code: 'semantic-cue-too-long', graphemes: graphemeCount(lines.join(' ')) });
  }
  for (const term of Array.isArray(rules.protectedTerms) ? rules.protectedTerms : []) {
    if (expected.includes(normalizeCaptionIntegrity(term)) && !cues.some((cue) => String(cue.text).includes(term))) structureDetails.push({ code: 'protected-term-split-or-missing', term });
  }
  const captionWords = cues.flatMap((cue) => String(cue.text ?? '').replace(/\s+/gu, ' ').trim().split(' ').filter(Boolean));
  const authorityLineEnds = new Set();
  let authorityWordCursor = 0;
  for (const line of String(authoritative).split(/\r?\n+/u).filter((value) => value.trim())) {
    authorityWordCursor += line.trim().split(/\s+/u).filter(Boolean).length;
    authorityLineEnds.add(authorityWordCursor);
  }
  let displayWordCursor = 0;
  cues.forEach((cue, cueIndex) => {
    const lines = String(cue.text ?? '').split('\n');
    lines.forEach((line, lineIndex) => {
      displayWordCursor += line.trim().split(/\s+/u).filter(Boolean).length;
      const atFinalWord = displayWordCursor >= captionWords.length;
      const isAuthorityBoundary = authorityLineEnds.has(displayWordCursor);
      if (!atFinalWord && !isAuthorityBoundary && !canSplitKoreanAt(captionWords, displayWordCursor, { protectedTerms: rules.protectedTerms })) {
        structureDetails.push({ cue: cueIndex + 1, line: lineIndex + 1, code: lineIndex < lines.length - 1 ? 'forbidden-korean-line-boundary' : 'forbidden-korean-cue-boundary', before: captionWords[displayWordCursor - 1], after: captionWords[displayWordCursor] });
      }
    });
  });
  checks.push(check('caption-structure', structureDetails.length ? 'fail' : 'pass', structureDetails.length ? `자막 구조 위반 ${structureDetails.length}건입니다.` : '순서·겹침·간격·지속시간·레이아웃·보호 용어가 계약을 통과했습니다.', structureDetails));

  const timingDetails = [];
  const referencedAnchors = new Set();
  const globalAnchors = handoff?.narrationProvider?.speechAcceptance?.evidence?.globalWordAnchors ?? [];
  let captionCharacterCursor = 0;
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    const captionLength = normalizeCaptionIntegrity(cue.text).length;
    const captionStartChar = captionCharacterCursor;
    const captionEndChar = captionStartChar + captionLength;
    captionCharacterCursor = captionEndChar;
    // Handoff cue.anchors intentionally include a neighbouring boundary word
    // for layout interpolation. Timing QA instead maps the exact normalized
    // caption character span to the global word alignment.
    const anchors = globalAnchors.filter((anchor) => Number(anchor.endChar) > captionStartChar && Number(anchor.startChar) < captionEndChar);
    if (!anchors.length) { timingDetails.push({ cue: index + 1, code: 'orphan-caption', start: cue.start, end: cue.end, text: cue.text }); continue; }
    for (const anchor of anchors) referencedAnchors.add(`${anchor.startChar}:${anchor.endChar}:${anchor.start}:${anchor.end}`);
    const speechStart = Math.min(...anchors.map((anchor) => Number(anchor.start)));
    const speechEnd = Math.max(...anchors.map((anchor) => Number(anchor.end)));
    const lead = speechStart - Number(cue.start);
    const lag = Number(cue.end) - speechEnd;
    const codes = [];
    if (lead > QA_THRESHOLDS.maxCaptionLeadSeconds) codes.push('caption-too-early');
    if (-lead > QA_THRESHOLDS.maxCaptionLateStartSeconds) codes.push('caption-starts-after-speech');
    if (lag > QA_THRESHOLDS.maxCaptionLagSeconds) codes.push('caption-too-late');
    if (-lag > QA_THRESHOLDS.maxCaptionEarlyEndSeconds) codes.push('caption-ends-before-speech');
    if (codes.length) timingDetails.push({ cue: index + 1, codes, start: cue.start, end: cue.end, speechStart, speechEnd, leadSeconds: lead, lagSeconds: lag, text: cue.text });
  }
  for (const anchor of globalAnchors) {
    const key = `${anchor.startChar}:${anchor.endChar}:${anchor.start}:${anchor.end}`;
    if (!referencedAnchors.has(key)) timingDetails.push({ code: 'orphan-speech-anchor', ...anchor });
  }
  const finalSignalDuration = Number(handoff?.narrationProvider?.speechAcceptance?.evidence?.finalSignal?.durationSeconds);
  const finalCueEnd = cues.length ? Number(cues[cues.length - 1].end) : 0;
  if (Number.isFinite(finalSignalDuration) && Math.abs(finalSignalDuration - finalCueEnd) > 0.35) timingDetails.push({ code: 'final-duration-coverage', finalSignalDuration, finalCueEnd, deltaSeconds: finalCueEnd - finalSignalDuration });
  checks.push(check('caption-audio-timing', timingDetails.length ? 'fail' : 'pass', timingDetails.length ? `음성 anchor 대비 자막 타이밍 위반 ${timingDetails.length}건입니다.` : '모든 자막 cue가 음성 word anchor와 허용 오차 안에서 정렬됩니다.', timingDetails));

  const segments = selectedNarrationSegments(handoff);
  const narrationDetails = [];
  const sourceJoined = segments.map((segment) => segment.sourceText).join(' ');
  if (normalizeCaptionIntegrity(sourceJoined) !== expected) narrationDetails.push({ code: 'narration-source-coverage', expectedLength: expected.length, actualLength: normalizeCaptionIntegrity(sourceJoined).length });
  for (const segment of segments) {
    if (normalizeSpokenEquivalence(segment.sourceText) !== normalizeSpokenEquivalence(segment.spokenText)) narrationDetails.push({ code: 'unauthorized-spoken-rewrite', segment: segment.index, sourceText: segment.sourceText, spokenText: segment.spokenText });
    if (Number(segment.signal?.clippedSamples ?? 0) > 0) narrationDetails.push({ code: 'clipping', segment: segment.index, clippedSamples: segment.signal.clippedSamples });
    for (const consensus of Array.isArray(segment.criticalPhraseConsensus) ? segment.criticalPhraseConsensus : []) if (consensus.passes !== true) narrationDetails.push({ code: 'critical-term-failed', segment: segment.index, phrase: consensus.phrase, missingModels: consensus.missingModels });
  }
  const acceptanceEvidence = handoff?.narrationProvider?.speechAcceptance?.evidence ?? {};
  const failedJoins = (acceptanceEvidence.loudness?.joins ?? []).filter((join) => join?.passes !== true);
  for (const join of failedJoins) narrationDetails.push({ code: 'continuity-join-failed', ...join });
  if (Number(acceptanceEvidence.finalSignal?.clippedSamples ?? 0) > 0) narrationDetails.push({ code: 'final-signal-clipping', clippedSamples: acceptanceEvidence.finalSignal.clippedSamples });
  narrationDetails.push({ code: 'signal-metrics', segmentCount: segments.length, finalSignal: acceptanceEvidence.finalSignal ?? null, joins: acceptanceEvidence.loudness?.joins ?? [] });
  const narrationFailures = narrationDetails.filter((detail) => detail.code !== 'signal-metrics');
  checks.push(check('narration-integrity', narrationFailures.length ? 'fail' : 'pass', narrationFailures.length ? `내레이션 무결성 위반 ${narrationFailures.length}건입니다.` : 'sourceText·spokenText·구간 순서·신호 무결성이 통과했습니다.', narrationDetails));
  const disagreements = segments.flatMap((segment) => (segment.criticalPhraseConsensus ?? []).filter((item) => item.passes === true && Array.isArray(item.missingModels) && item.missingModels.length).map((item) => ({ segment: segment.index, phrase: item.phrase, recognizedModels: item.recognizedModels, missingModels: item.missingModels, agreement: item.agreement })));
  const cerValues = segments.flatMap((segment) => (segment.asrChecks ?? []).map((item) => Number(item.cer)).filter(Number.isFinite));
  checks.push(check('asr-diagnostic', disagreements.length ? 'warning' : 'pass', disagreements.length ? `인식기 교차 불일치 ${disagreements.length}건이 있습니다. 합의 계약은 통과했지만 사람 청취가 필요합니다.` : 'ASR 핵심 용어 교차 진단에 불일치가 없습니다.', [{ code: 'confidence-is-diagnostic-not-sample-accurate', maxCer: cerValues.length ? Math.max(...cerValues) : null }, ...disagreements]));

  const integrity = handoff?.sourceIntegrity ?? {};
  const liveHashes = liveRenderHashes(project, projectText, projectDirectory, binding.authority.draftSha256);
  const renderDetails = [];
  for (const key of ['scriptSha256', 'projectConfigSha256', 'contractSha256', 'narrationConfigSha256', 'visualConfigSha256']) {
    const expectedHash = key === 'scriptSha256' ? binding.authority.draftSha256 : liveHashes[key];
    if (!expectedHash || integrity[key] !== expectedHash) renderDetails.push({ code: 'stale-render-hash', field: key, expected: expectedHash, actual: integrity[key] ?? null });
  }
  if (integrity.authority !== binding.authority.path || integrity.slug !== binding.newsroomSlug) renderDetails.push({ code: 'wrong-render-authority', expectedPath: binding.authority.path, actualPath: integrity.authority, expectedSlug: binding.newsroomSlug, actualSlug: integrity.slug });
  if (handoff?.narrationProvider?.promptBankManifestSha256 && profileManifestSha256 && handoff.narrationProvider.promptBankManifestSha256 !== profileManifestSha256) renderDetails.push({ code: 'stale-voice-profile', expected: profileManifestSha256, actual: handoff.narrationProvider.promptBankManifestSha256 });
  const configuredBgmPath = typeof project.bgm?.audio === 'string' ? path.resolve(projectDirectory, project.bgm.audio) : null;
  if (!bgmSourceSha256) renderDetails.push({ code: 'bgm-source-hash-unavailable' });
  else if (project.bgm?.sha256 !== bgmSourceSha256) renderDetails.push({ code: 'stale-bgm-source', expected: project.bgm?.sha256 ?? null, actual: bgmSourceSha256 });
  if (configuredBgmPath && path.resolve(String(handoff?.bgm?.sourcePath ?? '')) !== configuredBgmPath) renderDetails.push({ code: 'wrong-bgm-source', expected: configuredBgmPath, actual: handoff?.bgm?.sourcePath ?? null });
  if (project.bgm && (Number(handoff?.bgm?.volumeDb) !== Number(project.bgm.volumeDb) || handoff?.bgm?.duckUnderNarration !== project.bgm.duckUnderNarration)) renderDetails.push({ code: 'wrong-bgm-mix-contract', expectedVolumeDb: project.bgm.volumeDb, actualVolumeDb: handoff?.bgm?.volumeDb, expectedDuck: project.bgm.duckUnderNarration, actualDuck: handoff?.bgm?.duckUnderNarration });
  checks.push(check('render-freshness', renderDetails.some((detail) => detail.code !== 'bgm-source-hash-unavailable') ? 'fail' : renderDetails.length ? 'warning' : 'pass', renderDetails.length ? '렌더 결합에서 확인할 항목이 있습니다.' : '렌더가 현재 대본·프로젝트·계약·프로필·BGM 결합과 일치합니다.', renderDetails));
  if (alternativeAuthorities.length) checks.push(check('authority-conflict', 'warning', `같은 newsroom slug를 주장하는 다른 production authority ${alternativeAuthorities.length}개가 있습니다. 명시적 binding만 사용합니다.`, alternativeAuthorities));
  checks.push(check('human-listening-gate', 'warning', 'ASR/CER은 표본 단위 동기나 자연스러움을 증명하지 않습니다. 이 exact 렌더의 전체 사람 청취 승인이 남아 있습니다.', handoff?.releaseGate?.blockers ?? []));

  const failures = checks.filter((item) => item.status === 'fail').length;
  const warnings = checks.filter((item) => item.status === 'warning').length;
  return {
    schemaVersion: 'production-script-qa-v1',
    newsroomSlug: binding.newsroomSlug,
    productionProjectId: binding.productionProjectId,
    authoritativeDraftSha256: binding.authority.draftSha256,
    bindingSha256: binding.bindingSha256,
    artifact: { versionId: handoff?.versionId ?? null, handoffPath, handoffSha256, releaseStatus: handoff?.releaseStatus ?? null, publishable: handoff?.publishable === true, bgmSourceSha256, profileManifestSha256 },
    normalization: QA_NORMALIZATION,
    thresholds: QA_THRESHOLDS,
    checks,
    summary: { status: failures ? 'fail' : warnings ? 'warning' : 'pass', passes: checks.length - failures - warnings, warnings, failures, humanListeningRequired: true },
    creator: 'scripts/sync-production-script-qa.mjs',
    verifier: 'scripts/script-sync-qa-lib.mjs',
  };
}
