import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  compileFlowMultiReferencePacket,
  recordFlowMultiReferenceSubmission,
  verifyFlowMultiReferenceReceipt,
} from './newsroom-flow-multi-reference-pilot.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'newsroom-flow-multi-reference-'));
const writeRef = async (name, value) => {
  const relativePath = `refs/${name}.png`;
  await fs.mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
  await fs.writeFile(path.join(root, relativePath), Buffer.from(value));
  return relativePath;
};

const references = [
  { assetId: 'CHAR-DRIVER', roleTag: 'CHAR_DRIVER', kind: 'character', description: 'adult driver, realistic human body proportions, smooth blank matte mannequin face', imageRelativePath: await writeRef('driver', 'driver') },
  { assetId: 'CHAR-DAUGHTER', roleTag: 'CHAR_DAUGHTER', kind: 'character', description: 'teen passenger, realistic human body proportions, smooth blank matte mannequin face', imageRelativePath: await writeRef('daughter', 'daughter') },
  { assetId: 'CAR-IVORY', roleTag: 'CAR_IVORY', kind: 'vehicle', description: 'ivory sedan, fixed screen-left to screen-right travel direction', imageRelativePath: await writeRef('ivory', 'ivory') },
  { assetId: 'CAR-CHARCOAL', roleTag: 'CAR_CHARCOAL', kind: 'vehicle', description: 'charcoal sedan, same road and fixed heading', imageRelativePath: await writeRef('charcoal', 'charcoal') },
  { assetId: 'BG-ROAD', roleTag: 'BG_URBAN_ROAD', kind: 'background', description: 'ordinary Korean urban road in clear daytime light', imageRelativePath: await writeRef('road', 'road') },
];

const shots = [{
  shotId: 'B01-B03',
  selectedRoleTags: ['CHAR_DRIVER', 'CHAR_DAUGHTER', 'CAR_IVORY', 'CAR_CHARCOAL', 'BG_URBAN_ROAD'],
  sequence: [
    { shotId: 'B01', selectedRoleTags: ['CHAR_DRIVER', 'CAR_IVORY', 'CAR_CHARCOAL', 'BG_URBAN_ROAD'], startState: 'The driver is seated forward in the ivory sedan; the charcoal sedan is ahead on the same road.', action: 'The driver grips the wheel and looks toward the blocked lane through body orientation only.', endState: 'The driver remains seated forward and both vehicles keep the same heading.', camera: 'Locked exterior medium-wide road view, no orbit or internal cut.' },
    { shotId: 'B02', selectedRoleTags: ['CHAR_DRIVER', 'CHAR_DAUGHTER', 'CAR_IVORY'], startState: 'The adult driver is screen-right and the teenage daughter is screen-left in the front cabin, both facing forward.', action: 'Both occupants make one large synchronized recoil; shoulders rise and arms brace against the dashboard and seat.', endState: 'The same two occupants remain in the same seats with blank faces and braced bodies.', camera: 'Locked windshield interior view, no seat swap or extra person.' },
    { shotId: 'B03', selectedRoleTags: ['CAR_IVORY', 'CAR_CHARCOAL', 'BG_URBAN_ROAD'], startState: 'The ivory sedan is stopped beside the stationary charcoal sedan on the same road.', action: 'The ivory sedan moves forward and exits around the blocking position without collision.', endState: 'The ivory sedan has left frame; the charcoal sedan remains stationary and the road direction is unchanged.', camera: 'Fixed side view with one continuous outgoing vehicle movement.' },
  ],
}];

const packet = await compileFlowMultiReferencePacket({
  assetRoot: root,
  storyId: 'flow-multi-reference-test-story',
  globalStyle: 'Grounded editorial reenactment with realistic body proportions, smooth faceless matte mannequins, ordinary urban light.',
  references,
  shots,
});

assert.equal(packet.schema, 'newsroom-flow-multi-reference-multishot-v1');
assert.deepEqual(packet.workflow.stages, ['script', 'assets', 'storyboard']);
assert.equal(packet.workflow.originalScriptPolicy, 'preserve-exact-source-no-rewrite');
assert.deepEqual(packet.workflow.multishotPolicy, { minShots: 2, maxShots: 3, requestedDurationSeconds: 10, providerDurationVerified: false });
assert.equal(packet.rules.minShotsPerBatch, 2);
assert.deepEqual(packet.batches[0].compiledReferenceOrder, ['CHAR_DRIVER', 'CAR_IVORY', 'CAR_CHARCOAL', 'BG_URBAN_ROAD', 'CHAR_DAUGHTER']);
assert.equal(packet.design.branding, 'abandoned');
assert.equal(packet.production.provider, false);
assert.equal(packet.batches[0].compiledPrompt.includes('@CHAR_DRIVER'), true);
assert.equal(packet.batches[0].compiledPrompt.includes('@CHAR_DAUGHTER'), true);

