import {spawnSync} from 'node:child_process';
import path from 'node:path';

import {loadProductionContext, ROOT} from './qa-runtime.mjs';

const passthrough = process.argv.slice(2);
const node = process.execPath;
const commands = [
  ['video/scripts/validate-cut-assets.mjs', ...passthrough],
  ['video/scripts/validate-production-stage.mjs', ...passthrough],
  ['video/scripts/validate-cut-visual-states.mjs', ...passthrough],
];
for (const [script, ...args] of commands) {
  const result = spawnSync(node, [path.resolve(ROOT, script), ...args], {cwd: ROOT, encoding: 'utf8', windowsHide: true});
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const context = await loadProductionContext(passthrough);
if (!context.activeRoot) {
  console.log(JSON.stringify({ok: true, stage: context.state.stage, rendered: 0, skipped: 'no active_cut_root; validators passed and no episode media was created'}, null, 2));
  process.exit(0);
}
for (const script of ['render-cut-contact-sheet.mjs', 'render-phone-preview.mjs']) {
  const result = spawnSync(node, [path.resolve(ROOT, 'video/scripts', script), ...passthrough], {cwd: ROOT, encoding: 'utf8', windowsHide: true});
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(JSON.stringify({ok: true, stage: context.state.stage, rendered: context.cuts.length, outputs: [`video/qa/${context.state.episode_id}/contact-sheets`, `video/qa/${context.state.episode_id}/phone-previews`]}, null, 2));

