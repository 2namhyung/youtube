import {createRequire} from 'node:module';
import {mkdir, readFile, readdir, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, renderStill as renderStillWithBrowser, selectComposition} from '@remotion/renderer';

import {buildAuthorityCatalog, normalize, ROOT, sha256Bytes, sha256File} from './render-authority-lib.mjs';
import {sharedElementTrajectory} from './shared-element-contract.mjs';

const sharp = createRequire(import.meta.url)('sharp');
const entry = path.resolve(ROOT, 'video/src/production-index.tsx');
const qaRoot = path.resolve(ROOT, 'video/qa/episode-001-work-v01');
const renderedRoot = path.join(qaRoot, 'rendered');
const identityRoot = path.join(qaRoot, 'identity');
const trajectoryRoot = path.join(qaRoot, 'trajectory');
const depthRoot = path.join(qaRoot, 'depth');
const treatmentRoot = path.join(qaRoot, 'treatment');

const run = (args, label) => {
  const result = spawnSync(process.execPath, args, {cwd: ROOT, encoding: 'utf8', windowsHide: true, env: {...process.env, REMOTION_DISABLE_NETWORK: '1'}});
  if (result.status !== 0) throw new Error(`${label} failed\n${result.stderr || result.stdout}`);
};
run([path.resolve(ROOT, 'video/scripts/validate-render-authority.mjs'), '--allow-missing-review'], 'render authority preflight');
const catalog = await buildAuthorityCatalog();
if (!catalog.compositions.length) throw new Error('Source-search draft has no renderable cuts. Select and materialize sources before rendering a review.');
await mkdir(renderedRoot, {recursive: true});
await mkdir(identityRoot, {recursive: true});
await mkdir(trajectoryRoot, {recursive: true});
await mkdir(depthRoot, {recursive: true});
await mkdir(treatmentRoot, {recursive: true});

const state = JSON.parse(await readFile(path.resolve(ROOT, 'video/episodes/episode-001/production-state.json'), 'utf8'));
const cutReviewProfiles = new Map(catalog.cuts.map((cut) => [cut.shot_id, cut.manifest.review_profile]));
const allReviewProfiles = [...new Set(catalog.cuts.map((cut) => cut.manifest.review_profile))].sort();
const artifactReviewProfiles = (compositionId, file) => {
  const composition = compositionId ? catalog.compositions.find((candidate) => candidate.composition_id === compositionId) : null;
  if (composition?.shot_id) return [cutReviewProfiles.get(composition.shot_id)];
  if (composition?.boundary_id) {
    const boundary = catalog.boundaries.find((candidate) => candidate.boundary_id === composition.boundary_id);
    return [...new Set([cutReviewProfiles.get(boundary?.outgoing_shot_id), cutReviewProfiles.get(boundary?.incoming_shot_id)].filter(Boolean))].sort();
  }
  const basename = path.basename(file);
  if (/SH00[3456]/u.test(basename)) return ['remotion-motion'];
  return allReviewProfiles;
};

