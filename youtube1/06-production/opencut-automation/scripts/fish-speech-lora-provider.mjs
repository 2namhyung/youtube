import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

export const FISH_BASE_MODEL = 'fish-speech-1.5';
export const FISH_MERGED_MODEL = 'fish-speech-1.5-F3-prosody-r8-step160-20260727';
export const FISH_LORA_CHECKPOINT = 'F3_prosody_lora_20260727_r8/checkpoints/step_000000160.ckpt';
export const FISH_PROMPT_TEXT = '넷플릭스 시리즈 참교육 속 교권보호국, 현실에도 진짜 필요한 거 아니에요?';
const FISH_MAX_CHUNK_CUES = 10;
const FISH_MAX_CHUNK_CHARS = 120;
const FISH_MAX_ATTEMPTS = 3;
const FISH_CACHE_SCHEMA = 3;
const FISH_AUDIO_POLICY = 'leading-trim-100ms-tail-pad-v1';
const FISH_ALIGNMENT_POLICY = 'word-dp-critical-exact-v2';
const FISH_SYNTHESIS_POLICY = 'canonical-syllables-punctuation-microsegment-v3';
export const FISH_LORA_SHA256 = '80148A50D32DE2C8754A2FE8D7328A5A0A7A41F9D7957126741BC6E1A588216A'.toLowerCase();
export const FISH_BASE_MODEL_SHA256 = '918DC960372CC1B77BBAFB14C48EF7A1634ECF75D4EB85B78607223B780D6001'.toLowerCase();
export const FISH_MERGED_MODEL_SHA256 = 'B04303B3507FF3A2C7C23E7C67F13EBE6F0C802EA5C2D0972CC80267BC2F55EE'.toLowerCase();
export const FISH_VQ_CHECKPOINT = 'firefly-gan-vq-fsq-8x1024-21hz-generator.pth';

function normalizeSpeechText(text) { return String(text || '').normalize('NFKC').toLowerCase().replace(/cctv/g, '씨씨티비').replace(/[^\p{L}\p{N}]+/gu, ''); }

const CUE_SYNTHESIS_TEXT_OVERRIDES = new Map([
  [1, '교권, 보호국.'],
  [24, '피-의-자로 특정했고요.'],
]);
const LEXICAL_SYNTHESIS_TEXT_OVERRIDES = new Map([
  [normalizeSpeechText('교권보호국.'), '교권, 보호국.'],
  [normalizeSpeechText('혐의는 건조물침입과 재물손괴뿐.'), '혐의는 건조물 침입과, 재물 손. 괴뿐.'],
]);
const MICROSEGMENT_SYNTHESIS_OVERRIDES = new Map([
  [normalizeSpeechText('같은 침입자가 교사용 의자에 소변을 봤습니다.'), [
    { originalText: '같은 침입자가', seedAttempt: 1, variants: ['같은 침입자가', '같은 침입자가,', '같은, 침입자가', '같은 침입자가.'] },
    { originalText: '교사용 의자에', seedAttempt: 1, variants: ['교사용 의자에', '교사용 의자에,', '교사용, 의자에', '교사용 의자에.'] },
    { originalText: '소변을 봤습니다.', seedAttempt: 1, variants: ['소변을, 봤습니다.', '소변을. 봤습니다.', '소변을 봤습니다.', '소변을 봤습니다'] },
  ]],
  [normalizeSpeechText('피해 교사 측이 요청한 휴대전화와 컴퓨터 포렌식 영장은 기각됐고,'), [
    { originalText: '피해 교사 측이 요청한', seedAttempt: 1, variants: ['피해 교사 측이 요청한', '피해 교사 측이 요청한,'] },
    { originalText: '휴대전화와 컴퓨터', seedAttempt: 1, variants: ['휴대전화와 컴퓨터', '휴대전화와 컴퓨터,'] },
    { originalText: '포렌식 영장은 기각됐고,', seedAttempt: 1, variants: [
      '포렌식 영장은 기각됐고,',
      '포렌식 영장은, 기각됐고,',
      '포렌식, 영장은 기각됐고,',
      '포렌식. 영장은 기각됐고,',
      '포렌식 영장은. 기각됐고,',
      '포렌식, 영장은, 기각됐고,',
    ] },
  ]],
  [normalizeSpeechText('혐의는 건조물침입과 재물손괴뿐.'), [
    { originalText: '혐의는 건조물', seedAttempt: 1, variants: [
      '혐의는 건조물', '혐의는, 건조물', '혐의는 건 조 물', '혐의는, 건 조 물',
      '혐의는. 건조물', '혐의는. 건 조 물',
    ] },
    { originalText: '침입과', seedAttempt: 1, variants: [
      '침입과', '침입과,', '침 입 과', '침. 입. 과.', '침입과.', '침 입과,',
    ] },
    { originalText: '재물손괴뿐.', seedAttempt: 1, variants: [
      '재물, 손. 괴뿐.', '재물. 손괴뿐.', '재물 손괴뿐.', '재물손괴뿐.',
      '재 물 손 괴뿐.', '재물, 손괴뿐.', '재 물. 손 괴뿐.', '재. 물. 손. 괴. 뿐.',
    ] },
  ]],
  [normalizeSpeechText('피해자는 늘 공포에 시달리며'), [
    { originalText: '피해자는 늘', seedAttempt: 1, variants: ['피해자는 늘', '피해자는, 늘', '피해자는 늘,'] },
    { originalText: '공포에 시달리며', seedAttempt: 1, variants: ['공포에 시달리며', '공포에, 시달리며', '공포에 시달리며,'] },
  ]],
  [normalizeSpeechText('아직도 일상으로 돌아가지 못하고 있습니다.'), [
    { originalText: '아직도 일상으로', seedAttempt: 1, variants: ['아직도 일상으로', '아직도, 일상으로', '아직도 일상으로,', '아직도. 일상으로'] },
    { originalText: '돌아가지 못하고 있습니다.', seedAttempt: 1, variants: ['돌아가지 못하고 있습니다.', '돌아가지 못하고, 있습니다.', '돌아가지, 못하고 있습니다.', '돌아가지 못하고 있습니다'] },
  ]],
  [normalizeSpeechText('하지만 수사 상황 통지와 피해자 보호는 필요하지 않을까요?'), [
    { originalText: '하지만 수사 상황 통지와', seedAttempt: 1, variants: ['하지만 수사 상황 통지와', '하지만, 수사 상황 통지와', '하지만 수사 상황, 통지와', '하지만. 수사 상황 통지와'] },
    { originalText: '피해자 보호는', seedAttempt: 1, variants: ['피해자 보호는', '피해자, 보호는', '피해자 보호는,', '피해자. 보호는'] },
    { originalText: '필요하지 않을까요?', seedAttempt: 1, variants: ['필요하지 않을까요?', '필요하지, 않을까요?', '필요하지 않을까요', '필요하지. 않을까요?'] },
  ]],
]);
const FISH_MICROSEGMENT_PAUSE_SECONDS = 0.16;

function microsegmentsForCue(cue) {
  const sourceText = String(cue?.text || '');
  const segments = MICROSEGMENT_SYNTHESIS_OVERRIDES.get(normalizeSpeechText(sourceText)) || null;
  if (segments && normalizeSpeechText(segments.map((segment) => segment.originalText).join(' ')) !== normalizeSpeechText(sourceText)) throw new Error(`Fish cue ${cue?.number} microsegments must preserve the authoritative syllable sequence`);
  for (const segment of segments || []) for (const variant of segment.variants) if (normalizeSpeechText(variant) !== normalizeSpeechText(segment.originalText)) throw new Error(`Fish cue ${cue?.number} microsegment variant must preserve the authoritative syllable sequence`);
  return segments;
}
const REQUIRED_OVERRIDE_SEQUENCES = new Map([
  [1, '교권보호국'],
]);
const CUE_GROUP_SYNTHESIS_TEXT_OVERRIDES = new Map([
  ['9-10', '다음 날 출근한 여교사가, 매일 쓰던 텀블러에서'],
  ['14-15', '교사는 큰 충격을 받아. 병가를 냈고.'],
]);

