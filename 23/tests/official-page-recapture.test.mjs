import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {validateOfficialPageRecapture} from '../video/scripts/validate-official-page-recapture.mjs';

const manifest = () => JSON.parse(fs.readFileSync('video/source-intake/episode-001/official/recapture-v03/manifest.json', 'utf8'));

test('representative official-page recaptures are distinct, visible, byte-bound and non-promoting', async () => {
  assert.deepEqual((await validateOfficialPageRecapture()).failures, []);
});

test('official-page recapture rejects duplicate surfaces, hidden locator evidence and approval claims', async () => {
  const duplicate = manifest();
  duplicate.captures[1].sha256 = duplicate.captures[0].sha256;
  assert.match((await validateOfficialPageRecapture({manifest:duplicate})).failures.join('\n'), /duplicate screenshot bytes|bytes\/hash drift/u);

  const hidden = manifest();
  hidden.captures[0].locator_evidence.target_rect.top = hidden.captures[0].locator_evidence.container_rect.top - 1;
  assert.match((await validateOfficialPageRecapture({manifest:hidden})).failures.join('\n'), /not visible/u);

  const approved = manifest();
  approved.captures[0].human_approval = true;
  assert.match((await validateOfficialPageRecapture({manifest:approved})).failures.join('\n'), /unapproved and unmaterialized/u);
});
