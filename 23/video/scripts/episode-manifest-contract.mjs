import {createHash} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const sharp = createRequire(import.meta.url)('sharp');
const materialRequirementKinds = new Set(['source-original', 'transparent-derivative']);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const plannedTransition = (transition) => {
  if (!transition) return null;
  const {shared_element: _runtimeResolvedSharedElement, ...plan} = transition;
  return plan;
};
const safeRelative = (root, candidate) => {
  if (typeof candidate !== 'string' || !candidate || path.isAbsolute(candidate)) return null;
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(path.resolve(root), resolved);
  return relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) ? resolved : null;
};

export function validateManifestAgainstEpisodeContract(manifest, contract) {
  const failures = [];
  const label = contract?.shot_id ?? manifest?.shot_id ?? 'cut';
  if (manifest?.schema_version !== 3) failures.push(`${label}: active manifest must use schema_version=3`);
  if (manifest?.source_spec_sha256 !== contract?.source_spec_sha256) failures.push(`${label}: source_spec_sha256 does not match generated contract`);
  if (manifest?.source_cut_sha256 !== contract?.source_cut_sha256) failures.push(`${label}: source_cut_sha256 does not match generated contract`);
  if (manifest?.manifest_contract_sha256 !== contract?.manifest_contract_sha256) failures.push(`${label}: manifest_contract_sha256 does not match generated contract`);
  if (manifest?.implementation_status !== 'implemented') failures.push(`${label}: active manifest must declare implementation_status=implemented`);
  if (manifest?.shot_id !== contract?.shot_id || manifest?.production_mode !== contract?.production_mode || manifest?.duration_frames !== contract?.duration_frames) failures.push(`${label}: shot/mode/duration conflicts with episode spec contract`);
  if (!same(manifest?.source_ids, contract?.source_ids)) failures.push(`${label}: source_ids conflict with episode spec contract`);
  if (!same(plannedTransition(manifest?.transition), contract?.transition ?? null)) failures.push(`${label}: transition type/intent/outgoing/incoming contract conflicts with episode spec`);

  const actualComponents = new Map((manifest?.visual_components ?? []).map((component) => [component.component_id, component]));
  const expectedComponents = new Map((contract?.visual_components ?? []).map((component) => [component.component_id, component]));
  if (!same([...actualComponents.keys()].sort(), [...expectedComponents.keys()].sort())) failures.push(`${label}: visual component set conflicts with generated contract`);
  for (const [componentId, expected] of expectedComponents) {
    const actual = actualComponents.get(componentId);
    if (!actual) continue;
    for (const field of ['asset_id', 'asset_requirement_id', 'semantic_role', 'render_kind', 'compositing', 'motion_expectation', 'atomicity', 'presentation_slot']) {
      if (!same(actual[field], expected[field])) failures.push(`${label}/${componentId}: ${field} conflicts with generated contract`);
    }
    if (!same(actual.visibility_timeline, expected.visibility_timeline)) failures.push(`${label}/${componentId}: visibility timeline conflicts with generated contract`);
    if (!same(actual.document_evidence ?? null, expected.document_evidence ?? null)) failures.push(`${label}/${componentId}: document evidence phases conflict with generated contract`);
  }

  const actualBeats = new Map((manifest?.visual_beats ?? []).map((beat) => [beat.beat_id, beat]));
  const expectedBeats = new Map((contract?.visual_beats ?? []).map((beat) => [beat.beat_id, beat]));
  if (!same([...actualBeats.keys()].sort(), [...expectedBeats.keys()].sort())) failures.push(`${label}: visual beat set conflicts with generated contract`);
  for (const [beatId, expected] of expectedBeats) {
    const actual = actualBeats.get(beatId);
    if (!actual) continue;
    for (const field of ['purpose', 'message', 'start_frame', 'end_frame', 'component_ids', 'required_capabilities', 'focal_component_id', 'supporting_component_ids', 'hidden_component_ids', 'layout_template', 'narration_window', 'reading_hold', 'document_phase', 'preview_status']) {
      if (!same(actual[field] ?? null, expected[field] ?? null)) failures.push(`${label}/${beatId}: ${field} conflicts with generated contract`);
    }
  }

  const actualActions = new Map((manifest?.motion_actions ?? []).map((action) => [action.action_id, action]));
  const expectedActions = new Map((contract?.planned_motion_actions ?? []).map((action) => [action.action_id, action]));
  if (!same([...actualActions.keys()].sort(), [...expectedActions.keys()].sort())) failures.push(`${label}: motion action set conflicts with generated contract`);
  for (const [actionId, expected] of expectedActions) {
    const actual = actualActions.get(actionId);
    if (!actual) continue;
    for (const field of ['editorial_intent', 'operator_id', 'target_component_id', 'params', 'start_frame', 'end_frame']) if (!same(actual[field], expected[field])) failures.push(`${label}/${actionId}: ${field} conflicts with generated contract`);
    if (actual.implementation_status !== 'implemented') failures.push(`${label}/${actionId}: active runtime action must declare implementation_status=implemented`);
  }
  return failures;
}