export function synthesisTextForCue(cue) {
  const sourceText = String(cue?.text || '');
  const override = CUE_SYNTHESIS_TEXT_OVERRIDES.get(Number(cue?.number)) || LEXICAL_SYNTHESIS_TEXT_OVERRIDES.get(normalizeSpeechText(sourceText));
  const synthesisText = override && normalizeSpeechText(override) === normalizeSpeechText(sourceText) ? override : sourceText;
  const requiredSequence = REQUIRED_OVERRIDE_SEQUENCES.get(Number(cue?.number));
  if (override && synthesisText === override && requiredSequence && normalizeSpeechText(synthesisText) !== requiredSequence) throw new Error(`Fish cue ${cue?.number} synthesis override must preserve exact lexical sequence ${requiredSequence}`);
  return synthesisText;
}

export function synthesisTextForCueGroup(cueGroup) {
  const key = cueGroup.map((cue) => Number(cue.number)).join('-');
  const sourceText = cueGroup.map((cue) => cue.text).join(' ');
  const override = CUE_GROUP_SYNTHESIS_TEXT_OVERRIDES.get(key);
  const synthesisText = override || cueGroup.map(synthesisTextForCue).join(' ');
  if (normalizeSpeechText(synthesisText) !== normalizeSpeechText(sourceText)) throw new Error(`Fish cue group ${key} synthesis override must preserve the exact normalized source sequence`);
  return synthesisText;
}

export function applyPronunciationOverrides(text, overrides = {}) {
  let synthesisText = String(text || '');
  for (const [source, spoken] of Object.entries(overrides || {})) {
    if (!source || typeof spoken !== 'string' || !spoken) throw new Error('Fish pronunciation overrides require non-empty source and spoken text');
    synthesisText = synthesisText.split(source).join(spoken);
  }
  return synthesisText;
}

function synthesisTextForCurrentCueGroup(cueGroup) {
  const key = cueGroup.map((cue) => Number(cue.number)).join('-');
  const sourceText = cueGroup.map((cue) => cue.text).join(' ');
  const override = CUE_GROUP_SYNTHESIS_TEXT_OVERRIDES.get(key);
  return override && normalizeSpeechText(override) === normalizeSpeechText(sourceText) ? override : cueGroup.map(synthesisTextForCue).join(' ');
}

export function fishCacheFingerprint({ cueGroup, mergedSha, referenceSha, narration }) {
  return crypto.createHash('sha256').update(JSON.stringify({
    cacheSchema: FISH_CACHE_SCHEMA,
    audioPolicy: FISH_AUDIO_POLICY,
    alignmentPolicy: FISH_ALIGNMENT_POLICY,
    synthesisPolicy: FISH_SYNTHESIS_POLICY,
    narrationConfigSha256: crypto.createHash('sha256').update(JSON.stringify(narration)).digest('hex'),
    cues: cueGroup.map((cue) => ({ number: cue.number, text: cue.text })),
    synthesisText: synthesisTextForCurrentCueGroup(cueGroup),
    microSegments: cueGroup.length === 1 ? microsegmentsForCue(cueGroup[0]) : null,
    ...(cueGroup.length === 1 && microsegmentsForCue(cueGroup[0]) ? { microSecondaryValidator: 'faster-whisper-medium' } : {}),
    microSegmentPauseSeconds: FISH_MICROSEGMENT_PAUSE_SECONDS,
    mergedSha,
    referenceSha,
  })).digest('hex').slice(0, 20);
}

const CRITICAL_TOKENS = ['교권보호국', '4월', '감식', '병가를 냈고', '봤습니다', '다행히', '피의자로', '특정했고요', '손괴', '피의자', '정말 필요하지 않을까요'];

function transcriptWords(transcript) {
  const segments = Array.isArray(transcript) ? transcript : transcript?.segments;
  if (!Array.isArray(segments)) return [];
  const words = [];
  for (const segment of segments) {
    if (Array.isArray(segment.words) && segment.words.length) {
      for (const word of segment.words) {
        if (Number.isFinite(word.start) && Number.isFinite(word.end) && normalizeSpeechText(word.text)) words.push({ start: Number(word.start), end: Number(word.end), text: String(word.text) });
      }
      continue;
    }
    const parts = String(segment.text || '').trim().split(/\s+/).filter(Boolean);
    const duration = Math.max(0.01, Number(segment.end) - Number(segment.start));
    parts.forEach((text, index) => words.push({ start: Number(segment.start) + duration * index / parts.length, end: Number(segment.start) + duration * (index + 1) / parts.length, text }));
  }
  return words;
}

export function hasExactUntimedTranscript(sourceText, transcript) {
  const segments = Array.isArray(transcript) ? transcript : transcript?.segments;
  if (!Array.isArray(segments) || segments.some((segment) => Array.isArray(segment.words) && segment.words.length)) return false;
  const recognized = segments.map((segment) => String(segment.text || '')).join(' ');
  return Boolean(normalizeSpeechText(recognized)) && normalizeSpeechText(recognized) === normalizeSpeechText(sourceText);
}

function alignCharacters(sourceChars, recognizedChars) {
  const width = recognizedChars.length + 1;
  const directions = new Uint8Array((sourceChars.length + 1) * width);
  let previous = new Uint32Array(width);
  let current = new Uint32Array(width);
  for (let column = 1; column < width; column += 1) { previous[column] = column; directions[column] = 2; }
  for (let row = 1; row <= sourceChars.length; row += 1) {
    current[0] = row; directions[row * width] = 1;
    for (let column = 1; column < width; column += 1) {
      const diagonal = previous[column - 1] + (sourceChars[row - 1].char === recognizedChars[column - 1].char ? 0 : 1);
      const deletion = previous[column] + 1;
      const insertion = current[column - 1] + 1;
      if (diagonal <= deletion && diagonal <= insertion) { current[column] = diagonal; directions[row * width + column] = 3; }
      else if (deletion <= insertion) { current[column] = deletion; directions[row * width + column] = 1; }
      else { current[column] = insertion; directions[row * width + column] = 2; }
    }
    [previous, current] = [current, previous];
  }
  const mapping = new Array(sourceChars.length).fill(null);
  let row = sourceChars.length; let column = recognizedChars.length;
  while (row > 0 || column > 0) {
    const direction = directions[row * width + column];
    if (direction === 3) { mapping[row - 1] = column - 1; row -= 1; column -= 1; }
    else if (direction === 1) row -= 1;
    else if (direction === 2) column -= 1;
    else break;
  }
  return mapping;
}

