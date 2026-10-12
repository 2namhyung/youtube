import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {validateAll} from '../video/scripts/validate-grammar-bound-style-families-v10.mjs';
const indexPath='video/qa/style-frames/episode-001/reference-style-families-v10/family-index.json';
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
test('v10 recognizable-source candidate passes fail-closed validation',async()=>assert.deepEqual(await validateAll(),[]));
test('v10 rejects text-only strips by requiring native structural cues',async()=>{
  const index=await readJson(indexPath);
  for(const row of index.families){
    assert.match(row.path,/reference-style-families-v10/);assert.doesNotMatch(row.path,/v08|v09/);
    const m=await readJson(row.path);for(const f of m.frames)for(const input of f.inputs){
      const rs=input.asset_provenance.recognizable_source_surface;
      assert.ok(rs&&rs.minimum_cues>=2&&rs.cue_ids.length>=2&&rs.cue_regions.length>=2);
      assert.ok(input.asset_provenance.crop_rect===null||input.asset_provenance.crop_rect.height>=100);
    }
  }
});
test('v10 hook and process finals retain concrete surfaces',async()=>{
  const index=await readJson(indexPath);
  const hook=await readJson(index.families.find(x=>x.family_id==='hook-source-collage').path);
  assert.deepEqual(hook.frames[2].inputs.map(x=>x.asset_id),['news-a']);
  const process=await readJson(index.families.find(x=>x.family_id==='process-route-editorial').path);
  assert.deepEqual(process.frames[2].inputs.map(x=>x.asset_id).sort(),['case-file','police']);
});
