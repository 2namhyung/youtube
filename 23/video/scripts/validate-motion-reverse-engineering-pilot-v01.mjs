import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {measureProbe02, measureProbe03, measureSourceTanker} from './motion-reverse-pilot-render-measurements.mjs';

const ROOT = process.cwd();
const DEFAULT_PACKAGE = path.join(ROOT, 'video/qa/reference-study/motion-reverse-engineering-pilot-v01');
const PACKAGE_REL = 'video/qa/reference-study/motion-reverse-engineering-pilot-v01';
const EXPECTED_SOURCE_SHA = '0af9affa84a2e4b21f8e3f4ff45ff75650efdb229e742e8b25e678a10b41a9e9';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const shaFile = async (file) => sha(await readFile(file));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const must = (condition, message, errors) => { if (!condition) errors.push(message); };
const median = (values) => {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function run(command, args, {capture = false} = {}) {
  const result = spawnSync(command, args, {cwd: ROOT, encoding: capture ? 'utf8' : undefined, windowsHide: true, stdio: capture ? 'pipe' : 'ignore'});
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr ?? ''}`);
  return capture ? result.stdout : undefined;
}

function allArtifacts(manifest) {
  return manifest.samples.flatMap((sample) => [sample.analysis, sample.hypotheses, sample.probe_measurements, ...sample.masks, ...sample.evidence_frames, sample.reference_clip, sample.probe, ...sample.probe_frames, sample.side_by_side, sample.mobile_contact]);
}

function packageFile(packageRoot, recordedPath) {
  const normalized = recordedPath.replaceAll('\\', '/');
  if (normalized === PACKAGE_REL) return packageRoot;
  if (normalized.startsWith(`${PACKAGE_REL}/`)) return path.join(packageRoot, normalized.slice(PACKAGE_REL.length + 1));
  return path.join(ROOT, normalized);
}

async function labeledContainTile(file, width, height, label) {
  const image = await sharp(file).resize(width, height, {fit: 'contain', background: '#111'}).png().toBuffer();
  const svg = Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="17" fill="#000" fill-opacity=".72"/><text x="4" y="12" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="#fff">${label}</text></svg>`);
  return sharp(image).composite([{input: svg, left: 0, top: 0}]).png().toBuffer();
}

async function expectedContactRaw(packageRoot, sample) {
  const layers = [];
  for (let index = 0; index < sample.contact_inputs.length; index++) {
    const row = sample.contact_inputs[index];
    layers.push({input: await labeledContainTile(packageFile(packageRoot, row.source_path), 120, 101, `REF F${row.source_frame}`), left: index * 120, top: 0});
    layers.push({input: await labeledContainTile(packageFile(packageRoot, row.probe_path), 120, 102, `PROBE F${String(row.probe_frame).padStart(3, '0')}`), left: index * 120, top: 101});
  }
  return sharp({create: {width: 360, height: 203, channels: 3, background: '#111'}}).composite(layers).removeAlpha().raw().toBuffer();
}

function validateHypothesis(sampleId, data, errors) {
  must(data.sample_id === sampleId, `${sampleId}: hypothesis sample_id mismatch`, errors);
  must(Array.isArray(data.hypotheses) && data.hypotheses.length === 1, `${sampleId}: exactly one ranked hypothesis required`, errors);
  for (const item of data.hypotheses ?? []) {
    for (const key of ['observed_fact', 'candidate_operator', 'alternative_operator', 'error', 'human_review_status']) must(typeof item[key] === 'string' && item[key].trim(), `${sampleId}: hypothesis ${key} missing`, errors);
    must(Number.isFinite(item.confidence) && item.confidence > 0 && item.confidence < 1, `${sampleId}: hypothesis confidence must be probabilistic`, errors);
    must(Array.isArray(item.evidence_frames) && item.evidence_frames.length >= 7, `${sampleId}: hypothesis evidence_frames incomplete`, errors);
    must(item.human_review_status === 'pending', `${sampleId}: false human approval claim`, errors);
  }
}