const serveUrl = await bundle({entryPoint: entry, publicDir: path.resolve(ROOT, 'video/public'), onProgress: () => undefined});
const browser = await openBrowser('chrome', {chromeMode: 'headless-shell', logLevel: 'error'});
const compositions = new Map();
const getComposition = async (compositionId, inputProps) => {
  const cacheKey = `${compositionId}|${JSON.stringify(inputProps ?? null)}`;
  if (!compositions.has(cacheKey)) {
    compositions.set(cacheKey, await selectComposition({serveUrl, id: compositionId, inputProps, puppeteerInstance: browser, logLevel: 'error'}));
  }
  return compositions.get(cacheKey);
};
const renderVideo = async (compositionId, output) => renderMedia({
  serveUrl,
  composition: await getComposition(compositionId),
  codec: 'h264',
  outputLocation: output,
  puppeteerInstance: browser,
  overwrite: true,
  concurrency: 2,
  logLevel: 'error',
});
const renderStill = async (compositionId, frame, output, inputProps) => renderStillWithBrowser({
  serveUrl,
  composition: await getComposition(compositionId, inputProps),
  frame,
  output,
  imageFormat: 'png',
  puppeteerInstance: browser,
  overwrite: true,
  logLevel: 'error',
  inputProps,
});
const pixelIdentity = async (file) => {
  const {data, info} = await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  return {pixel_sha256: sha256Bytes(data), width: info.width, height: info.height, channels: info.channels};
};
const rasterDifference = async (beforeFile, afterFile, outputFile, maskFile = null) => {
  const [before, after, mask] = await Promise.all([
    sharp(beforeFile).ensureAlpha().raw().toBuffer({resolveWithObject: true}),
    sharp(afterFile).ensureAlpha().raw().toBuffer({resolveWithObject: true}),
    maskFile ? sharp(maskFile).greyscale().raw().toBuffer({resolveWithObject: true}) : null,
  ]);
  if (before.info.width !== after.info.width || before.info.height !== after.info.height) throw new Error('difference inputs have different dimensions');
  const pixels = before.info.width * before.info.height;
  const output = Buffer.alloc(pixels * 4);
  let changedPixels = 0;
  let maximumChannelDelta = 0;
  let maskPixels = 0;
  for (let index = 0; index < pixels; index += 1) {
    const included = !mask || mask.data[index] >= 250;
    if (included) maskPixels += 1;
    let delta = 0;
    for (let channel = 0; channel < 4; channel += 1) delta = Math.max(delta, Math.abs(before.data[index * 4 + channel] - after.data[index * 4 + channel]));
    if (included && delta > 0) changedPixels += 1;
    if (included) maximumChannelDelta = Math.max(maximumChannelDelta, delta);
    const amplified = included ? Math.min(255, delta * 18) : 0;
    output[index * 4] = amplified;
    output[index * 4 + 1] = included && delta === 0 ? 28 : 0;
    output[index * 4 + 2] = 0;
    output[index * 4 + 3] = 255;
  }
  await sharp(output, {raw: {width: before.info.width, height: before.info.height, channels: 4}}).png().toFile(outputFile);
  return {changed_pixels: changedPixels, compared_pixels: maskPixels, maximum_channel_delta: maximumChannelDelta};
};
const artifactBinding = async ({kind, compositionId = null, file}) => {
  const profiles = artifactReviewProfiles(compositionId, file);
  return {
    kind,
    composition_id: compositionId,
    ...(profiles.length === 1 ? {review_profile: profiles[0]} : {review_profiles: profiles}),
    path: normalize(path.relative(ROOT, file)),
    sha256: await sha256File(file),
    bytes: (await stat(file)).size,
    catalog_sha256: state.render_authority.catalog_sha256,
    scene_runtime_sha256: catalog.scene_runtime_sha256,
    transition_runtime_sha256: catalog.transition_runtime_sha256,
    manifest_set_sha256: catalog.manifest_set_sha256,
    asset_sheet_set_sha256: catalog.asset_sheet_set_sha256,
    treatment_contract_set_sha256: catalog.treatment_contract_set_sha256,
    render_input_set_sha256: catalog.render_input_set_sha256,
  };
};

const artifacts = [];
for (const composition of catalog.compositions) {
  const output = path.join(renderedRoot, `${composition.composition_id}.mp4`);
  await renderVideo(composition.composition_id, output);
  const record = await artifactBinding({kind: 'composition-video', compositionId: composition.composition_id, file: output});
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height,avg_frame_rate,nb_frames:format=duration', '-of', 'json', output], {cwd: ROOT, encoding: 'utf8', windowsHide: true});
  if (probe.status !== 0) throw new Error(`ffprobe failed: ${output}`);
  record.ffprobe = JSON.parse(probe.stdout);
  artifacts.push(record);
}

