import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { stableStringify } from './evidence-bundle.mjs';
import {
  captureGeminiWebSource, compileGeminiPromptBatches, sealFullVisualStoryline, sealGeminiSemanticQa, sealImagegenReferenceCatalog, sealV9EntryAuthority,
  verifyFullVisualStoryline, verifyGeminiPromptBatches, verifyGeminiSemanticQa, verifyGeminiWebSourceCapture, verifyImagegenReferenceCatalog, verifyV9EntryAuthority,
} from './newsroom-gemini-storyboard-pipeline.mjs';

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const canonical = (value, field = 'approval') => { const copy = structuredClone(value); delete copy[field]; return sha(Buffer.from(stableStringify(copy), 'utf8')); };
const approval = (value, status = 'admitted') => ({ approved: true, status, sha256: canonical(value) });
const hashes = Array.from({ length: 8 }, (_, index) => String(index + 1).repeat(64));

const storyline = { schema: 'newsroom-storyline-v2', caseId: 'case-a', authorities: { newsSha256: hashes[0], scriptSha256: hashes[1], narrationAudioSha256: hashes[2], narrationTimingSha256: hashes[3] }, beginning: 'b', development: 'd', turn: 't', resolution: 'r', endQuestion: 'q', addedNewsFacts: [], qualifiers: [] };
storyline.approval = approval(storyline);
const planCuts = Array.from({ length: 28 }, (_, index) => ({ cutId: `cut-${String(index + 1).padStart(3, '0')}`, spanBindings: [{ spanId: `span-${index + 1}`, start: index, end: index + 1 }], durationIntent: { authoredDurationSeconds: 2.5, exceptionReason: 'none' } }));
const cutPlan = { schema: 'newsroom-semantic-cut-plan-v2', caseId: 'case-a', authorities: { storylineSha256: storyline.approval.sha256, ...storyline.authorities }, cuts: planCuts, pathFree: true };
cutPlan.approval = approval(cutPlan, 'sealed');
const legalReview = { schema: 'approved-legal-review-v1', storyId: 'case-a', decision: 'approved' }; legalReview.approval = approval(legalReview, 'approved');
const titleApproval = { schema: 'approved-two-line-title-v1', storyId: 'case-a', lines: ['first title', 'second title'] }; titleApproval.approval = approval(titleApproval, 'approved');
const ownerNarrationApproval = { schema: 'approved-owner-narration-authority-v1', storyId: 'case-a', ownerVoice: true, audioSha256: storyline.authorities.narrationAudioSha256, timingSha256: storyline.authorities.narrationTimingSha256 }; ownerNarrationApproval.approval = approval(ownerNarrationApproval, 'approved');
const supersessionReconciliation = { schema: 'production-reconciliation-v1', storyId: 'case-a', current: true, noUnresolvedConflicts: true }; supersessionReconciliation.approval = approval(supersessionReconciliation, 'current');
const entrySources = { legalReview, titleApproval, ownerNarrationApproval, supersessionReconciliation };
const entryAuthority = sealV9EntryAuthority({ ...entrySources, storyline, semanticCutPlan: cutPlan });
assert.equal(verifyV9EntryAuthority({ artifact: entryAuthority, entrySources, storyline, semanticCutPlan: cutPlan }), true);

