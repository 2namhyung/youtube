import {buildAuthorityCatalog} from './render-authority-lib.mjs';

try {
  const catalog = await buildAuthorityCatalog();
  console.log(JSON.stringify({
    ok: true,
    authority_root: catalog.authority_root,
    asset_sheet_schema: catalog.asset_sheet_schema,
    asset_sheet_set_sha256: catalog.asset_sheet_set_sha256,
    cuts: catalog.cuts.map((cut) => ({shot_id: cut.shot_id, path: cut.asset_sheet_path, sha256: cut.asset_sheet_sha256, layers: cut.asset_sheet.layers.length})),
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ok: false, failure: error.message}, null, 2));
  process.exit(1);
}
