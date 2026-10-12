import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

export const QWEN3_TTS_MODEL = 'Qwen/Qwen3-TTS-12Hz-0.6B-Base';
export const QWEN3_TTS_REVISION = '5d83992436eae1d760afd27aff78a71d676296fc';
export const QWEN3_TTS_17B_MODEL = 'Qwen/Qwen3-TTS-12Hz-1.7B-Base';
export const QWEN3_TTS_17B_REVISION = 'fd4b254389122332181a7c3db7f27e918eec64e3';
export const QWEN3_TTS_DTYPE = 'bfloat16';
export const QWEN3_TTS_LANGUAGE = 'Korean';
export const QWEN3_TTS_MAX_TEMPERATURE = 0.95;
export const QWEN3_TTS_DEFAULT_ENV = 'C:/Users/User/tools/qwen3-tts-pilot/.venv';
export const QWEN3_TTS_REFERENCE_SHA256 = '31b3fdee6e1417daee8dd863f479b01408a840cc21762c2927e2a3c97b4a4646';
export const QWEN3_TTS_STYLES = ['neutral', 'hook', 'news_exposition', 'tension', 'criticism', 'solution_closing', 'question', 'legal_explanation', 'viewer_question', 'closing'];
export const QWEN3_TTS_STYLE_MODES = [...QWEN3_TTS_STYLES, 'auto'];
const AUTO_STYLES = QWEN3_TTS_STYLES.filter((style) => style !== 'neutral');
const PROSODY_SCORING_STYLES = ['hook', 'news_exposition', 'tension', 'criticism', 'solution_closing'];
const PROMPT_BANK_ROLES = Object.freeze({ neutral: 'canonical-neutral' });
const MAX_ATTEMPTS = 12;
const MAX_ASR_CER = 0.08;
const MODEL_LOCKS = new Map([
  [QWEN3_TTS_MODEL, { revision: QWEN3_TTS_REVISION, size: '0b6' }],
  [QWEN3_TTS_17B_MODEL, { revision: QWEN3_TTS_17B_REVISION, size: '1b7' }],
]);

export function resolveQwenModelLock(narration = {}) {
  const modelId = narration.modelId || QWEN3_TTS_MODEL;
  const lock = MODEL_LOCKS.get(modelId);
  if (!lock) throw new Error(`Qwen3-TTS model is not in the locked Base allowlist: ${modelId}`);
  const modelRevision = narration.modelRevision || lock.revision;
  if (modelRevision !== lock.revision) throw new Error(`Qwen3-TTS revision mismatch for ${modelId}`);
  const attentionImplementation = narration.attentionImplementation || 'sdpa';
  if (!['sdpa', 'flash_attention_2'].includes(attentionImplementation)) throw new Error('Qwen3-TTS attentionImplementation must be sdpa or flash_attention_2');
  return { modelId, modelRevision, modelSize: lock.size, attentionImplementation };
}

const normalize = (value) => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
export const normalizeQwenQuestionMatchText = (value) => String(value || '').normalize('NFKC').replace(/\s+/gu, ' ').trim();

export function alignQwenWordAnchorsToSource(sourceText, words, unitStartChar = 0, unitStartSeconds = 0) {
  const source = normalize(sourceText);
  const usableWords = (Array.isArray(words) ? words : [])
    .map((word) => ({ word, text: normalize(word?.text) }))
    .filter(({ text }) => text.length > 0);
  const transcript = usableWords.map(({ text }) => text).join('');
  if (!source || !transcript || !usableWords.length) return [];

  // ASR words provide timestamps, but their recognized spelling can differ
  // slightly from the locked source. Align the recognized character stream
  // to the source before assigning source offsets; cumulative ASR lengths
  // would otherwise shift every later caption anchor after one recognition
  // insertion/deletion.
  const rows = transcript.length + 1;
  const columns = source.length + 1;
  const distance = Array.from({ length: rows }, () => new Uint16Array(columns));
  for (let i = 0; i < rows; i += 1) distance[i][0] = i;
  for (let j = 0; j < columns; j += 1) distance[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      distance[i][j] = Math.min(
        distance[i - 1][j] + 1,
        distance[i][j - 1] + 1,
        distance[i - 1][j - 1] + (transcript[i - 1] === source[j - 1] ? 0 : 1),
      );
    }
  }
  const reverseSteps = [];
  let i = transcript.length;
  let j = source.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && distance[i][j] === distance[i - 1][j - 1] + (transcript[i - 1] === source[j - 1] ? 0 : 1)) {
      reverseSteps.push('both'); i -= 1; j -= 1;
    } else if (i > 0 && distance[i][j] === distance[i - 1][j] + 1) {
      reverseSteps.push('transcript'); i -= 1;
    } else {
      reverseSteps.push('source'); j -= 1;
    }
  }
  const boundaryMap = new Uint32Array(transcript.length + 1);
  let transcriptCursor = 0;
  let sourceCursor = 0;
  for (const step of reverseSteps.reverse()) {
    if (step === 'both') { transcriptCursor += 1; sourceCursor += 1; boundaryMap[transcriptCursor] = sourceCursor; }
    else if (step === 'transcript') { transcriptCursor += 1; boundaryMap[transcriptCursor] = sourceCursor; }
    else { sourceCursor += 1; boundaryMap[transcriptCursor] = sourceCursor; }
  }
  boundaryMap[0] = 0;
  boundaryMap[boundaryMap.length - 1] = source.length;

  let wordCursor = 0;
  return usableWords.map(({ word, text }, index) => {
    const start = Number(word.start || 0);
    const end = Number(word.end ?? word.start ?? 0);
    const startChar = boundaryMap[wordCursor];
    wordCursor += text.length;
    const endChar = index === usableWords.length - 1 ? source.length : boundaryMap[wordCursor];
    return {
      startChar: unitStartChar + startChar,
      endChar: unitStartChar + Math.max(startChar, endChar),
      start: unitStartSeconds + start,
      end: unitStartSeconds + end,
    };
  }).filter((anchor) => anchor.endChar > anchor.startChar);
}

export function buildQwenLocalizedPronunciationWindows(sourceText, anchors, criticalPhrases, durationSeconds) {
  const source = normalize(sourceText);
  const orderedAnchors = (Array.isArray(anchors) ? anchors : [])
    .filter((anchor) => Number.isFinite(Number(anchor.startChar))
      && Number.isFinite(Number(anchor.endChar))
      && Number(anchor.endChar) > Number(anchor.startChar)
      && Number.isFinite(Number(anchor.start))
      && Number.isFinite(Number(anchor.end))
      && Number(anchor.end) > Number(anchor.start))
    .map((anchor) => ({ startChar: Number(anchor.startChar), endChar: Number(anchor.endChar), start: Number(anchor.start), end: Number(anchor.end) }))
    .sort((a, b) => a.startChar - b.startChar || a.endChar - b.endChar);
  const duration = Number(durationSeconds);
  if (!source || !orderedAnchors.length || !(duration > 0)) throw new Error('Localized pronunciation QA requires aligned source anchors and duration');
  const phrases = [...new Set((Array.isArray(criticalPhrases) ? criticalPhrases : []).map((phrase) => normalize(phrase)).filter(Boolean))];
  const windows = [];
  for (const phrase of phrases) {
    let from = 0;
    while (from < source.length) {
      const startChar = source.indexOf(phrase, from);
      if (startChar < 0) break;
      const endChar = startChar + phrase.length;
      const firstIndex = orderedAnchors.findIndex((anchor) => anchor.endChar > startChar);
      let lastIndex = -1;
      for (let index = orderedAnchors.length - 1; index >= 0; index -= 1) {
        if (orderedAnchors[index].startChar < endChar) { lastIndex = index; break; }
      }
      if (firstIndex < 0 || lastIndex < firstIndex) throw new Error(`Localized pronunciation phrase has no aligned audio span: ${phrase}`);
      const contextStart = orderedAnchors[Math.max(0, firstIndex - 1)];
      const contextEnd = orderedAnchors[Math.min(orderedAnchors.length - 1, lastIndex + 1)];
      windows.push({
        id: `term-${String(windows.length + 1).padStart(3, '0')}`,
        phrase,
        startChar,
        endChar,
        start: Math.max(0, contextStart.start - 0.05),
        end: Math.min(duration, contextEnd.end + 0.05),
      });
      from = endChar;
    }
  }
  if (phrases.length && !windows.length) throw new Error('Localized pronunciation QA produced no windows');
  return windows;
}

export function evaluateQwenLocalizedPronunciationQa(payload, expectedWindows, requiredModels = ['small', 'medium']) {
  if (payload?.schema !== 'localized-korean-pronunciation-asr-v1' || JSON.stringify(payload.models) !== JSON.stringify(['small', 'medium']) || requiredModels.some((model) => !payload.models.includes(model)) || !Array.isArray(payload.windows)) throw new Error('Localized pronunciation QA payload is invalid');
  if (payload.windows.length !== expectedWindows.length) throw new Error('Localized pronunciation QA window count mismatch');
  const admitted = payload.windows.map((window, index) => {
    const expected = expectedWindows[index];
    if (window.id !== expected.id || normalize(window.phrase) !== expected.phrase || Math.abs(Number(window.start) - expected.start) > 1e-6 || Math.abs(Number(window.end) - expected.end) > 1e-6) throw new Error(`Localized pronunciation QA window ${index + 1} drifted`);
    const checks = requiredModels.map((model) => {
      const report = Array.isArray(window.checks) ? window.checks.find((item) => item?.model === model) : null;
      const text = String(report?.text || '');
      return { model, text, passes: normalize(text).includes(expected.phrase) };
    });
    return { ...expected, checks, passes: checks.every((check) => check.passes) };
  });
  const failed = admitted.filter((window) => !window.passes);
  if (failed.length) throw new Error(`localized pronunciation gate mismatch: ${failed.map((window) => `${window.phrase}[${window.checks.filter((check) => !check.passes).map((check) => check.model).join(',')}]`).join('|')}`);
  return { schema: 'qwen-localized-pronunciation-admission-v1', models: [...requiredModels], windows: admitted, passes: true };
}

export function resolveQwenOwnerQuestionSegments(entry) {
  if (!entry || entry.segments === undefined) return [];
  const contractValid = entry.source === 'owner-recording'
    && entry.ownerOnly === true
    && entry.localOnly === true
    && /^[0-9a-f]{64}$/i.test(entry.sourceAudioSha256 || '');
  if (!contractValid) throw new Error('Qwen direct question segments require a verified owner-only local recording contract');
  if (!Array.isArray(entry.segments)) throw new Error('Qwen direct question segments must be an array');
  for (const [index, item] of entry.segments.entries()) {
    const valid = item
      && typeof item.text === 'string'
      && normalizeQwenQuestionMatchText(item.text).endsWith('?')
      && Number.isFinite(item.assetStartSeconds)
      && Number.isFinite(item.assetEndSeconds)
      && item.assetStartSeconds >= 0
      && item.assetEndSeconds > item.assetStartSeconds;
    if (!valid) throw new Error(`Qwen direct question segment ${index + 1} violates the verified owner span contract`);
  }
  return entry.segments;
}

