import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

import {validateCanonicalReferenceTransferGate} from './reference-transfer-gate-contract.mjs';

const ROOT = process.cwd();
const FILES = {
  gate: 'video/episodes/episode-001/reference-style-gates.json',
  state: 'video/episodes/episode-001/production-state.json',
  blueprint: 'video/episodes/episode-001/generated/reference-cut-blueprint.json',
  queue: 'video/episodes/episode-001/generated/acquisition-queue.json',
  spec: 'video/episodes/episode-001/episode-spec.json',
  officialRegistry: 'video/source-intake/episode-001/official/intake-registry.json',
  newsRegistry: 'video/source-intake/episode-001/news/intake-registry.json',
  approvalMarker: 'video/qa/reference-study/motion-reverse-engineering-review-v02/reference-calibration-approval-v02.json',
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const parse = (bytes) => JSON.parse(bytes.toString('utf8'));
const clone = (value) => structuredClone(value);
const must = (condition, message) => { if (!condition) throw new Error(message); };

export function deriveBlockedSourceGateSnapshot({queue, queueBytes, specBytes, officialRegistryBytes, newsRegistryBytes}) {
  must(queue?.schema_version === 1 && queue?.status === 'candidate-registration-only', 'acquisition queue identity/status mismatch');
  must(queue?._generated?.spec_sha256 === sha256(specBytes), 'acquisition queue is not bound to the current episode spec');
  must(isDeepStrictEqual(queue?._generated?.registry_sha256, {
    official: sha256(officialRegistryBytes),
    news: sha256(newsRegistryBytes),
  }), 'acquisition queue is not bound to the current registries');
  const byStatus = queue?.summary?.by_status ?? {};
  const observedCounts = {
    total_requirements: queue?.summary?.total_requirements,
    registered_candidates: queue?.summary?.registered_candidate_count,
    missing: byStatus.missing,
    candidate_pending_review: byStatus['candidate-pending-review'],
    approved_ready: byStatus['approved-ready'],
    materialized: byStatus.materialized,
    blocked_non_media_work: byStatus['blocked-non-media-work'],
  };
  must(Object.values(observedCounts).every(Number.isInteger), 'acquisition queue source-gate counts must be integers');
  const sourceReady = observedCounts.missing === 0 && observedCounts.candidate_pending_review === 0 && observedCounts.approved_ready === 0 && observedCounts.materialized > 0 && observedCounts.blocked_non_media_work === 0;
  must(sourceReady === false, 'source-ready transition requires the explicit approval/materialization workflow; this metadata refresh cannot promote it');
  return {queue: {path: FILES.queue, sha256: sha256(queueBytes)}, observed_counts: observedCounts, pass: false};
}

export async function refreshReferenceTransferSourceGate({root = ROOT} = {}) {
  const absolute = Object.fromEntries(Object.entries(FILES).map(([key, relative]) => [key, path.resolve(root, relative)]));
  const originals = Object.fromEntries(await Promise.all(['gate', 'state', 'blueprint'].map(async (key) => [key, await readFile(absolute[key])])));
  const [queueBytes, specBytes, officialRegistryBytes, newsRegistryBytes, markerBefore] = await Promise.all([
    readFile(absolute.queue), readFile(absolute.spec), readFile(absolute.officialRegistry), readFile(absolute.newsRegistry), readFile(absolute.approvalMarker),
  ]);
  const gate = parse(originals.gate);
  const state = parse(originals.state);
  must(gate?.schema_version === 4 && gate?.contract_id === 'episode-001-reference-transfer-gates-v1', 'only the canonical schema-v4 reference transfer gate can be refreshed');
  must(gate?.production_authority === false && state?.stage === 'timing-draft' && state?.active_cut_root === null, 'metadata refresh requires the non-promoting timing-draft state');
  must(gate?.reference_calibration?.status === 'reference-calibration-passed' && gate?.reference_calibration?.approval_marker === FILES.approvalMarker, 'reference calibration marker binding is not the expected immutable approved chain');
  must(gate?.source_gate?.pass === false && gate?.grammar_allowlist?.current_selections?.length === 0, 'metadata refresh cannot carry source approval or grammar selections');

  const acquisitionValidation = spawnSync(process.execPath, ['--experimental-strip-types', 'video/scripts/validate-episode-acquisition.mjs'], {cwd: root, encoding: 'utf8', windowsHide: true});
  must(acquisitionValidation.status === 0, `canonical acquisition validation failed before source-gate refresh:\n${acquisitionValidation.stderr || acquisitionValidation.stdout}`);
  const snapshot = deriveBlockedSourceGateSnapshot({queue: parse(queueBytes), queueBytes, specBytes, officialRegistryBytes, newsRegistryBytes});
  const nextGate = clone(gate);
  nextGate.source_gate.queue = snapshot.queue;
  nextGate.source_gate.observed_counts = snapshot.observed_counts;
  nextGate.source_gate.pass = snapshot.pass;
  const nextGateBytes = Buffer.from(`${JSON.stringify(nextGate, null, 2)}\n`);

  try {
    await writeFile(absolute.gate, nextGateBytes);
    const blueprintBuild = spawnSync(process.execPath, ['video/scripts/build-episode-001-reference-blueprint.mjs'], {cwd: root, encoding: 'utf8', windowsHide: true});
    must(blueprintBuild.status === 0, `reference blueprint regeneration failed:\n${blueprintBuild.stderr || blueprintBuild.stdout}`);
    const blueprintBytes = await readFile(absolute.blueprint);
    const blueprint = parse(blueprintBytes);
    must(blueprint?._generated?.source_reference_transfer_gates_sha256 === sha256(nextGateBytes), 'regenerated blueprint did not bind the refreshed gate');
    must(blueprint?.source_gate?.queue?.sha256 === snapshot.queue.sha256, 'regenerated blueprint did not bind the refreshed acquisition queue');

    const nextState = clone(state);
    nextState.reference_style_gates.contract_sha256 = sha256(nextGateBytes);
    nextState.reference_style_gates.source_queue_sha256 = snapshot.queue.sha256;
    nextState.reference_style_gates.cut_blueprint_sha256 = sha256(blueprintBytes);
    await writeFile(absolute.state, `${JSON.stringify(nextState, null, 2)}\n`);

    must(sha256(await readFile(absolute.approvalMarker)) === sha256(markerBefore), 'reference calibration approval marker changed during downstream refresh');
    const validation = await validateCanonicalReferenceTransferGate({root});
    must(validation.ok, `refreshed reference transfer gate failed validation:\n- ${validation.failures.join('\n- ')}`);
    return {
      queue_sha256: snapshot.queue.sha256,
      gate_sha256: sha256(nextGateBytes),
      blueprint_sha256: sha256(blueprintBytes),
      approval_marker_sha256: sha256(markerBefore),
      source_gate_pass: false,
      production_authority: false,
    };
  } catch (error) {
    await Promise.all(['gate', 'state', 'blueprint'].map((key) => writeFile(absolute[key], originals[key])));
    throw error;
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const result = await refreshReferenceTransferSourceGate();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
