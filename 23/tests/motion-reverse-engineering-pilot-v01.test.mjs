import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {link, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import test from 'node:test';
import {validatePilot} from '../video/scripts/validate-motion-reverse-engineering-pilot-v01.mjs';

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, 'video/qa/reference-study/motion-reverse-engineering-pilot-v01');
const PREFIX = 'video/qa/reference-study/motion-reverse-engineering-pilot-v01/';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const shaFile = async (file) => sha(await readFile(file));

async function hardlinkTree(source, destination) {
  await mkdir(destination, {recursive: true});
  for (const entry of await readdir(source, {withFileTypes: true})) {
    const from = path.join(source, entry.name), to = path.join(destination, entry.name);
    if (entry.isDirectory()) await hardlinkTree(from, to);
    else await link(from, to);
  }
}

const localPath = (packageRoot, recorded) => path.join(packageRoot, recorded.replaceAll('\\', '/').slice(PREFIX.length));
const artifacts = (manifest) => manifest.samples.flatMap((sample) => [sample.analysis, sample.hypotheses, sample.probe_measurements, ...sample.masks, ...sample.evidence_frames, sample.reference_clip, sample.probe, ...sample.probe_frames, sample.side_by_side, sample.mobile_contact]);
const refreshBundle = (manifest) => { manifest.artifact_bundle_sha256 = sha(artifacts(manifest).map((item) => `${item.kind}|${item.path}|${item.sha256}`).sort().join('\n')); };

async function writeDetached(file, value) {
  await rm(file);
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function fixture() {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'motion-reverse-test-'));
  const packageRoot = path.join(temp, 'package');
  await hardlinkTree(SOURCE, packageRoot);
  return {temp, packageRoot, manifest: JSON.parse(await readFile(path.join(packageRoot, 'manifest.json'), 'utf8'))};
}

async function saveManifest(fx) {
  refreshBundle(fx.manifest);
  await writeDetached(path.join(fx.packageRoot, 'manifest.json'), fx.manifest);
}

async function mutateAnalysis(fx, sampleIndex, mutate) {
  const binding = fx.manifest.samples[sampleIndex].analysis;
  const file = localPath(fx.packageRoot, binding.path);
  const data = JSON.parse(await readFile(file, 'utf8'));
  mutate(data);
  await writeDetached(file, data);
  binding.sha256 = await shaFile(file);
  await saveManifest(fx);
}

async function expectFailure(fx, expression, options = {}) {
  await assert.rejects(() => validatePilot({packageRoot: fx.packageRoot, verifySource: false, verifyMedia: false, ...options}), expression);
}

