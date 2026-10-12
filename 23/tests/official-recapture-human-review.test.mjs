import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {validateOfficialRecaptureReview} from '../video/scripts/validate-episode-001-official-recapture-review.mjs';

const read=()=>JSON.parse(fs.readFileSync('video/qa/source-review/episode-001-official-recapture-v03/manifest.json','utf8'));

test('official recapture comparison package is deterministic historical evidence only',async()=>{
  assert.deepEqual((await validateOfficialRecaptureReview()).failures,[]);
  const manifest=read();
  assert.equal(manifest.status,'historical-evidence-only');
  assert.equal(manifest.production_eligibility,'permanently-ineligible-capture-containing-rendered-text');
  assert.equal(manifest.style_frame_pixel_input_allowed,false);
  assert.equal(manifest.production_visible_allowed,false);
  assert.equal(manifest.motion_target_allowed,false);
});

test('official recapture review rejects premature decision, UI-rights conflation and hash drift',async()=>{
  const approved=read(); approved.items[0].human_decisions.rights={status:'passed',pass:true,reviewer:'user',note:'premature'};
  assert.match((await validateOfficialRecaptureReview({manifest:approved})).failures.join('\n'),/rights: decision must remain pending|hand-mutated/u);
  const conflated=read(); conflated.items[1].content_rights_boundary.law_go_kr_ui_and_logo.cleared_for_use=true;
  assert.match((await validateOfficialRecaptureReview({manifest:conflated})).failures.join('\n'),/cannot grant rights to UI\/logo|hand-mutated/u);
  const drift=read(); drift.items[2].new_candidate.sha256='0'.repeat(64);
  assert.match((await validateOfficialRecaptureReview({manifest:drift})).failures.join('\n'),/stale or was hand-mutated/u);
  const promoted=read(); promoted.production_visible_allowed=true;
  assert.match((await validateOfficialRecaptureReview({manifest:promoted})).failures.join('\n'),/permanently evidence-only|hand-mutated/u);
});
