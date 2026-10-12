import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stableStringify } from './evidence-bundle.mjs';

export const FLOW_MULTI_REFERENCE_SCHEMA = 'newsroom-flow-multi-reference-multishot-v1';
export const FLOW_REFERENCE_RECEIPT_SCHEMA = 'newsroom-flow-reference-submission-receipt-v1';

const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const ROLE_TAG = /^(?:CHAR|CAR|BG|PROP|FRAME)_[A-Z0-9_]{1,56}$/u;
const TAG = /@[A-Z][A-Z0-9_]{1,63}/gu;
const PATHISH = /(?:[a-z][a-z0-9+.-]{1,31}:\/\/|(?:^|[\s"'(])[a-z]:[\\/]|(?:^|[\s"'(])(?:\.\.?[\\/]))/iu;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hashWithout = (value, field) => {
  const copy = structuredClone(value);
  delete copy[field];
  return sha256(Buffer.from(stableStringify(copy), 'utf8'));
};
const fail = (message) => { throw Object.assign(new Error(message), { code: 'CODEX_ADMIN_BLOCKED' }); };
const lockedProduction = () => ({ provider: false, render: false, upload: false, publication: false, stage07: false, continuationAuthorized: false });

function boundedText(value, label, max = 12000, preserveWhitespace = false) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || PATHISH.test(value)) fail(`${label} must be bounded path-free text`);
  return preserveWhitespace ? value : value.trim();
}

