import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSentencePauseEdits, parseSilenceDetect, readPcm16WavSamples, remapCuesForSentencePauseEdits } from './production-lib.mjs';
import { inspectQwenPcm16Wav, runQwen3TtsProvider } from './qwen3-tts-provider.mjs';

const SECTION_ORDER = ['hook', 'incident', 'timeline', 'frustrating', 'solution', 'legal', 'confirmation'];
const AUTOMATION_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STYLE_ORDER = ['hook', 'news_exposition', 'news_exposition', 'tension', 'news_exposition', 'legal_explanation', 'viewer_question'];
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const COMPLEX_KOREAN_FINALS = new Set([2, 3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 18, 20]);

const hasComplexKoreanFinal = (text) => [...text].some((character) => {
  const syllable = character.codePointAt(0) - 0xAC00;
  return syllable >= 0 && syllable <= 11171 && COMPLEX_KOREAN_FINALS.has(syllable % 28);
});

export function deriveNewsroomPronunciationTerms(sections) {
  const terms = [...new Set((Array.isArray(sections) ? sections : [sections])
    .flatMap((text) => [...String(text || '').matchAll(/[\p{L}\p{N}]{4,}/gu)].map((match) => match[0]))
    .filter((term) => [...term].length >= 5 || hasComplexKoreanFinal(term)))];
  if (!terms.length || terms.length > 64) throw new Error('Narration pronunciation term derivation produced an invalid bounded set');
  return terms;
}

export function validateNewsroomPauseEdits(cues, edits, maximumSeconds = 0.5) {
  const expected = (Array.isArray(cues) ? cues : []).flatMap((cue, cueIndex) => {
    const text = String(cue?.text || '').replace(/\s+/gu, ' ').trim();
    return [...text.matchAll(/[.!?。！？…]+(?=\s|$)/gu)].map((match) => ({ cueIndex, charOffset: Number(match.index || 0) + match[0].length }));
  });
  expected.pop();
  const expectedIds = new Set(expected.map((item) => `${item.cueIndex}:${item.charOffset}`));
  const seen = new Set();
  for (const [index, edit] of (Array.isArray(edits) ? edits : []).entries()) {
    const id = `${edit?.boundaryCueIndex}:${edit?.boundaryCharOffset}`;
    if (!expectedIds.has(id) || seen.has(id) || edit?.sentenceBoundary !== true || !(edit.outputPauseSeconds > 0) || edit.outputPauseSeconds > maximumSeconds + 1e-9 || edit.end > edit.start + 1e-9) throw new Error(`Narration pause edit ${index + 1} violates the exact sentence-boundary contract`);
    if (index > 0 && edit.start - edits[index - 1].start < 0.25) throw new Error('Narration pause edits contain a duplicate or collapsed boundary');
    seen.add(id);
  }
  return { schema: 'korean-sentence-pause-qa-v2', expectedBoundaryCount: expected.length, insertedBoundaryCount: seen.size, uniqueBoundaryCount: seen.size, duplicateOrCollapsedBoundary: false, passes: true };
}

export function summarizeNewsroomPronunciationQa(acceptance, criticalPhrases) {
  const selectedSegments = (Array.isArray(acceptance?.attempts) ? acceptance.attempts : [])
    .flatMap((attempt) => Array.isArray(attempt?.segments) ? attempt.segments : [])
    .filter((segment) => segment?.accepted === true && segment?.selected === true);
  const windows = selectedSegments.flatMap((segment) => Array.isArray(segment?.localizedPronunciationQa?.windows) ? segment.localizedPronunciationQa.windows : []);
  const terms = [...new Set(criticalPhrases)];
  const admittedTerms = new Set(windows.filter((window) => window?.passes === true && Array.isArray(window.checks) && window.checks.length === 2 && window.checks.every((check) => check?.passes === true)).map((window) => window.phrase));
  const missing = terms.filter((term) => !admittedTerms.has(term));
  if (missing.length) throw new Error(`Final narration is missing localized pronunciation admission: ${missing.join(', ')}`);
  return { schema: 'qwen-localized-pronunciation-required-v1', terms, models: ['small', 'medium'], agreement: 'all-models', admittedWindowCount: windows.length, passes: true };
}

