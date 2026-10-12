import {createHash} from 'node:crypto';
import {mkdir, readdir, readFile, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {spawnSync} from 'node:child_process';
import {loadProductionContext, manifestInputFingerprint, publicCutBasePath, readJson, renderComposition, renderStill, ROOT, writeRenderProps} from './qa-runtime.mjs';
import {runtimeSha256, validateVisualContractV2} from './visual-contract-v2.mjs';
import {validateVisualContractV3} from './visual-contract-v3.mjs';

const args = process.argv.slice(2);
const {state} = await loadProductionContext(args);
const calibration = state.style_calibration;
const candidateRelative = String(calibration?.candidate_root ?? '').replaceAll('\\', '/');
const candidateRoot = path.resolve(ROOT, candidateRelative);
const publicAssets = path.resolve(ROOT, 'video/public/assets');
const expectedShots = [...(calibration?.shot_ids ?? [])].sort();
const playableShots = new Set(calibration?.playable_shot_ids ?? []);
const galleryShots = new Set(calibration?.keyframe_gallery_shot_ids ?? []);
const failures = [];
const missing = [];
const exists = async (file) => { try { await stat(file); return true; } catch { return false; } };
const inside = (file, root) => { const rel = path.relative(root, file); return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel); };
const validPng = (buffer) => buffer.length >= 24 && buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && buffer.readUInt32BE(16) > 0 && buffer.readUInt32BE(20) > 0;
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

if (state.stage !== 'timing-draft' || state.active_cut_root !== null) failures.push('style calibration requires inactive timing-draft state');
if (calibration?.status !== 'draft' || calibration?.user_approved === true || calibration?.approval_marker) failures.push('style calibration must remain an unapproved draft');
if (!/^video\/public\/assets\/[a-z0-9-]+$/u.test(candidateRelative) || !inside(candidateRoot, publicAssets)) failures.push('unsafe style calibration candidate_root');
if (state.provisional_artifacts?.[candidateRelative] !== 'style-calibration-candidate') failures.push('candidate root must be marked style-calibration-candidate');
if (expectedShots.length === 0 || expectedShots.some((id) => !/^SH\d{3}$/u.test(id))) failures.push('invalid style calibration shot list');
if ([...playableShots].some((id) => galleryShots.has(id))) failures.push('playable and keyframe-gallery shot sets must be disjoint');
if ([...new Set([...playableShots, ...galleryShots])].sort().join('|') !== expectedShots.join('|')) failures.push('every calibration shot must be routed to playback or keyframe gallery');

const template = await readFile(path.join(publicAssets, '_cut-template/background.png')).catch(() => null);
if (!template || !validPng(template)) failures.push('fixed template background is missing or invalid');
const manifests = [];
if (await exists(path.join(candidateRoot, 'cuts'))) {
  const physicalShots = (await readdir(path.join(candidateRoot, 'cuts'), {withFileTypes: true})).filter((entry) => entry.isDirectory() && /^SH\d{3}$/u.test(entry.name)).map((entry) => entry.name).sort();
  if (physicalShots.join('|') !== expectedShots.join('|')) failures.push(`candidate root must contain exactly ${expectedShots.join(', ')}`);
  for (const shotId of expectedShots) {
    const cutRoot = path.join(candidateRoot, 'cuts', shotId);
    const manifest = await readJson(path.join(cutRoot, 'manifest.json')).catch(() => null);
    if (!manifest) { failures.push(`${shotId}: missing manifest.json`); continue; }
    manifests.push({shotId, cutRoot, manifest});
    if (manifest.episode_id !== state.episode_id || manifest.shot_id !== shotId) failures.push(`${shotId}: manifest identity mismatch`);
    const contractFailures = manifest.schema_version === 3 ? validateVisualContractV3(manifest, {requireTransitionArtifact: false}) : validateVisualContractV2(manifest, {requireTransitionArtifact: false});
    for (const message of contractFailures) failures.push(`${shotId}: ${message}`);
    if (playableShots.has(shotId) && manifest.review_profile !== 'remotion-motion') failures.push(`${shotId}: Studio playback requires remotion-motion profile`);
    if (galleryShots.has(shotId) && manifest.review_profile !== 'omni-keyframe-input') failures.push(`${shotId}: keyframe gallery requires omni-keyframe-input profile`);
    if (manifest.approvals?.generation_input?.user_pass || manifest.approvals?.playable_cut?.user_pass) failures.push(`${shotId}: v05 calibration cannot contain PASS`);
    const background = await readFile(path.join(cutRoot, 'background.png')).catch(() => null);
    if (!background || !validPng(background) || (template && sha256(background) !== sha256(template))) failures.push(`${shotId}: invalid fixed background.png`);
    for (const entry of [...(manifest.assets ?? []), ...(manifest.omni?.keyframes ?? []), ...(manifest.effects ?? [])]) {
      const file = path.resolve(cutRoot, entry.file);
      if (!inside(file, cutRoot) || !(await exists(file))) missing.push(`${shotId}:${entry.file}`);
      else if (path.extname(file).toLowerCase() === '.png' && !validPng(await readFile(file))) failures.push(`${shotId}: invalid PNG ${entry.file}`);
    }
    if (manifest.production_mode === 'omni') {
      if (manifest.omni?.video_status !== 'blocked_until_all_cuts_passed' || manifest.omni?.output !== null) failures.push(`${shotId}: Omni video must remain blocked with output=null`);
      const files = await readdir(path.join(cutRoot, 'omni')).catch(() => []);
      if (files.some((file) => /\.(?:mp4|webm|mov|m4v|mpeg|mpg)$/iu.test(file))) failures.push(`${shotId}: Omni video is forbidden before episode cut approval`);
    }
  }
} else failures.push(`missing candidate cuts root ${candidateRelative}`);

