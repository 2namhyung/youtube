import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { canSplitKoreanAt, koreanSplitPriority, splitKoreanCaptionText, verifyKoreanCaptionNumbers } from './korean-caption-splitter.mjs';

export const MEDIA_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.png', '.jpg', '.jpeg']);
export const QWEN3_TTS_STYLES = Object.freeze(['neutral', 'hook', 'news_exposition', 'tension', 'criticism', 'solution_closing', 'legal_explanation', 'viewer_question', 'closing']);
export const QWEN3_TTS_STYLE_MODES = Object.freeze([...QWEN3_TTS_STYLES, 'auto']);
export const SCENE_CAMERA_MODES = Object.freeze(['none', 'push-in', 'pull-out', 'drift-left', 'drift-right', 'handheld']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm']);
export const REFERENCE_CAPTION_PRESET = Object.freeze({
  id: 'reference-v3-semantic-2line',
  fontFamily: 'Noto Sans KR',
  fontWeight: 800,
  fontSize: 88,
  scaleX: 94,
  safeWidth: 920,
  maxLines: 2,
  lineHeight: 1.08,
  x: 540,
  y: 1400,
  color: '#FFFFFF',
  outlineColor: '#000000',
  outlineWidth: 5,
  background: 'none',
});
export const INFORMATION_DELTA_V14_CAPTION_PRESET = Object.freeze({
  ...REFERENCE_CAPTION_PRESET,
  id: 'information-delta-v14-white-on-black-2line',
  background: 'black',
});
const ALLOWED_CAPTION_PRESETS = Object.freeze([REFERENCE_CAPTION_PRESET, INFORMATION_DELTA_V14_CAPTION_PRESET]);

export function fitTitleFontSize(text, requestedSize, safeWidth = REFERENCE_CAPTION_PRESET.safeWidth) {
  const normalized = String(text || '').normalize('NFC');
  const units = [...normalized].reduce((sum, character) => {
    if (/\s/u.test(character)) return sum + 0.35;
    if (/[\u0000-\u007f]/u.test(character)) return sum + (/[A-Za-z0-9]/u.test(character) ? 0.62 : 0.48);
    return sum + 1.05;
  }, 0);
  if (!(Number(requestedSize) > 0) || !(Number(safeWidth) > 0) || units <= 0) throw new Error('Title font fitting requires non-empty text, a positive requested size, and a positive safe width');
  return Math.max(42, Math.min(Math.round(requestedSize), Math.floor((Number(safeWidth) - 24) / units)));
}

const CAPTION_WIKI_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'knowledge',
  'wiki',
  'concepts',
  'caption-generation-rules.md',
);

export function loadCaptionWikiRules(filePath = CAPTION_WIKI_PATH) {
  const source = fs.readFileSync(filePath, 'utf8');
  const match = source.match(/<!-- caption-contract:start -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- caption-contract:end -->/);
  if (!match) throw new Error(`caption-contract JSON block not found in ${filePath}`);
  const rules = JSON.parse(match[1]);
  if (rules.id !== 'newsroom-semantic-2line-v3') throw new Error(`unsupported caption wiki contract: ${rules.id}`);
  if (rules.boundaryEngine !== 'korean-subtitle-splitter-js-port-v2'
    || rules.upstreamRepository !== 'https://github.com/Leedogin/korean-subtitle-splitter'
    || rules.upstreamCommit !== '9bc9720eccd9cf5452924f681b12ec85738f9ce8'
    || rules.upstreamLicense !== 'MIT') throw new Error('caption wiki Korean boundary engine provenance is invalid');
  if (!Number.isInteger(rules.semanticMaxWords) || rules.semanticMaxWords < 4 || rules.semanticMaxWords > 12) throw new Error('caption wiki semanticMaxWords must be an integer between 4 and 12');
  if (!Number.isInteger(rules.semanticMaxGraphemes) || rules.semanticMaxGraphemes < 23 || rules.semanticMaxGraphemes > 45) throw new Error('caption wiki semanticMaxGraphemes must be an integer between 23 and 45');
  if (!Number.isInteger(rules.targetGraphemesPerLine) || rules.targetGraphemesPerLine < 8 || rules.targetGraphemesPerLine > 24) throw new Error('caption wiki targetGraphemesPerLine must be an integer between 8 and 24');
  if (!Number.isInteger(rules.minGraphemesPerCue) || rules.minGraphemesPerCue < 1 || rules.minGraphemesPerCue > rules.targetGraphemesPerLine) throw new Error('caption wiki minGraphemesPerCue is invalid');
  if (!(rules.minDurationSeconds >= 0.4) || !(rules.targetDurationSeconds >= rules.minDurationSeconds) || !(rules.maxDurationSeconds >= rules.targetDurationSeconds)) throw new Error('caption wiki duration bounds are invalid');
  if (rules.maxLines !== 2 || rules.preserveSourceCueBoundaries !== true || rules.preserveWordOrder !== true) throw new Error('caption wiki must preserve source-ordered cues with at most two rendered lines');
  return Object.freeze(rules);
}

export const REFERENCE_CAPTION_RULES = loadCaptionWikiRules();

function validateCaptionPreset(value, errors) {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('captionPreset must be an object');
    return;
  }
  const expectedKeys = Object.keys(REFERENCE_CAPTION_PRESET);
  const actualKeys = Object.keys(value);
  const unknown = actualKeys.filter((key) => !expectedKeys.includes(key));
  const missing = expectedKeys.filter((key) => !actualKeys.includes(key));
  if (unknown.length) errors.push(`unknown captionPreset properties: ${unknown.join(', ')}`);
  if (missing.length) errors.push(`missing captionPreset properties: ${missing.join(', ')}`);
  const matchesLockedPreset = ALLOWED_CAPTION_PRESETS.some((preset) => JSON.stringify(preset) === JSON.stringify(value));
  if (!matchesLockedPreset) {
    for (const key of expectedKeys) {
      const acceptedValues = new Set(ALLOWED_CAPTION_PRESETS.map((preset) => preset[key]));
      if (!acceptedValues.has(value[key])) errors.push(`captionPreset.${key} must equal a locked preset value`);
    }
    errors.push(`captionPreset must equal one of the locked presets: ${ALLOWED_CAPTION_PRESETS.map((preset) => preset.id).join(', ')}`);
  }
}

export function assertCaptionPresetMatchesTokens(preset, tokens) {
  const caption = tokens?.component?.caption;
  const semantic = tokens?.semantic;
  const font = tokens?.primitive?.font;
  const projected = {
    id: preset?.id,
    fontFamily: font?.family,
    fontWeight: font?.weight,
    fontSize: caption?.fontSize,
    scaleX: semantic?.captionScaleX,
    safeWidth: semantic?.safeWidth,
    maxLines: caption?.maxLines,
    lineHeight: caption?.lineHeight,
    x: caption?.x,
    y: caption?.y,
    color: semantic?.caption,
    outlineColor: semantic?.captionOutline,
    outlineWidth: caption?.outlineWidth,
    background: semantic?.captionBackground,
  };
  if (!ALLOWED_CAPTION_PRESETS.some((candidate) => JSON.stringify(candidate) === JSON.stringify(preset))) {
    throw new Error(`unsupported caption preset ${preset?.id || '<missing>'}`);
  }
  for (const [key, expected] of Object.entries(REFERENCE_CAPTION_PRESET)) {
    if (key === 'id' || key === 'background') continue;
    if (projected[key] !== expected || preset?.[key] !== expected) {
      throw new Error(`caption preset/token drift at ${key}`);
    }
  }
  return true;
}

