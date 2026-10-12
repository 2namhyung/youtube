import {createHash} from 'node:crypto';
import {cp, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {renderComposition, ROOT} from './qa-runtime.mjs';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const publicRoot = path.join(root, 'video', 'public');
const prototypeRoot = path.join(root, 'video', 'qa', 'style-frames', 'remotion-motion-grammar-v02-prototype');
const publicRootOut = path.join(publicRoot, 'assets', 'style-calibration', 'remotion-motion-grammar-v02-prototype');
const entry = path.resolve(root, 'video', 'src', 'remotion-motion-grammar-v02-prototype-index.tsx');
const design = JSON.parse(await readFile(path.join(root, 'video', 'qa', 'style-frames', 'remotion-motion-grammar-v02-design', 'manifest.json'), 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fileSha = async (file) => sha256(await readFile(file));
const rel = (file) => path.relative(root, file).replaceAll('\\', '/');
const samples = design.designs;
const blocked = new Set(['sample-03-chart-reveal', 'sample-04-map-route-reframe', 'sample-09-device-light-focal-motion']);
const renderFrame = {opening: 0, action: 90, final_hold: 180};

const assetSources = [
  {name: 'paper-beige-check.png', source: path.join(publicRoot, 'assets', 'shared', 'paper-beige-check.png'), source_kind: 'project-owned-background', source_id: 'SHARED-PAPER-BEIGE-CHECK', license: 'Project-owned fixed editorial background'},
  {name: 'sh006-person-real-cutout.png', source: path.join(root, 'video', 'qa', 'production-assets', 'episode-001', 'SH006-real-photo-v01', 'assets', 'sh006-person-real-cutout.png'), source_kind: 'real-photo-cutout', source_id: 'PEXELS-7845378', source_url: 'https://www.pexels.com/ko-kr/photo/7845378/', license: 'Pexels license; verify current terms before publication'},
  {name: 'sh006-dossier-real-photo.png', source: path.join(root, 'video', 'qa', 'production-assets', 'episode-001', 'SH006-real-photo-v01', 'assets', 'sh006-dossier-real-photo.png'), source_kind: 'real-photo-card', source_id: 'PEXELS-4792288', source_url: 'https://www.pexels.com/ko-kr/photo/4792288/', license: 'Pexels license; verify current terms before publication'},
  {name: 'sh006-police-building-real-photo.png', source: path.join(root, 'video', 'qa', 'production-assets', 'episode-001', 'SH006-real-photo-v01', 'assets', 'sh006-police-building-real-photo.png'), source_kind: 'official-real-photo-card', source_id: 'WIKIMEDIA-3243833', source_url: 'https://commons.wikimedia.org/wiki/File%3AKorean_National_Police_Agency_Building02.jpg', license: 'CC BY 2.0'},
  {name: 'sh006-legal-signing-real-photo.png', source: path.join(root, 'video', 'qa', 'production-assets', 'episode-001', 'SH006-real-photo-v01', 'assets', 'sh006-legal-signing-real-photo.png'), source_kind: 'real-photo-card', source_id: 'PEXELS-8730374', source_url: 'https://www.pexels.com/ko-kr/photo/8730374/', license: 'Pexels license; verify current terms before publication'},
];

await mkdir(path.join(publicRootOut, 'assets'), {recursive: true});
const copiedAssets = [];
for (const source of assetSources) {
  const destination = path.join(publicRootOut, 'assets', source.name);
  await cp(source.source, destination);
  const [sourceBytes, outputBytes, metadata] = await Promise.all([readFile(source.source), readFile(destination), sharp(destination).metadata()]);
  const sourceHash = sha256(sourceBytes);
  const outputHash = sha256(outputBytes);
  if (sourceHash !== outputHash) throw new Error(`asset copy hash mismatch: ${source.name}`);
  copiedAssets.push({asset_id: source.name.replace(/\.png$/u, ''), file: `assets/${source.name}`, source_path: rel(source.source), path: rel(destination), sha256: outputHash, source_sha256: sourceHash, width: metadata.width, height: metadata.height, asset_class: source.name === 'paper-beige-check.png' ? 'background' : source.name.includes('person') ? 'person' : source.name.includes('police') ? 'building' : 'photo', origin: source.name.includes('person') ? 'real-source' : 'real-source', source_kind: source.source_kind, source_id: source.source_id, source_url: source.source_url ?? null, license: source.license, ai_disclosure: false});
}

const compositionFor = (sample, index) => `RemotionGrammarV02Sample${String(index + 1).padStart(2, '0')}`;
const framePath = (sample, label) => path.join(prototypeRoot, sample.sample_id, `${label}-provisional.png`);
const videoPath = (sample) => path.join(prototypeRoot, sample.sample_id, `${sample.sample_id}-provisional.mp4`);
const renderSampleStill = (sample, index, label) => {
  const file = framePath(sample, label);
  const result = spawnSync(process.execPath, [path.resolve(ROOT, 'node_modules', '@remotion', 'cli', 'remotion-cli.js'), 'still', entry, compositionFor(sample, index), file, '--frame', String(renderFrame[label.replace('-', '_')]), '--config', path.resolve(ROOT, 'video/remotion.config.ts'), '--image-format', 'png', '--log', 'error'], {cwd: ROOT, encoding: 'utf8', windowsHide: true, env: {...process.env, REMOTION_DISABLE_NETWORK: '1'}});
  if (result.status !== 0) throw new Error(`${compositionFor(sample, index)} still render failed for ${label}\n${result.stderr || result.stdout}`);
  return file;
};

const outputEntries = [];
for (let index = 0; index < samples.length; index += 1) {
  const sample = samples[index];
  const sampleRoot = path.join(prototypeRoot, sample.sample_id);
  await mkdir(sampleRoot, {recursive: true});
  if (blocked.has(sample.sample_id)) {
    const reasons = { 'sample-03-chart-reveal': 'Exact official dataset/chart source is not present locally; no invented chart is rendered.', 'sample-04-map-route-reframe': 'Exact official/licensed map source is not present locally; no building photo is substituted for a map.', 'sample-09-device-light-focal-motion': 'Exact real/official device input is not present locally; no substitute is rendered.' };
    await writeFile(path.join(sampleRoot, 'manifest.json'), `${JSON.stringify({...sample, schema_version: 1, status: 'blocked-missing-real-input', review_profile: 'remotion-motion', production_visible: false, production_eligible: false, user_reference_calibration_pass: false, user_style_frame_pass: false, user_cut_pass: false, rights_approved: false, omni_video_approved: false, parity_approved: false, grammar_promoted: false, motion_artifacts_created: false, composition: compositionFor(sample, index), reason: reasons[sample.sample_id]}, null, 2)}\n`);
    outputEntries.push({sample_id: sample.sample_id, status: 'blocked-missing-real-input', composition: compositionFor(sample, index), outputs: []});
    continue;
  }
  const opening = renderSampleStill(sample, index, 'opening');
  const action = renderSampleStill(sample, index, 'action');
  const finalHold = renderSampleStill(sample, index, 'final-hold');
  const video = videoPath(sample);
  renderComposition({entry, composition: compositionFor(sample, index), output: video});
  const mobile = path.join(sampleRoot, 'final-hold-360x203.png');
  await sharp(finalHold).resize(360, 203, {fit: 'fill'}).png().toFile(mobile);
  const ref = sample.reference_bindings[0];
  const referenceFrame = path.resolve(root, ref.frame_evidence.start.path);
  const sideBySide = path.join(sampleRoot, 'side-by-side-provisional.png');
  const [left, right] = await Promise.all([
    sharp(referenceFrame).resize(960, 1080, {fit: 'contain', background: '#f2ead8'}).png().toBuffer(),
    sharp(action).resize(960, 1080, {fit: 'contain', background: '#f2ead8'}).png().toBuffer(),
  ]);
  await sharp({create: {width: 1920, height: 1080, channels: 4, background: '#f2ead8'}}).composite([{input: left, left: 0, top: 0}, {input: right, left: 960, top: 0}]).png().toFile(sideBySide);
  let pairArtifact = null;
  if (sample.sample_id === 'sample-06-directional-exit-hard-cut-pair') {
    const hardCut = sample.reference_bindings.find((binding) => binding.grammar_id === 'hard-cut');
    const pairPath = path.join(sampleRoot, 'adjacent-pair-provisional.png');
    const pairFrames = await Promise.all(['start', 'mid', 'end'].map((state) => sharp(path.resolve(root, hardCut.frame_evidence[state].path)).resize(640, 360, {fit: 'contain', background: '#f2ead8'}).png().toBuffer()));
    await sharp({create: {width: 1920, height: 360, channels: 4, background: '#f2ead8'}}).composite(pairFrames.map((input, position) => ({input, left: position * 640, top: 0}))).png().toFile(pairPath);
    pairArtifact = {path: rel(pairPath), sha256: await fileSha(pairPath), reference_grammar_id: 'hard-cut', status: 'pending-human-pair-review'};
  }
  const outputs = {opening: {path: rel(opening), sha256: await fileSha(opening), frame: renderFrame.opening, dimensions: {width: 1920, height: 1080}}, action: {path: rel(action), sha256: await fileSha(action), frame: renderFrame.action, dimensions: {width: 1920, height: 1080}}, final_hold: {path: rel(finalHold), sha256: await fileSha(finalHold), frame: renderFrame.final_hold, dimensions: {width: 1920, height: 1080}}, mobile: {path: rel(mobile), sha256: await fileSha(mobile), dimensions: {width: 360, height: 203}}, video: {path: rel(video), sha256: await fileSha(video)}, side_by_side: {path: rel(sideBySide), sha256: await fileSha(sideBySide), dimensions: {width: 1920, height: 1080}, reference_panel: {width: 960, height: 1080, fit: 'contain'}, candidate_panel: {width: 960, height: 1080, fit: 'contain'}}, ...(pairArtifact ? {pair_artifact: pairArtifact} : {})};
  const manifest = {...sample, schema_version: 1, status: 'pending-human-reference-calibration-review', review_profile: 'remotion-motion', production_authority: false, production_visible: false, production_eligible: false, user_reference_calibration_pass: false, user_style_frame_pass: false, user_cut_pass: false, rights_approved: false, omni_video_approved: false, parity_approved: false, grammar_promoted: false, motion_artifacts_created: true, composition: compositionFor(sample, index), runtime: {entry: rel(entry)}, background: 'assets/paper-beige-check.png', assets: copiedAssets, effects_required: false, effects: [], outputs, reference_side_by_side_integrity: {reference_frame_path: ref.frame_evidence.start.path, reference_frame_sha256: ref.frame_evidence.start.sha256, candidate_frame_sha256: outputs.action.sha256, panel_size: '960x1080 contain', human_review_required: true}};
  await writeFile(path.join(sampleRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  outputEntries.push({sample_id: sample.sample_id, status: manifest.status, composition: manifest.composition, outputs});
}

const boardWidth = 1920;
const boardHeight = 1180;
const panelWidth = 384;
const panelHeight = 560;
const boardLayers = [];
const boardText = [];
for (let index = 0; index < outputEntries.length; index += 1) {
  const item = outputEntries[index];
  const x = (index % 5) * panelWidth;
  const y = 60 + Math.floor(index / 5) * panelHeight;
  boardText.push(`<text x="${x + 18}" y="${y + 30}" font-family="Arial" font-size="20" font-weight="800" fill="#302a24">${String(index + 1).padStart(2, '0')} ${item.sample_id.replace('sample-', '')}</text>`);
  if (item.outputs.action) boardLayers.push({input: await sharp(path.resolve(root, item.outputs.action.path)).resize(panelWidth, panelHeight - 44, {fit: 'contain', background: '#f2ead8'}).png().toBuffer(), left: x, top: y + 44});
  else boardLayers.push({input: await sharp({create: {width: panelWidth, height: panelHeight - 44, channels: 4, background: '#e6dccb'}}).png().toBuffer(), left: x, top: y + 44});
}
const boardSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${boardWidth}" height="60"><rect width="100%" height="100%" fill="#eee7da"/><text x="30" y="39" font-family="Arial" font-size="27" font-weight="900" fill="#172a34">REMOTION GRAMMAR V02 PROTOTYPES · HUMAN CALIBRATION REVIEW PENDING</text></svg>`);
const boardLabels = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${boardWidth}" height="${boardHeight}">${boardText.join('')}</svg>`);
await sharp({create: {width: boardWidth, height: boardHeight, channels: 4, background: '#f2ead8'}}).composite([{input: boardSvg, left: 0, top: 0}, ...boardLayers, {input: boardLabels, left: 0, top: 0}]).png().toFile(path.join(prototypeRoot, 'review-board.png'));

const aggregate = {schema_version: 1, candidate_set_id: 'remotion-motion-grammar-v02-prototype', status: 'pending-human-reference-calibration-review', review_profile: 'remotion-motion', production_authority: false, production_visible: false, production_eligible: false, user_reference_calibration_pass: false, grammar_promoted: false, omni_video_approved: false, parity_approved: false, motion_artifacts_created: true, entry: rel(entry), sample_count: samples.length, rendered_count: outputEntries.filter((item) => item.outputs?.video).length, blocked_count: outputEntries.filter((item) => item.status === 'blocked-missing-real-input').length, samples: outputEntries, note: 'Calibration prototypes only. No PASS marker, production promotion, rights approval, or Omni unlock.'};
await writeFile(path.join(prototypeRoot, 'catalog.json'), `${JSON.stringify(aggregate, null, 2)}\n`);
await writeFile(path.join(prototypeRoot, 'README.md'), '# Remotion motion grammar v02 prototypes\n\nInactive reference-calibration prototypes only. Actual Remotion compositions are rendered from the dedicated v02 entrypoint. Sample 09 is blocked because no exact real device input exists locally; no substitute is rendered. All other samples use copied real/source-derived local assets with provenance and SHA-256 records. Human calibration review remains pending; no PASS or production authority is granted.\n');
console.log(JSON.stringify({root: rel(prototypeRoot), rendered: aggregate.rendered_count, blocked: aggregate.blocked_count, board: rel(path.join(prototypeRoot, 'review-board.png'))}, null, 2));