const sharedBoundaries = catalog.boundaries.filter((boundary) => boundary.transition.operator_id === 'scene.shared-element@1');
if (sharedBoundaries.length === 0) throw new Error('at least one shared-element boundary composition is required');
const sharedElementTrajectories = [];
for (const sharedBoundary of sharedBoundaries) {
  const sharedBoundaryComposition = catalog.compositions.find((composition) => composition.boundary_id === sharedBoundary.boundary_id);
  if (!sharedBoundaryComposition) throw new Error(`shared-element boundary composition is missing: ${sharedBoundary.boundary_id}`);
  const trajectoryStates = sharedElementTrajectory(sharedBoundary.transition, sharedBoundary.duration_frames);
  const trajectoryFrames = [];
  for (const stateAtFrame of trajectoryStates) {
    const file = path.join(trajectoryRoot, `${sharedBoundary.boundary_id}-F${stateAtFrame.frame}.png`);
    await renderStill(sharedBoundaryComposition.composition_id, stateAtFrame.frame, file);
    trajectoryFrames.push({...stateAtFrame, path: normalize(path.relative(ROOT, file)), file_sha256: await sha256File(file), ...await pixelIdentity(file)});
  }
  const outgoingCut = catalog.cuts.find((cut) => cut.shot_id === sharedBoundary.outgoing_shot_id);
  const incomingCut = catalog.cuts.find((cut) => cut.shot_id === sharedBoundary.incoming_shot_id);
  if (!outgoingCut || !incomingCut) throw new Error(`shared-element cut binding is missing: ${sharedBoundary.boundary_id}`);
  const trajectoryPayload = {
    schema_version: 1,
    status: 'provisional-review-only',
    boundary_id: sharedBoundary.boundary_id,
    operator_id: sharedBoundary.transition.operator_id,
    transition_contract_sha256: sharedBoundary.transition_contract_sha256,
    outgoing_manifest_sha256: outgoingCut.manifest_sha256,
    incoming_manifest_sha256: incomingCut.manifest_sha256,
    catalog_sha256: state.render_authority.catalog_sha256,
    scene_runtime_sha256: catalog.scene_runtime_sha256,
    transition_runtime_sha256: catalog.transition_runtime_sha256,
    asset_sheet_set_sha256: catalog.asset_sheet_set_sha256,
    mapping: sharedBoundary.transition.shared_element,
    samples: trajectoryFrames,
  };
  const trajectoryJson = path.join(trajectoryRoot, `${sharedBoundary.boundary_id}-shared-element-trajectory.json`);
  await writeFile(trajectoryJson, `${JSON.stringify(trajectoryPayload, null, 2)}\n`);
  artifacts.push(await artifactBinding({kind: 'shared-element-trajectory', compositionId: sharedBoundaryComposition.composition_id, file: trajectoryJson}));
  const trajectoryContact = path.join(trajectoryRoot, `${sharedBoundary.boundary_id}-shared-element-contact.png`);
  const trajectoryPanels = await Promise.all(trajectoryFrames.map(async (sample, index) => {
    const image = await sharp(path.resolve(ROOT, sample.path)).resize(640, 360).png().toBuffer();
    const label = Buffer.from(`<svg width="640" height="360" xmlns="http://www.w3.org/2000/svg"><rect x="18" y="16" width="190" height="48" rx="8" fill="#2b2722" fill-opacity=".88"/><text x="34" y="49" font-family="Arial" font-size="28" font-weight="700" fill="#fffaf0">${['START', 'MID', 'END'][index]} · F${sample.frame}</text></svg>`);
    return sharp(image).composite([{input: label, left: 0, top: 0}]).png().toBuffer();
  }));
  await sharp({create: {width: 1920, height: 360, channels: 4, background: '#f5f0e6'}}).composite(trajectoryPanels.map((input, index) => ({input, left: index * 640, top: 0}))).png().toFile(trajectoryContact);
  artifacts.push(await artifactBinding({kind: 'shared-element-contact', compositionId: sharedBoundaryComposition.composition_id, file: trajectoryContact}));
  sharedElementTrajectories.push({
    boundary_id: sharedBoundary.boundary_id,
    json_path: normalize(path.relative(ROOT, trajectoryJson)),
    json_sha256: await sha256File(trajectoryJson),
    contact_path: normalize(path.relative(ROOT, trajectoryContact)),
    contact_sha256: await sha256File(trajectoryContact),
    sample_frames: trajectoryFrames.map((sample) => sample.frame),
  });
}

const episodeComposition = catalog.compositions.find((composition) => composition.kind === 'episode');
const samplePlans = [
  ...catalog.cuts.map((cut) => {
    const composition = catalog.compositions.find((candidate) => candidate.shot_id === cut.shot_id);
    if (!composition) throw new Error(`missing cut composition for identity plan: ${cut.shot_id}`);
    return {scope: `${cut.shot_id}-cut-window`, composition: composition.composition_id, local: Math.min(composition.duration_frames - 1, cut.manifest.lifecycle?.final_hold?.start_frame ?? composition.duration_frames - 1)};
  }),
  ...catalog.boundaries.map((boundary) => {
    const composition = catalog.compositions.find((candidate) => candidate.boundary_id === boundary.boundary_id);
    if (!composition) throw new Error(`missing boundary composition for identity plan: ${boundary.boundary_id}`);
    return {scope: `${boundary.outgoing_shot_id}-${boundary.incoming_shot_id}-boundary-window`, composition: composition.composition_id, local: Math.floor(composition.duration_frames / 2)};
  }),
];
const identitySamples = [];
for (const plan of samplePlans) {
  const composition = catalog.compositions.find((candidate) => candidate.composition_id === plan.composition);
  if (!composition || !episodeComposition) throw new Error(`missing composition for identity sample ${plan.scope}`);
  const globalFrame = composition.window_start_frame + plan.local;
  const timelineFile = path.join(identityRoot, `${plan.scope}-timeline-G${globalFrame}.png`);
  const derivedFile = path.join(identityRoot, `${plan.scope}-derived-F${plan.local}.png`);
  await renderStill(episodeComposition.composition_id, globalFrame, timelineFile);
  await renderStill(composition.composition_id, plan.local, derivedFile);
  const [timelinePixel, derivedPixel] = await Promise.all([pixelIdentity(timelineFile), pixelIdentity(derivedFile)]);
  if (timelinePixel.pixel_sha256 !== derivedPixel.pixel_sha256) throw new Error(`pixel identity failed: ${plan.scope}`);
  identitySamples.push({
    scope: plan.scope,
    global_frame: globalFrame,
    derived_composition_id: composition.composition_id,
    derived_frame: plan.local,
    timeline: {path: normalize(path.relative(ROOT, timelineFile)), file_sha256: await sha256File(timelineFile), ...timelinePixel},
    derived: {path: normalize(path.relative(ROOT, derivedFile)), file_sha256: await sha256File(derivedFile), ...derivedPixel},
  });
}

