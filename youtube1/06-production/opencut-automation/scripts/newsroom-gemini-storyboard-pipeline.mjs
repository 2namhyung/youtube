import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stableStringify } from './evidence-bundle.mjs';

export const FULL_VISUAL_STORYLINE_SCHEMA = 'newsroom-full-visual-storyline-v1';
export const V9_ENTRY_AUTHORITY_SCHEMA = 'newsroom-v9-entry-authority-v1';
export const REFERENCE_CATALOG_SCHEMA = 'newsroom-imagegen-reference-catalog-v1';
export const PROMPT_BATCH_SCHEMA = 'newsroom-gemini-multishot-prompt-batch-v1';
export const SOURCE_CAPTURE_SCHEMA = 'newsroom-gemini-web-source-capture-v1';
export const SEMANTIC_QA_SCHEMA = 'newsroom-gemini-multishot-semantic-qa-v1';

const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[a-z0-9][a-z0-9._-]{0,79}$/u;
const URL_OR_PATH = /(?:[a-z][a-z0-9+.-]{1,31}:\/\/|(?:^|[\s"'(])[a-z]:[\\/]|(?:^|[\s"'(])(?:\\\\|\/)[^\s"'()]+|(?:^|[\s"'(])\.\.?[\\/])/iu;
const TRANSITIONS = new Set(['continue', 'hard-cut-location-change', 'hard-cut-time-jump', 'hard-cut-subject-change']);
const REFERENCE_ROLES = new Set(['storyboard-reference', 'character-reference', 'location-reference', 'prop-reference', 'creature-reference', 'style-reference', 'entry-frame-reference']);
const INFLUENCE_SCOPES = new Set(['composition-only', 'appearance-continuity-only', 'environment-layout-only', 'object-shape-only', 'first-frame-continuity-only', 'style-only']);
const ROLE_SCOPE = Object.freeze({
  'storyboard-reference': 'composition-only', 'character-reference': 'appearance-continuity-only', 'location-reference': 'environment-layout-only',
  'prop-reference': 'object-shape-only', 'creature-reference': 'appearance-continuity-only', 'style-reference': 'style-only', 'entry-frame-reference': 'first-frame-continuity-only',
});
const execFileAsync = promisify(execFile);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hashJson = (value) => sha256(Buffer.from(stableStringify(value), 'utf8'));
const round = (value) => Number(Number(value).toFixed(6));
const normalizedIdentity = (value) => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[^0-9a-z가-힣]+/gu, '');
const fail = (message) => { throw Object.assign(new Error(message), { code: 'CODEX_ADMIN_BLOCKED' }); };
const lockedProduction = () => ({ provider: false, render: false, upload: false, publication: false, stage07: false, continuationAuthorized: false });
const canonicalHash = (value, field = 'approval') => { const copy = structuredClone(value); delete copy[field]; return hashJson(copy); };

function text(value, label, max = 4000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || URL_OR_PATH.test(value)) fail(`${label} must be bounded path-free text`);
  return value.trim();
}

function assertSha(value, label) {
  if (!SHA256.test(String(value || ''))) fail(`${label} must be an exact SHA-256`);
  return value;
}

function assertId(value, label) {
  if (!ID.test(String(value || ''))) fail(`${label} is invalid`);
  return value;
}

function assertLockedProduction(value, label = 'production') {
  if (stableStringify(value) !== stableStringify(lockedProduction())) fail(`${label} must keep provider/render/upload/publication/Stage 07 and continuation disabled`);
}

function assertApproval(artifact, label, field = 'approval', allowedStatuses = ['admitted', 'sealed', 'compiled', 'captured']) {
  const approval = artifact?.[field];
  if (!isObject(approval) || approval.approved !== true || !allowedStatuses.includes(approval.status) || !SHA256.test(String(approval.sha256 || '')) || approval.sha256 !== canonicalHash(artifact, field)) fail(`${label} canonical approval is missing or stale`);
}

function assertUpstream(storyline, semanticCutPlan) {
  if (storyline?.schema !== 'newsroom-storyline-v2') fail('approved newsroom-storyline-v2 is required');
  assertApproval(storyline, 'storyline', 'approval', ['admitted']);
  if (!storyline.caseId || storyline.caseId !== semanticCutPlan?.caseId || semanticCutPlan?.schema !== 'newsroom-semantic-cut-plan-v2' || semanticCutPlan?.authorities?.storylineSha256 !== storyline.approval.sha256 || !Array.isArray(semanticCutPlan.cuts) || !semanticCutPlan.cuts.length) fail('sealed newsroom-semantic-cut-plan-v2 with the exact storyline caseId is required after the storyline');
  assertApproval(semanticCutPlan, 'semantic cut plan', 'approval', ['admitted', 'sealed']);
  const seen = new Set();
  for (const [index, cut] of semanticCutPlan.cuts.entries()) {
    assertId(cut?.cutId, `semanticCutPlan.cuts[${index}].cutId`);
    if (seen.has(cut.cutId)) fail(`duplicate sealed cut ${cut.cutId}`);
    seen.add(cut.cutId);
    const seconds = Number(cut.durationIntent?.authoredDurationSeconds);
    const exception = cut.durationIntent?.exceptionReason;
    if (!Number.isFinite(seconds) || (exception === 'none' ? seconds < 2 || seconds > 3 : seconds < 1.5 || seconds > 3.5)) fail(`${cut.cutId} violates the active authored-duration contract`);
    if (exception !== 'none' && (!text(cut.durationIntent?.boundaryEvidence, `${cut.cutId}.boundaryEvidence`, 800) || !['required-sentence-boundary', 'final-boundary'].includes(cut.durationIntent?.exceptionType))) fail(`${cut.cutId} duration exception lacks boundary evidence`);
  }
}

function sourceRecord(source, label, storyId, statuses) {
  if (!isObject(source) || source.storyId !== storyId) fail(`${label} source must bind the exact storyId`);
  assertApproval(source, `${label} source`, 'approval', statuses);
  const canonicalBytes = Buffer.from(stableStringify(source), 'utf8');
  return { schema: source.schema, storyId: source.storyId, canonicalBytes: canonicalBytes.length, sha256: sha256(canonicalBytes), approvalSha256: source.approval.sha256 };
}

export function sealV9EntryAuthority({ legalReview, titleApproval, ownerNarrationApproval, supersessionReconciliation, storyline, semanticCutPlan }) {
  assertUpstream(storyline, semanticCutPlan); const storyId = storyline.caseId;
  const legal = sourceRecord(legalReview, 'legal review', storyId, ['approved', 'admitted']);
  const title = sourceRecord(titleApproval, 'title approval', storyId, ['approved', 'admitted']);
  const narration = sourceRecord(ownerNarrationApproval, 'owner narration approval', storyId, ['approved', 'admitted']);
  const supersession = sourceRecord(supersessionReconciliation, 'supersession reconciliation', storyId, ['current', 'admitted']);
  if (!Array.isArray(titleApproval.lines) || titleApproval.lines.length !== 2 || titleApproval.lines.some((line) => typeof line !== 'string' || !line.trim())) fail('title approval source must contain exactly two approved lines');
  const lines = titleApproval.lines.map((line) => line.normalize('NFC').trim()); const titleSha256 = sha256(Buffer.from(lines.join('\n'), 'utf8'));
  if (ownerNarrationApproval.ownerVoice !== true || ownerNarrationApproval.audioSha256 !== storyline.authorities.narrationAudioSha256 || ownerNarrationApproval.timingSha256 !== storyline.authorities.narrationTimingSha256) fail('owner narration source does not bind the exact locked owner audio/timing');
  if (supersessionReconciliation.noUnresolvedConflicts !== true || supersessionReconciliation.current !== true) fail('supersession source is not the current conflict-free authority');
  const tupleSha256 = hashJson({ storyId, legalReviewSha256: legal.sha256, titleApprovalSha256: title.sha256, ownerNarrationApprovalSha256: narration.sha256, supersessionReconciliationSha256: supersession.sha256, storylineSha256: storyline.approval.sha256, semanticCutPlanSha256: semanticCutPlan.approval.sha256 });
  const artifact = {
    schema: V9_ENTRY_AUTHORITY_SCHEMA, storyId,
    authorities: { storylineSha256: storyline.approval.sha256, semanticCutPlanSha256: semanticCutPlan.approval.sha256 },
    sources: { legalReview: legal, titleApproval: title, ownerNarrationApproval: narration, supersessionReconciliation: supersession },
    legalReview: { storyId, approved: true, status: 'approved', artifactSha256: legal.sha256 },
    titleApproval: { storyId, approved: true, status: 'approved', artifactSha256: title.sha256, titleSha256, lines },
    ownerNarrationApproval: { storyId, approved: true, status: 'approved', artifactSha256: narration.sha256, ownerVoice: true, audioSha256: ownerNarrationApproval.audioSha256, timingSha256: ownerNarrationApproval.timingSha256 },
    supersessionReconciliation: { storyId, approved: true, status: 'current', artifactSha256: supersession.sha256, noUnresolvedConflicts: true, currentAuthorityTupleSha256: tupleSha256 },
  };
  artifact.approval = { approved: true, status: 'admitted', sha256: canonicalHash(artifact) }; return artifact;
}

export function verifyV9EntryAuthority({ artifact, entrySources, storyline, semanticCutPlan }) {
  if (!isObject(entrySources)) fail('verified v9 entry source objects are required');
  const recreated = sealV9EntryAuthority({ ...entrySources, storyline, semanticCutPlan });
  if (stableStringify(recreated) !== stableStringify(artifact)) fail('v9 entry authority source bytes/hash or canonical content drifted');
  return true;
}

function assertEntryAuthority(entryAuthority, entrySources, storyline, semanticCutPlan) {
  verifyV9EntryAuthority({ artifact: entryAuthority, entrySources, storyline, semanticCutPlan });
  if (entryAuthority?.schema !== V9_ENTRY_AUTHORITY_SCHEMA || entryAuthority.storyId !== semanticCutPlan.caseId) fail('current v9 entry authority must bind the exact storyId');
  assertApproval(entryAuthority, 'v9 entry authority', 'approval', ['admitted']);
  for (const [key, status] of [['legalReview', 'approved'], ['titleApproval', 'approved'], ['ownerNarrationApproval', 'approved'], ['supersessionReconciliation', 'current']]) {
    const value = entryAuthority[key];
    if (!isObject(value) || value.storyId !== entryAuthority.storyId || value.approved !== true || value.status !== status || !SHA256.test(String(value.artifactSha256 || ''))) fail(`v9 entry ${key} is missing, stale, or belongs to another story`);
  }
  if (entryAuthority.ownerNarrationApproval.ownerVoice !== true || entryAuthority.ownerNarrationApproval.audioSha256 !== storyline.authorities.narrationAudioSha256 || entryAuthority.ownerNarrationApproval.timingSha256 !== storyline.authorities.narrationTimingSha256) fail('v9 entry owner narration is not the exact locked owner voice authority');
  if (!SHA256.test(String(entryAuthority.titleApproval.titleSha256 || '')) || !Array.isArray(entryAuthority.titleApproval.lines) || entryAuthority.titleApproval.lines.length !== 2 || entryAuthority.titleApproval.lines.some((line) => typeof line !== 'string' || !line.trim())) fail('v9 entry title must be an approved exact two-line authority');
  const titleSha256 = sha256(Buffer.from(entryAuthority.titleApproval.lines.map((line) => line.normalize('NFC').trim()).join('\n'), 'utf8'));
  if (entryAuthority.titleApproval.titleSha256 !== titleSha256) fail('v9 entry title SHA does not match the exact approved two-line title bytes');
  const tupleSha256 = hashJson({ storyId: entryAuthority.storyId, legalReviewSha256: entryAuthority.legalReview.artifactSha256, titleApprovalSha256: entryAuthority.titleApproval.artifactSha256, ownerNarrationApprovalSha256: entryAuthority.ownerNarrationApproval.artifactSha256, supersessionReconciliationSha256: entryAuthority.supersessionReconciliation.artifactSha256, storylineSha256: storyline.approval.sha256, semanticCutPlanSha256: semanticCutPlan.approval.sha256 });
  if (entryAuthority.supersessionReconciliation.noUnresolvedConflicts !== true || entryAuthority.supersessionReconciliation.currentAuthorityTupleSha256 !== tupleSha256) fail('v9 entry supersession reconciliation is unresolved or binds a stale authority tuple');
  return entryAuthority;
}

function visualAuthorities(storyline, semanticCutPlan, entryAuthority) {
  const authority = storyline.authorities || {};
  return {
    newsSha256: assertSha(authority.newsSha256, 'storyline.authorities.newsSha256'),
    scriptSha256: assertSha(authority.scriptSha256, 'storyline.authorities.scriptSha256'),
    legalReviewSha256: entryAuthority.legalReview.artifactSha256,
    titleApprovalSha256: entryAuthority.titleApproval.artifactSha256,
    titleSha256: entryAuthority.titleApproval.titleSha256,
    ownerNarrationApprovalSha256: entryAuthority.ownerNarrationApproval.artifactSha256,
    supersessionReconciliationSha256: entryAuthority.supersessionReconciliation.artifactSha256,
    entryAuthoritySha256: entryAuthority.approval.sha256,
    narrationAudioSha256: assertSha(authority.narrationAudioSha256, 'storyline.authorities.narrationAudioSha256'),
    narrationTimingSha256: assertSha(authority.narrationTimingSha256, 'storyline.authorities.narrationTimingSha256'),
    storylineSha256: storyline.approval.sha256,
    semanticCutPlanSha256: semanticCutPlan.approval.sha256,
  };
}

function validateCameraPlan(value, label) {
  if (!isObject(value)) fail(`${label} is required`);
  return {
    framing: text(value.framing, `${label}.framing`, 240),
    angle: text(value.angle, `${label}.angle`, 240),
    movement: text(value.movement, `${label}.movement`, 240),
    composition: text(value.composition, `${label}.composition`, 600),
  };
}

function validateActionPlan(value, label) {
  if (!isObject(value)) fail(`${label} is required`);
  return {
    subject: text(value.subject, `${label}.subject`, 240),
    startState: text(value.startState, `${label}.startState`, 600),
    action: text(value.action, `${label}.action`, 800),
    endState: text(value.endState, `${label}.endState`, 600),
    screenDirection: text(value.screenDirection, `${label}.screenDirection`, 240),
  };
}

export function sealFullVisualStoryline({ draft, storyline, semanticCutPlan, entryAuthority, entrySources }) {
  assertUpstream(storyline, semanticCutPlan);
  assertEntryAuthority(entryAuthority, entrySources, storyline, semanticCutPlan);
  if (!isObject(draft) || Object.hasOwn(draft, 'titleSha256') || !Array.isArray(draft.cuts) || !Array.isArray(draft.sequences)) fail('full visual storyline draft is incomplete or contains an untrusted title SHA');
  if (draft.storyId !== entryAuthority.storyId) fail('full visual storyline draft storyId does not match the current entry authority');
  const planCuts = semanticCutPlan.cuts;
  const total = round(planCuts.reduce((sum, cut) => sum + Number(cut.durationIntent.authoredDurationSeconds), 0));
  if (total < 65 || total > 80) fail(`locked narration/cut duration ${total}s is outside the requested 65-80s Shorts contract`);
  const visualById = new Map(draft.cuts.map((cut) => [cut?.cutId, cut]));
  if (visualById.size !== draft.cuts.length || draft.cuts.length !== planCuts.length) fail('visual cuts must map every sealed cut exactly once');
  const cuts = planCuts.map((sealed, index) => {
    const authored = visualById.get(sealed.cutId);
    if (!authored) fail(`visual cut missing for ${sealed.cutId}`);
    const transition = String(authored.transition || '');
    if (!TRANSITIONS.has(transition)) fail(`${sealed.cutId}.transition is invalid`);
    return {
      cutId: sealed.cutId,
      order: index + 1,
      sequenceId: assertId(authored.sequenceId, `${sealed.cutId}.sequenceId`),
      authoredDurationSeconds: round(sealed.durationIntent.authoredDurationSeconds),
      spanBindings: structuredClone(sealed.spanBindings || []),
      transition,
      entryStateId: assertId(authored.entryStateId, `${sealed.cutId}.entryStateId`),
      exitStateId: assertId(authored.exitStateId, `${sealed.cutId}.exitStateId`),
      visualPurpose: text(authored.visualPurpose, `${sealed.cutId}.visualPurpose`, 800),
      promptFoundation: text(authored.promptFoundation, `${sealed.cutId}.promptFoundation`, 1600),
      cameraPlan: validateCameraPlan(authored.cameraPlan, `${sealed.cutId}.cameraPlan`),
      actionPlan: validateActionPlan(authored.actionPlan, `${sealed.cutId}.actionPlan`),
    };
  });
  for (let index = 1; index < cuts.length; index += 1) if (cuts[index].transition === 'continue' && (cuts[index - 1].exitStateId !== cuts[index].entryStateId || cuts[index - 1].actionPlan.endState !== cuts[index].actionPlan.startState)) fail(`${cuts[index].cutId} continue transition does not match the previous exit state ID and content`);
  const sequenceIds = new Set(); const flattened = [];
  const sequences = draft.sequences.map((sequence, index) => {
    const sequenceId = assertId(sequence?.sequenceId, `sequences[${index}].sequenceId`);
    if (sequenceIds.has(sequenceId)) fail(`duplicate sequence ${sequenceId}`);
    sequenceIds.add(sequenceId);
    if (!Array.isArray(sequence.cutIds) || !sequence.cutIds.length) fail(`${sequenceId}.cutIds is required`);
    flattened.push(...sequence.cutIds);
    const owned = cuts.filter((cut) => cut.sequenceId === sequenceId);
    if (stableStringify(sequence.cutIds) !== stableStringify(owned.map((cut) => cut.cutId))) fail(`${sequenceId} must contain its cuts in sealed order`);
    return {
      sequenceId,
      order: index + 1,
      cutIds: [...sequence.cutIds],
      purpose: text(sequence.purpose, `${sequenceId}.purpose`, 800),
      promptFoundation: text(sequence.promptFoundation, `${sequenceId}.promptFoundation`, 2000),
      cameraArc: text(sequence.cameraArc, `${sequenceId}.cameraArc`, 1200),
      actionArc: text(sequence.actionArc, `${sequenceId}.actionArc`, 1200),
      entryStateId: owned[0]?.entryStateId,
      exitStateId: owned.at(-1)?.exitStateId,
    };
  });
  if (stableStringify(flattened) !== stableStringify(cuts.map((cut) => cut.cutId))) fail('sequences must cover every sealed cut exactly once and in order');
  const full = draft.fullStoryline || {};
  const artifact = {
    schema: FULL_VISUAL_STORYLINE_SCHEMA,
    storyId: assertId(draft.storyId || semanticCutPlan.caseId || storyline.caseId, 'storyId'),
    authorities: visualAuthorities(storyline, semanticCutPlan, entryAuthority),
    format: { aspectRatio: '9:16', fps: 24, targetDurationSeconds: total },
    fullStoryline: {
      beginning: text(full.beginning, 'fullStoryline.beginning', 2000), development: text(full.development, 'fullStoryline.development', 2000),
      turn: text(full.turn, 'fullStoryline.turn', 2000), resolution: text(full.resolution, 'fullStoryline.resolution', 2000), endQuestion: text(full.endQuestion, 'fullStoryline.endQuestion', 1200),
      globalVisualPrompt: text(full.globalVisualPrompt, 'fullStoryline.globalVisualPrompt', 4000), cameraGrammar: text(full.cameraGrammar, 'fullStoryline.cameraGrammar', 2400),
      actionGrammar: text(full.actionGrammar, 'fullStoryline.actionGrammar', 2400), continuityRules: text(full.continuityRules, 'fullStoryline.continuityRules', 2400),
      prohibitedContent: text(full.prohibitedContent, 'fullStoryline.prohibitedContent', 2400),
    },
    sequences, cuts, production: lockedProduction(),
  };
  artifact.approval = { approved: true, status: 'admitted', sha256: canonicalHash(artifact) };
  return artifact;
}

export function verifyFullVisualStoryline({ artifact, storyline, semanticCutPlan, entryAuthority, entrySources }) {
  assertApproval(artifact, 'full visual storyline', 'approval', ['admitted']);
  const copy = sealFullVisualStoryline({ draft: artifact, storyline, semanticCutPlan, entryAuthority, entrySources });
  if (stableStringify(copy) !== stableStringify(artifact)) fail('full visual storyline content is stale or non-canonical');
  return true;
}

function decodeImage(bytes, label) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), mimeType: 'image/png' };
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) { let offset = 2; while (offset + 9 < bytes.length) { if (bytes[offset] !== 0xff) { offset += 1; continue; } const marker = bytes[offset + 1]; const length = bytes.readUInt16BE(offset + 2); if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5), mimeType: 'image/jpeg' }; offset += 2 + length; } }
  fail(`${label} is not a decodable admitted PNG/JPEG image`);
}