function validateSample02(data, hypothesis, errors) {
  const expectedValues = [null, 25, 40, 57, 70, 89, 103, 116];
  must(equal(data.observed_sampled_values.map((x) => x.value), expectedValues), 'sample-02: sampled values must remain source-locked null→25→40→57→70→89→103→116', errors);
  must(data.method.ocr === 'unavailable-locally' && /manual/u.test(data.method.transcription), 'sample-02: OCR/manual-transcription limitation missing', errors);
  must(data.count_continuity.manual_values_monotonic === true, 'sample-02: non-monotonic numeric progression', errors);
  must(data.count_continuity.step_card_swap_rejected === true, 'sample-02: step-card hypothesis must be rejected', errors);
  must(data.count_continuity.adjacent_glyph_change_fraction >= 0.55, 'sample-02: insufficient framewise glyph changes; discrete states cannot pass', errors);
  const tanker = data.context_layers?.tanker;
  must(tanker?.motion_class === 'slow-translate' && tanker?.measurement?.method === 'threshold-mask integer translation maximizing intersection-over-union', 'sample-02: source tanker alignment method missing', errors);
  must(equal(tanker?.measurement?.roi, [250, 500, 1450, 350]) && tanker?.measurement?.grayscale_threshold_lt === 96, 'sample-02: source tanker threshold-mask method changed', errors);
  must(tanker?.measurement?.result?.dx_px >= 43 && tanker?.measurement?.result?.dx_px <= 49 && tanker?.measurement?.result?.dy_px >= 8 && tanker?.measurement?.result?.dy_px <= 14 && tanker?.measurement?.result?.iou >= 0.85, 'sample-02: tanker must translate slowly right/down by the measured amount', errors);
  must(data.context_layers?.ocean?.motion_class === 'source-footage-internal-motion', 'sample-02: ocean internal-motion layer classification missing', errors);
  must(data.count_continuity.moving_group_bbox_rejected === undefined, 'sample-02: obsolete moving-group rejection reintroduced', errors);
  must(equal(data.group_motion.expanded_measurement_roi, [1200, 250, 600, 430]), 'sample-02: expanded group ROI changed or early unit can be clipped', errors);
  const rows = data.per_frame_measurements ?? [];
  const settledAnchorY = median(rows.filter((row) => row.source_frame >= 615 && row.icon?.bbox).map((row) => row.icon.bbox[1]));
  must(settledAnchorY === data.group_motion.settled_icon_anchor_y_px, 'sample-02: settled group anchor is not measurement-derived', errors);
  const anchorRows = rows.filter((row) => row.icon?.bbox);
  must(data.group_motion.first_orange_icon_detected_frame === anchorRows[0]?.source_frame, 'sample-02: first group reveal frame is not measurement-derived', errors);
  const visibleRows = rows.filter((row) => row.source_frame >= 578 && row.icon?.bbox && row.number?.bbox && row.unit?.bbox);
  const translations = anchorRows.map((row) => row.icon.bbox[1] - settledAnchorY);
  for (const row of anchorRows) must(Math.abs(row.group_translation_y_px - (row.icon.bbox[1] - settledAnchorY)) <= 0.001, `sample-02: group trajectory is not derived from icon bbox at source frame ${row.source_frame}`, errors);
  const translationSpan = Math.max(...translations) - Math.min(...translations);
  must(translationSpan >= 80, 'sample-02: measured upward group travel was erased', errors);
  must(Math.abs(translationSpan - data.group_motion.observed_translation_range_px.span) <= 0.001, 'sample-02: declared group travel does not match per-frame measurements', errors);
  const downwardPairs = translations.slice(1).filter((value, index) => value <= translations[index] + 3).length;
  const downwardFraction = downwardPairs / Math.max(1, translations.length - 1);
  must(downwardFraction >= 0.7 && Math.abs(downwardFraction - data.group_motion.upward_or_settling_pair_fraction) <= 0.000001, 'sample-02: upward/settling trajectory conclusion is not measurement-derived', errors);
  const layoutRows = visibleRows.filter((row) => row.source_frame >= 585);
  const numberBaselines = layoutRows.map((row) => row.number.bbox[1] + row.number.bbox[3] - row.icon.bbox[1]);
  const unitTops = layoutRows.map((row) => row.unit.bbox[1] - row.icon.bbox[1]);
  for (const row of layoutRows) {
    must(row.internal_layout?.number_baseline_relative_to_icon_px === row.number.bbox[1] + row.number.bbox[3] - row.icon.bbox[1], `sample-02: internal numeric baseline is not bbox-derived at source frame ${row.source_frame}`, errors);
    must(row.internal_layout?.unit_top_relative_to_icon_px === row.unit.bbox[1] - row.icon.bbox[1], `sample-02: internal unit anchor is not bbox-derived at source frame ${row.source_frame}`, errors);
  }
  const numberMedian = median(numberBaselines), unitMedian = median(unitTops);
  const numberResidual = Math.max(...numberBaselines.map((value) => Math.abs(value - numberMedian)));
  const unitResidual = Math.max(...unitTops.map((value) => Math.abs(value - unitMedian)));
  must(numberMedian === data.internal_layout.number_baseline_relative_to_icon_median_px && numberResidual === data.internal_layout.number_baseline_max_residual_px, 'sample-02: numeric local-layout summary does not match bbox measurements', errors);
  must(unitMedian === data.internal_layout.unit_top_relative_to_icon_median_px && unitResidual === data.internal_layout.unit_top_max_residual_px, 'sample-02: unit local-layout summary does not match bbox measurements', errors);
  must(numberResidual <= 16 && unitResidual <= 16, 'sample-02: digits/unit drift independently after removing group translation', errors);
  must(data.implementation_contract.group_global_translation_required === true && data.implementation_contract.internal_layout_anchor === 'orange-icon', 'sample-02: moving-group/local-layout runtime contract missing', errors);
  must(equal(data.implementation_contract.tanker_translation_required_px, [46, 11]) && data.implementation_contract.tanker_translation_tolerance_px === 3, 'sample-02: tanker runtime translation contract missing', errors);
  must(data.implementation_contract.no_generic_card_swaps === true && data.implementation_contract.no_global_reveal === true, 'sample-02: forbidden replacement/global reveal not fail-closed', errors);
  validateHypothesis(data.sample_id, hypothesis, errors);
  must(hypothesis.rejected_hypotheses?.includes('three or more discrete replacement cards'), 'sample-02: discrete-card alternative not rejected', errors);
  must(hypothesis.rejected_hypotheses?.includes('geometrically fixed tanker'), 'sample-02: fixed-tanker alternative not rejected', errors);
  must(!hypothesis.rejected_hypotheses?.some((item) => /group translating|moving group/iu.test(item)), 'sample-02: observed group translation cannot be rejected', errors);
}