const sequenceChunks = []; for (let index = 0; index < planCuts.length; index += 3) sequenceChunks.push(planCuts.slice(index, index + 3));
const visualCuts = []; const sequences = [];
for (const [sequenceIndex, chunk] of sequenceChunks.entries()) {
  const sequenceId = `seq-${String(sequenceIndex + 1).padStart(2, '0')}`;
  for (const [cutIndex, cut] of chunk.entries()) visualCuts.push({ cutId: cut.cutId, sequenceId, transition: cutIndex === 0 ? 'hard-cut-location-change' : 'continue', entryStateId: `state-${sequenceIndex}-${cutIndex}`, exitStateId: `state-${sequenceIndex}-${cutIndex + 1}`, visualPurpose: `purpose ${cut.cutId}`, promptFoundation: `visual action for ${cut.cutId}`, cameraPlan: { framing: 'medium', angle: 'eye level', movement: 'slow push', composition: 'subject in the vertical safe center' }, actionPlan: { subject: 'anonymous subject', startState: `state content ${sequenceIndex}-${cutIndex}`, action: 'subject completes one clear action', endState: `state content ${sequenceIndex}-${cutIndex + 1}`, screenDirection: 'left to right' } });
  sequences.push({ sequenceId, cutIds: chunk.map((cut) => cut.cutId), purpose: `sequence purpose ${sequenceId}`, promptFoundation: `sequence visual foundation ${sequenceId}`, cameraArc: 'wide to medium to close', actionArc: 'start, change, settle' });
}
const visualDraft = { storyId: 'case-a', fullStoryline: { beginning: 'visual beginning', development: 'visual development', turn: 'visual turn', resolution: 'visual resolution', endQuestion: 'visual closing question', globalVisualPrompt: 'consistent restrained documentary lighting', cameraGrammar: 'stable authored camera with motivated hard cuts', actionGrammar: 'one readable physical action per shot', continuityRules: 'preserve screen direction and explicit entry and exit states', prohibitedContent: 'no invented evidence, real-person identity, logos, subtitles, or sensational gore' }, sequences, cuts: visualCuts };
const visual = sealFullVisualStoryline({ draft: visualDraft, storyline, semanticCutPlan: cutPlan, entryAuthority, entrySources });
assert.equal(visual.format.targetDurationSeconds, 70);
assert.equal(verifyFullVisualStoryline({ artifact: visual, storyline, semanticCutPlan: cutPlan, entryAuthority, entrySources }), true);

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-storyboard-test-'));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const pngB = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZrNwAAAAASUVORK5CYII=', 'base64');
await fs.mkdir(path.join(temp, 'refs')); await fs.writeFile(path.join(temp, 'refs', 'character.png'), png);
const referenceDraft = { assets: [{ assetId: 'ref-character', role: 'character-reference', file: { relativePath: 'refs/character.png', width: 1, height: 1, mimeType: 'image/png' }, generation: { model: 'imagegen', prompt: 'anonymous recurring character turnaround on neutral background' }, allowedInfluenceScopes: ['appearance-continuity-only'] }] };
const references = await sealImagegenReferenceCatalog({ draft: referenceDraft, fullVisualStoryline: visual, assetRoot: temp });
assert.equal(await verifyImagegenReferenceCatalog({ artifact: references, fullVisualStoryline: visual, assetRoot: temp }), true);

const batchDrafts = sequenceChunks.map((chunk, index) => ({ batchId: `batch-${String(index + 1).padStart(2, '0')}`, sequenceId: sequences[index].sequenceId, shots: chunk.map((cut, shotIndex) => ({ shotId: `shot-${index + 1}-${shotIndex + 1}`, cutId: cut.cutId, requestedDurationSeconds: chunk.length === 1 ? 6 : [4, 3, 3][shotIndex] })), referenceBindings: index === 0 ? [{ assetId: 'ref-character', ordinal: 1, influenceScope: 'appearance-continuity-only' }] : [] }));
const batches = await compileGeminiPromptBatches({ fullVisualStoryline: visual, referenceCatalog: references, batchDrafts, assetRoot: temp });
assert.match(batches.batches[0].prompt.text, /시간 경계는 비결정적/u);
assert.equal(batches.batches[0].requestedDurationSeconds, 10);
assert.equal(await verifyGeminiPromptBatches({ artifact: batches, fullVisualStoryline: visual, referenceCatalog: references, assetRoot: temp }), true);