export function validateNewsroomSegmentReuse(acceptance) {
  const summary = acceptance?.evidence?.segmentReuse;
  const selected = (Array.isArray(acceptance?.attempts) ? acceptance.attempts : []).flatMap((attempt) => Array.isArray(attempt?.segments) ? attempt.segments : []).filter((segment) => segment?.accepted === true && segment?.selected === true);
  const attemptedReuse = new Set((Array.isArray(acceptance?.attempts) ? acceptance.attempts : []).filter((attempt) => attempt?.segments?.some((segment) => segment?.generationMode === 'qwen-revalidated-segment')).map((attempt) => attempt.segmentIndex)).size;
  const reused = selected.filter((segment) => segment.generationMode === 'qwen-revalidated-segment').length;
  const regenerated = selected.filter((segment) => segment.generationMode === 'qwen-resynthesis').length;
  if (summary?.schema !== 'qwen-segment-reuse-summary-v1' || !Number.isInteger(summary.requested) || !Number.isInteger(summary.reused) || !Number.isInteger(summary.regenerated) || summary.requested < 0 || summary.reused < 0 || summary.regenerated < 0 || summary.requested !== attemptedReuse || summary.reused !== reused || summary.regenerated !== regenerated || summary.reused > summary.requested) throw new Error('Narration segment reuse evidence is missing or inconsistent');
  return summary;
}

function exactSections(script) {
  const sections = SECTION_ORDER.map((name) => String(script?.sections?.[name] || '').trim());
  if (sections.some((text) => !text)) throw new Error('Final script does not contain all seven narration sections');
  const draft = sections.join('\n\n');
  if (draft.replace(/\s+/gu, '') !== String(script?.draft || '').replace(/\s+/gu, '')) throw new Error('Narration sections drifted from the authoritative final draft');
  return sections;
}

function stylePlan(sections) {
  return sections.map((text, segmentIndex) => ({ segmentIndex, textSha256: sha256(Buffer.from(text, 'utf8')), style: STYLE_ORDER[segmentIndex] }));
}

export async function discoverNewsroomNarrationReuseSegments({ sections, outputDir }) {
  const jobsRoot = path.join(AUTOMATION_ROOT, 'out', 'newsroom', 'jobs');
  const expectedPlan = stylePlan(sections);
  const discovered = new Map();
  const jobs = await fsp.readdir(jobsRoot, { withFileTypes: true }).catch(() => []);
  for (const job of jobs.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).sort((left, right) => left.name.localeCompare(right.name))) {
    const narrationDir = path.join(jobsRoot, job.name, 'project', 'narration');
    const acceptancePath = path.join(narrationDir, 'provider.acceptance.json');
    const acceptanceStat = await fsp.lstat(acceptancePath).catch(() => null);
    if (!acceptanceStat?.isFile() || acceptanceStat.isSymbolicLink()) continue;
    let acceptance;
    try { acceptance = JSON.parse(await fsp.readFile(acceptancePath, 'utf8')); } catch { continue; }
    if (acceptance?.accepted !== true || acceptance?.final?.accepted !== true || !/^[a-f0-9]{64}$/u.test(String(acceptance?.evidence?.promptBankManifestSha256 || ''))) continue;
    for (const attempt of Array.isArray(acceptance.attempts) ? acceptance.attempts : []) {
      const segment = Array.isArray(attempt?.segments) ? attempt.segments.find((item) => item?.accepted === true && item?.selected === true) : null;
      const segmentIndex = Number(attempt?.segmentIndex);
      const expected = expectedPlan[segmentIndex - 1];
      if (!segment || !expected || discovered.has(segmentIndex) || segment.sourceText !== sections[segmentIndex - 1] || segment.style !== expected.style || segment.promptSha256 !== acceptance.evidence?.promptHashes?.[expected.style] || !/^[a-f0-9]{64}$/u.test(String(segment.audioSha256 || '')) || !Number.isInteger(attempt.attempt) || attempt.attempt < 1) continue;
      const candidateDir = path.join(narrationDir, `provider.qwen-candidate-${String(segmentIndex).padStart(3, '0')}-${attempt.attempt}`);
      const audioPath = path.join(candidateDir, `segment-${String(segmentIndex).padStart(3, '0')}.wav`);
      const candidateStat = await fsp.lstat(candidateDir).catch(() => null); const audioStat = await fsp.lstat(audioPath).catch(() => null);
      if (!candidateStat?.isDirectory() || candidateStat.isSymbolicLink() || !audioStat?.isFile() || audioStat.isSymbolicLink()) continue;
      const bytes = await fsp.readFile(audioPath);
      if (sha256(bytes) !== segment.audioSha256) continue;
      discovered.set(segmentIndex, {
        segmentIndex,
        sourceTextSha256: expected.textSha256,
        style: expected.style,
        promptSha256: segment.promptSha256,
        promptBankManifestSha256: acceptance.evidence.promptBankManifestSha256,
        modelId: acceptance.evidence.modelId,
        modelRevision: acceptance.evidence.modelRevision,
        seed: Number.isInteger(segment.seed) ? segment.seed : null,
        audioSha256: segment.audioSha256,
        bytes,
      });
    }
    if (discovered.size === expectedPlan.length) break;
  }
  const reuseRoot = path.join(outputDir, 'segment-reuse-v1');
  const result = [];
  for (const segmentIndex of [...discovered.keys()].sort((left, right) => left - right)) {
    const entry = discovered.get(segmentIndex);
    await fsp.mkdir(reuseRoot, { recursive: true });
    const target = path.join(reuseRoot, `segment-${String(segmentIndex).padStart(3, '0')}-${entry.audioSha256}.wav`);
    await writeExclusiveOrVerify(target, entry.bytes);
    await fsp.chmod(target, 0o444);
    result.push({
      segmentIndex: entry.segmentIndex,
      sourceTextSha256: entry.sourceTextSha256,
      style: entry.style,
      promptSha256: entry.promptSha256,
      promptBankManifestSha256: entry.promptBankManifestSha256,
      modelId: entry.modelId,
      modelRevision: entry.modelRevision,
      seed: entry.seed,
      audioPath: path.relative(AUTOMATION_ROOT, target).replaceAll(path.sep, '/'),
      audioSha256: entry.audioSha256,
    });
  }
  return result;
}