const submittedPrompt = `${packet.batches[0].compiledPrompt}\n\nSubmitted in Flow exactly as compiled.`;
const submittedPromptSha256 = crypto.createHash('sha256').update(Buffer.from(submittedPrompt, 'utf8')).digest('hex');
const receipt = await recordFlowMultiReferenceSubmission({
  packet,
  assetRoot: root,
  references,
  shotSubmissions: [{
    shotId: 'B01-B03',
    submittedPrompt,
    submittedPromptSha256,
    referenceUploadOrder: packet.batches[0].compiledReferenceOrder,
  }],
});
assert.equal(receipt.schema, 'newsroom-flow-reference-submission-receipt-v1');
assert.equal(verifyFlowMultiReferenceReceipt({ packet, receipt }), true);

async function rejects(action, pattern, message) {
  await assert.rejects(action, pattern, message);
}

await rejects(
  () => compileFlowMultiReferencePacket({ assetRoot: root, storyId: 's', globalStyle: 'style', references: [{ ...references[0], roleTag: 'CHAR_DRIVER' }, { ...references[1], roleTag: 'CHAR_DRIVER' }], shots }),
  /duplicate reference roleTag|CODEX_ADMIN_BLOCKED/i,
  'duplicate role tags must fail closed',
);
await rejects(
  () => compileFlowMultiReferencePacket({ assetRoot: root, storyId: 's', globalStyle: 'style', references, shots: [{ ...shots[0], sequence: [{ ...shots[0].sequence[0], selectedRoleTags: ['CHAR_MISSING'] }, ...shots[0].sequence.slice(1)] }] }),
  /missing role tag|CODEX_ADMIN_BLOCKED/i,
  'missing selected reference must fail closed',
);
await rejects(
  () => compileFlowMultiReferencePacket({ assetRoot: root, storyId: 's', globalStyle: 'style', references, shots: [{ ...shots[0], sequence: [shots[0].sequence[0]] }] }),
  /two to three shots|CODEX_ADMIN_BLOCKED/i,
  'storyboard multishot batches must contain two or three shots',
);
await rejects(
  () => recordFlowMultiReferenceSubmission({ packet, assetRoot: root, references, shotSubmissions: [{ shotId: 'B01-B03', submittedPrompt, submittedPromptSha256, referenceUploadOrder: ['CHAR_DRIVER', 'CAR_IVORY'] }] }),
  /each selected role tag|CODEX_ADMIN_BLOCKED/i,
  'incomplete upload order must fail closed',
);
await rejects(
  () => recordFlowMultiReferenceSubmission({ packet, assetRoot: root, references, shotSubmissions: [{ shotId: 'B01-B03', submittedPrompt, submittedPromptSha256, referenceUploadOrder: ['CHAR_DRIVER', 'CAR_CHARCOAL', 'CAR_IVORY', 'BG_URBAN_ROAD', 'CHAR_DAUGHTER'] }] }),
  /upload order differs|CODEX_ADMIN_BLOCKED/i,
  'changed upload order must fail closed',
);
const missingShotBindingPrompt = submittedPrompt.replace('USE ONLY: @CHAR_DRIVER, @CHAR_DAUGHTER, @CAR_IVORY', 'USE ONLY: @CHAR_DRIVER, @CAR_IVORY');
await rejects(
  () => recordFlowMultiReferenceSubmission({ packet, assetRoot: root, references, shotSubmissions: [{ shotId: 'B01-B03', submittedPrompt: missingShotBindingPrompt, submittedPromptSha256: crypto.createHash('sha256').update(Buffer.from(missingShotBindingPrompt, 'utf8')).digest('hex'), referenceUploadOrder: packet.batches[0].compiledReferenceOrder }] }),
  /does not bind|CODEX_ADMIN_BLOCKED/i,
  'missing per-shot role binding must fail closed',
);
await rejects(
  () => recordFlowMultiReferenceSubmission({ packet, assetRoot: root, references, shotSubmissions: [{ shotId: 'B01-B03', submittedPrompt: `${submittedPrompt} @CHAR_MISSING`, submittedPromptSha256, referenceUploadOrder: packet.batches[0].compiledReferenceOrder }] }),
  /unselected role tag|CODEX_ADMIN_BLOCKED/i,
  'unknown prompt tag must fail closed',
);
await rejects(
  () => recordFlowMultiReferenceSubmission({ packet, assetRoot: root, references, shotSubmissions: [{ shotId: 'B01-B03', submittedPrompt, submittedPromptSha256: '0'.repeat(64), referenceUploadOrder: packet.batches[0].compiledReferenceOrder }] }),
  /sha256 mismatch|CODEX_ADMIN_BLOCKED/i,
  'submitted prompt hash drift must fail closed',
);

await fs.writeFile(path.join(root, references[0].imageRelativePath), Buffer.from('changed'));
await rejects(
  () => recordFlowMultiReferenceSubmission({ packet, assetRoot: root, references, shotSubmissions: [{ shotId: 'B01-B03', submittedPrompt, submittedPromptSha256, referenceUploadOrder: packet.batches[0].compiledReferenceOrder }] }),
  /changed|drift|CODEX_ADMIN_BLOCKED/i,
  'reference bytes drift must fail closed',
);

console.log('newsroom-flow-multi-reference-pilot tests passed');