export function validateProject(project, baseDir = process.cwd()) {
  const errors = [];
  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const unknownKeys = (value, allowed) => isObject(value) ? Object.keys(value).filter((key) => !allowed.has(key)) : [];
  if (!isObject(project)) errors.push('project must be an object');
  const input = isObject(project) ? project : {};
  const topLevelUnknown = unknownKeys(input, new Set(['id', 'templateId', 'title', 'scriptFile', 'scriptSource', 'pipelineContract', 'assets', 'scenes', 'narration', 'captionPreset', 'captionProtectedTerms', 'bgm', 'media', 'thumbnail', 'thumbnailContract', 'releaseGate', 'transitionContract', 'motionEvidence', 'contractVersion', 'evidenceBundle', 'videoDesign', 'referenceManifest', 'productionAuthorityMode', 'animationMode', 'aiDisclosureLabel', 'output', 'sceneEvidence', 'assetPlan', 'assetIntegrity']));
  if (topLevelUnknown.length) errors.push(`unknown project properties: ${topLevelUnknown.join(', ')}`);
  if (typeof input.id !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(input.id)) errors.push('id must contain lowercase letters, digits, _ or -');
  if (!isObject(input.title) || typeof input.title.line1 !== 'string' || input.title.line1.length < 1 || typeof input.title.line2 !== 'string' || input.title.line2.length < 1) errors.push('title.line1 and title.line2 are required');
  const titleUnknown = unknownKeys(input.title, new Set(['line1', 'line2']));
  if (titleUnknown.length) errors.push(`unknown title properties: ${titleUnknown.join(', ')}`);
  if (input.productionAuthorityMode === true && isObject(input.title) && typeof input.title.line1 === 'string' && typeof input.title.line2 === 'string') {
    if (fitTitleFontSize(input.title.line1, 120, 920) !== 120) errors.push('title.line1 exceeds the approved 920px safe band at 120px; provide a shorter approved headline');
    if (fitTitleFontSize(input.title.line2, 143, 920) !== 143) errors.push('title.line2 exceeds the approved 920px safe band at 143px; provide a shorter approved headline');
  }
  if (input.pipelineContract !== undefined) {
    const binding = input.pipelineContract;
    if (!isObject(binding) || unknownKeys(binding, new Set(['path', 'sha256'])).length || typeof binding.path !== 'string' || !binding.path || path.isAbsolute(binding.path) || binding.path.split(/[\\/]/).includes('..') || typeof binding.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(binding.sha256)) {
      errors.push('pipelineContract requires a safe relative path and SHA-256 digest');
    } else {
      try {
        const bytes = fs.readFileSync(path.resolve(baseDir, binding.path));
        const actual = crypto.createHash('sha256').update(bytes).digest('hex');
        if (actual !== binding.sha256) errors.push('pipelineContract SHA-256 mismatch');
      } catch { errors.push('pipelineContract file is missing'); }
    }
  }
  validateCaptionPreset(input.captionPreset, errors);
  if (input.thumbnail !== undefined) {
    try {
      validateThumbnailOverride(input.thumbnail, baseDir);
    } catch (error) {
      String(error?.message || error).split('\n').forEach((message) => errors.push(message));
    }
  }
  if (input.thumbnailContract !== undefined) {
    try {
      validateThumbnailContract(input.thumbnailContract, baseDir, { title: input.title, thumbnail: input.thumbnail, aiDisclosureText: input.scenes?.[0]?.label });
    } catch (error) {
      String(error?.message || error).split('\n').forEach((message) => errors.push(message));
    }
  }
  if (input.thumbnailContract !== undefined && input.thumbnail === undefined) errors.push('thumbnailContract requires a matching thumbnail override');
  if (input.captionProtectedTerms !== undefined) {
    if (!Array.isArray(input.captionProtectedTerms) || input.captionProtectedTerms.length > 100) {
      errors.push('captionProtectedTerms must be an array with at most 100 entries');
    } else {
      const normalizedTerms = input.captionProtectedTerms.map((term) => typeof term === 'string' ? term.replace(/\s+/gu, ' ').trim() : '');
      if (normalizedTerms.some((term) => term.length < 2 || term.length > 100)) errors.push('captionProtectedTerms entries must be strings between 2 and 100 characters');
      if (new Set(normalizedTerms).size !== normalizedTerms.length) errors.push('captionProtectedTerms entries must be unique');
    }
  }
  if (input.releaseGate !== undefined) {
    const gate = input.releaseGate;
    if (!isObject(gate)) errors.push('releaseGate must be an object');
    else {
      const unknown = unknownKeys(gate, new Set(['publishable', 'releaseStatus', 'uploadBlocked', 'blockers', 'approval']));
      if (unknown.length) errors.push(`unknown releaseGate properties: ${unknown.join(', ')}`);
      const approved = gate.publishable === true && gate.releaseStatus === 'approved' && gate.uploadBlocked === false;
      const blocked = gate.publishable === false && gate.releaseStatus === 'preview' && gate.uploadBlocked === true;
      if (!approved && !blocked) errors.push('releaseGate state must be blocked preview or approved publishable');
      if (!Array.isArray(gate.blockers) || (blocked && gate.blockers.length < 1) || (approved && gate.blockers.length !== 0)) errors.push('releaseGate.blockers do not match release state');
      else gate.blockers.forEach((blocker, index) => {
        if (!isObject(blocker)) {
          errors.push(`releaseGate.blockers[${index}] must be an object`);
          return;
        }
        const unknownBlocker = unknownKeys(blocker, new Set(['id', 'stage', 'severity', 'claim', 'reason', 'authority']));
        if (unknownBlocker.length) errors.push(`unknown releaseGate.blockers[${index}] properties: ${unknownBlocker.join(', ')}`);
        for (const key of ['id', 'stage', 'claim', 'reason']) if (typeof blocker[key] !== 'string' || !blocker[key]) errors.push(`releaseGate.blockers[${index}].${key} is required`);
        if (blocker.severity !== 'block') errors.push(`releaseGate.blockers[${index}].severity must be block`);
        if (!isObject(blocker.authority) || typeof blocker.authority.case !== 'string' || !blocker.authority.case || typeof blocker.authority.url !== 'string' || !/^https:\/\//.test(blocker.authority.url)) errors.push(`releaseGate.blockers[${index}].authority requires case and https url`);
        else {
          const unknownAuthority = unknownKeys(blocker.authority, new Set(['case', 'url']));
          if (unknownAuthority.length) errors.push(`unknown releaseGate.blockers[${index}].authority properties: ${unknownAuthority.join(', ')}`);
        }
      });
      if (approved) {
        const approval = gate.approval;
        if (!isObject(approval)) errors.push('releaseGate.approval is required for approved releases');
        else {
          const unknownApproval = unknownKeys(approval, new Set(['reportVersionId', 'reportSha256', 'scriptSha256', 'reviewer', 'approvedAt']));
          if (unknownApproval.length) errors.push(`unknown releaseGate.approval properties: ${unknownApproval.join(', ')}`);
          if (typeof approval.reportVersionId !== 'string' || !approval.reportVersionId) errors.push('releaseGate.approval.reportVersionId is required');
          for (const key of ['reportSha256', 'scriptSha256']) if (typeof approval[key] !== 'string' || !/^[a-f0-9]{64}$/i.test(approval[key])) errors.push(`releaseGate.approval.${key} must be a SHA-256 digest`);
          if (typeof approval.reviewer !== 'string' || approval.reviewer.trim().length < 2) errors.push('releaseGate.approval.reviewer is required');
          if (typeof approval.approvedAt !== 'string' || Number.isNaN(Date.parse(approval.approvedAt))) errors.push('releaseGate.approval.approvedAt must be an ISO date');
        }
      } else if (gate.approval !== undefined) errors.push('releaseGate.approval is only valid for approved releases');
    }
  }
  if (input.bgm !== undefined) {
    const bgm = input.bgm;
    if (!isObject(bgm)) errors.push('bgm must be an object');
    else {
      const unknown = unknownKeys(bgm, new Set(['provider', 'engineContract', 'prompt', 'seed', 'audio', 'output', 'model', 'version', 'license', 'sha256', 'provenance', 'volumeDb', 'duckUnderNarration', 'fadeSeconds', 'required']));
      if (unknown.length) errors.push(`unknown bgm properties: ${unknown.join(', ')}`);
      if (bgm.provider !== undefined && !['stable-audio-3', 'ace-step-1.5', 'local-file'].includes(bgm.provider)) errors.push('bgm.provider is invalid');
      if (bgm.engineContract !== undefined && (typeof bgm.engineContract !== 'string' || !fs.existsSync(path.resolve(baseDir, bgm.engineContract)))) errors.push('bgm.engineContract not found');
      if (bgm.audio !== undefined && (typeof bgm.audio !== 'string' || !fs.existsSync(path.resolve(baseDir, bgm.audio)))) errors.push('bgm.audio not found');
      if (bgm.output !== undefined && typeof bgm.output !== 'string') errors.push('bgm.output must be a string');
      if (bgm.prompt !== undefined && typeof bgm.prompt !== 'string') errors.push('bgm.prompt must be a string');
      if (bgm.seed !== undefined && (!Number.isInteger(bgm.seed) || bgm.seed < 0)) errors.push('bgm.seed must be a non-negative integer');
      for (const key of ['model', 'version', 'license']) if (bgm[key] !== undefined && (typeof bgm[key] !== 'string' || !bgm[key])) errors.push(`bgm.${key} must be a non-empty string`);
      if (bgm.sha256 !== undefined && (typeof bgm.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(bgm.sha256))) errors.push('bgm.sha256 must be a SHA-256 digest');
      if (bgm.provenance !== undefined && (typeof bgm.provenance !== 'string' || !fs.existsSync(path.resolve(baseDir, bgm.provenance)))) errors.push('bgm.provenance not found');
      if (bgm.volumeDb !== undefined && (!Number.isFinite(bgm.volumeDb) || bgm.volumeDb < -60 || bgm.volumeDb > 0)) errors.push('bgm.volumeDb must be between -60 and 0');
      if (bgm.duckUnderNarration !== undefined && typeof bgm.duckUnderNarration !== 'boolean') errors.push('bgm.duckUnderNarration must be a boolean');
      if (bgm.fadeSeconds !== undefined && (!Number.isFinite(bgm.fadeSeconds) || bgm.fadeSeconds < 0 || bgm.fadeSeconds > 10)) errors.push('bgm.fadeSeconds must be between 0 and 10');
      if (bgm.required !== undefined && typeof bgm.required !== 'boolean') errors.push('bgm.required must be a boolean');
    }
  }
  if (input.media !== undefined) {
    if (!isObject(input.media)) errors.push('media must be an object');
    else if (input.media.clips !== undefined) {
      if (!Array.isArray(input.media.clips)) errors.push('media.clips must be an array');
      else input.media.clips.forEach((clip, index) => {
        if (!isObject(clip) || typeof clip.path !== 'string' || !clip.path) errors.push(`media.clips[${index}] requires path`);
        if (clip?.start !== undefined && (!Number.isFinite(clip.start) || clip.start < 0)) errors.push(`media.clips[${index}].start must be >= 0`);
        if (clip?.end !== undefined && (!Number.isFinite(clip.end) || clip.end <= Number(clip.start || 0))) errors.push(`media.clips[${index}].end must be > start`);
        if (clip?.label !== undefined && typeof clip.label !== 'string') errors.push(`media.clips[${index}].label must be a string`);
      });
    }
  }
  if (!Object.hasOwn(input, 'narration')) errors.push('narration is required');
  const narration = isObject(input.narration) ? input.narration : {};
  if (!isObject(input.narration)) errors.push('narration must be an object');
  if (!['edge-tts', 'file', 'approved-locked', 'local-clone', 'fish-speech-lora', 'qwen3-tts'].includes(narration.mode)) errors.push('narration.mode must be edge-tts, file, approved-locked, local-clone, fish-speech-lora or qwen3-tts');
  if (input.productionAuthorityMode === true && narration.mode !== 'approved-locked') errors.push('production authority requires the preplanned hash-locked owner-voice-v1 Qwen3-TTS output; render-time narration generation and non-owner narration are not authorized');
  const commonNarrationKeys = ['speechTempo', 'removeSilence', 'sentencePauseSeconds', 'semanticPauseSeconds', 'joinSafetySeconds'];
  const narrationAllowed = narration.mode === 'file'
    ? new Set(['mode', 'audio', 'srt', 'transcribe', ...commonNarrationKeys])
    : narration.mode === 'approved-locked'
      ? new Set(['mode', 'audio', 'handoff', 'audioSha256', 'cueCount', 'source'])
    : narration.mode === 'local-clone'
      ? new Set(['mode', 'style', 'cloneSpeed', 'fallback', 'fallbackVoice', 'fallbackRate', 'fallbackPitch', ...commonNarrationKeys])
      : narration.mode === 'fish-speech-lora'
        ? new Set(['mode', 'referenceAudio', 'referenceTranscript', 'subtitleSource', 'fishRoot', 'baseModel', 'mergedModel', 'mergedModelSha256', 'loraCheckpoint', 'loraSha256', 'modelRevision', 'modelFallbackFrom', 'modelFallbackReason', 'vqCheckpoint', 'device', 'seed', 'chunkLength', 'maxAttempts', 'cueIsolated', 'shortPauseSeconds', 'sectionPauseSeconds', 'pronunciationOverrides', 'ownerRecordingOpening', ...commonNarrationKeys])
        : narration.mode === 'qwen3-tts'
          ? new Set(['mode', 'style', 'stylePlan', 'promptBank', 'referenceAudio', 'referenceAudioSha256', 'referenceTranscript', 'modelId', 'modelRevision', 'modelLocalPath', 'attentionImplementation', 'device', 'seed', 'maxAttempts', 'temperature', 'finalTempo', 'maxSegmentChars', 'questionSentences', 'questionStyle', 'pitchCorrections', 'criticalPhrases', 'criticalPhraseIsolation', 'criticalPhraseIsolationTerms', 'criticalPhraseModels', 'criticalPhraseAgreement', 'pronunciationHints', 'prosodyProfile', 'prosodyCandidates', 'removeSilence', 'sentencePauseSeconds', 'semanticPauseSeconds', 'joinSafetySeconds'])
      : new Set(['mode', 'voice', 'rate', 'pitch', ...commonNarrationKeys]);
  const narrationUnknown = unknownKeys(narration, narrationAllowed);
  if (narrationUnknown.length) errors.push(`unknown narration properties: ${narrationUnknown.join(', ')}`);
  if (narration.mode === 'file') {
    if (typeof narration.audio !== 'string' || narration.audio.length < 1) errors.push('narration.audio is required for file mode');
    if (narration.srt !== undefined && (typeof narration.srt !== 'string' || narration.srt.length < 1)) errors.push('narration.srt must be a non-empty string');
    if (narration.transcribe !== undefined && typeof narration.transcribe !== 'boolean') errors.push('narration.transcribe must be a boolean');
    if (!narration.srt && narration.transcribe !== true) errors.push('file narration requires narration.srt or transcribe:true');
    if (typeof narration.srt === 'string' && narration.srt.length > 0 && !fs.existsSync(path.resolve(baseDir, narration.srt))) errors.push(`configured SRT not found: ${narration.srt}`);
    if (typeof narration.audio === 'string' && narration.audio.length > 0 && !fs.existsSync(path.resolve(baseDir, narration.audio))) errors.push(`audio not found: ${narration.audio}`);
  } else if (narration.mode === 'approved-locked') {
    if (typeof narration.audio !== 'string' || !narration.audio) errors.push('narration.audio is required for approved-locked mode');
    else if (!fs.existsSync(path.resolve(baseDir, narration.audio))) errors.push(`approved locked audio not found: ${narration.audio}`);
    if (typeof narration.handoff !== 'string' || !narration.handoff) errors.push('narration.handoff is required for approved-locked mode');
    else if (!fs.existsSync(path.resolve(baseDir, narration.handoff))) errors.push(`approved locked handoff not found: ${narration.handoff}`);
    if (!/^[0-9a-f]{64}$/i.test(narration.audioSha256 || '')) errors.push('narration.audioSha256 must be a SHA-256 hex digest');
    if (!Number.isInteger(narration.cueCount) || narration.cueCount < 1) errors.push('narration.cueCount must be a positive integer');
    if (narration.source !== 'approved-locked-owner-audio') errors.push('narration.source must be approved-locked-owner-audio');
  } else if (narration.mode === 'edge-tts') {
    for (const key of ['voice', 'rate', 'pitch']) {
      if (narration[key] !== undefined && (typeof narration[key] !== 'string' || narration[key].length < 1)) errors.push(`narration.${key} must be a non-empty string`);
    }
  } else if (narration.mode === 'local-clone') {
    if (narration.style !== undefined && !['neutral', 'hook', 'solution'].includes(narration.style)) errors.push('narration.style must be neutral, hook or solution');
    if (narration.cloneSpeed !== undefined && (!Number.isFinite(narration.cloneSpeed) || narration.cloneSpeed < 0.5 || narration.cloneSpeed > 2)) errors.push('narration.cloneSpeed must be between 0.5 and 2');
    if (narration.fallback !== undefined && narration.fallback !== 'edge-tts') errors.push('narration.fallback must be edge-tts');
    for (const key of ['fallbackVoice', 'fallbackRate', 'fallbackPitch']) {
      if (narration[key] !== undefined && (typeof narration[key] !== 'string' || narration[key].length < 1)) errors.push(`narration.${key} must be a non-empty string`);
      if (narration[key] !== undefined && narration.fallback !== 'edge-tts') errors.push(`narration.${key} requires narration.fallback to be edge-tts`);
    }
  } else if (narration.mode === 'fish-speech-lora') {
    if (typeof narration.referenceAudio !== 'string' || narration.referenceAudio.length < 1) errors.push('narration.referenceAudio is required for fish-speech-lora mode');
    if (typeof narration.referenceTranscript !== 'string' || narration.referenceTranscript.length < 1) errors.push('narration.referenceTranscript is required for fish-speech-lora mode');
    if (typeof narration.referenceAudio === 'string' && narration.referenceAudio.length > 0 && !fs.existsSync(path.resolve(baseDir, narration.referenceAudio))) errors.push(`reference audio not found: ${narration.referenceAudio}`);
    if (!input.scriptSource && (typeof narration.subtitleSource !== 'string' || narration.subtitleSource.length < 1)) errors.push('narration.subtitleSource is required for fish-speech-lora mode without scriptSource');
    if (typeof narration.subtitleSource === 'string' && narration.subtitleSource.length > 0 && !fs.existsSync(path.resolve(baseDir, narration.subtitleSource))) errors.push(`subtitle source not found: ${narration.subtitleSource}`);
    if (narration.device !== undefined && !['cuda', 'cpu'].includes(narration.device)) errors.push('narration.device must be cuda or cpu');
    if (narration.seed !== undefined && (!Number.isInteger(narration.seed) || narration.seed < 0)) errors.push('narration.seed must be a non-negative integer');
    if (narration.chunkLength !== undefined && (!Number.isInteger(narration.chunkLength) || narration.chunkLength < 20 || narration.chunkLength > 300)) errors.push('narration.chunkLength must be between 20 and 300');
    if (narration.maxAttempts !== undefined && (!Number.isInteger(narration.maxAttempts) || narration.maxAttempts < 1 || narration.maxAttempts > 8)) errors.push('narration.maxAttempts must be between 1 and 8');
    for (const key of ['mergedModelSha256', 'loraSha256']) if (narration[key] !== undefined && !/^[0-9a-f]{64}$/i.test(narration[key])) errors.push(`narration.${key} must be a SHA-256 hex digest`);
    for (const key of ['modelRevision', 'modelFallbackFrom', 'modelFallbackReason']) if (narration[key] !== undefined && (typeof narration[key] !== 'string' || !narration[key])) errors.push(`narration.${key} must be a non-empty string`);
    if (narration.cueIsolated !== undefined && typeof narration.cueIsolated !== 'boolean') errors.push('narration.cueIsolated must be a boolean');
    if (narration.pronunciationOverrides !== undefined) {
      if (!isObject(narration.pronunciationOverrides)) errors.push('narration.pronunciationOverrides must be an object');
      else for (const [source, spoken] of Object.entries(narration.pronunciationOverrides)) {
        if (!source || typeof spoken !== 'string' || !spoken) errors.push('narration.pronunciationOverrides requires non-empty source and spoken text');
      }
    }
    if (narration.ownerRecordingOpening !== undefined) {
      const owner = narration.ownerRecordingOpening;
      if (!isObject(owner)) errors.push('narration.ownerRecordingOpening must be an object');
      else {
        const unknownOwnerKeys = unknownKeys(owner, new Set(['audio', 'sha256', 'cueCount', 'source']));
        if (unknownOwnerKeys.length) errors.push(`unknown narration.ownerRecordingOpening properties: ${unknownOwnerKeys.join(', ')}`);
        if (typeof owner.audio !== 'string' || !owner.audio) errors.push('narration.ownerRecordingOpening.audio is required');
        else if (!fs.existsSync(path.resolve(baseDir, owner.audio))) errors.push(`owner opening recording not found: ${owner.audio}`);
        if (!/^[0-9a-f]{64}$/i.test(owner.sha256 || '')) errors.push('narration.ownerRecordingOpening.sha256 must be a SHA-256 hex digest');
        if (!Number.isInteger(owner.cueCount) || owner.cueCount < 1) errors.push('narration.ownerRecordingOpening.cueCount must be a positive integer');
        if (owner.source !== 'owner-recording') errors.push('narration.ownerRecordingOpening.source must be owner-recording');
      }
    }
    if (narration.shortPauseSeconds !== undefined && (!Number.isFinite(narration.shortPauseSeconds) || narration.shortPauseSeconds < 0.2 || narration.shortPauseSeconds > 0.4)) errors.push('narration.shortPauseSeconds must be between 0.2 and 0.4');
    if (narration.sectionPauseSeconds !== undefined && (!Number.isFinite(narration.sectionPauseSeconds) || narration.sectionPauseSeconds < 0.4 || narration.sectionPauseSeconds > 0.65)) errors.push('narration.sectionPauseSeconds must be between 0.4 and 0.65');
  } else if (narration.mode === 'qwen3-tts') {
    const qwenModelLocks = new Map([
      ['Qwen/Qwen3-TTS-12Hz-0.6B-Base', '5d83992436eae1d760afd27aff78a71d676296fc'],
      ['Qwen/Qwen3-TTS-12Hz-1.7B-Base', 'fd4b254389122332181a7c3db7f27e918eec64e3'],
    ]);
    const selectedQwenModel = narration.modelId || 'Qwen/Qwen3-TTS-12Hz-0.6B-Base';
    if (!qwenModelLocks.has(selectedQwenModel)) errors.push('narration.modelId must be a locked Qwen3-TTS Base model');
    if (narration.modelRevision !== undefined && narration.modelRevision !== qwenModelLocks.get(selectedQwenModel)) errors.push('narration.modelRevision must match the locked Qwen3-TTS revision');
    if (narration.modelLocalPath !== undefined && (typeof narration.modelLocalPath !== 'string' || !narration.modelLocalPath)) errors.push('narration.modelLocalPath must be a non-empty string');
    if (narration.attentionImplementation !== undefined && !['sdpa', 'flash_attention_2'].includes(narration.attentionImplementation)) errors.push('narration.attentionImplementation must be sdpa or flash_attention_2');
    const qwenStyle = narration.style || 'neutral';
    if (!QWEN3_TTS_STYLE_MODES.includes(qwenStyle)) errors.push(`narration.style must be one of ${QWEN3_TTS_STYLE_MODES.join(', ')}`);
    if (qwenStyle === 'neutral' && (typeof narration.referenceAudio !== 'string' || narration.referenceAudio.length < 1)) errors.push('narration.referenceAudio is required for qwen3-tts neutral style');
    if (qwenStyle === 'neutral' && (typeof narration.referenceTranscript !== 'string' || narration.referenceTranscript.length < 1)) errors.push('narration.referenceTranscript is required for qwen3-tts neutral style');
    if (qwenStyle === 'auto' && (narration.referenceAudio !== undefined || narration.referenceAudioSha256 !== undefined || narration.referenceTranscript !== undefined)) errors.push('qwen3-tts auto style rejects caller-supplied reference fields');
    if (narration.promptBank !== undefined && (typeof narration.promptBank !== 'string' || narration.promptBank.length < 1)) errors.push('narration.promptBank must be a non-empty string');
    if (typeof narration.promptBank === 'string' && narration.promptBank.length > 0 && !fs.existsSync(path.resolve(baseDir, narration.promptBank))) errors.push(`prompt bank not found: ${narration.promptBank}`);
    if (narration.promptBank !== undefined && qwenStyle !== 'auto') errors.push('narration.promptBank is only valid for qwen3-tts auto style');
    if (qwenStyle !== 'auto' && narration.stylePlan !== undefined) errors.push('narration.stylePlan is only valid for qwen3-tts auto style');
    if (narration.stylePlan !== undefined) {
      if (!Array.isArray(narration.stylePlan)) errors.push('narration.stylePlan must be an array');
      else {
        const indexes = new Set();
        for (const [index, item] of narration.stylePlan.entries()) {
          if (!isObject(item) || unknownKeys(item, new Set(['segmentIndex', 'textSha256', 'style'])).length || !Object.hasOwn(item || {}, 'segmentIndex') || !Object.hasOwn(item || {}, 'textSha256') || !Object.hasOwn(item || {}, 'style')) errors.push(`narration.stylePlan[${index}] requires exactly segmentIndex, textSha256 and style`);
          if (!Number.isInteger(item?.segmentIndex) || item.segmentIndex < 0) errors.push(`narration.stylePlan[${index}].segmentIndex must be a non-negative integer`);
          else if (indexes.has(item.segmentIndex)) errors.push(`narration.stylePlan duplicates segmentIndex ${item.segmentIndex}`);
          else indexes.add(item.segmentIndex);
          if (!/^[0-9a-f]{64}$/.test(item?.textSha256 || '')) errors.push(`narration.stylePlan[${index}].textSha256 must be a lowercase SHA-256 digest`);
          if (!QWEN3_TTS_STYLES.includes(item?.style) || item.style === 'neutral') errors.push(`narration.stylePlan[${index}].style must be an explicit non-neutral Qwen role`);
        }
      }
    }
    if (narration.questionSentences !== undefined) {
      if (qwenStyle !== 'auto') errors.push('narration.questionSentences is only valid for qwen3-tts auto style');
      if (!Array.isArray(narration.questionSentences) || narration.questionSentences.length < 1 || narration.questionSentences.some((value) => typeof value !== 'string' || !value.trim() || !/[?？！]$/u.test(value.trim()))) errors.push('narration.questionSentences must be a non-empty unique question string array');
      else if (new Set(narration.questionSentences.map((value) => value.trim())).size !== narration.questionSentences.length) errors.push('narration.questionSentences must not contain duplicates');
    }
    if (narration.questionStyle !== undefined && !['question', 'viewer_question'].includes(narration.questionStyle)) errors.push('narration.questionStyle must be question or viewer_question');
    if (narration.referenceAudio !== undefined && (typeof narration.referenceAudio !== 'string' || narration.referenceAudio.length < 1)) errors.push('narration.referenceAudio must be a non-empty string');
    if (narration.referenceAudioSha256 !== undefined && !/^[0-9a-f]{64}$/i.test(narration.referenceAudioSha256)) errors.push('narration.referenceAudioSha256 must be a SHA-256 hex digest');
    if (narration.referenceTranscript !== undefined && (typeof narration.referenceTranscript !== 'string' || narration.referenceTranscript.length < 1)) errors.push('narration.referenceTranscript must be a non-empty string');
    if (typeof narration.referenceAudio === 'string' && narration.referenceAudio.length > 0 && !fs.existsSync(path.resolve(baseDir, narration.referenceAudio))) errors.push(`reference audio not found: ${narration.referenceAudio}`);
    if (narration.device !== undefined && narration.device !== 'cuda') errors.push('narration.device must be cuda for qwen3-tts');
    if (narration.seed !== undefined && (!Number.isInteger(narration.seed) || narration.seed < 0)) errors.push('narration.seed must be a non-negative integer');
    if (narration.maxAttempts !== undefined && (!Number.isInteger(narration.maxAttempts) || narration.maxAttempts < 1 || narration.maxAttempts > 12)) errors.push('narration.maxAttempts must be between 1 and 12');
    if (narration.prosodyProfile !== undefined && (typeof narration.prosodyProfile !== 'string' || narration.prosodyProfile.length < 1)) errors.push('narration.prosodyProfile must be a non-empty string');
    if (typeof narration.prosodyProfile === 'string' && narration.prosodyProfile.length > 0 && !fs.existsSync(path.resolve(baseDir, narration.prosodyProfile))) errors.push(`prosody profile not found: ${narration.prosodyProfile}`);
    if (narration.prosodyCandidates !== undefined && (!Number.isInteger(narration.prosodyCandidates) || narration.prosodyCandidates < 2 || narration.prosodyCandidates > 5)) errors.push('narration.prosodyCandidates must be between 2 and 5');
    if (narration.prosodyCandidates !== undefined && narration.prosodyProfile === undefined) errors.push('narration.prosodyCandidates requires narration.prosodyProfile');
    if (narration.prosodyProfile !== undefined && narration.prosodyCandidates === undefined) errors.push('narration.prosodyProfile requires narration.prosodyCandidates');
    if (narration.prosodyCandidates !== undefined && narration.maxAttempts !== undefined && narration.prosodyCandidates > narration.maxAttempts) errors.push('narration.prosodyCandidates cannot exceed narration.maxAttempts');
    if (narration.temperature !== undefined && (!Number.isFinite(narration.temperature) || narration.temperature <= 0 || narration.temperature > 0.95)) errors.push('narration.temperature must be greater than 0 and at most 0.95');
    if (narration.finalTempo !== undefined && (!Number.isFinite(narration.finalTempo) || narration.finalTempo < 1 || narration.finalTempo > 1.08)) errors.push('narration.finalTempo must be between 1 and 1.08');
    if (narration.maxSegmentChars !== undefined && (!Number.isInteger(narration.maxSegmentChars) || narration.maxSegmentChars < 80 || narration.maxSegmentChars > 220)) errors.push('narration.maxSegmentChars must be an integer between 80 and 220');
    if (narration.pitchCorrections !== undefined) {
      if (!Array.isArray(narration.pitchCorrections)) errors.push('narration.pitchCorrections must be an array');
      else {
        const correctionIds = new Set(); const correctionPhrases = new Set();
        for (const [index, correction] of narration.pitchCorrections.entries()) {
          const prefix = `narration.pitchCorrections[${index}]`;
          const unknown = unknownKeys(correction, new Set(['id', 'phrase', 'word', 'activeFractionStart', 'semitones', 'crossfadeSeconds']));
          if (!isObject(correction) || unknown.length || typeof correction.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(correction.id) || correctionIds.has(correction.id)) errors.push(`${prefix} requires a unique id and only supported properties`);
          if (typeof correction.phrase !== 'string' || !correction.phrase.trim()) errors.push(`${prefix}.phrase must be a non-empty string`);
          if (typeof correction.word !== 'string' || !correction.word.trim() || (typeof correction.phrase === 'string' && !correction.phrase.includes(correction.word))) errors.push(`${prefix}.word must be contained in phrase`);
          if (typeof correction.phrase === 'string' && correctionPhrases.has(correction.phrase)) errors.push(`${prefix}.phrase must be unique`);
          if (!Number.isFinite(correction.activeFractionStart) || correction.activeFractionStart < 0.35 || correction.activeFractionStart > 0.8) errors.push(`${prefix}.activeFractionStart must be between 0.35 and 0.8`);
          if (!Number.isFinite(correction.semitones) || correction.semitones <= 0 || correction.semitones > 4) errors.push(`${prefix}.semitones must be greater than 0 and at most 4`);
          if (!Number.isFinite(correction.crossfadeSeconds) || correction.crossfadeSeconds < 0.005 || correction.crossfadeSeconds > 0.03) errors.push(`${prefix}.crossfadeSeconds must be between 0.005 and 0.03`);
          if (typeof correction.id === 'string') correctionIds.add(correction.id);
          if (typeof correction.phrase === 'string') correctionPhrases.add(correction.phrase);
        }
      }
    }
    if (narration.criticalPhrases !== undefined) {
      if (!Array.isArray(narration.criticalPhrases) || narration.criticalPhrases.length === 0 || narration.criticalPhrases.some((phrase) => typeof phrase !== 'string' || !phrase.trim())) errors.push('narration.criticalPhrases must be a non-empty string array');
    }
    if (narration.criticalPhraseIsolation !== undefined && typeof narration.criticalPhraseIsolation !== 'boolean') errors.push('narration.criticalPhraseIsolation must be a boolean');
    if (narration.criticalPhraseIsolationTerms !== undefined) {
      if (!Array.isArray(narration.criticalPhraseIsolationTerms) || narration.criticalPhraseIsolationTerms.length === 0 || narration.criticalPhraseIsolationTerms.some((phrase) => typeof phrase !== 'string' || !phrase.trim()) || new Set(narration.criticalPhraseIsolationTerms).size !== narration.criticalPhraseIsolationTerms.length) errors.push('narration.criticalPhraseIsolationTerms must be a non-empty unique string array');
      else if (!Array.isArray(narration.criticalPhrases) || narration.criticalPhraseIsolationTerms.some((phrase) => !narration.criticalPhrases.includes(phrase))) errors.push('narration.criticalPhraseIsolationTerms must be members of criticalPhrases');
    }
    if (narration.pronunciationHints !== undefined && (!Array.isArray(narration.pronunciationHints) || narration.pronunciationHints.some((hint) => !isObject(hint) || unknownKeys(hint, new Set(['source', 'spoken'])).length || typeof hint.source !== 'string' || !hint.source || typeof hint.spoken !== 'string' || !hint.spoken))) errors.push('narration.pronunciationHints must contain source/spoken string pairs');
    if (narration.criticalPhraseModels !== undefined) {
      if (!Array.isArray(narration.criticalPhraseModels) || narration.criticalPhraseModels.length === 0 || narration.criticalPhraseModels.some((model) => !['small', 'medium'].includes(model)) || new Set(narration.criticalPhraseModels).size !== narration.criticalPhraseModels.length) errors.push('narration.criticalPhraseModels must be a non-empty array of unique values from small and medium');
    }
    if (narration.criticalPhraseAgreement !== undefined && !['all-models', 'at-least-one-model'].includes(narration.criticalPhraseAgreement)) errors.push('narration.criticalPhraseAgreement must be all-models or at-least-one-model');
  }
  if (narration.speechTempo !== undefined && (!Number.isFinite(narration.speechTempo) || narration.speechTempo < 0.5 || narration.speechTempo > 2)) errors.push('narration.speechTempo must be between 0.5 and 2');
  if (narration.removeSilence !== undefined && typeof narration.removeSilence !== 'boolean') errors.push('narration.removeSilence must be a boolean');
  if (narration.sentencePauseSeconds !== undefined && (!Number.isFinite(narration.sentencePauseSeconds) || narration.sentencePauseSeconds < 0 || narration.sentencePauseSeconds > 2)) errors.push('narration.sentencePauseSeconds must be between 0 and 2');
  if (narration.semanticPauseSeconds !== undefined && (!Number.isFinite(narration.semanticPauseSeconds) || narration.semanticPauseSeconds < 0 || narration.semanticPauseSeconds > 1)) errors.push('narration.semanticPauseSeconds must be between 0 and 1');
  if (narration.joinSafetySeconds !== undefined && (!Number.isFinite(narration.joinSafetySeconds) || narration.joinSafetySeconds < 0 || narration.joinSafetySeconds > 0.05)) errors.push('narration.joinSafetySeconds must be between 0 and 0.05');
  if (Number.isFinite(narration.sentencePauseSeconds) && Number.isFinite(narration.joinSafetySeconds) && narration.sentencePauseSeconds < narration.joinSafetySeconds) errors.push('narration.sentencePauseSeconds must be at least narration.joinSafetySeconds');
  if (Number.isFinite(narration.sentencePauseSeconds) && Number.isFinite(narration.semanticPauseSeconds) && narration.sentencePauseSeconds < narration.semanticPauseSeconds) errors.push('narration.sentencePauseSeconds must be at least narration.semanticPauseSeconds');
  if (Number.isFinite(narration.semanticPauseSeconds) && Number.isFinite(narration.joinSafetySeconds) && narration.semanticPauseSeconds < narration.joinSafetySeconds) errors.push('narration.semanticPauseSeconds must be at least narration.joinSafetySeconds');
  if (input.scriptFile !== undefined && typeof input.scriptFile !== 'string') errors.push('scriptFile must be a string');
  if (typeof input.scriptFile === 'string' && input.scriptFile.length > 0 && !fs.existsSync(path.resolve(baseDir, input.scriptFile))) errors.push(`scriptFile not found: ${input.scriptFile}`);
  if (input.scriptSource !== undefined && (typeof input.scriptSource !== 'string' || input.scriptSource.length < 1)) errors.push('scriptSource must be a non-empty string');
  if (typeof input.scriptSource === 'string' && input.scriptSource.length > 0 && !fs.existsSync(path.resolve(baseDir, input.scriptSource))) errors.push(`scriptSource not found: ${input.scriptSource}`);
  if (input.scriptSource && input.scriptFile) errors.push('scriptSource and scriptFile are mutually exclusive');
  if (input.assets !== undefined && typeof input.assets !== 'string') errors.push('assets must be a string');
  if (input.scenes !== undefined) {
    if (!Array.isArray(input.scenes) || input.scenes.length === 0) errors.push('scenes must be a non-empty array');
    else {
      const paperKeyframeProject = input.animationMode === 'ffmpeg-deterministic-keyframes-v1' || ['paper-cut-keyframe-v1', 'paper-cut-grok-storyboard-v2'].includes(input.videoDesign?.value?.visualAuthorityId) || ['paper-cut-keyframe-v1', 'paper-cut-grok-storyboard-v2'].includes(input.templateId);
      const durations = input.scenes.map((scene) => scene?.duration);
      const captionAnchors = input.scenes.map((scene) => scene?.captionAnchor);
      if (durations.some((value) => value !== undefined) && durations.some((value) => value === undefined)) errors.push('scene durations must be provided for all scenes or none');
      if (durations.some((value) => value !== undefined && (!Number.isFinite(value) || value <= 0))) errors.push('scene durations must be positive numbers');
      if (captionAnchors.some((value) => value !== undefined) && captionAnchors.some((value) => value === undefined)) errors.push('scene captionAnchor values must be provided for all scenes or none');
      if (!paperKeyframeProject && durations.some((value) => value !== undefined) && captionAnchors.some((value) => value !== undefined)) errors.push('scene duration and captionAnchor modes are mutually exclusive');
      if (captionAnchors.some((value) => value !== undefined && (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > 160))) errors.push('scene captionAnchor values must be strings between 2 and 160 characters');
      const normalizedAnchors = captionAnchors.filter((value) => typeof value === 'string').map((value) => value.normalize('NFC').replace(/\s+/gu, ''));
      if (new Set(normalizedAnchors).size !== normalizedAnchors.length) errors.push('scene captionAnchor values must be unique');
      if (input.scenes.some((scene) => !isObject(scene) || typeof scene.asset !== 'string' || scene.asset.length < 1)) errors.push('every scene requires a non-empty asset');
      const sceneKeys = new Set(['asset', 'duration', 'durationIntent', 'captionAnchor', 'zoom', 'panX', 'panY', 'camera', 'intensity', 'label', 'imageGenRecipe', 'imageGenRecipeHash', 'sceneEvidence', ...(paperKeyframeProject ? ['animation', 'shotDesign'] : [])]);
      if (input.scenes.some((scene) => unknownKeys(scene, sceneKeys).length > 0)) errors.push(`scenes only support the ${paperKeyframeProject ? 'paper keyframe' : 'legacy editorial'} scene contract`);
      for (const [index, scene] of input.scenes.entries()) {
        for (const key of ['zoom', 'panX', 'panY']) {
          if (scene?.[key] !== undefined && (!Number.isFinite(scene[key]) || (key === 'zoom' ? scene[key] < 1 || scene[key] > 1.25 : scene[key] < 0 || scene[key] > 1))) errors.push(`scene ${index + 1}.${key} is out of range`);
        }
        if (scene?.camera !== undefined && !SCENE_CAMERA_MODES.includes(scene.camera)) errors.push(`scene ${index + 1}.camera must be one of ${SCENE_CAMERA_MODES.join(', ')}`);
        if (scene?.intensity !== undefined && (!Number.isFinite(scene.intensity) || scene.intensity < 0 || scene.intensity > 1)) errors.push(`scene ${index + 1}.intensity is out of range`);
        if (scene?.label !== undefined && (typeof scene.label !== 'string' || scene.label.length < 1)) errors.push(`scene ${index + 1}.label must be a non-empty string`);
        if (paperKeyframeProject) {
          const sceneDuration = Number(scene?.duration);
          const intent = scene?.durationIntent;
          const normal = sceneDuration >= 2 && sceneDuration <= 3 && intent?.policy === 'target-2-3s' && intent?.exceptionReason === 'none';
          const boundaryException = sceneDuration >= 1.5 && sceneDuration <= 3.5 && intent?.policy === 'boundary-exception' && ['final-required-sentence', 'required-sentence-boundary'].includes(intent?.exceptionReason) && typeof intent?.boundaryEvidence === 'string' && intent.boundaryEvidence.trim().length > 0;
          if (!(normal || boundaryException) || !isObject(scene?.animation) || !isObject(scene?.shotDesign)) errors.push(`paper editorial scene ${index + 1} metadata is invalid: target duration is 2-3s; an attested required-sentence boundary may be 1.5-3.5s`);
        }
      }
    }
  }
  if (input.transitionContract !== undefined) {
    const transition = input.transitionContract;
    if (!isObject(transition) || transition.mode !== 'media-only' || !Array.isArray(transition.boundaries)) errors.push('transitionContract must define mode media-only and boundaries array');
    else {
      const transitionUnknown = unknownKeys(transition, new Set(['mode', 'frameAccounting', 'boundaries']));
      if (transitionUnknown.length) errors.push(`unknown transitionContract properties: ${transitionUnknown.join(', ')}`);
      const seen = new Set();
      for (const boundary of transition.boundaries) {
        const valid = isObject(boundary) && Number.isInteger(boundary.from) && Number.isInteger(boundary.to) && boundary.to === boundary.from + 1 && ['dip-to-black', 'slide-left', 'hard-cut'].includes(boundary.type) && Number.isInteger(boundary.frames);
        if (!valid) { errors.push('transitionContract boundaries are invalid'); continue; }
        const boundaryUnknown = unknownKeys(boundary, new Set(['from', 'to', 'type', 'frames', 'notes']));
        if (boundaryUnknown.length) errors.push(`unknown transition boundary properties: ${boundaryUnknown.join(', ')}`);
        const legacyFrames = boundary.type === 'dip-to-black' ? 6 : boundary.type === 'slide-left' ? 8 : 0;
        const permitted = boundary.type === 'hard-cut'
          ? boundary.frames === 0
          : boundary.frames === legacyFrames || (boundary.frames >= 10 && boundary.frames <= 14);
        if (!permitted) errors.push(`transition ${boundary.from}->${boundary.to} requires ${legacyFrames} legacy frames or 10-14 explicit frames`);
        if (seen.has(boundary.from)) errors.push(`duplicate transition boundary from scene ${boundary.from}`);
        seen.add(boundary.from);
      }
    }
  }
  if (input.motionEvidence !== undefined) {
    const evidence = input.motionEvidence;
    const validCameraLock = evidence?.camera?.mode === 'none' && evidence?.camera?.intensity === 0 && evidence?.camera?.zoom === 1 && evidence?.camera?.panX === 0.5 && evidence?.camera?.panY === 0.5;
    if (!isObject(evidence) || evidence.schema !== 'editorial-motion-evidence-v1' || !validCameraLock || !isObject(evidence.ffmpeg)) errors.push('motionEvidence must preserve the editorial-motion-evidence-v1 FFmpeg contract');
  }
  if (errors.length) throw new Error(`Invalid project config:\n- ${errors.join('\n- ')}`);
  return { ...input, narration, captionPreset: { ...(input.captionPreset || REFERENCE_CAPTION_PRESET) } };
}

/**
 * Validate and resolve a project-supplied thumbnail override. This is
 * intentionally synchronous so project loading fails closed before any
 * renderer work starts. The PNG IHDR and SHA-256 are checked from bytes,
 * avoiding a best-effort copy of a stale or malformed asset.
 */
export function validateThumbnailOverride(value, baseDir = process.cwd()) {
  const isObject = (candidate) => candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate);
  if (!isObject(value)) throw new Error('thumbnail must be an object');
  const allowed = new Set(['image', 'sha256', 'source', 'prompt', 'provenance']);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`unknown thumbnail properties: ${unknown.join(', ')}`);
  for (const key of ['image', 'sha256', 'source']) {
    if (typeof value[key] !== 'string' || !value[key].trim()) throw new Error(`thumbnail.${key} is required`);
  }
  if (!/^[a-f0-9]{64}$/i.test(value.sha256)) throw new Error('thumbnail.sha256 must be a SHA-256 hex digest');
  for (const key of ['prompt', 'provenance']) {
    if (value[key] !== undefined && (typeof value[key] !== 'string' || !value[key].trim())) throw new Error(`thumbnail.${key} must be a non-empty string`);
  }
  const imagePath = path.resolve(baseDir, value.image);
  if (path.extname(imagePath).toLowerCase() !== '.png') throw new Error('thumbnail.image must reference a PNG file');
  let bytes;
  try { bytes = fs.readFileSync(imagePath); } catch { throw new Error(`thumbnail.image not found: ${value.image}`); }
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature) || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('thumbnail.image must be a valid PNG');
  const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
  if (width !== 1080 || height !== 1920) throw new Error(`thumbnail.image must be 1080x1920 PNG (got ${width}x${height})`);
  const actualSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actualSha256 !== value.sha256.toLowerCase()) throw new Error('thumbnail.sha256 does not match thumbnail.image');
  return { ...value, imagePath, width, height, sha256: actualSha256 };
}

