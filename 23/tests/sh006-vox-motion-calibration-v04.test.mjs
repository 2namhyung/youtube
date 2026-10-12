import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import test from 'node:test';

const root = process.cwd();
const candidate = 'episode-001-sh006-vox-motion-v04';
const publicRoot = path.join(root, 'video', 'public', 'assets', 'style-calibration', candidate);
const qaRoot = path.join(root, 'video', 'qa', 'style-calibration', candidate);
const manifestPath = path.join(qaRoot, 'manifest.json');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytes = (file) => readFile(file);
const raw = async (file) => sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject: true});
const rawSha = async (file) => sha((await raw(file)).data);
const sample = (frame) => path.join(qaRoot, 'samples', `frame-${String(frame).padStart(3, '0')}.png`);

test('SH006 v04 is an inactive flip-only candidate with exact local source bindings', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.candidate_id, candidate);
  assert.equal(manifest.calibration_revision, 'v04');
  assert.equal(manifest.review_profile, 'remotion-motion');
  for (const flag of ['production_authority', 'production_visible', 'user_pass', 'cut_pass', 'rights_approved', 'omni_video_approved', 'style_gate_bypassed', 'production_promotion_eligible', 'user_quality_review_candidate']) assert.equal(manifest[flag], false, `${flag} must remain false`);
  assert.equal(manifest.static_png_is_not_motion_proof, true);
  assert.equal(manifest.duration_frames, 450);
  assert.equal(manifest.fps, 30);
  assert.equal(manifest.layout_contract_version, 2);
  assert.equal(manifest.typography_surface_contract_version, 2);
  assert.equal(manifest.effects_required, false);
  assert.equal(manifest.inputs_contain_video, false);
  assert.equal(manifest.transition_contract.operator, 'document.flip-swap@1');
  assert.equal(manifest.transition_contract.full_card, true);
  assert.equal(manifest.transition_contract.content_slicing, false);
  assert.equal(manifest.transition_contract.content_opacity_crossfade, false);
  assert.equal(manifest.route_overlay.source, 'inline-svg-geometry');
  assert.equal(manifest.route_overlay.runtime_sha256, manifest.runtime.runtime_sha256);
  assert.ok(!manifest.assets.some((asset) => asset.asset_id === 'route-path' || /route-path\.svg$/u.test(asset.path)));
  assert.equal(manifest.asset_origin_policy.version, 1);
  assert.deepEqual(manifest.schedule.find((phase) => phase.phase === 'article-196-full-card-flip-to-deletion').strike_frames, {start_frame: 120, end_frame_exclusive: 141});
  assert.deepEqual(manifest.target_bindings, [
    {target_id: 'person-imagegen-fictional', target_bbox: {left: 80, top: 485, width: 330, height: 430}, text_role: 'asset-label', label_bbox: {left: 50, top: 947, width: 390, height: 49}, placement: 'below-center', rotation_deg: 0, vertical_gap_px: 32, center_alignment_error_px: 0},
    {target_id: 'police-building', target_bbox: {left: 1570, top: 530, width: 300, height: 300}, text_role: 'asset-label', label_bbox: {left: 1555, top: 862, width: 330, height: 49}, placement: 'below-center', rotation_deg: 0, vertical_gap_px: 32, center_alignment_error_px: 0},
  ]);
  for (const binding of manifest.target_bindings) {
    const gap = binding.label_bbox.top - (binding.target_bbox.top + binding.target_bbox.height);
    const targetCenter = binding.target_bbox.left + binding.target_bbox.width / 2;
    const labelCenter = binding.label_bbox.left + binding.label_bbox.width / 2;
    assert.ok(gap >= 32 && gap <= 72, `${binding.target_id} label gap must be 32–72px`);
    assert.ok(Math.abs(targetCenter - labelCenter) <= 16, `${binding.target_id} label center must be within 16px`);
    assert.equal(binding.text_role, 'asset-label');
    assert.equal(binding.placement, 'below-center');
    assert.equal(binding.rotation_deg, 0);
  }
  assert.equal(manifest.row_baseline_exemption.applies, false);
  assert.equal(manifest.beats.length, 3);
  for (const beat of manifest.beats) {
    const contract = beat.presentation_contract;
    assert.ok(contract.viewer_takeaway);
    assert.ok(contract.dominant_focal_asset_id);
    assert.ok(contract.layout_template);
    assert.ok(contract.narration_window);
    assert.equal(contract.stable_reading_hold.frame_independent, true);
  }
  for (const record of manifest.assets) {
    assert.ok(!/\.(mp4|mov|webm|mkv)$/iu.test(record.path));
    const file = path.join(publicRoot, record.path);
    const actual = sha(await bytes(file));
    assert.equal(actual, record.sha256, `${record.asset_id} destination hash drift`);
    if (record.source_path) assert.equal(actual, sha(await bytes(path.join(root, record.source_path))), `${record.asset_id} source/destination mismatch`);
    const metadata = await sharp(file).metadata();
    assert.ok(metadata.width && metadata.height, `${record.asset_id} is not decodable`);
    if (record.asset_id === 'person-imagegen-fictional') {
      assert.equal(record.origin, 'imagegen-person');
      assert.equal(record.identity_scope, 'fictional-generic');
      assert.equal(record.ai_disclosure, true);
    } else if (record.asset_id !== 'fixed-background') assert.ok(['real-source', 'source-derived'].includes(record.origin));
  }
});

