import {createHash} from 'node:crypto';

export const FRAME_WIDTH = 1920;
export const FRAME_HEIGHT = 1080;
export const SOURCE_TANKER_METHOD = {
  roi: [250, 500, 1450, 350],
  grayscale_threshold_lt: 96,
  centroid_seed_search_radius_px: 16,
};

const round = (value, digits = 6) => +value.toFixed(digits);
const grayscale = (raw, index) => (raw[index] + raw[index + 1] + raw[index + 2]) / 3;

function excluded(x, y, rectangles) {
  return rectangles.some(([left, top, width, height]) => x >= left && y >= top && x < left + width && y < top + height);
}

function thresholdMask(raw, width, height, roi, threshold, excludeRects = []) {
  const mask = new Uint8Array(roi[2] * roi[3]);
  const points = [];
  let sumX = 0, sumY = 0;
  for (let localY = 0; localY < roi[3]; localY++) for (let localX = 0; localX < roi[2]; localX++) {
    const x = roi[0] + localX, y = roi[1] + localY;
    if (x < 0 || y < 0 || x >= width || y >= height || excluded(x, y, excludeRects)) continue;
    const index = (y * width + x) * 3;
    if (grayscale(raw, index) >= threshold) continue;
    const offset = localY * roi[2] + localX;
    mask[offset] = 1;
    points.push(offset);
    sumX += localX;
    sumY += localY;
  }
  return {mask, points, count: points.length, centroid: points.length ? [sumX / points.length, sumY / points.length] : null};
}

export function bestThresholdMaskAlignment(rawStart, rawEnd, {width = FRAME_WIDTH, height = FRAME_HEIGHT, roi, threshold, searchRadius = 16, excludeRects = []}) {
  const start = thresholdMask(rawStart, width, height, roi, threshold, excludeRects);
  const end = thresholdMask(rawEnd, width, height, roi, threshold, excludeRects);
  if (!start.centroid || !end.centroid) return {dx_px: null, dy_px: null, iou: 0, start_mask_pixels: start.count, end_mask_pixels: end.count};
  const seedX = Math.round(end.centroid[0] - start.centroid[0]);
  const seedY = Math.round(end.centroid[1] - start.centroid[1]);
  let best = {iou: -1, dx_px: null, dy_px: null, intersection_pixels: 0, union_pixels: 0};
  for (let dy = seedY - searchRadius; dy <= seedY + searchRadius; dy++) for (let dx = seedX - searchRadius; dx <= seedX + searchRadius; dx++) {
    let shiftedStartCount = 0, intersection = 0;
    for (const offset of start.points) {
      const localX = offset % roi[2], localY = Math.floor(offset / roi[2]);
      const shiftedX = localX + dx, shiftedY = localY + dy;
      if (shiftedX < 0 || shiftedY < 0 || shiftedX >= roi[2] || shiftedY >= roi[3]) continue;
      shiftedStartCount++;
      if (end.mask[shiftedY * roi[2] + shiftedX]) intersection++;
    }
    const union = shiftedStartCount + end.count - intersection;
    const iou = union ? intersection / union : 0;
    if (iou > best.iou) best = {dx_px: dx, dy_px: dy, iou, intersection_pixels: intersection, union_pixels: union};
  }
  return {...best, iou: round(best.iou), start_mask_pixels: start.count, end_mask_pixels: end.count, centroid_seed_px: [seedX, seedY], search_radius_px: searchRadius};
}

export function measureSourceTanker(rawStart, rawEnd) {
  return {
    method: 'threshold-mask integer translation maximizing intersection-over-union',
    ...SOURCE_TANKER_METHOD,
    result: bestThresholdMaskAlignment(rawStart, rawEnd, {roi: SOURCE_TANKER_METHOD.roi, threshold: SOURCE_TANKER_METHOD.grayscale_threshold_lt, searchRadius: SOURCE_TANKER_METHOD.centroid_seed_search_radius_px}),
  };
}

function bboxFor(raw, rect, predicate, width = FRAME_WIDTH, height = FRAME_HEIGHT) {
  let minX = width, minY = height, maxX = -1, maxY = -1, count = 0, sumX = 0, sumY = 0;
  for (let y = rect[1]; y < rect[1] + rect[3]; y++) for (let x = rect[0]; x < rect[0] + rect[2]; x++) {
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const index = (y * width + x) * 3;
    if (!predicate(raw[index], raw[index + 1], raw[index + 2], x, y)) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    count++; sumX += x; sumY += y;
  }
  return count ? {bbox: [minX, minY, maxX - minX + 1, maxY - minY + 1], pixel_count: count, centroid: [round(sumX / count, 3), round(sumY / count, 3)]} : {bbox: null, pixel_count: 0, centroid: null};
}

function maskSignature(raw, rect, predicate, width = FRAME_WIDTH, height = FRAME_HEIGHT) {
  const mask = Buffer.alloc(rect[2] * rect[3]);
  let position = 0;
  for (let y = rect[1]; y < rect[1] + rect[3]; y++) for (let x = rect[0]; x < rect[0] + rect[2]; x++) {
    const index = (y * width + x) * 3;
    mask[position++] = x >= 0 && y >= 0 && x < width && y < height && predicate(raw[index], raw[index + 1], raw[index + 2]) ? 255 : 0;
  }
  return createHash('sha256').update(mask).digest('hex');
}

function meanAbsRois(a, b, rois, width = FRAME_WIDTH) {
  let sum = 0, channels = 0;
  for (const rect of rois) for (let y = rect[1]; y < rect[1] + rect[3]; y++) for (let x = rect[0]; x < rect[0] + rect[2]; x++) {
    const index = (y * width + x) * 3;
    for (let channel = 0; channel < 3; channel++) { sum += Math.abs(a[index + channel] - b[index + channel]); channels++; }
  }
  return round(sum / channels, 6);
}