export function validateThumbnailContract(value, baseDir = process.cwd(), expected = {}) {
  const isObject = (candidate) => candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate);
  const exactKeys = (candidate, allowed, label) => {
    if (!isObject(candidate)) throw new Error(`${label} must be an object`);
    const unknown = Object.keys(candidate).filter((key) => !allowed.includes(key));
    if (unknown.length) throw new Error(`unknown ${label} properties: ${unknown.join(', ')}`);
  };
  const digest = (candidate, label) => {
    if (typeof candidate !== 'string' || !/^[a-f0-9]{64}$/u.test(candidate)) throw new Error(`${label} must be a lowercase SHA-256 digest`);
  };
  const resolveBoundFile = (relative, label) => {
    if (typeof relative !== 'string' || !relative.trim() || path.isAbsolute(relative)) throw new Error(`${label} must be a relative path`);
    const resolved = path.resolve(baseDir, relative);
    const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const insideWorkspace = path.relative(workspaceRoot, resolved);
    const insideProject = path.relative(path.resolve(baseDir), resolved);
    const allowed = (insideWorkspace && !insideWorkspace.startsWith('..') && !path.isAbsolute(insideWorkspace)) || (insideProject && !insideProject.startsWith('..') && !path.isAbsolute(insideProject));
    if (!allowed) throw new Error(`${label} escapes the project/automation workspace`);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`${label} is missing`);
    return resolved;
  };
  exactKeys(value, ['schema', 'layoutId', 'canvas', 'spokenCaptions', 'headline', 'aiDisclosure', 'source', 'tokens', 'renderer', 'output'], 'thumbnailContract');
  if (value.schema !== 'editorial-thumbnail-contract-v1' || value.layoutId !== 'reference-v3-caption-free-headline-v1') throw new Error('thumbnailContract schema/layout is unsupported');
  exactKeys(value.canvas, ['width', 'height'], 'thumbnailContract.canvas');
  if (value.canvas.width !== 1080 || value.canvas.height !== 1920) throw new Error('thumbnailContract canvas must be 1080x1920');
  if (value.spokenCaptions !== false) throw new Error('thumbnailContract must omit spoken captions');
  exactKeys(value.headline, ['required', 'line1', 'line2'], 'thumbnailContract.headline');
  if (value.headline.required !== true || !value.headline.line1?.trim() || !value.headline.line2?.trim()) throw new Error('thumbnailContract headline is required');
  if (expected.title && (value.headline.line1 !== expected.title.line1 || value.headline.line2 !== expected.title.line2)) throw new Error('thumbnailContract headline must equal project.title exactly');
  exactKeys(value.aiDisclosure, ['required', 'text'], 'thumbnailContract.aiDisclosure');
  if (value.aiDisclosure.required !== true || !value.aiDisclosure.text?.trim()) throw new Error('thumbnailContract AI disclosure is required');
  if (expected.aiDisclosureText && value.aiDisclosure.text !== expected.aiDisclosureText) throw new Error('thumbnailContract AI disclosure must equal the project disclosure exactly');
  exactKeys(value.source, ['image', 'sha256', 'role'], 'thumbnailContract.source');
  exactKeys(value.tokens, ['path', 'sha256'], 'thumbnailContract.tokens');
  exactKeys(value.renderer, ['id', 'version', 'script', 'sha256', 'config', 'configSha256'], 'thumbnailContract.renderer');
  exactKeys(value.output, ['image', 'sha256', 'bytes', 'width', 'height'], 'thumbnailContract.output');
  for (const [record, pathKey, label] of [[value.source, 'image', 'source'], [value.tokens, 'path', 'tokens'], [value.renderer, 'script', 'renderer'], [value.output, 'image', 'output']]) {
    digest(record.sha256, `thumbnailContract.${label}.sha256`);
    const file = resolveBoundFile(record[pathKey], `thumbnailContract.${label}.${pathKey}`);
    const bytes = fs.readFileSync(file);
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== record.sha256) throw new Error(`thumbnailContract ${label} SHA-256 mismatch`);
    if (label === 'output') {
      if (record.bytes !== bytes.length || record.width !== 1080 || record.height !== 1920 || bytes.length < 24 || bytes.readUInt32BE(16) !== 1080 || bytes.readUInt32BE(20) !== 1920) throw new Error('thumbnailContract output bytes/dimensions mismatch');
    }
  }
  digest(value.renderer.configSha256, 'thumbnailContract.renderer.configSha256');
  const rendererConfig = resolveBoundFile(value.renderer.config, 'thumbnailContract.renderer.config');
  const rendererConfigBytes = fs.readFileSync(rendererConfig);
  if (crypto.createHash('sha256').update(rendererConfigBytes).digest('hex') !== value.renderer.configSha256) throw new Error('thumbnailContract renderer config SHA-256 mismatch');
  let rendererInput;
  try { rendererInput = JSON.parse(rendererConfigBytes.toString('utf8').replace(/^\uFEFF/u, '')); } catch { throw new Error('thumbnailContract renderer config is invalid JSON'); }
  const configMatches = rendererInput.schema === 'editorial-thumbnail-source-v1'
    && rendererInput.layoutId === value.layoutId
    && rendererInput.spokenCaptions === value.spokenCaptions
    && JSON.stringify(rendererInput.headline) === JSON.stringify(value.headline)
    && JSON.stringify(rendererInput.aiDisclosure) === JSON.stringify(value.aiDisclosure)
    && JSON.stringify(rendererInput.source) === JSON.stringify(value.source)
    && JSON.stringify(rendererInput.tokens) === JSON.stringify(value.tokens)
    && rendererInput.output?.image === value.output.image;
  if (!configMatches) throw new Error('thumbnailContract does not match its locked renderer config');
  if (typeof value.source.role !== 'string' || !value.source.role.trim()) throw new Error('thumbnailContract.source.role is required');
  if (value.renderer.id !== 'deterministic-editorial-thumbnail' || value.renderer.version !== 1) throw new Error('thumbnailContract renderer is unsupported');
  if (expected.thumbnail && (expected.thumbnail.image !== value.output.image || expected.thumbnail.sha256 !== value.output.sha256)) throw new Error('thumbnail override must match thumbnailContract output exactly');
  return value;
}

