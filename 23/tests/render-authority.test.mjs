import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {buildAuthorityCatalog, renderCatalogTypeScript} from '../video/scripts/render-authority-lib.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

test('blocked source-search draft has no render composition or production authority', async () => {
  const built = await buildAuthorityCatalog();
  assert.equal(built.authority_root, null);
  assert.equal(built.status, 'blocked-source-search-no-render-authority');
  assert.equal(built.production_authority, false);
  assert.deepEqual(built.cuts, []);
  assert.deepEqual(built.boundaries, []);
  assert.deepEqual(built.compositions, []);
  assert.equal(built.total_frames, 0);
  const persisted = JSON.parse(await readFile(path.join(root, 'video/episodes/episode-001/generated/render-catalog.json'), 'utf8'));
  assert.deepEqual(persisted, built);
  assert.equal(await readFile(path.join(root, 'video/src/generated/render-authority-catalog.ts'), 'utf8'), renderCatalogTypeScript(built));
});

test('current pair renderer and Studio have no duplicate cut authority', async () => {
  const pair = await readFile(path.join(root, 'video/src/vox/scene/TransitionPair.tsx'), 'utf8');
  assert.doesNotMatch(pair, /SH\d{3}|staticFile|<Img\b|<svg\b|<path\b|episode-001|assets\//iu);
  assert.match(pair, /<ManifestScene/u);
  const registry = await readFile(path.join(root, 'video/src/production-index.tsx'), 'utf8');
  assert.doesNotMatch(registry, /manifest\.json|sh004-two-route|durationInFrames=\{\d+\}|fps=\{\d+\}/iu);
});

test('render authority validator accepts generated contract and review bindings', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'video/scripts/validate-render-authority.mjs')], {cwd: root, encoding: 'utf8', windowsHide: true});
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