async function writeExclusiveOrVerify(file, bytes) {
  try { await fsp.writeFile(file, bytes, { flag: 'wx' }); }
  catch (error) { if (error?.code !== 'EEXIST' || !Buffer.from(await fsp.readFile(file)).equals(Buffer.from(bytes))) throw error; }
}

function renderPauseFilter(edits, duration) {
  const filters = []; const labels = []; let cursor = 0; let index = 0;
  for (const edit of edits) {
    if (edit.start > cursor) { filters.push(`[0:a]atrim=start=${cursor.toFixed(6)}:end=${edit.start.toFixed(6)},asetpts=PTS-STARTPTS[a${index}]`); labels.push(`[a${index}]`); index += 1; }
    filters.push(`anullsrc=r=24000:cl=mono:d=${edit.outputPauseSeconds.toFixed(6)}[s${index}]`); labels.push(`[s${index}]`); index += 1; cursor = edit.end;
  }
  if (cursor < duration) { filters.push(`[0:a]atrim=start=${cursor.toFixed(6)}:end=${duration.toFixed(6)},asetpts=PTS-STARTPTS[a${index}]`); labels.push(`[a${index}]`); index += 1; }
  filters.push(`${labels.join('')}concat=n=${index}:v=0:a=1[final]`);
  return filters.join(';');
}