function safeRelativePath(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a relative path`);
  const normalized = value.replaceAll('\\', '/');
  if (path.isAbsolute(value) || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../') || normalized.includes('\0')) fail(`${label} must be contained relative path`);
  return normalized;
}

async function readPhysical(root, relativePath, label) {
  const absoluteRoot = path.resolve(root);
  const rootStat = await fs.lstat(absoluteRoot).catch(() => null);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) fail('asset root must be a physical directory');
  const relative = safeRelativePath(relativePath, `${label}.relativePath`);
  const resolved = path.resolve(absoluteRoot, relative);
  const prefix = `${absoluteRoot}${path.sep}`;
  if (resolved !== absoluteRoot && !resolved.startsWith(prefix)) fail(`${label} escapes asset root`);
  const stat = await fs.lstat(resolved).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) fail(`${label} must be a physical nonsymlink file`);
  const real = await fs.realpath(resolved);
  const realRoot = await fs.realpath(absoluteRoot);
  if (real !== resolved || !real.startsWith(`${realRoot}${path.sep}`)) fail(`${label} must be an exact contained physical file`);
  const bytes = await fs.readFile(resolved);
  return { relativePath: relative, realpath: real, bytes: bytes.length, sha256: sha256(bytes) };
}

function validateReferences(references) {
  if (!Array.isArray(references) || references.length < 2 || references.length > 12) fail('two to twelve references are required');
  const ids = new Set();
  const tags = new Set();
  return references.map((item, index) => {
    if (!isObject(item) || !ID.test(String(item.assetId || ''))) fail(`references[${index}].assetId is invalid`);
    if (!ROLE_TAG.test(String(item.roleTag || ''))) fail(`references[${index}].roleTag is invalid`);
    if (ids.has(item.assetId)) fail(`duplicate reference assetId ${item.assetId}`);
    if (tags.has(item.roleTag)) fail(`duplicate reference roleTag ${item.roleTag}`);
    ids.add(item.assetId); tags.add(item.roleTag);
    const kind = String(item.kind || '');
    if (!['character', 'vehicle', 'background', 'prop', 'frame'].includes(kind)) fail(`references[${index}].kind is invalid`);
    return {
      assetId: item.assetId,
      roleTag: item.roleTag,
      kind,
      description: boundedText(item.description, `references[${index}].description`, 500),
      imageRelativePath: safeRelativePath(item.imageRelativePath, `references[${index}].imageRelativePath`),
    };
  });
}

function validateShotIntent(shot, index, referenceMap) {
  if (!isObject(shot) || !ID.test(String(shot.shotId || ''))) fail(`shots[${index}].shotId is invalid`);
  if (!Array.isArray(shot.selectedRoleTags) || shot.selectedRoleTags.length < 1 || shot.selectedRoleTags.length > 12) fail(`shots[${index}].selectedRoleTags is required`);
  const selected = new Set();
  for (const roleTag of shot.selectedRoleTags) {
    if (!ROLE_TAG.test(String(roleTag)) || !referenceMap.has(roleTag)) fail(`shots[${index}] references missing role tag ${roleTag}`);
    if (selected.has(roleTag)) fail(`shots[${index}] repeats role tag ${roleTag}`);
    selected.add(roleTag);
  }
  if (!Array.isArray(shot.sequence) || shot.sequence.length < 2 || shot.sequence.length > 3) fail(`shots[${index}].sequence must contain two to three shots`);
  const sequence = shot.sequence.map((item, seqIndex) => {
    if (!isObject(item) || !ID.test(String(item.shotId || ''))) fail(`shots[${index}].sequence[${seqIndex}].shotId is invalid`);
    if (!Array.isArray(item.selectedRoleTags) || item.selectedRoleTags.length < 1) fail(`shots[${index}].sequence[${seqIndex}] needs selectedRoleTags`);
    const local = new Set();
    for (const roleTag of item.selectedRoleTags) {
      if (!ROLE_TAG.test(String(roleTag)) || !referenceMap.has(roleTag)) fail(`shots[${index}].sequence[${seqIndex}] references missing role tag ${roleTag}`);
      if (local.has(roleTag)) fail(`shots[${index}].sequence[${seqIndex}] repeats role tag ${roleTag}`);
      local.add(roleTag);
    }
    return {
      shotId: item.shotId,
      selectedRoleTags: [...item.selectedRoleTags],
      startState: boundedText(item.startState, `shots[${index}].sequence[${seqIndex}].startState`, 1000),
      action: boundedText(item.action, `shots[${index}].sequence[${seqIndex}].action`, 1800),
      endState: boundedText(item.endState, `shots[${index}].sequence[${seqIndex}].endState`, 1000),
      camera: boundedText(item.camera, `shots[${index}].sequence[${seqIndex}].camera`, 600),
    };
  });
  const expected = new Set(shot.selectedRoleTags);
  sequence.forEach((item) => item.selectedRoleTags.forEach((roleTag) => expected.add(roleTag)));
  return {
    shotId: shot.shotId,
    selectedRoleTags: [...shot.selectedRoleTags],
    sequence,
    expectedReferenceTags: [...expected],
    submittedPrompt: shot.submittedPrompt === undefined ? null : boundedText(shot.submittedPrompt, `shots[${index}].submittedPrompt`, 20000, true),
    referenceUploadOrder: shot.referenceUploadOrder === undefined ? null : [...shot.referenceUploadOrder],
  };
}

function assertPromptTags(prompt, allowedTags, label) {
  const text = boundedText(prompt, label, 20000, true);
  const tags = [...text.matchAll(TAG)].map((match) => match[0].slice(1));
  for (const tag of tags) if (!allowedTags.has(tag)) fail(`${label} contains unselected role tag @${tag}`);
  return tags;
}

function assertUploadOrder(orderedTags, expectedTags, label) {
  if (!Array.isArray(orderedTags) || orderedTags.length !== expectedTags.length) fail(`${label} must contain each selected role tag exactly once`);
  const expected = new Set(expectedTags);
  const seen = new Set();
  orderedTags.forEach((tag, index) => {
    if (!expected.has(tag)) fail(`${label}[${index}] is not a selected role tag: ${tag}`);
    if (seen.has(tag)) fail(`${label} repeats role tag: ${tag}`);
    seen.add(tag);
  });
  for (const tag of expected) if (!seen.has(tag)) fail(`${label} is missing role tag: ${tag}`);
  return [...orderedTags];
}

function assertShotBindings(prompt, sequence, label) {
  for (const [index, shot] of sequence.entries()) {
    const marker = `SHOT ${index + 1} (${shot.shotId})`;
    const start = prompt.indexOf(marker);
    if (start < 0) fail(`${label} is missing ${marker}`);
    const next = prompt.indexOf('\nSHOT ', start + marker.length);
    const segment = prompt.slice(start, next < 0 ? undefined : next);
    for (const roleTag of shot.selectedRoleTags) if (!segment.includes(`@${roleTag}`)) fail(`${label} does not bind @${roleTag} to ${shot.shotId}`);
  }
}

function compilePrompt({ references, sequence, globalStyle }) {
  const refMap = new Map(references.map((ref) => [ref.roleTag, ref]));
  const selected = [...new Set(sequence.flatMap((shot) => shot.selectedRoleTags))];
  const refs = selected.map((roleTag) => refMap.get(roleTag));
  const header = `FLOW REFERENCES: ${refs.map((ref, index) => `@${ref.roleTag}=Image${index + 1}`).join(' | ')}`;
  const bindings = refs.map((ref) => `@${ref.roleTag}: ${ref.kind}; ${ref.description}. Use only for this role.`).join('\n');
  const shots = sequence.map((shot, index) => [
    `SHOT ${index + 1} (${shot.shotId})`,
    `USE ONLY: ${shot.selectedRoleTags.map((tag) => `@${tag}`).join(', ')}`,
    `START STATE: ${shot.startState}`,
    `ACTION: ${shot.action}`,
    `END STATE: ${shot.endState}`,
    `CAMERA: ${shot.camera}`,
  ].join('\n')).join('\n\n');
  return `${header}\n\nGLOBAL STYLE: ${globalStyle}\n\nROLE BINDINGS:\n${bindings}\n\n${shots}\n\nNo extra characters, vehicles, backgrounds, props, text, logos, dialogue, audio or internal cuts. Preserve realistic human body proportions and smooth blank faceless matte mannequin surfaces. Emotion is expressed by body action only.`;
}

export async function compileFlowMultiReferencePacket({ assetRoot, storyId, globalStyle, references, shots }) {
  const root = path.resolve(assetRoot);
  const normalizedReferences = validateReferences(references);
  const physical = [];
  for (const [index, ref] of normalizedReferences.entries()) physical.push({ ...ref, ordinal: index + 1, file: await readPhysical(root, ref.imageRelativePath, `references[${index}]`) });
  const referenceMap = new Map(physical.map((ref) => [ref.roleTag, ref]));
  const normalizedShots = shots?.map((shot, index) => validateShotIntent(shot, index, referenceMap));
  if (!normalizedShots?.length || normalizedShots.length > 3) fail('one to three multi-shot batches are required');
  const compiledShots = normalizedShots.map((shot) => {
    const selectedTags = [...new Set(shot.sequence.flatMap((item) => item.selectedRoleTags))];
    const promptText = compilePrompt({ references: physical, sequence: shot.sequence, globalStyle: boundedText(globalStyle, 'globalStyle', 1200) });
    const promptTags = assertPromptTags(promptText, new Set(selectedTags), `${shot.shotId}.compiledPrompt`);
    assertShotBindings(promptText, shot.sequence, `${shot.shotId}.compiledPrompt`);
    if (new Set(promptTags).size !== selectedTags.length) fail(`${shot.shotId}.compiledPrompt must mention each selected role tag exactly once or more`);
    return { ...shot, selectedRoleTags: selectedTags, compiledPrompt: promptText, compiledPromptSha256: sha256(Buffer.from(promptText, 'utf8')), compiledReferenceOrder: selectedTags };
  });
  const packet = {
    schema: FLOW_MULTI_REFERENCE_SCHEMA,
    status: 'test-only / manual-flow-execution-required',
    storyId: boundedText(storyId, 'storyId', 120),
    workflow: {
      mode: 'storyboard-studio-parity-plus-multishot',
      stages: ['script', 'assets', 'storyboard'],
      originalScriptPolicy: 'preserve-exact-source-no-rewrite',
      multishotPolicy: { minShots: 2, maxShots: 3, requestedDurationSeconds: 10, providerDurationVerified: false },
    },
    design: { profile: 'realistic-proportion-faceless-matte-mannequin-v1', branding: 'abandoned', face: 'smooth-continuous-blank-no-features', emotion: 'body-action-only' },
    provider: { surface: 'google-flow', inputMode: 'multi-reference-and-multishot', tagSyntax: 'logical-role-tags-receipt-bound', nativeInputObserved: false, providerSource: false },
    references: physical.map((ref) => ({ assetId: ref.assetId, roleTag: ref.roleTag, kind: ref.kind, description: ref.description, ordinal: ref.ordinal, imageRelativePath: ref.file.relativePath, realpath: ref.file.realpath, bytes: ref.file.bytes, sha256: ref.file.sha256 })),
    batches: compiledShots.map((shot) => ({ shotId: shot.shotId, selectedRoleTags: shot.selectedRoleTags, sequence: shot.sequence, compiledPrompt: shot.compiledPrompt, compiledPromptSha256: shot.compiledPromptSha256, compiledReferenceOrder: shot.compiledReferenceOrder, submittedPrompt: shot.submittedPrompt, submittedPromptSha256: shot.submittedPrompt ? sha256(Buffer.from(shot.submittedPrompt, 'utf8')) : null, referenceUploadOrder: shot.referenceUploadOrder })),
    rules: { selectedRefsRequiredPerShot: true, uniqueRoleTagsRequired: true, exactSubmittedPromptRequiredForReceipt: true, uploadOrderReceiptRequired: true, missingReferenceFailClosed: true, minShotsPerBatch: 2, maxBatches: 3, maxShotsPerBatch: 3, automaticRetry: false, render: false, upload: false, publication: false },
    production: lockedProduction(),
  };
  packet.integrity = { verified: true, status: 'multi-reference-packet-integrity-only', sha256: hashWithout(packet, 'integrity') };
  return packet;
}

export async function recordFlowMultiReferenceSubmission({ packet, assetRoot, references, shotSubmissions }) {
  if (packet?.schema !== FLOW_MULTI_REFERENCE_SCHEMA || packet.integrity?.sha256 !== hashWithout(packet, 'integrity')) fail('multi-reference packet integrity is stale');
  if (stableStringify(packet.production) !== stableStringify(lockedProduction())) fail('multi-reference packet cannot authorize production');
  const root = path.resolve(assetRoot);
  const physical = validateReferences(references);
  const currentFiles = new Map();
  for (const ref of physical) currentFiles.set(ref.roleTag, await readPhysical(root, ref.imageRelativePath, `references.${ref.roleTag}`));
  const packetRefs = new Map(packet.references.map((ref) => [ref.roleTag, ref]));
  if (packetRefs.size !== physical.length) fail('reference set changed before submission');
  physical.forEach((ref) => {
    const prior = packetRefs.get(ref.roleTag);
    const current = currentFiles.get(ref.roleTag);
    if (!prior || prior.assetId !== ref.assetId || prior.imageRelativePath !== ref.imageRelativePath || prior.sha256 !== current.sha256 || prior.bytes !== current.bytes) fail(`reference bytes or role changed before submission: ${ref.roleTag}`);
  });
  if (!Array.isArray(shotSubmissions) || shotSubmissions.length !== packet.batches.length) fail('submission receipt must cover every batch exactly once');
  const submitted = shotSubmissions.map((submission, index) => {
    const batch = packet.batches[index];
    if (!isObject(submission) || submission.shotId !== batch.shotId) fail(`submission order or shotId drift at index ${index}`);
    const expected = batch.compiledReferenceOrder;
    const tags = assertPromptTags(submission.submittedPrompt, new Set(expected), `${batch.shotId}.submittedPrompt`);
    assertShotBindings(submission.submittedPrompt, batch.sequence, `${batch.shotId}.submittedPrompt`);
    assertUploadOrder(submission.referenceUploadOrder, expected, `${batch.shotId}.referenceUploadOrder`);
    if (sha256(Buffer.from(submission.submittedPrompt, 'utf8')) !== submission.submittedPromptSha256) fail(`${batch.shotId} submittedPromptSha256 mismatch`);
    if (stableStringify(submission.referenceUploadOrder) !== stableStringify(expected)) fail(`${batch.shotId} upload order differs from compiled selected reference order`);
    return { shotId: batch.shotId, submittedPrompt: submission.submittedPrompt, submittedPromptSha256: submission.submittedPromptSha256, referenceUploadOrder: submission.referenceUploadOrder, promptRoleTags: [...new Set(tags)] };
  });
  const receipt = { schema: FLOW_REFERENCE_RECEIPT_SCHEMA, status: 'recorded-manual-flow-submission', packetSchema: packet.schema, packetIntegritySha256: packet.integrity.sha256, references: packet.references, submissions: submitted, production: lockedProduction() };
  receipt.integrity = { verified: true, status: 'submission-receipt-integrity-only', sha256: hashWithout(receipt, 'integrity') };
  return receipt;
}

export function verifyFlowMultiReferenceReceipt({ packet, receipt }) {
  if (receipt?.schema !== FLOW_REFERENCE_RECEIPT_SCHEMA || receipt.integrity?.sha256 !== hashWithout(receipt, 'integrity')) fail('submission receipt integrity is stale');
  if (receipt.packetIntegritySha256 !== packet?.integrity?.sha256) fail('submission receipt is for a different packet');
  if (stableStringify(receipt.production) !== stableStringify(lockedProduction())) fail('submission receipt cannot authorize production');
  return true;
}

export const _test = { validateReferences, validateShotIntent, assertPromptTags, assertUploadOrder, assertShotBindings, compilePrompt, hashWithout };
