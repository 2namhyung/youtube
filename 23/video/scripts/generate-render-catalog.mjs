import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {buildAuthorityCatalog, renderCatalogTypeScript, ROOT, sha256Bytes} from './render-authority-lib.mjs';

const catalog = await buildAuthorityCatalog();
const json = `${JSON.stringify(catalog, null, 2)}\n`;
const catalogSha = sha256Bytes(json);
const jsonPath = path.resolve(ROOT, 'video/episodes/episode-001/generated/render-catalog.json');
await writeFile(jsonPath, json, 'utf8');

const ts = renderCatalogTypeScript(catalog);
await writeFile(path.resolve(ROOT, 'video/src/generated/render-authority-catalog.ts'), ts, 'utf8');

const statePath = path.resolve(ROOT, 'video/episodes/episode-001/production-state.json');
const state = JSON.parse(await readFile(statePath, 'utf8'));
if (catalog.status !== 'blocked-source-search-no-render-authority') {
state.render_authority.manifest_set_sha256 = catalog.manifest_set_sha256;
state.render_authority.asset_sheet_schema = catalog.asset_sheet_schema;
state.render_authority.asset_sheet_set_sha256 = catalog.asset_sheet_set_sha256;
state.render_authority.treatment_contract_set_sha256 = catalog.treatment_contract_set_sha256;
state.render_authority.render_input_set_sha256 = catalog.render_input_set_sha256;
state.render_authority.catalog_sha256 = catalogSha;
state.render_authority.scene_runtime_sha256 = catalog.scene_runtime_sha256;
state.render_authority.transition_runtime_sha256 = catalog.transition_runtime_sha256;
state.render_authority.spatial_candidate_status = 'pending-user-review';
state.render_authority.previous_visual_direction_status = 'not-production-pass-superseded-by-asset-sheet-runtime';
await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({ok: true, catalog: path.relative(ROOT, jsonPath).replaceAll('\\', '/'), catalog_sha256: catalogSha, manifest_set_sha256: catalog.manifest_set_sha256, asset_sheet_set_sha256: catalog.asset_sheet_set_sha256, treatment_contract_set_sha256: catalog.treatment_contract_set_sha256, render_input_set_sha256: catalog.render_input_set_sha256, compositions: catalog.compositions.map((entry) => entry.composition_id)}, null, 2));
