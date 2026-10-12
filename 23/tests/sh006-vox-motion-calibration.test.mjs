import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import sharp from 'sharp';

const root = process.cwd();
const candidate = 'episode-001-sh006-vox-motion-v01';
const publicRoot = path.join(root, 'video', 'public', 'assets', 'style-calibration', candidate);
const qaRoot = path.join(root, 'video', 'qa', 'style-calibration', candidate);
const manifestPath = path.join(qaRoot, 'manifest.json');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytes = (file) => readFile(file);
const raw = async (file) => sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject: true});
const sample = (frame) => path.join(qaRoot, 'samples', `frame-${String(frame).padStart(3, '0')}.png`);

test('SH006 Vox calibration exists, binds exact source bytes, and has no video inputs', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.review_profile, 'remotion-motion');
  assert.equal(manifest.production_authority, false);
  assert.equal(manifest.production_visible, false);
  assert.equal(manifest.user_pass, false);
  assert.equal(manifest.cut_pass, false);
  assert.equal(manifest.rights_approved, false);
  assert.equal(manifest.omni_video_approved, false);
  assert.equal(manifest.static_png_is_not_motion_proof, true);
  assert.equal(manifest.duration_frames, 450);
  assert.equal(manifest.fps, 30);
  assert.equal(manifest.calibration_revision, 'v03');
  assert.equal(manifest.effects_required, false);
  assert.equal(manifest.inputs_contain_video, false);
  assert.equal(manifest.localized_complementary_masks, true);
  assert.equal(manifest.blank_document_phase, false);
  assert.equal(manifest.complementary_coverage, true);
  assert.equal(manifest.content_opacity_crossfade, false);
  assert.equal(manifest.deletion_change_scope, 'same-document-shell-only');
  assert.equal(manifest.shared_document_shell, true);
  const deletionPhase = manifest.schedule.find((phase) => phase.phase === 'localized-deletion');
  assert.deepEqual(deletionPhase.strike_frames, {start_frame: 120, end_frame: 132});
  assert.deepEqual(deletionPhase.content_wipe_frames, {start_frame: 132, end_frame: 150});
  assert.equal(deletionPhase.hold_from_frame, 150);
  const morphPhase = manifest.schedule.find((phase) => phase.phase === 'shared-document-morph-to-article-195');
  assert.deepEqual(morphPhase.content_wipe_frames, {start_frame: 225, end_frame: 243});
  assert.deepEqual(morphPhase.shell_morph_frames, {start_frame: 225, end_frame: 270});
  assert.equal(morphPhase.fully_visible_from_frame, 243);
  assert.deepEqual(manifest.schedule.map((phase) => phase.phase), ['background-only', 'article-196-enter', 'article-196-reading-hold', 'localized-deletion', 'deletion-reading-hold', 'shared-document-morph-to-article-195', 'article-195-reading-hold', 'person-and-police-entrance', 'route-draw-person-document-police', 'final-summary-hold']);
  for (const record of manifest.assets) {
    assert.ok(!/\.(mp4|mov|webm|mkv)$/iu.test(record.path), `${record.asset_id} must not be video`);
    const file = path.join(publicRoot, record.path);
    const actual = sha(await bytes(file));
    assert.equal(actual, record.sha256, `${record.asset_id} destination hash drift`);
    if (record.source_path) {
      const source = path.join(root, record.source_path);
      assert.equal(actual, sha(await bytes(source)), `${record.asset_id} source/destination mismatch`);
    }
    const metadata = await sharp(file).metadata();
    assert.ok(metadata.width && metadata.height, `${record.asset_id} is not decodable`);
    if (record.asset_id === 'person-imagegen-fictional') {
      assert.equal(record.origin, 'imagegen-person');
      assert.equal(record.identity_scope, 'fictional-generic');
      assert.equal(record.ai_disclosure, true);
    } else if (!['fixed-background', 'route-path'].includes(record.asset_id)) {
      assert.ok(['real-source', 'source-derived'].includes(record.origin), `${record.asset_id} must be real/source-derived`);
    }
  }
});