await fs.mkdir(path.join(temp, 'sources')); await fs.writeFile(path.join(temp, 'sources', 'batch-01.mp4'), Buffer.from('provider-video'));
const uploadOrder = batches.batches[0].referenceBindings.map(({ ordinal, assetId, sha256, bytes }) => ({ ordinal, assetId, sha256, bytes }));
await fs.mkdir(path.join(temp, 'receipts')); await fs.writeFile(path.join(temp, 'receipts', 'batch-01.png'), png);
const operatorAttestation = { schema: 'newsroom-gemini-web-operator-attestation-v1', storyId: 'case-a', batchId: 'batch-01', surface: 'gemini-web', modelId: 'gemini-omni-1.1-flash', status: 'human-attested', performedBy: 'manual-operator', capturedAt: '2026-09-02T00:00:00.000Z', promptCopiedSha256: batches.batches[0].prompt.sha256, uploadOrder, receipt: { relativePath: 'receipts/batch-01.png', realpath: path.join(temp, 'receipts', 'batch-01.png'), bytes: png.length, sha256: sha(png), width: 1, height: 1, mimeType: 'image/png', preserved: true } };
operatorAttestation.approval = approval(operatorAttestation, 'attested');
const probe = async () => ({ width: 1080, height: 1920, durationSeconds: 10, fps: 24, audioPresent: true });
const capture = await captureGeminiWebSource({ promptBatchArtifact: batches, batchId: 'batch-01', sourceRoot: temp, relativePath: 'sources/batch-01.mp4', operatorAttestation, evidenceRoot: temp, probe });
assert.equal(capture.audioPolicy, 'discard-provider-audio-before-owner-narration-mix');
assert.equal(await verifyGeminiWebSourceCapture({ artifact: capture, promptBatchArtifact: batches, sourceRoot: temp, operatorAttestation, evidenceRoot: temp, probe }), true);

await fs.mkdir(path.join(temp, 'frames')); const shotWindows = [[0, 3.1], [3.2, 6.4], [6.5, 10]];
for (let index = 0; index < 3; index += 1) for (let frame = 0; frame < 2; frame += 1) await fs.writeFile(path.join(temp, 'frames', `s${index}-${frame}.png`), frame ? pngB : png);
const qaDraft = { reviewer: { kind: 'independent-frame-analysis', reviewerId: 'qa-a', reviewedAt: '2026-09-02T00:10:00.000Z' }, shots: batches.batches[0].shotIntents.map((intent, index) => ({ shotId: intent.shotId, cutId: intent.cutId, observedWindow: { inSeconds: shotWindows[index][0], outSeconds: shotWindows[index][1] }, selectedWindow: { inSeconds: shotWindows[index][0], outSeconds: shotWindows[index][0] + 2.5 }, semanticMatch: true, continuityPass: true, visibleChange: true, noReversal: true, providerEchoUsedAsQaEvidence: false, referenceObservation: { status: 'observed-non-authoritative', driftObserved: false }, frameEvidence: [0, 1].map((frame) => ({ relativePath: `frames/s${index}-${frame}.png`, timestampSeconds: shotWindows[index][0] + frame * 2.5, width: 1, height: 1, mimeType: 'image/png' })) })) };
let extractionCalls = 0; const extractFrame = async () => extractionCalls++ % 2 ? pngB : png;
const qa = await sealGeminiSemanticQa({ promptBatchArtifact: batches, sourceCapture: capture, draft: qaDraft, evidenceRoot: temp, extractFrame });
assert.equal(qa.providerAudio.ownerNarrationOnly, true);
assert.equal(await verifyGeminiSemanticQa({ artifact: qa, promptBatchArtifact: batches, sourceCapture: capture, evidenceRoot: temp, extractFrame }), true);
const sameReviewer = structuredClone(qaDraft); sameReviewer.reviewer.reviewerId = ' Manual Operator ';
await assert.rejects(() => sealGeminiSemanticQa({ promptBatchArtifact: batches, sourceCapture: capture, draft: sameReviewer, evidenceRoot: temp, extractFrame }), /independent from the source operator/u);
for (let index = 0; index < 3; index += 1) await fs.writeFile(path.join(temp, 'frames', `s${index}-1.png`), png);
await assert.rejects(() => sealGeminiSemanticQa({ promptBatchArtifact: batches, sourceCapture: capture, draft: qaDraft, evidenceRoot: temp, extractFrame: async () => png }), /visibleChange requires at least two distinct/u);
for (let index = 0; index < 3; index += 1) await fs.writeFile(path.join(temp, 'frames', `s${index}-1.png`), pngB);

