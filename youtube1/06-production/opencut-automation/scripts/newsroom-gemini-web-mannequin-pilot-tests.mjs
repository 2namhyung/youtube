import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { importMannequinPilotSource, prepareMannequinPilot, verifyMannequinPilot } from './newsroom-gemini-web-mannequin-pilot.mjs';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-mannequin-pilot-'));
const bundle = path.join(temp, 'bundle'); await fs.mkdir(path.join(bundle, 'assets'), { recursive: true }); await fs.mkdir(path.join(bundle, 'prompts'), { recursive: true }); await fs.mkdir(path.join(bundle, 'evidence'), { recursive: true });
const png = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png); png.writeUInt32BE(480, 16); png.writeUInt32BE(854, 20);
const refs = [
  ['FRAME-S01-v1', 'entry-frame-reference', 'first-frame-continuity-only'],
  ['CHAR-M01-v1', 'character-reference', 'appearance-continuity-only'],
  ['CAR-A-v1', 'prop-reference', 'object-shape-only'],
  ['CAR-B-v1', 'prop-reference', 'object-shape-only'],
];
for (const [id] of refs) { await fs.writeFile(path.join(bundle, 'assets', `${id}.png`), png); await fs.writeFile(path.join(bundle, 'prompts', `${id}.txt`), `exact ${id} generation prompt`); }
await fs.writeFile(path.join(bundle, 'prompts', 'PILOT-S01-v1.txt'), 'intent prompt'); await fs.writeFile(path.join(bundle, 'prompts', 'PILOT-S01-submitted-v1.txt'), 'exact submitted prompt');
const audio = Buffer.from('owner voice preview bytes'); const audioPath = path.join(temp, 'paused-preview.wav'); await fs.writeFile(audioPath, audio);
const cuts = []; let cursor = 0;
for (let index = 0; index < 27; index += 1) { const end = index === 26 ? 70 : Number((cursor + 70 / 27).toFixed(6)); cuts.push({ cutId: `cut-${String(index + 1).padStart(3, '0')}`, actualStartSeconds: cursor, actualEndSeconds: end }); cursor = end; }
const scenePlan = { schema: 'newsroom-provisional-scene-plan-paused-preview-v1', status: 'paused-preview-only', approved: false, audioPreviewSha256: crypto.createHash('sha256').update(audio).digest('hex'), totalActualDurationSeconds: 70, cutCount: 27, cuts };
const scenePlanPath = path.join(temp, 'scene-plan.json'); await fs.writeFile(scenePlanPath, JSON.stringify(scenePlan));
const input = {
  schema: 'newsroom-gemini-web-mannequin-pilot-input-v1', storyId: 'research-test', pilotId: 'style-pilot-001',
  authorization: { scope: 'one fictional Gemini Web pilot', authorizedOn: '2026-09-07', source: 'current-user-request' },
  surfaceObservation: { status: 'observed-partial', observedAt: '2026-09-07', observedBy: 'primary-agent-via-cua', surface: 'gemini-web', modelLabel: 'Omni page description', modeLabel: 'Flash', aspectRatio: '9:16', durationControlStatus: 'not-observed', requestedDurationIntentSeconds: 8, providerDurationSupportClaimed: false },
  references: refs.map(([assetId, role, influenceScope], index) => ({ assetId, role, ordinal: index + 1, influenceScope, imageRelativePath: `assets/${assetId}.png`, promptRelativePath: `prompts/${assetId}.txt`, generatorLabel: 'test-generator' })),
  shots: [
    { shotId: 'shot-1', purpose: 'wide continuity test', requestedDurationSeconds: 2.7, sourceCutCoverageClaimed: false },
    { shotId: 'shot-2', purpose: 'medium continuity test', requestedDurationSeconds: 2.6, sourceCutCoverageClaimed: false },
    { shotId: 'shot-3', purpose: 'detail continuity test', requestedDurationSeconds: 2.7, sourceCutCoverageClaimed: false },
  ],
  videoPromptIntentRelativePath: 'prompts/PILOT-S01-v1.txt', submittedPromptRelativePath: 'prompts/PILOT-S01-submitted-v1.txt',
};
const audioProbe = async () => ({ durationSeconds: 70, audioPresent: true, videoPresent: false, width: 0, height: 0, fps: 0 });
const packet = await prepareMannequinPilot({ input, bundleRoot: bundle, scenePlanPath, audioPath, probe: audioProbe });
assert.equal(packet.status, 'operator-ready-duration-unverified');
assert.equal(packet.references.length, 4); assert.equal(packet.shots.length, 3);
assert(packet.shots.every((shot) => shot.sourceCutCoverageClaimed === false));
assert.equal(packet.upstream.status, 'provisional-preview-only'); assert.equal(packet.production.finalApproved, false);
assert.equal(packet.prompt.text, 'exact submitted prompt'); assert.equal(packet.prompt.exactSubmittedBytesAuthority, true);
const before = await fs.readFile(path.join(bundle, 'pilot-packet.json'));
await verifyMannequinPilot({ packet, input, bundleRoot: bundle, scenePlanPath, audioPath, probe: audioProbe });
assert.deepEqual(await fs.readFile(path.join(bundle, 'pilot-packet.json')), before, 'verification must not rewrite the packet');

