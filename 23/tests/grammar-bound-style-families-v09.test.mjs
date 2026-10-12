import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {validateAll} from '../video/scripts/validate-grammar-bound-style-families-v09.mjs';

const root=process.cwd();
const indexPath='video/qa/style-frames/episode-001/reference-style-families-v09/family-index.json';
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));

test('v09 source-only candidate passes fail-closed validation',async()=>{
  assert.deepEqual(await validateAll({root}),[]);
});

test('v09 has no historical path leakage and keeps blocked families empty',async()=>{
  const index=await readJson(indexPath);
  for(const row of index.families){
    assert.match(row.path,/reference-style-families-v09/);
    assert.doesNotMatch(row.path,/v07|v08/);
    const manifest=await readJson(row.path);
    if(manifest.frames.length===0){assert.match(manifest.status,/blocked/);continue;}
    for(const frame of manifest.frames){
      assert.match(frame.frame_id,/-v09$/);
      for(const p of [frame.output,frame.mobile,...frame.inputs.map(x=>x.path)]){
        assert.match(p,/reference-style-families-v09/);
        assert.doesNotMatch(p,/v07|v08/);
      }
    }
  }
});

test('v09 time-data binds 0/45/90 and progress to the official source surface',async()=>{
  const index=await readJson(indexPath);
  const row=index.families.find(x=>x.family_id==='time-data-editorial');
  const manifest=await readJson(row.path);
  assert.deepEqual(manifest.frames.map(f=>f.geometry.texts[0].text),['0일','45일','90일']);
  assert.deepEqual(manifest.frames.map(f=>f.geometry.progress_overlays[0].x2>f.geometry.progress_overlays[0].x1),[false,true,true]);
  for(const frame of manifest.frames){
    assert.equal(frame.dominant_focal_asset_id,'chart');
    assert.equal(frame.semantic_fidelity.host_surface_asset_id,'chart');
    assert.equal(frame.geometry.texts[0].placement,'on-surface');
    assert.equal(frame.geometry.texts[0].host_surface_asset_id,'chart');
  }
});

test('v09 law and hook use tight real source crops with provenance',async()=>{
  const index=await readJson(indexPath);
  for(const familyId of ['law-document-editorial','hook-source-collage']){
    const row=index.families.find(x=>x.family_id===familyId);
    const manifest=await readJson(row.path);
    for(const frame of manifest.frames){
      for(const input of frame.inputs){
        assert.ok(input.asset_provenance.original_source_path);
        assert.ok(input.asset_provenance.original_source_sha256);
        assert.ok(input.asset_provenance.crop_rect);
        if(familyId==='law-document-editorial')assert.ok(input.asset_provenance.crop_rect.height<=120&&input.asset_provenance.crop_rect.width<=800);
      }
    }
  }
});