// Remove only non-spoken title markup. Lexical substitutions are forbidden:
// the authoritative script must remain the exact speech contract.
export function normalizeQwenSpokenText(value) {
  return String(value ?? '')
    .replace(/<([^>\r\n]+)>/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function evaluateQwenCriticalPhraseConsensus(requiredPhrases, checks, models, agreement = 'all-models') {
  if (!['all-models', 'at-least-one-model'].includes(agreement)) throw new Error('Qwen3-TTS criticalPhraseAgreement must be all-models or at-least-one-model');
  return requiredPhrases.map((phrase) => {
    const recognizedModels = checks.filter(({ missing }) => !missing.includes(phrase)).map(({ model }) => model);
    const missingModels = models.filter((model) => !recognizedModels.includes(model));
    const passes = agreement === 'all-models' ? missingModels.length === 0 : recognizedModels.length >= 1;
    return { phrase, agreement, recognizedModels, missingModels, passes };
  });
}
const sha256 = async (filePath) => crypto.createHash('sha256').update(await fsp.readFile(filePath)).digest('hex');

async function resolveQwenReference({ narration, root, base, promptBankPath = null, bankOnly = false }) {
  const { modelId, modelRevision } = resolveQwenModelLock(narration);
  const style = narration.style || 'neutral';
  if (!QWEN3_TTS_STYLES.includes(style)) throw new Error(`Qwen prompt style mismatch: unsupported style ${style}`);
  if (style === 'neutral' && !bankOnly) {
    if (!narration.referenceAudio || !narration.referenceTranscript) throw new Error('Qwen3-TTS neutral style requires exact referenceAudio and referenceTranscript');
    const audio = path.resolve(base, narration.referenceAudio);
    return {
      style, audio, transcript: narration.referenceTranscript,
      expectedSha256: String(narration.referenceAudioSha256 || QWEN3_TTS_REFERENCE_SHA256).toLowerCase(),
      promptBankManifestSha256: null, promptBankPath: null,
    };
  }
  let bankPath = promptBankPath;
  let lockedManifestSha256 = null;
  if (!bankPath) {
    const profileRoot = path.resolve(root, '..', '..', '03-script-voice', 'voice-clone', 'profiles', 'qwen-f4');
    const profile = JSON.parse(await fsp.readFile(path.join(profileRoot, 'manifest.json'), 'utf8'));
    if (profile.engine?.provider !== 'qwen3-tts' || profile.engine?.model !== modelId || profile.engine?.revision !== modelRevision || profile.engine?.precision !== 'bf16') throw new Error('Qwen prompt bank profile model invariant mismatch');
    if (profile.promptBank?.validationStatus !== 'passed' || profile.promptBank?.loraAllowed !== false || profile.promptBank?.adapterAllowed !== false) throw new Error('Qwen prompt bank profile is not Base-only validation-passed');
    bankPath = path.resolve(profileRoot, profile.promptBank.manifest);
    lockedManifestSha256 = String(profile.promptBank.manifestSha256 || '').toLowerCase();
  }
  if (!fs.existsSync(bankPath)) throw new Error(`Qwen prompt bank manifest not found: ${bankPath}`);
  const manifestSha256 = await sha256(bankPath);
  if (lockedManifestSha256 && (!/^[0-9a-f]{64}$/.test(lockedManifestSha256) || manifestSha256 !== lockedManifestSha256)) throw new Error(`Qwen prompt bank manifest SHA-256 mismatch: expected ${lockedManifestSha256}, received ${manifestSha256}`);
  const bank = JSON.parse(await fsp.readFile(bankPath, 'utf8'));
  if (bank.status !== 'validation-passed' || bank.productionEligible !== true || bank.ownerVoice !== true) throw new Error('Qwen prompt bank is not production eligible');
  if (bank.model?.id !== modelId || bank.model?.revision !== modelRevision || bank.model?.precision !== 'bf16' || bank.model?.loraAllowed !== false || bank.model?.adapterAllowed !== false || bank.model?.fallbackAllowed !== false) throw new Error('Qwen prompt bank must use selected locked Base BF16 with LoRA/adapters/fallback forbidden');
  const entry = bank.styles?.[style];
  const expectedRole = PROMPT_BANK_ROLES[style] || style.replaceAll('_', '-');
  if (!entry || entry.role !== expectedRole) throw new Error(`Qwen prompt style mismatch for ${style}`);
  if (!entry.audio || !entry.transcript || !/^[0-9a-f]{64}$/i.test(entry.sha256 || '')) throw new Error(`Qwen prompt entry is incomplete for ${style}`);
  const audio = path.resolve(path.dirname(bankPath), entry.audio);
  if (narration.referenceAudio && path.resolve(base, narration.referenceAudio) !== audio) throw new Error(`Qwen prompt style mismatch: ${style} referenceAudio does not match prompt bank`);
  if (narration.referenceTranscript && narration.referenceTranscript !== entry.transcript) throw new Error(`Qwen prompt style mismatch: ${style} referenceTranscript does not match prompt bank`);
  if (narration.referenceAudioSha256 && String(narration.referenceAudioSha256).toLowerCase() !== String(entry.sha256).toLowerCase()) throw new Error(`Qwen prompt style mismatch: ${style} referenceAudioSha256 does not match prompt bank`);
  return {
    style, audio, transcript: entry.transcript,
    expectedSha256: String(entry.sha256).toLowerCase(), promptBankManifestSha256: manifestSha256,
    promptBankPath: bankPath,
    promptBankEntry: entry,
    promptBankProfileId: String(bank.profileId || ''),
    promptBankSourceAudit: bank.sourceAudit || null,
  };
}

const STYLE_LABELS = new Map([
  ['neutral', 'neutral'],
  ['hook', 'hook'], ['훅', 'hook'], ['도입', 'hook'],
  ['news_exposition', 'news_exposition'], ['news-exposition', 'news_exposition'], ['news', 'news_exposition'], ['뉴스', 'news_exposition'], ['설명', 'news_exposition'],
  ['tension', 'tension'], ['긴장', 'tension'], ['위기', 'tension'],
  ['criticism', 'criticism'], ['비판', 'criticism'], ['문제점', 'criticism'],
  ['solution_closing', 'solution_closing'], ['solution-closing', 'solution_closing'], ['solution', 'solution_closing'], ['해법', 'solution_closing'], ['결론', 'solution_closing'],
  ['question', 'question'], ['질문', 'question'],
  ['legal_explanation', 'legal_explanation'], ['legal-explanation', 'legal_explanation'], ['법률설명', 'legal_explanation'],
  ['viewer_question', 'viewer_question'], ['viewer-question', 'viewer_question'], ['시청자질문', 'viewer_question'],
  ['closing', 'closing'], ['마무리', 'closing'],
]);

export const QWEN3_TTS_AUTO_CLASSIFIER_VERSION = 'qwen-auto-v1';
const AUTO_RULES = Object.freeze([
  ['solution_closing', ['solution', 'resolve', 'improve', '\ud574\ubc95', '\ud574\uacb0', '\uac1c\uc120', '\ub300\uc548', '\uc9c0\uc6d0']],
  ['criticism', ['critic', 'failure', 'problem', '\ube44\ud310', '\ubb38\uc81c', '\uc2e4\ud328', '\ubd80\uc871', '\ucc45\uc784']],
  ['tension', ['risk', 'conflict', 'danger', 'crisis', '\uac08\ub4f1', '\uc704\ud5d8', '\ubd88\uc548', '\ud53c\ud574', '\uc704\uae30']],
  ['news_exposition', ['report', 'announce', 'survey', 'police', '\ubcf4\ub3c4', '\ubc1c\ud45c', '\uc870\uc0ac', '\uacbd\ucc30', '\uad50\uc721\ubd80', '\ud655\uc778']],
]);
export const QWEN3_TTS_AUTO_RULES_SHA256 = crypto.createHash('sha256').update(JSON.stringify(AUTO_RULES)).digest('hex');
const textSha256 = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');

function stripQwenStyleLabel(value) {
  const source = String(value || '').replace(/\r\n/g, '\n').trim();
  const lines = source.split('\n');
  const standalone = lines[0]?.match(/^\s*(?:#{1,3}\s*)?(?:\[\[?\s*(?:style\s*:\s*)?([^\]]+)\]?\]|([^:]+):)\s*$/i);
  const standaloneKey = String(standalone?.[1] || standalone?.[2] || '').trim().toLowerCase();
  if (standalone && STYLE_LABELS.has(standaloneKey)) return { text: lines.slice(1).join(' ').replace(/\s+/g, ' ').trim(), label: STYLE_LABELS.get(standaloneKey), rawLabel: lines[0].trim() };
  const inline = source.match(/^\s*\[\[?\s*(?:style\s*:\s*)?([^\]]+)\]?\]\s*(.+)$/is);
  const inlineKey = String(inline?.[1] || '').trim().toLowerCase();
  if (inline && STYLE_LABELS.has(inlineKey)) return { text: inline[2].replace(/\s+/g, ' ').trim(), label: STYLE_LABELS.get(inlineKey), rawLabel: inline[0].slice(0, inline[0].length - inline[2].length).trim() };
  return { text: source.replace(/\s+/g, ' ').trim(), label: null, rawLabel: null };
}

function legacyHeuristicStyle(text, sectionIndex, sectionCount) {
  if (sectionIndex === 0) return { style: 'hook', rule: 'position:first', keywords: [] };
  if (sectionIndex === sectionCount - 1) return { style: 'solution_closing', rule: 'position:last', keywords: [] };
  const rules = [
    ['solution_closing', ['해법', '해결', '개선', '대안', '지원해야', '필요합니다', '해야 합니다', '회복']],
    ['criticism', ['그러나', '하지만', '문제는', '한계', '미흡', '부족', '책임', '실적', '반복']],
    ['tension', ['갈등', '위험', '불안', '공포', '피해', '충돌', '늦어지고', '위기', '사건이 벌어진']],
    ['news_exposition', ['밝혔', '설명', '따르면', '발표', '조사', '경찰', '교육부', '확인', '기록']],
  ];
  const scored = rules.map(([style, keywords], priority) => {
    const hits = keywords.filter((keyword) => text.includes(keyword));
    return { style, hits, score: hits.length, priority };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.priority - b.priority);
  if (scored.length) return { style: scored[0].style, rule: 'content-keywords', keywords: scored[0].hits };
  return { style: 'news_exposition', rule: 'fallback:middle-exposition', keywords: [] };
}

function heuristicStyle(text, sectionIndex, sectionCount) {
  if (sectionIndex === 0) return { style: 'hook', rule: 'position:first', keywords: [] };
  if (sectionIndex === sectionCount - 1) return { style: 'solution_closing', rule: 'position:last', keywords: [] };
  const lowered = text.toLocaleLowerCase('en-US');
  const scored = AUTO_RULES.map(([style, keywords], priority) => {
    const hits = keywords.filter((keyword) => lowered.includes(keyword));
    return { style, hits, score: hits.length, priority };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.priority - b.priority);
  if (scored.length) return { style: scored[0].style, rule: 'content-keywords', keywords: scored[0].hits };
  return { style: 'neutral', rule: 'fallback:zero-evidence-neutral', keywords: [] };
}

// Keep interrogative sentences as independent synthesis units so the
// question prompt can control the final "요?/나요?/까요?" contour.  The
// authoritative script remains unchanged; this only affects generation units.
function splitQwenQuestionUnits(text, maxSegmentChars, questionSentences = []) {
  const targets = new Set(questionSentences.map((value) => String(value).replace(/\s+/gu, ' ').trim()).filter(Boolean));
  if (!targets.size) return segmentQwenNarrationText(text, maxSegmentChars).map((value) => ({ text: value, isQuestion: false }));
  const sentences = String(text).match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/gu)?.map((value) => value.replace(/\s+/gu, ' ').trim()).filter(Boolean) || [];
  const units = [];
  let current = [];
  const flush = () => {
    if (!current.length) return;
    for (const value of segmentQwenNarrationText(current.join(' '), maxSegmentChars)) units.push({ text: value, isQuestion: false });
    current = [];
  };
  for (const sentence of sentences) {
    if (targets.has(sentence)) {
      flush();
      units.push({ text: sentence, isQuestion: true });
    } else current.push(sentence);
  }
  flush();
  return units;
}

function isolateQwenCriticalPhrases(text, criticalPhrases = []) {
  const source = String(text || '');
  const hits = criticalPhrases
    .map((phrase) => ({ phrase: String(phrase), start: source.indexOf(String(phrase)) }))
    .filter((hit) => hit.phrase && hit.start >= 0)
    .map((hit) => ({ ...hit, end: hit.start + hit.phrase.length }))
    .sort((a, b) => a.start - b.start);
  if (hits.length < 2) return [source];
  const boundaries = [];
  for (let index = 1; index < hits.length; index += 1) {
    const left = hits[index - 1].end;
    const right = hits[index].start;
    const interval = source.slice(left, right);
    const sentenceBoundary = interval.match(/[.!?]\s+/u);
    if (sentenceBoundary) boundaries.push(left + sentenceBoundary.index + sentenceBoundary[0].length);
    else {
      const spaces = [];
      for (let cursor = left; cursor < right; cursor += 1) if (/\s/u.test(source[cursor])) spaces.push(cursor + 1);
      boundaries.push(spaces.at(-1) || right);
    }
  }
  const units = [];
  let cursor = 0;
  for (const boundary of [...new Set(boundaries)].sort((a, b) => a - b)) {
    const unit = source.slice(cursor, boundary).trim();
    if (unit) units.push(unit);
    cursor = boundary;
  }
  const tail = source.slice(cursor).trim();
  if (tail) units.push(tail);
  return units;
}

function isolateQwenExactCriticalPhrases(text, phrases = []) {
  const source = String(text || '');
  const hits = [];
  for (const phraseValue of phrases) {
    const phrase = String(phraseValue || '');
    if (!phrase) continue;
    let start = source.indexOf(phrase);
    while (start >= 0) {
      hits.push({ start, end: start + phrase.length, phrase });
      start = source.indexOf(phrase, start + phrase.length);
    }
  }
  hits.sort((left, right) => left.start - right.start || right.end - left.end);
  const nonOverlapping = hits.filter((hit, index) => index === 0 || hit.start >= hits[index - 1].end);
  if (!nonOverlapping.length) return [source];
  const units = [];
  let cursor = 0;
  for (const hit of nonOverlapping) {
    const before = source.slice(cursor, hit.start).trim();
    if (before) units.push(before);
    units.push(hit.phrase);
    cursor = hit.end;
  }
  const tail = source.slice(cursor).trim();
  if (tail) units.push(tail);
  return units;
}

export function planQwenNarrationSections(script, narration = {}) {
  const maxSegmentChars = qwenMaxSegmentChars(narration.maxSegmentChars);
  const mode = narration.style || 'neutral';
  if (!QWEN3_TTS_STYLE_MODES.includes(mode)) throw new Error(`Qwen prompt style mismatch: unsupported style ${mode}`);
  if (mode !== 'auto') {
    if (narration.stylePlan !== undefined) throw new Error('Qwen stylePlan is only valid with narration.style=auto');
    const units = segmentQwenNarrationText(script, maxSegmentChars).map((text, index) => ({ text, style: mode, sectionIndex: index, classification: { source: 'manual', rule: `narration.style:${mode}`, keywords: [] } }));
    return { mode, sections: units.map((unit) => ({ sectionIndex: unit.sectionIndex, text: unit.text, style: unit.style, classification: unit.classification })), units };
  }
  const rawSections = String(script || '').replace(/\r\n/g, '\n').split(/\n\s*\n+/).map(stripQwenStyleLabel).filter((item) => item.text);
  const overrides = new Map();
  for (const item of narration.stylePlan || []) {
    if (!item || Object.keys(item).sort().join(',') !== 'segmentIndex,style,textSha256') throw new Error('Qwen stylePlan entries require exactly segmentIndex, textSha256 and style');
    if (!Number.isInteger(item.segmentIndex) || item.segmentIndex < 0 || item.segmentIndex >= rawSections.length) throw new Error(`Qwen stylePlan segmentIndex out of range: ${item?.segmentIndex}`);
    if (!AUTO_STYLES.includes(item.style)) throw new Error(`Qwen stylePlan style mismatch: ${item?.style}`);
    const expectedTextSha256 = textSha256(rawSections[item.segmentIndex].text);
    if (!/^[0-9a-f]{64}$/.test(item.textSha256 || '') || item.textSha256 !== expectedTextSha256) throw new Error(`Qwen stylePlan textSha256 mismatch for segment ${item.segmentIndex}`);
    if (overrides.has(item.segmentIndex)) throw new Error(`Qwen stylePlan duplicates segment ${item.segmentIndex}`);
    overrides.set(item.segmentIndex, item.style);
  }
  const sections = rawSections.map((section, sectionIndex) => {
    const override = overrides.get(sectionIndex);
    const heuristic = heuristicStyle(section.text, sectionIndex, rawSections.length);
    const style = override || section.label || heuristic.style;
    const classification = override
      ? { source: 'override', rule: `stylePlan[${sectionIndex}]`, keywords: [] }
      : section.label
        ? { source: 'label', rule: section.rawLabel, keywords: [] }
        : { source: 'heuristic', rule: heuristic.rule, keywords: heuristic.keywords };
    Object.assign(classification, { classifierVersion: QWEN3_TTS_AUTO_CLASSIFIER_VERSION, rulesSha256: QWEN3_TTS_AUTO_RULES_SHA256, textSha256: textSha256(section.text) });
    return { sectionIndex, text: section.text, style, classification };
  });
  const questionSentences = Array.isArray(narration.questionSentences) ? narration.questionSentences : [];
  const questionStyle = narration.questionStyle || 'question';
  if (!QWEN3_TTS_STYLES.includes(questionStyle) || !['question', 'viewer_question'].includes(questionStyle)) throw new Error(`Qwen questionStyle mismatch: ${questionStyle}`);
  const initialUnits = sections.flatMap((section) => splitQwenQuestionUnits(section.text, maxSegmentChars, questionSentences).map(({ text, isQuestion }) => ({
    ...section,
    text,
    ...(isQuestion ? {
      style: questionStyle,
      classification: {
        ...section.classification,
        source: 'questionSentence',
        rule: 'narration.questionSentences',
        questionTextSha256: textSha256(text),
      },
    } : {}),
  })));
  const ownerRecordingTexts = Array.isArray(narration.ownerRecordingSegments) ? narration.ownerRecordingSegments.map((item) => item.text) : [];
  const ownerIsolatedUnits = ownerRecordingTexts.length
    ? initialUnits.flatMap((unit) => isolateQwenExactCriticalPhrases(unit.text, ownerRecordingTexts).map((text) => ({
      ...unit,
      text,
      classification: { ...unit.classification, ownerRecordingIsolation: true },
    })))
    : initialUnits;
  const criticalPhrases = Array.isArray(narration.criticalPhrases) ? narration.criticalPhrases : [];
  const exactIsolationTerms = Array.isArray(narration.criticalPhraseIsolationTerms) ? narration.criticalPhraseIsolationTerms : [];
  if (exactIsolationTerms.length && (new Set(exactIsolationTerms).size !== exactIsolationTerms.length || exactIsolationTerms.some((phrase) => typeof phrase !== 'string' || !phrase || !criticalPhrases.includes(phrase)))) throw new Error('Qwen criticalPhraseIsolationTerms must be unique members of criticalPhrases');
  const units = exactIsolationTerms.length
    ? ownerIsolatedUnits.flatMap((unit) => isolateQwenExactCriticalPhrases(unit.text, exactIsolationTerms).map((text) => ({
      ...unit,
      text,
      classification: { ...unit.classification, criticalPhraseIsolationTerms: exactIsolationTerms },
    })))
    : narration.criticalPhraseIsolation === true
    ? ownerIsolatedUnits.flatMap((unit) => isolateQwenCriticalPhrases(unit.text, criticalPhrases).map((text) => ({
      ...unit,
      text,
      classification: { ...unit.classification, criticalPhraseIsolation: true },
    })))
    : ownerIsolatedUnits;
  return { mode, sections, units };
}

export async function inspectQwenPcm16Wav(filePath) {
  const buffer = await fsp.readFile(filePath);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`Qwen output is not RIFF/WAVE: ${filePath}`);
  let offset = 12; let format = null; let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4); const size = buffer.readUInt32LE(offset + 4); const start = offset + 8;
    if (start + size > buffer.length) throw new Error(`Qwen WAV chunk is truncated: ${filePath}`);
    if (id === 'fmt ') format = { audioFormat: buffer.readUInt16LE(start), channels: buffer.readUInt16LE(start + 2), sampleRate: buffer.readUInt32LE(start + 4), bitsPerSample: buffer.readUInt16LE(start + 14) };
    if (id === 'data') data = buffer.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!format || format.audioFormat !== 1 || format.channels !== 1 || format.sampleRate !== 24000 || format.bitsPerSample !== 16 || !data || data.length < 4 || data.length % 2) throw new Error(`Qwen output must be mono 24kHz PCM16: ${filePath}`);
  const sampleCount = data.length / 2; let peak = 0; let sumSquares = 0; let activeSquares = 0; let activeCount = 0; let clippedSamples = 0; const samples = new Int16Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    const value = data.readInt16LE(index * 2) / 32768; samples[index] = data.readInt16LE(index * 2);
    const absolute = Math.abs(value); peak = Math.max(peak, absolute); sumSquares += value * value;
    if (absolute >= 0.01) { activeSquares += value * value; activeCount += 1; }
    if (Math.abs(samples[index]) >= 32735) clippedSamples += 1;
  }
  const edgeSamples = Math.min(480, sampleCount); let boundaryMaxAdjacentJump = 0;
  for (const [start, end] of [[0, edgeSamples], [sampleCount - edgeSamples, sampleCount]]) for (let index = start + 1; index < end; index += 1) boundaryMaxAdjacentJump = Math.max(boundaryMaxAdjacentJump, Math.abs(samples[index] - samples[index - 1]) / 32768);
  const rms = Math.sqrt(sumSquares / sampleCount); const activeRms = Math.sqrt((activeCount ? activeSquares / activeCount : sumSquares / sampleCount));
  const dbfs = (value) => 20 * Math.log10(Math.max(value, 1e-12));
  return {
    sampleRate: format.sampleRate, durationSeconds: sampleCount / format.sampleRate,
    peak, peakDbfs: dbfs(peak), rmsDbfs: dbfs(rms), activeRmsDbfs: dbfs(activeRms),
    firstSample: samples[0] / 32768, lastSample: samples[sampleCount - 1] / 32768,
    endpointAmplitude: Math.max(Math.abs(samples[0]), Math.abs(samples[sampleCount - 1])) / 32768,
    boundaryMaxAdjacentJump, clippedSamples,
  };
}