export function discoverAssets(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile() && MEDIA_EXTENSIONS.has(path.extname(entry.name).toLowerCase())).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((entry) => path.join(dir, entry.name));
}

export function assertHandoffSceneAssetNames(assetPaths) {
  const reserved = new Set(['thumbnail.png', 'narration-retimed.m4a', 'render.mp4', 'captions.srt']);
  const byName = new Map();
  for (const assetPath of assetPaths) {
    const name = path.basename(assetPath);
    if (reserved.has(name.toLowerCase())) throw new Error(`Scene asset name is reserved for handoff use: ${name}`);
    const resolved = path.resolve(assetPath);
    const prior = byName.get(name.toLowerCase());
    if (prior && prior !== resolved) throw new Error(`Distinct scene assets share a handoff basename: ${name}`);
    byName.set(name.toLowerCase(), resolved);
  }
  return true;
}

export function parseSrt(source) {
  const blocks = source.trim() ? source.trim().split(/\r?\n\s*\r?\n/) : [];
  return blocks.map((block, i) => {
    const lines = block.split(/\r?\n/); const timingIndex = lines.findIndex((line) => line.includes('-->')); const m = timingIndex >= 0 ? lines[timingIndex].match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/) : null;
    if (!m) throw new Error(`Invalid SRT cue ${i + 1}`);
    const toSec = (v) => { const [h, mm, rest] = v.replace(',', '.').split(':'); return Number(h) * 3600 + Number(mm) * 60 + Number(rest); };
    const start = toSec(m[1]); const end = toSec(m[2]); if (!(end > start)) throw new Error(`SRT cue ${i + 1} has non-positive duration`);
    return { start, end, text: lines.slice(timingIndex + 1).join(' ').replace(/<[^>]+>/g, ' ').trim() };
  });
}