export async function generateNewsroomNarration({ script, authorityHash, ownerVoiceProfile, outputDir, ffmpegExecutable, ffprobeExecutable, runCommand, heartbeat = null }) {
  if (!/^[a-f0-9]{64}$/u.test(String(authorityHash || ''))) throw new Error('Narration authority hash is invalid');
  if (ownerVoiceProfile?.profileId !== 'owner-voice-v1' || !/^[a-f0-9]{64}$/u.test(String(ownerVoiceProfile.profileSha256 || ''))) throw new Error('Narration requires the approved owner-voice-v1 authority');
  const sections = exactSections(script); const scriptText = `${sections.join('\n\n')}\n`; const scriptSha256 = sha256(Buffer.from(String(script.draft), 'utf8'));
  await fsp.mkdir(outputDir, { recursive: true });
  const scriptPath = path.join(outputDir, 'script.txt'); const stem = path.join(outputDir, 'provider');
  await writeExclusiveOrVerify(scriptPath, Buffer.from(scriptText, 'utf8'));
  await heartbeat?.();
  const criticalPhrases = deriveNewsroomPronunciationTerms(sections);
  const reuseSegments = await discoverNewsroomNarrationReuseSegments({ sections, outputDir });
  const result = await runQwen3TtsProvider({
    narration: {
      mode: 'qwen3-tts', style: 'auto', modelId: ownerVoiceProfile.modelId, modelRevision: ownerVoiceProfile.modelRevision,
      device: 'cuda', seed: 20260811, maxAttempts: 12, temperature: 0.7, finalTempo: 1.08, maxSegmentChars: 220,
      criticalPhrases, criticalPhraseModels: ['small', 'medium'], criticalPhraseAgreement: 'all-models', criticalPhraseIsolation: false,
      pronunciationHints: [], questionSentences: sections.filter((text) => /[?？]\s*$/u.test(text)), questionStyle: 'viewer_question',
      stylePlan: stylePlan(sections), removeSilence: false, sentencePauseSeconds: 0, semanticPauseSeconds: 0, joinSafetySeconds: 0.005,
      reuseSegments,
    },
    scriptPath, stem, root: AUTOMATION_ROOT, base: outputDir,
    runRootCommand: async (command, args) => (await runCommand(command, args)).stdout,
    promptBankPath: ownerVoiceProfile.promptBank,
  });
  if (result.acceptance?.accepted !== true || result.acceptance?.final?.accepted !== true) throw new Error('Owner narration did not pass Qwen speech acceptance');
  const pronunciationQa = summarizeNewsroomPronunciationQa(result.acceptance, criticalPhrases);
  const segmentReuse = validateNewsroomSegmentReuse(result.acceptance);
  await heartbeat?.();
  const sourceDuration = Number(result.acceptance.evidence?.finalSignal?.durationSeconds);
  if (!(sourceDuration > 0)) throw new Error('Accepted owner narration duration is missing');
  const silence = await runCommand(ffmpegExecutable, ['-hide_banner', '-nostats', '-i', result.audioPath, '-af', 'silencedetect=noise=-42dB:d=0.04', '-f', 'null', '-']);
  const wav = readPcm16WavSamples(await fsp.readFile(result.audioPath));
  if (!wav) throw new Error('Accepted owner narration must be 24kHz mono PCM16 WAV before pause timing');
  const unitBoundaryTimes = result.cues.slice(0, -1).map((cue) => Number(cue.end));
  const pauseEdits = buildSentencePauseEdits(parseSilenceDetect(`${silence.stdout}\n${silence.stderr}`), sourceDuration, result.cues, {
    targetPauseSeconds: 0.45, maxPauseSeconds: 0.5, unitBoundaryTimes, audioSamples: wav.samples, sampleRate: wav.sampleRate,
  });
  const pauseQa = validateNewsroomPauseEdits(result.cues, pauseEdits, 0.5);
  const finalAudioPath = path.join(outputDir, 'narration-final.m4a');
  if (pauseEdits.length) await runCommand(ffmpegExecutable, ['-hide_banner', '-loglevel', 'error', '-y', '-i', result.audioPath, '-filter_complex', renderPauseFilter(pauseEdits, sourceDuration), '-map', '[final]', '-c:a', 'aac', '-b:a', '192k', finalAudioPath]);
  else await runCommand(ffmpegExecutable, ['-hide_banner', '-loglevel', 'error', '-y', '-i', result.audioPath, '-c:a', 'aac', '-b:a', '192k', finalAudioPath]);
  const cues = remapCuesForSentencePauseEdits(result.cues, pauseEdits, 1);
  const inspectionPath = path.join(outputDir, 'narration-final-inspection.wav');
  await runCommand(ffmpegExecutable, ['-hide_banner', '-loglevel', 'error', '-y', '-i', finalAudioPath, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', inspectionPath]);
  const finalSignal = await inspectQwenPcm16Wav(inspectionPath);
  if (finalSignal.clippedSamples || finalSignal.endpointAmplitude > 0.02 || finalSignal.boundaryMaxAdjacentJump > 0.25) throw new Error('Final owner narration failed the post-pause signal gate');
  const probe = JSON.parse((await runCommand(ffprobeExecutable, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', finalAudioPath])).stdout);
  const durationSeconds = Number(probe.format?.duration);
  if (!(durationSeconds > 0) || cues.some((cue) => cue.end > durationSeconds + 0.05)) throw new Error('Final owner narration cue timing exceeds the locked audio');
  const audioBytes = await fsp.readFile(finalAudioPath); const audioSha256 = sha256(audioBytes);
  const acceptanceSha256 = sha256(await fsp.readFile(`${stem}.acceptance.json`));
  const handoff = {
    schema: 'newsroom-approved-narration-handoff-v2', authorityHash, scriptSha256, audioSha256, durationSeconds,
    cueCount: cues.length, cues, pausePolicy: { schema: 'korean-sentence-pause-v2', targetSeconds: 0.45, maximumSeconds: 0.5, edits: pauseEdits, qa: pauseQa },
    sourceIntegrity: { scriptSha256, ownerVoiceProfileSha256: ownerVoiceProfile.profileSha256, promptBankManifestSha256: result.acceptance.evidence?.promptBankManifestSha256, providerAcceptanceSha256: acceptanceSha256 },
    narrationProvider: { requestedProvider: 'qwen3-tts', actualProvider: 'qwen3-tts', fallbackUsed: false, finalTempo: result.acceptance.finalTempo, speechAcceptance: result.acceptance, postAcceptanceSignal: finalSignal, postAcceptanceAudioSha256: audioSha256 },
  };
  const handoffPath = path.join(outputDir, 'handoff.json'); await fsp.writeFile(handoffPath, jsonText(handoff), 'utf8');
  return { schema: 'newsroom-narration-manifest-v2', authorityHash, scriptSha256, ownerVoiceProfileSha256: ownerVoiceProfile.profileSha256, audioPath: path.basename(finalAudioPath), audioSha256, audioBytes: audioBytes.length, handoffPath: path.basename(handoffPath), handoffSha256: sha256(await fsp.readFile(handoffPath)), durationSeconds, cueCount: cues.length, cues, pausePolicy: handoff.pausePolicy, pronunciationQa, segmentReuse, providerAcceptanceSha256: acceptanceSha256, status: 'machine-accepted-locked' };
}

export function verifyNewsroomNarrationManifest(manifest, { authorityHash, script, ownerVoiceProfile, outputDir }) {
  const scriptSha256 = sha256(Buffer.from(String(script?.draft || ''), 'utf8'));
  if (manifest?.schema !== 'newsroom-narration-manifest-v2' || manifest.authorityHash !== authorityHash || manifest.scriptSha256 !== scriptSha256 || manifest.ownerVoiceProfileSha256 !== ownerVoiceProfile?.profileSha256 || manifest.status !== 'machine-accepted-locked') throw new Error('Narration manifest authority is stale');
  if (!(manifest.durationSeconds > 0) || !Number.isInteger(manifest.cueCount) || manifest.cueCount < 1 || !Array.isArray(manifest.cues) || manifest.cues.length !== manifest.cueCount) throw new Error('Narration manifest timing is invalid');
  if (manifest.pausePolicy?.schema !== 'korean-sentence-pause-v2' || manifest.pausePolicy?.qa?.passes !== true || manifest.pausePolicy.qa.duplicateOrCollapsedBoundary !== false || manifest.pronunciationQa?.schema !== 'qwen-localized-pronunciation-required-v1' || manifest.pronunciationQa?.passes !== true || JSON.stringify(manifest.pronunciationQa.models) !== JSON.stringify(['small', 'medium']) || manifest.pronunciationQa.agreement !== 'all-models' || !Array.isArray(manifest.pronunciationQa.terms) || !manifest.pronunciationQa.terms.length) throw new Error('Narration manifest speech QA is missing or stale');
  const audio = path.join(outputDir, manifest.audioPath); const handoff = path.join(outputDir, manifest.handoffPath);
  for (const [file, expected] of [[audio, manifest.audioSha256], [handoff, manifest.handoffSha256]]) if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== expected) throw new Error('Narration manifest asset hash mismatch');
  const handoffJson = JSON.parse(fs.readFileSync(handoff, 'utf8'));
  if (handoffJson?.schema !== 'newsroom-approved-narration-handoff-v2' || handoffJson.authorityHash !== authorityHash || handoffJson.audioSha256 !== manifest.audioSha256 || handoffJson.pausePolicy?.qa?.passes !== true) throw new Error('Narration handoff speech QA is stale');
  const expectedTerms = deriveNewsroomPronunciationTerms(exactSections(script));
  const verifiedPronunciation = summarizeNewsroomPronunciationQa(handoffJson.narrationProvider?.speechAcceptance, expectedTerms);
  if (JSON.stringify(verifiedPronunciation) !== JSON.stringify(manifest.pronunciationQa)) throw new Error('Narration localized pronunciation evidence drifted');
  const verifiedReuse = validateNewsroomSegmentReuse(handoffJson.narrationProvider?.speechAcceptance);
  if (JSON.stringify(verifiedReuse) !== JSON.stringify(manifest.segmentReuse)) throw new Error('Narration segment reuse evidence drifted');
  return true;
}