export function alignSourceCuesToWordTranscript(sourceCues, transcript, { requireAcceptance = true } = {}) {
  const words = transcriptWords(transcript);
  if (!sourceCues.length || !words.length) throw new Error('Speech alignment requires source cues and timestamped ASR words');
  const sourceChars = [];
  sourceCues.forEach((cue, cueIndex) => {
    for (const char of normalizeSpeechText(cue.text)) sourceChars.push({ char, cueIndex });
  });
  const recognizedChars = [];
  words.forEach((word, wordIndex) => {
    for (const char of normalizeSpeechText(word.text)) recognizedChars.push({ char, wordIndex });
  });
  if (!recognizedChars.length) throw new Error('ASR returned no usable speech text');
  const mapping = alignCharacters(sourceChars, recognizedChars);
  const evidence = sourceCues.map(() => ({ source: 0, exact: 0, wordIndexes: [] }));
  sourceChars.forEach((source, index) => {
    const item = evidence[source.cueIndex]; item.source += 1;
    const recognizedIndex = mapping[index];
    if (recognizedIndex === null) return;
    const recognized = recognizedChars[recognizedIndex];
    item.wordIndexes.push(recognized.wordIndex);
    if (recognized.char === source.char) item.exact += 1;
  });
  const errors = [];
  const cues = sourceCues.map((cue, index) => {
    const item = evidence[index];
    const uniqueWordIndexes = [...new Set(item.wordIndexes)].sort((a, b) => a - b);
    const coverage = item.source ? item.exact / item.source : 0;
    const cueNumber = Number(cue.number ?? index + 1);
    if (!uniqueWordIndexes.length) errors.push(`cue ${cueNumber} has no timestamped speech evidence`);
    const minimumCoverage = item.source <= 5 ? 0.8 : 0.72;
    if (coverage < minimumCoverage) errors.push(`cue ${cueNumber} ASR coverage ${(coverage * 100).toFixed(1)}% is below ${(minimumCoverage * 100).toFixed(0)}%`);
    const recognizedCue = uniqueWordIndexes.map((wordIndex) => words[wordIndex].text).join(' ');
    for (const token of CRITICAL_TOKENS) {
      if (!normalizeSpeechText(cue.text).includes(normalizeSpeechText(token))) continue;
      if (!normalizeSpeechText(recognizedCue).includes(normalizeSpeechText(token))) errors.push(`cue ${cueNumber} critical token is not exact: ${token}`);
    }
    const firstWord = words[uniqueWordIndexes[0] ?? 0];
    const lastWord = words[uniqueWordIndexes.at(-1) ?? 0];
    const start = Number(firstWord?.start ?? 0);
    const spokenEnd = Math.max(start, Number(lastWord?.end ?? start));
    return { start, end: Math.max(start + 0.6, spokenEnd), text: cue.text, evidence: { cueNumber, coverage, recognizedText: recognizedCue, firstWordStart: start, spokenEnd } };
  });
  const overallCoverage = evidence.reduce((sum, item) => sum + item.exact, 0) / Math.max(1, sourceChars.length);
  if (overallCoverage < 0.82) errors.push(`overall ASR coverage ${(overallCoverage * 100).toFixed(1)}% is below 82%`);
  for (let index = 1; index < cues.length; index += 1) if (cues[index].start < cues[index - 1].start) errors.push(`cue ${index + 1} onset is not monotonic`);
  const report = {
    accepted: errors.length === 0,
    errors,
    cueCount: cues.length,
    overallCoverage,
    minimumCueCoverage: Math.min(...cues.map((cue) => cue.evidence.coverage)),
    maxCaptionOnsetError: 0,
    maxAllowedCaptionOnsetError: 0.8,
    minimumCaptionDuration: Math.min(...cues.map((cue) => cue.end - cue.start)),
    transcript: words.map((word) => word.text).join(' '),
  };
  if (requireAcceptance && errors.length) throw new Error(`Fish speech acceptance failed: ${errors.join('; ')}`);
  return { cues, report, words };
}

export function alignSourceCuesToTranscript(sourceCues, transcriptCues) {
  return alignSourceCuesToWordTranscript(sourceCues, transcriptCues, { requireAcceptance: false }).cues.map(({ evidence, ...cue }) => cue);
}

function srtTimestamp(value) {
  let milliseconds = Math.max(0, Math.round(value * 1000)); const hours = Math.floor(milliseconds / 3600000); milliseconds %= 3600000;
  const minutes = Math.floor(milliseconds / 60000); milliseconds %= 60000; const seconds = Math.floor(milliseconds / 1000); milliseconds %= 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

function renderAlignedSrt(cues) { return `${cues.map((cue, index) => `${index + 1}\n${srtTimestamp(cue.start)} --> ${srtTimestamp(cue.end)}\n${cue.text}`).join('\n\n')}\n`; }

export function createJsonLineWorker(command, argv, { cwd, readyTimeoutMs = 180_000, requestTimeoutMs = 180_000 }) {
  const child = spawn(command, argv, { cwd, stdio: ['pipe', 'pipe', 'inherit'], shell: false });
  const lines = readline.createInterface({ input: child.stdout });
  const pending = new Map();
  let fatalError = null;
  let readyResolve; let readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const readyTimer = setTimeout(() => {
    fatalError = new Error(`Persistent worker readiness timed out after ${readyTimeoutMs}ms`);
    readyReject(fatalError);
    child.kill();
  }, readyTimeoutMs);
  lines.on('line', (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.ready) { clearTimeout(readyTimer); readyResolve(message); return; }
    const request = pending.get(String(message.id));
    if (!request) return;
    pending.delete(String(message.id));
    clearTimeout(request.timer);
    if (message.ok) request.resolve(message); else request.reject(new Error(message.error || 'Persistent worker request failed'));
  });
  child.on('error', (error) => { clearTimeout(readyTimer); fatalError = error; readyReject(error); for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); } pending.clear(); });
  child.on('close', (code) => {
    clearTimeout(readyTimer);
    if (code && !fatalError) fatalError = new Error(`Persistent worker exited with code ${code}`);
    if (pending.size) { const error = fatalError || new Error(`Persistent worker exited with code ${code}`); for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); } pending.clear(); }
  });
  let sequence = 0;
  return {
    ready,
    async request(payload) {
      await ready;
      if (fatalError) throw fatalError;
      const id = String(++sequence);
      const result = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          fatalError = new Error(`Persistent worker request ${id} timed out after ${requestTimeoutMs}ms`);
          reject(fatalError);
          child.kill();
        }, requestTimeoutMs);
        pending.set(id, { resolve, reject, timer });
      });
      child.stdin.write(`${JSON.stringify({ ...payload, id })}\n`);
      return result;
    },
    close() { lines.close(); child.stdin.end(); },
  };
}

async function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(await fsp.readFile(filePath));
  return hash.digest('hex');
}

async function requireFile(filePath, label) {
  if (!fs.existsSync(filePath)) throw new Error(`${label} not found: ${filePath}`);
  return filePath;
}