export async function applyQwenPcm16EdgeFade(filePath, fadeSeconds = 0.005) {
  const buffer = await fsp.readFile(filePath);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`Qwen output is not RIFF/WAVE: ${filePath}`);
  let offset = 12; let format = null; let dataStart = null; let dataSize = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4); const size = buffer.readUInt32LE(offset + 4); const start = offset + 8;
    if (start + size > buffer.length) throw new Error(`Qwen WAV chunk is truncated: ${filePath}`);
    if (id === 'fmt ') format = { audioFormat: buffer.readUInt16LE(start), channels: buffer.readUInt16LE(start + 2), sampleRate: buffer.readUInt32LE(start + 4), bitsPerSample: buffer.readUInt16LE(start + 14) };
    if (id === 'data') { dataStart = start; dataSize = size; }
    offset = start + size + (size % 2);
  }
  if (!format || format.audioFormat !== 1 || format.channels !== 1 || format.sampleRate !== 24000 || format.bitsPerSample !== 16 || dataStart === null || !dataSize || dataSize % 2) throw new Error(`Qwen output must be mono 24kHz PCM16: ${filePath}`);
  const sampleCount = dataSize / 2;
  const fadeSamples = Math.min(Math.max(2, Math.round(Number(fadeSeconds) * format.sampleRate)), Math.floor(sampleCount / 2));
  if (!Number.isFinite(fadeSeconds) || fadeSeconds <= 0 || fadeSeconds > 0.02 || fadeSamples < 2) throw new Error('Qwen synthesized edge fade must be greater than zero and at most 20 ms');
  for (let index = 0; index < fadeSamples; index += 1) {
    const gain = index / (fadeSamples - 1);
    const firstOffset = dataStart + index * 2;
    const lastOffset = dataStart + (sampleCount - 1 - index) * 2;
    buffer.writeInt16LE(Math.round(buffer.readInt16LE(firstOffset) * gain), firstOffset);
    buffer.writeInt16LE(Math.round(buffer.readInt16LE(lastOffset) * gain), lastOffset);
  }
  await fsp.writeFile(filePath, buffer);
  return { method: 'linear-edge-fade', fadeSeconds, addedPauseSeconds: 0, durationPreserved: true };
}