const uniqueMissing = [...new Set(missing)];
if (uniqueMissing.length) failures.push(`missing planned visual inputs: ${uniqueMissing.join(', ')}`);
if (failures.length) {
  console.error(JSON.stringify({ok: false, candidate_root: candidateRelative, failures, missing_inputs: uniqueMissing}, null, 2));
  process.exit(1);
}

const runtimeHash = await runtimeSha256(ROOT);
if (args.includes('--validate-only')) {
  console.log(JSON.stringify({ok: true, stage: state.stage, candidate_root: candidateRelative, validated: manifests.length, playable: playableShots.size, keyframe_gallery: galleryShots.size, runtime_sha256: runtimeHash, rendered: 0, user_approval_required: true}, null, 2));
  process.exit(0);
}

const outputRoot = path.resolve(ROOT, 'video/qa/style-calibration', path.basename(candidateRoot));
await mkdir(outputRoot, {recursive: true});
const catalog = spawnSync(process.execPath, [path.resolve(ROOT, 'video/scripts/build-style-calibration-catalog.mjs')], {cwd: ROOT, encoding: 'utf8', windowsHide: true});
if (catalog.status !== 0) throw new Error(catalog.stderr || catalog.stdout || 'style calibration catalog build failed');
const rendered = [];
for (const {shotId, cutRoot, manifest} of manifests.filter(({shotId}) => playableShots.has(shotId))) {
  const bundle = await manifestInputFingerprint(cutRoot, manifest);
  const finalBeat = manifest.visual_beats?.at(-1);
  const propsFile = await writeRenderProps({outputRoot, shotId, manifest, cutBasePath: publicCutBasePath(cutRoot), inputFingerprint: bundle, previewFrame: finalBeat?.reading_hold?.start_frame ?? manifest.lifecycle?.final_hold?.start_frame});
  const output = path.join(outputRoot, `${shotId}-remotion-motion-contact.png`);
  renderStill({composition: 'ManifestCutContactSheetProvisional', output, propsFile});
  const mobile = path.join(outputRoot, `${shotId}-mobile-360x203.png`);
  renderStill({entry: path.resolve(ROOT, 'video/src/production-index.tsx'), composition: `CalibrationMobile-${shotId}`, output: mobile, propsFile});
  const preview = path.join(outputRoot, `${shotId}-remotion-motion-provisional.mp4`);
  renderComposition({entry: path.resolve(ROOT, 'video/src/production-index.tsx'), composition: `Calibration-${shotId}`, output: preview});
  rendered.push({shot_id: shotId, review_profile: manifest.review_profile, file: path.basename(output), mobile_review: path.basename(mobile), full_duration_preview: path.basename(preview), review_bundle_sha256: bundle});
}
const gallery = [];
for (const {shotId, cutRoot, manifest} of manifests.filter(({shotId}) => galleryShots.has(shotId))) {
  const entry = manifest.omni.keyframes[0];
  const source = path.resolve(cutRoot, entry.file);
  const destination = path.join(outputRoot, `${shotId}-omni-keyframe-input.png`);
  await writeFile(destination, await readFile(source));
  gallery.push({shot_id: shotId, review_profile: manifest.review_profile, file: path.basename(destination), input_sha256: sha256(await readFile(source))});
}
const sections = [...rendered, ...gallery].map((item) => `<section><h2>${item.shot_id} · ${item.review_profile}</h2><code>${item.review_bundle_sha256 ?? item.input_sha256}</code>${item.full_duration_preview ? `<video src="${item.full_duration_preview}" controls style="display:block;width:min(100%,1200px);margin:12px 0"></video>` : ''}${item.mobile_review ? `<h3>모바일 360×203</h3><img class="mobile" src="${item.mobile_review}" alt="${item.shot_id} mobile review">` : ''}<h3>전체 프레임 증거</h3><img src="${item.file}" alt="${item.shot_id} ${item.review_profile}"></section>`).join('');
await writeFile(path.join(outputRoot, 'index.html'), `<!doctype html><meta charset="utf-8"><title>v06 presentation calibration</title><style>body{background:#211e1a;color:#fffaf0;font:16px Arial;margin:32px}img{display:block;width:min(100%,1200px);margin:12px 0 40px;border:1px solid #655d52}.mobile{width:360px;height:203px;image-rendering:auto}code{color:#d8c9aa}</style><h1>episode-001-v06 · inactive draft</h1><p>Message-first presentation contract. Machine QA checks structural and readability proxies only; it cannot prove semantic or artistic quality. No user PASS.</p>${sections}`);
console.log(JSON.stringify({ok: true, candidate_root: candidateRelative, runtime_sha256: runtimeHash, rendered, keyframe_gallery: gallery, output_root: path.relative(ROOT, outputRoot).replaceAll('\\', '/'), user_approval_required: true}, null, 2));