function graphemes(text) { return typeof Intl?.Segmenter === 'function' ? [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(text)].map((part) => part.segment) : [...text]; }
export function segmentCaptionText(text, maxChars = 14) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim(); if (!clean) return [];
  const tokens = clean.split(' '); const chunks = []; let current = '';
  for (const token of tokens) {
    const pieces = graphemes(token); while (pieces.length > maxChars) { if (current) { chunks.push(current); current = ''; } chunks.splice(chunks.length, 0, pieces.splice(0, maxChars).join('')); }
    const candidate = current ? `${current} ${pieces.join('')}` : pieces.join('');
    if (current && graphemes(candidate).length > maxChars) { chunks.push(current); current = pieces.join(''); } else current = candidate;
  }
  if (current) chunks.push(current); return chunks;
}
export function segmentCues(cues, maxChars = 14) {
  const out = []; for (const cue of cues) { const chunks = segmentCaptionText(cue.text, maxChars); const duration = Math.max(0.05, cue.end - cue.start) / Math.max(chunks.length, 1); chunks.forEach((text, i) => out.push({ text, start: cue.start + duration * i, end: i === chunks.length - 1 ? cue.end : cue.start + duration * (i + 1) })); } return out;
}

export function segmentReferenceCaptionCues(cues, rules = REFERENCE_CAPTION_RULES) {
  const maxWords = Number(rules.semanticMaxWords);
  const maxChars = Number(rules.semanticMaxGraphemes);
  const minChars = Number(rules.minGraphemesPerCue);
  const output = [];
  for (const cue of cues) {
    const clean = String(cue.text ?? '').replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    let chunks = splitKoreanCaptionText(clean, {
      maxWords,
      maxGraphemes: maxChars,
      minGraphemes: minChars,
      protectedTerms: rules.protectedTerms,
    });
    if (!verifyKoreanCaptionNumbers(clean, chunks)) {
      throw new Error('Korean caption segmentation changed a numeric expression');
    }
    const totalDuration = Number(cue.end) - Number(cue.start);
    const minimum = Number(rules.minDurationSeconds);
    const maximum = Number(rules.maxDurationSeconds);
    if (totalDuration - 1e-9 > chunks.length * maximum) {
      const alternatives = [];
      for (let limit = maxChars - 1; limit >= minChars; limit -= 1) {
        let candidate;
        try {
          candidate = splitKoreanCaptionText(clean, {
            maxWords,
            maxGraphemes: limit,
            minGraphemes: minChars,
            protectedTerms: rules.protectedTerms,
          });
        } catch {
          continue;
        }
        if (candidate.length > 1 && verifyKoreanCaptionNumbers(clean, candidate) && totalDuration + 1e-9 >= candidate.length * minimum && totalDuration - 1e-9 <= candidate.length * maximum) alternatives.push({ candidate, limit });
      }
      const target = Number(rules.targetDurationSeconds);
      alternatives.sort((left, right) => Math.abs(totalDuration / left.candidate.length - target) - Math.abs(totalDuration / right.candidate.length - target) || left.candidate.length - right.candidate.length || right.limit - left.limit);
      if (alternatives.length) chunks = alternatives[0].candidate;
    }
    const weights = chunks.map((text) => Math.max(1, graphemes(text).filter((part) => !/\s/.test(part)).length));
    if (totalDuration + 1e-9 < chunks.length * minimum || totalDuration - 1e-9 > chunks.length * maximum) throw new Error(`caption wiki segmentation cannot satisfy the duration bounds: ${totalDuration.toFixed(3)}s for ${chunks.length} chunk(s): ${clean}`);
    const durations = Array(chunks.length).fill(minimum);
    const wordAnchors = rules.wordAnchors === true && Array.isArray(cue.anchors)
      ? cue.anchors.filter((anchor) => Number.isFinite(Number(anchor.startChar)) && Number.isFinite(Number(anchor.endChar)) && Number(anchor.endChar) > Number(anchor.startChar) && Number.isFinite(Number(anchor.start)) && Number.isFinite(Number(anchor.end)))
      : [];
    // ASR word-anchor character offsets use letters and numbers only. Keep
    // caption chunk offsets in that exact coordinate space; counting Korean
    // sentence punctuation here shifts every following visual boundary even
    // though the locked spoken content is unchanged.
    const anchorCharacterLength = (value) => [...String(value).normalize('NFC').replace(/[^\p{L}\p{N}]/gu, '')].length;
    const chunkOffsets = [0];
    for (const chunk of chunks) chunkOffsets.push(chunkOffsets.at(-1) + anchorCharacterLength(chunk));
    const anchorBase = wordAnchors.length ? Math.min(...wordAnchors.map((anchor) => Number(anchor.startChar))) : 0;
    const anchorTimeAt = (position) => {
      const absolute = position + anchorBase;
      const anchor = wordAnchors.find((item) => absolute >= Number(item.startChar) && absolute <= Number(item.endChar));
      if (anchor) {
        const span = Number(anchor.endChar) - Number(anchor.startChar);
        return Number(anchor.start) + (Number(anchor.end) - Number(anchor.start)) * Math.max(0, Math.min(1, (absolute - Number(anchor.startChar)) / span));
      }
      const previous = wordAnchors.filter((item) => Number(item.endChar) < absolute).at(-1);
      const next = wordAnchors.find((item) => Number(item.startChar) > absolute);
      if (!previous) return Number(wordAnchors[0].start);
      if (!next) return Number(wordAnchors.at(-1).end);
      const span = Number(next.startChar) - Number(previous.endChar);
      return Number(previous.end) + (Number(next.start) - Number(previous.end)) * ((absolute - Number(previous.endChar)) / Math.max(1, span));
    };
    const anchorBoundaries = wordAnchors.length ? chunkOffsets.map(anchorTimeAt) : [];
    const useAnchors = anchorBoundaries.length === chunks.length + 1 && anchorBoundaries.every((value) => Number.isFinite(value)) && anchorBoundaries.every((value, index) => index === 0 || value >= anchorBoundaries[index - 1]);
    if (useAnchors) {
      // Preserve anchored internal boundaries. Leading/trailing sentence
      // silence belongs at the edges of the first/last visual cue; spreading
      // it across every chunk shifts each caption ahead of its spoken words.
      // Clamp each desired boundary only as much as the min/max duration
      // contract requires while reserving a feasible duration for the suffix.
      const boundaries = [Number(cue.start)];
      for (let index = 1; index < chunks.length; index += 1) {
        const remaining = chunks.length - index;
        const previous = boundaries.at(-1);
        const lower = Math.max(previous + minimum, Number(cue.end) - remaining * maximum);
        const upper = Math.min(previous + maximum, Number(cue.end) - remaining * minimum);
        if (upper + 1e-9 < lower) throw new Error('caption word anchors cannot satisfy the duration bounds');
        boundaries.push(Math.max(lower, Math.min(upper, anchorBoundaries[index])));
      }
      boundaries.push(Number(cue.end));
      for (let index = 0; index < chunks.length; index += 1) durations[index] = boundaries[index + 1] - boundaries[index];
    }
    let remaining = totalDuration - minimum * chunks.length;
    const active = new Set(chunks.map((_, index) => index));
    while (!useAnchors && remaining > 1e-9 && active.size) {
      const activeWeight = [...active].reduce((sum, index) => sum + weights[index], 0);
      let distributed = 0;
      for (const index of [...active]) {
        const capacity = maximum - durations[index];
        const delta = Math.min(capacity, remaining * weights[index] / activeWeight);
        durations[index] += delta;
        distributed += delta;
        if (capacity - delta <= 1e-9) active.delete(index);
      }
      if (distributed <= 1e-12) break;
      remaining -= distributed;
    }
    if (!useAnchors && remaining > 1e-7) throw new Error('caption wiki segmentation could not allocate bounded durations');
    if (!useAnchors) durations[durations.length - 1] += totalDuration - durations.reduce((sum, value) => sum + value, 0);
    let cursor = Number(cue.start);
    chunks.forEach((text, index) => {
      const start = cursor;
      const end = index === chunks.length - 1 ? Number(cue.end) : cursor + durations[index];
      const subcueAnchors = Array.isArray(cue.anchors) ? cue.anchors.filter((anchor) => Number(anchor.end) > start && Number(anchor.start) < end) : null;
      output.push({ ...cue, start, end, text, ...(subcueAnchors?.length ? { anchors: subcueAnchors } : {}) });
      cursor = end;
    });
  }
  if (output.some((cue) => cue.text.includes('\n') || graphemes(cue.text).length > maxChars)) throw new Error('caption wiki segmentation produced an invalid semantic cue');
  if (output.some((cue) => cue.end - cue.start + 1e-9 < rules.minDurationSeconds || cue.end - cue.start - 1e-9 > rules.maxDurationSeconds)) throw new Error('caption wiki segmentation produced a cue outside the duration bounds');
  return output;
}

function chooseKoreanDisplayBoundary(text, targetGraphemesPerLine, protectedTerms = []) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  const words = clean.split(' ');
  let best = null;
  for (let index = 1; index < words.length; index += 1) {
    if (!canSplitKoreanAt(words, index, { protectedTerms })) continue;
    const left = words.slice(0, index).join(' ');
    const right = words.slice(index).join(' ');
    const leftLength = graphemes(left).length;
    const rightLength = graphemes(right).length;
    const overflow = Math.max(0, leftLength - targetGraphemesPerLine) + Math.max(0, rightLength - targetGraphemesPerLine);
    const semanticPriority = koreanSplitPriority(words, index, { protectedTerms });
    const score = overflow * 100 + Math.abs(leftLength - rightLength) * 2 - semanticPriority;
    if (!best || score < best.score) best = { left, right, score, index };
  }
  return best;
}

function wrapCaptionBlock(text, targetGraphemesPerLine, protectedTerms = []) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (graphemes(clean).length <= targetGraphemesPerLine) return clean;
  const boundary = chooseKoreanDisplayBoundary(clean, targetGraphemesPerLine, protectedTerms);
  if (!boundary) throw new Error(`Caption has no allowed Korean line boundary: ${clean}`);
  return `${boundary.left}\n${boundary.right}`;
}

export function formatReferenceCaptionCues(cues, options = {}) {
  const maxCharsPerLine = Number(options.targetGraphemesPerLine ?? options.maxCharsPerLine ?? 16);
  const maxLines = Number(options.maxLines ?? 2);
  if (!Number.isInteger(maxCharsPerLine) || maxCharsPerLine < 1 || maxLines !== 2) throw new Error('reference captions require two positive, bounded lines');
  return cues.map((cue) => ({ ...cue, text: wrapCaptionBlock(cue.text, maxCharsPerLine, options.protectedTerms) }));
}

