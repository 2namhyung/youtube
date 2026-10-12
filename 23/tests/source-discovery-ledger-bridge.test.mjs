import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {loadDownloadedDiscoveryCandidates} from '../video/source-intake/episode-001/source-selection-v02/discovery-ledger-bridge.mjs';

test('bridge imports only decoded downloaded originals and keeps them semantically unapproved', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '23jung-ledger-bridge-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.writeFile(path.join(root, 'broad-discovery-test.json'), JSON.stringify({candidates: [
    {candidate_id:'kept', media_type:'video', item_url:'https://example.test/item', brief_ids:['SH001-a'], provenance_matches:[{brief_id:'SH002-b'}], asset_acquisition:{status:'downloaded-candidate-pending-human-review', local_path:'video/a.mp4', sha256:'a'.repeat(64), decoded:true, verification:{width:1920,height:1080,duration_seconds:5}}},
    {candidate_id:'metadata-only', media_type:'photo', asset_acquisition:{status:'metadata-only', local_path:null, sha256:null, decoded:false}},
  ]}));
  const candidates = await loadDownloadedDiscoveryCandidates(root);
  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].curation.briefs, ['SH001-a','SH002-b']);
  assert.equal(candidates[0].curation.fit, 'partial');
  assert.deepEqual(candidates[0].curation.brief_evidence, {});
  assert.equal(candidates[0].duration_seconds, 5);
});

test('bridge deduplicates bytes across ledgers while preserving all brief origins', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '23jung-ledger-bridge-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const asset={status:'downloaded-candidate-pending-human-review',local_path:'video/a.jpg',sha256:'b'.repeat(64),decoded:true,verification:{width:800,height:600}};
  await fs.writeFile(path.join(root, 'broad-discovery-a.json'),JSON.stringify({candidates:[{candidate_id:'a',media_type:'photo',brief_ids:['SH001-a'],asset_acquisition:asset}]}));
  await fs.writeFile(path.join(root, 'broad-discovery-b.json'),JSON.stringify({candidates:[{candidate_id:'b',media_type:'photo',brief_ids:['SH002-b'],asset_acquisition:asset}]}));
  const candidates=await loadDownloadedDiscoveryCandidates(root);
  assert.equal(candidates.length,1);
  assert.deepEqual(candidates[0].curation.briefs,['SH001-a','SH002-b']);
});
