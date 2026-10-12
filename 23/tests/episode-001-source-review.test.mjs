import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {buildSourceReviewPackage, findCandidateCollisions} from '../video/scripts/build-episode-001-source-review.mjs';
import {validateManifestObject, validateSourceReviewPackage} from '../video/scripts/validate-episode-001-source-review.mjs';

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));
const acquisitionQueue = JSON.parse(fs.readFileSync(new URL('../video/episodes/episode-001/generated/acquisition-queue.json', import.meta.url), 'utf8'));

function expectedCoverageFromQueue(queue) {
  const linked = queue.requirements.filter((requirement) => requirement.candidate !== null);
  const uncovered = queue.requirements.filter((requirement) => requirement.candidate === null);
  const linkedSourceIds = new Set(linked.map((requirement) => requirement.source_id));
  return {
    registeredCandidateCount: queue.summary.registered_candidate_count,
    linkedSourceIdCount: linkedSourceIds.size,
    linkedRequirementCount: linked.length,
    unlinkedRegisteredCandidateCount: queue.summary.registered_candidate_count - linkedSourceIds.size,
    uncoveredRequirementCount: uncovered.length,
    missingMediaRequirementCount: uncovered.filter((requirement) => requirement.status === 'missing').length,
    blockedNonMediaWorkCount: uncovered.filter((requirement) => requirement.status === 'blocked-non-media-work').length,
  };
}

test('canonical EP001 source-review package is deterministic and fail-closed pending', async () => {
  assert.deepEqual(await validateSourceReviewPackage(), []);
  const first = await buildSourceReviewPackage();
  const second = await buildSourceReviewPackage();
  const expected = expectedCoverageFromQueue(acquisitionQueue);
  assert.deepEqual(first.manifest, second.manifest);
  assert.deepEqual(first.contactArtifacts.map((artifact) => shaBuffer(artifact.buffer)), second.contactArtifacts.map((artifact) => shaBuffer(artifact.buffer)));
  assert.equal(first.manifest.summary.registered_candidate_count, expected.registeredCandidateCount);
  assert.equal(first.manifest.summary.linked_source_id_count, expected.linkedSourceIdCount);
  assert.equal(first.manifest.summary.linked_requirement_count, expected.linkedRequirementCount);
  assert.equal(first.manifest.summary.unlinked_registered_candidate_count, expected.unlinkedRegisteredCandidateCount);
  assert.equal(first.manifest.summary.uncovered_requirement_count, expected.uncoveredRequirementCount);
  assert.equal(first.manifest.summary.missing_media_requirement_count, expected.missingMediaRequirementCount);
  assert.equal(first.manifest.summary.blocked_non_media_work_count, expected.blockedNonMediaWorkCount);
  assert.deepEqual(first.manifest.candidate_collisions, []);
  assert.equal(first.manifest.rendered_text_capture_policy.evidence_provenance_only, true);
  assert.equal(first.manifest.rendered_text_capture_policy.production_visible_allowed, false);
  assert.equal(first.manifest.rendered_text_capture_policy.motion_target_allowed, false);
  assert.equal(first.manifest.review_scope.human_approval, false);
  assert.equal(first.manifest.review_scope.materialized, false);
});

test('building the review package does not mutate source database or production state', async () => {
  const state = 'video/episodes/episode-001/production-state.json';
  const database = 'data/archive.sqlite';
  const before = {state: sha(state), database: sha(database)};
  await buildSourceReviewPackage();
  assert.deepEqual({state: sha(state), database: sha(database)}, before);
});

test('manifest validation rejects forged approvals, materialization, and dropped mappings', async () => {
  const {manifest} = await buildSourceReviewPackage();
  for (const mutate of [
    (value) => { value.review_scope.human_approval = true; },
    (value) => { value.candidates[0].rights.rights_approved = true; },
    (value) => { value.candidates[0].production_materialization.materialized = true; },
    (value) => { value.candidates.find((candidate) => candidate.requirement_bindings.length > 0).requirement_bindings.pop(); },
    (value) => { value.contact_sheets[0].candidate_ids.pop(); },
    (value) => { value.rendered_text_capture_policy.production_visible_allowed = true; },
  ]) {
    const tampered = clone(manifest);
    mutate(tampered);
    assert.notDeepEqual(validateManifestObject(tampered, manifest), []);
  }
});

test('candidate collision detector reports duplicate source, path, and bytes', () => {
  const candidates = [
    {media_asset_id: 1, source_id: 'SRC-A', local_path: 'a.png', sha256: 'a'.repeat(64)},
    {media_asset_id: 2, source_id: 'SRC-A', local_path: 'b.png', sha256: 'b'.repeat(64)},
    {media_asset_id: 3, source_id: 'SRC-C', local_path: 'a.png', sha256: 'b'.repeat(64)},
  ];
  assert.deepEqual(findCandidateCollisions(candidates).map((finding) => finding.collision_key).sort(), ['local_path', 'sha256', 'source_id']);
});

function shaBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