function estimateQuestionF0(samples, sampleRate, start, end) {
  const frameSize = Math.max(1, Math.floor(sampleRate * 0.04));
  const hop = Math.max(1, Math.floor(sampleRate * 0.02));
  const minLag = Math.floor(sampleRate / 300);
  const maxLag = Math.ceil(sampleRate / 70);
  const values = [];
  const from = Math.max(0, Math.floor(start * sampleRate));
  const to = Math.min(samples.length, Math.floor(end * sampleRate));
  for (let offset = from; offset + frameSize <= to; offset += hop) {
    let energy = 0;
    for (let index = 0; index < frameSize; index += 1) energy += samples[offset + index] ** 2;
    if (energy / frameSize < 1e-5) continue;
    let bestLag = minLag; let best = -Infinity;
    for (let lag = minLag; lag <= Math.min(maxLag, frameSize - 1); lag += 1) {
      let score = 0;
      for (let index = 0; index + lag < frameSize; index += 1) score += samples[offset + index] * samples[offset + index + lag];
      if (score > best) { best = score; bestLag = lag; }
    }
    if (best / energy >= 0.2) values.push(sampleRate / bestLag);
  }
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

export function evaluateQwenQuestionTail(samples, sampleRate = 24000) {
  const data = samples instanceof Float32Array ? samples : Float32Array.from(samples || []);
  const tailSamples = Math.min(data.length, Math.floor(sampleRate * 0.30));
  const previousSamples = Math.min(Math.max(0, data.length - tailSamples), Math.floor(sampleRate * 0.40));
  const tailStart = data.length - tailSamples;
  const previousStart = Math.max(0, tailStart - previousSamples);
  const rmsDbfs = (start, end) => {
    if (end <= start) return -120;
    let sum = 0;
    for (let index = start; index < end; index += 1) sum += data[index] ** 2;
    return 20 * Math.log10(Math.max(Math.sqrt(sum / (end - start)), 1e-12));
  };
  const tailRmsDbfs = rmsDbfs(tailStart, data.length);
  const precedingRmsDbfs = rmsDbfs(previousStart, tailStart);
  const tailDeltaDb = tailRmsDbfs - precedingRmsDbfs;
  const f0PreHz = estimateQuestionF0(data, sampleRate, previousStart / sampleRate, tailStart / sampleRate);
  const f0TailHz = estimateQuestionF0(data, sampleRate, tailStart / sampleRate, data.length / sampleRate);
  const deltaSemitones = f0PreHz && f0TailHz ? 12 * Math.log2(f0TailHz / f0PreHz) : null;
  const tailVoiced = tailRmsDbfs > -45 && f0TailHz !== null;
  const passes = tailVoiced && tailDeltaDb <= 0 && deltaSemitones !== null && deltaSemitones <= 0;
  return { method: 'autocorrelation F0; final 0.30 s versus preceding 0.40 s; RMS dBFS', f0PreHz, f0TailHz, deltaSemitones, precedingRmsDbfs, tailRmsDbfs, tailDeltaDb, tailVoiced, passes };
}

export async function extractQwenPcm16WavSegment(sourcePath, destinationPath, startSeconds, endSeconds, options = {}) {
  const source = await fsp.readFile(sourcePath);
  let offset = 12; let format = null; let data = null;
  while (offset + 8 <= source.length) {
    const id = source.toString('ascii', offset, offset + 4); const size = source.readUInt32LE(offset + 4); const start = offset + 8;
    if (start + size > source.length) throw new Error(`Owner question WAV is truncated: ${sourcePath}`);
    if (id === 'fmt ') format = { audioFormat: source.readUInt16LE(start), channels: source.readUInt16LE(start + 2), sampleRate: source.readUInt32LE(start + 4), bitsPerSample: source.readUInt16LE(start + 14) };
    if (id === 'data') data = source.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!format || format.audioFormat !== 1 || format.channels !== 1 || format.sampleRate !== 24000 || format.bitsPerSample !== 16 || !data) throw new Error(`Owner question WAV must be mono 24kHz PCM16: ${sourcePath}`);
  const startByte = Math.max(0, Math.round(startSeconds * format.sampleRate) * 2);
  const endByte = Math.min(data.length, Math.round(endSeconds * format.sampleRate) * 2);
  if (!(endByte > startByte)) throw new Error(`Owner question WAV span is empty: ${startSeconds}-${endSeconds}`);
  const sourcePayload = data.subarray(startByte, endByte);
  const guardSamples = Math.max(0, Math.round(Number(options.guardSeconds || 0) * format.sampleRate));
  const fadeSamples = Math.min(Math.max(0, Math.round(Number(options.fadeSeconds || 0) * format.sampleRate)), sourcePayload.length / 2);
  const payload = Buffer.alloc(sourcePayload.length + (guardSamples * 4));
  sourcePayload.copy(payload, guardSamples * 2);
  if (fadeSamples > 0) {
    const contentOffset = guardSamples;
    const contentSamples = sourcePayload.length / 2;
    for (let index = 0; index < fadeSamples; index += 1) {
      const gain = (index + 1) / fadeSamples;
      const firstIndex = contentOffset + index;
      const lastIndex = contentOffset + contentSamples - 1 - index;
      payload.writeInt16LE(Math.round(payload.readInt16LE(firstIndex * 2) * gain), firstIndex * 2);
      payload.writeInt16LE(Math.round(payload.readInt16LE(lastIndex * 2) * gain), lastIndex * 2);
    }
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + payload.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(payload.length, 40);
  await fsp.writeFile(destinationPath, Buffer.concat([header, payload]));
}

async function readQwenPcm16WavSamples(filePath) {
  const buffer = await fsp.readFile(filePath);
  let offset = 12; let data = null;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32LE(offset + 4); const start = offset + 8;
    if (start + size > buffer.length) throw new Error(`Qwen WAV is truncated: ${filePath}`);
    if (buffer.toString('ascii', offset, offset + 4) === 'data') data = buffer.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!data || data.length < 2 || data.length % 2) throw new Error(`Qwen WAV data chunk is invalid: ${filePath}`);
  const samples = new Float32Array(data.length / 2);
  for (let index = 0; index < samples.length; index += 1) samples[index] = data.readInt16LE(index * 2) / 32768;
  return samples;
}

function resolveQwenActiveWordSpan(samples, sampleRate, startSeconds, endSeconds, activeFractionStart) {
  const frameSamples = Math.max(1, Math.round(sampleRate * 0.01));
  const startSample = Math.max(0, Math.floor(startSeconds * sampleRate));
  const endSample = Math.min(samples.length, Math.ceil(endSeconds * sampleRate));
  const frames = [];
  for (let offset = startSample; offset + frameSamples <= endSample; offset += frameSamples) {
    let sum = 0;
    for (let index = offset; index < offset + frameSamples; index += 1) sum += samples[index] ** 2;
    frames.push({ offset, rms: Math.sqrt(sum / frameSamples) });
  }
  const peakRms = Math.max(0, ...frames.map((item) => item.rms));
  const threshold = Math.max(0.004, peakRms * 0.12);
  const active = frames.filter((item) => item.rms >= threshold);
  if (!active.length) throw new Error('Qwen pitch correction could not find an active voiced word span');
  const activeStart = active[0].offset / sampleRate;
  const activeEnd = Math.min(endSeconds, (active.at(-1).offset + frameSamples) / sampleRate);
  if (activeEnd - activeStart < 0.08) throw new Error('Qwen pitch correction active word span is too short');
  const correctionStart = activeStart + (activeEnd - activeStart) * activeFractionStart;
  return { activeStart, activeEnd, correctionStart, correctionEnd: activeEnd, threshold };
}

async function applyQwenPitchCorrections({ segmentPath, segment, transcripts, corrections, runRootCommand }) {
  const applicable = corrections.filter((item) => normalize(segment).includes(normalize(item.phrase)));
  if (!applicable.length) return [];
  const medium = transcripts.find((item) => item.model === 'medium');
  if (!medium) throw new Error('Qwen pitch correction requires the medium ASR alignment');
  const mediumText = transcriptText(medium.transcript);
  const words = (medium.transcript?.segments || []).flatMap((item) => Array.isArray(item.words) ? item.words : []);
  const evidence = [];
  for (const correction of applicable) {
    if (!normalize(mediumText).includes(normalize(correction.phrase))) throw new Error(`Qwen pitch correction phrase was not aligned by medium ASR: ${correction.phrase}`);
    const matches = words.filter((word) => normalize(word.text) === normalize(correction.word));
    if (matches.length !== 1) throw new Error(`Qwen pitch correction expected one aligned word ${correction.word}, received ${matches.length}`);
    const word = matches[0];
    const samplesBefore = await readQwenPcm16WavSamples(segmentPath);
    const span = resolveQwenActiveWordSpan(samplesBefore, 24000, Number(word.start), Number(word.end), correction.activeFractionStart);
    const halfCrossfade = correction.crossfadeSeconds / 2;
    const beforeEnd = Math.min(samplesBefore.length / 24000, span.correctionStart + halfCrossfade);
    const targetStart = Math.max(0, span.correctionStart - halfCrossfade);
    const targetEnd = Math.min(samplesBefore.length / 24000, span.correctionEnd + halfCrossfade);
    const afterStart = Math.max(0, span.correctionEnd - halfCrossfade);
    if (!(targetEnd > targetStart) || !(beforeEnd > correction.crossfadeSeconds) || !(samplesBefore.length / 24000 - afterStart > correction.crossfadeSeconds)) throw new Error(`Qwen pitch correction span is not safely crossfadeable: ${correction.id}`);
    const beforeSha256 = await sha256(segmentPath);
    const outputPath = segmentPath.replace(/\.wav$/i, `.${correction.id}.wav`);
    const pitchFactor = 2 ** (correction.semitones / 12);
    const filter = `[0:a]asplit=3[a][b][c];[a]atrim=0:${beforeEnd.toFixed(6)},asetpts=PTS-STARTPTS[a0];[b]atrim=${targetStart.toFixed(6)}:${targetEnd.toFixed(6)},asetpts=PTS-STARTPTS,rubberband=tempo=1:pitch=${pitchFactor.toFixed(9)}:formant=preserved:window=short[b0];[c]atrim=start=${afterStart.toFixed(6)},asetpts=PTS-STARTPTS[c0];[a0][b0]acrossfade=d=${correction.crossfadeSeconds.toFixed(6)}:c1=tri:c2=tri[ab];[ab][c0]acrossfade=d=${correction.crossfadeSeconds.toFixed(6)}:c1=tri:c2=tri[out]`;
    await runRootCommand('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', segmentPath, '-filter_complex', filter, '-map', '[out]', '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', outputPath]);
    const samplesAfter = await readQwenPcm16WavSamples(outputPath);
    if (Math.abs(samplesAfter.length - samplesBefore.length) > 2) throw new Error(`Qwen pitch correction changed segment duration: ${correction.id}`);
    const f0BeforeHz = estimateQuestionF0(samplesBefore, 24000, span.correctionStart, span.correctionEnd);
    const f0AfterHz = estimateQuestionF0(samplesAfter, 24000, span.correctionStart, span.correctionEnd);
    if (!f0BeforeHz || !f0AfterHz || f0AfterHz <= f0BeforeHz) throw new Error(`Qwen pitch correction did not raise the target F0: ${correction.id}`);
    const f0BeforeSyllableHz = estimateQuestionF0(samplesAfter, 24000, span.activeStart, span.correctionStart);
    const f0AfterSyllableHz = estimateQuestionF0(samplesAfter, 24000, span.correctionStart, span.activeEnd);
    const syllableDeltaSemitones = f0BeforeSyllableHz && f0AfterSyllableHz ? 12 * Math.log2(f0AfterSyllableHz / f0BeforeSyllableHz) : null;
    if (!f0BeforeSyllableHz || !f0AfterSyllableHz || syllableDeltaSemitones < 1.5) throw new Error(`Qwen pitch correction syllable contour gate failed: ${correction.id}`);
    await fsp.rm(segmentPath, { force: true });
    await fsp.rename(outputPath, segmentPath);
    evidence.push({ ...correction, alignmentModel: 'medium', alignedWordStart: Number(word.start), alignedWordEnd: Number(word.end), ...span, f0BeforeHz, f0AfterHz, measuredDeltaSemitones: 12 * Math.log2(f0AfterHz / f0BeforeHz), syllableBoundarySeconds: span.correctionStart, f0BeforeSyllableHz, f0AfterSyllableHz, syllableDeltaSemitones, minimumSyllableDeltaSemitones: 1.5, beforeSha256, afterSha256: await sha256(segmentPath), formantPreserved: true, durationPreserved: true, asrRevalidatedAfterCorrection: true });
  }
  return evidence;
}

function summarizeQwenPitchCorrections(acceptedSegments, configuredCorrections) {
  const applied = acceptedSegments.flatMap((item) => item.evidence?.pitchCorrections ?? []);
  const configuredIds = configuredCorrections.map((item) => item.id);
  const appliedIds = applied.map((item) => item.id);
  const counts = new Map(appliedIds.map((id) => [id, (appliedIds.filter((value) => value === id).length)]));
  if (applied.length !== configuredCorrections.length || configuredIds.some((id) => counts.get(id) !== 1) || new Set(appliedIds).size !== appliedIds.length) {
    throw new Error('Qwen pitch corrections must apply exactly once to the accepted segments');
  }
  return applied;
}

function qwenLoudnessPlan(metrics) {
  const sorted = metrics.map((item) => item.activeRmsDbfs).sort((a, b) => a - b);
  const target = sorted[Math.floor(sorted.length / 2)];
  const gains = metrics.map((item) => {
    const safePositiveGain = -1 - item.peakDbfs;
    return Math.max(-3, Math.min(3, safePositiveGain, target - item.activeRmsDbfs));
  });
  const joins = [];
  for (let index = 1; index < metrics.length; index += 1) {
    const previousLast = metrics[index - 1].lastSample * (10 ** (gains[index - 1] / 20));
    const nextFirst = metrics[index].firstSample * (10 ** (gains[index] / 20));
    joins.push({ afterSegment: index, adjacentJump: Math.abs(nextFirst - previousLast), passes: Math.abs(nextFirst - previousLast) <= 0.25 });
  }
  return { method: 'active-RMS median; gain-only; capped to +/-3 dB and -1 dBFS peak headroom', targetActiveRmsDbfs: target, gainsDb: gains, joins };
}

