import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {validateAll} from '../video/scripts/validate-grammar-bound-style-families-v06.mjs';

const root = process.cwd();
const indexPath = 'video/qa/style-frames/episode-001/reference-style-families-v06/family-index.json';
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

test('v06 source-surface candidate is fail-closed and has no text-box focal', async () => {
  const historicalErrors=await validateAll({root});
  assert.ok(historicalErrors.some((error)=>error==='canonical gates drift'),historicalErrors.join('\n'));
  const index = await readJson(indexPath);
  assert.deepEqual({families:index.family_count,built:index.built_family_count,blocked:index.blocked_family_count,mapped:index.sample_coverage.mapped,user_approved:index.user_approved}, {families:6,built:4,blocked:2,mapped:[1,2,3,4,5,6,7,8,9],user_approved:false});
  for (const family of index.families) {
    const manifest = await readJson(family.path);
    for (const frame of manifest.frames ?? []) {
      assert.equal(frame.dominant_focal_kind, 'source-surface');
      assert.equal(frame.asset_text_substitution, false);
      assert.equal(frame.geometry.texts.length, 0);
      assert.equal(frame.semantic_fidelity.text_is_supplemental, true);
      assert.equal(frame.semantic_fidelity.no_semantic_substitution, true);
      assert.equal(frame.semantic_fidelity.observable_non_text_delta, true);
      const focal = frame.inputs.find((input) => input.asset_id === frame.dominant_focal_asset_id);
      assert.ok(focal);
      assert.equal(focal.asset_provenance.origin, 'real-or-official-source');
      assert.notEqual(focal.asset_class, 'numeric-group');
      assert.doesNotMatch(focal.path, /retype|text-card|number-pill/iu);
    }
  }
});

test('blocked families expose no placeholder review frames', async () => {
  const index = await readJson(indexPath);
  for (const id of ['assembly-editorial','omni-fiction-continuity']) {
    const manifest = await readJson(index.families.find((row) => row.family_id === id).path);
    assert.equal(manifest.status, 'blocked-missing-required-source-inputs');
    assert.deepEqual(manifest.frames, []);
    assert.deepEqual(manifest.exact_input_bundle.rows, []);
  }
});
