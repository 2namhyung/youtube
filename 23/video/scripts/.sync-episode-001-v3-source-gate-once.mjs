import fs from 'node:fs';
import {createHash} from 'node:crypto';

const base = 'video/episodes/episode-001/';
const gatePath = `${base}reference-style-gates.json`;
const statePath = `${base}production-state.json`;
const queuePath = `${base}generated/acquisition-queue.json`;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const write = (path, object) => fs.writeFileSync(path, `${JSON.stringify(object, null, 2)}\n`);

const gate = read(gatePath);
const state = read(statePath);
const queue = read(queuePath);
const spec = read(`${base}episode-spec.json`);
if (spec.editorial_revision?.id !== 'ep001-narrative-source-first-v3'
  || state.active_cut_root !== null || gate.production_authority !== false
  || gate.source_gate?.pass !== false || queue.summary?.total_requirements < 1) {
  throw new Error('not an unapproved v3 source gate');
}
if (gate.source_gate.queue.sha256 === hash(fs.readFileSync(queuePath))
  && state.reference_style_gates.contract_sha256 === hash(fs.readFileSync(gatePath))) {
  console.log('Source gate already byte-bound; no change.');
  process.exit(0);
}
const counts = queue.summary.by_status;
gate.source_gate.queue.sha256 = hash(fs.readFileSync(queuePath));
gate.source_gate.observed_counts = {
  total_requirements: queue.summary.total_requirements,
  registered_candidates: queue.summary.registered_candidate_count,
  missing: counts.missing,
  candidate_pending_review: counts['candidate-pending-review'],
  approved_ready: counts['approved-ready'],
  materialized: counts.materialized,
  blocked_non_media_work: counts['blocked-non-media-work'],
};
gate.source_gate.pass_requires = [
  'every planned source requirement is approved or explicitly resolved not-applicable in episode-spec',
  'every production-visible input is materialized with exact local bytes, item-level rights metadata and SHA-256',
  'every real-media cut has action, object, place and viewpoint matched to its narration before source PASS',
  'every fictional Omni cut has separately reviewed continuity-locked keyframe inputs; no generated video before all cut PASS',
];
write(gatePath, gate);
state.reference_style_gates.contract_sha256 = hash(fs.readFileSync(gatePath));
state.reference_style_gates.source_queue_sha256 = gate.source_gate.queue.sha256;
write(statePath, state);
console.log(JSON.stringify({requirements: queue.summary.total_requirements, status: counts, authority: false}));