function validateSample03(data, hypothesis, errors) {
  must(equal(data.regions.chart_shell_registration_bbox, [445, 230, 1030, 590]), 'sample-03: chart shell registration ROI changed', errors);
  must(equal(data.regions.dynamic_plot_roi, [530, 330, 910, 425]), 'sample-03: dynamic scope must remain plot-local', errors);
  must(data.regions.shell_opacity_settle_observed === true, 'sample-03: measured shell fade/settle phase is missing', errors);
  must(data.regions.global_chart_wipe_observed === false, 'sample-03: global chart wipe is forbidden', errors);
  const rows = data.per_frame_measurements ?? [];
  for (const row of rows) {
    const derived = row.shell_regions_vs_final.reduce((sum, region) => sum + region.mean_abs_rgb, 0) / row.shell_regions_vs_final.length;
    must(Math.abs(derived - row.shell_mean_abs_rgb_vs_final) <= 0.0001, `sample-03: shell settle scalar is not ROI-derived at source frame ${row.source_frame}`, errors);
  }
  const threshold = data.phases.shell_fade_settle.mean_abs_rgb_vs_final_threshold;
  must(threshold === 3.2, 'sample-03: shell settle threshold changed', errors);
  const settleIndex = rows.findIndex((row, index) => rows.slice(index).every((candidate) => candidate.shell_mean_abs_rgb_vs_final <= threshold));
  const settleFrame = rows[settleIndex]?.source_frame;
  must(settleFrame === data.phases.shell_fade_settle.measured_settle_frame, 'sample-03: shell settle boundary is not measurement-derived', errors);
  const firstSeries = rows.find((row) => row.orange_series.pixel_count >= data.phases.plot_series_reveal.detection_minimum_orange_pixels)?.source_frame;
  must(data.phases.plot_series_reveal.detection_minimum_orange_pixels === 12 && firstSeries === data.phases.plot_series_reveal.first_detected_frame, 'sample-03: first plot-series frame is not measurement-derived', errors);
  const plotOnlyStart = Math.max(settleFrame, firstSeries);
  must(plotOnlyStart === data.phases.stable_shell_plot_only.start_frame, 'sample-03: stable-shell plot-only phase boundary mismatch', errors);
  const postSettleMax = Math.max(...rows.filter((row) => row.source_frame >= settleFrame).map((row) => row.shell_mean_abs_rgb_vs_final));
  must(data.measurements.initial_shell_mean_abs_rgb_vs_final >= postSettleMax * 4, 'sample-03: shell fade/settle is not measurable against final state', errors);
  must(postSettleMax <= threshold && Math.abs(postSettleMax - data.phases.shell_fade_settle.post_settle_maximum) <= 0.0001, 'sample-03: shell is not stable after measured settle frame', errors);
  const plotAtStart = rows.find((row) => row.source_frame === plotOnlyStart)?.plot.changed_fraction;
  must(data.measurements.final_plot_changed_fraction_at_threshold_48 > plotAtStart + 0.005, 'sample-03: plot does not continue changing during stable-shell plot-only phase', errors);
  must(data.implementation_contract.shell_settle_phase_required === true && data.implementation_contract.no_global_chart_wipe === true, 'sample-03: shell-settle/global-wipe guard missing', errors);
  must(data.hypothesis_comparison.stroke_draw.rank === 1 && data.hypothesis_comparison.plot_local_clip.rank === 2, 'sample-03: stroke-vs-clip comparison missing', errors);
  must(data.hypothesis_comparison.stroke_draw.confidence + data.hypothesis_comparison.plot_local_clip.confidence === 1, 'sample-03: hypothesis confidence sum mismatch', errors);
  must(data.measurements.final_plot_changed_fraction_at_threshold_48 > 0.005, 'sample-03: plot does not show measurable series change', errors);
  validateHypothesis(data.sample_id, hypothesis, errors);
  must(hypothesis.rejected_hypotheses?.includes('whole-chart image wipe'), 'sample-03: global chart wipe not rejected', errors);
}