const sh003Composition = catalog.compositions.find((composition) => composition.composition_id === 'EP001-Cut-SH003-Provisional');
const historicalRoot = path.resolve(ROOT, 'video/qa/style-calibration/episode-001-sh003-assembly-set-v08/rendered');
const historicalFrames = new Map([0, 98, 198, 238].map((frame) => [frame, path.join(historicalRoot, `SH003-manifest-v08-frame-${frame}.png`)]));
const oldInputRoot = path.resolve(ROOT, 'video/public/assets/style-calibration/episode-001-sh003-assembly-set-v08/cuts/SH003');
const newInputRoot = path.resolve(ROOT, 'video/public/assets/episode-001-work-v01/cuts/SH003');
const walk = async (root, at = root) => (await readdir(at, {withFileTypes: true})).flatMap((entry) => entry.isDirectory() ? [] : [normalize(path.relative(root, path.join(at, entry.name)))]).concat(...await Promise.all((await readdir(at, {withFileTypes: true})).filter((entry) => entry.isDirectory()).map((entry) => walk(root, path.join(at, entry.name)))));
const visualInputs = (await walk(oldInputRoot)).filter((relative) => relative !== 'manifest.json').sort();
const inputIdentity = [];
for (const relative of visualInputs) {
  const oldSha = await sha256File(path.join(oldInputRoot, relative));
  const newSha = await sha256File(path.join(newInputRoot, relative));
  if (oldSha !== newSha) throw new Error(`SH003 copied input differs: ${relative}`);
  inputIdentity.push({path: relative, historical_sha256: oldSha, work_sha256: newSha, equal: true});
}
const historicalPixelComparison = [];
for (const [frame, historicalFile] of historicalFrames) {
  const newFile = path.join(identityRoot, `SH003-carry-forward-F${frame}.png`);
  await renderStill(sh003Composition.composition_id, frame, newFile);
  const [historical, current] = await Promise.all([pixelIdentity(historicalFile), pixelIdentity(newFile)]);
  historicalPixelComparison.push({
    frame,
    historical_path: normalize(path.relative(ROOT, historicalFile)),
    current_path: normalize(path.relative(ROOT, newFile)),
    historical_pixel_sha256: historical.pixel_sha256,
    new_pixel_sha256: current.pixel_sha256,
    input_bundle_equal: true,
    pixel_equal: historical.pixel_sha256 === current.pixel_sha256,
    status: 'superseded-by-asset-sheet-runtime-new-candidate-pending',
  });
}

