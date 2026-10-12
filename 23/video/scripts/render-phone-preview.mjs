import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {loadProductionContext, manifestInputFingerprint, publicCutBasePath, readJson, renderStill, ROOT, runGateValidators, safeEpisodeId, writeRenderProps} from './qa-runtime.mjs';
import {previewFrames} from './visual-state-lib.mjs';

const args = process.argv.slice(2);
runGateValidators(args);
const context = await loadProductionContext(args);
if (!context.activeRoot) {
  console.log(JSON.stringify({ok: true, rendered: 0, skipped: 'no validated active_cut_root'}, null, 2));
  process.exit(0);
}
const episodeId = safeEpisodeId(context.state);
const outputRoot = path.resolve(ROOT, 'video/qa', episodeId, 'phone-previews');
await mkdir(outputRoot, {recursive: true});
const items = [];
for (const cut of context.cuts) {
  const manifest = await readJson(path.join(cut.root, 'manifest.json'));
  const inputFingerprint = await manifestInputFingerprint(cut.root, manifest);
  const previewFrame = previewFrames(manifest).final;
  const propsFile = await writeRenderProps({outputRoot, shotId: cut.shotId, manifest, cutBasePath: publicCutBasePath(cut.root), inputFingerprint, previewFrame});
  const output = path.join(outputRoot, `${cut.shotId}-phone.png`);
  renderStill({composition: 'ManifestCutProvisionalStill', output, propsFile, scale: 0.1875});
  items.push({shot_id: cut.shotId, file: path.basename(output), frame: previewFrame, input_sha256: inputFingerprint});
}
const html = `<!doctype html><meta charset="utf-8"><title>${episodeId} phone previews</title><style>body{background:#211e1a;color:#fffaf0;font:16px Arial,sans-serif;margin:32px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(390px,1fr));gap:28px}.phone{width:360px;padding:14px 10px 26px;border-radius:24px;background:#080808;box-shadow:0 12px 28px #000}.phone img{display:block;width:360px;height:auto;background:#f2ead8}code{font-size:11px;color:#cfc2aa;word-break:break-all}</style><h1>${episodeId} final-hold phone previews</h1><div class="grid">${items.map((item) => `<section><h2>${item.shot_id} · F${item.frame}</h2><div class="phone"><img src="${item.file}" alt="${item.shot_id} phone preview"></div><code>${item.input_sha256}</code></section>`).join('')}</div>`;
await writeFile(path.join(outputRoot, 'index.html'), html);
console.log(JSON.stringify({ok: true, rendered: items.length, output_root: path.relative(ROOT, outputRoot).replaceAll('\\', '/'), items}, null, 2));