async function physicalFileRecord({ root, relativePath, width, height, mimeType }, label) {
  const absoluteRoot = path.resolve(root); const resolved = path.resolve(absoluteRoot, relativePath); const prefix = `${absoluteRoot}${path.sep}`;
  if (!resolved.startsWith(prefix)) fail(`${label} escapes its admitted root`);
  const stat = await fs.lstat(resolved); const realpath = await fs.realpath(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || realpath !== resolved) fail(`${label} must be a contained physical nonsymlink file`);
  const bytes = await fs.readFile(resolved);
  const decoded = decodeImage(bytes, label);
  let probed;
  try { const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name', '-of', 'json', resolved], { maxBuffer: 1024 * 1024 }); probed = JSON.parse(stdout).streams?.[0]; } catch { fail(`${label} cannot be decoded by ffprobe`); }
  if (!probed || Number(probed.width) !== width || Number(probed.height) !== height || decoded.width !== width || decoded.height !== height || decoded.mimeType !== mimeType) fail(`${label} declared dimensions/MIME do not match decoded bytes`);
  return { relativePath: path.relative(absoluteRoot, resolved).replaceAll('\\', '/'), realpath, bytes: bytes.length, sha256: sha256(bytes), width, height, mimeType, preserved: true };
}

export async function sealImagegenReferenceCatalog({ draft, fullVisualStoryline, assetRoot }) {
  assertApproval(fullVisualStoryline, 'full visual storyline', 'approval', ['admitted']);
  if (!isObject(draft) || !Array.isArray(draft.assets) || draft.assets.length > 80) fail('reference catalog draft is invalid');
  const ids = new Set(); const assets = [];
  for (const [index, input] of draft.assets.entries()) {
    const assetId = assertId(input?.assetId, `assets[${index}].assetId`); if (ids.has(assetId)) fail(`duplicate reference asset ${assetId}`); ids.add(assetId);
    if (!REFERENCE_ROLES.has(input.role)) fail(`${assetId}.role is invalid`);
    const prompt = text(input.generation?.prompt, `${assetId}.generation.prompt`, 5000); const promptBytes = Buffer.byteLength(prompt, 'utf8');
    if (input.generation?.model !== 'imagegen') fail(`${assetId}.generation.model must be the admitted ImageGen reference generator`);
    const scopes = [...new Set(input.allowedInfluenceScopes || [])]; if (scopes.length !== 1 || scopes[0] !== ROLE_SCOPE[input.role] || scopes.some((scope) => !INFLUENCE_SCOPES.has(scope))) fail(`${assetId}.allowedInfluenceScopes does not match its reference role`);
    assets.push({
      assetId, role: input.role, file: await physicalFileRecord({ root: assetRoot, ...input.file }, `${assetId}.file`),
      generation: { model: text(input.generation?.model, `${assetId}.generation.model`, 160), prompt, promptBytes, promptSha256: sha256(Buffer.from(prompt, 'utf8')) },
      allowedInfluenceScopes: scopes, providerInputStatus: 'deferred-reference-only', authorityRole: 'non-authoritative-reference-only',
    });
  }
  const artifact = {
    schema: REFERENCE_CATALOG_SCHEMA, storyId: fullVisualStoryline.storyId, authorities: { fullVisualStorylineSha256: fullVisualStoryline.approval.sha256 },
    policy: { authorityRole: 'non-authoritative-reference-only', factAuthority: false, identityAuthority: false, qaAuthority: false, providerEchoAuthority: false },
    assets, production: lockedProduction(),
  };
  artifact.approval = { approved: true, status: 'admitted', sha256: canonicalHash(artifact) };
  return artifact;
}

export async function verifyImagegenReferenceCatalog({ artifact, fullVisualStoryline, assetRoot }) {
  assertApproval(artifact, 'ImageGen reference catalog', 'approval', ['admitted']); assertLockedProduction(artifact.production);
  if (artifact.authorities?.fullVisualStorylineSha256 !== fullVisualStoryline.approval?.sha256 || artifact.storyId !== fullVisualStoryline.storyId) fail('reference catalog authority is stale');
  if (stableStringify(artifact.policy) !== stableStringify({ authorityRole: 'non-authoritative-reference-only', factAuthority: false, identityAuthority: false, qaAuthority: false, providerEchoAuthority: false })) fail('references were promoted beyond reference-only status');
  const draft = { assets: (artifact.assets || []).map((asset) => ({ assetId: asset.assetId, role: asset.role, file: { relativePath: asset.file.relativePath, width: asset.file.width, height: asset.file.height, mimeType: asset.file.mimeType }, generation: { model: asset.generation.model, prompt: asset.generation.prompt }, allowedInfluenceScopes: asset.allowedInfluenceScopes })) };
  const recreated = await sealImagegenReferenceCatalog({ draft, fullVisualStoryline, assetRoot });
  if (stableStringify(recreated) !== stableStringify(artifact)) fail('ImageGen reference catalog is stale, promoted, or non-canonical');
  return true;
}

function referenceInstruction(binding) {
  const role = binding.role.replaceAll('-', ' '); const scope = binding.influenceScope.replaceAll('-', ' ');
  return `첨부 이미지 ${binding.ordinal}: ${role}, ${scope} 용도로만 참고한다. 이 이미지는 사실, 실제 인물 신원, 사건 증거, 품질 판정의 권위가 아니다.`;
}

function compilePrompt(fullVisualStoryline, sequence, shots, bindings) {
  const f = fullVisualStoryline.fullStoryline;
  const lines = [
    '[출력]', '세로 9:16, 24fps 뉴스 쇼츠용 영상. 화면 안에 자막, 로고, 워터마크, 읽을 수 있는 글자를 생성하지 않는다.',
    '[전체 영상 연속성]', f.globalVisualPrompt, f.cameraGrammar, f.actionGrammar, f.continuityRules,
    '[이번 시퀀스]', sequence.promptFoundation, sequence.cameraArc, sequence.actionArc,
    '[참고 이미지 정책]', '첨부 이미지는 구도와 시각 연속성을 위한 참고 자료일 뿐 사실, 신원, 사건 증거 또는 QA 권위가 아니다.',
    ...bindings.map(referenceInstruction), '[멀티샷]',
  ];
  for (const shot of shots) {
    const cut = shot.cut;
    lines.push(`[${shot.requestedInSeconds.toFixed(3)}-${shot.requestedOutSeconds.toFixed(3)}초] ${shot.shotId}`);
    lines.push(`${cut.transition === 'continue' ? '직전 상태와 화면 방향을 끊김 없이 이어서 시작한다.' : '의도된 하드 컷으로 시작한다.'} 편집 컷 ${cut.cutId}의 생성 의도이며 시간 경계는 비결정적이다.`);
    lines.push(cut.promptFoundation);
    lines.push(`카메라: ${cut.cameraPlan.framing}; ${cut.cameraPlan.angle}; ${cut.cameraPlan.movement}; ${cut.cameraPlan.composition}`);
    lines.push(`행동: ${cut.actionPlan.startState}; ${cut.actionPlan.action}; ${cut.actionPlan.endState}; 화면 방향 ${cut.actionPlan.screenDirection}.`);
  }
  lines.push('[금지]', f.prohibitedContent, '샷 사이 morph, 얼굴·사지 복제, 역방향 행동, 임의 대사와 음성 의존을 금지한다. 생성 오디오는 최종 영상에 사용하지 않는다.');
  return lines.join('\n');
}

export async function compileGeminiPromptBatches({ fullVisualStoryline, referenceCatalog, batchDrafts, assetRoot }) {
  assertApproval(fullVisualStoryline, 'full visual storyline', 'approval', ['admitted']); assertLockedProduction(fullVisualStoryline.production);
  assertApproval(referenceCatalog, 'reference catalog', 'approval', ['admitted']); assertLockedProduction(referenceCatalog.production);
  if (referenceCatalog.storyId !== fullVisualStoryline.storyId || referenceCatalog.authorities.fullVisualStorylineSha256 !== fullVisualStoryline.approval.sha256) fail('reference catalog does not bind this full visual storyline');
  await verifyImagegenReferenceCatalog({ artifact: referenceCatalog, fullVisualStoryline, assetRoot });
  if (!Array.isArray(batchDrafts) || !batchDrafts.length) fail('at least one Gemini batch draft is required');
  const cuts = new Map(fullVisualStoryline.cuts.map((cut) => [cut.cutId, cut])); const assets = new Map(referenceCatalog.assets.map((asset) => [asset.assetId, asset])); const sequences = new Map(fullVisualStoryline.sequences.map((sequence) => [sequence.sequenceId, sequence]));
  const usedCuts = []; const batchIds = new Set();
  const batches = batchDrafts.map((draft, batchIndex) => {
    const batchId = assertId(draft?.batchId, `batches[${batchIndex}].batchId`); if (batchIds.has(batchId)) fail(`duplicate batch ${batchId}`); batchIds.add(batchId);
    const sequence = sequences.get(draft.sequenceId); if (!sequence) fail(`${batchId} has unknown sequenceId`);
    if (!Array.isArray(draft.shots) || draft.shots.length < 1 || draft.shots.length > 3) fail(`${batchId} must contain one to three shot intents`);
    let cursor = 0; const shotIds = new Set();
    const shots = draft.shots.map((input, shotIndex) => {
      const shotId = assertId(input?.shotId, `${batchId}.shots[${shotIndex}].shotId`); if (shotIds.has(shotId)) fail(`${batchId} has duplicate shot ${shotId}`); shotIds.add(shotId);
      const cut = cuts.get(input.cutId); if (!cut || cut.sequenceId !== sequence.sequenceId) fail(`${shotId} must bind one cut in ${sequence.sequenceId}`);
      const requested = round(input.requestedDurationSeconds); if (!(requested >= 1.5 && requested <= 6)) fail(`${shotId} provider shot intent must be 1.5-6s`);
      const shot = { shotId, cutId: cut.cutId, requestedInSeconds: round(cursor), requestedOutSeconds: round(cursor + requested), requestedDurationSeconds: requested, timingAuthority: 'provider-shot-intent-only-nondeterministic', authoredFinalCutDurationSeconds: cut.authoredDurationSeconds, cut };
      cursor += requested; usedCuts.push(cut.cutId); return shot;
    });
    const requestedDurationSeconds = round(cursor); if (requestedDurationSeconds < 6 || requestedDurationSeconds > 10) fail(`${batchId} provider source duration must be 6-10s`);
    const rawBindings = draft.referenceBindings || []; if (!Array.isArray(rawBindings) || rawBindings.length > 5) fail(`${batchId} supports at most five manual web references`);
    const bindingIds = new Set(); const bindings = rawBindings.map((input, index) => {
      const asset = assets.get(input?.assetId); if (!asset || bindingIds.has(asset.assetId)) fail(`${batchId} has unknown or duplicate reference asset`); bindingIds.add(asset.assetId);
      if (input.ordinal !== index + 1) fail(`${batchId} reference ordinals must be contiguous and one-based for the manual web surface`);
      if (!asset.allowedInfluenceScopes.includes(input.influenceScope)) fail(`${batchId} reference influence scope is not admitted by the catalog`);
      return { assetId: asset.assetId, role: asset.role, ordinal: input.ordinal, influenceScope: input.influenceScope, sha256: asset.file.sha256, bytes: asset.file.bytes, authorityRole: 'non-authoritative-reference-only' };
    });
    const cleanShots = shots.map(({ cut, ...shot }) => shot); const promptText = compilePrompt(fullVisualStoryline, sequence, shots, bindings); const promptBytes = Buffer.byteLength(promptText, 'utf8');
    return { batchId, order: batchIndex + 1, sequenceId: sequence.sequenceId, cutIds: cleanShots.map((shot) => shot.cutId), requestedDurationSeconds, shotIntents: cleanShots, referenceBindings: bindings, prompt: { text: promptText, bytes: promptBytes, sha256: sha256(Buffer.from(promptText, 'utf8')) } };
  });
  if (stableStringify(usedCuts) !== stableStringify(fullVisualStoryline.cuts.map((cut) => cut.cutId))) fail('Gemini batches must cover every sealed cut exactly once and in order');
  const artifact = { schema: PROMPT_BATCH_SCHEMA, storyId: fullVisualStoryline.storyId, authorities: { fullVisualStorylineSha256: fullVisualStoryline.approval.sha256, semanticCutPlanSha256: fullVisualStoryline.authorities.semanticCutPlanSha256, referenceCatalogSha256: referenceCatalog.approval.sha256 }, provider: { surface: 'gemini-web', execution: 'manual-deferred-unauthorized', aspectRatio: '9:16', durationPolicy: '6-10s-provider-source; shot-times-are-intent-only', referenceSemantics: 'non-authoritative-reference-only' }, batches, production: lockedProduction() };
  artifact.approval = { approved: true, status: 'compiled', sha256: canonicalHash(artifact) };
  return artifact;
}

export async function verifyGeminiPromptBatches({ artifact, fullVisualStoryline, referenceCatalog, assetRoot }) {
  assertApproval(artifact, 'Gemini prompt batch', 'approval', ['compiled']); assertLockedProduction(artifact.production);
  const drafts = artifact.batches.map((batch) => ({ batchId: batch.batchId, sequenceId: batch.sequenceId, shots: batch.shotIntents.map((shot) => ({ shotId: shot.shotId, cutId: shot.cutId, requestedDurationSeconds: shot.requestedDurationSeconds })), referenceBindings: batch.referenceBindings.map(({ assetId, ordinal, influenceScope }) => ({ assetId, ordinal, influenceScope })) }));
  const copy = await compileGeminiPromptBatches({ fullVisualStoryline, referenceCatalog, batchDrafts: drafts, assetRoot });
  if (stableStringify(copy) !== stableStringify(artifact)) fail('Gemini prompt batch is stale or non-canonical');
  return true;
}

export async function probeVideo(file, ffprobe = 'ffprobe') {
  const { stdout } = await execFileAsync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-show_entries', 'stream=codec_type,width,height,r_frame_rate', '-of', 'json', file], { maxBuffer: 1024 * 1024 });
  const data = JSON.parse(stdout); const video = data.streams?.find((stream) => stream.codec_type === 'video');
  if (!video) fail('captured provider source has no decoded video stream');
  const [num, den] = String(video.r_frame_rate || '').split('/').map(Number); const fps = den ? num / den : num;
  return { width: Number(video.width), height: Number(video.height), durationSeconds: Number(data.format?.duration), fps: round(fps), audioPresent: data.streams?.some((stream) => stream.codec_type === 'audio') === true };
}

async function verifyOperatorAttestation({ attestation, promptBatchArtifact, batch, evidenceRoot }) {
  if (attestation?.schema !== 'newsroom-gemini-web-operator-attestation-v1' || attestation.storyId !== promptBatchArtifact.storyId || attestation.batchId !== batch.batchId || attestation.surface !== 'gemini-web' || attestation.modelId !== 'gemini-omni-1.1-flash' || attestation.status !== 'human-attested' || !text(attestation.performedBy, 'attestation.performedBy', 160) || !Number.isFinite(Date.parse(attestation.capturedAt))) fail('manual operator attestation surface/model/story/batch/operator/time is invalid');
  assertApproval(attestation, 'operator attestation', 'approval', ['attested']);
  if (attestation.promptCopiedSha256 !== batch.prompt.sha256) fail('operator did not attest the exact compiled prompt SHA');
  const expectedOrder = batch.referenceBindings.map((binding) => ({ ordinal: binding.ordinal, assetId: binding.assetId, sha256: binding.sha256, bytes: binding.bytes }));
  if (stableStringify(attestation.uploadOrder) !== stableStringify(expectedOrder)) fail('operator-attested upload order/hash/bytes does not match the compiled batch');
  const receipt = await physicalFileRecord({ root: evidenceRoot, relativePath: attestation.receipt.relativePath, width: attestation.receipt.width, height: attestation.receipt.height, mimeType: attestation.receipt.mimeType }, 'operator attestation receipt');
  if (stableStringify(receipt) !== stableStringify(attestation.receipt)) fail('operator attestation receipt bytes/hash drifted');
  return { expectedOrder, receipt };
}

export async function captureGeminiWebSource({ promptBatchArtifact, batchId, sourceRoot, relativePath, operatorAttestation, evidenceRoot, probe = probeVideo }) {
  assertApproval(promptBatchArtifact, 'Gemini prompt batch', 'approval', ['compiled']); assertLockedProduction(promptBatchArtifact.production);
  const batch = promptBatchArtifact.batches.find((item) => item.batchId === batchId); if (!batch) fail('unknown Gemini batchId');
  const root = path.resolve(sourceRoot); const resolved = path.resolve(root, relativePath); if (!resolved.startsWith(`${root}${path.sep}`)) fail('provider source escapes its capture root');
  const stat = await fs.lstat(resolved); const realpath = await fs.realpath(resolved); if (!stat.isFile() || stat.isSymbolicLink() || realpath !== resolved) fail('provider source must be a contained physical nonsymlink file');
  const bytes = await fs.readFile(resolved); const media = await probe(resolved);
  if (!Number.isInteger(media.width) || !Number.isInteger(media.height) || media.width < 1 || media.height < 1 || Math.abs(media.width / media.height - 9 / 16) > 0.03) fail('provider source must decode as vertical 9:16 video');
  if (!Number.isFinite(media.durationSeconds) || Math.abs(media.durationSeconds - batch.requestedDurationSeconds) > 0.25) fail('observed provider duration differs from the requested 6-10s source by more than 0.25s');
  if (!Number.isFinite(media.fps) || media.fps <= 0) fail('provider source FPS is invalid');
  const { expectedOrder, receipt } = await verifyOperatorAttestation({ attestation: operatorAttestation, promptBatchArtifact, batch, evidenceRoot });
  const artifact = {
    schema: SOURCE_CAPTURE_SCHEMA, storyId: promptBatchArtifact.storyId, batchId,
    authorities: { promptBatchArtifactSha256: promptBatchArtifact.approval.sha256, promptSha256: batch.prompt.sha256 },
    manualExecution: { surface: 'gemini-web', modelId: operatorAttestation.modelId, status: 'human-attested-not-provider-proven', performedBy: text(operatorAttestation.performedBy, 'performedBy', 160), capturedAt: operatorAttestation.capturedAt, promptCopiedSha256: operatorAttestation.promptCopiedSha256, uploadOrder: expectedOrder, receipt, attestationSha256: operatorAttestation.approval.sha256, providerEchoAuthority: false },
    source: { relativePath: path.relative(root, resolved).replaceAll('\\', '/'), realpath, bytes: bytes.length, sha256: sha256(bytes), width: media.width, height: media.height, durationSeconds: round(media.durationSeconds), fps: media.fps, audioPresent: media.audioPresent === true, preserved: true },
    audioPolicy: 'discard-provider-audio-before-owner-narration-mix', production: lockedProduction(),
  };
  artifact.approval = { approved: true, status: 'captured', sha256: canonicalHash(artifact) };
  return artifact;
}

export async function verifyGeminiWebSourceCapture({ artifact, promptBatchArtifact, sourceRoot, operatorAttestation, evidenceRoot, probe = probeVideo }) {
  assertApproval(artifact, 'Gemini source capture', 'approval', ['captured']); assertLockedProduction(artifact.production);
  const recreated = await captureGeminiWebSource({ promptBatchArtifact, batchId: artifact.batchId, sourceRoot, relativePath: artifact.source.relativePath, operatorAttestation, evidenceRoot, probe });
  if (stableStringify(recreated) !== stableStringify(artifact)) fail('Gemini source capture bytes, metadata, or authority drifted');
  return true;
}

async function frameEvidence(root, input, label) {
  const record = await physicalFileRecord({ root, relativePath: input.relativePath, width: input.width, height: input.height, mimeType: input.mimeType }, label);
  const timestampSeconds = round(input.timestampSeconds); if (!Number.isFinite(timestampSeconds) || timestampSeconds < 0) fail(`${label}.timestampSeconds is invalid`);
  return { timestampSeconds, ...record };
}

export async function extractSourceFrame(sourceFile, timestampSeconds, ffmpeg = 'ffmpeg') {
  const { stdout } = await execFileAsync(ffmpeg, ['-v', 'error', '-ss', Number(timestampSeconds).toFixed(6), '-i', sourceFile, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'], { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 });
  if (!Buffer.isBuffer(stdout) || !stdout.length) fail('ffmpeg did not decode the requested source frame');
  return stdout;
}

export async function sealGeminiSemanticQa({ promptBatchArtifact, sourceCapture, draft, evidenceRoot, extractFrame = extractSourceFrame }) {
  assertApproval(promptBatchArtifact, 'Gemini prompt batch', 'approval', ['compiled']); assertApproval(sourceCapture, 'Gemini source capture', 'approval', ['captured']);
  if (sourceCapture.authorities.promptBatchArtifactSha256 !== promptBatchArtifact.approval.sha256) fail('source capture does not bind the prompt batch artifact');
  const batch = promptBatchArtifact.batches.find((item) => item.batchId === sourceCapture.batchId); if (!batch || !Array.isArray(draft?.shots) || draft.shots.length !== batch.shotIntents.length) fail('semantic QA must review every requested shot intent');
  if (!['independent-human', 'independent-frame-analysis'].includes(draft.reviewer?.kind)) fail('semantic QA requires an independent reviewer kind');
  if (!normalizedIdentity(draft.reviewer?.reviewerId) || normalizedIdentity(draft.reviewer.reviewerId) === normalizedIdentity(sourceCapture.manualExecution.performedBy)) fail('semantic QA reviewer must be independent from the source operator');
  const sourceStat = await fs.lstat(sourceCapture.source.realpath); const exactSource = await fs.readFile(sourceCapture.source.realpath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || exactSource.length !== sourceCapture.source.bytes || sha256(exactSource) !== sourceCapture.source.sha256) fail('semantic QA source bytes/hash drifted after capture');
  const sourceDuration = sourceCapture.source.durationSeconds; const shots = [];
  for (const [index, intent] of batch.shotIntents.entries()) {
    const input = draft.shots[index]; if (input?.shotId !== intent.shotId || input?.cutId !== intent.cutId) fail('semantic QA shot order/lineage drifted');
    const observedIn = round(input.observedWindow?.inSeconds), observedOut = round(input.observedWindow?.outSeconds), selectedIn = round(input.selectedWindow?.inSeconds), selectedOut = round(input.selectedWindow?.outSeconds);
    if (!(observedIn >= 0 && observedOut > observedIn && observedOut <= sourceDuration + 0.001)) fail(`${intent.shotId} observed window is outside source duration`);
    if (!(selectedIn >= observedIn && selectedOut <= observedOut && selectedOut > selectedIn)) fail(`${intent.shotId} selected window is not continuous and contained in the observed shot`);
    if (Math.abs((selectedOut - selectedIn) - intent.authoredFinalCutDurationSeconds) > 0.05) fail(`${intent.shotId} selected window does not match authored final cut duration within ±0.05s`);
    for (const flag of ['semanticMatch', 'continuityPass', 'visibleChange', 'noReversal']) if (input[flag] !== true) fail(`${intent.shotId}.${flag} must pass independently`);
    if (input.providerEchoUsedAsQaEvidence !== false) fail(`${intent.shotId} provider echo cannot be QA evidence`);
    if (!isObject(input.referenceObservation) || input.referenceObservation.status !== 'observed-non-authoritative' || typeof input.referenceObservation.driftObserved !== 'boolean') fail(`${intent.shotId} reference comparison must remain non-authoritative`);
    if (!Array.isArray(input.frameEvidence) || input.frameEvidence.length < 2) fail(`${intent.shotId} requires at least two decoded frame evidence files`);
    const frames = []; const frameTimes = new Set(); const frameFiles = new Set(); const frameHashes = new Set();
    for (const [frameIndex, frame] of input.frameEvidence.entries()) {
      const record = await frameEvidence(evidenceRoot, frame, `${intent.shotId}.frameEvidence[${frameIndex}]`);
      if (record.timestampSeconds < observedIn || record.timestampSeconds > observedOut) fail(`${intent.shotId} frame evidence is outside its observed window`);
      if (frameTimes.has(record.timestampSeconds) || frameFiles.has(record.relativePath)) fail(`${intent.shotId} frame timestamps and files must be unique`); frameTimes.add(record.timestampSeconds); frameFiles.add(record.relativePath);
      const derived = await extractFrame(sourceCapture.source.realpath, record.timestampSeconds); const derivedDecoded = decodeImage(derived, `${intent.shotId} derived frame`);
      if (sha256(derived) !== record.sha256 || derived.length !== record.bytes || derivedDecoded.width !== record.width || derivedDecoded.height !== record.height) fail(`${intent.shotId} frame is not the exact deterministic source-frame derivation`);
      frameHashes.add(record.sha256); frames.push({ ...record, derivation: { sourceSha256: sourceCapture.source.sha256, extractor: 'ffmpeg-exact-frame-v1', timestampSeconds: record.timestampSeconds, outputSha256: record.sha256 } });
    }
    if (!frameTimes.has(selectedIn) || !frameTimes.has(selectedOut)) fail(`${intent.shotId} frame evidence must include the selected window start and end timestamps`);
    if (frameHashes.size < 2) fail(`${intent.shotId} visibleChange requires at least two distinct source-derived frame SHA-256 values`);
    shots.push({ shotId: intent.shotId, cutId: intent.cutId, requestedWindow: { inSeconds: intent.requestedInSeconds, outSeconds: intent.requestedOutSeconds }, observedWindow: { inSeconds: observedIn, outSeconds: observedOut }, selectedWindow: { inSeconds: selectedIn, outSeconds: selectedOut }, authoredFinalCutDurationSeconds: intent.authoredFinalCutDurationSeconds, semanticMatch: true, continuityPass: true, visibleChange: true, noReversal: true, providerEchoUsedAsQaEvidence: false, referenceObservation: structuredClone(input.referenceObservation), frameEvidence: frames });
  }
  for (let index = 1; index < shots.length; index += 1) if (shots[index].observedWindow.inSeconds < shots[index - 1].observedWindow.outSeconds || shots[index].selectedWindow.inSeconds < shots[index - 1].selectedWindow.outSeconds) fail('observed and selected windows must be ordered and non-overlapping');
  const artifact = {
    schema: SEMANTIC_QA_SCHEMA, storyId: sourceCapture.storyId, batchId: sourceCapture.batchId,
    authorities: { promptBatchArtifactSha256: promptBatchArtifact.approval.sha256, promptSha256: batch.prompt.sha256, sourceCaptureSha256: sourceCapture.approval.sha256, sourceSha256: sourceCapture.source.sha256 },
    reviewer: { kind: draft.reviewer.kind, reviewerId: text(draft.reviewer.reviewerId, 'reviewerId', 160), reviewedAt: draft.reviewer.reviewedAt }, shots,
    providerAudio: { discardRequired: true, ownerNarrationOnly: true, usedAsSemanticQaEvidence: false }, production: lockedProduction(),
  };
  artifact.verification = { passed: true, status: 'semantic-pass-pre-render-only', sha256: canonicalHash(artifact, 'verification') };
  return artifact;
}

export async function verifyGeminiSemanticQa({ artifact, promptBatchArtifact, sourceCapture, evidenceRoot, extractFrame = extractSourceFrame }) {
  const verification = artifact?.verification;
  if (!isObject(verification) || verification.passed !== true || verification.status !== 'semantic-pass-pre-render-only' || verification.sha256 !== canonicalHash(artifact, 'verification')) fail('semantic QA verification hash is stale');
  assertLockedProduction(artifact.production);
  const draft = { reviewer: artifact.reviewer, shots: artifact.shots.map((shot) => ({ shotId: shot.shotId, cutId: shot.cutId, observedWindow: shot.observedWindow, selectedWindow: shot.selectedWindow, semanticMatch: shot.semanticMatch, continuityPass: shot.continuityPass, visibleChange: shot.visibleChange, noReversal: shot.noReversal, providerEchoUsedAsQaEvidence: shot.providerEchoUsedAsQaEvidence, referenceObservation: shot.referenceObservation, frameEvidence: shot.frameEvidence })) };
  const recreated = await sealGeminiSemanticQa({ promptBatchArtifact, sourceCapture, draft, evidenceRoot, extractFrame });
  if (stableStringify(recreated) !== stableStringify(artifact)) fail('Gemini semantic QA evidence or authority drifted');
  return true;
}
