import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stableStringify } from './evidence-bundle.mjs';

export const REFERENCE_TAG_PACKET_SCHEMA = 'newsroom-gemini-reference-tag-packet-v1';
export const GEMINI_OMNI_REFERENCE_DOC = 'https://ai.google.dev/gemini-api/docs/omni';
export const GEMINI_OMNI_REFERENCE_DOC_DATE = '2026-09-01';

const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const TAG = /<IMAGE_REF_(\d+)>/gu;
const IMAGE_REF_TOKEN = /<IMAGE_REF_[^>]*>/gu;
const OLD_OMNIGEN_TOKEN = /<\|image_\d+\|>|<img\b[^>]*>|<\/img>/iu;
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

function safeText(value, label, max = 400, preserveWhitespace = false) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || PATHISH.test(value)) fail(`${label} must be bounded path-free text`);
  return preserveWhitespace ? value : value.trim();
}

function safeRelativePath(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a relative path`);
  const normalized = value.replaceAll('\\', '/');
  if (path.isAbsolute(value) || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../') || normalized.includes('\0')) fail(`${label} must be a safe contained relative path`);
  return normalized;
}

async function physicalReferenceFile(root, relativePath, label) {
  const absoluteRoot = path.resolve(root);
  const rootStat = await fs.lstat(absoluteRoot).catch(() => null);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) fail('reference root must be a physical directory');
  const relative = safeRelativePath(relativePath, `${label}.relativePath`);
  const resolved = path.resolve(absoluteRoot, relative);
  const prefix = `${absoluteRoot}${path.sep}`;
  if (resolved !== absoluteRoot && !resolved.startsWith(prefix)) fail(`${label} must stay inside the reference root`);
  const stat = await fs.lstat(resolved).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) fail(`${label} must be a physical nonsymlink file`);
  const real = await fs.realpath(resolved);
  const realRoot = await fs.realpath(absoluteRoot);
  const realPrefix = `${realRoot}${path.sep}`;
  if (real !== resolved || !real.startsWith(realPrefix)) fail(`${label} must be an exact contained physical file`);
  const bytes = await fs.readFile(resolved);
  return { relativePath: relative, realpath: real, bytes: bytes.length, sha256: sha256(bytes) };
}

function assertPromptTokens(scenePrompt, referenceCount) {
  const text = safeText(scenePrompt, 'scenePrompt', 8000, true);
  if (OLD_OMNIGEN_TOKEN.test(text)) fail('old OmniGen image tokens are not accepted');
  for (const match of text.matchAll(IMAGE_REF_TOKEN)) {
    if (!/^<IMAGE_REF_\d+>$/u.test(match[0])) fail(`malformed image reference tag ${match[0]}`);
  }
  if (/<IMAGE_REF_[^>]*$/u.test(text)) fail('unterminated image reference tag');
  const unknown = [];
  for (const match of text.matchAll(TAG)) {
    const index = Number(match[1]);
    if (!Number.isInteger(index) || index < 0 || index >= referenceCount) unknown.push(match[0]);
  }
  if (unknown.length) fail(`scenePrompt contains unknown image reference tag ${unknown[0]}`);
  return text;
}

function referenceTag(index) { return `<IMAGE_REF_${index}>`; }

function compilePromptText(references, scenePrompt) {
  const header = `[# References ${references.map((item, index) => `${referenceTag(index)}@Image${index + 1}`).join(' ')}]`;
  const bindings = references.map((item, index) => `${referenceTag(index)} is asset ${item.assetId}; role: ${item.role}. Use this image only for the stated role.`).join('\n');
  return `${header}\n\n${bindings}\n\nScene prompt:\n${scenePrompt}`;
}

function assertReferences(references) {
  if (!Array.isArray(references) || references.length < 1 || references.length > 5) fail('one to five ordered references are required');
  const ids = new Set(); const paths = new Set();
  return references.map((item, index) => {
    if (!isObject(item) || !ID.test(String(item.assetId || ''))) fail(`references[${index}].assetId is invalid`);
    if (ids.has(item.assetId)) fail(`duplicate reference assetId ${item.assetId}`);
    ids.add(item.assetId);
    const relativePath = safeRelativePath(item.imageRelativePath, `references[${index}].imageRelativePath`);
    if (paths.has(relativePath)) fail(`duplicate reference path ${relativePath}`);
    paths.add(relativePath);
    return { assetId: item.assetId, role: safeText(item.role, `references[${index}].role`, 160), relativePath };
  });
}

function assertReferenceHeader(promptText, referenceCount) {
  const match = /^\s*\[\s*#\s*References([\s\S]*?)\]/u.exec(promptText);
  if (!match) fail('submitted prompt must start with a References image-tag header');
  const body = match[1];
  const bindings = [...body.matchAll(/<IMAGE_REF_(\d+)>\s*@\s*Image(\d+)/gu)];
  const remainder = body.replace(/<IMAGE_REF_\d+>\s*@\s*Image\d+/gu, '').trim();
  if (remainder || bindings.length !== referenceCount) fail('submitted References header has unknown or missing image bindings');
  bindings.forEach((binding, index) => {
    if (Number(binding[1]) !== index || Number(binding[2]) !== index + 1) fail('submitted References header order is not contiguous');
  });
}

function buildPacket({ root, physical, promptText, status = 'compiled-experimental-reference-tags' }) {
  const promptBytes = Buffer.from(promptText, 'utf8');
  const manifest = {
    schema: 'newsroom-gemini-reference-tag-manifest-v1',
    rootRealpath: root,
    references: physical.map(({ ordinal, tag, assetId, role, file }) => ({ ordinal, tag, assetId, role, relativePath: file.relativePath, realpath: file.realpath, bytes: file.bytes, sha256: file.sha256 })),
  };
  manifest.sha256 = sha256(Buffer.from(stableStringify(manifest), 'utf8'));
  const packet = {
    schema: REFERENCE_TAG_PACKET_SCHEMA,
    status,
    provider: {
      surface: 'gemini-web',
      tagSyntax: 'gemini-omni-image-ref-v1',
      apiSyntaxDocumentedOn: GEMINI_OMNI_REFERENCE_DOC_DATE,
      apiDocumentationUrl: GEMINI_OMNI_REFERENCE_DOC,
      webEffectiveness: 'experimental-manual-observation-only',
      automaticSemanticPass: false,
    },
    references: manifest.references,
    prompt: { text: promptText, encoding: 'utf-8', bytes: promptBytes.length, sha256: sha256(promptBytes), exactUtf8BytesAuthority: true },
    manifest,
    production: lockedProduction(),
  };
  packet.integrity = { verified: true, status: 'reference-tag-packet-integrity-only', sha256: hashWithout(packet, 'integrity') };
  return packet;
}

async function physicalReferences(root, inputs) {
  const physical = [];
  for (const [index, input] of inputs.entries()) {
    const file = await physicalReferenceFile(root, input.relativePath, `references[${index}]`);
    physical.push({ ordinal: index + 1, tag: referenceTag(index), assetId: input.assetId, role: input.role, file });
  }
  return physical;
}

export async function compileGeminiReferenceTaggedPrompt({ assetRoot, references, scenePrompt }) {
  const root = path.resolve(assetRoot);
  const inputs = assertReferences(references);
  const promptScene = assertPromptTokens(scenePrompt, inputs.length);
  const physical = await physicalReferences(root, inputs);
  const promptText = compilePromptText(physical, promptScene);
  // Re-scan the complete emitted prompt so role text cannot smuggle an old token
  // or an unknown image tag into the exact bytes submitted to the web surface.
  assertPromptTokens(promptText, physical.length);
  return buildPacket({ root: await fs.realpath(root), physical, promptText });
}

export async function recordGeminiReferenceTaggedPrompt({ assetRoot, references, submittedPrompt }) {
  const root = path.resolve(assetRoot);
  const inputs = assertReferences(references);
  const promptText = assertPromptTokens(submittedPrompt, inputs.length);
  assertReferenceHeader(promptText, inputs.length);
  const physical = await physicalReferences(root, inputs);
  return buildPacket({ root: await fs.realpath(root), physical, promptText, status: 'recorded-experimental-reference-tags' });
}

export async function verifyGeminiReferenceTaggedPrompt({ packet, assetRoot, references, scenePrompt, submittedPrompt }) {
  if (packet?.schema !== REFERENCE_TAG_PACKET_SCHEMA || packet.integrity?.sha256 !== hashWithout(packet, 'integrity') || packet.integrity?.status !== 'reference-tag-packet-integrity-only') fail('reference tag packet integrity is stale');
  if (stableStringify(packet.production) !== stableStringify(lockedProduction())) fail('reference tag packet cannot authorize production');
  const recreated = packet.status === 'recorded-experimental-reference-tags'
    ? await recordGeminiReferenceTaggedPrompt({ assetRoot, references, submittedPrompt })
    : await compileGeminiReferenceTaggedPrompt({ assetRoot, references, scenePrompt });
  if (stableStringify(recreated) !== stableStringify(packet)) fail('reference tag packet or physical reference bytes drifted');
  return true;
}

export const _test = { physicalReferenceFile, assertPromptTokens, compilePromptText, hashWithout };
