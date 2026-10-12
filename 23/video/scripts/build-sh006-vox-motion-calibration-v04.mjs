import {createHash} from 'node:crypto';
import {cp, mkdir, rm, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {renderComposition, ROOT} from './qa-runtime.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const publicRoot = path.join(repoRoot, 'video', 'public');
const candidate = 'episode-001-sh006-vox-motion-v04';
const publicRootOut = path.join(publicRoot, 'assets', 'style-calibration', candidate);
const qaRoot = path.join(repoRoot, 'video', 'qa', 'style-calibration', candidate);
const samplesRoot = path.join(qaRoot, 'samples');
const entry = path.resolve(repoRoot, 'video', 'src', 'sh006-vox-motion-calibration-v04-index.tsx');
const runtime = path.resolve(repoRoot, 'video', 'src', 'sh006-vox-motion-calibration-v04.tsx');
const rel = (file) => path.relative(repoRoot, file).replaceAll('\\', '/');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fileSha = async (file) => sha256(await readFile(file));
const sample = (frame) => path.join(samplesRoot, `frame-${String(frame).padStart(3, '0')}.png`);

const copyAsset = async (source, destination) => {
  await mkdir(path.dirname(destination), {recursive: true});
  await cp(source, destination);
  const [sourceHash, destinationHash, metadata] = await Promise.all([fileSha(source), fileSha(destination), sharp(destination).metadata()]);
  if (sourceHash !== destinationHash) throw new Error(`asset copy hash mismatch: ${source}`);
  return {source_path: rel(source), path: rel(destination), sha256: destinationHash, width: metadata.width ?? null, height: metadata.height ?? null, media_type: `image/${metadata.format ?? 'unknown'}`};
};

const sources = [
  {asset_id: 'fixed-background', source: path.join(publicRoot, 'assets', 'shared', 'paper-beige-check.png'), destination: path.join(publicRootOut, 'background.png'), asset_class: 'background', origin: 'real-source', source_kind: 'source-original', source_id: 'SHARED-PAPER-BEIGE-CHECK', license: 'Project-owned fixed editorial background'},
  {asset_id: 'current-article-196', source: path.join(repoRoot, 'video', 'qa', 'style-frames', 'episode-001', 'SH006-editorial-v08', 'assets', 'sh006-current-article-196-evidence-view.png'), destination: path.join(publicRootOut, 'assets', 'sh006-current-article-196-evidence-view.png'), asset_class: 'document', origin: 'source-derived', source_kind: 'source-original', source_id: 'LAW-196', license: 'Statutory text source; exact retype only; website UI/logo excluded'},
  {asset_id: 'deletion-article-196', source: path.join(repoRoot, 'video', 'qa', 'style-frames', 'episode-001', 'SH006-editorial-v08', 'assets', 'sh006-article-196-deletion-evidence-view.png'), destination: path.join(publicRootOut, 'assets', 'sh006-article-196-deletion-evidence-view.png'), asset_class: 'document', origin: 'source-derived', source_kind: 'source-original', source_id: 'LAW-REVISION-21857', license: 'Statutory text source; exact retype only; website UI/logo excluded'},
  {asset_id: 'retained-article-195', source: path.join(repoRoot, 'video', 'qa', 'style-frames', 'episode-001', 'SH006-editorial-v08', 'assets', 'sh006-article-195-retained-evidence-view.png'), destination: path.join(publicRootOut, 'assets', 'sh006-article-195-retained-evidence-view.png'), asset_class: 'document', origin: 'source-derived', source_kind: 'source-original', source_id: 'LAW-REVISION-21857', license: 'Statutory text source; exact retype only; website UI/logo excluded'},
  {asset_id: 'person-imagegen-fictional', source: path.join(repoRoot, 'video', 'qa', 'production-assets', 'episode-001', 'SH006-person-imagegen-v01', 'derived', 'sh006-prosecutor-role-imagegen-clean-v01.png'), destination: path.join(publicRootOut, 'assets', 'sh006-prosecutor-role-imagegen-clean-v01.png'), asset_class: 'person', origin: 'imagegen-person', source_kind: 'source-original', source_id: 'SH006-PERSON-IMAGEGEN-V01', license: 'Built-in image_gen; fictional generic role; no real-person likeness', identity_scope: 'fictional-generic', ai_disclosure: true},
  {asset_id: 'police-building', source: path.join(repoRoot, 'video', 'qa', 'production-assets', 'episode-001', 'SH006-real-photo-v01', 'assets', 'sh006-police-building-real-photo.png'), destination: path.join(publicRootOut, 'assets', 'sh006-police-building-real-photo.png'), asset_class: 'building', origin: 'real-source', source_kind: 'official-photo', source_id: 'WIKIMEDIA-3243833', license: 'CC BY 2.0'},
];

await rm(publicRootOut, {recursive: true, force: true});
await rm(qaRoot, {recursive: true, force: true});
await mkdir(samplesRoot, {recursive: true});
const copied = [];
for (const source of sources) copied.push({...source, ...(await copyAsset(source.source, source.destination)), path: path.relative(publicRootOut, source.destination).replaceAll('\\', '/')});

const sampleFrames = [0, 45, 60, 90, 119, 120, 132, 140, 141, 142, 149, 150, 180, 224, 225, 232, 234, 242, 243, 250, 270, 300, 329, 345, 375, 390, 420, 449];
for (const frame of sampleFrames) {
  const output = sample(frame);
  const args = [path.resolve(ROOT, 'node_modules', '@remotion', 'cli', 'remotion-cli.js'), 'still', entry, 'SH006-VoxMotion-B03-B05-Provisional-v04', output, '--frame', String(frame), '--config', path.resolve(ROOT, 'video/remotion.config.ts'), '--image-format', 'png', '--log', 'error'];
  const result = spawnSync(process.execPath, args, {cwd: ROOT, encoding: 'utf8', windowsHide: true, env: {...process.env, REMOTION_DISABLE_NETWORK: '1'}});
  if (result.status !== 0) throw new Error(`sample frame ${frame} failed\n${result.stderr || result.stdout}`);
}

const video = path.join(qaRoot, 'SH006-VoxMotion-B03-B05-Provisional-v04.mp4');
renderComposition({entry, composition: 'SH006-VoxMotion-B03-B05-Provisional-v04', output: video});
const contact = path.join(qaRoot, 'SH006-vox-motion-contact-v04.png');
const contactFrames = [0, 90, 140, 141, 142, 180, 232, 234, 300];
const thumbs = await Promise.all(contactFrames.map((frame) => sharp(sample(frame)).resize(640, 360).png().toBuffer()));
const title = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="132"><rect width="1920" height="132" fill="#eee7da"/><text x="54" y="54" font-family="Arial, sans-serif" font-size="30" font-weight="900" fill="#172a34">SH006 · VOX FULL-CARD FLIP AUDITION · B03 → B05 · v04</text><text x="54" y="98" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#405058">450 frames · 30fps · inactive calibration · full-sheet 3D page flip · frozen reading holds</text></svg>`);
await sharp({create: {width: 1920, height: 1212, channels: 4, background: '#eee7da'}}).composite([{input: title, left: 0, top: 0}, ...thumbs.map((input, index) => ({input, left: (index % 3) * 640, top: 132 + Math.floor(index / 3) * 360}))]).png({compressionLevel: 9}).toFile(contact);
const finalMobile = path.join(qaRoot, 'final-hold-360x203.png');
await sharp(sample(449)).resize(360, 203, {fit: 'fill'}).png({compressionLevel: 9}).toFile(finalMobile);

const ffprobe = spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', video], {cwd: ROOT, encoding: 'utf8', windowsHide: true});
if (ffprobe.status !== 0) throw new Error(`ffprobe failed: ${ffprobe.stderr || ffprobe.stdout}`);
const ffprobeFacts = JSON.parse(ffprobe.stdout);
const runtimeHash = await fileSha(runtime);
const entryHash = await fileSha(entry);
const beats = [
  {beat_id: 'B03-current-clause', presentation_contract: {viewer_takeaway: '시행 전 제196조가 검사가 범죄사실과 증거를 수사한다고 정하고 있음을 확인한다.', dominant_focal_asset_id: 'current-article-196', supporting_asset_ids: [], hidden_asset_ids: ['deletion-article-196', 'retained-article-195', 'person-imagegen-fictional', 'police-building'], layout_template: 'single-centered-document', narration_window: {start_frame: 60, end_frame: 120}, stable_reading_hold: {start_frame: 60, end_frame: 120, frame_independent: true}}},
  {beat_id: 'B03-deletion-change', presentation_contract: {viewer_takeaway: '제196조의 문구가 한 장의 종이 뒤집기로 삭제문으로 바뀌는 과정을 본다.', dominant_focal_asset_id: 'deletion-article-196', supporting_asset_ids: ['current-article-196'], hidden_asset_ids: ['retained-article-195', 'person-imagegen-fictional', 'police-building'], layout_template: 'single-document-full-sheet-flip', narration_window: {start_frame: 120, end_frame: 225}, stable_reading_hold: {start_frame: 150, end_frame: 225, frame_independent: true}}},
  {beat_id: 'B05-retained-clause', presentation_contract: {viewer_takeaway: '새 제195조 제2항이 보완수사요구와 재수사요구 등의 직무를 정한다는 점을 읽는다.', dominant_focal_asset_id: 'retained-article-195', supporting_asset_ids: ['person-imagegen-fictional', 'police-building'], hidden_asset_ids: ['current-article-196', 'deletion-article-196'], layout_template: 'single-document-to-role-route', narration_window: {start_frame: 243, end_frame: 330}, stable_reading_hold: {start_frame: 270, end_frame: 330, frame_independent: true}}},
];
const outputFiles = [...sampleFrames.map(sample), contact, video];
const manifest = {
  schema_version: 1, candidate_id: candidate, shot_id: 'SH006', episode_id: 'episode-001', title: 'SH006 B03→B05 Vox full-card flip calibration audition', calibration_revision: 'v04', status: 'inactive-internal-method-calibration', review_profile: 'remotion-motion', production_authority: false, production_visible: false, user_pass: false, cut_pass: false, rights_approved: false, omni_video_approved: false, style_gate_bypassed: false, production_promotion_eligible: false, user_quality_review_candidate: false, static_png_is_not_motion_proof: true, fps: 30, duration_frames: 450, dimensions: {width: 1920, height: 1080}, background: 'background.png', assets: copied.map(({source, destination, ...asset}) => asset), effects_required: false, inputs_contain_video: false, asset_origin_policy: {version: 1, person_imagegen_allowed: true, non_person_real_or_official_required: true, deterministic_overlay_classes: ['path', 'mask', 'effect', 'chart', 'text-surface'], omni_keyframes_are_separate_route: true}, layout_contract_version: 2, typography_surface_contract_version: 2, shared_document_shell: true, transition_contract: {operator: 'document.flip-swap@1', full_card: true, outgoing_transform: 'rotateY(0deg→-90deg)', incoming_transform: 'rotateY(+90deg→0deg)', backface_hidden: true, duration_frames: 18, center_edge_frames: 1, content_slicing: false, content_opacity_crossfade: false}, route_overlay: {asset_id: 'route-overlay-inline-v04', asset_class: 'path', origin: 'deterministic-editorial', deterministic: true, explanatory_overlay: true, runtime_bound: true, source: 'inline-svg-geometry', runtime_sha256: runtimeHash}, beats, stable_reading_holds: [{start_frame: 60, end_frame: 120, frame_independent: true}, {start_frame: 150, end_frame: 225, frame_independent: true}, {start_frame: 270, end_frame: 330, frame_independent: true}, {start_frame: 390, end_frame: 450, frame_independent: true}], schedule: [
    {phase: 'background-only', start_frame: 0, end_frame: 30},
    {phase: 'article-196-enter', start_frame: 30, end_frame: 60, operators: ['transform.spring@1', 'opacity.tween@1']},
    {phase: 'article-196-reading-hold', start_frame: 60, end_frame: 120, frame_independent: true},
    {phase: 'article-196-full-card-flip-to-deletion', start_frame: 120, end_frame: 150, operators: ['document.flip-swap@1'], strike_frames: {start_frame: 120, end_frame_exclusive: 141}},
    {phase: 'deletion-reading-hold', start_frame: 150, end_frame: 225, frame_independent: true},
    {phase: 'shared-document-full-card-flip-to-article-195', start_frame: 225, end_frame: 243, operators: ['document.flip-swap@1', 'transform.tween@1']},
    {phase: 'article-195-shell-settle', start_frame: 243, end_frame: 270, operators: ['transform.tween@1']},
    {phase: 'article-195-reading-hold', start_frame: 270, end_frame: 330, frame_independent: true},
    {phase: 'person-and-police-entrance', start_frame: 330, end_frame: 360, operators: ['transform.spring@1', 'opacity.tween@1']},
    {phase: 'route-draw-person-document-police', start_frame: 360, end_frame: 390, operators: ['svg.stroke-draw@1']},
    {phase: 'final-summary-hold', start_frame: 390, end_frame: 450, frame_independent: true},
  ], independent_targets: ['article-196-document-shell', 'person-imagegen-fictional', 'police-building', 'route-person-to-document', 'route-document-to-police'], labels: {placement: 'below-center', rotation_deg: 0, non_overlapping: true}, target_bindings: [{target_id: 'person-imagegen-fictional', target_bbox: {left: 80, top: 485, width: 330, height: 430}, text_role: 'asset-label', label_bbox: {left: 50, top: 947, width: 390, height: 49}, placement: 'below-center', rotation_deg: 0, vertical_gap_px: 32, center_alignment_error_px: 0}, {target_id: 'police-building', target_bbox: {left: 1570, top: 530, width: 300, height: 300}, text_role: 'asset-label', label_bbox: {left: 1555, top: 862, width: 330, height: 49}, placement: 'below-center', rotation_deg: 0, vertical_gap_px: 32, center_alignment_error_px: 0}], row_baseline_exemption: {applies: false, reason: null, scope: null}, source_policy: {person_imagegen_allowed: true, non_person_real_or_official_required: true, no_omni_video: true}, source_lock: copied.map(({asset_id, source_path, path: assetPath, sha256: hash, origin, source_kind, source_id, license, asset_class, identity_scope, ai_disclosure}) => ({asset_id, source_path, path: assetPath, sha256: hash, origin, source_kind, source_id, license, asset_class, ...(identity_scope ? {identity_scope, ai_disclosure} : {})})), runtime: {entry: rel(entry), entry_sha256: entryHash, runtime: rel(runtime), runtime_sha256: runtimeHash}, outputs: {video: {path: rel(video), sha256: await fileSha(video)}, contact: {path: rel(contact), sha256: await fileSha(contact), dimensions: {width: 1920, height: 1212}, grid: '3x3'}, final_mobile: {path: rel(finalMobile), sha256: await fileSha(finalMobile), dimensions: {width: 360, height: 203}, frame: 449}, samples: await Promise.all(outputFiles.slice(0, -2).map(async (file) => ({frame: Number(path.basename(file).match(/(\d+)/u)?.[1] ?? -1), path: rel(file), sha256: await fileSha(file)})))}, ffprobe: ffprobeFacts, limitations: ['Inactive internal method calibration only; no style-frame PASS, cut PASS, parity proof, rights approval, production authority, production promotion, user quality review, or Omni generation.', 'Full-card flip is a method audition; visual and semantic quality still require human review.', 'Final hold is intentionally static; narration and final recording are not attached.'],
};
await writeFile(path.join(qaRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile(path.join(qaRoot, 'README.md'), '# SH006 Vox full-card flip calibration v04\n\nInactive internal method calibration only. Existing v01 is preserved as historical output. This candidate is outside production authority and is not a style or cut review request.\n\n- Each document transition swaps complete source-derived sheets with a 3D Y-axis page flip; no vertical text slicing or content opacity crossfade.\n- Reading holds render exact fixed geometry and pixels independent of frame.\n- The route is deterministic inline SVG geometry bound to the runtime hash; it is not a raster input file.\n- Real/official/source-derived non-person assets; one disclosed fictional-generic imagegen person. No Omni video and no effects folder.\n', 'utf8');
console.log(JSON.stringify({ok: true, root: rel(qaRoot), video: rel(video), contact: rel(contact), final_mobile: rel(finalMobile), revision: manifest.calibration_revision, runtime_sha256: runtimeHash, entry_sha256: entryHash, assets: copied.map(({asset_id, path: assetPath, sha256: hash}) => ({asset_id, path: assetPath, sha256: hash})), contact_frames: contactFrames, schedule: manifest.schedule, ffprobe: ffprobeFacts.streams?.[0] ? {width: ffprobeFacts.streams[0].width, height: ffprobeFacts.streams[0].height, r_frame_rate: ffprobeFacts.streams[0].r_frame_rate, duration: ffprobeFacts.format?.duration} : null}, null, 2));