export function characterErrorRate(expected, actual) {
  const source = [...normalize(expected)];
  const target = [...normalize(actual)];
  if (!source.length) return target.length ? 1 : 0;
  let previous = Array.from({ length: target.length + 1 }, (_, index) => index);
  for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex += 1) {
    const current = [sourceIndex];
    for (let targetIndex = 1; targetIndex <= target.length; targetIndex += 1) {
      current[targetIndex] = Math.min(
        current[targetIndex - 1] + 1,
        previous[targetIndex] + 1,
        previous[targetIndex - 1] + (source[sourceIndex - 1] === target[targetIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[target.length] / source.length;
}

function qwenMaxSegmentChars(value = 120) {
  const maxSegmentChars = value ?? 120;
  if (!Number.isInteger(maxSegmentChars) || maxSegmentChars < 80 || maxSegmentChars > 220) {
    throw new Error('Qwen3-TTS maxSegmentChars must be an integer between 80 and 220');
  }
  return maxSegmentChars;
}

export function segmentQwenNarrationText(text, maxSegmentChars = 120) {
  const segmentLimit = qwenMaxSegmentChars(maxSegmentChars);
  const paragraphs = String(text || '').replace(/\r\n/g, '\n').split(/\n+/).map((value) => value.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const segments = [];
  for (const paragraph of paragraphs) {
    const sentences = paragraph.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/gu) || [paragraph];
    let current = '';
    for (const sentence of sentences.map((value) => value.trim()).filter(Boolean)) {
      const candidate = current ? `${current} ${sentence}` : sentence;
      if (current && candidate.length > segmentLimit) { segments.push(current); current = sentence; }
      else current = candidate;
    }
    if (current) segments.push(current);
  }
  // Avoid tiny punctuation fragments: merge a short trailing unit into its
  // predecessor while retaining complete sentence boundaries.
  for (let index = 1; index < segments.length; index += 1) {
    if (segments[index].length < 40 && segments[index - 1].length + 1 + segments[index].length <= segmentLimit) {
      segments[index - 1] = `${segments[index - 1]} ${segments[index]}`; segments.splice(index, 1); index -= 1;
    }
  }
  return segments;
}

export function mapQwenCuesToSource(sourceCues, synthesisCues) {
  if (!Array.isArray(sourceCues) || !sourceCues.length) return synthesisCues;
  const sourceText = sourceCues.map((cue) => normalize(cue.text)).join('');
  const synthesisText = synthesisCues.map((cue) => normalize(cue.text)).join('');
  const totalChars = sourceText.length;
  const unitChars = synthesisText.length;
  if (!totalChars || totalChars !== unitChars || sourceText !== synthesisText) throw new Error('Qwen source cues do not exactly match accepted synthesis text');
  const duration = synthesisCues.at(-1)?.end || 0;
  const units = [];
  let unitCursor = 0;
  for (const cue of synthesisCues) {
    const length = normalize(cue.text).length;
    units.push({ startChar: unitCursor, endChar: unitCursor + length, start: cue.start, end: cue.end, anchors: cue.anchors || [] });
    unitCursor += length;
  }
  const timeAt = (position) => {
    const clamped = Math.max(0, Math.min(totalChars, position));
    const unit = units.find((item) => clamped <= item.endChar) || units.at(-1);
    if (!unit || unit.endChar <= unit.startChar) return 0;
    const anchors = unit.anchors.filter((anchor) => anchor.endChar > unit.startChar && anchor.startChar < unit.endChar);
    const anchor = anchors.find((item) => clamped <= item.endChar) || anchors.at(-1);
    if (anchor && anchor.endChar > anchor.startChar) return anchor.start + (anchor.end - anchor.start) * Math.max(0, Math.min(1, (clamped - anchor.startChar) / (anchor.endChar - anchor.startChar)));
    const ratio = Math.max(0, Math.min(1, (clamped - unit.startChar) / (unit.endChar - unit.startChar)));
    return unit.start + (unit.end - unit.start) * ratio;
  };
  let consumed = 0;
  return sourceCues.map((cue) => {
    const start = timeAt(consumed);
    const startChar = consumed;
    consumed += normalize(cue.text).length;
    const endChar = consumed;
    const end = Math.min(duration, timeAt(consumed));
    const anchors = units.flatMap((unit) => unit.anchors || []).filter((anchor) => anchor.endChar > startChar && anchor.startChar < endChar).map((anchor) => ({ ...anchor }));
    return { start: Math.min(start, duration), end: Math.min(duration, Math.max(start + Math.min(0.6, Math.max(0, duration - start)), end)), text: cue.text, anchors };
  });
}

function srtTimestamp(value) {
  let milliseconds = Math.max(0, Math.round(Number(value || 0) * 1000));
  const hours = Math.floor(milliseconds / 3600000); milliseconds %= 3600000;
  const minutes = Math.floor(milliseconds / 60000); milliseconds %= 60000;
  const seconds = Math.floor(milliseconds / 1000); milliseconds %= 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

function renderSrt(cues) {
  return `${cues.map((cue, index) => `${index + 1}\n${srtTimestamp(cue.start)} --> ${srtTimestamp(cue.end)}\n${cue.text}`).join('\n\n')}\n`;
}

export function createQwenWorker(command, argv, { cwd, readyTimeoutMs = 180_000, requestTimeoutMs = 180_000 } = {}) {
  const child = spawn(command, argv, {
    cwd,
    stdio: ['pipe', 'pipe', 'inherit'],
    shell: false,
    env: {
      ...process.env,
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8',
    },
  });
  const lines = readline.createInterface({ input: child.stdout });
  const pending = new Map();
  let fatalError = null;
  let readyResolve; let readyReject; let readySettled = false;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const readyTimer = setTimeout(() => { fatalError = new Error(`Qwen worker readiness timed out after ${readyTimeoutMs}ms`); readyReject(fatalError); child.kill(); }, readyTimeoutMs);
  lines.on('line', (line) => {
    let message; try { message = JSON.parse(line); } catch { return; }
    if (message.ready === true) { clearTimeout(readyTimer); readySettled = true; readyResolve(message); return; }
    if (message.ready === false) { clearTimeout(readyTimer); fatalError = new Error(`Qwen worker startup failed: ${message.error || 'unknown error'}`); readySettled = true; readyReject(fatalError); child.kill(); return; }
    const request = pending.get(String(message.id)); if (!request) return;
    pending.delete(String(message.id)); clearTimeout(request.timer);
    if (message.ok) request.resolve(message); else request.reject(new Error(`${message.error || 'Qwen worker request failed'}${message.inputType ? ` [input=${message.inputType} ${message.inputRepr || ''}]` : ''}${message.traceback ? `\n${message.traceback}` : ''}`));
  });
  child.on('error', (error) => { clearTimeout(readyTimer); fatalError = error; readyReject(error); for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); } pending.clear(); });
  child.on('close', (code) => { clearTimeout(readyTimer); if (!readySettled) { fatalError = fatalError || new Error(`Qwen worker closed before ready (code ${code ?? 'unknown'})`); readySettled = true; readyReject(fatalError); } if (code && !fatalError) fatalError = new Error(`Qwen worker exited with code ${code}`); if (pending.size) for (const request of pending.values()) { clearTimeout(request.timer); request.reject(fatalError || new Error(`Qwen worker exited with code ${code}`)); } pending.clear(); });
  let sequence = 0;
  return {
    ready,
    async request(payload) {
      await ready; if (fatalError) throw fatalError;
      const id = String(++sequence);
      const result = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); fatalError = new Error(`Qwen worker request ${id} timed out after ${requestTimeoutMs}ms`); reject(fatalError); child.kill(); }, requestTimeoutMs);
        pending.set(id, { resolve, reject, timer });
      });
      child.stdin.write(`${JSON.stringify({ ...payload, id })}\n`);
      return result;
    },
    close() { lines.close(); child.stdin.end(); },
  };
}

async function readTranscriptJson(transcriptPath, runRootCommand, audioPath, root) {
  const reports = [];
  for (const model of ['small', 'medium']) {
    const output = model === 'small' ? transcriptPath : transcriptPath.replace(/\.json$/, `-${model}.json`);
    // Qwen occupies about 5 GB of VRAM on the target 8 GB GPU. Keep strict
    // ASR on CPU so the medium verifier cannot contend with the live BF16
    // synthesis worker and trigger an avoidable OOM.
    await runRootCommand('python', [path.join(root, 'scripts', 'transcribe-whisper.py'), audioPath, output, '--model', model, '--device', 'cpu', '--compute-type', 'int8', '--beam-size', '5']);
    reports.push({ model, transcript: JSON.parse(await fsp.readFile(output, 'utf8')) });
  }
  return reports;
}

function transcriptText(payload) {
  return (Array.isArray(payload) ? payload : payload?.segments || []).map((segment) => segment.text || '').join(' ');
}

async function resolveProsodyProfile(narration, base) {
  if (!narration.prosodyProfile && narration.prosodyCandidates === undefined) return null;
  if (!narration.prosodyProfile || !Number.isInteger(narration.prosodyCandidates)) throw new Error('Qwen prosody scoring requires prosodyProfile and prosodyCandidates together');
  if (narration.prosodyCandidates < 2 || narration.prosodyCandidates > MAX_ATTEMPTS) throw new Error(`Qwen prosodyCandidates must be between 2 and ${MAX_ATTEMPTS}`);
  const profilePath = path.resolve(base, narration.prosodyProfile);
  if (!fs.existsSync(profilePath)) throw new Error(`Qwen prosody profile not found: ${profilePath}`);
  const profileSha256 = await sha256(profilePath);
  const profile = JSON.parse(await fsp.readFile(profilePath, 'utf8'));
  // Question prompts use the dedicated owner recording and are not scored
  // against the identity-excluded third-party prosody profile.
  const expectedStyles = PROSODY_SCORING_STYLES;
  const source = profile.source || {};
  const contract = profile.featureContract || {};
  if (profile.schemaVersion !== 1 || profile.identityExcluded !== true || profile.activeReferenceSex !== 'male' || source.thirdPartyAudio !== true || !String(source.forbiddenUse || '').toLowerCase().includes('voice-clone prompt') || contract.absolutePitchExcludedFromScoring !== true || expectedStyles.some((style) => !profile.styles?.[style])) throw new Error('Qwen prosody profile failed the male-only/non-identifying/no-clone/five-style contract');
  return { path: profilePath, sha256: profileSha256, id: profile.id, candidates: narration.prosodyCandidates };
}

async function scoreProsodyCandidate({ profile, style, segmentPath, segment, candidateDir, root, runRootCommand }) {
  const scoringStyle = style === 'neutral' ? 'news_exposition' : style;
  const textPath = path.join(candidateDir, 'prosody-text.txt');
  const outputPath = path.join(candidateDir, 'prosody-score.json');
  await fsp.writeFile(textPath, segment, 'utf8');
  await runRootCommand('python', [path.join(root, 'scripts', 'score-prosody-candidate.py'), '--audio', segmentPath, '--text-file', textPath, '--style', scoringStyle, '--profile', profile.path, '--output', outputPath]);
  const report = JSON.parse(await fsp.readFile(outputPath, 'utf8'));
  if (report.profileSha256 !== profile.sha256 || report.profileId !== profile.id || report.style !== scoringStyle || report.thirdPartyWaveformUsedForGeneration !== false || !Number.isFinite(report.scoring?.score)) throw new Error('Qwen prosody score evidence failed integrity checks');
  return { ...report, requestedStyle: style, scoringStyle };
}

