import crypto from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/u;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const stableStringify = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hashArtifact = (value) => sha256(Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'));
const hashCanonical = (value) => sha256(Buffer.from(stableStringify(value), 'utf8'));
const SCENE_ROLES = new Set(['ordinary_baseline', 'breach_state', 'spatial_context', 'relationship_map', 'evidence_record', 'discovery_timeline', 'investigation_progress', 'legal_comparison', 'victim_aftermath', 'return_test']);
const SOURCE_KINDS = new Set(['real_source', 'derived_diagram', 'labeled_reconstruction']);
const EVIDENCE_STATUSES = new Set(['confirmed', 'statement', 'allegation', 'inference']);
const IDENTITY_RULES = new Set(['anonymous-role-only', 'public-figure-source-bound', 'no-person']);
const REDACTION_RULES = new Set(['redact-identifiers', 'source-approved-visible', 'not-applicable']);
const AGENT_DESIGN_CONTRACT = 'newsroom-primary-agent-video-design-v8-two-stage-color-storyboard-authority';
const MOTION_LIBRARY_IDS = new Set(['constellation-network-build', 'beat-timeline-rows', 'vertical-investigation-flow', 'map-route-draw', 'document-marker-scan', 'before-after-divider-wipe', 'stacked-panel-directional-wipe', 'audit-grid-population', 'legal-track-barrier', 'return-rail']);
const OUTPUT_LAYOUT = Object.freeze({ canvas: { width: 1080, height: 1920, fps: 24 }, title: { x: 540, line1Y: 201, line2Y: 326, safeWidth: 920, fontSizes: [120, 143] }, media: { x: 54, y: 474, width: 972, height: 972, fit: 'cover', sideGutters: 54 }, captions: { fontSize: 88, safeWidth: 920, x: 540, y: 1400, maxLines: 2 } });

function assertHash(value, label) {
  if (!SHA256.test(String(value || ''))) throw new Error(`${label} must be a SHA-256 hash`);
}

function assertPathFree(value, label = 'LLM-facing content', key = '') {
  if (typeof value === 'string') {
    if (/https?:\/\//iu.test(value) || /(?:^|[\\/])(?:[a-z]:)?[\\/]/iu.test(value)) throw new Error(`${label} contains a URL or filesystem path`);
    return;
  }
  if (Array.isArray(value)) { value.forEach((item) => assertPathFree(item, label, key)); return; }
  if (!isObject(value)) return;
  for (const [name, item] of Object.entries(value)) {
    if (/(?:^|_)(?:path|url|uri|root|filename|file|directory|realpath)(?:$|_)/iu.test(name)) throw new Error(`${label} contains forbidden path field ${name}`);
    assertPathFree(item, label, name);
  }
}

function narrationAuthority(narrationManifest, videoDesignNarrationAuthority, scriptDraft) {
  if (!isObject(narrationManifest)) throw new Error('Narration manifest is required for motion-documentary planning');
  if (narrationManifest.schema !== 'newsroom-narration-manifest-v2') throw new Error('Narration manifest schema is invalid for motion-documentary planning');
  if (narrationManifest.status !== 'machine-accepted-locked') throw new Error('Narration manifest is not locked');
  if (!Array.isArray(narrationManifest.cues) || narrationManifest.cues.length < 1) throw new Error('Narration manifest has no locked timing cues');
  let cueScriptCursor = 0; let cueAuthorityCursor = 0;
  const timingProjection = {
    audioSha256: narrationManifest.audioSha256,
    durationSeconds: Number(narrationManifest.durationSeconds),
    cues: narrationManifest.cues.map((cue, index) => {
      const text = String(cue.text || ''); const scriptStartChar = scriptDraft.indexOf(text, cueScriptCursor); if (scriptStartChar < 0) throw new Error(`Narration cue ${index + 1} is not an ordered exact script substring`); cueScriptCursor = scriptStartChar + text.length;
      const authorityStartChar = cueAuthorityCursor; const authorityEndChar = authorityStartChar + text.replace(/[\s\p{P}\p{S}]/gu, '').length; cueAuthorityCursor = authorityEndChar;
      const normalized = { start: Number(cue.start), end: Number(cue.end), text, style: String(cue.style || ''), sectionIndex: Number(cue.sectionIndex), scriptStartChar, scriptEndChar: scriptStartChar + text.length, authorityStartChar, authorityEndChar, anchors: (cue.anchors || []).map((anchor) => ({ startChar: Number(anchor.startChar), endChar: Number(anchor.endChar), start: Number(anchor.start), end: Number(anchor.end) })) };
      if (!(normalized.start >= 0) || !(normalized.end > normalized.start) || !normalized.text) throw new Error(`Narration cue ${index + 1} timing is invalid`);
      if (!normalized.anchors.length || normalized.anchors.some((anchor) => !Number.isSafeInteger(anchor.startChar) || !Number.isSafeInteger(anchor.endChar) || anchor.startChar < normalized.authorityStartChar || anchor.endChar <= anchor.startChar || anchor.endChar > normalized.authorityEndChar || !(anchor.start >= normalized.start) || !(anchor.end > anchor.start) || anchor.end > normalized.end)) throw new Error(`Narration cue ${index + 1} character anchors are invalid`);
      return normalized;
    }),
  };
  const authority = {
    audioSha256: narrationManifest.audioSha256,
    timingSha256: hashCanonical(timingProjection),
    durationSeconds: Number(narrationManifest.durationSeconds),
    cueCount: narrationManifest.cues.length,
  };
  assertHash(authority.audioSha256, 'Narration audio authority');
  assertHash(authority.timingSha256, 'Narration timing authority');
  if (!(authority.durationSeconds > 0) || !Number.isSafeInteger(authority.cueCount) || authority.cueCount < 1) throw new Error('Narration timing authority is invalid');
  if (isObject(videoDesignNarrationAuthority) && (videoDesignNarrationAuthority.audioSha256 !== authority.audioSha256 || videoDesignNarrationAuthority.timingSha256 !== authority.timingSha256 || Number(videoDesignNarrationAuthority.durationSeconds) !== authority.durationSeconds)) throw new Error('Narration manifest drifted from compiled video-design timing authority');
  return authority;
}

function sceneSpans(scene, index) {
  if (!Array.isArray(scene.spanBindings) || scene.spanBindings.length < 1) throw new Error(`Scene ${index + 1} must bind compiled evidence spans`);
  return scene.spanBindings.map((span, bindingIndex) => {
    if (!isObject(span) || typeof span.spanId !== 'string' || !span.spanId) throw new Error(`Scene ${index + 1} evidence binding ${bindingIndex + 1} has no span ID`);
    if (!Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || span.start < 0 || span.end <= span.start) throw new Error(`Scene ${index + 1} evidence binding ${bindingIndex + 1} is invalid`);
    return { spanId: span.spanId, start: span.start, end: span.end };
  });
}

function baseInputs({ authorityHash, script, bundleFileSha, videoDesign, videoDesignSerializedSha256, narrationManifest }) {
  assertHash(authorityHash, 'Production authority');
  assertHash(bundleFileSha, 'Evidence bundle');
  if (!isObject(script) || typeof script.draft !== 'string' || !script.draft.trim()) throw new Error('Final script is required');
  if (!isObject(videoDesign) || videoDesign.schema !== 'video-design-v7-two-stage-color-storyboard' || videoDesign.contractRevision !== 'evidence-motion-documentary-v12-two-stage-color-storyboard' || !isObject(videoDesign.storyline) || videoDesign.storyline.schema !== 'newsroom-storyline-v2' || videoDesign.storyline.approval?.approved !== true || videoDesign.storyline.approval?.status !== 'admitted' || videoDesign.semanticCutPlan?.schema !== 'newsroom-semantic-cut-plan-v2' || videoDesign.storyboardAdmission?.schema !== 'newsroom-color-storyboard-admission-v2' || !Array.isArray(videoDesign.scenes) || !videoDesign.scenes.length || !Array.isArray(videoDesign.storyboardAssets) || videoDesign.storyboardAssets.length !== videoDesign.scenes.length) throw new Error('Approved two-stage storyline/cut/board Grok video design is required');
  if (stableStringify(videoDesign.outputLayout) !== stableStringify(OUTPUT_LAYOUT) || stableStringify(videoDesign.titleTrack) !== stableStringify(OUTPUT_LAYOUT.title) || stableStringify(videoDesign.captionTrack) !== stableStringify(OUTPUT_LAYOUT.captions)) throw new Error('Compiled video output layout/title/caption geometry is invalid');
  if (!isObject(videoDesign.generationOrder) || videoDesign.generationOrder.phase1 !== 'approved-rough-sketches' || videoDesign.generationOrder.phase2 !== 'approved-color-storyboards-from-rough-plus-character-masters' || videoDesign.generationOrder.requireApprovedColorStoryboards !== true || videoDesign.generationOrder.requireStoryboardProvenance !== true || !Array.isArray(videoDesign.storyboardAssets) || videoDesign.storyboardAssets.some((asset) => asset.role !== 'color-storyboard' || asset.generationMode !== 'approved-color-storyboard' || !asset.provenance?.roughStoryboard || !Array.isArray(asset.provenance?.characterMasters) || asset.provenance.characterMasters.length > 3 || asset.approval?.approved !== true || asset.approval?.status !== 'admitted' || !/^[a-f0-9]{64}$/u.test(String(asset.approval?.sha256 || '')) || !Number.isSafeInteger(asset.approval?.bytes) || asset.approval.bytes <= 0 || typeof asset.output !== 'string' || asset.output !== `assets/storyboards/${asset.storyboardAssetId}.png` || !/^[a-f0-9]{64}$/u.test(String(asset.outputSha256 || '')) || asset.outputSha256 !== asset.approval.sha256) || !Array.isArray(videoDesign.commonMasterAssets) || videoDesign.commonMasterAssets.some((asset) => asset.role !== 'character' || asset.approval?.approved !== true || asset.approval?.status !== 'admitted' || !/^[a-f0-9]{64}$/u.test(String(asset.approval?.sha256 || '')) || !Number.isSafeInteger(asset.approval?.bytes) || asset.approval.bytes <= 0 || typeof asset.output !== 'string' || asset.output !== `assets/masters/${asset.masterAssetId}.png` || !/^[a-f0-9]{64}$/u.test(String(asset.outputSha256 || '')) || asset.outputSha256 !== asset.approval.sha256)) throw new Error('Compiled color storyboard or character masters are missing or not admitted before Grok generation');
  const narration = narrationAuthority(narrationManifest || videoDesign.narrationAuthority, videoDesign.narrationAuthority, script.draft);
  const scriptSha256 = sha256(Buffer.from(script.draft, 'utf8'));
  const videoDesignSha256 = videoDesignSerializedSha256 || hashArtifact(videoDesign);
  assertHash(videoDesignSha256, 'Serialized video design artifact');
  if (videoDesignSerializedSha256 && videoDesignSerializedSha256 !== hashArtifact(videoDesign)) throw new Error('Serialized video design bytes do not match the supplied compiled design');
  const designAuthorshipContract = videoDesign.authorshipContract || null;
  if (designAuthorshipContract !== AGENT_DESIGN_CONTRACT) throw new Error('Video design authorship contract is stale or legacy');
  return { authorityHash, scriptSha256, evidenceBundleSha256: bundleFileSha, videoDesignSha256, narration, designAuthorshipContract };
}

function videoDesignStoryboardForScene(scene) {
  return { provenance: { characterMasters: scene.grokSceneClass === 'human-action' ? [{}] : [] } };
}

function sceneContract(scene, index, storyboardAssets = []) {
  if (!SCENE_ROLES.has(scene.sceneRole) || !SOURCE_KINDS.has(scene.sourceKind) || !EVIDENCE_STATUSES.has(scene.evidenceStatus)) throw new Error(`Scene ${index + 1} motion-documentary taxonomy is invalid`);
  if (!isObject(scene.privacy) || !IDENTITY_RULES.has(scene.privacy.identityRule) || !REDACTION_RULES.has(scene.privacy.redactionRule)) throw new Error(`Scene ${index + 1} privacy/redaction policy is invalid`);
  if (!isObject(scene.stateChange) || typeof scene.stateChange.startState !== 'string' || !scene.stateChange.startState.trim() || typeof scene.stateChange.endState !== 'string' || !scene.stateChange.endState.trim() || scene.stateChange.startState.trim() === scene.stateChange.endState.trim()) throw new Error(`Scene ${index + 1} state change is invalid`);
  if (typeof scene.narrationDelta !== 'string' || !scene.narrationDelta.trim() || typeof scene.visualInformationAdded !== 'string' || !scene.visualInformationAdded.trim()) throw new Error(`Scene ${index + 1} must add information beyond narration`);
  if (!isObject(scene.durationIntent) || !['target-2-3s', 'boundary-exception'].includes(scene.durationIntent.policy) || !['none', 'final-required-sentence', 'required-sentence-boundary'].includes(scene.durationIntent.exceptionReason) || typeof scene.durationIntent.boundaryEvidence !== 'string' || !scene.durationIntent.boundaryEvidence.trim()) throw new Error(`Scene ${index + 1} duration intent is invalid`);
  if (scene.sourceKind === 'real_source' && (!Array.isArray(scene.referenceIds) || scene.referenceIds.length < 1)) throw new Error(`Scene ${index + 1} real source is not authority-bound`);
  const expectedDisclosure = scene.sourceKind === 'labeled_reconstruction' ? '사건 내용 기반 AI 재구성' : scene.sourceKind === 'real_source' ? '출처 기반 자료' : '검증 사실 기반 도식'; if (scene.disclosure?.required !== true || scene.disclosure.text !== expectedDisclosure) throw new Error(`Scene ${index + 1} disclosure is invalid`);
  if (scene.implementationMode !== 'image_to_video_animation' || scene.motionGraphics !== null) throw new Error(`Scene ${index + 1} must use Grok image_to_video_animation with null motionGraphics`);
  const grok = scene.grokI2v;
  const refs = grok?.referenceImages; const board = videoDesignStoryboardForScene(scene); const provenanceCount = board?.provenance?.characterMasters?.length; const clip = grok?.clipSelection; const authored = scene.durationSeconds; if (!isObject(scene.imageGen) || scene.imageGen.composition?.aspect_ratio !== '1:1' || !isObject(grok) || grok.inputMode !== 'approved-color-storyboard-only-v1' || grok.aspectRatio !== '1:1' || grok.durationSeconds !== 6 || grok.sourceAcceptance?.requireSquare !== true || grok.sourceAcceptance?.minimumEdge !== 480 || grok.sourceAcceptance?.durationToleranceSeconds !== 0.1 || grok.normalization?.preserveSourceBytes !== true || grok.normalization?.width !== 480 || grok.normalization?.height !== 480 || grok.normalization?.fps !== 24 || grok.normalization?.scaleFilter !== 'lanczos' || grok.normalization?.audioPolicy !== 'discard-before-final-mux' || !Array.isArray(refs) || refs.length !== 1 || refs[0]?.role !== 'color-storyboard' || refs[0]?.generationMode !== 'approved-color-storyboard' || (scene.grokSceneClass === 'human-action' ? !(provenanceCount > 0) : provenanceCount !== 0) || scene.imageGen.sceneDirectionSpec?.references?.length || scene.imageGen.sceneDirectionSpec?.reference_ids?.length || clip?.mode !== 'semantic-qa-selected-window-v2-authored-duration-bound' || clip?.requireNarrationFit !== true || clip?.authoredDurationSeconds !== authored || clip?.durationToleranceSeconds !== 0.05 || Math.abs(clip.minimumSeconds - (authored - 0.05)) > 1e-6 || Math.abs(clip.maximumSeconds - (authored + 0.05)) > 1e-6 || grok.playbackRate !== 1) throw new Error(`Scene ${index + 1} color-storyboard-only Grok source contract is invalid`);
  return { sceneRole: scene.sceneRole, sourceKind: scene.sourceKind, evidenceStatus: scene.evidenceStatus, narrationDelta: scene.narrationDelta.trim(), visualInformationAdded: scene.visualInformationAdded.trim(), durationIntent: structuredClone(scene.durationIntent), privacy: structuredClone(scene.privacy), stateChange: structuredClone(scene.stateChange), disclosure: structuredClone(scene.disclosure), implementationMode: 'image_to_video_animation', motionGraphics: null, grokI2v: structuredClone(scene.grokI2v), imageGen: structuredClone(scene.imageGen) };
}

export function buildEditorialMotionDocumentaryPlans({ authorityHash, script, bundleFileSha, videoDesign, videoDesignSerializedSha256, narrationManifest }) {
  const input = baseInputs({ authorityHash, script, bundleFileSha, videoDesign, videoDesignSerializedSha256, narrationManifest });
  const scenes = videoDesign.scenes.map((scene, index) => {
    if (scene.scene !== index + 1) throw new Error(`Video design scene order is invalid at ${index + 1}`);
    const evidence = scene.sceneEvidence;
    if (!isObject(evidence) || evidence.schema !== 'compiled-scene-evidence-v1' || evidence.scene !== index + 1) throw new Error(`Scene ${index + 1} evidence binding is invalid`);
    return {
      scene: index + 1,
      beatId: `beat-${String(index + 1).padStart(3, '0')}`,
      scriptSpans: sceneSpans(scene, index),
      claimIds: Array.isArray(scene.claimIds) ? [...scene.claimIds] : [],
      evidenceClass: scene.evidenceClass,
      evidence: structuredClone(evidence),
      visualPurpose: String(scene.visualPurpose || 'explain-verified-evidence'),
      narrationAnchor: String(scene.narrationAnchor || scene.excerpt || '').trim(),
      narrationTiming: structuredClone(scene.narrationTiming),
      ...sceneContract(scene, index),
    };
  });
  const story = {
    schema: 'editorial-story-plan-v1', version: 1, status: 'approved', authorityHash: input.authorityHash,
    scriptSha256: input.scriptSha256, evidenceBundleSha256: input.evidenceBundleSha256, designAuthorshipContract: input.designAuthorshipContract || AGENT_DESIGN_CONTRACT,
    narrationAuthority: input.narration, outputLayout: structuredClone(videoDesign.outputLayout), titleTrack: structuredClone(videoDesign.titleTrack), captionTrack: structuredClone(videoDesign.captionTrack), sourceVideoDesignSha256: input.videoDesignSha256,
    beats: scenes,
    policy: 'evidence-fixed-story-order-preserved-motion-design-remains-revisable-before-animatic-approval',
  };
  assertPathFree(story);
  const storySha256 = hashArtifact(story);
  const visualScenes = videoDesign.scenes.map((scene, index) => ({
    scene: index + 1, beatId: scenes[index].beatId,
    visualMode: String(scene.visualMode || scene.mediaType || 'editorial-composite'),
    visualPurpose: String(scene.visualPurpose || 'explain-verified-evidence'),
    ...sceneContract(scene, index),
    shotDesign: structuredClone(scene.shotDesign || {}),
    animation: structuredClone(scene.animation || {}),
    motionGraphics: null,
    transition: structuredClone(scene.ffmpegBoundary || { transition: 'hard-cut', durationFrames: 0 }),
    mediaSlot: { status: 'pending', sourcePolicy: 'insert-after-animatic-approval', allowedTypes: ['document', 'map', 'timeline', 'chart', 'photo', '2d', '3d', 'video'] },
    evidence: structuredClone(scenes[index].evidence),
  }));
  const visual = {
    schema: 'visual-treatment-plan-v1', version: 1, status: 'approved', authorityHash: input.authorityHash,
    scriptSha256: input.scriptSha256, evidenceBundleSha256: input.evidenceBundleSha256, designAuthorshipContract: input.designAuthorshipContract || AGENT_DESIGN_CONTRACT, outputLayout: structuredClone(videoDesign.outputLayout), titleTrack: structuredClone(videoDesign.titleTrack), captionTrack: structuredClone(videoDesign.captionTrack),
    narrationAuthority: input.narration, storyPlanSha256: storySha256, sourceVideoDesignSha256: input.videoDesignSha256,
    treatment: { family: 'evidence-driven-editorial-motion-documentary', palette: 'documentary-neutral-with-signal-accent', composition: 'evidence-first-grok-single-color-storyboard-square', renderer: 'grok-square-min480-about6s-preserve-normalize480-semantic-trim-v2-authored-duration-bound' },
    scenes: visualScenes,
  };
  assertPathFree(visual);
  const visualSha256 = hashArtifact(visual);
  let frameCursor = 0;
  const animaticScenes = videoDesign.scenes.map((scene, index) => {
    if (!isObject(scene.narrationTiming) || !(scene.narrationTiming.startSeconds >= 0) || !(scene.narrationTiming.endSeconds > scene.narrationTiming.startSeconds) || (index > 0 && scene.narrationTiming.scriptStartChar < videoDesign.scenes[index - 1].narrationTiming.scriptEndChar)) throw new Error(`Scene ${index + 1} narration timing is invalid`);
    const startFrame = frameCursor; const isLast = index === videoDesign.scenes.length - 1; const lockedEndFrame = isLast ? Math.ceil(input.narration.durationSeconds * 24) : Math.max(startFrame + 1, Math.round(scene.narrationTiming.endSeconds * 24)); const durationFrames = lockedEndFrame - startFrame;
    if (!Number.isSafeInteger(durationFrames) || durationFrames < 1) throw new Error(`Scene ${index + 1} duration is invalid`);
    const endFrame = lockedEndFrame; frameCursor = endFrame;
    return { scene: index + 1, beatId: scenes[index].beatId, sceneRole: scenes[index].sceneRole, sourceKind: scenes[index].sourceKind, evidenceStatus: scenes[index].evidenceStatus, implementationMode: 'image_to_video_animation', motionGraphics: null, grokI2v: structuredClone(scenes[index].grokI2v), imageGen: structuredClone(scenes[index].imageGen), startState: scenes[index].stateChange.startState, endState: scenes[index].stateChange.endState, narrationTiming: structuredClone(scene.narrationTiming), startFrame, endFrame, durationFrames, startSeconds: startFrame / 24, endSeconds: endFrame / 24, narrationAnchor: scenes[index].narrationAnchor, captionAnchor: String(scene.captionAnchor || '').trim(), mediaSlot: { status: 'pending', assetId: null } };
  });
  const animatic = {
    schema: 'animatic-plan-v1', version: 1, status: 'assembly-ready', authorityHash: input.authorityHash,
    scriptSha256: input.scriptSha256, evidenceBundleSha256: input.evidenceBundleSha256, designAuthorshipContract: input.designAuthorshipContract || AGENT_DESIGN_CONTRACT,
    narrationAuthority: input.narration, outputLayout: structuredClone(videoDesign.outputLayout), titleTrack: structuredClone(videoDesign.titleTrack), captionTrack: structuredClone(videoDesign.captionTrack), storyPlanSha256: storySha256, visualTreatmentSha256: visualSha256,
    fps: 24, totalFrames: frameCursor, durationSeconds: frameCursor / 24, scenes: animaticScenes,
    mediaPolicy: 'all-media-slots-pending-until-explicit-approved-assembly',
  };
  assertPathFree(animatic);
  return { story, visual, animatic, hashes: { storySha256, visualTreatmentSha256: visualSha256, animaticPlanSha256: hashArtifact(animatic) } };
}

export function verifyEditorialMotionDocumentaryPlans({ story, visual, animatic, authorityHash, script, bundleFileSha, narrationManifest, videoDesign, videoDesignSerializedSha256 }) {
  const expected = buildEditorialMotionDocumentaryPlans({ authorityHash, script, bundleFileSha, videoDesign, narrationManifest, videoDesignSerializedSha256 });
  if (stableStringify(story) !== stableStringify(expected.story)) throw new Error('Editorial story plan authority/hash mismatch');
  if (stableStringify(visual) !== stableStringify(expected.visual)) throw new Error('Visual treatment plan authority/hash mismatch');
  if (stableStringify(animatic) !== stableStringify(expected.animatic)) throw new Error('Animatic plan authority/hash mismatch');
  const evidenceScenes = story.beats.map((beat) => beat.evidence.scene);
  if (stableStringify(evidenceScenes) !== stableStringify(videoDesign.scenes.map((_, index) => index + 1))) throw new Error('Scene evidence is not one-to-one and ordered');
  const spanCursors = new Map();
  for (const binding of story.beats.flatMap((beat) => beat.scriptSpans)) {
    const cursor = spanCursors.get(binding.spanId) ?? 0;
    if (binding.start !== cursor) throw new Error(`Scene evidence span ${binding.spanId} is not contiguously partitioned`);
    spanCursors.set(binding.spanId, binding.end);
  }
  if (animatic.totalFrames !== animatic.scenes.reduce((sum, scene) => sum + scene.durationFrames, 0) || animatic.scenes.at(-1)?.endFrame !== animatic.totalFrames) throw new Error('Animatic frame sum is invalid');
  if (animatic.narrationAuthority.audioSha256 !== expected.animatic.narrationAuthority.audioSha256 || animatic.narrationAuthority.timingSha256 !== expected.animatic.narrationAuthority.timingSha256) throw new Error('Animatic narration authority drifted');
  if (animatic.scenes.some((scene) => scene.mediaSlot?.status !== 'pending')) throw new Error('Animatic media slot is not pending');
  assertPathFree(story); assertPathFree(visual); assertPathFree(animatic);
  return true;
}

export function buildAssemblyReady({ authorityHash, artifacts, paths, mediaAssemblyPolicy }) {
  assertHash(authorityHash, 'Production authority');
  if (!isObject(artifacts)) throw new Error('All editorial motion-documentary artifacts are required');
  const hashes = artifacts.hashes || artifacts;
  for (const [key, label] of [['storySha256', 'Story plan'], ['visualTreatmentSha256', 'Visual treatment plan'], ['animaticPlanSha256', 'Animatic plan']]) assertHash(hashes[key], label);
  const policy = normalizeMediaAssemblyPolicy(mediaAssemblyPolicy);
  return { schema: 'assembly-ready-v5-color-storyboard', status: 'deferred', authorityHash, mediaAssemblyPolicy: policy, continuationAuthorized: false, artifacts: { story: { path: paths?.story || 'editorial-story-plan.json', sha256: hashes.storySha256 }, visual: { path: paths?.visual || 'visual-treatment-plan.json', sha256: hashes.visualTreatmentSha256 }, animatic: { path: paths?.animatic || 'animatic-plan.json', sha256: hashes.animaticPlanSha256 } }, providerCallsBeforeCheckpoint: { storyboardInputs: false, characterMasters: false, grok: false, render: false, upload: false } };
}

export function normalizeMediaAssemblyPolicy(policy) {
  if (policy === undefined || policy === null) return { mode: 'defer-media-assembly', schema: 'media-assembly-policy-v1' };
  if (!isObject(policy) || policy.mode !== 'defer-media-assembly') throw new Error('Legacy media assembly policy is retired; only deferred Grok assembly is admitted');
  return { schema: 'media-assembly-policy-v1', mode: policy.mode };
}