function validateTimeMapping(sample, errors) {
  const mapping = sample.time_mapping;
  must(mapping?.mode === 'one-source-frame-to-one-probe-frame', `${sample.sample_id}: explicit 1:1 source/probe mapping missing`, errors);
  must(mapping?.source_start_frame === sample.source_window.start_frame && mapping?.source_end_frame === sample.source_window.end_frame, `${sample.sample_id}: mapping source window mismatch`, errors);
  must(mapping?.probe_start_frame === 0 && mapping?.probe_end_frame === sample.source_window.end_frame - sample.source_window.start_frame, `${sample.sample_id}: source/probe action tail mismatch`, errors);
  must(sample.probe.action_end_frame === mapping?.probe_end_frame && sample.probe.hold.start_frame === mapping?.probe_end_frame, `${sample.sample_id}: probe action/hold is not synchronized to source event end`, errors);
  for (const pair of mapping?.event_pairs ?? []) must(pair.probe_frame === pair.source_frame - mapping.source_start_frame, `${sample.sample_id}: event ${pair.label} mapping mismatch`, errors);
  for (const pair of mapping?.contact_pairs ?? []) must(pair.probe_frame === pair.source_frame - mapping.source_start_frame, `${sample.sample_id}: contact frame mapping mismatch`, errors);
}

async function ffprobe(file) {
  return JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,nb_frames,duration', '-of', 'json', file], {capture: true})).streams?.[0];
}

async function extractRaw(video, frame, temp) {
  const out = path.join(temp, `frame-${frame}-${Math.random().toString(16).slice(2)}.png`);
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-vf', `select='eq(n\\,${frame})'`, '-vsync', '0', '-frames:v', '1', out]);
  return sharp(out).removeAlpha().raw().toBuffer();
}

