import {createHash} from 'node:crypto';
import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {renderComposition, ROOT} from './qa-runtime.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const publicRoot = path.join(repoRoot, 'video', 'public');
const candidate = 'episode-001-sh006-vox-motion-v01';
const publicRootOut = path.join(publicRoot, 'assets', 'style-calibration', candidate);
const qaRoot = path.join(repoRoot, 'video', 'qa', 'style-calibration', candidate);
const samplesRoot = path.join(qaRoot, 'samples');
const entry = path.resolve(repoRoot, 'video', 'src', 'sh006-vox-motion-calibration-index.tsx');
const runtime = path.resolve(repoRoot, 'video', 'src', 'sh006-vox-motion-calibration-v01.tsx');
const sample = (frame) => path.join(samplesRoot, `frame-${String(frame).padStart(3, '0')}.png`);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fileSha = async (file) => sha256(await readFile(file));
const rel = (file) => path.relative(repoRoot, file).replaceAll('\\', '/');
const copyAsset = async (source, destination) => {
  await mkdir(path.dirname(destination), {recursive: true});
  await cp(source, destination);
  const [sourceHash, destinationHash, metadata] = await Promise.all([fileSha(source), fileSha(destination), sharp(destination).metadata()]);
  if (sourceHash !== destinationHash) throw new Error(`asset copy hash mismatch: ${source}`);
  return {source_path: rel(source), path: rel(destination), sha256: destinationHash, width: metadata.width ?? null, height: metadata.height ?? null, media_type: metadata.format === 'svg' ? 'image/svg+xml' : `image/${metadata.format ?? 'unknown'}`};
};

const sources = [
  {asset_id: 'fixed-background', source: path.join(publicRoot, 'assets', 'shared', 'paper-beige-check.png'), destination: path.join(publicRootOut, 'background.png'), asset_class: 'background', origin: 'real-source', source_kind: 'source-original', source_id: 'SHARED-PAPER-BEIGE-CHECK', license: 'Project-owned fixed editorial background'},
  {asset_id: 'current-article-196', source: path.join(repoRoot, 'video', 'qa', 'style-frames', 'episode-001', 'SH006-editorial-v08', 'assets', 'sh006-current-article-196-evidence-view.png'), destination: path.join(publicRootOut, 'assets', 'sh006-current-article-196-evidence-view.png'), asset_class: 'document', origin: 'source-derived', source_kind: 'source-original', source_id: 'LAW-196', license: 'Statutory text source; exact retype only; website UI/logo excluded'},
  {asset_id: 'deletion-article-196', source: path.join(repoRoot, 'video', 'qa', 'style-frames', 'episode-001', 'SH006-editorial-v08', 'assets', 'sh006-article-196-deletion-evidence-view.png'), destination: path.join(publicRootOut, 'assets', 'sh006-article-196-deletion-evidence-view.png'), asset_class: 'document', origin: 'source-derived', source_kind: 'source-original', source_id: 'LAW-REVISION-21857', license: 'Statutory text source; exact retype only; website UI/logo excluded'},
  {asset_id: 'retained-article-195', source: path.join(repoRoot, 'video', 'qa', 'style-frames', 'episode-001', 'SH006-editorial-v08', 'assets', 'sh006-article-195-retained-evidence-view.png'), destination: path.join(publicRootOut, 'assets', 'sh006-article-195-retained-evidence-view.png'), asset_class: 'document', origin: 'source-derived', source_kind: 'source-original', source_id: 'LAW-REVISION-21857', license: 'Statutory text source; exact retype only; website UI/logo excluded'},
  {asset_id: 'route-path', source: path.join(repoRoot, 'video', 'qa', 'style-frames', 'episode-001', 'SH006-editorial-v08', 'assets', 'sh006-route-path.svg'), destination: path.join(publicRootOut, 'assets', 'sh006-route-path.svg'), asset_class: 'path', origin: 'deterministic-editorial', source_kind: 'source-original', source_id: 'SH006-ROUTE-PATH-V08', license: 'Project-authored explanatory SVG; non-focal overlay only', deterministic: true, explanatory_overlay: true},
  {asset_id: 'person-imagegen-fictional', source: path.join(repoRoot, 'video', 'qa', 'production-assets', 'episode-001', 'SH006-person-imagegen-v01', 'derived', 'sh006-prosecutor-role-imagegen-clean-v01.png'), destination: path.join(publicRootOut, 'assets', 'sh006-prosecutor-role-imagegen-clean-v01.png'), asset_class: 'person', origin: 'imagegen-person', source_kind: 'source-original', source_id: 'SH006-PERSON-IMAGEGEN-V01', license: 'Built-in image_gen; fictional generic role; no real-person likeness', identity_scope: 'fictional-generic', ai_disclosure: true},
  {asset_id: 'police-building', source: path.join(repoRoot, 'video', 'qa', 'production-assets', 'episode-001', 'SH006-real-photo-v01', 'assets', 'sh006-police-building-real-photo.png'), destination: path.join(publicRootOut, 'assets', 'sh006-police-building-real-photo.png'), asset_class: 'building', origin: 'real-source', source_kind: 'official-photo', source_id: 'WIKIMEDIA-3243833', license: 'CC BY 2.0'},
];

