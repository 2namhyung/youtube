import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const studio = path.join(root, 'video', 'scripts', 'style-calibration-studio.mjs');

test('Studio registry receives no EpisodeTimeline windows while current render authority is blocked', async () => {
  const catalog = JSON.parse(await readFile(path.join(root, 'video/episodes/episode-001/generated/render-catalog.json'), 'utf8'));
  assert.equal(catalog.status, 'blocked-source-search-no-render-authority');
  assert.equal(catalog.production_authority, false);
  assert.equal(catalog.authority_root, null);
  assert.deepEqual(catalog.cuts, []);
  assert.deepEqual(catalog.boundaries, []);
  assert.deepEqual(catalog.compositions, []);
  const registry = await readFile(path.join(root, 'video/src/production-index.tsx'), 'utf8');
  assert.match(registry, /generated\/render-authority-catalog/u);
  assert.match(registry, /!productionState\.render_authority\.cut_root/u);
  assert.match(registry, /cut_root !== renderAuthorityCatalog\.authority_root/u);
  assert.doesNotMatch(registry, /manifest\.json|AssemblySet-|Calibration-SH/u);
});

test('Studio launcher rejects unsupported options before validation or launch', () => {
  const result = spawnSync(process.execPath, [studio, '--unsafe-root'], {cwd: root, encoding: 'utf8', windowsHide: true});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr || result.stdout, /unsupported Studio option/u);
});