async function extractRawRange(video, endFrame, temp, prefix) {
  const dir = path.join(temp, prefix);
  await mkdir(dir, {recursive: true});
  const pattern = path.join(dir, 'frame-%06d.png');
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-vf', `select='between(n\,0\,${endFrame})'`, '-vsync', '0', '-start_number', '0', pattern]);
  const frames = new Map();
  for (let frame = 0; frame <= endFrame; frame++) frames.set(frame, await sharp(path.join(dir, `frame-${String(frame).padStart(6, '0')}.png`)).removeAlpha().raw().toBuffer());
  return frames;
}

function decodedDiff(a, b) {
  let sum = 0, max = 0;
  for (let index = 0; index < a.length; index++) { const value = Math.abs(a[index] - b[index]); sum += value; max = Math.max(max, value); }
  return {mean_abs_rgb: sum / a.length, max_abs_channel: max};
}

async function validateSourceFrames(manifest, analyses, errors, packageRoot) {
  const source = path.join(ROOT, manifest.source.local_path);
  const temp = await mkdtemp(path.join(os.tmpdir(), 'validate-motion-reverse-source-'));
  try {
    for (const sample of manifest.samples) {
      const data = analyses.get(sample.sample_id);
      const rows = data.per_frame_measurements;
      const start = rows[0].source_frame;
      const end = rows.at(-1).source_frame;
      const samplePrefix = sample.sample_id.startsWith('sample-02') ? 's02' : 's03';
      const pattern = path.join(temp, `${samplePrefix}-frame-%06d.png`);
      run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-vf', `select='between(n\\,${start}\\,${end})'`, '-vsync', '0', '-start_number', String(start), pattern]);
      let firstRaw = null, finalRaw = null;
      for (const row of data.per_frame_measurements) {
        const extracted = path.join(temp, `${samplePrefix}-frame-${String(row.source_frame).padStart(6, '0')}.png`);
        const raw = await sharp(extracted).removeAlpha().raw().toBuffer();
        if (row.source_frame === start) firstRaw = raw;
        if (row.source_frame === end) finalRaw = raw;
        const actual = sha(raw);
        must(actual === row.raw_rgb_sha256, `${sample.sample_id}: source-frame identity mismatch at ${row.source_frame}`, errors);
      }
      if (sample.sample_id.startsWith('sample-02')) {
        const measured = measureSourceTanker(firstRaw, finalRaw);
        must(equal(measured, data.context_layers?.tanker?.measurement), 'sample-02: tanker trajectory is not independently derived from locked source pixels', errors);
      }
      for (const event of sample.evidence_frames) {
        const eventRaw = sha(await sharp(packageFile(packageRoot, event.path)).removeAlpha().raw().toBuffer());
        const row = data.per_frame_measurements.find((item) => item.source_frame === event.source_frame);
        must(eventRaw === row?.raw_rgb_sha256, `${sample.sample_id}: evidence PNG is not source-frame ${event.source_frame}`, errors);
      }
    }
  } finally {
    await rm(temp, {recursive: true, force: true});
  }
}

