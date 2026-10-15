import {createRequire} from 'node:module';
import {readFile, readdir, stat} from 'node:fs/promises';
import path from 'node:path';

import {validateManifestAgainstEpisodeContract} from './episode-manifest-contract.mjs';
import {buildAuthorityCatalog, loadAuthorityState, normalize, renderCatalogTypeScript, ROOT, sha256Bytes, sha256File} from './render-authority-lib.mjs';
import {runtimeSha256} from './visual-contract-v2.mjs';
import {historicalLedgerDecision} from './historical-ledger-isolation.mjs';
import {sharedElementTrajectory, validateSharedElementTransition} from './shared-element-contract.mjs';

const sharp = createRequire(import.meta.url)('sharp');
const allowMissingReview = process.argv.includes('--allow-missing-review');
const failures = [];
const fail = (message) => failures.push(message);
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const cliValue = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const routeSpecPath = path.resolve(ROOT, cliValue('--spec', 'video/episodes/episode-001/episode-spec.json'));
const routeStatePath = path.resolve(ROOT, cliValue('--state', 'video/episodes/episode-001/production-state.json'));
const safeFile = (relative) => {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) return null;
  const resolved = path.resolve(ROOT, relative);
  const relation = path.relative(ROOT, resolved);
  return relation && !relation.startsWith('..') && !path.isAbsolute(relation) ? resolved : null;
};
const pixelSha = async (file) => {
  const {data, info} = await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  return {sha256: sha256Bytes(data), width: info.width, height: info.height, channels: info.channels};
};