async function labeledCoverTile(file, width, height, label) {
  const image = await sharp(file).resize(width, height, {fit: 'cover'}).png().toBuffer();
  const svg = Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="17" fill="#000" fill-opacity=".72"/><text x="4" y="12" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="#fff">${label}</text></svg>`);
  return sharp(image).composite([{input: svg, left: 0, top: 0}]).png().toBuffer();
}

test('baseline pilot is structurally fail-closed', async () => {
  const fx = await fixture();
  try { assert.equal((await validatePilot({packageRoot: fx.packageRoot, verifySource: false, verifyMedia: false})).ok, true); }
  finally { await rm(fx.temp, {recursive: true, force: true}); }
});

test('rejects a hash-rebound cover-cropped inherited pilot contact', async () => {
  const fx = await fixture();
  try {
    const sample = fx.manifest.samples[0], layers = [];
    for (let index = 0; index < sample.contact_inputs.length; index++) {
      const row = sample.contact_inputs[index];
      layers.push({input: await labeledCoverTile(localPath(fx.packageRoot, row.source_path), 120, 101, `REF F${row.source_frame}`), left: index * 120, top: 0});
      layers.push({input: await labeledCoverTile(localPath(fx.packageRoot, row.probe_path), 120, 102, `PROBE F${String(row.probe_frame).padStart(3, '0')}`), left: index * 120, top: 101});
    }
    const contact = localPath(fx.packageRoot, sample.mobile_contact.path);
    await rm(contact);
    await sharp({create: {width: 360, height: 203, channels: 3, background: '#111'}}).composite(layers).png().toFile(contact);
    sample.mobile_contact.sha256 = await shaFile(contact);
    sample.mobile_contact.bytes = (await stat(contact)).size;
    await saveManifest(fx);
    await assert.rejects(() => validatePilot({packageRoot: fx.packageRoot, verifySource: false, verifyMedia: true}), /contact pixels are cropped/u);
  } finally { await rm(fx.temp, {recursive: true, force: true}); }
});

test('rejects erasing the measured upward group trajectory', async () => {
  const fx = await fixture();
  try {
    await mutateAnalysis(fx, 0, (data) => { for (const row of data.per_frame_measurements) if (row.group_translation_y_px !== null) row.group_translation_y_px = 0; });
    await expectFailure(fx, /group trajectory|upward group travel/u);
  } finally { await rm(fx.temp, {recursive: true, force: true}); }
});

test('rejects a fixed or wrong-direction tanker declaration', async () => {
  const fx = await fixture();
  try {
    await mutateAnalysis(fx, 0, (data) => { data.context_layers.tanker.measurement.result.dx_px = 0; data.context_layers.tanker.measurement.result.dy_px = -11; data.context_layers.tanker.measurement.result.iou = 1; });
    await expectFailure(fx, /tanker must translate slowly right\/down/u);
  } finally { await rm(fx.temp, {recursive: true, force: true}); }
});

test('rejects the obsolete conclusion that moving group bbox is forbidden', async () => {
  const fx = await fixture();
  try {
    await mutateAnalysis(fx, 0, (data) => { data.count_continuity.moving_group_bbox_rejected = true; });
    await expectFailure(fx, /obsolete moving-group rejection/u);
  } finally { await rm(fx.temp, {recursive: true, force: true}); }
});

test('rejects numeric baseline drift after removing group translation', async () => {
  const fx = await fixture();
  try {
    await mutateAnalysis(fx, 0, (data) => {
      const row = data.per_frame_measurements.find((item) => item.source_frame === 600);
      row.number.bbox[1] += 100;
      row.internal_layout.number_top_relative_to_icon_px += 100;
      row.internal_layout.number_baseline_relative_to_icon_px += 100;
      const values = data.per_frame_measurements.filter((item) => item.source_frame >= 585 && item.icon.bbox && item.number.bbox && item.unit.bbox).map((item) => item.number.bbox[1] + item.number.bbox[3] - item.icon.bbox[1]);
      const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
      const center = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
      data.internal_layout.number_baseline_relative_to_icon_median_px = center;
      data.internal_layout.number_baseline_max_residual_px = Math.max(...values.map((value) => Math.abs(value - center)));
    });
    await expectFailure(fx, /drift independently/u);
  } finally { await rm(fx.temp, {recursive: true, force: true}); }
});

test('rejects non-monotonic count transcription', async () => {
  const fx = await fixture();
  try {
    await mutateAnalysis(fx, 0, (data) => { data.observed_sampled_values[3].value = 35; });
    await expectFailure(fx, /sampled values/u);
  } finally { await rm(fx.temp, {recursive: true, force: true}); }
});

test('rejects discrete step-card count model', async () => {
  const fx = await fixture();
  try {
    await mutateAnalysis(fx, 0, (data) => { data.count_continuity.adjacent_glyph_change_fraction = 0.1; data.count_continuity.step_card_swap_rejected = false; });
    await expectFailure(fx, /step-card|framewise glyph/u);
  } finally { await rm(fx.temp, {recursive: true, force: true}); }
});

test('rejects a false whole-window fixed-shell conclusion', async () => {
  const fx = await fixture();
  try {
    await mutateAnalysis(fx, 1, (data) => { data.regions.shell_opacity_settle_observed = false; data.phases.shell_fade_settle.measured_settle_frame = 749; });
    await expectFailure(fx, /shell fade\/settle|settle boundary/u);
  } finally { await rm(fx.temp, {recursive: true, force: true}); }
});

test('rejects shell changes inside the measured stable plot-only phase', async () => {
  const fx = await fixture();
  try {
    await mutateAnalysis(fx, 1, (data) => {
      const row = data.per_frame_measurements.find((item) => item.source_frame === data.phases.stable_shell_plot_only.start_frame + 5);
      for (const region of row.shell_regions_vs_final) region.mean_abs_rgb = 5;
      row.shell_mean_abs_rgb_vs_final = 5;
    });
    await expectFailure(fx, /settle boundary|not stable/u);
  } finally { await rm(fx.temp, {recursive: true, force: true}); }
});

test('rejects global chart wipe', async () => {
  const fx = await fixture();
  try {
    await mutateAnalysis(fx, 1, (data) => { data.regions.global_chart_wipe_observed = true; data.regions.dynamic_plot_roi = [445, 230, 1030, 590]; });
    await expectFailure(fx, /global chart wipe|plot-local/u);
  } finally { await rm(fx.temp, {recursive: true, force: true}); }
});

test('rejects the previous 12-frame source/probe action-tail mismatch', async () => {
  const fx = await fixture();
  try {
    fx.manifest.samples[0].time_mapping.probe_end_frame += 12;
    fx.manifest.samples[0].probe.action_end_frame += 12;
    fx.manifest.samples[0].probe.hold.start_frame += 12;
    await saveManifest(fx);
    await expectFailure(fx, /action tail mismatch|not synchronized/u);
  } finally { await rm(fx.temp, {recursive: true, force: true}); }
});

test('rejects a substituted runtime path even with its hash updated', async () => {
  const fx = await fixture();
  try {
    fx.manifest.runtime.source_path = 'package.json';
    fx.manifest.runtime.source_sha256 = await shaFile(path.join(ROOT, 'package.json'));
    await saveManifest(fx);
    await expectFailure(fx, /runtime\/measurement source path substitution/u);
  } finally { await rm(fx.temp, {recursive: true, force: true}); }
});

test('rejects a rendered fixed-tanker step-card substitute after media hash rebinding', async () => {
  const fx = await fixture();
  try {
    const binding = fx.manifest.samples[0].probe;
    const file = localPath(fx.packageRoot, binding.path);
    await rm(file);
    const filter = "drawbox=x=250:y=570:w=1160:h=220:color=#242424:t=fill,drawbox=x=1270:y=310:w=105:h=145:color=#e87922:t=fill:enable='gte(n,15)',drawbox=x=1405:y=305:w=70:h=120:color=#181817:t=fill:enable='between(n,15,29)',drawbox=x=1405:y=305:w=140:h=120:color=#181817:t=fill:enable='between(n,30,44)',drawbox=x=1405:y=305:w=220:h=120:color=#181817:t=fill:enable='gte(n,45)'";
    const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=#ede9df:s=1920x1080:r=30:d=10', '-vf', filter, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file], {cwd: ROOT, windowsHide: true});
    assert.equal(result.status, 0, result.stderr?.toString());
    binding.sha256 = await shaFile(file);
    await saveManifest(fx);
    await expectFailure(fx, /rendered operator measurements|tanker trajectory|card swaps/u, {verifyMedia: true});
  } finally { await rm(fx.temp, {recursive: true, force: true}); }
});

test('rejects a rendered global chart wipe after media hash rebinding', async () => {
  const fx = await fixture();
  try {
    const binding = fx.manifest.samples[1].probe;
    const file = localPath(fx.packageRoot, binding.path);
    await rm(file);
    const filter = "drawbox=x=300:y=150:w=1320:h=760:color=#f8f5ee:t=fill,drawbox=x=300:y=150:w=220:h=760:color=#e87922:t=fill:enable='between(n,17,29)',drawbox=x=300:y=150:w=560:h=760:color=#e87922:t=fill:enable='between(n,30,59)',drawbox=x=300:y=150:w=960:h=760:color=#e87922:t=fill:enable='between(n,60,87)',drawbox=x=300:y=150:w=1320:h=760:color=#e87922:t=fill:enable='gte(n,88)'";
    const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=#ede9df:s=1920x1080:r=30:d=10', '-vf', filter, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file], {cwd: ROOT, windowsHide: true});
    assert.equal(result.status, 0, result.stderr?.toString());
    binding.sha256 = await shaFile(file);
    await saveManifest(fx);
    await expectFailure(fx, /rendered operator measurements|global chart wipe|plot-only/u, {verifyMedia: true});
  } finally { await rm(fx.temp, {recursive: true, force: true}); }
});

test('rejects changed evidence hash even when bundle declaration is recomputed', async () => {
  const fx = await fixture();
  try {
    fx.manifest.samples[0].evidence_frames[0].sha256 = '0'.repeat(64);
    await saveManifest(fx);
    await expectFailure(fx, /artifact hash mismatch/u);
  } finally { await rm(fx.temp, {recursive: true, force: true}); }
});

test('rejects source-frame identity mismatch', async () => {
  const fx = await fixture();
  try {
    await mutateAnalysis(fx, 0, (data) => { data.per_frame_measurements[12].raw_rgb_sha256 = 'f'.repeat(64); });
    await expectFailure(fx, /source-frame identity mismatch/u, {verifySource: true});
  } finally { await rm(fx.temp, {recursive: true, force: true}); }
});

test('rejects motion during the declared hold even after the media hash is updated', async () => {
  const fx = await fixture();
  try {
    const binding = fx.manifest.samples[0].probe;
    const file = localPath(fx.packageRoot, binding.path);
    await rm(file);
    const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=10', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file], {cwd: ROOT, windowsHide: true});
    assert.equal(result.status, 0);
    binding.sha256 = await shaFile(file);
    await saveManifest(fx);
    await expectFailure(fx, /motion detected during declared reading hold/u, {verifyMedia: true});
  } finally { await rm(fx.temp, {recursive: true, force: true}); }
});