async function validateMedia(manifest, errors, packageRoot) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'validate-motion-reverse-media-'));
  try {
    for (const sample of manifest.samples) {
      const probe = packageFile(packageRoot, sample.probe.path);
      const meta = await ffprobe(probe);
      must(meta?.width === 1920 && meta?.height === 1080 && meta?.avg_frame_rate === '30/1' && Number(meta?.nb_frames) === 300, `${sample.sample_id}: probe must be 1920x1080 30fps 300f`, errors);
      const holdFrames = [];
      for (const frame of sample.probe.hold.checked_frames) holdFrames.push(await extractRaw(probe, frame, temp));
      const holdDiffs = holdFrames.slice(1).map((raw) => decodedDiff(holdFrames[0], raw));
      must(holdDiffs.every((diff) => diff.mean_abs_rgb <= 0.25 && diff.max_abs_channel <= 32), `${sample.sample_id}: motion detected during declared reading hold`, errors);
      must(299 - sample.probe.hold.start_frame + 1 >= 60, `${sample.sample_id}: reading hold shorter than 60 frames`, errors);
      const actionRaws = await extractRawRange(probe, sample.probe.action_end_frame, temp, `${sample.sample_id}-action`);
      const measured = sample.sample_id.startsWith('sample-02') ? measureProbe02(actionRaws) : measureProbe03(actionRaws);
      const declared = JSON.parse(await readFile(packageFile(packageRoot, sample.probe_measurements.path), 'utf8'));
      must(equal(measured, declared), `${sample.sample_id}: rendered operator measurements do not match bound measurement artifact`, errors);
      if (sample.sample_id.startsWith('sample-02')) {
        must(Number.isFinite(measured.tanker.dx_px) && Number.isFinite(measured.tanker.dy_px) && Number.isFinite(measured.tanker.iou) && Math.abs(measured.tanker.dx_px - 46) <= 3 && Math.abs(measured.tanker.dy_px - 11) <= 3 && measured.tanker.iou >= 0.9, 'sample-02: rendered tanker trajectory is fixed or has wrong direction/magnitude', errors);
        const translations = measured.numeric_group.trajectory.map((row) => row.translation_y_vs_final_px);
        must(translations.every(Number.isFinite) && translations[0] >= 105 && translations[1] >= 15 && translations[1] <= 30 && Math.abs(translations[2]) <= 2 && Math.abs(translations[3]) <= 2, 'sample-02: rendered numeric-group rise/settle trajectory mismatch', errors);
        must(measured.count.adjacent_glyph_change_fraction >= 0.65 && measured.count.distinct_glyph_signatures >= 25, 'sample-02: rendered count behaves like discrete card swaps instead of framewise glyph change', errors);
        must(Number.isFinite(measured.count.baseline_max_residual_px) && measured.count.baseline_max_residual_px <= 8, 'sample-02: rendered numeric glyph drifts inside the moving group', errors);
      } else {
        must(measured.shell.initial_to_settled_mean_abs_rgb >= 2, 'sample-03: rendered shell opacity-settle phase is missing', errors);
        must(measured.shell.post_settle_max_mean_abs_rgb <= 0.8, 'sample-03: rendered shell continues changing during plot-only phase; global chart wipe rejected', errors);
        must(measured.plot.first_orange_frame === 17 && measured.plot.right_edge_growth_px >= 800 && measured.plot.monotonic_pair_fraction >= 0.95 && measured.plot.mean_abs_rgb_first_to_final >= 1, 'sample-03: rendered plot-only endpoint progression is missing or non-monotonic', errors);
      }
      const compareMeta = await ffprobe(packageFile(packageRoot, sample.side_by_side.path));
      must(compareMeta?.width === 1920 && compareMeta?.height === 1080 && compareMeta?.avg_frame_rate === '30/1' && Number(compareMeta?.nb_frames) === 300, `${sample.sample_id}: side-by-side must be 1920x1080 30fps 300f`, errors);
      must(sample.mobile_contact.width === 360 && sample.mobile_contact.height === 203, `${sample.sample_id}: mobile contact must be 360x203`, errors);
      must(equal(sample.contact_layout, {canvas: [360, 203], columns: 3, reference_cell: [120, 101], probe_cell: [120, 102], source_frame_aspect_ratio: '16:9', fit: 'contain', letterbox_background: '#111', label_height: 17, label_source: 'exact contact_pairs source/probe frame pair'}), `${sample.sample_id}: contact contain contract mismatch`, errors);
      must(equal(sample.contact_inputs.map((row) => [row.source_frame, row.probe_frame]), sample.time_mapping.contact_pairs.map((row) => [row.source_frame, row.probe_frame])), `${sample.sample_id}: contact frame labels do not match timing contract`, errors);
      const contact = await sharp(packageFile(packageRoot, sample.mobile_contact.path)).removeAlpha().raw().toBuffer();
      must(contact.equals(await expectedContactRaw(packageRoot, sample)), `${sample.sample_id}: contact pixels are cropped or labels/frame pairs are dishonest`, errors);
    }
  } finally {
    await rm(temp, {recursive: true, force: true});
  }
}