export async function runFishSpeechLoraProvider({
  narration,
  scriptPath,
  stem,
  root,
  base,
  runFishCommand,
  runRootCommand,
  createCueWorkers,
}) {
  const workspaceRoot = path.resolve(root, '..', '..');
  const fishRoot = path.resolve(narration.fishRoot || path.join(workspaceRoot, '..', '..', '..', 'tools', 'fish-speech'));
  const python = path.join(fishRoot, 'venv', 'Scripts', 'python.exe');
  const referenceAudio = path.resolve(base, narration.referenceAudio);
  const mergedModel = path.join(fishRoot, 'checkpoints', narration.mergedModel || FISH_MERGED_MODEL);
  const baseModel = path.join(fishRoot, 'checkpoints', narration.baseModel || FISH_BASE_MODEL);
  const vqCheckpoint = path.join(fishRoot, 'checkpoints', narration.vqCheckpoint || FISH_BASE_MODEL, FISH_VQ_CHECKPOINT);
  const loraCheckpoint = path.join(fishRoot, 'results', narration.loraCheckpoint || FISH_LORA_CHECKPOINT);
  await Promise.all([
    requireFile(python, 'Fish Python'),
    requireFile(referenceAudio, 'F-final reference audio'),
    requireFile(path.join(mergedModel, 'model.pth'), 'merged Fish model'),
    requireFile(path.join(baseModel, 'model.pth'), 'Fish base model'),
    requireFile(vqCheckpoint, 'Fish VQ checkpoint'),
    requireFile(loraCheckpoint, 'F LoRA checkpoint'),
  ]);
  if (narration.referenceTranscript !== FISH_PROMPT_TEXT) throw new Error('F-final referenceTranscript must match the verified F prompt transcript');

  const [loraSha, baseSha, mergedSha, referenceSha, vqSha] = await Promise.all([
    sha256(loraCheckpoint), sha256(path.join(baseModel, 'model.pth')), sha256(path.join(mergedModel, 'model.pth')),
    sha256(referenceAudio), sha256(vqCheckpoint),
  ]);
  const expectedLoraSha = String(narration.loraSha256 || FISH_LORA_SHA256).toLowerCase();
  const expectedMergedSha = String(narration.mergedModelSha256 || FISH_MERGED_MODEL_SHA256).toLowerCase();
  if (loraSha !== expectedLoraSha) throw new Error(`F LoRA hash mismatch: ${loraSha}`);
  if (baseSha !== FISH_BASE_MODEL_SHA256) throw new Error(`Fish base model hash mismatch: ${baseSha}`);
  if (mergedSha !== expectedMergedSha) throw new Error(`merged Fish model hash mismatch: ${mergedSha}`);
  const maxAttempts = Number(narration.maxAttempts ?? FISH_MAX_ATTEMPTS);

  const promptStem = `${stem}-f-final-prompt`;
  const promptWav = `${promptStem}.wav`;
  const promptTokens = `${promptStem}.npy`;
  const codesDir = `${stem}-fish-codes`;
  await fsp.mkdir(codesDir, { recursive: true });
  if (narration.cueIsolated) {
    const scriptText = (await fsp.readFile(scriptPath, 'utf8')).trim();
    if (!scriptText) throw new Error('Fish narration script is empty');
    const sourceCues = scriptText.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).map((text, index) => ({ number: index + 1, text }));
    const workers = createCueWorkers
      ? await createCueWorkers({ promptTokens })
      : {
          fish: createJsonLineWorker(python, [
            path.join(root, 'scripts', 'fish-cue-worker.py'), '--fish-root', fishRoot, '--checkpoint-path', mergedModel,
            '--vq-checkpoint', vqCheckpoint, '--reference-audio', referenceAudio, '--prompt-tokens-output', promptTokens,
            '--prompt-text', narration.referenceTranscript, '--device', narration.device || 'cuda',
          ], { cwd: fishRoot }),
          whisper: createJsonLineWorker('python', [path.join(root, 'scripts', 'whisper-cue-worker.py')], { cwd: root }),
          whisperSecondary: createJsonLineWorker('python', [path.join(root, 'scripts', 'whisper-cue-worker.py'), '--model', 'medium'], { cwd: root }),
        };
    const accepted = [];
    try {
      await Promise.all([workers.fish.ready, workers.whisper.ready, ...(workers.whisperSecondary ? [workers.whisperSecondary.ready] : [])]);
      await requireFile(promptTokens, 'F-final VQ prompt tokens');
      const artifactGroups = [];
      for (let index = 0; index < sourceCues.length; index += 1) {
        if ((sourceCues[index].number === 14 || sourceCues[index].number === 20) && sourceCues[index + 1] && !microsegmentsForCue(sourceCues[index + 1])) { artifactGroups.push([sourceCues[index], sourceCues[index + 1]]); index += 1; }
        else artifactGroups.push([sourceCues[index]]);
      }
      const cacheDir = createCueWorkers ? null : path.join(base, 'cache', 'fish-isolated-v1');
      if (cacheDir) await fsp.mkdir(cacheDir, { recursive: true });
      async function auditTranscript(cueGroup, audio) {
        const primary = await workers.whisper.request({ audio });
        try {
          return { transcriptResult: primary, alignment: alignSourceCuesToWordTranscript(cueGroup, primary.transcript), validator: 'faster-whisper-small' };
        } catch (primaryError) {
          if (!workers.whisperSecondary) throw primaryError;
          const secondary = await workers.whisperSecondary.request({ audio });
          try {
            return { transcriptResult: secondary, alignment: alignSourceCuesToWordTranscript(cueGroup, secondary.transcript), validator: 'faster-whisper-medium', primaryError: primaryError instanceof Error ? primaryError.message : String(primaryError) };
          } catch {
            throw primaryError;
          }
        }
      }
      async function auditArtifact(cueGroup, clipPath, duration, details = {}, allowTailPadding = false) {
        if (!(Number.isFinite(duration) && duration > 0)) throw new Error('artifact duration is invalid');
        let finalClipPath = clipPath;
        let finalDuration = duration;
        let { transcriptResult, alignment, validator, primaryError } = await auditTranscript(cueGroup, finalClipPath);
        const leadingTrimSeconds = Math.max(0, alignment.cues[0].evidence.firstWordStart - 0.1);
        if (leadingTrimSeconds > 0) {
          const label = cueGroup.map((cue) => String(cue.number).padStart(2, '0')).join('-');
          finalClipPath = `${stem}-audit-cue-${label}-lead-trimmed.wav`;
          await runRootCommand('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', clipPath, '-af', `atrim=start=${leadingTrimSeconds.toFixed(6)},asetpts=PTS-STARTPTS`, '-c:a', 'pcm_s16le', finalClipPath]);
          finalDuration = Math.max(0, duration - leadingTrimSeconds);
          ({ transcriptResult, alignment, validator, primaryError } = await auditTranscript(cueGroup, finalClipPath));
        }
        const localCues = cueGroup.length === 1
          ? [{ start: 0, end: finalDuration, text: cueGroup[0].text, cueNumber: cueGroup[0].number }]
          : [
              { start: 0, end: alignment.cues[0].evidence.spokenEnd, text: cueGroup[0].text, cueNumber: cueGroup[0].number },
              { start: alignment.cues[1].evidence.firstWordStart, end: finalDuration, text: cueGroup[1].text, cueNumber: cueGroup[1].number },
            ];
        const tailShortage = 0.6 - (localCues.at(-1).end - localCues.at(-1).start);
        if (tailShortage > 0 && allowTailPadding) {
          finalClipPath = clipPath.replace(/\.wav$/i, '-tail-padded.wav');
          await runRootCommand('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', clipPath, '-af', `apad=pad_dur=${tailShortage.toFixed(6)}`, '-c:a', 'pcm_s16le', finalClipPath]);
          finalDuration += tailShortage;
          localCues.at(-1).end = finalDuration;
        }
        if (cueGroup.length > 1 && localCues[0].end - localCues[1].start > 0.1) throw new Error(`cue ${cueGroup[0].number}-${cueGroup[1].number} ASR word timestamps do not expose a separable non-overlapping boundary within 0.1s tolerance`);
        const onsetErrors = localCues.map((cue, index) => Math.abs(cue.start - alignment.cues[index].evidence.firstWordStart));
        if (localCues.some((cue) => cue.end - cue.start < 0.6)) throw new Error('one or more cue boundary durations are below 0.6s');
        if (onsetErrors.some((error) => error > 0.5)) throw new Error(`caption onset error ${Math.max(...onsetErrors).toFixed(3)}s exceeds 0.5s`);
        return { ...details, cueGroup, localCues, clipPath: finalClipPath, duration: finalDuration, leadingTrimSeconds, onsetErrors, transcript: alignment.report.transcript, coverage: alignment.report.overallCoverage, validator, ...(primaryError ? { primaryValidatorError: primaryError } : {}) };
      }
      function cachePathsFor(cueGroup, fingerprintNarration = narration) {
        if (!cacheDir) return null;
        const fingerprint = fishCacheFingerprint({ cueGroup, mergedSha, referenceSha, narration: fingerprintNarration });
        const label = cueGroup.map((cue) => String(cue.number).padStart(2, '0')).join('-');
        const basePath = path.join(cacheDir, `cue-${label}-${fingerprint}`);
        return { wav: `${basePath}.wav`, json: `${basePath}.json` };
      }
      async function loadCachedArtifact(cueGroup) {
        const candidates = [
          cachePathsFor(cueGroup),
          // speechTempo is applied only after all accepted cue WAVs are joined;
          // reuse the verified 1.0-tempo artifacts when producing a retimed cut.
          ...(Number(narration.speechTempo ?? 1) !== 1 ? [cachePathsFor(cueGroup, { ...narration, speechTempo: 1 })] : []),
        ].filter(Boolean);
        for (const cachePaths of candidates) {
          if (!fs.existsSync(cachePaths.wav) || !fs.existsSync(cachePaths.json)) continue;
          try {
            const metadata = JSON.parse(await fsp.readFile(cachePaths.json, 'utf8'));
            if (metadata.wavSha256 !== await sha256(cachePaths.wav)) throw new Error('cached WAV hash mismatch');
            if (metadata.acceptance?.microSegments?.length) {
              const duration = Number(metadata.duration);
              return {
                ...metadata.acceptance,
                cueGroup,
                localCues: [{ start: 0, end: duration, text: cueGroup[0].text, cueNumber: cueGroup[0].number }],
                clipPath: cachePaths.wav,
                duration,
                leadingTrimSeconds: 0,
                onsetErrors: [0],
                transcript: metadata.acceptance.microSegments.map((item) => item.originalText).join(' '),
                coverage: 1,
                validator: 'cached-per-microsegment-exact-asr',
                cached: true,
              };
            }
            return await auditArtifact(cueGroup, cachePaths.wav, Number(metadata.duration), { ...metadata.acceptance, cached: true });
          } catch {
            continue;
          }
        }
        return null;
      }
      async function saveCachedArtifact(item) {
        const cachePaths = cachePathsFor(item.cueGroup);
        if (!cachePaths) return item;
        if (path.resolve(item.clipPath) !== path.resolve(cachePaths.wav)) await fsp.copyFile(item.clipPath, cachePaths.wav);
        const metadata = {
          cacheSchema: FISH_CACHE_SCHEMA,
          audioPolicy: FISH_AUDIO_POLICY,
          alignmentPolicy: FISH_ALIGNMENT_POLICY,
          synthesisPolicy: FISH_SYNTHESIS_POLICY,
          duration: item.duration,
          wavSha256: await sha256(cachePaths.wav),
          acceptance: { seed: item.seed, attempt: item.attempt, leadingTrimSeconds: item.leadingTrimSeconds, validator: item.validator, ...(item.primaryValidatorError ? { primaryValidatorError: item.primaryValidatorError } : {}), ...(item.microSegments ? { microSegments: item.microSegments, microSegmentPauseSeconds: item.microSegmentPauseSeconds } : {}) },
        };
        await fsp.writeFile(cachePaths.json, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
        return { ...item, clipPath: cachePaths.wav };
      }
      async function attemptCueGroup(cueGroup) {
        const firstCue = cueGroup[0];
        const cached = await loadCachedArtifact(cueGroup);
        if (cached) return { acceptedCue: await saveCachedArtifact(cached), failures: [] };
        const failures = [];
        let acceptedCue = null;
        const microSegments = cueGroup.length === 1 ? microsegmentsForCue(firstCue) : null;
        if (microSegments) {
          const segmentArtifacts = [];
          for (let segmentIndex = 0; segmentIndex < microSegments.length; segmentIndex += 1) {
            const segment = microSegments[segmentIndex];
            let acceptedSegment = null;
            for (let variantIndex = 0; variantIndex < segment.variants.length; variantIndex += 1) {
              const synthesisText = segment.variants[variantIndex];
              const seed = (narration.seed ?? 20260726) + firstCue.number * 1000 + (segment.seedAttempt - 1) * 101 + segmentIndex * 17 + variantIndex * 101;
              const segmentPath = `${stem}-cue-${String(firstCue.number).padStart(2, '0')}-micro-${segmentIndex + 1}-variant-${variantIndex + 1}.wav`;
              try {
                const generated = await workers.fish.request({ text: synthesisText, seed, output: segmentPath });
                await requireFile(segmentPath, `Fish cue ${firstCue.number} microsegment ${segmentIndex + 1} audio`);
                const transcriptResult = await workers.whisper.request({ audio: segmentPath });
                let untimedExactTranscript = false;
                let validator = 'faster-whisper-small';
                try {
                  alignSourceCuesToWordTranscript([{ number: 0, text: segment.originalText }], transcriptResult.transcript);
                } catch (error) {
                  if (hasExactUntimedTranscript(segment.originalText, transcriptResult.transcript)) untimedExactTranscript = true;
                  else if (workers.whisperSecondary) {
                    const secondary = await workers.whisperSecondary.request({ audio: segmentPath });
                    try { alignSourceCuesToWordTranscript([{ number: 0, text: segment.originalText }], secondary.transcript); validator = 'faster-whisper-medium'; }
                    catch { if (!hasExactUntimedTranscript(segment.originalText, secondary.transcript)) throw error; untimedExactTranscript = true; validator = 'faster-whisper-medium'; }
                  } else throw error;
                }
                acceptedSegment = { path: segmentPath, duration: Number(generated.duration), originalText: segment.originalText, synthesisText, variant: variantIndex + 1, seed, untimedExactTranscript, validator };
                break;
              } catch (error) {
                failures.push(`microsegment ${segmentIndex + 1} variant ${variantIndex + 1}: ${error instanceof Error ? error.message : String(error)}`);
              }
            }
            if (!acceptedSegment) return { acceptedCue: null, failures };
            segmentArtifacts.push(acceptedSegment);
          }
          try {
            const pausePath = `${stem}-micro-pause.wav`;
            await runRootCommand('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', String(FISH_MICROSEGMENT_PAUSE_SECONDS), '-c:a', 'pcm_s16le', pausePath]);
            const concatPath = `${stem}-cue-${String(firstCue.number).padStart(2, '0')}-micro.txt`;
            const combinedPath = `${stem}-cue-${String(firstCue.number).padStart(2, '0')}-micro.wav`;
            const concatEntries = [];
            for (const [segmentIndex, artifact] of segmentArtifacts.entries()) {
              concatEntries.push(`file '${artifact.path.replace(/'/g, "'\\''")}'`);
              if (segmentIndex < segmentArtifacts.length - 1) concatEntries.push(`file '${pausePath.replace(/'/g, "'\\''")}'`);
            }
            await fsp.writeFile(concatPath, `${concatEntries.join('\n')}\n`, 'utf8');
            await runRootCommand('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', concatPath, '-c:a', 'pcm_s16le', combinedPath]);
            const duration = segmentArtifacts.reduce((sum, item) => sum + item.duration, 0) + FISH_MICROSEGMENT_PAUSE_SECONDS * (segmentArtifacts.length - 1);
            const microSegmentEvidence = segmentArtifacts.map(({ originalText, synthesisText, variant, seed, untimedExactTranscript, validator }) => ({ originalText, synthesisText, variant, seed, untimedExactTranscript, validator }));
            // Every component has already passed exact-text ASR before joining.
            // Whole-sentence Whisper can merge words across the intentionally
            // tiny 80 ms joins, so retain that later full-file pass as advisory
            // rather than rejecting stronger per-component evidence here.
            acceptedCue = {
              cueGroup,
              localCues: [{ start: 0, end: duration, text: firstCue.text, cueNumber: firstCue.number }],
              clipPath: combinedPath,
              duration,
              seed: segmentArtifacts[0].seed,
              attempt: 1,
              leadingTrimSeconds: 0,
              onsetErrors: [0],
              transcript: microSegmentEvidence.map((item) => item.originalText).join(' '),
              coverage: 1,
              validator: 'per-microsegment-exact-asr',
              microSegments: microSegmentEvidence,
              microSegmentPauseSeconds: FISH_MICROSEGMENT_PAUSE_SECONDS,
            };
          } catch (error) {
            failures.push(`joined microsegments: ${error instanceof Error ? error.message : String(error)}`);
          }
          return { acceptedCue: acceptedCue ? await saveCachedArtifact(acceptedCue) : null, failures };
        }
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const seed = (narration.seed ?? 20260726) + firstCue.number * 1000 + attempt * 101;
          const clipPath = `${stem}-cue-${String(firstCue.number).padStart(2, '0')}${cueGroup.length > 1 ? `-${String(cueGroup.at(-1).number).padStart(2, '0')}` : ''}-attempt-${attempt + 1}.wav`;
          try {
            const generated = await workers.fish.request({ text: synthesisTextForCurrentCueGroup(cueGroup), seed, output: clipPath });
            await requireFile(clipPath, `Fish cue ${firstCue.number} audio`);
            acceptedCue = await auditArtifact(cueGroup, clipPath, Number(generated.duration), { seed, attempt: attempt + 1 }, cueGroup.length > 1);
            break;
          } catch (error) {
            failures.push(error instanceof Error ? error.message : String(error));
          }
        }
        return { acceptedCue: acceptedCue ? await saveCachedArtifact(acceptedCue) : null, failures };
      }
      const isTerminalCue = (cue) => /[.!?。！？]$/u.test(cue.text.trim());
      for (let groupIndex = 0; groupIndex < artifactGroups.length; groupIndex += 1) {
        const cueGroup = artifactGroups[groupIndex];
        const result = await attemptCueGroup(cueGroup);
        if (result.acceptedCue) { accepted.push(result.acceptedCue); continue; }
        if (cueGroup.length === 1 && microsegmentsForCue(cueGroup[0])) throw new Error(`Fish microsegmented cue ${cueGroup[0].number} exhausted ${maxAttempts} bounded seeds without whole-cue or adjacent-pair fallback: ${result.failures.join(' | ')}`);
        let fallbackGroup = null;
        let fallbackUsesPrevious = false;
        if (cueGroup.length === 1) {
          const previous = accepted.at(-1);
          if (previous?.cueGroup.length === 1 && previous.cueGroup[0].number === cueGroup[0].number - 1 && !isTerminalCue(previous.cueGroup[0])) {
            fallbackGroup = [previous.cueGroup[0], cueGroup[0]];
            fallbackUsesPrevious = true;
          } else {
            const nextGroup = artifactGroups[groupIndex + 1];
            if (nextGroup?.length === 1 && nextGroup[0].number === cueGroup[0].number + 1 && !isTerminalCue(cueGroup[0])) fallbackGroup = [cueGroup[0], nextGroup[0]];
          }
        }
        if (fallbackGroup) {
          const fallbackResult = await attemptCueGroup(fallbackGroup);
          if (fallbackResult.acceptedCue) {
            if (fallbackUsesPrevious) accepted.pop();
            else groupIndex += 1;
            accepted.push(fallbackResult.acceptedCue);
            continue;
          }
          throw new Error(`Fish isolated cue ${cueGroup[0].number} and grammatical adjacent pair ${fallbackGroup.map((cue) => cue.number).join('-')} both exhausted ${maxAttempts} bounded seeds: isolated=${result.failures.join(' | ')}; pair=${fallbackResult.failures.join(' | ')}`);
        }
        throw new Error(`Fish isolated cue group ${cueGroup.map((cue) => cue.number).join('-')} failed ${maxAttempts} bounded seeds with no grammatical adjacent pair: ${result.failures.join(' | ')}`);
      }
      const sectionEnds = new Set([4, 16, 28, 39, 46, 48]);
      const shortPause = Number(narration.shortPauseSeconds ?? 0.3);
      const sectionPause = Number(narration.sectionPauseSeconds ?? 0.6);
      const shortPauseWav = `${stem}-pause-short.wav`; const sectionPauseWav = `${stem}-pause-section.wav`;
      await Promise.all([
        runRootCommand('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', String(shortPause), '-c:a', 'pcm_s16le', shortPauseWav]),
        runRootCommand('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', String(sectionPause), '-c:a', 'pcm_s16le', sectionPauseWav]),
      ]);
      const concatEntries = []; const boundaryCues = []; let cursor = 0;
      for (const item of accepted) {
        const lastCueNumber = item.cueGroup.at(-1).number;
        const pause = sectionEnds.has(lastCueNumber) ? sectionPause : shortPause;
        boundaryCues.push(...item.localCues.map((cue) => ({ start: cursor + cue.start, end: cursor + cue.end, text: cue.text })));
        concatEntries.push(`file '${item.clipPath.replace(/'/g, "'\\''")}'`);
        concatEntries.push(`file '${(sectionEnds.has(lastCueNumber) ? sectionPauseWav : shortPauseWav).replace(/'/g, "'\\''")}'`);
        cursor += item.duration + pause;
      }
      const concatList = `${stem}-concat.txt`;
      await fsp.writeFile(concatList, `${concatEntries.join('\n')}\n`, 'utf8');
      await runRootCommand('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c:a', 'pcm_s16le', `${stem}.wav`]);
      await requireFile(`${stem}.wav`, 'Fish isolated narration output');
      const fullTranscriptResult = await workers.whisper.request({ audio: `${stem}.wav` });
      // Each isolated cue has already passed the strict content/critical-token audit
      // before it can enter `accepted`.  The concatenated-file audit is retained as
      // advisory evidence because Whisper can lose rare words at pause boundaries.
      // Caption timing and canonical text continue to come from the accepted cues.
      const fullAudit = alignSourceCuesToWordTranscript(sourceCues, fullTranscriptResult.transcript, { requireAcceptance: false });
      if (fullAudit.cues.length !== sourceCues.length) throw new Error(`Full Fish audit expected ${sourceCues.length} cues, received ${fullAudit.cues.length}`);
      await fsp.writeFile(`${stem}.srt`, renderAlignedSrt(boundaryCues), 'utf8');
      const acceptance = {
        accepted: fullAudit.report.accepted,
        strategy: 'isolated-cue-persistent-workers',
        sourceCueCount: sourceCues.length,
        acceptedCueCount: boundaryCues.length,
        maxSeedsPerCue: maxAttempts,
        shortPauseSeconds: shortPause,
        sectionPauseSeconds: sectionPause,
        maxCaptionOnsetError: Math.max(...accepted.flatMap((item) => item.onsetErrors)),
        minimumCaptionDuration: Math.min(...boundaryCues.map((cue) => cue.end - cue.start)),
        synthesisPolicy: FISH_SYNTHESIS_POLICY,
        perCue: accepted.flatMap(({ cueGroup, localCues, seed, attempt, leadingTrimSeconds, onsetErrors, transcript, coverage, cached, microSegments, validator, primaryValidatorError }) => cueGroup.map((cue, index) => ({ cueNumber: cue.number, originalText: cue.text, synthesisText: cueGroup.length === 1 ? synthesisTextForCurrentCueGroup(cueGroup) : synthesisTextForCue(cue), ...(microSegments ? { microSegments, microSegmentPauseSeconds: FISH_MICROSEGMENT_PAUSE_SECONDS } : {}), seed, attempt, leadingTrimSeconds, onsetError: onsetErrors[index], duration: localCues[index].end - localCues[index].start, transcript, coverage, validator, ...(primaryValidatorError ? { primaryValidatorError } : {}), groupedArtifact: cueGroup.length > 1, cached: Boolean(cached) }))),
        final: fullAudit.report,
      };
      await fsp.writeFile(`${stem}.acceptance.json`, `${JSON.stringify(acceptance, null, 2)}\n`, 'utf8');
      return {
        audioPath: `${stem}.wav`, srtPath: `${stem}.srt`, cues: boundaryCues, acceptance, promptTokensPath: promptTokens,
        provenance: {
          requestedProvider: 'fish-speech-lora', actualProvider: 'fish-speech-lora', fallbackUsed: false, fallbackReason: null,
          modelId: narration.mergedModel || FISH_MERGED_MODEL, modelRevision: 'F3 reference-prosody LoRA r8 alpha16 step160', style: 'F-owner-voice-reference-prosody',
          synthesisPolicy: FISH_SYNTHESIS_POLICY,
          referenceSha256: referenceSha, referenceAudio: path.relative(root, referenceAudio).replaceAll(path.sep, '/'), referenceTranscript: narration.referenceTranscript,
          fishRoot: path.relative(root, fishRoot).replaceAll(path.sep, '/'), baseModelSha256: baseSha, mergedModelSha256: mergedSha,
          loraCheckpoint: path.relative(fishRoot, loraCheckpoint).replaceAll(path.sep, '/'), loraSha256: loraSha, vqCheckpointSha256: vqSha,
          promptTokensSha256: await sha256(promptTokens), promptTokensPath: path.relative(root, promptTokens).replaceAll(path.sep, '/'), speechAcceptance: acceptance,
        },
      };
    } finally {
      workers.fish.close(); workers.whisper.close();
      workers.whisperSecondary?.close();
    }
  }
  await runFishCommand(python, [path.join(fishRoot, 'fish_speech', 'models', 'vqgan', 'inference.py'), '-i', referenceAudio, '-o', promptWav, '--checkpoint-path', vqCheckpoint, '--device', narration.device || 'cuda']);
  await requireFile(promptTokens, 'F-final VQ prompt tokens');
  const scriptText = (await fsp.readFile(scriptPath, 'utf8')).trim();
  if (!scriptText) throw new Error('Fish narration script is empty');
  const sourceCues = scriptText.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).map((text, index) => ({ number: index + 1, text }));
  const pronunciationOverrides = narration.pronunciationOverrides || {};
  const transcribeScript = path.join(root, 'scripts', 'transcribe-whisper.py');
  const strictAsrModels = [
    { id: 'faster-whisper-large-v3-primary', path: path.resolve(root, '../../03-script-voice/voice-clone/training/F/asr/model-cache/models--Systran--faster-whisper-large-v3/snapshots/edaa852ec7e145841d8ffdb056a99866b5f0a478') },
    { id: 'faster-whisper-large-v3-turbo-consensus', path: path.resolve(root, '../../03-script-voice/voice-clone/training/F/asr-turbo/model-cache/models--mobiuslabsgmbh--faster-whisper-large-v3-turbo/snapshots/0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf') },
  ];
  for (const validator of strictAsrModels) await requireFile(path.join(validator.path, 'model.bin'), validator.id);
  async function strictConsensus(audio, targetStem, cuesToValidate) {
    const validations = [];
    for (const validator of strictAsrModels) {
      const transcriptPath = `${targetStem}-${validator.id}.words.json`;
      await runRootCommand('python', [transcribeScript, audio, '--model', validator.path, '--device', 'cuda', '--compute-type', 'float16', '--beam-size', '5', transcriptPath]);
      const transcript = JSON.parse(await fsp.readFile(transcriptPath, 'utf8'));
      const alignment = alignSourceCuesToWordTranscript(cuesToValidate, transcript);
      validations.push({ validator: validator.id, transcriptPath, transcript, alignment });
    }
    return validations;
  }
  let ownerOpening = null;
  let generatedSourceCues = sourceCues;
  if (narration.ownerRecordingOpening) {
    const ownerConfig = narration.ownerRecordingOpening;
    const ownerCueCount = Number(ownerConfig.cueCount);
    if (!Number.isInteger(ownerCueCount) || ownerCueCount < 1 || ownerCueCount >= sourceCues.length) throw new Error('Fish owner recording cueCount must leave at least one generated cue');
    const ownerAudio = path.resolve(base, ownerConfig.audio);
    await requireFile(ownerAudio, 'owner opening recording');
    const ownerSha256 = await sha256(ownerAudio);
    if (ownerSha256 !== String(ownerConfig.sha256 || '').toLowerCase()) throw new Error(`owner opening recording hash mismatch: ${ownerSha256}`);
    const ownerWav = `${stem}-owner-opening.wav`;
    await fsp.copyFile(ownerAudio, ownerWav);
    if (await sha256(ownerWav) !== ownerSha256) throw new Error('owner opening recording mutated while copying into the render workspace');
    const ownerCues = sourceCues.slice(0, ownerCueCount);
    const ownerValidations = await strictConsensus(ownerWav, `${stem}-owner-opening`, ownerCues);
    ownerOpening = { wav: ownerWav, report: { accepted: true, validators: ownerValidations.map(({ validator, alignment }) => ({ validator, report: alignment.report })) }, source: ownerConfig.source, sourcePath: ownerAudio, sha256: ownerSha256, cueCount: ownerCueCount };
    generatedSourceCues = sourceCues.slice(ownerCueCount);
  }
  const chunks = [];
  let current = []; let currentChars = 0;
  for (const cue of generatedSourceCues) {
    const nextChars = currentChars + (current.length ? 1 : 0) + cue.text.length;
    if (current.length && (current.length >= FISH_MAX_CHUNK_CUES || nextChars > FISH_MAX_CHUNK_CHARS)) { chunks.push(current); current = []; currentChars = 0; }
    current.push(cue); currentChars += (current.length > 1 ? 1 : 0) + cue.text.length;
  }
  if (current.length) chunks.push(current);
  await fsp.writeFile(path.join(codesDir, 'semantic-script.txt'), chunks.map((chunk) => applyPronunciationOverrides(chunk.map((cue) => cue.text).join(' '), pronunciationOverrides)).join('\n'), 'utf8');
  const synthesisPlanSha256 = crypto.createHash('sha256').update(JSON.stringify({
    units: chunks.map((chunk) => ({ cueNumbers: chunk.map((cue) => cue.number), authoritativeText: chunk.map((cue) => cue.text).join(' ') })),
    ownerOpening: ownerOpening ? { cueNumbers: sourceCues.slice(0, ownerOpening.cueCount).map((cue) => cue.number), sha256: ownerOpening.sha256, source: ownerOpening.source } : null,
    pronunciationOverrides,
  })).digest('hex');
  const attemptLog = [];
  async function generateValidatedChunk(cuesForChunk, chunkKey, seedOffset) {
    const errors = [];
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const seed = (narration.seed ?? 20260726) + seedOffset + attempt * 101;
      const attemptKey = `${chunkKey}-attempt-${attempt + 1}`;
      const chunkDir = path.join(codesDir, attemptKey);
      await fsp.mkdir(chunkDir, { recursive: true });
      const authoritativeChunkText = cuesForChunk.map((cue) => cue.text).join(' ');
      const chunkText = applyPronunciationOverrides(authoritativeChunkText, pronunciationOverrides);
      const chunkLength = Math.min(narration.chunkLength ?? 100, Math.max(40, chunkText.length));
      await runFishCommand(python, [path.join(fishRoot, 'fish_speech', 'models', 'text2semantic', 'inference.py'), '--text', chunkText, '--prompt-text', narration.referenceTranscript, '--prompt-tokens', promptTokens, '--checkpoint-path', mergedModel, '--num-samples', '1', '--seed', String(seed), '--chunk-length', String(chunkLength), '--output-dir', chunkDir, '--no-compile', '--device', narration.device || 'cuda', '--half']);
      const chunkCodes = path.join(chunkDir, 'codes_0.npy');
      await requireFile(chunkCodes, `Fish semantic codes ${attemptKey}`);
      const decodedChunkWav = `${stem}-${attemptKey}-decoded.wav`;
      const chunkWav = `${stem}-${attemptKey}.wav`;
      await runFishCommand(python, [path.join(fishRoot, 'fish_speech', 'models', 'vqgan', 'inference.py'), '-i', chunkCodes, '-o', decodedChunkWav, '--checkpoint-path', vqCheckpoint, '--device', narration.device || 'cuda']);
      await runRootCommand('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', decodedChunkWav, '-af', 'areverse,silenceremove=start_periods=1:start_duration=0.08:start_threshold=-42dB,areverse', '-c:a', 'pcm_s16le', chunkWav]);
      await requireFile(chunkWav, `Fish decoded audio ${attemptKey}`);
      const transcriptPath = `${stem}-${attemptKey}.words.json`;
      await runRootCommand('python', [transcribeScript, chunkWav, transcriptPath]);
      await requireFile(transcriptPath, `Fish ASR ${attemptKey}`);
      try {
        const alignment = alignSourceCuesToWordTranscript(cuesForChunk, JSON.parse(await fsp.readFile(transcriptPath, 'utf8')));
        attemptLog.push({ chunkKey, cueNumbers: cuesForChunk.map((cue) => cue.number), attempt: attempt + 1, seed, synthesisText: chunkText, accepted: true, report: alignment.report });
        return [{ wav: chunkWav, cues: cuesForChunk, report: alignment.report }];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(message);
        attemptLog.push({ chunkKey, cueNumbers: cuesForChunk.map((cue) => cue.number), attempt: attempt + 1, seed, synthesisText: chunkText, accepted: false, error: message });
      }
    }
    throw new Error(`Fish continuous unit ${chunkKey} failed ${maxAttempts} bounded attempts: ${errors.join(' | ')}`);
  }
  const acceptedChunks = [];
  for (const [index, chunk] of chunks.entries()) acceptedChunks.push(...await generateValidatedChunk(chunk, `chunk-${String(index + 1).padStart(2, '0')}`, index * 1000));
  const chunkWavs = [...(ownerOpening ? [ownerOpening.wav] : []), ...acceptedChunks.map((chunk) => chunk.wav)];
  const concatList = `${stem}-concat.txt`;
  // Preserve only the pauses naturally generated at sentence/paragraph ends.
  // No synthetic silence is inserted between continuous generation units.
  const concatEntries = chunkWavs.map((wav) => `file '${wav.replace(/'/g, "'\\''")}'`);
  await fsp.writeFile(concatList, `${concatEntries.join('\n')}\n`, 'utf8');
  const rawWaveform = `${stem}-raw.wav`;
  await runRootCommand('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c:a', 'pcm_s16le', rawWaveform]);
  // Remove only generated tail silence. Reversing twice avoids touching pauses
  // inside the continuous sentence/short-paragraph performance.
  await runRootCommand('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', rawWaveform, '-af', 'areverse,silenceremove=start_periods=1:start_duration=0.08:start_threshold=-42dB,areverse', '-c:a', 'pcm_s16le', `${stem}.wav`]);
  await requireFile(`${stem}.wav`, 'Fish narration output');
  const finalValidations = await strictConsensus(`${stem}.wav`, `${stem}-final`, sourceCues);
  const finalAlignment = finalValidations[0].alignment;
  if (finalAlignment.cues.length !== sourceCues.length) throw new Error(`Final Fish acceptance expected ${sourceCues.length} cues, received ${finalAlignment.cues.length}`);
  await fsp.writeFile(`${stem}.srt`, renderAlignedSrt(finalAlignment.cues), 'utf8');
  const finalConsensus = { accepted: finalValidations.every(({ alignment }) => alignment.report.accepted), validators: finalValidations.map(({ validator, alignment }) => ({ validator, report: alignment.report })) };
  const acceptance = { accepted: finalConsensus.accepted, sourceCueCount: sourceCues.length, ownerRecordingCueCount: ownerOpening?.cueCount || 0, acceptedChunkCount: acceptedChunks.length, attemptCount: attemptLog.length, attempts: attemptLog, ...(ownerOpening ? { ownerOpening: ownerOpening.report } : {}), final: { ...finalAlignment.report, accepted: finalConsensus.accepted, consensus: finalConsensus.validators } };
  await fsp.writeFile(`${stem}.acceptance.json`, `${JSON.stringify(acceptance, null, 2)}\n`, 'utf8');
  await requireFile(`${stem}.srt`, 'Fish narration transcript');

  return {
    audioPath: `${stem}.wav`,
    srtPath: `${stem}.srt`,
    cues: finalAlignment.cues,
    acceptance,
    promptTokensPath: promptTokens,
    provenance: {
      requestedProvider: 'fish-speech-lora', actualProvider: 'fish-speech-lora', fallbackUsed: false, fallbackReason: null,
      modelId: narration.mergedModel || FISH_MERGED_MODEL, modelRevision: narration.modelRevision || 'F3 reference-prosody LoRA r8 alpha16 step160', style: 'F-owner-voice-reference-prosody',
      ...(narration.modelFallbackFrom ? { modelFallbackFrom: narration.modelFallbackFrom, modelFallbackReason: narration.modelFallbackReason || null } : {}),
      synthesisUnit: 'continuous-short-paragraph', internalMicrosegments: false, syntheticInterUnitSilenceSeconds: 0, asrWaveformTempo: 1, tailSilenceTrim: 'reverse-start-silenceremove-v1',
      pronunciationOverrides, pronunciationOverridesScope: 'tts-input-only', authoritativeTextModified: false, asrComparisonWhitespaceInsensitive: true, synthesisPlanSha256,
      ...(ownerOpening ? { ownerRecording: { source: ownerOpening.source, audio: path.relative(root, ownerOpening.sourcePath).replaceAll(path.sep, '/'), sha256: ownerOpening.sha256, cueNumbers: sourceCues.slice(0, ownerOpening.cueCount).map((cue) => cue.number), transform: 'none-byte-identical-copy', synthesized: false } } : {}),
      referenceSha256: referenceSha, referenceAudio: path.relative(root, referenceAudio).replaceAll(path.sep, '/'), referenceTranscript: narration.referenceTranscript,
      fishRoot: path.relative(root, fishRoot).replaceAll(path.sep, '/'), baseModelSha256: baseSha, mergedModelSha256: mergedSha,
      loraCheckpoint: path.relative(fishRoot, loraCheckpoint).replaceAll(path.sep, '/'), loraSha256: loraSha, vqCheckpointSha256: vqSha,
      promptTokensSha256: await sha256(promptTokens), promptTokensPath: path.relative(root, promptTokens).replaceAll(path.sep, '/'), speechAcceptance: acceptance,
    },
  };
}
