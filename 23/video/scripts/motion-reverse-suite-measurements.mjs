import {createHash} from 'node:crypto';

export const PROBE_WIDTH = 1920;
export const PROBE_HEIGHT = 1080;

const round = (value, digits = 6) => Number.isFinite(value) ? +value.toFixed(digits) : null;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const color = (target, tolerance = 38) => (r, g, b) => Math.abs(r - target[0]) <= tolerance && Math.abs(g - target[1]) <= tolerance && Math.abs(b - target[2]) <= tolerance;
const COLORS = {
  blue: color([40, 100, 199]), red: color([213, 67, 53]), green: color([43, 155, 104]), orange: color([232, 121, 46]),
  purple: color([118, 81, 181]), pink: color([193, 59, 138]), cyan: color([54, 169, 189]), navy: color([22, 67, 91], 24), plate: color([203, 211, 212], 15), ink: color([32, 36, 42], 32),
};

export function maskMeasure(raw, rect, predicate, width = PROBE_WIDTH, height = PROBE_HEIGHT) {
  if (!raw) return {bbox: null, pixel_count: 0, centroid: null};
  let minX = width, minY = height, maxX = -1, maxY = -1, count = 0, sumX = 0, sumY = 0;
  const x0 = Math.max(0, rect[0]), y0 = Math.max(0, rect[1]), x1 = Math.min(width, rect[0] + rect[2]), y1 = Math.min(height, rect[1] + rect[3]);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * width + x) * 3;
    if (!predicate(raw[i], raw[i + 1], raw[i + 2], x, y)) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); count++; sumX += x; sumY += y;
  }
  return count ? {bbox: [minX, minY, maxX - minX + 1, maxY - minY + 1], pixel_count: count, centroid: [round(sumX / count, 3), round(sumY / count, 3)]} : {bbox: null, pixel_count: 0, centroid: null};
}

export function meanAbs(rawA, rawB, rect, width = PROBE_WIDTH, height = PROBE_HEIGHT) {
  if (!rawA || !rawB) return null;
  let sum = 0, channels = 0;
  const x0 = Math.max(0, rect[0]), y0 = Math.max(0, rect[1]), x1 = Math.min(width, rect[0] + rect[2]), y1 = Math.min(height, rect[1] + rect[3]);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * width + x) * 3;
    for (let c = 0; c < 3; c++) { sum += Math.abs(rawA[i + c] - rawB[i + c]); channels++; }
  }
  return round(sum / Math.max(1, channels));
}

export function diffMeasure(rawA, rawB, width, height, threshold = 24) {
  if (!rawA || !rawB) return {mean_abs_rgb: null, changed_fraction: null, change_bbox: null};
  let sum = 0, changed = 0, minX = width, minY = height, maxX = -1, maxY = -1;
  for (let p = 0; p < width * height; p++) {
    const i = p * 3;
    const d = (Math.abs(rawA[i] - rawB[i]) + Math.abs(rawA[i + 1] - rawB[i + 1]) + Math.abs(rawA[i + 2] - rawB[i + 2])) / 3;
    sum += d;
    if (d < threshold) continue;
    const x = p % width, y = Math.floor(p / width);
    changed++; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return {mean_abs_rgb: round(sum / (width * height)), changed_fraction: round(changed / (width * height)), change_bbox: changed ? [minX, minY, maxX - minX + 1, maxY - minY + 1] : null};
}

export function regionSignature(raw, rect, predicate = () => true, width = PROBE_WIDTH, height = PROBE_HEIGHT) {
  if (!raw) return null;
  const bytes = [];
  const x0 = Math.max(0, rect[0]), y0 = Math.max(0, rect[1]), x1 = Math.min(width, rect[0] + rect[2]), y1 = Math.min(height, rect[1] + rect[3]);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * width + x) * 3;
    if (predicate(raw[i], raw[i + 1], raw[i + 2], x, y)) bytes.push(raw[i], raw[i + 1], raw[i + 2]);
  }
  return hash(Buffer.from(bytes));
}

function trajectory(raws, frames, rect, predicate) {
  return frames.map((frame) => ({frame, ...maskMeasure(raws.get(frame), rect, predicate)}));
}