export function alignAuthoritativeCaptionCues(sourceCues, timingCues) {
  if (!Array.isArray(sourceCues) || !sourceCues.length) throw new Error('Authoritative caption source is empty');
  const timing = (Array.isArray(timingCues) ? timingCues : []).filter((cue) => Number.isFinite(Number(cue.start)) && Number.isFinite(Number(cue.end)) && Number(cue.end) > Number(cue.start));
  if (!timing.length) throw new Error('Narration timing produced no usable caption cues');
  const normalize = (value) => String(value || '').replace(/\s+/g, '');
  const normalizeAnchorText = (value) => String(value || '').normalize('NFC').replace(/[^\p{L}\p{N}]/gu, '');
  const sourceText = sourceCues.map((cue) => cue.text).join('');
  const timingText = timing.map((cue) => cue.text).join('');
  // Keep the accepted waveform timing, but project the authoritative Korean
  // sentence structure onto it. Visual subtitles may then split at semantic
  // boundaries without changing the locked narration or its total duration.
  if (normalize(timingText) === normalize(sourceText)) {
    const timingAnchors = timing
      .flatMap((cue) => Array.isArray(cue.anchors) ? cue.anchors : [])
      .filter((anchor) => Number.isFinite(Number(anchor.startChar))
        && Number.isFinite(Number(anchor.endChar))
        && Number(anchor.endChar) > Number(anchor.startChar)
        && Number.isFinite(Number(anchor.start))
        && Number.isFinite(Number(anchor.end)))
      .map((anchor) => ({ ...anchor }));
    const timingSpans = [];
    let timingCursor = 0;
    for (const cue of timing) {
      const length = normalize(cue.text).length;
      timingSpans.push({
        startChar: timingCursor,
        endChar: timingCursor + length,
        start: Number(cue.start),
        end: Number(cue.end),
      });
      timingCursor += length;
    }
    const projectedTimeAt = (position) => {
      const clamped = Math.max(0, Math.min(timingCursor, position));
      const span = timingSpans.find(
        (item) => clamped >= item.startChar && clamped <= item.endChar,
      ) ?? timingSpans.at(-1);
      if (span.endChar === span.startChar) return span.start;
      const ratio = (clamped - span.startChar) / (span.endChar - span.startChar);
      return span.start + (span.end - span.start) * Math.max(0, Math.min(1, ratio));
    };
    const anchoredTimeAt = (position) => {
      if (!timingAnchors.length) return null;
      const clamped = Math.max(0, Math.min(
        Number(timingAnchors.at(-1).endChar),
        position,
      ));
      const containing = timingAnchors.find((anchor) => clamped >= Number(anchor.startChar) && clamped <= Number(anchor.endChar));
      if (containing) {
        const span = Number(containing.endChar) - Number(containing.startChar);
        if (span <= 0) return Number(containing.start);
        const ratio = (clamped - Number(containing.startChar)) / span;
        return Number(containing.start) + (Number(containing.end) - Number(containing.start)) * ratio;
      }
      const previous = timingAnchors.filter((anchor) => Number(anchor.endChar) < clamped).at(-1);
      const next = timingAnchors.find((anchor) => Number(anchor.startChar) > clamped);
      if (!previous) return Number(timingAnchors[0].start);
      if (!next) return Number(timingAnchors.at(-1).end);
      const span = Number(next.startChar) - Number(previous.endChar);
      const ratio = span > 0 ? (clamped - Number(previous.endChar)) / span : 0;
      return Number(previous.end) + (Number(next.start) - Number(previous.end)) * ratio;
    };
    let sourceCursor = 0;
    let sourceAnchorCursor = 0;
    return sourceCues.map((cue) => {
      const startChar = sourceCursor;
      sourceCursor += normalize(cue.text).length;
      const anchorStartChar = sourceAnchorCursor;
      sourceAnchorCursor += normalizeAnchorText(cue.text).length;
      const anchoredStart = anchoredTimeAt(anchorStartChar);
      const anchoredEnd = anchoredTimeAt(sourceAnchorCursor);
      const start = anchoredStart ?? projectedTimeAt(startChar);
      const end = Math.max(start + 0.001, anchoredEnd ?? projectedTimeAt(sourceCursor));
      const cueAnchors = timingAnchors.filter((anchor) => Number(anchor.startChar) >= anchorStartChar
        && Number(anchor.startChar) < sourceAnchorCursor);
      return {
        start,
        end,
        text: String(cue.text),
        sourceTimingProjection: 'korean-authoritative-structure-v1',
        ...(cueAnchors.length ? { anchors: cueAnchors } : {}),
      };
    });
  }
  if (timing.length === sourceCues.length) {
    return sourceCues.map((cue, index) => ({
      ...timing[index],
      start: Number(timing[index].start),
      end: Number(timing[index].end),
      text: String(cue.text),
    }));
  }
  const sourceLengths = sourceCues.map((cue) => normalize(cue.text).length);
  const totalChars = sourceLengths.reduce((sum, length) => sum + length, 0);
  if (!totalChars) throw new Error('Authoritative caption source has no text');
  const anchors = timing.flatMap((cue) => Array.isArray(cue.anchors) ? cue.anchors : []).filter((anchor) => Number.isFinite(Number(anchor.startChar)) && Number.isFinite(Number(anchor.endChar)) && Number(anchor.endChar) > Number(anchor.startChar) && Number.isFinite(Number(anchor.start)) && Number.isFinite(Number(anchor.end)));
  const timeAt = (position) => {
    const clamped = Math.max(0, Math.min(totalChars, position));
    const anchor = anchors.find((item) => clamped >= Number(item.startChar) && clamped <= Number(item.endChar));
    if (anchor) return Number(anchor.start) + (Number(anchor.end) - Number(anchor.start)) * ((clamped - Number(anchor.startChar)) / (Number(anchor.endChar) - Number(anchor.startChar)));
    const scaled = (clamped / totalChars) * timing.length;
    const index = Math.min(timing.length - 1, Math.floor(scaled));
    const local = index === timing.length - 1 ? Math.min(1, scaled - index) : scaled - index;
    return Number(timing[index].start) + (Number(timing[index].end) - Number(timing[index].start)) * local;
  };
  let cursor = 0;
  return sourceCues.map((cue, index) => {
    const startChar = cursor;
    cursor += sourceLengths[index];
    const start = timeAt(startChar);
    const end = Math.max(start + 0.001, timeAt(cursor));
    const cueAnchors = anchors.filter((anchor) => Number(anchor.endChar) > startChar && Number(anchor.startChar) < cursor).map((anchor) => ({ ...anchor }));
    return { start, end, text: String(cue.text), ...(cueAnchors.length ? { anchors: cueAnchors } : {}) };
  });
}

function splitCaptionCueOnce(cue, options = {}) {
  const targetGraphemesPerLine = Number(options.targetGraphemesPerLine ?? options.maxCharsPerLine ?? 16);
  const minDurationSeconds = Number(options.minDurationSeconds ?? 0.6);
  const clean = String(cue.text ?? '').replace(/\s+/g, ' ').trim();
  const boundary = chooseKoreanDisplayBoundary(clean, targetGraphemesPerLine, options.protectedTerms);
  if (!boundary) throw new Error(`Caption cannot be pixel-split at an allowed Korean boundary: ${clean}`);
  const { left: head, right: tail } = boundary;
  const weights = [head, tail].map((text) => Math.max(1, graphemes(text).length));
  const duration = cue.end - cue.start;
  if (duration + 1e-9 < minDurationSeconds * 2) throw new Error(`Caption cannot be pixel-split without producing a cue shorter than ${minDurationSeconds}s: ${clean}`);
  const weightedTime = cue.start + duration * weights[0] / (weights[0] + weights[1]);
  const anchors = Array.isArray(cue.anchors) ? cue.anchors.filter((anchor) => Number.isFinite(Number(anchor.startChar)) && Number.isFinite(Number(anchor.endChar)) && Number.isFinite(Number(anchor.start)) && Number.isFinite(Number(anchor.end))) : [];
  const anchorCharacterLength = (value) => [...String(value).normalize('NFC').replace(/[^\p{L}\p{N}]/gu, '')].length;
  let desiredTime = weightedTime;
  if (anchors.length) {
    const absolute = Math.min(...anchors.map((anchor) => Number(anchor.startChar))) + anchorCharacterLength(head);
    const containing = anchors.find((anchor) => absolute >= Number(anchor.startChar) && absolute <= Number(anchor.endChar));
    if (containing) {
      const span = Number(containing.endChar) - Number(containing.startChar);
      desiredTime = Number(containing.start) + (Number(containing.end) - Number(containing.start)) * (span > 0 ? (absolute - Number(containing.startChar)) / span : 0);
    } else {
      const next = anchors.find((anchor) => Number(anchor.startChar) > absolute);
      const previous = anchors.filter((anchor) => Number(anchor.endChar) < absolute).at(-1);
      if (next && previous) desiredTime = Number(previous.end) + (Number(next.start) - Number(previous.end)) * ((absolute - Number(previous.endChar)) / Math.max(1, Number(next.startChar) - Number(previous.endChar)));
      else if (next) desiredTime = Number(next.start);
      else if (previous) desiredTime = Number(previous.end);
    }
  }
  const splitTime = Math.max(cue.start + minDurationSeconds, Math.min(cue.end - minDurationSeconds, desiredTime));
  const headAnchors = anchors.filter((anchor) => Number(anchor.end) > cue.start && Number(anchor.start) < splitTime);
  const tailAnchors = anchors.filter((anchor) => Number(anchor.end) > splitTime && Number(anchor.start) < cue.end);
  return [
    { ...cue, text: wrapCaptionBlock(head, targetGraphemesPerLine, options.protectedTerms), start: cue.start, end: splitTime, anchors: headAnchors },
    { ...cue, text: wrapCaptionBlock(tail, targetGraphemesPerLine, options.protectedTerms), start: splitTime, end: cue.end, anchors: tailAnchors },
  ];
}

export function splitOverflowingReferenceCaptionCues(cues, measurements, options = {}) {
  if (!Array.isArray(cues) || !Array.isArray(measurements) || cues.length !== measurements.length) throw new Error('caption overflow measurements must align with cues');
  const safeWidth = Number(options.safeWidth ?? 920);
  const outlineWidth = Number(options.outlineWidth ?? 5);
  let splitCount = 0;
  const next = [];
  cues.forEach((cue, index) => {
    const renderedWidth = Number(measurements[index]?.renderedWidth);
    if (!Number.isFinite(renderedWidth) || renderedWidth <= 0) throw new Error(`invalid caption measurement at cue ${index + 1}`);
    if (renderedWidth + outlineWidth * 2 <= safeWidth) next.push(cue);
    else {
      next.push(...splitCaptionCueOnce(cue, options));
      splitCount += 1;
    }
  });
  return { cues: next, splitCount };
}

export function allocateSceneFrames(totalFrames, sceneCount) { if (!Number.isInteger(sceneCount) || sceneCount <= 0) return []; if (sceneCount > totalFrames) throw new Error(`Cannot allocate ${sceneCount} scenes across ${totalFrames} frames without zero-length scenes`); const base = Math.floor(totalFrames / sceneCount); const remainder = totalFrames % sceneCount; return Array.from({ length: sceneCount }, (_, i) => base + (i < remainder ? 1 : 0)); }
export function allocateFramesFromDurations(totalFrames, durations) { if (!durations.length || durations.some((duration) => !(duration > 0))) throw new Error('scene durations must be positive'); const sum = durations.reduce((a, b) => a + b, 0); const raw = durations.map((duration) => duration / sum * totalFrames); const frames = raw.map(Math.floor); let remaining = totalFrames - frames.reduce((a, b) => a + b, 0); raw.map((value, i) => ({ i, fraction: value - frames[i] })).sort((a, b) => b.fraction - a.fraction).forEach(({ i }) => { if (remaining > 0) { frames[i] += 1; remaining -= 1; } }); if (frames.some((value) => value < 1)) throw new Error(`scene durations allocate a zero-frame scene across ${totalFrames} frames`); return frames; }
export function normalizeSceneDurations(scenes, totalDuration) { const sum = scenes.reduce((total, scene) => total + scene.duration, 0); if (!(sum > 0)) throw new Error('scene duration sum must be positive'); return scenes.map((scene) => ({ ...scene, duration: scene.duration * totalDuration / sum })); }

export function allocateSceneFramesFromCaptionAnchors(totalFrames, scenes, cues, fps = 30) {
  if (!Number.isInteger(totalFrames) || totalFrames < 1) throw new Error('caption-anchored scenes require a positive integer totalFrames');
  if (!Array.isArray(scenes) || scenes.length < 1 || scenes.some((scene) => typeof scene?.captionAnchor !== 'string')) throw new Error('caption-anchored scenes require captionAnchor on every scene');
  if (!Array.isArray(cues) || cues.length < 1) throw new Error('caption-anchored scenes require narration cues');
  if (!(Number.isFinite(fps) && fps > 0)) throw new Error('caption-anchored scenes require a positive fps');

  const normalize = (value) => String(value ?? '').normalize('NFC').replace(/\s+/gu, '');
  let flatText = '';
  const spans = [];
  cues.forEach((cue, cueIndex) => {
    const text = normalize(cue?.text);
    if (!text) return;
    const start = flatText.length;
    flatText += text;
    spans.push({ start, end: flatText.length, cueIndex, cue });
  });
  if (!flatText) throw new Error('caption-anchored scenes require non-empty cue text');

  let searchOffset = 0;
  const matched = scenes.map((scene, sceneIndex) => {
    const anchor = normalize(scene.captionAnchor);
    const position = flatText.indexOf(anchor, searchOffset);
    if (position < 0) throw new Error(`scene ${sceneIndex + 1} captionAnchor was not found in narration cues: ${scene.captionAnchor}`);
    const span = spans.find((candidate) => position >= candidate.start && position < candidate.end);
    if (!span) throw new Error(`scene ${sceneIndex + 1} captionAnchor could not be mapped to a cue`);
    searchOffset = position + anchor.length;
    const cueStart = Number(span.cue.start);
    const cueEnd = Number(span.cue.end);
    const cueFraction = (position - span.start) / Math.max(1, span.end - span.start);
    const start = Number.isFinite(cueStart) && Number.isFinite(cueEnd) && cueEnd > cueStart
      ? cueStart + (cueEnd - cueStart) * cueFraction
      : cueStart;
    return { cueIndex: span.cueIndex, start };
  });

  const boundaries = [0];
  for (let index = 1; index < matched.length; index += 1) {
    const frame = Math.max(1, Math.min(totalFrames - 1, Math.round(matched[index].start * fps)));
    if (frame <= boundaries[boundaries.length - 1]) throw new Error(`scene ${index + 1} captionAnchor collapses to a non-increasing frame boundary`);
    boundaries.push(frame);
  }
  boundaries.push(totalFrames);
  const frames = boundaries.slice(0, -1).map((start, index) => boundaries[index + 1] - start);
  if (frames.some((value) => value < 1) || frames.reduce((sum, value) => sum + value, 0) !== totalFrames) throw new Error('caption-anchored scene allocation did not cover the full narration timeline');
  return frames;
}

