import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {validateSemanticFidelity} from './semantic-fidelity-contract.mjs';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const rootPath = path.join(root, 'video', 'qa', 'style-frames', 'remotion-motion-grammar-v02-sample-cuts');
const sourcePath = path.join(root, 'video', 'src', 'remotion-motion-grammar-v02-sample-cuts.tsx');
const catalog = JSON.parse(await readFile(path.join(rootPath, 'catalog.json'), 'utf8'));
const source = await readFile(sourcePath, 'utf8');
const failures = [];
const EXPECTED_ROUTE_POINTS = [[910,500],[940,505],[970,505],[1000,495],[1030,500],[1050,520],[1085,520],[1115,505],[1135,520],[1155,540],[1170,510],[1200,495],[1235,485],[1260,475],[1295,480],[1320,492]];
const EXPECTED_ROUTE_D = `M ${EXPECTED_ROUTE_POINTS.map(([x,y]) => `${x} ${y}`).join(' L ')}`;
const EXPECTED_SCALE = {earth_diameter_km:12742,moon_diameter_km:3475,average_distance_km:384400,earth_diameter_px:620};
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const absolute = (relative) => path.resolve(root, relative);
const hashPath = async (relative, expected, label) => {
  try { const actual = sha(await readFile(absolute(relative))); if (actual !== expected) failures.push(`${label}: stale hash`); } catch { failures.push(`${label}: missing file`); }
};
const decodedFrameHash = (video, frame) => {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-i', video, '-vf', `select=eq(n\\,${frame})`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], {encoding: null, maxBuffer: 1920 * 1080 * 4 * 2});
  if (result.status !== 0 || result.error || result.stdout.length !== 1920 * 1080 * 4) return null;
  return sha(result.stdout);
};
const checkOutputEntries = async (value, label) => {
  if (!value || typeof value !== 'object') return;
  if (typeof value.path === 'string' && typeof value.sha256 === 'string') await hashPath(value.path, value.sha256, label);
  for (const [key, child] of Object.entries(value)) if (child && typeof child === 'object') await checkOutputEntries(child, `${label}.${key}`);
};
const alphaBounds = async (filePath) => {
  const {data,info}=await sharp(filePath).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let minX=info.width,minY=info.height,maxX=-1,maxY=-1;
  for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) if(data[(y*info.width+x)*4+3]>0){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  return {x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1};
};
const sourceManifest = JSON.parse(await readFile(absolute(catalog.source_manifest), 'utf8'));
const sourceRecords = new Map();
const seenSourcePaths = new Map();
for (const record of sourceManifest.records ?? []) {
  if (!record.source_id || sourceRecords.has(record.source_id)) failures.push(`source manifest: duplicate or blank source_id ${record.source_id ?? ''}`);
  sourceRecords.set(record.source_id, record);
  if (!record.path || record.path.includes('calibration-source-plates.svg')) failures.push(`${record.source_id}: invalid or generic source path`);
  if (seenSourcePaths.has(record.path) && seenSourcePaths.get(record.path) !== record.source_id) failures.push(`${record.source_id}: unrelated source IDs share source bytes with ${seenSourcePaths.get(record.path)}`);
  seenSourcePaths.set(record.path, record.source_id);
  await hashPath(record.path, record.sha256, `source:${record.source_id}`);
  try {
    const bytes = await readFile(absolute(record.path));
    if (bytes.length !== record.bytes) failures.push(`${record.source_id}: source byte length mismatch`);
    if (/\.(png|jpe?g)$/i.test(record.path)) {
      const metadata = await sharp(bytes).metadata();
      if (metadata.width !== record.width || metadata.height !== record.height) failures.push(`${record.source_id}: source image dimensions mismatch`);
    }
  } catch { failures.push(`${record.source_id}: source file is missing or undecodable`); }
}
if (sourceRecords.size < 10) failures.push('source manifest: insufficient independently preserved source records');
const derivedFiles = new Map();
for (const derived of sourceManifest.derived_files ?? []) {
  derivedFiles.set(derived.path, derived);
  await hashPath(derived.path, derived.sha256, `derived:${derived.path}`);
  try { const metadata=await sharp(absolute(derived.path)).metadata(); if(metadata.width!==derived.width||metadata.height!==derived.height) failures.push(`${derived.path}: derived raster dimensions mismatch`); } catch { failures.push(`${derived.path}: derived raster undecodable`); }
}
await hashPath(catalog.review_board.path, catalog.review_board.sha256, 'review-board');
for (const sample of catalog.samples) {
  const manifest = JSON.parse(await readFile(path.join(rootPath, sample.sample_id, 'manifest.json'), 'utf8'));
  failures.push(...validateSemanticFidelity(sample.sample_id, manifest, source));
  const flags = ['production_visible', 'production_eligible', 'user_reference_calibration_pass', 'user_cut_pass', 'rights_approved', 'omni_video_approved', 'parity_approved', 'grammar_promoted'];
  if (flags.some((flag) => manifest[flag] !== false)) failures.push(`${sample.sample_id}: inactive flags must remain false`);
  if (manifest.active_cut_root !== null && manifest.active_cut_root !== undefined) failures.push(`${sample.sample_id}: active_cut_root must be null`);
  if (String(manifest.scope).includes('design-only')) failures.push(`${sample.sample_id}: stale design-only scope`);
  if (manifest.frame_plan?.reading_hold?.start !== 180 || manifest.frame_plan?.reading_hold?.end !== 299 || manifest.frame_plan?.states?.at(-1)?.name !== 'stable-reading-hold') failures.push(`${sample.sample_id}: final hold timing is not F180-F299`);
  if (sample.status === 'blocked-missing-real-input') {
    if (sample.outputs.length !== 0 || !manifest.reason) failures.push(`${sample.sample_id}: blocked sample must have reason and no outputs`);
    continue;
  }
  const visible = new Set(manifest.visible_asset_ids ?? []);
  const manifestAssetIds = manifest.assets.filter((asset) => asset.asset_class !== 'background').map((asset) => asset.asset_id);
  if (JSON.stringify([...visible].sort()) !== JSON.stringify(manifestAssetIds.sort())) failures.push(`${sample.sample_id}: manifest visible asset list mismatch`);
  if (sample.sample_id === 'sample-02-numeric-step-progression') {
    const expectedTemporalStates = [
      ['s02-cpi-299-170', 0, 64],
      ['s02-cpi-305-109', 65, 119],
      ['s02-cpi-306-746', 120, 299],
    ];
    const bindings = manifest.asset_bindings ?? [];
    if (bindings.length !== expectedTemporalStates.length) failures.push('sample-02: all temporal focal states must be bound');
    for (const [assetId, start, end] of expectedTemporalStates) {
      const binding = bindings.find((item) => item.asset_id === assetId);
      if (!binding || binding.role !== 'temporal-dominant-focal' || binding.stateful_focal_id !== 'cpi-2023' || binding.frame_range?.start !== start || binding.frame_range?.end !== end) failures.push(`sample-02:${assetId}: temporal focal binding does not match runtime range`);
    }
    if (!source.includes('s02-cpi-299-170') || !source.includes('s02-cpi-305-109') || !source.includes('s02-cpi-306-746')) failures.push('sample-02: runtime temporal focal states are not source-locked');
  }
  for (const asset of manifest.assets) {
    await hashPath(asset.path, asset.sha256, `${sample.sample_id}:${asset.asset_id}`);
    if (!source.includes(asset.asset_id)) failures.push(`${sample.sample_id}:${asset.asset_id}: runtime binding not found`);
    if (asset.asset_class !== 'background') {
      const allowedDeterministicSvg = /\.svg$/i.test(asset.path) && asset.origin === 'deterministic-editorial' && asset.deterministic === true && asset.explanatory_overlay === true && ['route','measurement'].includes(asset.asset_class);
      if (/\.svg$/i.test(asset.path) && !allowedDeterministicSvg) failures.push(`${sample.sample_id}:${asset.asset_id}: generic SVG focal asset is forbidden`);
      const record = sourceRecords.get(asset.source_id);
      if (!record) failures.push(`${sample.sample_id}:${asset.asset_id}: source_id is absent from source manifest`);
      else {
        if (asset.source_path !== record.path || asset.source_sha256 !== record.sha256 || asset.source_url !== record.source_url) failures.push(`${sample.sample_id}:${asset.asset_id}: source path/hash/URL binding mismatch`);
        try { const metadata = await sharp(absolute(asset.path)).metadata(); if (metadata.width !== asset.width || metadata.height !== asset.height) failures.push(`${sample.sample_id}:${asset.asset_id}: asset dimensions mismatch`); } catch { failures.push(`${sample.sample_id}:${asset.asset_id}: asset undecodable`); }
      }
    }
  }
  if (sample.sample_id === 'sample-04-map-route-reframe') {
    const route = manifest.assets.find((asset) => asset.asset_id === 's04-route-overlay');
    const binding = manifest.route_geometry_binding;
    if (!route || route.asset_class !== 'route' || route.origin !== 'deterministic-editorial' || route.deterministic !== true || route.explanatory_overlay !== true) failures.push('sample-04: route overlay must be a deterministic editorial explanatory asset');
    if (!manifest.visible_asset_ids.includes('s04-route-overlay') || !manifest.asset_bindings.some((item) => item.asset_id === 's04-route-overlay' && item.role === 'supporting')) failures.push('sample-04: route overlay is not a visible supporting asset');
    if (!source.includes("s04-route-overlay.svg") || !source.includes("'s04-route-overlay'")) failures.push('sample-04: runtime route target is missing');
    const camera=manifest.camera_reframe_binding, layout=manifest.map_label_layout_binding;
    if (!camera || camera.operator !== 'camera.transform' || camera.start_frame !== 20 || camera.end_frame !== 82 || camera.start_scale !== 1 || camera.end_scale !== 1.12 || camera.end_scale <= camera.start_scale || camera.direction !== 'zoom-in' || JSON.stringify(camera.shared_transform_asset_ids) !== JSON.stringify(['s04-nps-south-river-map','s04-route-overlay']) || !source.includes('scale(${1+0.12*reframe})')) failures.push('sample-04: camera reframe must be a runtime-bound zoom-in shared by map and route');
    if (!layout || layout.map_frame_bbox?.bottom !== 965 || layout.label_bbox?.top !== 1005 || layout.vertical_gap_px !== layout.label_bbox?.top-layout.map_frame_bbox?.bottom || layout.vertical_gap_px < 32 || layout.vertical_gap_px > 72 || layout.label_bbox?.bottom > 1080 || layout.placement !== 'below-target' || !source.includes("label('SOUTH RIVER FALLS TRAIL', 685, 1005, 550)")) failures.push('sample-04: map asset-label gap/layout contract is invalid');
    if (!binding || binding.overlay_asset_id !== 's04-route-overlay' || binding.base_map_asset_id !== 's04-nps-south-river-map' || binding.source_id !== 'NPS-SOUTH-RIVER-2025' || binding.trail_name !== 'South River Falls Trail' || binding.coordinate_space !== 'source-raster-pixels') failures.push('sample-04: source geometry binding is incomplete');
    if (JSON.stringify(binding?.path_points) !== JSON.stringify(EXPECTED_ROUTE_POINTS) || binding?.path_d !== EXPECTED_ROUTE_D || JSON.stringify(route?.geometry?.path_points) !== JSON.stringify(EXPECTED_ROUTE_POINTS)) failures.push('sample-04: route geometry does not match the frozen printed-trail trace');
    const nps = sourceRecords.get('NPS-SOUTH-RIVER-2025');
    const raster = binding?.source_raster;
    if (!nps || route?.source_sha256 !== nps.sha256 || binding?.source_pdf_sha256 !== nps.sha256 || raster?.path !== 'video/source-intake/reference-calibration-v02/nps-south-river-map-page001.png' || raster?.pdf_page !== 1 || raster?.width !== 1530 || raster?.height !== 1980 || derivedFiles.get(raster?.path)?.sha256 !== raster?.sha256) failures.push('sample-04: route source PDF/raster byte binding is invalid');
    try { const overlay=await readFile(absolute(route.path),'utf8'); if(!overlay.includes(`d="${EXPECTED_ROUTE_D}"`)) failures.push('sample-04: overlay SVG path differs from the bound source-raster geometry'); } catch { failures.push('sample-04: route overlay bytes cannot be inspected'); }
  }
  if (sample.sample_id === 'sample-10-narrative-scale-translation') {
    const scale = manifest.assets.find((asset) => asset.asset_id === 's10-distance-scale');
    const earth = manifest.assets.find((asset) => asset.asset_id === 's10-earth');
    const moon = manifest.assets.find((asset) => asset.asset_id === 's10-moon');
    const binding = manifest.scale_geometry_binding, values=binding?.source_values, geometry=binding?.render_geometry;
    if (!scale || scale.asset_class !== 'measurement' || scale.origin !== 'deterministic-editorial' || scale.deterministic !== true || scale.explanatory_overlay !== true || scale.source_id !== 'JPL-EARTH-MOON-SCALE') failures.push('sample-10: scale overlay must be a JPL-bound deterministic explanatory asset');
    if (!manifest.visible_asset_ids.includes('s10-distance-scale') || !manifest.asset_bindings.some((item) => item.asset_id === 's10-distance-scale' && item.role === 'supporting') || manifest.semantic_fidelity.focal_asset_ids.includes('s10-distance-scale')) failures.push('sample-10: scale overlay supporting/focal roles are invalid');
    if (!source.includes("s10-distance-scale.svg") || !source.includes('earthDiameterPx = 620') || !source.includes('moonDiameterPx = earthDiameterPx * (3475 / 12742)') || !source.includes('DIAMETERS TO SCALE · DISTANCE SHOWN WITH A BROKEN AXIS')) failures.push('sample-10: runtime does not bind the to-scale diameter and broken-axis treatment');
    if (JSON.stringify(values) !== JSON.stringify({earth_diameter_km:12742,moon_diameter_km:3475,average_distance_km:384400}) || geometry?.earth_diameter_px !== 620 || Math.abs(geometry?.moon_diameter_px - 620*(3475/12742)) > 1e-9 || Math.abs(geometry?.diameter_ratio - 3475/12742) > 1e-12 || binding?.distance_treatment !== 'broken-axis-not-to-scale') failures.push('sample-10: JPL values or rendered diameter ratio are inaccurate');
    const jpl = sourceRecords.get('JPL-EARTH-MOON-SCALE'), raster=binding?.source_raster;
    if (!jpl || scale?.source_sha256 !== jpl.sha256 || binding?.source_pdf_sha256 !== jpl.sha256 || raster?.path !== 'video/source-intake/reference-calibration-v02/earth-moon-distance-page001.png' || raster?.pdf_page !== 1 || raster?.width !== 1530 || raster?.height !== 1980 || derivedFiles.get(raster?.path)?.sha256 !== raster?.sha256) failures.push('sample-10: JPL worksheet PDF/raster byte binding is invalid');
    try { const overlay=await readFile(absolute(scale.path),'utf8'); for(const text of ['12,742 km','3,475 km','384,400 km','BROKEN AXIS · DISTANCE NOT TO SCALE']) if(!overlay.includes(text)) failures.push(`sample-10: scale overlay missing exact source text ${text}`); } catch { failures.push('sample-10: scale overlay bytes cannot be inspected'); }
    try {
      const earthAlpha=await alphaBounds(absolute(earth.path)), moonAlpha=await alphaBounds(absolute(moon.path));
      if (earthAlpha.width !== earthAlpha.height || moonAlpha.width !== moonAlpha.height || earthAlpha.width < 995 || moonAlpha.width < 995 || JSON.stringify(binding?.normalized_disc_assets?.earth) !== JSON.stringify(earthAlpha) || JSON.stringify(binding?.normalized_disc_assets?.moon) !== JSON.stringify(moonAlpha)) failures.push('sample-10: normalized source-photo disc masks are not byte-measured circular bounds');
    } catch { failures.push('sample-10: normalized disc assets cannot be measured'); }
  }
  await checkOutputEntries(manifest.outputs, sample.sample_id);
  if (sample.outputs?.video?.sha256 !== manifest.outputs.video?.sha256) failures.push(`${sample.sample_id}: catalog video SHA does not match manifest`);
  const video = absolute(manifest.outputs.video.path);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames,duration', '-of', 'json', video], {encoding: 'utf8'});
  if (probe.status !== 0) { failures.push(`${sample.sample_id}: ffprobe failed`); continue; }
  const stream = JSON.parse(probe.stdout).streams?.[0];
  if (!stream || stream.width !== 1920 || stream.height !== 1080 || stream.r_frame_rate !== '30/1' || Number(stream.nb_frames) !== 300 || Number(stream.duration) < 9.99) failures.push(`${sample.sample_id}: video dimensions/fps/frame count invalid`);
  const holdHashes = [180, 240, 299].map((frame) => decodedFrameHash(video, frame));
  if (!holdHashes.every(Boolean) || new Set(holdHashes).size !== 1) failures.push(`${sample.sample_id}: decoded MP4 hold frames are not pixel-identical`);
  if (sample.sample_id === 'sample-06-directional-exit-hard-cut-pair') {
    const pair = manifest.outputs.pair_artifact;
    if (!pair || pair.source !== 'decoded-candidate-mp4-frames' || pair.outgoing_scene_clear_frame !== 119 || pair.hard_cut_frame !== 120 || pair.incoming_stable_frame !== 121) failures.push('sample-06: candidate pair metadata invalid');
    if (pair?.candidate_frames?.incoming_first?.sha256 !== pair?.candidate_frames?.incoming_stable?.sha256) failures.push('sample-06: incoming first/stable candidate frames differ');
    if (pair?.candidate_frames?.outgoing_last?.sha256 === pair?.candidate_frames?.incoming_first?.sha256) failures.push('sample-06: outgoing/incoming candidate frames are identical');
    try { const dimensions = await sharp(absolute(pair.path)).metadata(); if (dimensions.width !== 1920 || dimensions.height !== 360) failures.push('sample-06: candidate pair dimensions invalid'); } catch { failures.push('sample-06: candidate pair missing or undecodable'); }
  }
}
if (catalog.active_cut_root !== null || catalog.rendered_count !== 10 || catalog.blocked_count !== 0 || catalog.motion_artifacts_created !== true) failures.push('catalog lifecycle/count invariant failed');
if (failures.length) { console.error(JSON.stringify({ok: false, failures}, null, 2)); process.exit(1); }
console.log(JSON.stringify({ok: true, rendered: catalog.rendered_count, blocked: catalog.blocked_count, catalog_video_sha_verified: true, decoded_static_hold: 'F180/F240/F299 pixel-identical', candidate_pair: 'sample-06 decoded candidate frames verified', active_cut_root: null}, null, 2));
