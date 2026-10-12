import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {validateAll} from '../video/scripts/validate-grammar-bound-style-families-v07.mjs';

const root = process.cwd();
const indexPath = 'video/qa/style-frames/episode-001/reference-style-families-v07/family-index.json';
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

test('v07 transfers only episode-specific source surfaces', async () => {
  const historicalErrors=await validateAll({root});
  assert.ok(historicalErrors.some((error)=>error==='gate drift'),historicalErrors.join('\n'));
  const index = await readJson(indexPath);
  assert.deepEqual(
    {families:index.family_count, built:index.built_family_count, blocked:index.blocked_family_count, mapped:index.sample_coverage.mapped, user_approved:index.user_approved},
    {families:6, built:4, blocked:2, mapped:[1,2,3,4,5,6,7,8,9], user_approved:false},
  );
  for (const family of index.families) {
    const manifest = await readJson(family.path);
    for (const frame of manifest.frames ?? []) {
      assert.equal(frame.dominant_focal_kind, 'source-surface');
      assert.equal(frame.geometry.texts.length, 0);
      assert.equal(frame.semantic_fidelity.no_semantic_substitution, true);
      assert.equal(frame.semantic_fidelity.observable_non_text_delta, true);
      if (family.family_id === 'process-route-editorial') assert.equal(frame.geometry.connectors.length, frame.representative_beat === 'opening' ? 0 : frame.representative_beat === 'evidence-or-change' ? 1 : 2);
      const focal = frame.inputs.find((input) => input.asset_id === frame.dominant_focal_asset_id);
      assert.equal(focal.asset_provenance.origin, 'real-or-official-source');
      assert.doesNotMatch(focal.asset_class, /text|card|number|label|chrome|overlay/iu);
      assert.doesNotMatch(focal.path, /style-calibration|nps-|gistemp|cpi-|sample-cuts/iu);
      assert.doesNotMatch(focal.path, /retype|text-card|number-pill/iu);
      for (const input of frame.inputs) {
        assert.doesNotMatch(input.path, /style-calibration|nps-|gistemp|cpi-|sample-cuts/iu);
        assert.doesNotMatch(`${input.asset_class}|${input.path}|${input.asset_provenance.derivation ?? ''}`, /retype|text-card|number-pill/iu);
      }
    }
  }
});

test('v07 blocked families expose no placeholder review frames', async () => {
  const index = await readJson(indexPath);
  for (const id of ['assembly-editorial', 'omni-fiction-continuity']) {
    const manifest = await readJson(index.families.find((row) => row.family_id === id).path);
    assert.equal(manifest.status, 'blocked-missing-required-source-inputs');
    assert.deepEqual(manifest.frames, []);
    assert.deepEqual(manifest.exact_input_bundle.rows, []);
  }
});