export function parseSilenceDetect(output) {
  const intervals = [];
  let start = null;
  for (const line of String(output).split(/\r?\n/)) {
    const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
    if (startMatch) { start = Number(startMatch[1]); continue; }
    const endMatch = line.match(/silence_end:\s*([0-9.]+)/);
    if (endMatch && start !== null) {
      const end = Number(endMatch[1]);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) intervals.push({ start, end });
      start = null;
    }
  }
  return intervals;
}

export function readPcm16WavSamples(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') return null;
  let offset = 12; let format = null; let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4); const size = buffer.readUInt32LE(offset + 4); const start = offset + 8;
    if (start + size > buffer.length) return null;
    if (id === 'fmt ' && size >= 16) format = { audioFormat: buffer.readUInt16LE(start), channels: buffer.readUInt16LE(start + 2), sampleRate: buffer.readUInt32LE(start + 4), bitsPerSample: buffer.readUInt16LE(start + 14) };
    if (id === 'data') data = buffer.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!format || format.audioFormat !== 1 || format.channels !== 1 || format.sampleRate !== 24000 || format.bitsPerSample !== 16 || !data || data.length % 2) return null;
  const samples = new Int16Array(data.length / 2);
  for (let index = 0; index < samples.length; index += 1) samples[index] = data.readInt16LE(index * 2);
  return { samples, sampleRate: format.sampleRate };
}

export function buildSilenceCuts(intervals, duration, retainedSeconds = 0.001) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(retainedSeconds) || retainedSeconds < 0) throw new Error('invalid silence-cut configuration');
  const cuts = [];
  let previousEnd = 0;
  for (const interval of intervals) {
    if (!interval || !Number.isFinite(interval.start) || !Number.isFinite(interval.end) || interval.start < previousEnd || interval.end <= interval.start || interval.end > duration + 0.01) throw new Error('invalid silence interval');
    const retained = Math.min(retainedSeconds, interval.end - interval.start);
    const start = interval.start + retained / 2;
    const end = interval.end - retained / 2;
    if (end > start) cuts.push({ start, end });
    previousEnd = interval.end;
  }
  return cuts;
}