const depthSamples = [];
for (const cut of catalog.cuts) {
  const shotId = cut.shot_id;
  const composition = catalog.compositions.find((candidate) => candidate.shot_id === shotId);
  const localFrame = Math.min(cut.duration_frames - 1, cut.manifest.lifecycle?.final_hold?.start_frame ?? cut.duration_frames - 1);
  if (!composition) throw new Error(`missing cut composition for depth QA: ${shotId}`);
  const normal = path.join(depthRoot, `${shotId}-final-reading-frame.png`);
  const depth = path.join(depthRoot, `${shotId}-depth-occlusion-map.png`);
  await renderStill(composition.composition_id, localFrame, normal);
  await renderStill(composition.composition_id, localFrame, depth, {windowStartFrame: composition.window_start_frame, debugVisualization: 'depth-occlusion'});
  const depthArtifact = await artifactBinding({kind: 'depth-occlusion-map', compositionId: composition.composition_id, file: depth});
  artifacts.push(depthArtifact);
  const mobile = path.join(renderedRoot, `${shotId}-mobile-360x203.png`);
  await sharp(normal).resize(360, 203, {fit: 'fill'}).png().toFile(mobile);
  artifacts.push(await artifactBinding({kind: 'mobile-preview', file: mobile}));
  const cutContactFrames = [...new Set([0, ...(cut.manifest.visual_beats ?? []).map((beat) => beat.reading_hold?.start_frame).filter(Number.isInteger), cut.duration_frames - 1])].slice(0, 6);
  const cutContactPanels = [];
  for (const frame of cutContactFrames) {
    const frameFile = path.join(renderedRoot, `${shotId}-contact-F${frame}.png`);
    await renderStill(composition.composition_id, frame, frameFile);
    const image = await sharp(frameFile).resize(640, 360).png().toBuffer();
    const label = Buffer.from(`<svg width="640" height="360" xmlns="http://www.w3.org/2000/svg"><rect x="18" y="16" width="150" height="46" rx="8" fill="#211f1d" fill-opacity=".9"/><text x="32" y="48" font-family="Arial" font-size="25" font-weight="700" fill="#fffaf0">${shotId} · F${frame}</text></svg>`);
    cutContactPanels.push(await sharp(image).composite([{input: label, left: 0, top: 0}]).png().toBuffer());
  }
  const cutContact = path.join(renderedRoot, `${shotId}-full-cut-contact.png`);
  await sharp({create: {width: 1920, height: 1080, channels: 4, background: '#f5f0e6'}}).composite(cutContactPanels.map((input, index) => ({input, left: (index % 3) * 640, top: Math.floor(index / 3) * 540 + 90}))).png().toFile(cutContact);
  const cutContactArtifact = await artifactBinding({kind: 'cut-contact-sheet', compositionId: composition.composition_id, file: cutContact});
  artifacts.push(cutContactArtifact);
  let mobileReadingContact = null;
  let backgroundOnlyArtifact = null;
  if (shotId === 'SH006') {
    const frameZero = path.join(renderedRoot, 'SH006-background-only-F0.png');
    await renderStill(composition.composition_id, 0, frameZero, {windowStartFrame: composition.window_start_frame, suppressBoundaries: true});
    const backgroundFile = path.resolve(ROOT, 'video/public', cut.cut_base_path, cut.manifest.background);
    const [renderedBackground, sourceBackground] = await Promise.all([pixelIdentity(frameZero), pixelIdentity(backgroundFile)]);
    if (renderedBackground.pixel_sha256 !== sourceBackground.pixel_sha256) throw new Error('SH006 F0 must be pixel-identical to the fixed beige background');
    backgroundOnlyArtifact = await artifactBinding({kind: 'background-only-proof', compositionId: composition.composition_id, file: frameZero});
    artifacts.push(backgroundOnlyArtifact);
    const mobileFrames = [
      {frame: 285, label: 'B02 · 시행 전 조문'},
      {frame: 405, label: 'B03 · 삭제 문장'},
      {frame: 555, label: 'B04 · 남는 직무'},
    ];
    const mobilePanels = [];
    for (const sample of mobileFrames) {
      const sourceFrame = path.join(renderedRoot, `SH006-mobile-reading-F${sample.frame}.png`);
      await renderStill(composition.composition_id, sample.frame, sourceFrame);
      const image = await sharp(sourceFrame).resize(360, 203, {fit: 'fill'}).png().toBuffer();
      const label = Buffer.from(`<svg width="360" height="203" xmlns="http://www.w3.org/2000/svg"><rect x="168" y="169" width="184" height="26" rx="5" fill="#211f1d" fill-opacity=".86"/><text x="176" y="187" font-family="Arial" font-size="14" font-weight="700" fill="#fffaf0">${sample.label}</text></svg>`);
      mobilePanels.push(await sharp(image).composite([{input: label, left: 0, top: 0}]).png().toBuffer());
    }
    const mobileReadingFile = path.join(renderedRoot, 'SH006-mobile-reading-contact.png');
    await sharp({create: {width: 1080, height: 203, channels: 4, background: '#f5f0e6'}}).composite(mobilePanels.map((input, index) => ({input, left: index * 360, top: 0}))).png().toFile(mobileReadingFile);
    mobileReadingContact = await artifactBinding({kind: 'mobile-reading-contact', compositionId: composition.composition_id, file: mobileReadingFile});
    artifacts.push(mobileReadingContact);
  }
  depthSamples.push({shot_id: shotId, frame: localFrame, asset_sheet_path: cut.asset_sheet_path, asset_sheet_sha256: cut.asset_sheet_sha256, depth_map_path: depthArtifact.path, depth_map_sha256: depthArtifact.sha256, mobile_path: normalize(path.relative(ROOT, mobile)), mobile_sha256: await sha256File(mobile), cut_contact_path: cutContactArtifact.path, cut_contact_sha256: cutContactArtifact.sha256, cut_contact_frames: cutContactFrames,
    ...(mobileReadingContact ? {mobile_reading_contact_path: mobileReadingContact.path, mobile_reading_contact_sha256: mobileReadingContact.sha256} : {}),
    ...(backgroundOnlyArtifact ? {background_only_path: backgroundOnlyArtifact.path, background_only_sha256: backgroundOnlyArtifact.sha256} : {})});
}
const contact = path.join(renderedRoot, 'EP001-authority-contact.png');
const contactInputs = identitySamples.map((sample) => path.resolve(ROOT, sample.derived.path));
const thumbs = await Promise.all(contactInputs.map((file) => sharp(file).resize(640, 360).png().toBuffer()));
await sharp({create: {width: 1920, height: 1080, channels: 4, background: '#f5f0e6'}}).composite(thumbs.map((input, index) => ({input, left: (index % 3) * 640, top: Math.floor(index / 3) * 540 + 90}))).png().toFile(contact);
artifacts.push(await artifactBinding({kind: 'contact-sheet', file: contact}));
const depthContact = path.join(depthRoot, 'EP001-depth-occlusion-contact.png');
const depthPanels = await Promise.all(depthSamples.map(async (sample) => {
  const image = await sharp(path.resolve(ROOT, sample.depth_map_path)).resize(640, 360).png().toBuffer();
  const label = Buffer.from(`<svg width="640" height="360" xmlns="http://www.w3.org/2000/svg"><rect x="18" y="16" width="300" height="46" rx="8" fill="#211f1d" fill-opacity=".9"/><text x="32" y="48" font-family="Arial" font-size="25" font-weight="700" fill="#fffaf0">${sample.shot_id} · DEPTH/OCCLUSION</text></svg>`);
  return sharp(image).composite([{input: label, left: 0, top: 0}]).png().toBuffer();
}));
await sharp({create: {width: 1920, height: 1080, channels: 4, background: '#f5f0e6'}}).composite(depthPanels.map((input, index) => ({input, left: (index % 3) * 640, top: Math.floor(index / 3) * 540 + 90}))).png().toFile(depthContact);
artifacts.push(await artifactBinding({kind: 'depth-occlusion-contact', file: depthContact}));

