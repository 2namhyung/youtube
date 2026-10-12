import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildEvidenceBundle, bundleHash, verifyEvidenceBundle } from './evidence-bundle.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-bundle-'));
const write = (name, value, bom = false) => {
  const file = path.join(root, name);
  fs.writeFileSync(file, `${bom ? '\uFEFF' : ''}${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return file;
};
const research = write('research.json', {
  slug: 'fixture',
  sources: [{ id: 'src-1', url: 'https://example.invalid/verified', publisher: 'fixture', verified: true, excerpt: 'SOURCE EXCERPT MUST NOT LEAK' }],
  rawArticleBody: 'RAW BODY MUST NOT LEAK',
});
const dossier = write('dossier.json', {
  slug: 'fixture',
  sourceIndex: [{ sourceId: 'src-2', url: 'https://example.invalid/dossier', title: 'Dossier source', publisher: 'fixture', status: 'verified', relationshipReason: 'metadata only' }],
  claims: [{ id: 'claim-2', summary: 'Fact two', sourceIds: ['src-2'], status: 'confirmed', confidence: 'high' }],
  conflicts: [{ id: 'dossier-conflict', note: 'Dossier conflict' }],
  unknowns: ['Dossier unknown'],
  scriptPolicy: { allowedClaims: ['claim-2'] },
});
const legalValue = {
  confirmedFacts: [{ id: 'claim-1', summary: 'Fact one', field: 'event', sourceIds: ['src-1'], status: 'confirmed', confidence: 'high' }],
  contradictions: [{ id: 'legal-conflict', note: 'Legal conflict' }],
  missingFacts: ['Legal unknown'],
  allowedClaims: [],
  videoDecision: { decision: 'conditional', reasons: ['qualification required'] },
  scriptPolicy: {
    allowedClaims: ['claim-1'],
    prohibitedClaims: [{ id: 'rule-banned-text', statement: 'BANNED TEXT' }],
    prohibitedPhrases: [],
    requiredQualifications: [{ id: 'q-1', claimIds: ['claim-1'], qualifier: 'according to records' }],
    identityRestrictions: [{ id: 'identity-1', claimIds: ['claim-1'], text: 'Keep identity anonymous' }],
    footageRestrictions: [{ id: 'footage-2', claimIds: ['claim-2'], text: 'Use reenactment only' }],
  },
};
const legal = write('legal.json', legalValue);
const scriptValue = { draft: 'Fact one according to records. Fact two.' };
const script = write('script.json', scriptValue, true);
const scriptSpans = [
  { scene: 1, captionAnchor: 'Fact one', excerpt: 'Fact one according to records.', claimIds: ['claim-1'], evidenceClass: 'direct', qualificationIds: ['q-1'], legalConstraintIds: ['identity-1'] },
  { scene: 2, excerpt: 'Fact two.', claimIds: ['claim-2'], evidenceClass: 'direct', qualificationIds: [], legalConstraintIds: ['footage-2'] },
];
const input = { researchSnapshot: research, eventDossier: dossier, legalReport: legal, script, rootDir: root, scriptSpans };
const first = buildEvidenceBundle(input);
const second = buildEvidenceBundle(input);
assert.deepEqual(first, second, 'bundle creation must be deterministic');
assert.equal(JSON.stringify(first).includes('RAW BODY MUST NOT LEAK'), false, 'raw article body must not leak');
assert.equal(JSON.stringify(first).includes('SOURCE EXCERPT MUST NOT LEAK'), false, 'source excerpt must not leak');
assert.deepEqual(first.conflicts.map((item) => item.statement).sort(), ['Dossier conflict', 'Legal conflict']);
assert.deepEqual(first.unknowns, ['Dossier unknown', 'Legal unknown']);
assert.deepEqual(first.legal.allowedClaims, ['claim-1', 'claim-2']);
assert.deepEqual(first.scriptSpans[0].mediaConstraints, { identityRestrictionIds: ['identity-1'], footageRestrictionIds: [] });
assert.deepEqual(first.scriptSpans[1].qualificationIds, [], 'unrelated spans must not inherit claim-scoped qualifications');
assert.doesNotThrow(() => verifyEvidenceBundle(first, { rootDir: root }), 'BOM JSON must parse during verification while exact bytes remain hashed');

const nonAllowedClaim = structuredClone(first);
nonAllowedClaim.legal.allowedClaims = ['claim-1'];
nonAllowedClaim.bundleSha256 = bundleHash(nonAllowedClaim);
assert.throws(() => verifyEvidenceBundle(nonAllowedClaim, { rootDir: root }), /outside legal allowedClaims/);
const emptyAllowedClaims = structuredClone(first);
emptyAllowedClaims.legal.allowedClaims = [];
emptyAllowedClaims.bundleSha256 = bundleHash(emptyAllowedClaims);
assert.throws(() => verifyEvidenceBundle(emptyAllowedClaims, { rootDir: root }), /must explicitly authorize/);

const traversal = structuredClone(first);
traversal.upstream.script.path = 'nested/../../outside.json';
traversal.bundleSha256 = bundleHash(traversal);
assert.throws(() => verifyEvidenceBundle(traversal, { rootDir: root }), /resolve inside its root/);
const backslashTraversal = structuredClone(first);
backslashTraversal.upstream.script.path = '..\\outside.json';
backslashTraversal.bundleSha256 = bundleHash(backslashTraversal);
assert.throws(() => verifyEvidenceBundle(backslashTraversal, { rootDir: root }), /resolve inside its root/);
const reorderedClaims = structuredClone(first);
reorderedClaims.claims.reverse();
reorderedClaims.bundleSha256 = bundleHash(reorderedClaims);
assert.throws(() => verifyEvidenceBundle(reorderedClaims, { rootDir: root }), /claims must be ordered/);
const reorderedSources = structuredClone(first);
reorderedSources.sourceIndex.reverse();
reorderedSources.bundleSha256 = bundleHash(reorderedSources);
assert.throws(() => verifyEvidenceBundle(reorderedSources, { rootDir: root }), /sourceIndex must be ordered/);

const denied = structuredClone(first);
denied.legal.videoDecision.decision = 'denied';
denied.bundleSha256 = bundleHash(denied);
assert.throws(() => verifyEvidenceBundle(denied, { rootDir: root }), /videoDecision.*blocks/);
const minimal = { schema: 'editorial-evidence-bundle-v1', generationPolicy: 'explicit-mapping-only' };
minimal.bundleSha256 = bundleHash(minimal);
assert.throws(() => verifyEvidenceBundle(minimal, { rootDir: root }), /required/);

const nestedDeniedLegal = write('nested-denied-legal.json', { ...legalValue, scriptPolicy: { ...legalValue.scriptPolicy, videoDecision: { decision: 'deny' } } });
assert.throws(() => buildEvidenceBundle({ ...input, legalReport: nestedDeniedLegal }), /videoDecision blocks/);
const contradictorySource = write('contradictory-source.json', { sources: [{ id: 'src-1', url: 'https://example.invalid/verified', status: 'verified', verified: false }] });
assert.throws(() => buildEvidenceBundle({ ...input, researchSnapshot: contradictorySource }), /explicitly unverified/);

const bannedScript = write('banned-script.json', { draft: 'Fact one according to records. BANNED\n\tTEXT.' });
assert.throws(() => buildEvidenceBundle({ ...input, script: bannedScript, scriptSpans: [{ ...scriptSpans[0], excerpt: 'Fact one according to records.' }, { ...scriptSpans[1], excerpt: 'BANNED\n\tTEXT.' }] }), /prohibited text: BANNED TEXT/);

const missingQualifier = [{ ...scriptSpans[0], excerpt: 'Fact one', qualificationIds: ['q-1'] }, scriptSpans[1]];
assert.throws(() => buildEvidenceBundle({ ...input, scriptSpans: missingQualifier }), /required qualifier text/);
const tampered = structuredClone(first);
tampered.bundleSha256 = '0'.repeat(64);
assert.throws(() => verifyEvidenceBundle(tampered, { rootDir: root }), /bundleSha256/);
fs.writeFileSync(script, `${JSON.stringify({ draft: `${scriptValue.draft} changed` }, null, 2)}\n`, 'utf8');
assert.throws(() => verifyEvidenceBundle(first, { rootDir: root }), /upstream script hash is stale/);

console.log(JSON.stringify({ status: 'pass', schema: first.schema, claims: first.claims.length, scenes: first.scriptSpans.length, reviewerNegatives: ['path', 'legal-allowlist', 'denied', 'prohibited-free-text', 'minimal-shape'] }, null, 2));
