import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {loadProductionContext, manifestInputFingerprint, publicCutBasePath, readJson, renderStill, ROOT, runGateValidators, safeEpisodeId, writeRenderProps} from './qa-runtime.mjs';

const args = process.argv.slice(2);
runGateValidators(args);
const context = await loadProductionContext(args);
if (!context.activeRoot) {
  console.log(JSON.stringify({ok: true, rendered: 0, skipped: 'no validated active_cut_root'}, null, 2));
  process.exit(0);
}
const episodeId = safeEpisodeId(context.state);
const outputRoot = path.resolve(ROOT, 'video/qa', episodeId, 'contact-sheets');
await mkdir(outputRoot, {recursive: true});
const items = [];
for (const cut of context.cuts) {
  const manifest = await readJson(path.join(cut.root, 'manifest.json'));
  const inputFingerprint = await manifestInputFingerprint(cut.root, manifest);
  const propsFile = await writeRenderProps({outputRoot, shotId: cut.shotId, manifest, cutBasePath: publicCutBasePath(cut.root), inputFingerprint});
  const output = path.join(outputRoot, `${cut.shotId}-contact.png`);
  renderStill({composition: 'ManifestCutContactSheetProvisional', output, propsFile});
  items.push({shot_id: cut.shotId, file: path.basename(output), input_sha256: inputFingerprint, review: manifest.review?.status ?? 'pending'});
}
const html = `<!doctype html><meta charset="utf-8"><title>${episodeId} contact sheets</title><style>body{background:#211e1a;color:#fffaf0;font:16px Arial,sans-serif;margin:32px}img{display:block;width:min(100%,1200px);margin:12px 0 40px;border:1px solid #655d52}code{color:#d8c9aa}</style><h1>${episodeId} contact sheets</h1>${items.map((item) => `<section><h2>${item.shot_id} · ${item.review}</h2><code>${item.input_sha256}</code><img src="${item.file}" alt="${item.shot_id} contact sheet"></section>`).join('')}`;
await writeFile(path.join(outputRoot, 'index.html'), html);
console.log(JSON.stringify({ok: true, rendered: items.length, output_root: path.relative(ROOT, outputRoot).replaceAll('\\', '/'), items}, null, 2));