assert.throws(() => sealFullVisualStoryline({ draft: visualDraft, storyline, semanticCutPlan: { ...cutPlan, cuts: cutPlan.cuts.slice(0, 27), approval: undefined }, entryAuthority, entrySources }), /approval/u);
assert.throws(() => sealFullVisualStoryline({ draft: { ...visualDraft, titleSha256: hashes[0] }, storyline, semanticCutPlan: cutPlan, entryAuthority, entrySources }), /untrusted title SHA/u);
const staleSources = structuredClone(entrySources); staleSources.legalReview.storyId = 'other-story'; staleSources.legalReview.approval.sha256 = canonical(staleSources.legalReview);
assert.throws(() => sealFullVisualStoryline({ draft: visualDraft, storyline, semanticCutPlan: cutPlan, entryAuthority, entrySources: staleSources }), /exact storyId/u);
const brokenContinue = structuredClone(visualDraft); brokenContinue.cuts[1].actionPlan.startState = 'different physical state';
assert.throws(() => sealFullVisualStoryline({ draft: brokenContinue, storyline, semanticCutPlan: cutPlan, entryAuthority, entrySources }), /state ID and content/u);
await assert.rejects(() => sealImagegenReferenceCatalog({ draft: { assets: [{ ...referenceDraft.assets[0], allowedInfluenceScopes: ['composition-only'] }] }, fullVisualStoryline: visual, assetRoot: temp }), /reference role/u);
await fs.writeFile(path.join(temp, 'refs', 'invalid.png'), Buffer.from('not-an-image'));
await assert.rejects(() => sealImagegenReferenceCatalog({ draft: { assets: [{ ...referenceDraft.assets[0], assetId: 'invalid-ref', file: { ...referenceDraft.assets[0].file, relativePath: 'refs/invalid.png' } }] }, fullVisualStoryline: visual, assetRoot: temp }), /decodable/u);
await assert.rejects(() => compileGeminiPromptBatches({ fullVisualStoryline: visual, referenceCatalog: references, batchDrafts: batchDrafts.slice(1), assetRoot: temp }), /cover every sealed cut/u);
await fs.writeFile(path.join(temp, 'refs', 'character.png'), Buffer.concat([png, Buffer.from('drift')]));
await assert.rejects(() => compileGeminiPromptBatches({ fullVisualStoryline: visual, referenceCatalog: references, batchDrafts, assetRoot: temp }), /non-canonical|drift/u);
await fs.writeFile(path.join(temp, 'refs', 'character.png'), png);
const badAttestation = structuredClone(operatorAttestation); badAttestation.uploadOrder = []; badAttestation.approval.sha256 = canonical(badAttestation);
await assert.rejects(() => captureGeminiWebSource({ promptBatchArtifact: batches, batchId: 'batch-01', sourceRoot: temp, relativePath: 'sources/batch-01.mp4', operatorAttestation: badAttestation, evidenceRoot: temp, probe }), /upload order/u);
const wrongPrompt = structuredClone(operatorAttestation); wrongPrompt.promptCopiedSha256 = hashes[0]; wrongPrompt.approval.sha256 = canonical(wrongPrompt);
await assert.rejects(() => captureGeminiWebSource({ promptBatchArtifact: batches, batchId: 'batch-01', sourceRoot: temp, relativePath: 'sources/batch-01.mp4', operatorAttestation: wrongPrompt, evidenceRoot: temp, probe }), /exact compiled prompt/u);
const badQa = structuredClone(qaDraft); badQa.shots[0].selectedWindow.outSeconds = 2;
await assert.rejects(() => sealGeminiSemanticQa({ promptBatchArtifact: batches, sourceCapture: capture, draft: badQa, evidenceRoot: temp, extractFrame }), /authored final cut duration/u);
const overlapQa = structuredClone(qaDraft); overlapQa.shots[1].observedWindow.inSeconds = 3;
await assert.rejects(() => sealGeminiSemanticQa({ promptBatchArtifact: batches, sourceCapture: capture, draft: overlapQa, evidenceRoot: temp, extractFrame }), /ordered and non-overlapping/u);
await assert.rejects(() => sealGeminiSemanticQa({ promptBatchArtifact: batches, sourceCapture: capture, draft: qaDraft, evidenceRoot: temp, extractFrame: async () => Buffer.from('arbitrary') }), /decodable/u);
const promoted = structuredClone(references); promoted.policy.factAuthority = true; promoted.approval.sha256 = canonical(promoted);
await assert.rejects(() => verifyImagegenReferenceCatalog({ artifact: promoted, fullVisualStoryline: visual, assetRoot: temp }), /promoted/u);

console.log('newsroom-gemini-storyboard-pipeline-tests passed (65-80s, references, 4/3/3, capture, deterministic semantic QA, 16 negative gates)');