export function isSentenceEndingText(text) {
  return /[.!?。！？…](?:["'”’」』】）)])*$/u.test(String(text).trim());
}

export function buildSentenceAwareSilenceCuts(intervals, duration, cues, options = {}) {
  const speechTempo = Number(options.speechTempo ?? 1);
  const sentencePauseSeconds = Number(options.sentencePauseSeconds ?? 0.3);
  const semanticPauseSeconds = Number(options.semanticPauseSeconds ?? options.joinSafetySeconds ?? 0.005);
  const joinSafetySeconds = Number(options.joinSafetySeconds ?? 0.005);
  if (
    !Number.isFinite(duration)
    || duration <= 0
    || !Number.isFinite(speechTempo)
    || speechTempo < 0.5
    || speechTempo > 2
    || !Number.isFinite(sentencePauseSeconds)
    || sentencePauseSeconds < 0
    || !Number.isFinite(semanticPauseSeconds)
    || semanticPauseSeconds < 0
    || !Number.isFinite(joinSafetySeconds)
    || joinSafetySeconds < 0
    || sentencePauseSeconds < semanticPauseSeconds
    || semanticPauseSeconds < joinSafetySeconds
    || sentencePauseSeconds < joinSafetySeconds
  ) throw new Error('invalid sentence-aware silence-cut configuration');
  const cueEnds = cues
    .filter((cue) => cue && Number.isFinite(cue.end))
    .map((cue) => ({ end: cue.end, sentenceBoundary: isSentenceEndingText(cue.text) }));
  const cuts = [];
  let previousEnd = 0;
  for (const interval of intervals) {
    if (!interval || !Number.isFinite(interval.start) || !Number.isFinite(interval.end) || interval.start < previousEnd || interval.end <= interval.start || interval.end > duration + 0.01) throw new Error('invalid silence interval');
    const matchedCueEnds = cueEnds.filter(({ end }) => end >= interval.start - 0.01 && end <= interval.end + 0.01);
    if (matchedCueEnds.length > 1) throw new Error('silence interval contains multiple caption boundaries');
    const sentenceBoundary = matchedCueEnds[0]?.sentenceBoundary === true;
    const semanticBoundary = matchedCueEnds.length === 1 && !sentenceBoundary;
    const outputPauseSeconds = sentenceBoundary ? sentencePauseSeconds : semanticBoundary ? semanticPauseSeconds : joinSafetySeconds;
    const retainedSeconds = outputPauseSeconds * speechTempo;
    if (retainedSeconds > interval.end - interval.start + 1e-9) throw new Error('silence interval is shorter than configured output pause');
    const start = interval.start + retainedSeconds / 2;
    const end = interval.end - retainedSeconds / 2;
    if (end > start) cuts.push({ start, end, sentenceBoundary, semanticBoundary, outputPauseSeconds: retainedSeconds / speechTempo });
    previousEnd = interval.end;
  }
  return cuts;
}

export function buildSentencePauseEdits(intervals, duration, cues, options = {}) {
  const targetPauseSeconds = Number(options.targetPauseSeconds ?? 0.45);
  const maxPauseSeconds = Number(options.maxPauseSeconds ?? 0.5);
  // ASR cue ends can trail/lead a detected silence onset by a few frames;
  // keep the match narrow enough to avoid crossing adjacent sentence cues.
  const toleranceSeconds = Number(options.toleranceSeconds ?? 0.05);
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(targetPauseSeconds) || targetPauseSeconds < 0 || !Number.isFinite(maxPauseSeconds) || maxPauseSeconds < targetPauseSeconds || !Number.isFinite(toleranceSeconds) || toleranceSeconds < 0) throw new Error('invalid sentence pause edit configuration');
  const cueEnds = cues.filter((cue) => cue && Number.isFinite(cue.end)).flatMap((cue, index) => {
    const text = String(cue.text ?? '').replace(/\s+/gu, ' ').trim();
    if (!text) return [];
    const matches = [...text.matchAll(/[.!?。！？…]+(?=\s|$)/gu)];
    if (!matches.length) return [];
    const durationSeconds = Math.max(0, Number(cue.end) - Number(cue.start || 0));
    return matches.map((match) => {
      const offset = Number(match.index || 0) + match[0].length;
      const fraction = Math.max(0, Math.min(1, offset / Math.max(1, text.length)));
      const boundaryNormalizedOffset = String(text.slice(0, offset)).normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '').length;
      return { cue, index, end: Number(cue.start || 0) + durationSeconds * fraction, sentenceBoundary: true, boundaryCharOffset: offset, boundaryNormalizedOffset };
    });
  });
  // A final question/statement is the end of the narration, not an
  // inter-sentence pause.  Keep every preceding punctuation boundary,
  // including a short line such as “한 달 뒤.”, while ignoring line breaks
  // that end in a comma or have no sentence punctuation.
  const sentenceEnds = cueEnds.filter((item) => item.sentenceBoundary);
  const interSentenceEnds = sentenceEnds.length > 0 ? sentenceEnds.slice(0, -1) : [];
  const samples = options.audioSamples instanceof Int16Array ? options.audioSamples : null;
  const sampleRate = Number(options.sampleRate ?? 24000);
  const searchRadiusSeconds = Number(options.searchRadiusSeconds ?? 0.3);
  const guardSeconds = Number(options.guardSeconds ?? 0.02);
  const tailPreserveSeconds = Number(options.tailPreserveSeconds ?? 0.08);
  const quietRunSeconds = Number(options.quietRunSeconds ?? 0.06);
  const silenceRmsThreshold = Number(options.silenceRmsThreshold ?? 0.004);
  const rmsWindowSeconds = Number(options.rmsWindowSeconds ?? 0.01);
  const unitSnapToleranceSeconds = Number(options.unitSnapToleranceSeconds ?? 0.3);
  const unitBoundaryTimes = Array.isArray(options.unitBoundaryTimes)
    ? options.unitBoundaryTimes.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
    : [];
  const wordAnchors = cues
    .flatMap((cue) => Array.isArray(cue?.anchors) ? cue.anchors : [])
    .filter((anchor) => Number.isFinite(Number(anchor.start))
      && Number.isFinite(Number(anchor.end))
      && Number(anchor.end) > Number(anchor.start))
    .map((anchor) => ({ start: Number(anchor.start), end: Number(anchor.end) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const snappedUnitBoundary = (boundaryTime) => {
    const matches = unitBoundaryTimes.map((time) => ({ time, distance: Math.abs(time - boundaryTime) })).sort((a, b) => a.distance - b.distance);
    return matches[0] && matches[0].distance <= unitSnapToleranceSeconds ? matches[0].time : null;
  };
  const anchorEndForBoundary = (boundary) => {
    const timedAnchors = (boundary.cue?.anchors || [])
      .filter((anchor) => Number.isFinite(Number(anchor.end)));
    const anchors = timedAnchors
      .filter((anchor) => Number.isFinite(Number(anchor.startChar))
        && Number.isFinite(Number(anchor.endChar))
        && Number(anchor.endChar) > Number(anchor.startChar)
        && Number.isFinite(Number(anchor.end)))
      .sort((a, b) => Number(a.endChar) - Number(b.endChar));
    if (!anchors.length) {
      const cueNormalizedLength = String(boundary.cue?.text || '').normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '').length;
      return Number(boundary.boundaryNormalizedOffset) === cueNormalizedLength && timedAnchors.length
        ? Math.max(...timedAnchors.map((anchor) => Number(anchor.end)))
        : null;
    }
    const cueStartChar = Math.min(...anchors.map((anchor) => Number(anchor.startChar)));
    const boundaryEndChar = cueStartChar + Number(boundary.boundaryNormalizedOffset || 0);
    const ending = anchors.filter((anchor) => Number(anchor.endChar) <= boundaryEndChar).at(-1);
    if (ending) return Number(ending.end);
    const containing = anchors.find((anchor) => Number(anchor.startChar) < boundaryEndChar && Number(anchor.endChar) >= boundaryEndChar);
    return containing ? Number(containing.end) : null;
  };
  const safePoint = (boundary) => {
    const cueEnd = Number(boundary.end);
    const boundaryAnchorEnd = anchorEndForBoundary(boundary);
    const lastAnchorEnd = boundaryAnchorEnd ?? cueEnd;
    // When ASR exposes two contiguous words, their shared timestamp is the
    // linguistic boundary. Inserting silence exactly there preserves both
    // words; searching forward would move the cut into the next word.
    if (boundaryAnchorEnd !== null) return { time: lastAnchorEnd, sourceKind: 'word-anchor-boundary' };
    const lowerBound = Math.max(cueEnd, lastAnchorEnd) + Math.max(0, guardSeconds) + Math.max(0, tailPreserveSeconds);
    if (!samples || !Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isFinite(searchRadiusSeconds) || searchRadiusSeconds <= 0) return { time: lowerBound, sourceKind: 'cue-tail-guard' };
    const nextAnchorStart = wordAnchors.find((anchor) => anchor.start > lastAnchorEnd + 1e-6)?.start ?? null;
    const center = Math.max(0, Math.min(samples.length - 1, Math.round(lowerBound * sampleRate)));
    const radius = Math.max(1, Math.round(searchRadiusSeconds * sampleRate));
    const window = Math.max(1, Math.round(rmsWindowSeconds * sampleRate));
    const quietRun = Math.max(window, Math.round(quietRunSeconds * sampleRate));
    const upperTime = nextAnchorStart === null
      ? lowerBound + searchRadiusSeconds
      : Math.min(lowerBound + searchRadiusSeconds, nextAnchorStart - 1 / sampleRate);
    const upperIndex = Math.min(samples.length - 1, Math.floor(upperTime * sampleRate));
    for (let index = Math.max(1, center); index <= upperIndex; index += 1) {
      let sum = 0; const start = Math.max(0, index - window); const end = Math.min(samples.length, index + window);
      for (let cursor = start; cursor < end; cursor += 1) { const value = samples[cursor] / 32768; sum += value * value; }
      const rms = Math.sqrt(sum / Math.max(1, end - start));
      const zeroCrossing = samples[index - 1] === 0 || samples[index] === 0 || (samples[index - 1] < 0) !== (samples[index] < 0);
      let quiet = rms <= silenceRmsThreshold;
      for (let cursor = index; quiet && cursor < Math.min(samples.length, index + quietRun); cursor += window) {
        let local = 0; const localEnd = Math.min(samples.length, cursor + window);
        for (let sample = cursor; sample < localEnd; sample += 1) { const value = samples[sample] / 32768; local += value * value; }
        quiet = Math.sqrt(local / Math.max(1, localEnd - cursor)) <= silenceRmsThreshold;
      }
      // ASR word ends regularly precede the audible Korean vowel/release tail.
      // Preserve an explicit tail window, then require a sustained low-energy
      // run. Never fall back to a radius endpoint inside the following word.
      if (quiet && zeroCrossing) return { time: index / sampleRate, sourceKind: 'tail-safe-rms-zero-crossing' };
    }
    return null;
  };
  const edits = [];
  let previousEnd = 0;
  let intervalCursor = 0;
  for (const interval of intervals) {
    if (!interval || !Number.isFinite(interval.start) || !Number.isFinite(interval.end) || interval.start < intervalCursor || interval.end <= interval.start || interval.end > duration + 0.01) throw new Error('invalid sentence pause interval');
    intervalCursor = interval.end;
  }
  const usedIntervals = new Set();
  for (const boundary of interSentenceEnds) {
    const boundaryTime = Number(boundary.end);
    const boundaryAnchorEnd = anchorEndForBoundary(boundary);
    const unitBoundary = snappedUnitBoundary(boundaryTime);
    const matches = intervals
      .map((interval, index) => ({ interval, index }))
      .filter(({ interval }) => interval && Number.isFinite(interval.start) && Number.isFinite(interval.end)
        && boundaryTime >= interval.start - toleranceSeconds && boundaryTime <= interval.end + toleranceSeconds
        // Low-energy Korean final vowels are sometimes reported as silence.
        // Reject any interval that begins before the ASR-confirmed final word
        // has ended; replacing it would amputate the sentence tail.
        && (boundaryAnchorEnd === null || interval.start >= boundaryAnchorEnd - 0.005)
        && !wordAnchors.some((anchor) => interval.start < anchor.end - 1e-6
          && interval.end > anchor.start + 1e-6))
      .sort((a, b) => Math.abs((a.interval.start + a.interval.end) / 2 - boundaryTime) - Math.abs((b.interval.start + b.interval.end) / 2 - boundaryTime));
    const matched = matches.find(({ index }) => !usedIntervals.has(index));
    if (unitBoundary !== null) {
      const insertionPoint = Math.max(previousEnd, Math.min(duration, unitBoundary));
      if (matched) usedIntervals.add(matched.index);
      edits.push({ start: insertionPoint, end: insertionPoint, sourcePauseSeconds: 0, outputPauseSeconds: Math.min(maxPauseSeconds, targetPauseSeconds), sentenceBoundary: true, sourceKind: 'qwen-unit-tail-preserved', boundaryCueIndex: boundary.index, boundaryCharOffset: boundary.boundaryCharOffset, boundaryTime, unitBoundaryTime: unitBoundary, unitSnapToleranceSeconds });
      previousEnd = insertionPoint;
    } else if (matched) {
      const { interval, index } = matched;
      const insertionPoint = Math.max(previousEnd, Math.min(duration, interval.end));
      if (insertionPoint < previousEnd - 1e-9) throw new Error('invalid sentence pause interval ordering');
      const naturalPauseSeconds = interval.end - interval.start;
      const outputPauseSeconds = Math.max(0, Math.min(maxPauseSeconds, targetPauseSeconds) - naturalPauseSeconds);
      usedIntervals.add(index);
      if (outputPauseSeconds > 1e-9) edits.push({ start: insertionPoint, end: insertionPoint, sourcePauseSeconds: 0, outputPauseSeconds, sentenceBoundary: true, sourceKind: 'detected-silence-extended', boundaryCueIndex: boundary.index, boundaryCharOffset: boundary.boundaryCharOffset, boundaryTime, sourceIntervalStart: interval.start, naturalPauseSeconds, targetPauseSeconds: Math.min(maxPauseSeconds, targetPauseSeconds) });
      previousEnd = insertionPoint;
    } else {
      const safe = safePoint(boundary);
      if (!safe || !Number.isFinite(safe.time)) throw new Error(`no tail-safe sentence pause point for cue ${boundary.index + 1}`);
      const insertionPoint = Math.max(previousEnd, Math.min(duration, safe.time));
      if (insertionPoint < previousEnd - 1e-9 || insertionPoint > duration + 1e-9) throw new Error('invalid semantic sentence insertion point');
      edits.push({ start: insertionPoint, end: insertionPoint, sourcePauseSeconds: 0, outputPauseSeconds: Math.min(maxPauseSeconds, targetPauseSeconds), sentenceBoundary: true, sourceKind: safe.sourceKind, boundaryCueIndex: boundary.index, boundaryCharOffset: boundary.boundaryCharOffset, boundaryTime, searchRadiusSeconds: samples ? searchRadiusSeconds : 0, guardSeconds: samples ? guardSeconds : 0, tailPreserveSeconds: samples ? tailPreserveSeconds : 0, quietRunSeconds: samples ? quietRunSeconds : 0, silenceRmsThreshold: samples ? silenceRmsThreshold : null });
      previousEnd = insertionPoint;
    }
  }
  edits.sort((a, b) => a.start - b.start || a.end - b.end);
  const boundaryIds = new Set();
  for (const [index, edit] of edits.entries()) {
    if (edit.end > edit.start + 1e-9) throw new Error('sentence pause edits must not delete source audio');
    const boundaryId = `${edit.boundaryCueIndex}:${edit.boundaryCharOffset}`;
    if (boundaryIds.has(boundaryId)) throw new Error(`duplicate sentence pause boundary ${boundaryId}`);
    boundaryIds.add(boundaryId);
    if (index > 0 && edit.start - edits[index - 1].start < 0.25) throw new Error('sentence pause edits collapse onto the same spoken boundary');
    const overlap = wordAnchors.find((anchor) => edit.start > anchor.start + 1e-6 && edit.start < anchor.end - 1e-6);
    if (overlap) throw new Error(`sentence pause point ${edit.start.toFixed(6)} overlaps spoken word ${overlap.start.toFixed(6)}-${overlap.end.toFixed(6)}`);
  }
  return edits;
}

export function remapCuesForSentencePauseEdits(cues, edits, speechTempo = 1) {
  if (!Number.isFinite(speechTempo) || speechTempo < 0.5 || speechTempo > 2) throw new Error('invalid sentence pause edit tempo');
  const map = (time, edge) => {
    let shift = 0;
    for (const edit of edits || []) {
      const mappingStart = edge === 'start' && Number.isFinite(edit.sourceIntervalStart) ? edit.sourceIntervalStart : edit.start;
      if (time < mappingStart) break;
      if (time <= edit.end) return ((edge === 'end' ? edit.start : edit.start + edit.outputPauseSeconds) + shift) / speechTempo;
      shift += edit.outputPauseSeconds - edit.sourcePauseSeconds;
    }
    return (time + shift) / speechTempo;
  };
  return cues.map((cue) => ({ ...cue, start: map(cue.start, 'start'), end: map(cue.end, 'end'), anchors: cue.anchors?.map((anchor) => ({ ...anchor, start: map(anchor.start, 'start'), end: map(anchor.end, 'end') })) }));
}

export function keptAudioSegments(duration, cuts) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('invalid audio duration');
  const segments = [];
  let cursor = 0;
  for (const cut of cuts) {
    if (!cut || !Number.isFinite(cut.start) || !Number.isFinite(cut.end) || cut.start < cursor || cut.end <= cut.start || cut.end > duration + 0.01) throw new Error('invalid audio cut');
    if (cut.start > cursor) segments.push({ start: cursor, end: cut.start });
    cursor = cut.end;
  }
  if (cursor < duration) segments.push({ start: cursor, end: duration });
  return segments;
}

export function remapCuesForSpeechTempo(cues, cuts, speechTempo) {
  if (!Number.isFinite(speechTempo) || speechTempo < 0.5 || speechTempo > 2) throw new Error('invalid speech tempo');
  const remap = (time) => {
    let removed = 0;
    for (const cut of cuts) {
      if (time >= cut.end) removed += cut.end - cut.start;
      else if (time > cut.start) return (cut.start - removed) / speechTempo;
      else break;
    }
    return (time - removed) / speechTempo;
  };
  return cues.map((cue) => {
    const start = remap(cue.start);
    const end = remap(cue.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('caption cue collapsed during speech retiming');
    return { ...cue, start, end };
  });
}

function assTs(seconds) { const cs = Math.round(seconds * 100); const h = Math.floor(cs / 360000); const m = Math.floor((cs % 360000) / 6000); const s = Math.floor((cs % 6000) / 100); return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`; }
function escapeAssText(text) { return text.replace(/[{}\\]/g, (character) => `\\${character}`).replace(/\r?\n/g, '\\N'); }
function captionStyle(tokens, preset = REFERENCE_CAPTION_PRESET) {
  const caption = tokens.component.caption;
  if (tokens.primitive.font.weight !== 800 || tokens.semantic.captionScaleX !== 94) throw new Error('reference-v3 captions require static Noto Sans KR 800 at ScaleX 94');
  if (tokens.semantic.caption !== '#FFFFFF' || tokens.semantic.captionOutline !== '#000000' || caption.outlineWidth !== 5 || caption.shadow !== 0 || caption.background !== 'none') throw new Error('reference-v3 captions require white text, a 5px black outline, zero shadow, and a controlled background');
  const blackBox = preset.background === 'black' || tokens.semantic.captionBackground === 'black';
  if (!blackBox && tokens.semantic.captionBackground !== 'none') throw new Error('reference-v3 captions require no background');
  const borderStyle = blackBox ? 3 : 1;
  const outline = caption.outlineWidth;
  const backColour = blackBox ? '&H00000000' : '&HFF000000';
  return `Style: Caption,${tokens.primitive.font.family},${caption.fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,${backColour},1,0,0,0,${tokens.semantic.captionScaleX},100,0,0,${borderStyle},${outline},${caption.shadow},2,80,80,520,1`;
}
export function buildCalibrationAss(cues, tokens, preset = REFERENCE_CAPTION_PRESET) {
  const caption = tokens.component.caption;
  const events = cues.map((cue, index) =>
    `Dialogue: 0,${assTs(index)},${assTs(index + 0.99)},Caption,,0,0,0,,{\\an2\\pos(${caption.x},${caption.y})\\fscx${tokens.semantic.captionScaleX}}${escapeAssText(cue.text)}`,
  );
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${tokens.primitive.canvas.width}\nPlayResY: ${tokens.primitive.canvas.height}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n${captionStyle(tokens)}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.join('\n')}\n`;
}
export function buildAss(cues, tokens, preset = REFERENCE_CAPTION_PRESET) {
  const c = tokens.component.caption; const safe = tokens.semantic.safeWidth; const events = [];
  for (const cue of cues) {
    if (!Number.isFinite(cue.renderedWidth) || cue.renderedWidth <= 0 || !Number.isFinite(cue.textX)) throw new Error(`Caption is missing libass pixel calibration: ${cue.text}`);
    const visualWidth = cue.renderedWidth + c.outlineWidth * 2;
    if (visualWidth > safe) throw new Error(`Caption cannot fit inside the ${safe}px safe width with its ${c.outlineWidth}px outline (rendered width ${visualWidth}px): ${cue.text}`);
    const escaped = escapeAssText(cue.text);
    events.push(`Dialogue: 0,${assTs(cue.start)},${assTs(cue.end)},Caption,,0,0,0,,{\\an2\\pos(${cue.textX.toFixed(2)},${c.y})\\fscx${tokens.semantic.captionScaleX}}${escaped}`);
  }
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${tokens.primitive.canvas.width}\nPlayResY: ${tokens.primitive.canvas.height}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n${captionStyle(tokens)}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.join('\n')}\n`;
}

export function escapeFilterPath(value) { return String(value).replaceAll('\\', '/').replaceAll(':', '\\:').replaceAll("'", "\\'").replaceAll('[', '\\[').replaceAll(']', '\\]').replaceAll(',', '\\,').replaceAll('%', '\\%'); }
export function thumbnailSeek(totalFrames, duration) { return totalFrames <= 1 ? 0 : Math.min(0.5, Math.max(0, duration / 2)); }
export function createVersionId() { return `${Date.now().toString(36)}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`; }
export async function writeAtomic(filePath, data) {
  const temp = `${filePath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fsp.writeFile(temp, data, 'utf8');
    await fsp.rename(temp, filePath);
  } finally {
    await fsp.rm(temp, { force: true }).catch(() => undefined);
  }
}
export function isVideoAsset(filePath) { return VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase()); }

/**
 * Build deterministic, aspect-fill framing for motion assets. `n` is FFmpeg's
 * zero-based frame number, so every camera path is repeatable at 30fps.
 * Push/pull changes scale by at most 8%, drifts move the crop window by at most
 * 35% of the available excess, and handheld adds a small sinusoidal translation.
 */
export function buildMotionCameraFilter({ camera = 'none', intensity = 0.5, width = 1080, height = 972, frames = 1 } = {}) {
  if (!SCENE_CAMERA_MODES.includes(camera)) throw new Error(`unsupported scene camera: ${camera}`);
  if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) throw new Error('scene camera intensity must be between 0 and 1');
  if (!Number.isInteger(width) || width < 2 || !Number.isInteger(height) || height < 2 || !Number.isInteger(frames) || frames < 1) throw new Error('scene camera dimensions and frame count must be positive integers');
  const aspectFill = `scale=${width}:${height}:force_original_aspect_ratio=increase`;
  if (camera === 'none') return `${aspectFill},crop=${width}:${height}:(in_w-out_w)/2:(in_h-out_h)/2`;
  const normalizedIntensity = Number(intensity).toFixed(6);
  const denominator = Math.max(1, frames - 1);
  const progress = `(n/${denominator})`;
  let zoom = '1';
  let x = '0.5';
  let y = '0.5';
  if (camera === 'push-in') zoom = `1+0.08*${normalizedIntensity}*${progress}`;
  if (camera === 'pull-out') zoom = `1+0.08*${normalizedIntensity}*(1-${progress})`;
  if (camera === 'drift-left') x = `0.5-0.35*${normalizedIntensity}*(2*${progress}-1)`;
  if (camera === 'drift-right') x = `0.5+0.35*${normalizedIntensity}*(2*${progress}-1)`;
  if (camera === 'handheld') {
    zoom = `1+0.02*${normalizedIntensity}`;
    x = `0.5+0.06*${normalizedIntensity}*sin(n*0.37)`;
    y = `0.5+0.045*${normalizedIntensity}*cos(n*0.29)`;
  }
  return `${aspectFill},scale=w='ceil(iw*(${zoom})/2)*2':h='ceil(ih*(${zoom})/2)*2':eval=frame,crop=${width}:${height}:x='(in_w-out_w)*(${x})':y='(in_h-out_h)*(${y})'`;
}

export function buildEditableTrackContract({ scriptAsset, scriptSha256, narrationAsset, visualTrackCount, captionCueCount, bgmAsset = null, bgmRequired = false }) {
  if (typeof narrationAsset !== 'string' || !narrationAsset) throw new Error('editable handoff requires a narration asset');
  if (!Number.isInteger(visualTrackCount) || visualTrackCount < 1) throw new Error('editable handoff requires at least one visual track');
  if (!Number.isInteger(captionCueCount) || captionCueCount < 1) throw new Error('editable handoff requires caption cues');
  if (scriptAsset !== null && (typeof scriptAsset !== 'string' || !scriptAsset)) throw new Error('editable handoff script asset is invalid');
  if (bgmAsset !== null && (typeof bgmAsset !== 'string' || !bgmAsset)) throw new Error('editable handoff BGM asset is invalid');
  return Object.freeze({
    version: 'opencut-editable-tracks-v1',
    script: { status: scriptAsset ? 'ready' : 'missing', asset: scriptAsset, sha256: scriptSha256 || null, representation: 'authoritative-json' },
    narration: { status: 'ready', asset: narrationAsset, trackType: 'audio' },
    visuals: { status: 'ready', trackType: 'video', trackCount: visualTrackCount },
    captions: { status: 'ready', representation: 'editable-cues', cueCount: captionCueCount },
    bgm: { status: bgmAsset ? 'ready' : 'pending', asset: bgmAsset, trackType: 'audio', required: Boolean(bgmRequired) },
  });
}