await rm(publicRootOut, {recursive: true, force: true});
await rm(qaRoot, {recursive: true, force: true});
await mkdir(samplesRoot, {recursive: true});
const copied = [];
for (const source of sources) copied.push({...source, ...(await copyAsset(source.source, source.destination)), path: path.relative(publicRootOut, source.destination).replaceAll('\\', '/')});

const sampleFrames = [0, 45, 90, 140, 190, 225, 232, 250, 269, 300, 345, 375, 390, 420, 449];
// Use the explicit frame flag so every phase has a named review still.
for (const frame of sampleFrames) {
  const output = path.join(samplesRoot, `frame-${String(frame).padStart(3, '0')}.png`);
  const args = [path.resolve(ROOT, 'node_modules', '@remotion', 'cli', 'remotion-cli.js'), 'still', entry, 'SH006-VoxMotion-B03-B05-Provisional', output, '--frame', String(frame), '--config', path.resolve(ROOT, 'video/remotion.config.ts'), '--image-format', 'png', '--log', 'error'];
  const result = spawnSync(process.execPath, args, {cwd: ROOT, encoding: 'utf8', windowsHide: true, env: {...process.env, REMOTION_DISABLE_NETWORK: '1'}});
  if (result.status !== 0) throw new Error(`sample frame ${frame} failed\n${result.stderr || result.stdout}`);
}

const video = path.join(qaRoot, 'SH006-VoxMotion-B03-B05-Provisional.mp4');
renderComposition({entry, composition: 'SH006-VoxMotion-B03-B05-Provisional', output: video});
const contact = path.join(qaRoot, 'SH006-vox-motion-contact.png');
const contactFrames = [0, 90, 140, 190, 225, 232, 300, 375, 420];
const thumbs = await Promise.all(contactFrames.map((frame) => sharp(path.join(samplesRoot, `frame-${String(frame).padStart(3, '0')}.png`)).resize(640, 360).png().toBuffer()));
const title = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="132"><rect width="1920" height="132" fill="#eee7da"/><text x="54" y="54" font-family="Arial, sans-serif" font-size="30" font-weight="900" fill="#172a34">SH006 · VOX MOTION AUDITION · B03 → B05</text><text x="54" y="98" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#405058">450 frames · 30fps · provisional calibration · localized document change · shared document morph · independent route draw</text></svg>`);
await sharp({create: {width: 1920, height: 1212, channels: 4, background: '#eee7da'}}).composite([{input: title, left: 0, top: 0}, ...thumbs.map((input, index) => ({input, left: (index % 3) * 640, top: 132 + Math.floor(index / 3) * 360}))]).png({compressionLevel: 9}).toFile(contact);
const finalMobile = path.join(qaRoot, 'final-hold-360x203.png');
await sharp(sample(449)).resize(360, 203, {fit: 'fill'}).png({compressionLevel: 9}).toFile(finalMobile);