export async function runQwen3TtsProvider({ narration, scriptPath, stem, root, base, sourceCues = null, runRootCommand, createWorker = createQwenWorker, qwenEnv = QWEN3_TTS_DEFAULT_ENV, promptBankPath = null }) {
  if (narration.device && narration.device !== 'cuda') throw new Error('Qwen3-TTS requires narration.device=cuda');
  const modelLock = resolveQwenModelLock(narration);
  const modelLocalPath = narration.modelLocalPath ? path.resolve(base, narration.modelLocalPath) : null;
  if (modelLocalPath && !fs.existsSync(modelLocalPath)) throw new Error(`Qwen3-TTS modelLocalPath not found: ${modelLocalPath}`);
  const script = await fsp.readFile(scriptPath, 'utf8');
  if (narration.spokenTextOverrides !== undefined) throw new Error('Qwen spokenTextOverrides is forbidden: the authoritative script is the exact speech contract');
  const criticalPhrases = narration.criticalPhrases ?? [];
  if (!Array.isArray(criticalPhrases) || criticalPhrases.some((phrase) => typeof phrase !== 'string' || !phrase.trim())) throw new Error('Qwen3-TTS criticalPhrases must be a non-empty string array');
  const criticalPhraseModels = narration.criticalPhraseModels ?? ['small', 'medium'];
  if (!Array.isArray(criticalPhraseModels) || criticalPhraseModels.length === 0 || criticalPhraseModels.some((model) => !['small', 'medium'].includes(model)) || new Set(criticalPhraseModels).size !== criticalPhraseModels.length) throw new Error('Qwen3-TTS criticalPhraseModels must be a non-empty array of unique values from small and medium');
  const criticalPhraseAgreement = narration.criticalPhraseAgreement ?? 'all-models';
  if (!['all-models', 'at-least-one-model'].includes(criticalPhraseAgreement)) throw new Error('Qwen3-TTS criticalPhraseAgreement must be all-models or at-least-one-model');
  const pronunciationHints = narration.pronunciationHints ?? [];
  if (!Array.isArray(pronunciationHints) || pronunciationHints.some((hint) => !hint || Object.keys(hint).sort().join(',') !== 'source,spoken' || typeof hint.source !== 'string' || typeof hint.spoken !== 'string' || !hint.source || normalize(hint.source) !== normalize(hint.spoken))) throw new Error('Qwen3-TTS pronunciationHints must preserve normalized source text exactly');
  const applyPronunciationHints = (value) => pronunciationHints.reduce((text, hint) => text.replaceAll(hint.source, hint.spoken), value);
  const pitchCorrections = narration.pitchCorrections ?? [];
  if (!Array.isArray(pitchCorrections)) throw new Error('Qwen3-TTS pitchCorrections must be an array');
  const normalizedScript = normalize(script);
  const pitchCorrectionIds = new Set();
  const pitchCorrectionPhrases = new Set();
  for (const item of pitchCorrections) {
    const valid = item
      && typeof item.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(item.id)
      && typeof item.phrase === 'string' && Boolean(normalize(item.phrase))
      && typeof item.word === 'string' && Boolean(normalize(item.word))
      && normalize(item.phrase).includes(normalize(item.word))
      && Number.isFinite(item.activeFractionStart) && item.activeFractionStart >= 0.35 && item.activeFractionStart <= 0.8
      && Number.isFinite(item.semitones) && item.semitones > 0 && item.semitones <= 4
      && Number.isFinite(item.crossfadeSeconds) && item.crossfadeSeconds >= 0.005 && item.crossfadeSeconds <= 0.03;
    const normalizedPhrase = normalize(item?.phrase);
    if (!valid || pitchCorrectionIds.has(item?.id) || pitchCorrectionPhrases.has(normalizedPhrase)) throw new Error('Qwen3-TTS pitchCorrections contains an invalid or duplicate correction');
    if (!normalizedScript.includes(normalizedPhrase)) throw new Error(`Qwen3-TTS pitch correction phrase not found in script: ${item.phrase}`);
    if (normalizedScript.split(normalizedPhrase).length - 1 !== 1) throw new Error(`Qwen3-TTS pitch correction phrase must occur exactly once in script: ${item.phrase}`);
    pitchCorrectionIds.add(item.id);
    pitchCorrectionPhrases.add(normalizedPhrase);
  }
  const normalizedCriticalPhrases = [...new Set(criticalPhrases.map((phrase) => normalize(phrase)))];
  if (normalizedCriticalPhrases.some((phrase) => !phrase)) throw new Error('Qwen3-TTS criticalPhrases must contain non-empty normalized phrases');
  const missingScriptPhrases = normalizedCriticalPhrases.filter((phrase) => !normalizedScript.includes(phrase));
  if (missingScriptPhrases.length) throw new Error(`Qwen3-TTS criticalPhrases not found in script: ${missingScriptPhrases.join(', ')}`);
  const configuredOwnerSegments = narration.ownerRecordingSegments ?? [];
  if (!Array.isArray(configuredOwnerSegments)) throw new Error('Qwen3-TTS ownerRecordingSegments must be an array');
  const ownerSegmentTexts = new Set();
  for (const [index, item] of configuredOwnerSegments.entries()) {
    const valid = item
      && Object.keys(item).sort().join(',') === 'audio,endSeconds,sha256,startSeconds,text'
      && typeof item.text === 'string' && Boolean(item.text.trim())
      && typeof item.audio === 'string' && Boolean(item.audio)
      && /^[0-9a-f]{64}$/i.test(item.sha256 || '')
      && Number.isFinite(item.startSeconds) && item.startSeconds >= 0
      && Number.isFinite(item.endSeconds) && item.endSeconds > item.startSeconds;
    const normalizedText = normalizeQwenQuestionMatchText(item?.text);
    if (!valid || ownerSegmentTexts.has(normalizedText) || !normalizeQwenQuestionMatchText(script).includes(normalizedText)) throw new Error(`Qwen3-TTS ownerRecordingSegments[${index}] violates the exact owner span contract`);
    ownerSegmentTexts.add(normalizedText);
  }
  const stylePlan = planQwenNarrationSections(script, narration);
  const prosodyProfile = await resolveProsodyProfile(narration, base);
  const units = stylePlan.units;
  if (!units.length) throw new Error('Qwen3-TTS script is empty');
  if (stylePlan.mode === 'auto' && (narration.referenceAudio || narration.referenceTranscript || narration.referenceAudioSha256)) throw new Error('Qwen auto style rejects caller-supplied reference fields');
  const requiredStyles = [...new Set(units.map((unit) => unit.style))];
  const prompts = new Map();
  for (const style of requiredStyles) {
    const promptNarration = stylePlan.mode === 'auto'
      ? { ...narration, style, referenceAudio: undefined, referenceTranscript: undefined, referenceAudioSha256: undefined }
      : narration;
    const prompt = await resolveQwenReference({ narration: promptNarration, root, base, promptBankPath, bankOnly: stylePlan.mode === 'auto' });
    if (!fs.existsSync(prompt.audio)) throw new Error(`Qwen reference audio not found: ${prompt.audio}`);
    const actualSha256 = await sha256(prompt.audio);
    if (!/^[0-9a-f]{64}$/.test(prompt.expectedSha256) || actualSha256 !== prompt.expectedSha256) throw new Error(`Qwen reference SHA-256 mismatch for ${style}: expected ${prompt.expectedSha256}, received ${actualSha256}`);
    prompts.set(style, { ...prompt, actualSha256 });
  }
  const selectedPrompt = stylePlan.mode === 'auto' ? null : prompts.get(requiredStyles[0]);
  const promptHashes = Object.fromEntries([...prompts].map(([style, prompt]) => [style, prompt.actualSha256]));
  const promptBankManifestSha256 = [...prompts.values()].find((prompt) => prompt.promptBankManifestSha256)?.promptBankManifestSha256 || null;
  const configuredReuseSegments = narration.reuseSegments ?? [];
  if (!Array.isArray(configuredReuseSegments)) throw new Error('Qwen3-TTS reuseSegments must be an array');
  if (pitchCorrections.length && configuredReuseSegments.length) throw new Error('Qwen3-TTS segment reuse is forbidden when pitchCorrections are configured');
  const reuseSegments = new Map();
  const realRoot = await fsp.realpath(root);
  for (const [reuseIndex, entry] of configuredReuseSegments.entries()) {
    const keys = Object.keys(entry || {}).sort().join(',');
    const expectedKeys = 'audioPath,audioSha256,modelId,modelRevision,promptBankManifestSha256,promptSha256,seed,segmentIndex,sourceTextSha256,style';
    if (keys !== expectedKeys || !Number.isInteger(entry.segmentIndex) || entry.segmentIndex < 1 || entry.segmentIndex > units.length || reuseSegments.has(entry.segmentIndex) || !Number.isInteger(entry.seed) || !/^[a-f0-9]{64}$/u.test(entry.audioSha256 || '') || !/^[a-f0-9]{64}$/u.test(entry.sourceTextSha256 || '') || !/^[a-f0-9]{64}$/u.test(entry.promptSha256 || '') || typeof entry.audioPath !== 'string' || path.isAbsolute(entry.audioPath)) throw new Error(`Qwen3-TTS reuseSegments[${reuseIndex}] is malformed`);
    const unit = units[entry.segmentIndex - 1];
    const expectedTextSha256 = crypto.createHash('sha256').update(Buffer.from(unit.text, 'utf8')).digest('hex');
    if (entry.sourceTextSha256 !== expectedTextSha256 || entry.style !== unit.style || entry.modelId !== modelLock.modelId || entry.modelRevision !== modelLock.modelRevision || entry.promptSha256 !== promptHashes[unit.style] || entry.promptBankManifestSha256 !== promptBankManifestSha256) throw new Error(`Qwen3-TTS reuse segment ${entry.segmentIndex} authority is stale`);
    const audioPath = path.resolve(root, ...entry.audioPath.split('/'));
    const stat = await fsp.lstat(audioPath).catch(() => null);
    const realAudio = stat?.isFile() && !stat.isSymbolicLink() ? await fsp.realpath(audioPath) : null;
    if (!realAudio || !(realAudio === realRoot || realAudio.startsWith(`${realRoot}${path.sep}`)) || await sha256(realAudio) !== entry.audioSha256) throw new Error(`Qwen3-TTS reuse segment ${entry.segmentIndex} audio is missing, linked, escaped, or changed`);
    reuseSegments.set(entry.segmentIndex, { ...entry, relativeAudioPath: entry.audioPath, audioPath: realAudio });
  }
  const questionStyle = narration.questionStyle || 'question';
  const ownerQuestionPrompt = prompts.get(questionStyle);
  const ownerQuestionEntry = ownerQuestionPrompt?.promptBankEntry;
  const ownerQuestionSegments = resolveQwenOwnerQuestionSegments(ownerQuestionEntry);
  const ownerRecordingSegments = [];
  for (const item of configuredOwnerSegments) {
    const audio = path.resolve(base, item.audio);
    if (!fs.existsSync(audio)) throw new Error(`Qwen owner recording not found: ${audio}`);
    const actualSha256 = await sha256(audio);
    if (actualSha256 !== item.sha256.toLowerCase()) throw new Error(`Qwen owner recording SHA-256 mismatch: expected ${item.sha256}, received ${actualSha256}`);
    ownerRecordingSegments.push({
      text: item.text,
      audio,
      assetStartSeconds: item.startSeconds,
      assetEndSeconds: item.endSeconds,
      sourceAudioSha256: actualSha256,
      promptAssetSha256: actualSha256,
    });
  }
  const promptBankPrompt = [...prompts.values()].find((prompt) => prompt.promptBankManifestSha256) || null;
  const promptBankProvenance = promptBankPrompt ? {
    profileId: promptBankPrompt.promptBankProfileId || null,
    manifest: path.relative(root, promptBankPrompt.promptBankPath).replaceAll(path.sep, '/'),
    manifestSha256: promptBankManifestSha256,
    sourceAudit: promptBankPrompt.promptBankSourceAudit,
  } : null;
  const python = path.join(qwenEnv, process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python');
  const workerScript = path.join(root, 'scripts', 'qwen3-tts-worker.py');
  const seedBase = Number.isInteger(narration.seed) ? narration.seed : 20260730;
  const maxAttempts = Math.min(MAX_ATTEMPTS, Math.max(1, Number(narration.maxAttempts || MAX_ATTEMPTS)));
  if (prosodyProfile && prosodyProfile.candidates > maxAttempts) throw new Error('Qwen prosodyCandidates cannot exceed maxAttempts');
  const temperature = Number(narration.temperature ?? 0.7);
  if (!Number.isFinite(temperature) || temperature <= 0 || temperature > QWEN3_TTS_MAX_TEMPERATURE) throw new Error(`Qwen3-TTS temperature must be in (0, ${QWEN3_TTS_MAX_TEMPERATURE}]`);
  const finalTempo = Number(narration.finalTempo ?? 1);
  if (!Number.isFinite(finalTempo) || finalTempo < 1 || finalTempo > 1.08) throw new Error('Qwen3-TTS finalTempo must be between 1.0 and 1.08');
  const modelArgs = ['--model', modelLock.modelId, '--model-revision', modelLock.modelRevision, '--attention-implementation', modelLock.attentionImplementation, ...(modelLocalPath ? ['--model-local-path', modelLocalPath] : [])];
  const workerArgs = stylePlan.mode === 'auto'
    ? ['-u', workerScript, '--prompt-style', 'auto', '--prompt-bank-manifest', [...prompts.values()][0].promptBankPath, '--prompt-bank-sha256', promptBankManifestSha256, '--prompt-styles', requiredStyles.join(','), '--device', 'cuda:0', ...modelArgs]
    : ['-u', workerScript, '--reference-audio', selectedPrompt.audio, '--reference-text', selectedPrompt.transcript, '--reference-sha256', selectedPrompt.expectedSha256, '--prompt-style', selectedPrompt.style, '--device', 'cuda:0', ...modelArgs];
  const worker = await createWorker(python, workerArgs, { cwd: root });
  const ready = await worker.ready;
  const commonReady = ready.modelId === modelLock.modelId && ready.modelRevision === modelLock.modelRevision && ready.modelSize === modelLock.modelSize && ready.attentionImplementation === modelLock.attentionImplementation && ready.dtype === QWEN3_TTS_DTYPE && String(ready.device || '').startsWith('cuda') && ready.promptCached === true && ready.modelType === 'base' && ready.loraLoaded === false && ready.adapterLoaded === false;
  const promptReady = stylePlan.mode === 'auto'
    ? ready.promptStyle === 'auto' && ready.promptBankSha256 === promptBankManifestSha256 && JSON.stringify(ready.promptStyles) === JSON.stringify(requiredStyles) && requiredStyles.every((style) => ready.promptHashes?.[style] === promptHashes[style]) && Object.keys(ready.promptHashes || {}).length === requiredStyles.length
    : ready.promptStyle === selectedPrompt.style && ready.promptSha256 === selectedPrompt.expectedSha256;
  if (!commonReady || !promptReady) { worker.close(); throw new Error('Qwen3-TTS worker failed the locked Base/BF16/GPU/prompt/no-LoRA gate'); }
  const acceptedSegments = []; const attempts = []; let peakGpuTempC = Number(ready.startGpuTempC || 0); let peakAllocatedBytes = Number(ready.loadPeakAllocatedBytes || 0); let peakReservedBytes = Number(ready.loadPeakReservedBytes || 0); let generationSeconds = 0;
  const segmentAttemptEvidence = () => units.map((_, index) => ({ segmentIndex: index + 1, attempts: attempts.filter((item) => item.segmentIndex === index + 1) }));
  try {
    let cursor = 0;
    for (let index = 0; index < units.length; index += 1) {
      const unit = units[index]; const segment = unit.text; const spokenSegment = applyPronunciationHints(normalizeQwenSpokenText(segment)); const ownerQuestionSegment = ownerRecordingSegments.find((item) => normalizeQwenQuestionMatchText(item.text) === normalizeQwenQuestionMatchText(segment)) || (unit.style === questionStyle ? ownerQuestionSegments.find((item) => normalizeQwenQuestionMatchText(item.text) === normalizeQwenQuestionMatchText(segment)) : null); const ownerSegmentAudio = ownerQuestionSegment?.audio || ownerQuestionPrompt?.audio; const unitProsodyProfile = prosodyProfile && !ownerQuestionSegment ? prosodyProfile : null; let acceptedSegment = null; const validCandidates = [];
      if (!spokenSegment) throw new Error(`Qwen3-TTS spoken segment ${index + 1} is empty after normalization`);
      const reuseSegment = ownerQuestionSegment ? null : reuseSegments.get(index + 1) || null;
      const attemptLimit = ownerQuestionSegment ? 1 : maxAttempts;
      for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
        const reuseAttempt = Boolean(reuseSegment && attempt === 0);
        const seed = reuseAttempt ? reuseSegment.seed : seedBase + (index * maxAttempts) + attempt;
        const candidateDir = reuseAttempt ? `${stem}.qwen-reuse-${String(index + 1).padStart(3, '0')}` : `${stem}.qwen-candidate-${String(index + 1).padStart(3, '0')}-${attempt + 1}`;
        await fsp.mkdir(candidateDir, { recursive: true });
        const segmentPath = reuseAttempt ? reuseSegment.audioPath : path.join(candidateDir, `segment-${String(index + 1).padStart(3, '0')}.wav`); const transcriptPath = path.join(candidateDir, `segment-${String(index + 1).padStart(3, '0')}.json`);
        try {
          const generated = reuseAttempt
            ? { generationMode: 'qwen-revalidated-segment', generationSeconds: 0, peakAllocatedBytes: 0, peakReservedBytes: 0 }
            : ownerQuestionSegment
            ? (await extractQwenPcm16WavSegment(ownerSegmentAudio, segmentPath, ownerQuestionSegment.assetStartSeconds, ownerQuestionSegment.assetEndSeconds, { guardSeconds: 0.02, fadeSeconds: 0.005 }), { generationMode: 'owner-recording-segment' })
            : await worker.request({ text: spokenSegment, seed, temperature, output: segmentPath, style: unit.style });
          const edgePreparation = ownerQuestionSegment || reuseAttempt ? null : await applyQwenPcm16EdgeFade(segmentPath, 0.005);
          if (Number.isFinite(generated?.peakGpuTempC)) peakGpuTempC = Math.max(peakGpuTempC, generated.peakGpuTempC);
          if (Number.isFinite(generated?.peakAllocatedBytes)) peakAllocatedBytes = Math.max(peakAllocatedBytes, generated.peakAllocatedBytes);
          if (Number.isFinite(generated?.peakReservedBytes)) peakReservedBytes = Math.max(peakReservedBytes, generated.peakReservedBytes);
          if (Number.isFinite(generated?.generationSeconds)) generationSeconds += generated.generationSeconds;
          let transcripts = ownerQuestionSegment ? [] : await readTranscriptJson(transcriptPath, runRootCommand, segmentPath, root);
          const pitchCorrectionEvidence = ownerQuestionSegment || reuseAttempt ? [] : await applyQwenPitchCorrections({ segmentPath, segment: spokenSegment, transcripts, corrections: pitchCorrections, runRootCommand });
          if (pitchCorrectionEvidence.length) transcripts = await readTranscriptJson(transcriptPath.replace(/\.json$/i, '-post-pitch.json'), runRootCommand, segmentPath, root);
          const recognized = ownerQuestionSegment ? spokenSegment : transcriptText(transcripts[0].transcript);
          const asrChecks = ownerQuestionSegment ? [] : transcripts.map(({ model, transcript }) => {
            const text = transcriptText(transcript);
            return { model, text, cer: characterErrorRate(spokenSegment, text) };
          });
          const withinCerGate = ownerQuestionSegment || asrChecks.every(({ cer }) => cer <= MAX_ASR_CER);
          const hasWords = ownerQuestionSegment || transcripts.every(({ transcript }) => (Array.isArray(transcript?.segments) ? transcript.segments : []).some((item) => Array.isArray(item.words) && item.words.length));
          const requiredCriticalPhrases = normalizedCriticalPhrases.filter((phrase) => normalize(spokenSegment).includes(phrase));
          const words = ownerQuestionSegment ? [] : transcripts[0].transcript.segments.flatMap((item) => Array.isArray(item.words) ? item.words : []);
          const missingCriticalModels = ownerQuestionSegment ? [] : criticalPhraseModels.filter((model) => !transcripts.some((report) => report.model === model));
          if (missingCriticalModels.length) throw new Error(`critical phrase gate missing ASR model(s) for segment ${index + 1}: ${missingCriticalModels.join(', ')}`);
          const criticalPhraseChecks = transcripts.filter(({ model }) => criticalPhraseModels.includes(model)).map(({ model, transcript }) => {
            const text = normalize(transcriptText(transcript));
            const missing = requiredCriticalPhrases.filter((phrase) => !text.includes(phrase));
            return { model, required: requiredCriticalPhrases, missing };
          });
          const criticalPhraseConsensus = evaluateQwenCriticalPhraseConsensus(requiredCriticalPhrases, criticalPhraseChecks, criticalPhraseModels, criticalPhraseAgreement);
          const criticalPhrasesPass = ownerQuestionSegment || criticalPhraseConsensus.every(({ passes }) => passes);
          if (!withinCerGate || !hasWords) throw new Error(`dual ASR gate mismatch for segment ${index + 1}: ${asrChecks.map(({ model, cer }) => `${model} CER=${cer.toFixed(3)}`).join(', ')}`);
          if (!criticalPhrasesPass) throw new Error(`critical phrase gate mismatch for segment ${index + 1}: ${criticalPhraseChecks.map(({ model, missing }) => `${model} missing=${missing.join('|') || 'none'}`).join(', ')}`);
          let localizedPronunciationQa = null;
          if (!ownerQuestionSegment && requiredCriticalPhrases.length) {
            const localAnchors = alignQwenWordAnchorsToSource(spokenSegment, words, 0, 0);
            const localizedWindows = buildQwenLocalizedPronunciationWindows(spokenSegment, localAnchors, requiredCriticalPhrases, Number(transcripts[0].transcript?.segments?.at(-1)?.end || 0));
            const localizedWindowsPath = path.join(candidateDir, `segment-${String(index + 1).padStart(3, '0')}-pronunciation-windows.json`);
            const localizedOutputPath = path.join(candidateDir, `segment-${String(index + 1).padStart(3, '0')}-pronunciation-qa.json`);
            await fsp.writeFile(localizedWindowsPath, `${JSON.stringify(localizedWindows, null, 2)}\n`, 'utf8');
            await runRootCommand('python', [path.join(root, 'scripts', 'transcribe-whisper-windows.py'), segmentPath, localizedWindowsPath, localizedOutputPath, '--models', 'small,medium', '--device', 'cpu', '--compute-type', 'int8', '--beam-size', '5']);
            localizedPronunciationQa = evaluateQwenLocalizedPronunciationQa(JSON.parse(await fsp.readFile(localizedOutputPath, 'utf8')), localizedWindows, criticalPhraseModels);
          }
          const signal = await inspectQwenPcm16Wav(segmentPath);
          const expectedOwnerDuration = ownerQuestionSegment ? ownerQuestionSegment.assetEndSeconds - ownerQuestionSegment.assetStartSeconds + 0.04 : null;
          const signalPasses = signal.durationSeconds > 0 && signal.clippedSamples === 0 && signal.endpointAmplitude <= 0.02 && signal.boundaryMaxAdjacentJump <= 0.25 && (!ownerQuestionSegment || Math.abs(signal.durationSeconds - expectedOwnerDuration) <= 1 / 24000);
          if (!signalPasses) throw new Error(`signal boundary gate failed for segment ${index + 1}`);
          const questionProsody = unit.style === questionStyle && !ownerQuestionSegment ? evaluateQwenQuestionTail(await readQwenPcm16WavSamples(segmentPath)) : null;
          if (questionProsody && !questionProsody.passes) throw new Error(`question tail gate failed for segment ${index + 1}: tailDeltaDb=${questionProsody.tailDeltaDb.toFixed(2)}, deltaSemitones=${questionProsody.deltaSemitones === null ? 'n/a' : questionProsody.deltaSemitones.toFixed(2)}`);
          const duration = signal.durationSeconds;
          const unitStartChar = acceptedSegments.reduce((sum, item) => sum + normalize(item.cue.text).length, 0);
          const anchors = ownerQuestionSegment
            ? [{ startChar: unitStartChar, endChar: unitStartChar + normalize(segment).length, start: cursor, end: cursor + duration }]
            : alignQwenWordAnchorsToSource(spokenSegment, words, unitStartChar, cursor);
          const audioSha256 = await sha256(segmentPath);
          const cue = { start: cursor, end: cursor + duration, text: segment, style: unit.style, sectionIndex: unit.sectionIndex, anchors };
          const prosody = prosodyProfile && !ownerQuestionSegment ? await scoreProsodyCandidate({ profile: prosodyProfile, style: unit.style, segmentPath, segment: spokenSegment, candidateDir, root, runRootCommand }) : null;
          const evidence = { index: index + 1, sectionIndex: unit.sectionIndex, style: unit.style, classification: unit.classification, promptSha256: promptHashes[unit.style], audioSha256, accepted: !unitProsodyProfile, eligible: true, selected: !unitProsodyProfile, seed: ownerQuestionSegment ? null : seed, generationMode: ownerQuestionSegment ? 'owner-recording-segment' : reuseAttempt ? 'qwen-revalidated-segment' : 'qwen-resynthesis', verificationMode: ownerQuestionSegment ? 'pinned-owner-asset-hash-and-span' : 'dual-asr-localized-pronunciation-and-signal', reusedSegment: reuseAttempt ? { schema: 'qwen-segment-reuse-v1', sourceAudioPath: reuseSegment.relativeAudioPath, sourceAudioSha256: reuseSegment.audioSha256, revalidated: true } : null, ownerRecordingSegment: ownerQuestionSegment ? { sourceAudioSha256: ownerQuestionSegment.sourceAudioSha256 || ownerQuestionPrompt.promptBankEntry.sourceAudioSha256, promptAssetSha256: ownerQuestionSegment.promptAssetSha256 || ownerQuestionPrompt.actualSha256, startSeconds: ownerQuestionSegment.assetStartSeconds, endSeconds: ownerQuestionSegment.assetEndSeconds, guardSeconds: 0.02, fadeSeconds: 0.005 } : null, edgePreparation, runtime: ownerQuestionSegment ? null : { generationSeconds: generated.generationSeconds, peakAllocatedBytes: generated.peakAllocatedBytes, peakReservedBytes: generated.peakReservedBytes }, pitchCorrections: pitchCorrectionEvidence, sourceText: segment, spokenText: spokenSegment, spokenTextEquivalence: { mode: 'normalized-orthographic-whitespace-only', equivalent: normalize(segment) === normalize(spokenSegment) }, transcript: recognized, asrChecks, criticalPhraseChecks, criticalPhraseConsensus, localizedPronunciationQa, signal, questionProsody, prosody, attemptsUsed: attempt + 1 };
          attempts.push({ attempt: attempt + 1, segmentIndex: index + 1, seed: ownerQuestionSegment ? null : seed, accepted: !unitProsodyProfile, segments: [evidence] });
          const candidate = { file: segmentPath, metric: signal, cue, evidence, attemptRecord: attempts.at(-1) };
          if (!unitProsodyProfile) {
            acceptedSegment = candidate;
            acceptedSegments.push(acceptedSegment); cursor += duration;
            break;
          }
          validCandidates.push(candidate);
          if (validCandidates.length >= unitProsodyProfile.candidates) break;
        } catch (error) {
          const evidence = { index: index + 1, sectionIndex: unit.sectionIndex, style: unit.style, classification: unit.classification, promptSha256: promptHashes[unit.style], accepted: false, seed: ownerQuestionSegment ? null : seed, generationMode: reuseAttempt ? 'qwen-revalidated-segment' : ownerQuestionSegment ? 'owner-recording-segment' : 'qwen-resynthesis', reusedSegment: reuseAttempt ? { schema: 'qwen-segment-reuse-v1', sourceAudioPath: reuseSegment.relativeAudioPath, sourceAudioSha256: reuseSegment.audioSha256, revalidated: false } : null, error: error.message, attemptsUsed: attempt + 1 };
          attempts.push({ attempt: attempt + 1, segmentIndex: index + 1, seed: ownerQuestionSegment ? null : seed, accepted: false, segments: [evidence] });
        }
      }
      if (unitProsodyProfile && validCandidates.length >= unitProsodyProfile.candidates) {
        validCandidates.sort((left, right) => left.evidence.prosody.scoring.score - right.evidence.prosody.scoring.score || left.evidence.seed - right.evidence.seed);
        acceptedSegment = validCandidates[0];
        for (const [rank, candidate] of validCandidates.entries()) {
          candidate.evidence.prosody.rank = rank + 1;
          candidate.evidence.selected = rank === 0;
          candidate.evidence.accepted = rank === 0;
          candidate.attemptRecord.accepted = rank === 0;
          if (rank !== 0) candidate.evidence.rejectionReason = 'valid candidate not selected by non-identifying prosody score';
        }
        acceptedSegments.push(acceptedSegment); cursor += acceptedSegment.metric.durationSeconds;
      }
      if (!acceptedSegment) {
        const prosodyShortfall = unitProsodyProfile ? { eligibleCandidates: validCandidates.length, requiredCandidates: unitProsodyProfile.candidates } : null;
        const failure = { accepted: false, attemptCount: attempts.length, attempts, evidence: { modelId: modelLock.modelId, modelRevision: modelLock.modelRevision, modelSize: modelLock.modelSize, dtype: QWEN3_TTS_DTYPE, attentionImplementation: modelLock.attentionImplementation, device: ready.device, promptStyle: stylePlan.mode, promptHashes, sectionPlan: stylePlan.sections, segmentAttempts: segmentAttemptEvidence(), prosodyProfile: prosodyProfile ? { id: prosodyProfile.id, sha256: prosodyProfile.sha256, candidatesRequired: prosodyProfile.candidates, identityExcluded: true, thirdPartyWaveformUsedForGeneration: false } : null, prosodyShortfall, referenceAudioSha256: selectedPrompt?.actualSha256 || null, expectedReferenceAudioSha256: selectedPrompt?.expectedSha256 || null, loraLoaded: false, adapterLoaded: false, startGpuTempC: ready.startGpuTempC ?? null, peakGpuTempC, runtime: { loadSeconds: ready.loadSeconds, generationSeconds, peakAllocatedBytes, peakReservedBytes }, asr: { models: ['small', 'medium'], device: 'cpu', computeType: 'int8', maxCharacterErrorRate: MAX_ASR_CER, criticalPhrases, criticalPhraseModels, criticalPhraseAgreement, strict: true } }, final: { accepted: false, failClosedDualAsr: true, maxCharacterErrorRate: MAX_ASR_CER, segmentCount: units.length } };
        await fsp.writeFile(`${stem}.acceptance.json`, `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
        const reasons = attempts.flatMap((item) => item.segments || []).filter((item) => item.accepted === false).map((item) => item.error).filter(Boolean);
        const shortfallReason = prosodyShortfall ? `prosody candidates ${prosodyShortfall.eligibleCandidates}/${prosodyShortfall.requiredCandidates}` : null;
        throw new Error(`Qwen3-TTS strict candidate gate rejected segment ${index + 1} after ${attemptLimit} deterministic attempts: ${[...new Set([...reasons, shortfallReason].filter(Boolean))].join(' | ') || 'no accepted segment'}`);
      }
    }
    const acceptedPitchCorrections = summarizeQwenPitchCorrections(acceptedSegments, pitchCorrections);
    const winner = { candidateFiles: acceptedSegments.map((item) => item.file), metrics: acceptedSegments.map((item) => item.metric), cues: acceptedSegments.map((item) => item.cue) }; const audioPath = `${stem}.wav`;
    const inputs = winner.candidateFiles.flatMap((file) => ['-i', file]);
    const loudness = qwenLoudnessPlan(winner.metrics);
    if (loudness.joins.some((join) => !join.passes)) throw new Error('Qwen section boundary discontinuity gate failed before concatenation');
    const gainFilters = winner.candidateFiles.map((_, index) => `[${index}:a]volume=${loudness.gainsDb[index].toFixed(6)}dB[g${index}]`).join(';');
    const filter = `${gainFilters};${winner.candidateFiles.map((_, index) => `[g${index}]`).join('')}concat=n=${winner.candidateFiles.length}:v=0:a=1[joined];[joined]atempo=${finalTempo.toFixed(6)}[out]`;
    await runRootCommand('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', filter, '-map', '[out]', '-c:a', 'pcm_s16le', audioPath]);
    const finalSignal = await inspectQwenPcm16Wav(audioPath);
    if (finalSignal.clippedSamples || finalSignal.endpointAmplitude > 0.02 || finalSignal.boundaryMaxAdjacentJump > 0.25) throw new Error('Qwen final signal boundary/clipping gate failed');
    const scaledCues = winner.cues.map((cue) => ({ ...cue, start: cue.start / finalTempo, end: cue.end / finalTempo, anchors: cue.anchors?.map((anchor) => ({ ...anchor, start: anchor.start / finalTempo, end: anchor.end / finalTempo })) }));
    const globalWordAnchors = scaledCues.flatMap((cue) => cue.anchors || []);
    let previousAnchorStart = -1;
    for (const anchor of globalWordAnchors) {
      if (!Number.isFinite(anchor.start) || !Number.isFinite(anchor.end) || anchor.start < previousAnchorStart || anchor.end < anchor.start || anchor.start < 0 || anchor.end > finalSignal.durationSeconds + 0.05) throw new Error('Qwen global word anchor monotonicity/bounds gate failed');
      previousAnchorStart = anchor.start;
    }
    const mappingSourceCues = stylePlan.mode === 'auto' && sourceCues ? sourceCues.map((cue) => ({ ...cue, text: stripQwenStyleLabel(cue.text).text })).filter((cue) => cue.text) : sourceCues;
    const outputCues = mappingSourceCues ? mapQwenCuesToSource(mappingSourceCues, scaledCues) : scaledCues;
    const finalAudioSha256 = await sha256(audioPath);
    const ownerSegmentCount = acceptedSegments.filter((item) => item.evidence.generationMode === 'owner-recording-segment').length;
    const reusedSegmentCount = acceptedSegments.filter((item) => item.evidence.generationMode === 'qwen-revalidated-segment').length;
    const synthesizedSegmentCount = acceptedSegments.length - ownerSegmentCount;
    const acceptance = { accepted: true, attemptCount: attempts.length, attempts, evidence: { modelId: modelLock.modelId, modelRevision: modelLock.modelRevision, modelSize: modelLock.modelSize, dtype: QWEN3_TTS_DTYPE, attentionImplementation: modelLock.attentionImplementation, device: ready.device, promptStyle: stylePlan.mode, promptHashes, promptBankManifestSha256, sectionPlan: stylePlan.sections, segmentAttempts: segmentAttemptEvidence(), segmentReuse: { schema: 'qwen-segment-reuse-summary-v1', requested: configuredReuseSegments.length, reused: reusedSegmentCount, regenerated: acceptedSegments.filter((item) => item.evidence.generationMode === 'qwen-resynthesis').length }, pitchCorrections: acceptedPitchCorrections, prosodyProfile: prosodyProfile ? { id: prosodyProfile.id, sha256: prosodyProfile.sha256, candidatesRequired: prosodyProfile.candidates, identityExcluded: true, thirdPartyWaveformUsedForGeneration: false } : null, referenceAudioSha256: selectedPrompt?.actualSha256 || null, expectedReferenceAudioSha256: selectedPrompt?.expectedSha256 || null, loraLoaded: false, adapterLoaded: false, startGpuTempC: ready.startGpuTempC ?? null, peakGpuTempC, runtime: { loadSeconds: ready.loadSeconds, generationSeconds, peakAllocatedBytes, peakReservedBytes }, loudness: { ...loudness, formantPreservation: 'gain-only concatenation after 5 ms synthesized edge fades; no added pause, pitch, formant, compression, or crossfade; verified owner segments include 20 ms edge guards and 5 ms edge fades' }, finalSignal, finalAudioSha256, globalWordAnchors, verification: { ownerSegments: { mode: 'pinned-owner-asset-hash-and-span', count: ownerSegmentCount, dualAsrRequired: false, signalRequired: true }, synthesizedSegments: { mode: 'dual-asr-and-signal-after-duration-preserving-edge-fade', count: synthesizedSegmentCount, reusedCount: reusedSegmentCount, dualAsrRequired: true, signalRequired: true } }, asr: { models: ['small', 'medium'], device: 'cpu', computeType: 'int8', maxCharacterErrorRate: MAX_ASR_CER, criticalPhrases, criticalPhraseModels, criticalPhraseAgreement, strictFor: 'qwen-resynthesis-and-revalidated-segments' } }, final: { accepted: true, failClosedVerification: true, synthesizedSegmentsDualAsr: true, ownerSegmentsPinnedAsset: true, pitchCorrectionsExactlyOnce: true, maxCharacterErrorRate: MAX_ASR_CER, segmentCount: units.length, ownerSegmentCount, synthesizedSegmentCount, reusedSegmentCount }, finalTempo };
    const srtPath = `${stem}.srt`; await fsp.writeFile(srtPath, renderSrt(outputCues), 'utf8'); await fsp.writeFile(`${stem}.acceptance.json`, `${JSON.stringify(acceptance, null, 2)}\n`, 'utf8');
    return {
      audioPath, srtPath, cues: outputCues, acceptance,
      provenance: {
        requestedProvider: 'qwen3-tts', actualProvider: 'qwen3-tts', fallbackUsed: false, fallbackReason: null,
        modelId: modelLock.modelId, modelRevision: modelLock.modelRevision, modelSize: modelLock.modelSize, dtype: QWEN3_TTS_DTYPE, attentionImplementation: modelLock.attentionImplementation, language: QWEN3_TTS_LANGUAGE, device: ready.device,
        promptStyle: stylePlan.mode, promptHashes, promptBankManifestSha256, promptBankProvenance, sectionPlan: stylePlan.sections,
        prosodyProfile: prosodyProfile ? { id: prosodyProfile.id, sha256: prosodyProfile.sha256, candidatesRequired: prosodyProfile.candidates, identityExcluded: true, thirdPartyWaveformUsedForGeneration: false } : null,
        loraLoaded: false, adapterLoaded: false,
        referenceAudio: selectedPrompt ? path.relative(root, selectedPrompt.audio).replaceAll(path.sep, '/') : null,
        referenceAudioSha256: selectedPrompt?.actualSha256 || null,
        expectedReferenceAudioSha256: selectedPrompt?.expectedSha256 || null,
        referenceTranscript: selectedPrompt?.transcript || null,
        generationTempo: 1, finalTempo, temperature, seeds: attempts.map((item) => item.seed), peakGpuTempC, runtime: { loadSeconds: ready.loadSeconds, generationSeconds, peakAllocatedBytes, peakReservedBytes },
        asrValidation: { models: ['small', 'medium'], device: 'cpu', computeType: 'int8', failClosed: true, scope: 'qwen-resynthesis', ownerRecordingVerification: 'pinned-owner-asset-hash-and-span', maxCharacterErrorRate: MAX_ASR_CER, criticalPhrases, criticalPhraseModels },
        pitchCorrections: acceptedPitchCorrections,
        speechAcceptance: acceptance,
      },
    };
  } finally { worker.close(); }
}