async function auditBlockedSourceFirstDraft() {
  const specPath = path.resolve(ROOT, cliValue('--spec', 'video/episodes/episode-001/episode-spec.json'));
  const statePath = path.resolve(ROOT, cliValue('--state', 'video/episodes/episode-001/production-state.json'));
  const catalogPath = path.resolve(ROOT, cliValue('--catalog', 'video/episodes/episode-001/generated/render-catalog.json'));
  const generatedTsPath = path.resolve(ROOT, cliValue('--generated-ts', 'video/src/generated/render-authority-catalog.ts'));
  const registryPath = path.resolve(ROOT, cliValue('--registry', 'video/src/production-index.tsx'));
  const localFailures = [];
  const add = (message) => localFailures.push(message);
  let spec; let state; let catalog; let specHash = null;
  try {
    const bytes = await readFile(specPath);
    specHash = sha256Bytes(bytes);
    spec = JSON.parse(bytes.toString('utf8'));
  } catch (error) { add(`episode spec missing or invalid: ${error.message}`); }
  try { state = await readJson(statePath); } catch (error) { add(`production state missing or invalid: ${error.message}`); }
  try { catalog = await readJson(catalogPath); } catch (error) { add(`generated render catalog missing or invalid: ${error.message}`); }

  const plannedCutCount = Array.isArray(spec?.cuts) ? spec.cuts.length : 0;
  if (!['ep001-source-first-semantic-v2', 'ep001-narrative-source-first-v3'].includes(spec?.editorial_revision?.id)
    || spec?.editorial_revision?.status !== 'candidate-plan-blocked'
    || spec?.editorial_revision?.production_authority !== false) add('source-first render audit requires the known blocked ep001-source-first-semantic-v2 revision');
  if (spec?.production_routing_policy?.version !== 1 || spec?.production_routing_policy?.human_quality_approval !== false) add('source-first routing policy must remain version 1 and unapproved');
  if (plannedCutCount === 0 || spec?.editorial_revision?.cut_count !== plannedCutCount) add('episode spec cut count must match its declared revision');
  if (state?.episode_id !== 'episode-001' || state?.stage !== 'timing-draft') add('inactive source-first render state must remain episode-001 timing-draft');
  if (state?.expected_cut_count !== plannedCutCount) add(`production state expected_cut_count must match the ${plannedCutCount} episode-spec cuts`);
  if (state?.active_cut_root !== null) add('inactive source-first render state requires active_cut_root=null');
  if (state?.production_authority === true) add('inactive source-first render state cannot claim production authority');

  const authority = state?.render_authority ?? {};
  if (authority.status !== 'blocked-superseded-by-editorial-revision' || authority.cut_root !== null || authority.catalog !== null
    || authority.catalog_sha256 !== null || authority.manifest_set_sha256 !== null || authority.production_authority !== false) {
    add('render_authority must remain blocked with null root/catalog/hash bindings and production_authority=false');
  }
  const review = state?.cut_review ?? {};
  if (review.all_cuts_passed !== false || review.approval_marker !== null || review.approved_inputs_sha256 !== null) add('source-first render state cannot claim cut PASS or an approval hash');
  const omni = state?.omni_video_generation ?? {};
  if (omni.status !== 'blocked_until_all_cuts_passed' || omni.allowed_after_marker !== null) add('Omni video generation must remain blocked without an approval marker');
  const calibration = state?.style_calibration ?? {};
  if (calibration.status !== 'blocked-superseded-by-editorial-revision' || calibration.authority !== null || calibration.candidate_root !== null
    || calibration.user_approved !== false || calibration.approval_marker !== null) add('source-first render state cannot retain an active or approved style candidate');

  if (catalog?.status !== 'blocked-source-search-no-render-authority' || catalog?.production_authority !== false) add('render catalog must report blocked-source-search-no-render-authority with production_authority=false');
  if (!Array.isArray(catalog?.cuts) || catalog.cuts.length !== 0 || !Array.isArray(catalog?.compositions) || catalog.compositions.length !== 0) add('blocked source-search render catalog must have empty cuts and compositions');
  if (catalog?.authority_root !== null) add('blocked source-search render catalog must have authority_root=null');
  const currentSpecBindings = [catalog?.source_spec_sha256, catalog?._generated?.source_spec_sha256, catalog?._generated?.source_sha256];
  if (!specHash || !currentSpecBindings.includes(specHash)) add('blocked render catalog must bind the exact current episode-spec SHA-256');
  if (catalog?._generated?.do_not_edit !== true) add('blocked render catalog must retain its generated do_not_edit marker');

  try {
    const [generatedTs, registry] = await Promise.all([readFile(generatedTsPath, 'utf8'), readFile(registryPath, 'utf8')]);
    if (catalog && generatedTs !== renderCatalogTypeScript(catalog)) add('generated render-authority TypeScript is stale or not bound to the empty blocked catalog');
    if (!registry.includes('./generated/render-authority-catalog') || !registry.includes('renderAuthorityCatalog.compositions.map')) add('production index must consume the current generated composition list');
    if (/<Composition\s+id="/u.test(registry)) add('production index cannot register a direct composition outside the generated catalog');
  } catch (error) { add(`generated render route is unreadable: ${error.message}`); }

  return {
    ok: localFailures.length === 0,
    status: 'blocked/non-production',
    production_authority: false,
    rendered: false,
    episode_id: state?.episode_id ?? null,
    revision_id: spec?.editorial_revision?.id ?? null,
    cut_count: plannedCutCount,
    active_cut_root: state?.active_cut_root ?? null,
    render_root: authority.cut_root ?? null,
    catalog: authority.catalog ?? null,
    generated_catalog_status: catalog?.status ?? null,
    failures: localFailures,
  };
}

let routeAuditSpec = null;
let routeAuditState = null;
try { routeAuditSpec = await readJson(routeSpecPath); } catch { /* legacy path reports its own state/catalog failures */ }
try { routeAuditState = await readJson(routeStatePath); } catch { /* legacy path reports its own state/catalog failures */ }
const sourceLedRevision = ['ep001-source-first-semantic-v2', 'ep001-narrative-source-first-v3'].includes(routeAuditSpec?.editorial_revision?.id)
  && routeAuditSpec?.production_routing_policy?.version === 1;
const sourceLedInactiveDraft = sourceLedRevision
  && routeAuditSpec?.editorial_revision?.status === 'candidate-plan-blocked'
  && routeAuditState?.stage === 'timing-draft' && routeAuditState?.active_cut_root === null
  && routeAuditState?.render_authority?.status === 'blocked-superseded-by-editorial-revision'
  && routeAuditState?.render_authority?.cut_root === null && routeAuditState?.render_authority?.catalog === null
  && routeAuditState?.render_authority?.catalog_sha256 === null && routeAuditState?.render_authority?.production_authority === false
  && routeAuditState?.cut_review?.all_cuts_passed === false && routeAuditState?.cut_review?.approval_marker === null
  && routeAuditState?.omni_video_generation?.status === 'blocked_until_all_cuts_passed';
const unsupportedRoutedRevision = routeAuditSpec?.production_routing_policy && !sourceLedRevision;
if (sourceLedInactiveDraft) {
  const report = await auditBlockedSourceFirstDraft();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
  process.exit(0);
}
if (unsupportedRoutedRevision) fail('production routing policy is not attached to a recognized editorial revision');
const sourceLedActiveRoute = sourceLedRevision;

let built;
let state;
let authority;
try {
  ({state, authority} = await loadAuthorityState());
  if (sourceLedActiveRoute && process.argv.includes('--state')) {
    state = routeAuditState;
    authority = state?.render_authority;
  }
  built = await buildAuthorityCatalog();
} catch (error) {
  fail(error.message);
}

if (state && built) {
  if (sourceLedActiveRoute) {
    const specCutIds = (routeAuditSpec?.cuts ?? []).map((cut) => cut.shot_id);
    const knownStages = ['timing-draft', 'cut-previews-ready', 'cut-review-approved', 'provisional-video-ready', 'visual-review-approved', 'script-locked', 'final-voice-locked', 'audio-timed-assembly', 'picture-locked'];
    if (routeAuditSpec?.editorial_revision?.status !== 'source-selected-editorial-plan'
      || !['approved-script-source-first-semantic-plan', 'approved-script-narrative-source-first-plan'].includes(routeAuditSpec?.status)) fail('active source-first route requires the source-selected editorial plan revision');
    if (!knownStages.includes(state.stage) || state.stage === 'timing-draft') fail('active source-first render route requires a production stage beyond timing-draft');
    if (state.expected_cut_count !== specCutIds.length) fail(`active source-first expected_cut_count must equal the ${specCutIds.length} episode-spec cuts`);
    if (typeof state.active_cut_root !== 'string' || state.active_cut_root.trim() === '' || normalize(state.active_cut_root) !== normalize(authority?.cut_root ?? '')) fail('active source-first cut root must match render_authority.cut_root');
    if (authority?.status === 'blocked-superseded-by-editorial-revision' || authority?.production_authority === true && state.cut_review?.all_cuts_passed !== true) fail('source-first render authority cannot remain blocked or promote without explicit cut PASS');
    if (built.cuts.length !== specCutIds.length || JSON.stringify(built.cuts.map((cut) => cut.shot_id)) !== JSON.stringify(specCutIds)) fail('active source-first catalog must contain the exact episode-spec cuts in order');
    if (state.production_authority === true && (!state.cut_review?.all_cuts_passed || !state.cut_review?.approval_marker)) fail('source-first production authority requires the explicit episode cut-review marker');
  } else {
    if (state.stage !== 'timing-draft') fail(`production stage must remain timing-draft; found ${state.stage}`);
    if (state.active_cut_root !== null) fail('active_cut_root must remain null for this partial authority root');
    const specForCount = routeAuditSpec ?? {};
    const expectedCount = Array.isArray(specForCount.cuts) ? specForCount.cuts.length : 0;
    if (state.expected_cut_count !== expectedCount) fail(`expected_cut_count must match the ${expectedCount} episode-spec cuts`);
    if (authority.status !== 'timing-draft-partial') fail('render_authority.status must be timing-draft-partial');
    if ((state.cut_review?.all_cuts_passed ?? false) !== false || state.omni_video_generation?.status !== 'blocked_until_all_cuts_passed' || state.omni_video_generation?.allowed_after_marker !== null) fail('partial render authority cannot unlock cut PASS or Omni generation');
    const calibration = state.style_calibration ?? {};
    if (calibration.authority !== 'render_authority' || calibration.candidate_root !== authority.cut_root) fail('style_calibration must point to render_authority.cut_root');
    if (JSON.stringify([...(calibration.playable_shot_ids ?? [])].sort()) !== JSON.stringify([...built.cuts.map((cut) => cut.shot_id)].sort())) fail('style_calibration playable shots differ from render authority catalog');
  }

  const catalogPath = safeFile(authority.catalog);
  const tsPath = path.resolve(ROOT, 'video/src/generated/render-authority-catalog.ts');
  if (!catalogPath) fail('render_authority.catalog is unsafe');
  else {
    try {
      const bytes = await readFile(catalogPath);
      const actual = JSON.parse(bytes.toString('utf8'));
      const catalogText = bytes.toString('utf8');
      const generatedBinding = await readFile(tsPath, 'utf8');
      if (JSON.stringify(actual) !== JSON.stringify(built)) fail('generated render catalog is stale');
      if (sha256Bytes(bytes) !== authority.catalog_sha256) fail('production-state catalog_sha256 is stale');
      if (built.manifest_set_sha256 !== authority.manifest_set_sha256) fail('production-state manifest_set_sha256 is stale');
      if (built.asset_sheet_set_sha256 !== authority.asset_sheet_set_sha256 || built.treatment_contract_set_sha256 !== authority.treatment_contract_set_sha256 || built.render_input_set_sha256 !== authority.render_input_set_sha256) fail('production-state asset-sheet/treatment/render-input hashes are stale');
      if (authority.asset_sheet_schema?.path !== built.asset_sheet_schema.path || authority.asset_sheet_schema?.sha256 !== built.asset_sheet_schema.sha256) fail('production-state asset-sheet schema binding is stale');
      if (built.scene_runtime_sha256 !== authority.scene_runtime_sha256 || built.transition_runtime_sha256 !== authority.transition_runtime_sha256) fail('production-state runtime hashes are stale');
      if (generatedBinding !== renderCatalogTypeScript(built)) fail('generated TypeScript catalog binding is stale');
      if (actual.schema_version !== 2 || actual.asset_sheet_set_sha256 !== built.asset_sheet_set_sha256 || actual.treatment_contract_set_sha256 !== built.treatment_contract_set_sha256 || actual.render_input_set_sha256 !== built.render_input_set_sha256) fail('generated render catalog lacks current spatial/treatment bindings');
      for (const cut of built.cuts) if (!cut.asset_sheet_path || !cut.asset_sheet_sha256 || cut.asset_sheet.shot_id !== cut.shot_id) fail(`${cut.shot_id}: generated catalog lacks a valid asset sheet binding`);
      for (const forbidden of ['video/src/vox/scene/TransitionPair.tsx', 'episode-001-sh004-two-route-v01', 'pair_artifact', 'pair_renderer']) {
        if (catalogText.includes(forbidden) || generatedBinding.includes(forbidden)) fail(`current catalog contains historical/alternative renderer metadata: ${forbidden}`);
      }
    } catch (error) { fail(`render catalog missing or invalid: ${error.message}`); }
  }

  try {
    const contracts = await readJson(path.resolve(ROOT, 'video/episodes/episode-001/generated/manifest-contracts.json'));
    const approvedRuntimeSha = await runtimeSha256(ROOT);
    for (const cut of built.cuts) {
      const contract = contracts.cuts.find((candidate) => candidate.shot_id === cut.shot_id);
      if (!contract) fail(`${cut.shot_id}: generated episode contract missing`);
      else for (const message of validateManifestAgainstEpisodeContract(cut.manifest, contract)) fail(message);
      if (cut.manifest.runtime_contract?.operator_registry !== 'video/src/vox/motion/operator-registry.ts' || cut.manifest.runtime_contract?.scene_renderer !== 'video/src/vox/scene/ManifestScene.tsx' || cut.manifest.runtime_contract?.runtime_sha256 !== approvedRuntimeSha) fail(`${cut.shot_id}: runtime contract is not bound to the current scene and transition approval runtime`);
    }
    for (const boundary of built.boundaries) {
      const outgoing = built.cuts.find((cut) => cut.shot_id === boundary.outgoing_shot_id);
      const incoming = built.cuts.find((cut) => cut.shot_id === boundary.incoming_shot_id);
      for (const message of validateSharedElementTransition({boundaryId: boundary.boundary_id, transition: boundary.transition, outgoingManifest: outgoing?.manifest, incomingManifest: incoming?.manifest})) fail(message);
    }
  } catch (error) { fail(`generated manifest contracts unavailable: ${error.message}`); }
  if (!sourceLedActiveRoute && (authority.spatial_candidate_status !== 'pending-user-review' || authority.previous_visual_direction_status !== 'not-production-pass-superseded-by-asset-sheet-runtime')) fail('spatial candidate metadata must remain pending and must not claim prior production PASS');
}

const registryPath = path.resolve(ROOT, 'video/src/production-index.tsx');
const pairPath = path.resolve(ROOT, 'video/src/vox/scene/TransitionPair.tsx');
try {
  const registry = await readFile(registryPath, 'utf8');
  if (!registry.includes("./generated/render-authority-catalog")) fail('Studio registry must import the generated authority catalog');
  if (/manifest\.json|SH\d{3}|AssemblySet-|style-calibration\/episode/iu.test(registry)) fail('Studio registry contains a manual/historical shot authority');
  if (/durationInFrames=\{\d+\}|fps=\{\d+\}|durationInFrames:\s*\d+|fps:\s*\d+/u.test(registry)) fail('Studio registry contains hardcoded fps/duration');
  if (/sh004-two-route/iu.test(registry)) fail('historical compatibility wrapper is reachable from current Studio');
} catch (error) { fail(`Studio registry unreadable: ${error.message}`); }
try {
  const pair = await readFile(pairPath, 'utf8');
  const forbidden = [/["'`]SH\d{3}/u, /staticFile/u, /<Img\b/u, /<svg\b/iu, /<path\b/iu, /episode-001/iu, /assets\//iu, /viewer/iu];
  for (const token of forbidden) if (token.test(pair)) fail(`TransitionPair contains forbidden episode/cut visual token: ${token}`);
  for (const required of ['<ManifestScene', 'transition.duration_frames', 'resolveSharedElementBinding', 'excludeComponentIds', 'PresentationComponentMedia', 'resolveSharedElementFrameState']) if (!pair.includes(required)) fail(`TransitionPair does not consume shared-element runtime contract: ${required}`);
} catch (error) { fail(`TransitionPair unreadable: ${error.message}`); }
try {
  const registry = await readFile(path.resolve(ROOT, 'video/src/vox/motion/operator-registry.ts'), 'utf8');
  if (!registry.includes("'scene.shared-element@1': ['shared-element-continuity']") || !registry.includes('resolveSharedElementFrameState')) fail('shared-element operator is not registered with an observable runtime implementation');
  if (!registry.includes("'grain.overlay@1': ['surface-treatment']") || !registry.includes('grainOverlayDataUri') || !registry.includes('maximumOpacity: 0.045')) fail('grain treatment operator lacks a bounded deterministic runtime implementation');
} catch (error) { fail(`operator registry unreadable: ${error.message}`); }
try {
  const presentation = await readFile(path.resolve(ROOT, 'video/src/vox/scene/PresentationScene.tsx'), 'utf8');
  if (!presentation.includes('componentDepth(assetSheet') || !presentation.includes("systemDepth(assetSheet, 'target-labels'") || /zIndex:\s*focal\s*\?/u.test(presentation)) fail('PresentationScene must consume spatial depth while focal state remains non-spatial emphasis');
  const timeline = await readFile(path.resolve(ROOT, 'video/src/vox/scene/EpisodeTimeline.tsx'), 'utf8');
  if (!timeline.includes('assetSheet={cut.assetSheet}') || !timeline.includes('outgoingAssetSheet={outgoing.assetSheet}')) fail('EpisodeTimeline does not forward catalog-bound asset sheets');
  const pair = await readFile(pairPath, 'utf8');
  if (!pair.includes('componentDepth(outgoingAssetSheet') || !pair.includes('componentDepth(incomingAssetSheet')) fail('shared-element overlay does not preserve endpoint depth semantics');
} catch (error) { fail(`asset-sheet runtime consumption unreadable: ${error.message}`); }

const ledgerPath = path.resolve(ROOT, 'video/qa/episode-001-work-v01/review-ledger.json');
if (sourceLedActiveRoute) {
  // Source-first candidates are checked against their own spec-derived cut set above;
  // the historical 4-cut treatment ledger is not an active-route gate.
} else if (!allowMissingReview) try {
  const ledger = await readJson(ledgerPath);
  if (!built || !authority) throw new Error('catalog could not be built');
  const expectedBindings = {
    catalog_sha256: authority.catalog_sha256,
    manifest_set_sha256: built.manifest_set_sha256,
    scene_runtime_sha256: built.scene_runtime_sha256,
    transition_runtime_sha256: built.transition_runtime_sha256,
    asset_sheet_schema_path: built.asset_sheet_schema.path,
    asset_sheet_schema_sha256: built.asset_sheet_schema.sha256,
    asset_sheet_set_sha256: built.asset_sheet_set_sha256,
    treatment_contract_set_sha256: built.treatment_contract_set_sha256,
    render_input_set_sha256: built.render_input_set_sha256,
  };
  for (const [key, value] of Object.entries(expectedBindings)) if (ledger.bindings?.[key] !== value) fail(`review ledger stale binding: ${key}`);
  for (const cut of built.cuts) {
    const record = ledger.cuts?.find((candidate) => candidate.shot_id === cut.shot_id);
    if (!record || record.asset_sheet_path !== cut.asset_sheet_path || record.asset_sheet_sha256 !== cut.asset_sheet_sha256) fail(`${cut.shot_id}: review ledger asset-sheet binding is stale`);
  }
  for (const boundary of built.boundaries) {
    const record = ledger.boundaries?.find((candidate) => candidate.boundary_id === boundary.boundary_id);
    if (!record || record.transition_contract_sha256 !== boundary.transition_contract_sha256 || record.outgoing_manifest_sha256 !== built.cuts.find((cut) => cut.shot_id === boundary.outgoing_shot_id)?.manifest_sha256 || record.incoming_manifest_sha256 !== built.cuts.find((cut) => cut.shot_id === boundary.incoming_shot_id)?.manifest_sha256) fail(`${boundary.boundary_id}: pair ledger inputs are stale`);
  }
  const expectedCompositions = new Set(built.compositions.map((composition) => composition.composition_id));
  for (const artifact of ledger.artifacts ?? []) {
    const file = safeFile(artifact.path);
    if (!file) { fail(`unsafe review artifact path: ${artifact.path}`); continue; }
    try {
      if (!(await stat(file)).isFile() || await sha256File(file) !== artifact.sha256) fail(`review artifact hash mismatch: ${artifact.path}`);
    } catch { fail(`review artifact missing: ${artifact.path}`); }
    if (artifact.kind === 'composition-video') expectedCompositions.delete(artifact.composition_id);
    if (artifact.catalog_sha256 !== authority.catalog_sha256 || artifact.scene_runtime_sha256 !== built.scene_runtime_sha256 || artifact.manifest_set_sha256 !== built.manifest_set_sha256 || artifact.asset_sheet_set_sha256 !== built.asset_sheet_set_sha256 || artifact.treatment_contract_set_sha256 !== built.treatment_contract_set_sha256 || artifact.render_input_set_sha256 !== built.render_input_set_sha256) fail(`review artifact is not bound to current catalog/runtime/assets/spatial/treatment contract: ${artifact.path}`);
  }
  if (expectedCompositions.size) fail(`composition review artifacts missing: ${[...expectedCompositions].join(', ')}`);
  const expectedIdentityScopes = new Set([
    ...built.cuts.map((cut) => `${cut.shot_id}-cut-window`),
    ...built.boundaries.map((boundary) => `${boundary.outgoing_shot_id}-${boundary.incoming_shot_id}-boundary-window`),
  ]);
  const actualIdentityScopes = new Set((ledger.identity_samples ?? []).map((sample) => sample.scope));
  if (expectedIdentityScopes.size !== actualIdentityScopes.size || [...expectedIdentityScopes].some((scope) => !actualIdentityScopes.has(scope))) fail('identity ledger must cover every catalog-derived cut and boundary window exactly once');
  for (const sample of ledger.identity_samples ?? []) {
    const timeline = safeFile(sample.timeline.path);
    const derived = safeFile(sample.derived.path);
    if (!timeline || !derived) { fail(`unsafe identity sample path: ${sample.scope}`); continue; }
    try {
      const [timelineFileSha, derivedFileSha, timelinePixel, derivedPixel] = await Promise.all([sha256File(timeline), sha256File(derived), pixelSha(timeline), pixelSha(derived)]);
      if (timelineFileSha !== sample.timeline.file_sha256 || derivedFileSha !== sample.derived.file_sha256 || timelinePixel.sha256 !== sample.timeline.pixel_sha256 || derivedPixel.sha256 !== sample.derived.pixel_sha256) fail(`identity sample ledger is stale: ${sample.scope}`);
      if (timelinePixel.sha256 !== derivedPixel.sha256 || timelinePixel.width !== derivedPixel.width || timelinePixel.height !== derivedPixel.height) fail(`timeline/window pixel identity mismatch: ${sample.scope}`);
    } catch (error) { fail(`identity sample unavailable ${sample.scope}: ${error.message}`); }
  }
  if (!String(ledger.candidate_note ?? '').includes('not production PASS') || ledger.historical_pixel_comparison?.some((sample) => sample.status !== 'superseded-by-asset-sheet-runtime-new-candidate-pending')) fail('new spatial candidate must explicitly supersede pixel identity without claiming production PASS');
  const depthQc = ledger.depth_occlusion_qa;
  if (depthQc?.status !== 'machine-generated-provisional-qc-not-user-pass' || depthQc.asset_sheet_set_sha256 !== built.asset_sheet_set_sha256 || depthQc.samples?.length !== built.cuts.length) fail('depth/occlusion QA ledger is missing or stale');
  else {
    for (const cut of built.cuts) {
      const sample = depthQc.samples.find((candidate) => candidate.shot_id === cut.shot_id);
      const depthFile = sample ? safeFile(sample.depth_map_path) : null;
      const mobileFile = sample ? safeFile(sample.mobile_path) : null;
      const cutContactFile = sample ? safeFile(sample.cut_contact_path) : null;
      try {
        const depthPixels = depthFile ? await pixelSha(depthFile) : null;
        const mobilePixels = mobileFile ? await pixelSha(mobileFile) : null;
        const contactPixels = cutContactFile ? await pixelSha(cutContactFile) : null;
        if (!sample || sample.asset_sheet_sha256 !== cut.asset_sheet_sha256 || !depthFile || await sha256File(depthFile) !== sample.depth_map_sha256 || depthPixels.width !== 1920 || depthPixels.height !== 1080 || !mobileFile || await sha256File(mobileFile) !== sample.mobile_sha256 || mobilePixels.width !== 360 || mobilePixels.height !== 203 || !cutContactFile || await sha256File(cutContactFile) !== sample.cut_contact_sha256 || contactPixels.width !== 1920 || contactPixels.height !== 1080 || !Array.isArray(sample.cut_contact_frames) || sample.cut_contact_frames.length < 3) fail(`${cut.shot_id}: depth/mobile/contact QA evidence is stale or malformed`);
      } catch (error) { fail(`${cut.shot_id}: depth/mobile QA unavailable: ${error.message}`); }
    }
    const depthContact = safeFile(depthQc.contact_path);
    try {
      const pixels = depthContact ? await pixelSha(depthContact) : null;
      if (!depthContact || await sha256File(depthContact) !== depthQc.contact_sha256 || pixels.width !== 1920 || pixels.height !== 1080) fail('combined depth/occlusion contact is stale or malformed');
    } catch (error) { fail(`combined depth/occlusion contact unavailable: ${error.message}`); }
  }
  const sharedBoundaries = built.boundaries.filter((boundary) => boundary.transition.operator_id === 'scene.shared-element@1');
  const trajectoryLedgers = ledger.shared_element_trajectories ?? (ledger.shared_element_trajectory ? [ledger.shared_element_trajectory] : []);
  if (trajectoryLedgers.length !== sharedBoundaries.length) fail('shared-element trajectory ledger must cover every shared boundary exactly once');
  for (const sharedBoundary of sharedBoundaries) {
    const trajectoryLedger = trajectoryLedgers.find((candidate) => candidate.boundary_id === sharedBoundary.boundary_id);
    if (!trajectoryLedger) { fail(`shared-element trajectory ledger is missing: ${sharedBoundary.boundary_id}`); continue; }
    const trajectoryFile = safeFile(trajectoryLedger.json_path);
    const contactFile = safeFile(trajectoryLedger.contact_path);
    try {
      if (!trajectoryFile || await sha256File(trajectoryFile) !== trajectoryLedger.json_sha256) fail('shared-element trajectory JSON hash mismatch');
      if (!contactFile || await sha256File(contactFile) !== trajectoryLedger.contact_sha256) fail('shared-element trajectory contact hash mismatch');
      const trajectory = await readJson(trajectoryFile);
      const outgoing = built.cuts.find((cut) => cut.shot_id === sharedBoundary.outgoing_shot_id);
      const incoming = built.cuts.find((cut) => cut.shot_id === sharedBoundary.incoming_shot_id);
      if (trajectory.transition_contract_sha256 !== sharedBoundary.transition_contract_sha256 || trajectory.outgoing_manifest_sha256 !== outgoing.manifest_sha256 || trajectory.incoming_manifest_sha256 !== incoming.manifest_sha256 || trajectory.catalog_sha256 !== authority.catalog_sha256 || trajectory.scene_runtime_sha256 !== built.scene_runtime_sha256 || trajectory.transition_runtime_sha256 !== built.transition_runtime_sha256 || trajectory.asset_sheet_set_sha256 !== built.asset_sheet_set_sha256) fail('shared-element trajectory bindings are stale');
      const expected = sharedElementTrajectory(sharedBoundary.transition, sharedBoundary.duration_frames);
      if (JSON.stringify(trajectory.samples.map(({path: _path, file_sha256: _file, pixel_sha256: _pixel, width: _width, height: _height, channels: _channels, ...sample}) => sample)) !== JSON.stringify(expected)) fail('shared-element trajectory state samples are not deterministic');
      for (const sample of trajectory.samples) {
        const file = safeFile(sample.path);
        const pixels = file ? await pixelSha(file) : null;
        if (!file || await sha256File(file) !== sample.file_sha256 || pixels.sha256 !== sample.pixel_sha256 || pixels.width !== 1920 || pixels.height !== 1080) fail(`shared-element trajectory frame is stale: ${sample.frame}`);
      }
    } catch (error) { fail(`shared-element trajectory evidence unavailable: ${error.message}`); }
  }
  const treatmentQa = ledger.selective_treatment_qa;
  const sh003 = built.cuts.find((cut) => cut.shot_id === 'SH003');
  if (treatmentQa?.status !== 'machine-generated-provisional-qc-not-user-pass' || treatmentQa.shot_id !== 'SH003' || treatmentQa.operator_id !== 'grain.overlay@1') fail('selective treatment QA is missing or claims an invalid status/operator');
  else {
    if (treatmentQa.treatment_contract_set_sha256 !== built.treatment_contract_set_sha256 || treatmentQa.manifest_sha256 !== sh003?.manifest_sha256 || treatmentQa.asset_sheet_sha256 !== sh003?.asset_sheet_sha256) fail('selective treatment QA bindings are stale');
    if (!(treatmentQa.normal_difference?.changed_pixels > 0) || !(treatmentQa.mobile_difference?.changed_pixels > 0)) fail('grain treatment lacks observable 1080p/360x203 pixel evidence');
    if (!(treatmentQa.protected_alpha_core_difference?.compared_pixels > 0) || treatmentQa.protected_alpha_core_difference?.changed_pixels !== 0) fail('protected alpha-core evidence is missing or changed');
    if (!Array.isArray(treatmentQa.artifacts) || treatmentQa.artifacts.length < 10) fail('selective treatment A/B artifact set is incomplete');
  }
  if (sh003?.manifest.effects_required !== false || sh003?.manifest.effects?.length !== 0 || (sh003?.manifest.treatments?.length ?? 0) !== 2) fail('SH003 treatment must remain procedural and separate from external effects');
  for (const cut of built.cuts.filter((cut) => cut.shot_id !== 'SH003')) if ((cut.manifest.treatments?.length ?? 0) !== 0) fail(`${cut.shot_id} must remain untreated in the first candidate`);
  if (ledger.approvals?.user_pass !== false || ledger.approvals?.omni_unlocked !== false) fail('review ledger cannot claim user PASS or Omni unlock');
} catch (error) {
  fail(`canonical review ledger missing or invalid: ${error.message}`);
}

const historicalPath = path.resolve(ROOT, 'video/qa/history/invalid-duplicate-renderers/episode-001-sh003-sh004-v08-v01.json');
let historicalLedger;
try {
  const historicalInvalid = await readJson(historicalPath);
  historicalLedger = historicalLedgerDecision({sourceLedActiveRoute,expectedPath:historicalPath,ledger:historicalInvalid});
} catch (error) { historicalLedger = historicalLedgerDecision({sourceLedActiveRoute,expectedPath:historicalPath,error}); }
if (historicalLedger.error) fail(historicalLedger.error);

if (failures.length) {
  console.error(JSON.stringify({ok: false, historical_duplicate_renderer_ledger:{status:historicalLedger.status,production_authority:false}, failures}, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ok: true, authority_root: built?.authority_root, compositions: built?.compositions.map((composition) => composition.composition_id), review_ledger: allowMissingReview ? 'optional' : normalize(path.relative(ROOT, ledgerPath)), historical_duplicate_renderer_ledger:{status:historicalLedger.status,production_authority:false}}, null, 2));