const ffprobe = spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', video], {cwd: ROOT, encoding: 'utf8', windowsHide: true});
if (ffprobe.status !== 0) throw new Error(`ffprobe failed: ${ffprobe.stderr || ffprobe.stdout}`);
const ffprobeFacts = JSON.parse(ffprobe.stdout);
const runtimeHash = await fileSha(runtime);
const entryHash = await fileSha(entry);
const outputFiles = [...sampleFrames.map((frame) => path.join(samplesRoot, `frame-${String(frame).padStart(3, '0')}.png`)), contact, video];
const manifest = {
  schema_version: 1,
  candidate_id: candidate,
  shot_id: 'SH006',
  episode_id: 'episode-001',
  title: 'SH006 B03→B05 Vox-motion calibration audition',
  calibration_revision: 'v03',
  status: 'provisional-calibration-only',
  review_profile: 'remotion-motion',
  production_authority: false,
  production_visible: false,
  user_pass: false,
  cut_pass: false,
  rights_approved: false,
  omni_video_approved: false,
  static_png_is_not_motion_proof: true,
  fps: 30,
  duration_frames: 450,
  dimensions: {width: 1920, height: 1080},
  background: 'background.png',
  assets: copied.map(({source, destination, ...asset}) => asset),
  effects_required: false,
  inputs_contain_video: false,
  localized_complementary_masks: true,
  blank_document_phase: false,
  complementary_coverage: true,
  content_opacity_crossfade: false,
  deletion_change_scope: 'same-document-shell-only',
  shared_document_shell: true,
  schedule: [
    {phase: 'background-only', start_frame: 0, end_frame: 30},
    {phase: 'article-196-enter', start_frame: 30, end_frame: 60, operators: ['transform.spring@1', 'opacity.tween@1']},
    {phase: 'article-196-reading-hold', start_frame: 60, end_frame: 120},
    {phase: 'localized-deletion', start_frame: 120, end_frame: 165, operators: ['document.highlight@1', 'mask.inset@1'], strike_frames: {start_frame: 120, end_frame: 132}, content_wipe_frames: {start_frame: 132, end_frame: 150}, hold_from_frame: 150},
    {phase: 'deletion-reading-hold', start_frame: 165, end_frame: 225},
    {phase: 'shared-document-morph-to-article-195', start_frame: 225, end_frame: 270, operators: ['scene.shared-element@1', 'mask.inset@1', 'transform.tween@1'], content_wipe_frames: {start_frame: 225, end_frame: 243}, shell_morph_frames: {start_frame: 225, end_frame: 270}, fully_visible_from_frame: 243},
    {phase: 'article-195-reading-hold', start_frame: 270, end_frame: 330},
    {phase: 'person-and-police-entrance', start_frame: 330, end_frame: 360, operators: ['transform.spring@1', 'opacity.tween@1']},
    {phase: 'route-draw-person-document-police', start_frame: 360, end_frame: 390, operators: ['svg.stroke-draw@1']},
    {phase: 'final-summary-hold', start_frame: 390, end_frame: 450},
  ],
  independent_targets: ['article-196-document-shell', 'person-imagegen-fictional', 'police-building', 'route-person-to-document', 'route-document-to-police'],
  labels: {placement: 'below-center', rotation_deg: 0, non_overlapping: true},
  source_policy: {person_imagegen_allowed: true, non_person_real_or_official_required: true, no_omni_video: true},
  source_lock: copied.map(({asset_id, source_path, path: assetPath, sha256: hash, origin, source_kind, source_id, license, asset_class, identity_scope, ai_disclosure, deterministic, explanatory_overlay}) => ({asset_id, source_path, path: assetPath, sha256: hash, origin, source_kind, source_id, license, asset_class, ...(identity_scope ? {identity_scope, ai_disclosure} : {}), ...(deterministic ? {deterministic, explanatory_overlay} : {})})),
  runtime: {entry: rel(entry), entry_sha256: entryHash, runtime: rel(runtime), runtime_sha256: runtimeHash},
  outputs: {video: {path: rel(video), sha256: await fileSha(video)}, contact: {path: rel(contact), sha256: await fileSha(contact), dimensions: {width: 1920, height: 1212}, grid: '3x3'}, final_mobile: {path: rel(finalMobile), sha256: await fileSha(finalMobile), dimensions: {width: 360, height: 203}, frame: 449}, samples: await Promise.all(outputFiles.slice(0, -2).map(async (file) => ({frame: Number(path.basename(file).match(/(\d+)/u)?.[1] ?? -1), path: rel(file), sha256: await fileSha(file)})))},
  ffprobe: ffprobeFacts,
  limitations: ['Calibration audition only; no user style-frame PASS, cut PASS, rights approval, production authority, or Omni generation.', 'Sample stills and MP4 demonstrate runtime motion but are not parity proof.', 'Final hold is intentionally static; narration and final recording are not attached.'],
};
await writeFile(path.join(qaRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile(path.join(qaRoot, 'README.md'), '# SH006 Vox-motion calibration v01 (revision v03)\n\nProvisional Remotion audition only. This root is intentionally outside production authority.\n\n- Real/official/source-derived non-person assets; one disclosed fictional-generic imagegen person.\n- B03→B05 uses a shared document shell, complementary localized masks without opacity crossfade, an 18-frame content wipe, independent person/building entrances, and two independently drawn routes.\n- No Omni video or effects folder is present.\n- Review the MP4 and sample frames before deciding whether the motion grammar is acceptable.\n', 'utf8');
console.log(JSON.stringify({ok: true, root: rel(qaRoot), video: rel(video), contact: rel(contact), runtime_sha256: runtimeHash, entry_sha256: entryHash, assets: copied.map(({asset_id, path: assetPath, sha256: hash}) => ({asset_id, path: assetPath, sha256: hash})), schedule: manifest.schedule, ffprobe: ffprobeFacts.streams?.[0] ? {width: ffprobeFacts.streams[0].width, height: ffprobeFacts.streams[0].height, r_frame_rate: ffprobeFacts.streams[0].r_frame_rate, duration: ffprobeFacts.format?.duration} : null}, null, 2));
