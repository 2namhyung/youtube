import test from 'node:test';
import assert from 'node:assert/strict';
import {cutIdentityErrors} from '../video/scripts/active-cut-identity.mjs';

const root='video/public/assets/episode-001-v99';
const active=(overrides={})=>({rootRelative:root,activeCutRoot:root,folderEpisodeName:'episode-001-v99',folderShotName:'SH001',manifestEpisodeId:'episode-001',manifestShotId:'SH001',stateEpisodeId:'episode-001',specEpisodeId:'episode-001',...overrides});

test('exact active versioned root uses logical episode and physical shot identity',()=>{
  assert.deepEqual(cutIdentityErrors(active()),[]);
  assert.match(cutIdentityErrors(active({manifestEpisodeId:'episode-001-v99'})).join(' '),/manifest episode_id\/shot_id mismatch/u);
  assert.match(cutIdentityErrors(active({manifestShotId:'SH002'})).join(' '),/manifest episode_id\/shot_id mismatch/u);
  assert.match(cutIdentityErrors(active({manifestEpisodeId:undefined})).join(' '),/manifest episode_id\/shot_id mismatch/u);
});

test('non-active roots retain the historical folder-name convention',()=>{
  assert.deepEqual(cutIdentityErrors(active({activeCutRoot:'video/public/assets/episode-001-v100',manifestEpisodeId:'episode-001-v99'})),[]);
  assert.match(cutIdentityErrors(active({activeCutRoot:'video/public/assets/episode-001-v100'})).join(' '),/manifest episode_id\/shot_id mismatch/u);
  assert.deepEqual(cutIdentityErrors(active({activeCutRoot:null,manifestEpisodeId:'episode-001-v99'})),[]);
});

test('active authority rejects malformed or mismatched state, spec and folder identity',()=>{
  for(const overrides of [
    {stateEpisodeId:'episode-002'},
    {specEpisodeId:'episode-002'},
    {stateEpisodeId:null},
    {folderEpisodeName:'episode-002-v99'},
  ])assert.match(cutIdentityErrors(active(overrides)).join(' '),/canonical episode-001 state\/spec identity/u);
  assert.match(cutIdentityErrors(active({rootRelative:'video/public/assets/episode-002-v99',activeCutRoot:'video/public/assets/episode-002-v99',folderEpisodeName:'episode-002-v99'})).join(' '),/canonical episode-001 state\/spec identity/u);
});
