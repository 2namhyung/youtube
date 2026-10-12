import assert from 'node:assert/strict';
import {AUTHORED_TREATMENTS, VISUAL_ROLES, authoredScreenTimeCoverage, validateRadioEditPlan, validateVisualBlock} from './newsroom-sequence-first-radio-edit.mjs';

const asset = {assetId: 'asset-a', providerInputStatus: 'denied', editScope: 'local-only', rightsEvidence: {license: 'CC-BY-4.0'}, privacyReview: {reviewed: true}};
const block = {blockId: 'block-1', visualRole: VISUAL_ROLES.CONTEXT, semanticUnitIds: ['unit-1'], cutIds: ['cut-001', 'cut-002'], sourceAssetIds: ['asset-a'], status: 'admitted', disclosure: '자료사진 · 사건과 무관', claimBinding: 'generic-context-unrelated', continuityRationale: 'same narration beat, distinct framing', treatments: {'cut-001': 'full', 'cut-002': 'crop'}, providerInputStatus: 'denied', editScope: 'local-only', yppTransformation: {substantialNarration: true, authoredMotion: true, annotation: true, staticSlideshow: false, minimalEdit: false}};
const plan = {schema: 'newsroom-sequence-first-radio-edit-v1', sequenceAuthority: {source: 'locked-owner-narration', narrationAudioSha256: 'n', semanticCutPlanSha256: 's'}, cuts: [{cutId: 'cut-001', order: 1, durationSeconds: 2.5}, {cutId: 'cut-002', order: 2, durationSeconds: 2.5}], semanticUnits: [{unitId: 'unit-1', narrationSpanId: 'span-1'}], visualBlocks: [block], sourceAssets: [asset]};
assert.deepEqual(validateVisualBlock(block), []);
assert.deepEqual(validateRadioEditPlan(plan), []);
assert.equal(authoredScreenTimeCoverage(plan.cuts, plan.visualBlocks).ratio, 1);
assert(validateRadioEditPlan({...plan, sequenceAuthority: {...plan.sequenceAuthority, source: 'storyboard-first'}}).includes('radio-edit-authority'));
assert(validateRadioEditPlan({...plan, visualBlocks: [{...block, treatments: {'cut-001': 'full', 'cut-002': 'full'}}]}).some((error) => error.includes('same-treatment-reuse')));
assert(validateRadioEditPlan({...plan, visualBlocks: [{...block, cutIds: ['cut-001', 'cut-003'], treatments: {'cut-001': 'full', 'cut-003': 'crop'}}]}).some((error) => error.includes('unknown-cut')));
assert(validateRadioEditPlan({...plan, sourceAssets: [{...asset, providerInputStatus: 'allowed'}]}).some((error) => error.includes('asset-provider')));
assert(validateRadioEditPlan({...plan, visualBlocks: [{...block, visualRole: VISUAL_ROLES.EVIDENCE, claimBinding: 'generic-context-unrelated'}]}).some((error) => error.includes('evidence-claim-binding')));
assert(validateVisualBlock({...block, disclosure: ''}).includes('context-disclosure'));
assert(validateVisualBlock({...block, evidenceOverlayRequirement: {required: false, status: 'unresolved'}}).includes('evidence-overlay-required'));
assert.deepEqual(AUTHORED_TREATMENTS.length, 5);
console.log('newsroom-sequence-first-radio-edit-tests passed (7 negative gates)');