export async function validatePilot({packageRoot = DEFAULT_PACKAGE, verifySource = true, verifyMedia = true} = {}) {
  const errors = [];
  const manifestPath = path.join(packageRoot, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  must(manifest.package_id === 'motion-reverse-engineering-pilot-v01', 'package_id mismatch', errors);
  must(manifest.status === 'technical-pilot-complete-pending-human-review' && manifest.human_pass === false && manifest.production_authority === false && manifest.active_cut_root === null, 'pilot must remain non-production/pending-human-review', errors);
  must(manifest.source.sha256 === EXPECTED_SOURCE_SHA, 'locked source declaration mismatch', errors);
  must(await shaFile(path.join(ROOT, manifest.source.local_path)) === EXPECTED_SOURCE_SHA, 'locked source bytes changed', errors);
  must(await shaFile(path.join(ROOT, manifest.runtime.entry_path)) === manifest.runtime.entry_sha256, 'entrypoint hash mismatch', errors);
  must(await shaFile(path.join(ROOT, manifest.runtime.source_path)) === manifest.runtime.source_sha256, 'runtime source hash mismatch', errors);
  must(manifest.runtime.entry_path === 'video/src/motion-reverse-engineering-pilot-v01-index.tsx' && manifest.runtime.source_path === 'video/src/motion-reverse-engineering-pilot-v01.tsx' && manifest.runtime.measurement_source_path === 'video/scripts/motion-reverse-pilot-render-measurements.mjs', 'pilot runtime/measurement source path substitution', errors);
  must(await shaFile(path.join(ROOT, manifest.runtime.measurement_source_path)) === manifest.runtime.measurement_source_sha256, 'measurement runtime source hash mismatch', errors);
  must(equal(manifest.runtime.registered_compositions, ['MotionReversePilot02-Provisional', 'MotionReversePilot03-Provisional']), 'registered composition set mismatch', errors);
  must(equal(manifest.samples.map((x) => x.sample_id), ['sample-02-numeric-step-progression', 'sample-03-chart-reveal']), 'exact sample set/order required', errors);

  const artifacts = allArtifacts(manifest);
  const expectedBundle = sha(artifacts.map((item) => `${item.kind}|${item.path}|${item.sha256}`).sort().join('\n'));
  must(expectedBundle === manifest.artifact_bundle_sha256, 'artifact bundle hash mismatch', errors);
  for (const item of artifacts) {
    const file = packageFile(packageRoot, item.path);
    try { must(await shaFile(file) === item.sha256, `artifact hash mismatch: ${item.path}`, errors); } catch { errors.push(`artifact missing: ${item.path}`); }
  }

  const analyses = new Map();
  for (const sample of manifest.samples) {
    validateTimeMapping(sample, errors);
    const data = JSON.parse(await readFile(packageFile(packageRoot, sample.analysis.path), 'utf8'));
    const hypothesis = JSON.parse(await readFile(packageFile(packageRoot, sample.hypotheses.path), 'utf8'));
    analyses.set(sample.sample_id, data);
    must(data.status === 'operator-inference-pending-human-review' && data.production_authority === false && data.human_review_status === 'pending', `${sample.sample_id}: false authority/PASS`, errors);
    must(data.source_binding.sha256 === EXPECTED_SOURCE_SHA, `${sample.sample_id}: source binding mismatch`, errors);
    must(equal(data.operator_hypotheses, hypothesis), `${sample.sample_id}: analysis/hypothesis artifact divergence`, errors);
    if (sample.sample_id.startsWith('sample-02')) validateSample02(data, hypothesis, errors);
    else validateSample03(data, hypothesis, errors);
  }
  if (verifySource) await validateSourceFrames(manifest, analyses, errors, packageRoot);
  if (verifyMedia) await validateMedia(manifest, errors, packageRoot);
  if (errors.length) throw new Error(`motion reverse-engineering pilot validation failed:\n- ${errors.join('\n- ')}`);
  return {ok: true, samples: manifest.samples.length, artifacts: artifacts.length, source_frames: [...analyses.values()].reduce((sum, data) => sum + data.per_frame_measurements.length, 0)};
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const index = process.argv.indexOf('--package-root');
  const packageRoot = index >= 0 ? path.resolve(process.argv[index + 1]) : DEFAULT_PACKAGE;
  try {
    const result = await validatePilot({packageRoot});
    console.log(`motion reverse-engineering pilot valid: ${result.samples} samples, ${result.artifacts} artifacts, ${result.source_frames} source frames`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
