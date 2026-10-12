import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {COVERAGE_DIMENSIONS, AUTHORING_ROUTE, validateCanonicalProductionAuthoring, validateManifestAuthoringDeclaration, validateNonAuthoritySource, validateProductionAuthoringContract} from '../video/scripts/production-authoring-contract.mjs';

const contract = JSON.parse(await readFile('video/contracts/production-authoring-contract-v1.json', 'utf8'));

test('production authoring contract defines one route and nine coverage dimensions', () => {
  assert.deepEqual(validateProductionAuthoringContract(contract), []);
  assert.deepEqual(contract.coverage_matrix.dimensions, COVERAGE_DIMENSIONS);
  assert.equal(contract.authority_route.route_expression, AUTHORING_ROUTE);
  assert.equal(contract.authority_route.runtime_entrypoint, 'video/src/production-index.tsx');
});

test('canonical production route binds current spec, generated contracts, catalog and runtime', async () => {
  const result = await validateCanonicalProductionAuthoring();
  assert.deepEqual(result.failures, []);
  assert.equal(result.route, AUTHORING_ROUTE);
});

test('declared manifest authoring contract is fail-closed while historical manifests may omit it', () => {
  const historical = {schema_version: 3, shot_id: 'SH001'};
  assert.deepEqual(validateManifestAuthoringDeclaration(historical), []);
  assert.match(validateManifestAuthoringDeclaration(historical, {requireDeclaration: true}).join('\n'), /is required for an active production candidate/u);
  const broken = {schema_version: 3, shot_id: 'SH001', production_authoring_contract: {version: 1}};
  const failures = validateManifestAuthoringDeclaration(broken).join('\n');
  assert.match(failures, /contract_path/u);
  assert.match(failures, /coverage_matrix/u);
});

test('non-authority routes cannot consume the production catalog or EpisodeTimeline', () => {
  assert.deepEqual(validateNonAuthoritySource('qa.tsx', 'registerRoot(QaRoot);'), []);
  assert.match(validateNonAuthoritySource('qa.tsx', "import {catalog} from './generated/render-authority-catalog';").join('\n'), /production render catalog/u);
  assert.match(validateNonAuthoritySource('qa.tsx', 'render(<EpisodeTimeline />);').join('\n'), /EpisodeTimeline/u);
  assert.match(validateNonAuthoritySource('qa.mjs', "const item = {active_cut_root: candidateRoot};").join('\n'), /active_cut_root/u);
  assert.match(validateNonAuthoritySource('qa.mjs', 'const marker = {"user_pass": true};').join('\n'), /user_pass/u);
  assert.match(validateNonAuthoritySource('qa.mjs', "import {writeFile} from 'node:fs/promises'; await writeFile(productionStatePath, '{}');").join('\n'), /protected production authority path/u);
});

test('source materialization state cannot be disguised as a SHA value', () => {
  const declaration = {
    version: 1,
    contract_path: 'video/contracts/production-authoring-contract-v1.json',
    route: AUTHORING_ROUTE,
    episode_spec_path: 'video/episodes/episode-001/episode-spec.json',
    episode_spec_sha256: 'a'.repeat(64),
    generated_manifest_contracts_path: 'video/episodes/episode-001/generated/manifest-contracts.json',
    generated_manifest_contracts_sha256: 'b'.repeat(64),
    render_catalog_path: 'video/episodes/episode-001/generated/render-catalog.json',
    cut_contract: {shot_id: 'SH001', source_spec_sha256: 'c'.repeat(64), source_cut_sha256: 'd'.repeat(64), manifest_contract_sha256: 'e'.repeat(64)},
    visual_treatment: {surface: 'x', palette: 'x', typography: 'x', texture: 'x', prohibited_treatments: ['x']},
    motion_contract: {target_asset_id: 'x', operator_id: 'x', start_frame: 0, end_frame: 1, state_delta: 'x', reading_hold: {start_frame: 1, end_frame: 61}},
    source_contract: {source_id: 'x', source_kind: 'x', locator: 'x', rights_status: 'pending', materialization_status: 'pending', sha256: 'pending-source-materialization'},
    coverage_matrix: Object.fromEntries(COVERAGE_DIMENSIONS.map((dimension) => [dimension, {status: 'planned', evidence: ['x']}])),
    production_authority: false,
  };
  const manifest = {shot_id: 'SH001', source_spec_sha256: 'c'.repeat(64), source_cut_sha256: 'd'.repeat(64), manifest_contract_sha256: 'e'.repeat(64), production_authoring_contract: declaration};
  assert.match(validateManifestAuthoringDeclaration(manifest).join('\n'), /must be null/u);
  declaration.source_contract.sha256 = null;
  assert.deepEqual(validateManifestAuthoringDeclaration(manifest), []);
});

test('new-cut rejects versioned episode IDs and unknown cuts before touching the workspace', () => {
  const versioned = spawnSync(process.execPath, ['video/scripts/new-cut.mjs', 'episode-001-v2', 'SH008'], {encoding: 'utf8'});
  assert.notEqual(versioned.status, 0);
  assert.match(`${versioned.stderr}${versioned.stdout}`, /episode-001 SH008/u);
  const unknown = spawnSync(process.execPath, ['video/scripts/new-cut.mjs', 'episode-001', 'SH999'], {encoding: 'utf8'});
  assert.notEqual(unknown.status, 0);
  assert.match(`${unknown.stderr}${unknown.stdout}`, /not declared/u);
});