function probeDecodable(file, mimeType) {
  if (mimeType.startsWith('image/')) {
    const result = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file], {encoding: 'utf8', windowsHide: true});
    try { const stream = JSON.parse(result.stdout || '{}').streams?.[0]; return result.status === 0 && Number(stream?.width) > 0 && Number(stream?.height) > 0; } catch { return false; }
  }
  if (mimeType.startsWith('video/')) {
    const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file], {encoding: 'utf8', windowsHide: true});
    try { const report = JSON.parse(result.stdout || '{}'); return result.status === 0 && Number(report.format?.duration) > 0 && report.streams?.some((stream) => stream.codec_type === 'video'); } catch { return false; }
  }
  return false;
}

export async function validateApprovedContractRequirements({root, manifestPath, manifest, contract}) {
  const failures = [];
  const cutRoot = path.dirname(manifestPath);
  for (const requirement of contract?.source_requirements ?? []) {
    const label = `${contract.shot_id}/${requirement.requirement_id}`;
    if (requirement.status !== 'approved') {
      failures.push(`${label}: requirement is blocked (${requirement.blocker ?? 'missing blocker'})`);
      continue;
    }
    if (!materialRequirementKinds.has(requirement.kind)) continue;
    if (!Number.isSafeInteger(requirement.approved_media_asset_id) || requirement.approved_media_asset_id < 1) { failures.push(`${label}: approved media_asset_id must be a positive integer`); continue; }
    const recordPath = safeRelative(root, requirement.materialization_record_path);
    if (!recordPath) { failures.push(`${label}: materialization_record_path must resolve inside the workspace`); continue; }
    let record;
    try { record = JSON.parse(await readFile(recordPath, 'utf8')); } catch { failures.push(`${label}: materialization record is missing or invalid JSON`); continue; }
    const entries = Array.isArray(record.source_asset_materializations) ? record.source_asset_materializations : Array.isArray(record) ? record : [];
    const entry = entries.find((candidate) => candidate.media_asset_id === requirement.approved_media_asset_id && candidate.source_id === requirement.source_id);
    const scoped = requirement.materialization_scope === 'statutory-document-content';
    if (!entry || (scoped ? entry.review_state !== 'scoped-approved' : entry.review_state !== 'approved')) { failures.push(`${label}: approved materialization ledger entry was not found`); continue; }
    const expected = requirement.approved_source;
    if (!expected || entry.source.original_url !== expected.original_url || entry.source.license !== expected.license || entry.source.sha256 !== expected.sha256) failures.push(`${label}: URL/license/SHA provenance differs from approved requirement`);
    if (!entry.source.attribution || !/^https?:\/\//iu.test(entry.source.original_url ?? '')) failures.push(`${label}: materialization provenance requires attribution and original URL`);
    if (scoped) {
      const auth = entry.scoped_authorization;
      const derivative = auth?.outputs?.find((output) => output.output_id === requirement.approved_derivative?.output_id);
      if (entry.route !== 'scoped-document-derivatives' || auth?.authorization_id !== requirement.scoped_authorization_id
        || auth?.parent_source_sha256 !== requirement.reviewed_parent_source_sha256 || auth?.approval_marker_sha256 !== requirement.approval_marker_sha256
        || !derivative || derivative.file !== requirement.approved_derivative?.file || derivative.sha256 !== requirement.approved_derivative?.sha256 || derivative.asset_id !== requirement.asset_id) {
        failures.push(`${label}: scoped derivative authorization/output binding differs from approved requirement`);
      }
    }
    const sourceFile = safeRelative(cutRoot, entry.source.file);
    if (!sourceFile) { failures.push(`${label}: materialized local file path is unsafe`); continue; }
    try {
      const buffer = await readFile(sourceFile);
      if (!(await stat(sourceFile)).isFile() || hash(buffer) !== entry.source.sha256 || buffer.byteLength !== entry.source.bytes) failures.push(`${label}: local materialized file SHA/bytes mismatch`);
      if (!probeDecodable(sourceFile, entry.source.mime_type)) failures.push(`${label}: local materialized file is not decodable`);
    } catch { failures.push(`${label}: local materialized file is missing`); }
    const manifestEntry = (manifest.source_asset_materializations ?? []).find((candidate) => candidate.media_asset_id === entry.media_asset_id && candidate.source_id === entry.source_id);
    if (!manifestEntry || !same(manifestEntry, entry)) failures.push(`${label}: active manifest does not contain the exact materialization ledger entry`);
    if (requirement.kind === 'transparent-derivative') {
      const derivative = (entry.derivatives ?? []).find((candidate) => candidate.asset_id === requirement.asset_id);
      const expectedDerivative = requirement.approved_derivative;
      if (entry.route !== 'transparent-layers' || !derivative) { failures.push(`${label}: transparent derivative requires its exact ledger derivative entry`); continue; }
      if (!expectedDerivative || !same({
        asset_id: derivative.asset_id, file: derivative.file, sha256: derivative.sha256,
        alpha: derivative.alpha, derivation_input: derivative.derivation_input,
      }, expectedDerivative)) failures.push(`${label}: derivative path/hash/alpha/provenance differs from approved requirement`);
      const derivativeFile = safeRelative(cutRoot, derivative.file);
      if (!derivativeFile) { failures.push(`${label}: derivative path is unsafe`); continue; }
      try {
        const bytes = await readFile(derivativeFile);
        if (hash(bytes) !== derivative.sha256) failures.push(`${label}: derivative local SHA mismatch`);
        const {data, info} = await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject: true});
        let transparent = 0, visible = 0;
        for (let offset = 3; offset < data.length; offset += info.channels) data[offset] === 0 ? transparent++ : visible++;
        if (transparent <= 0 || visible <= 0 || transparent !== derivative.alpha?.transparent_pixels || visible !== derivative.alpha?.visible_pixels) failures.push(`${label}: derivative alpha/decode metadata mismatch`);
      } catch { failures.push(`${label}: derivative file missing or undecodable`); }
      const input = derivative.derivation_input;
      const inputFile = safeRelative(cutRoot, input?.file);
      try {
        if (!inputFile || hash(await readFile(inputFile)) !== input.sha256 || !input.method || !input.note) failures.push(`${label}: derivative provenance input is missing or mismatched`);
      } catch { failures.push(`${label}: derivative provenance input is missing or mismatched`); }
      const asset = (manifest.assets ?? []).find((candidate) => candidate.asset_id === derivative.asset_id);
      if (!asset || asset.file !== derivative.file || asset.sha256 !== derivative.sha256 || asset.source_id !== entry.source_id) failures.push(`${label}: derivative is not bound to the exact manifest asset`);
    } else if (requirement.kind === 'source-original') {
      const asset = (manifest.assets ?? []).find((candidate) => candidate.asset_id === requirement.asset_id);
      if (!requirement.asset_id || !asset || asset.file !== entry.source.file || asset.sha256 !== entry.source.sha256 || asset.source_id !== entry.source_id) failures.push(`${label}: source original is not bound to its exact requirement asset identity`);
      if (scoped && asset?.source_crop_applied !== true) failures.push(`${label}: scoped normalized crop asset must declare source_crop_applied`);
    }
  }
  return failures;
}