export function measureProbe02(rawByFrame) {
  const tanker = bestThresholdMaskAlignment(rawByFrame.get(0), rawByFrame.get(60), {
    roi: [180, 480, 1600, 330], threshold: 100, searchRadius: 16, excludeRects: [[1200, 480, 550, 60]],
  });
  const iconFrames = [15, 22, 30, 60];
  const iconMeasurements = iconFrames.map((frame) => ({frame, ...bboxFor(rawByFrame.get(frame), [1200, 250, 600, 430], (r, g, b) => r > 150 && r - g > 30 && g - b > 8)}));
  const finalIconY = iconMeasurements.at(-1).centroid?.[1] ?? null;
  const groupTrajectory = iconMeasurements.map((item) => ({
    frame: item.frame,
    centroid_y_px: item.centroid?.[1] ?? null,
    translation_y_vs_final_px: item.centroid && finalIconY !== null ? round(item.centroid[1] - finalIconY, 3) : null,
    bbox: item.bbox,
  }));
  const glyphRows = [];
  for (let frame = 15; frame <= 60; frame++) {
    const raw = rawByFrame.get(frame);
    const icon = bboxFor(raw, [1200, 250, 600, 430], (r, g, b) => r > 150 && r - g > 30 && g - b > 8);
    if (!icon.bbox) continue;
    const numberRoi = [1400, Math.round(icon.bbox[1] - 12), 350, 160];
    const number = bboxFor(raw, numberRoi, (r, g, b) => (r + g + b) / 3 < 160);
    glyphRows.push({
      frame,
      signature: maskSignature(raw, numberRoi, (r, g, b) => (r + g + b) / 3 < 160),
      baseline_relative_to_icon_px: number.bbox ? number.bbox[1] + number.bbox[3] - icon.bbox[1] : null,
    });
  }
  const adjacentChanges = glyphRows.slice(1).filter((row, index) => row.signature !== glyphRows[index].signature).length;
  const baselines = glyphRows.map((row) => row.baseline_relative_to_icon_px).filter(Number.isFinite).sort((a, b) => a - b);
  const baselineMedian = baselines.length === 0 ? null : baselines.length % 2 ? baselines[Math.floor(baselines.length / 2)] : (baselines[baselines.length / 2 - 1] + baselines[baselines.length / 2]) / 2;
  const translations = groupTrajectory.map((row) => row.translation_y_vs_final_px).filter(Number.isFinite);
  return {
    sample_id: 'sample-02-numeric-step-progression',
    tanker: {measurement_roi: [180, 480, 1600, 330], excluded_numeric_roi: [1200, 480, 550, 60], threshold_lt: 100, ...tanker},
    numeric_group: {trajectory: groupTrajectory, observed_upward_span_px: translations.length > 1 ? round(Math.max(...translations) - Math.min(...translations), 3) : null},
    count: {frames: [15, 60], adjacent_pairs: Math.max(0, glyphRows.length - 1), adjacent_glyph_change_count: adjacentChanges, adjacent_glyph_change_fraction: glyphRows.length > 1 ? round(adjacentChanges / (glyphRows.length - 1)) : 0, distinct_glyph_signatures: new Set(glyphRows.map((row) => row.signature)).size, baseline_relative_to_icon_median_px: baselineMedian, baseline_max_residual_px: baselineMedian === null ? null : Math.max(...baselines.map((value) => Math.abs(value - baselineMedian)))},
  };
}

export function measureProbe03(rawByFrame) {
  const shellRois = [[340, 180, 600, 90], [360, 810, 1200, 80]];
  const plotRoi = [420, 295, 1080, 500];
  const shellInitialChange = meanAbsRois(rawByFrame.get(0), rawByFrame.get(14), shellRois);
  let shellStableMaximum = 0;
  for (let frame = 14; frame <= 88; frame++) shellStableMaximum = Math.max(shellStableMaximum, meanAbsRois(rawByFrame.get(14), rawByFrame.get(frame), shellRois));
  const orangeRows = [];
  for (let frame = 0; frame <= 88; frame++) {
    const orange = bboxFor(rawByFrame.get(frame), plotRoi, (r, g, b) => r > 150 && r - g > 35 && g - b > 5);
    orangeRows.push({frame, pixel_count: orange.pixel_count, right_edge_x: orange.bbox ? orange.bbox[0] + orange.bbox[2] - 1 : null});
  }
  const first = orangeRows.find((row) => row.pixel_count >= 10);
  const detected = orangeRows.filter((row) => row.right_edge_x !== null);
  const monotonicPairs = detected.slice(1).filter((row, index) => row.right_edge_x + 2 >= detected[index].right_edge_x).length;
  return {
    sample_id: 'sample-03-chart-reveal',
    shell: {measurement_rois: shellRois, settle_frame: 14, initial_to_settled_mean_abs_rgb: shellInitialChange, post_settle_max_mean_abs_rgb: round(shellStableMaximum, 6)},
    plot: {measurement_roi: plotRoi, first_orange_frame: first?.frame ?? null, first_right_edge_x: first?.right_edge_x ?? null, final_right_edge_x: detected.at(-1)?.right_edge_x ?? null, right_edge_growth_px: first && detected.length ? detected.at(-1).right_edge_x - first.right_edge_x : 0, monotonic_pair_fraction: round(monotonicPairs / Math.max(1, detected.length - 1)), mean_abs_rgb_first_to_final: meanAbsRois(rawByFrame.get(first?.frame ?? 17), rawByFrame.get(88), [plotRoi])},
  };
}