function orientation(raw, rect, predicate) {
  const points = [];
  for (let y = rect[1]; y < rect[1] + rect[3]; y += 2) for (let x = rect[0]; x < rect[0] + rect[2]; x += 2) {
    const i = (y * PROBE_WIDTH + x) * 3;
    if (predicate(raw[i], raw[i + 1], raw[i + 2], x, y)) points.push([x, y]);
  }
  if (points.length < 10) return null;
  const mx = points.reduce((s, q) => s + q[0], 0) / points.length, my = points.reduce((s, q) => s + q[1], 0) / points.length;
  let xx = 0, yy = 0, xy = 0;
  for (const [x, y] of points) { const dx = x - mx, dy = y - my; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
  return round(Math.atan2(2 * xy, xx - yy) * 90 / Math.PI, 3);
}

export function measureProbeSample(sampleNumber, raws) {
  const full = [0, 0, PROBE_WIDTH, PROBE_HEIGHT];
  if (sampleNumber === 1) {
    const building = trajectory(raws, [0, 27, 48, 75], full, COLORS.blue);
    const left = trajectory(raws, [27, 48, 75], full, COLORS.red);
    const right = trajectory(raws, [48, 60, 75], full, COLORS.green);
    const overlapRoi = [360, 250, 1200, 650];
    return {sample_number: 1, building, left_person: left, right_person: right, final_person_pixels_inside_building_bbox: maskMeasure(raws.get(75), overlapRoi, (r,g,b) => COLORS.red(r,g,b) || COLORS.green(r,g,b)).pixel_count};
  }
  if (sampleNumber === 4) {
    const mapFrames = [0, 49, 50, 97, 142, 187, 188, 239];
    return {
      sample_number: 4,
      continuous_map_landmarks: trajectory(raws, mapFrames, full, COLORS.navy),
      continuity_boundaries: [[49,50],[187,188]].map(([before,after]) => ({before_frame: before, after_frame: after, full_mean_abs_rgb: meanAbs(raws.get(before), raws.get(after), full), outside_flash_mean_abs_rgb: meanAbs(raws.get(before), raws.get(after), [0,0,650,1080])})),
      us_person: trajectory(raws, [0, 7, 14, 18, 49, 97, 239], full, COLORS.green),
      us_marker: trajectory(raws, [0, 7, 14, 18, 49, 97, 239], full, COLORS.purple),
      middle_israel: trajectory(raws, [49, 97, 187, 239], full, COLORS.cyan),
      middle_aircraft: trajectory(raws, [97, 142, 187, 239], full, COLORS.blue),
      middle_iran_border: trajectory(raws, [97, 142, 170, 239], full, COLORS.red),
      final_route: trajectory(raws, [187, 196, 210, 239], full, COLORS.pink),
      explosion_flash: trajectory(raws, [187, 188, 194, 207, 239], [760, 250, 650, 550], COLORS.orange),
    };
  }
  if (sampleNumber === 5) {
    const chart = trajectory(raws, [0, 13, 26], full, COLORS.orange);
    const map = trajectory(raws, [0, 13, 26], full, COLORS.cyan);
    const flag = trajectory(raws, [0, 13, 26], full, COLORS.red);
    return {sample_number: 5, chart, preserved_map: map, flag, map_area_ratio_final_vs_initial: map[0].pixel_count ? round(map[2].pixel_count / map[0].pixel_count) : null, flag_offset_from_map: map.map((m, i) => m.centroid && flag[i].centroid ? [round(flag[i].centroid[0] - m.centroid[0], 3), round(flag[i].centroid[1] - m.centroid[1], 3)] : null)};
  }
  if (sampleNumber === 6) {
    const frames = [0, 3, 15];
    const tanker = trajectory(raws, frames, full, COLORS.blue), number = trajectory(raws, frames, full, COLORS.orange), subtitle = trajectory(raws, frames, full, COLORS.purple);
    const fullSceneNonBase = [0, 3, 15].map((frame) => ({frame, ...maskMeasure(raws.get(frame), full, (r,g,b) => Math.abs(r-17)>12 || Math.abs(g-17)>12 || Math.abs(b-17)>12)}));
    return {sample_number: 6, scene_children: {tanker, number, subtitle}, child_dx_0_to_3: [tanker, number, subtitle].map((rows) => rows[0].centroid && rows[1].centroid ? round(rows[1].centroid[0] - rows[0].centroid[0], 3) : null), residual_scene_pixels_at_exit: [tanker[2].pixel_count, number[2].pixel_count, subtitle[2].pixel_count], full_scene_non_base: fullSceneNonBase, adjacent_hard_cut_mean_abs_rgb: meanAbs(raws.get(30), raws.get(31), full)};
  }
  if (sampleNumber === 7) {
    const gallery = trajectory(raws, [85, 128, 181], full, (r,g,b) => COLORS.red(r,g,b) || COLORS.blue(r,g,b) || COLORS.green(r,g,b) || COLORS.orange(r,g,b) || COLORS.purple(r,g,b));
    return {sample_number: 7, overlay_left: trajectory(raws, [18, 32, 68, 84], full, COLORS.red), overlay_right: trajectory(raws, [48, 68, 84], full, (r,g,b) => COLORS.blue(r,g,b) || COLORS.green(r,g,b)), first_hard_cut_mean_abs_rgb: meanAbs(raws.get(84), raws.get(85), full), gallery, second_hard_cut_mean_abs_rgb: meanAbs(raws.get(181), raws.get(182), full), title_state_signatures: [182, 208, 229, 239].map((frame) => ({frame, signature: regionSignature(raws.get(frame), full)}))};
  }
  if (sampleNumber === 8) {
    // Restrict the mask to the editorial presenter wrapper. Full-frame color
    // matching also sees antialiased screen chrome and cannot prove wrapper
    // geometry stability.
    const presenterRoi = [520, 60, 880, 980];
    const plate = trajectory(raws, [0, 60, 176, 239], presenterRoi, COLORS.plate);
    return {sample_number: 8, presenter_plate: plate, presenter_internal_motion_mean_abs_rgb: meanAbs(raws.get(0), raws.get(6), [860, 280, 220, 140]), right_handshake: trajectory(raws, [36, 60, 239], full, COLORS.green), left_tombstone: trajectory(raws, [136, 176, 239], full, COLORS.purple), right_person: trajectory(raws, [196, 220, 239], full, COLORS.red)};
  }
  if (sampleNumber === 9) {
    const deviceRoi = [880, 20, 600, 1040];
    const shellPredicate = (r, g, b, x, y) => COLORS.ink(r,g,b) && (x < 970 || x > 1370 || y < 170 || y > 900);
    const shell = trajectory(raws, [0, 10, 20, 30, 60, 95, 240, 299], deviceRoi, shellPredicate);
    const screenRect = [900, 100, 600, 800];
    const adjacent = [];
    for (let frame = 1; frame <= 60; frame++) adjacent.push(meanAbs(raws.get(frame - 1), raws.get(frame), screenRect));
    return {
      sample_number: 9,
      phone_shell: shell,
      shell_orientation_degrees: [0, 30, 60, 95, 240].map((frame) => ({frame, degrees: orientation(raws.get(frame), deviceRoi, shellPredicate)})),
      screen_state_signatures: [0, 10, 20, 30, 60, 95].map((frame) => ({frame, signature: regionSignature(raws.get(frame), screenRect)})),
      screen_adjacent_change_fraction_0_to_60: round(adjacent.filter((value) => value > .05).length / adjacent.length),
      chart_progress: trajectory(raws, [10, 20, 30, 60], screenRect, COLORS.green),
      screen_value_hold_mean_abs_rgb_60_to_95: meanAbs(raws.get(60), raws.get(95), screenRect),
      screen_endpoint_hold_mean_abs_rgb: meanAbs(raws.get(95), raws.get(240), screenRect),
      support_icon_a: trajectory(raws, [20, 29, 30, 60, 95, 240], [1450, 120, 340, 310], COLORS.pink),
      support_icon_b: trajectory(raws, [20, 29, 30, 60, 95, 240], [1450, 380, 340, 310], COLORS.cyan),
      post_endpoint_hold_mean_abs_rgb: meanAbs(raws.get(95), raws.get(240), full),
    };
  }
  if (sampleNumber === 10) {
    const snack = trajectory(raws, [15, 63, 79, 109, 199, 207], full, COLORS.orange);
    const phone = trajectory(raws, [109, 123, 180, 199, 207], full, COLORS.pink);
    return {
      sample_number: 10,
      snack,
      phone,
      snack_stability_mean_abs_rgb_79_to_199: meanAbs(raws.get(79), raws.get(199), [150, 330, 760, 390]),
      left_value_state_signatures: [63, 79, 199].map((frame) => ({frame, signature: regionSignature(raws.get(frame), [150, 650, 760, 130])})),
      right_value_state_signatures: [109, 150, 199].map((frame) => ({frame, signature: regionSignature(raws.get(frame), [1000, 650, 720, 130])})),
      phone_end_value: trajectory(raws, [123, 198, 199, 207], [1000, 680, 800, 100], COLORS.pink),
      adjacent_hard_cut_mean_abs_rgb: meanAbs(raws.get(207), raws.get(208), full),
    };
  }
  throw new Error(`unsupported suite sample ${sampleNumber}`);
}

export const probeFramesRequired = {
  1: [0, 27, 48, 60, 75], 4: [0, 7, 14, 18, 49, 50, 97, 142, 170, 187, 188, 194, 196, 207, 210, 218, 239],
  5: [0, 13, 26], 6: [0, 3, 15, 30, 31], 7: [18, 32, 48, 68, 84, 85, 128, 181, 182, 208, 229, 239],
  8: [0, 6, 36, 60, 136, 176, 196, 220, 239], 9: [...Array.from({length: 61}, (_, frame) => frame), 95, 240, 299], 10: [15, 63, 79, 109, 123, 150, 180, 198, 199, 207, 208],
};