test('SH006 v04 freezes every reading hold and uses full-card flip action frames', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const background = path.join(publicRoot, 'background.png');
  const f0 = await raw(sample(0));
  const bg = await raw(background);
  assert.equal(f0.info.width, 1920);
  assert.equal(f0.info.height, 1080);
  assert.deepEqual(f0.data, bg.data);
  const f0Hash = sha(f0.data);
  const bgHash = sha(bg.data);
  f0.data = Buffer.alloc(0);
  bg.data = Buffer.alloc(0);
  for (const [start, middle, end] of [[60, 90, 119], [150, 180, 224], [270, 300, 329], [390, 420, 449]]) {
    const startHash = await rawSha(sample(start));
    const middleHash = await rawSha(sample(middle));
    const endHash = await rawSha(sample(end));
    assert.equal(startHash, middleHash, `hold ${start}-${end} changed at middle`);
    assert.equal(middleHash, endHash, `hold ${start}-${end} changed at end`);
  }
  const beforeHash = await rawSha(sample(140));
  const edgeHash = await rawSha(sample(141));
  const afterHash = await rawSha(sample(142));
  const morphBeforeHash = await rawSha(sample(232));
  const morphEdgeHash = await rawSha(sample(234));
  const morphAfterHash = await rawSha(sample(243));
  assert.notEqual(beforeHash, edgeHash);
  assert.notEqual(edgeHash, afterHash);
  assert.notEqual(morphBeforeHash, morphEdgeHash);
  assert.notEqual(morphEdgeHash, morphAfterHash);
  assert.notEqual(morphEdgeHash, bgHash, 'flip edge must not create a blank document');
  assert.equal(manifest.outputs.final_mobile.frame, 449);
  const mobile = await sharp(path.join(qaRoot, 'final-hold-360x203.png')).metadata();
  assert.deepEqual({width: mobile.width, height: mobile.height}, {width: 360, height: 203});
  assert.equal(manifest.outputs.final_mobile.sha256, sha(await bytes(path.join(qaRoot, 'final-hold-360x203.png'))));
  const contact = await sharp(path.join(qaRoot, 'SH006-vox-motion-contact-v04.png')).metadata();
  assert.deepEqual({width: contact.width, height: contact.height}, {width: 1920, height: 1212});
  assert.deepEqual(manifest.outputs.contact.grid, '3x3');
});

test('SH006 v04 runtime proves whole-card Y flip and frozen hold branches', async () => {
  const runtime = await readFile(path.join(root, 'video', 'src', 'sh006-vox-motion-calibration-v04.tsx'), 'utf8');
  const entry = await readFile(path.join(root, 'video', 'src', 'sh006-vox-motion-calibration-v04-index.tsx'), 'utf8');
  assert.match(entry, /SH006-VoxMotion-B03-B05-Provisional-v04/u);
  assert.match(entry, /durationInFrames=\{450\}/u);
  assert.match(runtime, /data-flip-swap="full-card"/u);
  assert.match(runtime, /data-flip-target="outgoing-whole-card"/u);
  assert.match(runtime, /data-flip-target="incoming-whole-card"/u);
  assert.match(runtime, /rotateY\(\$\{-90 \* progress\}deg\)/u);
  assert.match(runtime, /rotateY\(\$\{90 - 90 \* progress\}deg\)/u);
  assert.match(runtime, /backfaceVisibility: 'hidden'/u);
  assert.match(runtime, /data-flip-target="paper-edge-fold"/u);
  assert.match(runtime, /frame >= 120 && frame < 141/u);
  assert.match(runtime, /data-runtime-bound-overlay="deterministic-editorial"/u);
  assert.match(runtime, /data-parity-target="person-imagegen-fictional"/u);
  assert.match(runtime, /data-parity-target="police-building"/u);
  assert.doesNotMatch(runtime, /clipPath/u);
  assert.doesNotMatch(runtime, /data-localized-deletion-mask/u);
  assert.doesNotMatch(runtime, /data-shared-document-incoming/u);
  assert.doesNotMatch(runtime, /<AbsoluteFill[^>]*opacity/u);
  assert.match(runtime, /top=\{947\}/u);
  assert.match(runtime, /left=\{1555\} top=\{862\}/u);
  assert.match(runtime, /background: 'transparent'/u);
});

test('SH006 v04 MP4 is a positive-duration 1920x1080 30fps render', async () => {
  const video = path.join(qaRoot, 'SH006-VoxMotion-B03-B05-Provisional-v04.mp4');
  const result = spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', video], {cwd: root, encoding: 'utf8', windowsHide: true});
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const info = JSON.parse(result.stdout);
  const stream = info.streams.find((candidateStream) => candidateStream.codec_type === 'video');
  assert.ok(stream);
  assert.equal(stream.width, 1920);
  assert.equal(stream.height, 1080);
  assert.equal(stream.r_frame_rate, '30/1');
  assert.ok(Number(info.format.duration) > 14.9);
});