test('SH006 Remotion audition has static background/final holds and observable action frames', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const background = path.join(publicRoot, 'background.png');
  const f0 = await raw(sample(0));
  const bg = await raw(background);
  assert.equal(f0.info.width, 1920);
  assert.equal(f0.info.height, 1080);
  assert.deepEqual(f0.data, bg.data, 'frame 0 must be pixel-identical to the fixed background');
  const [finalA, finalB, finalC] = await Promise.all([raw(sample(390)), raw(sample(420)), raw(sample(449))]);
  assert.deepEqual(finalA.data, finalB.data, 'final hold frame 390/420 changed unexpectedly');
  assert.deepEqual(finalB.data, finalC.data, 'final hold frame 420/449 changed unexpectedly');
  const [entry, deletion, morphAction, morph, person, route] = await Promise.all([raw(sample(45)), raw(sample(140)), raw(sample(232)), raw(sample(250)), raw(sample(345)), raw(sample(375))]);
  for (const [label, before, after] of [['entry', f0, entry], ['deletion', entry, deletion], ['morph wipe', deletion, morphAction], ['morph hold', morphAction, morph], ['person/building', morph, person], ['route', person, route]]) {
    assert.notEqual(sha(before.data), sha(after.data), `${label} has no observable pixel change`);
  }
  assert.notEqual(sha(morphAction.data), sha(bg.data), 'Article 195 wipe action must not expose a blank document');
  const mobile = await sharp(path.join(qaRoot, 'final-hold-360x203.png')).metadata();
  assert.equal(mobile.width, 360);
  assert.equal(mobile.height, 203);
  assert.equal(manifest.outputs.final_mobile.frame, 449);
  assert.equal(manifest.outputs.final_mobile.sha256, sha(await bytes(path.join(qaRoot, 'final-hold-360x203.png'))));
  const contact = await sharp(path.join(qaRoot, 'SH006-vox-motion-contact.png')).metadata();
  assert.equal(contact.width, 1920);
  assert.equal(contact.height, 1212);
  assert.equal(manifest.outputs.contact.grid, '3x3');
});

test('SH006 runtime exposes independent shared-document, people, and route targets without a scene fade', async () => {
  const runtime = await readFile(path.join(root, 'video', 'src', 'sh006-vox-motion-calibration-v01.tsx'), 'utf8');
  const entry = await readFile(path.join(root, 'video', 'src', 'sh006-vox-motion-calibration-index.tsx'), 'utf8');
  assert.match(entry, /SH006-VoxMotion-B03-B05-Provisional/u);
  assert.match(entry, /durationInFrames=\{450\}/u);
  for (const target of ['data-document-shell', 'data-shared-document-incoming', 'data-parity-target="person-imagegen-fictional"', 'data-parity-target="police-building"', 'data-parity-target="route-person-to-document"', 'data-parity-target="route-document-to-police"']) assert.ok(runtime.includes(target), `missing runtime target ${target}`);
  assert.match(runtime, /localized-deletion/u);
  assert.match(runtime, /article-195-localized-morph/u);
  assert.match(runtime, /data-deletion-wipe-boundary/u);
  assert.match(runtime, /data-shared-document-wipe-boundary/u);
  assert.match(runtime, /data-shared-document-incoming style=\{\{[^}]*clipPath:/u);
  assert.match(runtime, /clipPath: `inset\(0 0 0 \$\{w \* 100\}%\)`/u);
  assert.match(runtime, /clipPath: `inset\(0 \$\{100 - w \* 100\}% 0 0\)`/u);
  assert.match(runtime, /const strikeProgress = frame < 132 \? clamp\(\(frame - 120\) \/ 12\) : 0/u);
  assert.match(runtime, /frame < 132/u);
  assert.match(runtime, /\(frame - 132\) \/ 18/u);
  assert.match(runtime, /\(frame - 225\) \/ 18/u);
  assert.match(runtime, /frame < 243/u);
  assert.match(runtime, /<Label left=\{50\} top=\{930\}[^>]*>검사 역할/u);
  assert.match(runtime, /<marker id="sh006-route-arrow" markerUnits="userSpaceOnUse" markerWidth="24" markerHeight="24"/u);
  assert.doesNotMatch(runtime, /data-shared-document-(?:outgoing|incoming)[^>]*style=\{\{[^}]*opacity/u, 'document content must not use opacity crossfade');
  assert.doesNotMatch(runtime, /<AbsoluteFill[^>]*opacity/u, 'whole-scene opacity fade is prohibited');
});

test('SH006 MP4 is a positive-duration 1920x1080 30fps render', async () => {
  const video = path.join(qaRoot, 'SH006-VoxMotion-B03-B05-Provisional.mp4');
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