const badInput = structuredClone(input); badInput.shots[0].sourceCutCoverageClaimed = true;
await assert.rejects(() => prepareMannequinPilot({ input: badInput, bundleRoot: bundle, scenePlanPath, audioPath, probe: audioProbe, writeOutputs: false }), /non-coverage declaration/u);
await fs.writeFile(path.join(bundle, 'prompts', 'PILOT-S01-submitted-v1.txt'), 'drifted submitted prompt');
await assert.rejects(() => verifyMannequinPilot({ packet, input, bundleRoot: bundle, scenePlanPath, audioPath, probe: audioProbe }), /drifted/u);
await fs.writeFile(path.join(bundle, 'prompts', 'PILOT-S01-submitted-v1.txt'), 'exact submitted prompt');

await fs.writeFile(path.join(bundle, 'source.mp4'), Buffer.from('preserved provider source bytes')); await fs.writeFile(path.join(bundle, 'evidence', 'receipt.png'), png);
const operatorInput = {
  schema: 'newsroom-gemini-web-mannequin-pilot-operator-input-v1', storyId: packet.storyId, pilotId: packet.pilotId, performedBy: 'primary-agent-via-cua', capturedAt: '2026-09-07T00:00:00.000Z', surface: 'gemini-web', modelLabel: 'Omni page description', modeLabel: 'Flash', promptCopiedSha256: packet.prompt.submittedFile.sha256,
  uploadOrder: packet.references.map((item) => ({ ordinal: item.ordinal, assetId: item.assetId, sha256: item.file.sha256, bytes: item.file.bytes })), receiptRelativePath: 'evidence/receipt.png',
  statement: 'I operated the recorded Gemini Web UI, copied the exact submitted prompt, uploaded the recorded references in the recorded order, and downloaded this source from that pilot run.',
};
const videoProbe = async () => ({ durationSeconds: 8.01, audioPresent: true, videoPresent: true, width: 720, height: 1280, fps: 24 });
const imported = await importMannequinPilotSource({ packet, operatorInput, bundleRoot: bundle, sourceRoot: bundle, sourceRelativePath: 'source.mp4', receiptRoot: bundle, probe: videoProbe });
assert.equal(imported.capture.status, 'captured-pilot-source-awaiting-independent-shot-qa');
assert.equal(imported.capture.durationObservation.surfaceDurationSupportConclusion, 'single-output-observed-near-intent-not-general-support-proof');
assert.equal(imported.pendingQa.status, 'pending-independent-shot-qa'); assert.equal(imported.capture.production.finalApproved, false);
const badOperator = structuredClone(operatorInput); badOperator.uploadOrder.reverse();
await assert.rejects(() => importMannequinPilotSource({ packet, operatorInput: badOperator, bundleRoot: bundle, sourceRoot: bundle, sourceRelativePath: 'source.mp4', receiptRoot: bundle, probe: videoProbe }), /upload order/u);

console.log('newsroom-gemini-web-mannequin-pilot-tests passed (generic 1-5 references, exact submitted prompt, fictional 1-3 shots, read-only verify, pending QA, 3 negative gates)');