// Selective treatment A/B: same timeline authority, input-prop switch only (no new Studio composition).
const treatmentFrame = 250;
const sh003Cut = catalog.cuts.find((cut) => cut.shot_id === 'SH003');
if (!sh003Cut || !sh003Composition) throw new Error('SH003 treatment QA requires the current cut composition');
const treatmentBaseProps = {windowStartFrame: sh003Composition.window_start_frame};
const treatmentDisabled = path.join(treatmentRoot, `SH003-no-treatment-F${treatmentFrame}.png`);
const treatmentEnabled = path.join(treatmentRoot, `SH003-treatment-F${treatmentFrame}.png`);
await renderStill(sh003Composition.composition_id, treatmentFrame, treatmentDisabled, {...treatmentBaseProps, treatmentMode: 'disabled'});
await renderStill(sh003Composition.composition_id, treatmentFrame, treatmentEnabled, {...treatmentBaseProps, treatmentMode: 'enabled'});
const treatmentDifference = path.join(treatmentRoot, `SH003-treatment-difference-F${treatmentFrame}.png`);
const treatmentDifferenceMetrics = await rasterDifference(treatmentDisabled, treatmentEnabled, treatmentDifference);
if (treatmentDifferenceMetrics.changed_pixels === 0) throw new Error('grain.overlay@1 produced no observable SH003 pixel change');

const treatmentDisabledMobile = path.join(treatmentRoot, `SH003-no-treatment-mobile-360x203-F${treatmentFrame}.png`);
const treatmentEnabledMobile = path.join(treatmentRoot, `SH003-treatment-mobile-360x203-F${treatmentFrame}.png`);
await Promise.all([
  sharp(treatmentDisabled).resize(360, 203, {fit: 'fill'}).png().toFile(treatmentDisabledMobile),
  sharp(treatmentEnabled).resize(360, 203, {fit: 'fill'}).png().toFile(treatmentEnabledMobile),
]);
const mobileDifference = path.join(treatmentRoot, `SH003-treatment-mobile-difference-360x203-F${treatmentFrame}.png`);
const mobileDifferenceMetrics = await rasterDifference(treatmentDisabledMobile, treatmentEnabledMobile, mobileDifference);
if (mobileDifferenceMetrics.changed_pixels === 0) throw new Error('grain.overlay@1 is not observable at 360x203');

const protectedLayers = sh003Cut.asset_sheet.layers.filter((layer) => layer.treatment.mode === 'protected-alpha-core');
const protectedMaskInputs = [];
for (const layer of protectedLayers) {
  const component = sh003Cut.manifest.visual_components.find((candidate) => candidate.component_id === layer.component_id);
  const asset = sh003Cut.manifest.assets.find((candidate) => candidate.asset_id === layer.asset_id);
  if (!component?.layout || !asset) throw new Error(`protected treatment layer lacks asset/layout: ${layer.component_id}`);
  const alphaCore = await sharp(path.resolve(ROOT, sh003Cut.cut_base_path.replace(/^assets\//u, 'video/public/assets/'), asset.file))
    .ensureAlpha()
    .resize(component.layout.width, component.layout.height, {fit: 'contain', background: {r: 0, g: 0, b: 0, alpha: 0}})
    .extractChannel(3)
    .threshold(249)
    .png()
    .toBuffer();
  protectedMaskInputs.push({input: alphaCore, left: component.layout.left, top: component.layout.top, blend: 'screen'});
}
const protectedMask = path.join(treatmentRoot, `SH003-protected-alpha-core-mask-F${treatmentFrame}.png`);
await sharp({create: {width: 1920, height: 1080, channels: 3, background: {r: 0, g: 0, b: 0}}}).composite(protectedMaskInputs).png().toFile(protectedMask);

const protectedDisabled = path.join(treatmentRoot, `SH003-protected-isolation-no-treatment-F${treatmentFrame}.png`);
const protectedEnabled = path.join(treatmentRoot, `SH003-protected-isolation-treatment-F${treatmentFrame}.png`);
const protectedProps = {...treatmentBaseProps, treatmentProtectionIsolation: true};
await renderStill(sh003Composition.composition_id, treatmentFrame, protectedDisabled, {...protectedProps, treatmentMode: 'disabled'});
await renderStill(sh003Composition.composition_id, treatmentFrame, protectedEnabled, {...protectedProps, treatmentMode: 'enabled'});
const protectedDifference = path.join(treatmentRoot, `SH003-protected-alpha-core-difference-F${treatmentFrame}.png`);
const protectedDifferenceMetrics = await rasterDifference(protectedDisabled, protectedEnabled, protectedDifference, protectedMask);
if (protectedDifferenceMetrics.compared_pixels === 0 || protectedDifferenceMetrics.changed_pixels !== 0) throw new Error('protected alpha-core pixels changed under treatment A/B');
const [protectedDisabledPixels, protectedEnabledPixels] = await Promise.all([pixelIdentity(protectedDisabled), pixelIdentity(protectedEnabled)]);
if (protectedDisabledPixels.pixel_sha256 !== protectedEnabledPixels.pixel_sha256) throw new Error('protected components/system chrome changed in isolation A/B');

const treatmentContact = path.join(treatmentRoot, 'SH003-treatment-ab-contact.png');
const treatmentContactSources = [treatmentDisabled, treatmentEnabled, treatmentDifference, protectedEnabled];
const treatmentContactLabels = ['NO TREATMENT', 'GRAIN 0.035', 'DIFF ×18', 'PROTECTED ISOLATION'];
const treatmentPanels = await Promise.all(treatmentContactSources.map(async (file, index) => {
  const image = await sharp(file).resize(960, 540, {fit: 'fill'}).png().toBuffer();
  const label = Buffer.from(`<svg width="960" height="540" xmlns="http://www.w3.org/2000/svg"><rect x="24" y="22" width="390" height="54" rx="8" fill="#211f1d" fill-opacity=".9"/><text x="42" y="59" font-family="Arial" font-size="31" font-weight="700" fill="#fffaf0">${treatmentContactLabels[index]}</text></svg>`);
  return sharp(image).composite([{input: label, left: 0, top: 0}]).png().toBuffer();
}));
await sharp({create: {width: 1920, height: 1080, channels: 4, background: '#f5f0e6'}}).composite(treatmentPanels.map((input, index) => ({input, left: (index % 2) * 960, top: Math.floor(index / 2) * 540}))).png().toFile(treatmentContact);

const treatmentArtifacts = [];
for (const [kind, file] of [
  ['treatment-ab-before', treatmentDisabled], ['treatment-ab-after', treatmentEnabled], ['treatment-ab-difference', treatmentDifference],
  ['treatment-ab-before-mobile', treatmentDisabledMobile], ['treatment-ab-after-mobile', treatmentEnabledMobile], ['treatment-ab-difference-mobile', mobileDifference],
  ['treatment-protected-alpha-core-mask', protectedMask], ['treatment-protected-isolation-before', protectedDisabled], ['treatment-protected-isolation-after', protectedEnabled],
  ['treatment-protected-alpha-core-difference', protectedDifference], ['treatment-ab-contact', treatmentContact],
]) {
  const record = await artifactBinding({kind, compositionId: sh003Composition.composition_id, file});
  treatmentArtifacts.push(record);
  artifacts.push(record);
}
const treatmentQa = {
  status: 'machine-generated-provisional-qc-not-user-pass',
  shot_id: 'SH003',
  frame: treatmentFrame,
  operator_id: 'grain.overlay@1',
  treatment_contract_set_sha256: catalog.treatment_contract_set_sha256,
  manifest_sha256: sh003Cut.manifest_sha256,
  asset_sheet_sha256: sh003Cut.asset_sheet_sha256,
  treatments: sh003Cut.manifest.treatments,
  protected_component_ids: protectedLayers.map((layer) => layer.component_id),
  protected_system_ids: sh003Cut.asset_sheet.system_layers.map((layer) => layer.system_id),
  normal_difference: treatmentDifferenceMetrics,
  mobile_difference: mobileDifferenceMetrics,
  protected_alpha_core_difference: protectedDifferenceMetrics,
  protected_isolation_pixel_identity: protectedDisabledPixels.pixel_sha256,
  artifacts: treatmentArtifacts.map((artifact) => ({kind: artifact.kind, path: artifact.path, sha256: artifact.sha256})),
};

const ledger = {
  schema_version: 1,
  episode_id: catalog.episode_id,
  status: 'provisional-review-only',
  review_profiles: allReviewProfiles,
  authority_root: catalog.authority_root,
  bindings: {
    catalog_path: state.render_authority.catalog,
    catalog_sha256: state.render_authority.catalog_sha256,
    manifest_set_sha256: catalog.manifest_set_sha256,
    scene_runtime_sha256: catalog.scene_runtime_sha256,
    transition_runtime_sha256: catalog.transition_runtime_sha256,
    asset_sheet_schema_path: catalog.asset_sheet_schema.path,
    asset_sheet_schema_sha256: catalog.asset_sheet_schema.sha256,
    asset_sheet_set_sha256: catalog.asset_sheet_set_sha256,
    treatment_contract_set_sha256: catalog.treatment_contract_set_sha256,
    render_input_set_sha256: catalog.render_input_set_sha256,
  },
  cuts: catalog.cuts.map((cut) => ({shot_id: cut.shot_id, review_profile: cut.manifest.review_profile, manifest_path: cut.manifest_path, manifest_sha256: cut.manifest_sha256, asset_bundle_sha256: cut.asset_bundle_sha256, asset_sheet_path: cut.asset_sheet_path, asset_sheet_sha256: cut.asset_sheet_sha256})),
  boundaries: catalog.boundaries.map((boundary) => ({
    boundary_id: boundary.boundary_id,
    outgoing_manifest_sha256: catalog.cuts.find((cut) => cut.shot_id === boundary.outgoing_shot_id).manifest_sha256,
    incoming_manifest_sha256: catalog.cuts.find((cut) => cut.shot_id === boundary.incoming_shot_id).manifest_sha256,
    transition_contract_sha256: boundary.transition_contract_sha256,
    operator_id: boundary.transition.operator_id,
  })),
  artifacts,
  identity_samples: identitySamples,
  migration_identity: {historical_candidate: 'episode-001-sh003-assembly-set-v08', visual_inputs: inputIdentity},
  historical_pixel_comparison: historicalPixelComparison,
  candidate_note: 'The previously accepted visual direction was not production PASS. Asset-sheet runtime creates a new provisional candidate and remains pending user review.',
  depth_occlusion_qa: {
    status: 'machine-generated-provisional-qc-not-user-pass',
    asset_sheet_set_sha256: catalog.asset_sheet_set_sha256,
    samples: depthSamples,
    contact_path: normalize(path.relative(ROOT, depthContact)),
    contact_sha256: await sha256File(depthContact),
  },
  selective_treatment_qa: treatmentQa,
  shared_element_trajectories: sharedElementTrajectories,
  shared_element_trajectory: sharedElementTrajectories[0],
  approvals: {user_pass: false, omni_unlocked: false, rights_approved: false},
};
const sh006Artifacts = artifacts.filter((artifact) => artifact.composition_id === 'EP001-Cut-SH006-Provisional' || /SH006/u.test(path.basename(artifact.path)));
if (!sh006Artifacts.length || sh006Artifacts.some((artifact) => artifact.review_profile !== 'remotion-motion')) throw new Error('SH006 review artifacts must declare remotion-motion');
const remotionCutArtifacts = artifacts.filter((artifact) => /EP001-Cut-SH00[3456]-Provisional/u.test(artifact.composition_id ?? '') || /SH00[3456]/u.test(path.basename(artifact.path)));
if (!remotionCutArtifacts.length || remotionCutArtifacts.some((artifact) => artifact.review_profile !== 'remotion-motion')) throw new Error('Remotion cut artifacts must retain remotion-motion');
const ledgerPath = path.join(qaRoot, 'review-ledger.json');
await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
await browser.close({silent: true});
run([path.resolve(ROOT, 'video/scripts/validate-render-authority.mjs')], 'render authority postflight');
console.log(JSON.stringify({ok: true, ledger: normalize(path.relative(ROOT, ledgerPath)), artifacts: artifacts.map((artifact) => ({kind: artifact.kind, composition_id: artifact.composition_id, path: artifact.path, sha256: artifact.sha256})), identity_samples: identitySamples.map((sample) => ({scope: sample.scope, pixel_sha256: sample.timeline.pixel_sha256})), depth_samples: depthSamples.map((sample) => ({shot_id: sample.shot_id, depth_map_path: sample.depth_map_path, depth_map_sha256: sample.depth_map_sha256}))}, null, 2));
