export const STYLE_FRAME_LAYOUT_CONTRACT_VERSION = 2;
export const EDITORIAL_FRAME_CONTRACT_VERSION = 3;

export const STYLE_FRAME_LAYOUT_RULES = Object.freeze({
  canvas: {width: 1920, height: 1080},
  safe_area: {left: 96, top: 72, right: 96, bottom: 142},
  footer_start_y: 986,
  footer_clearance_px: 48,
  asset_label_clearance_px: 32,
  asset_label_max_clearance_px: 72,
  asset_label_center_tolerance_px: 16,
  asset_label_min_font_px: 44,
  quote_min_font_px: 72,
  same_row_asset_gap_px: 64,
  same_row_gap_spread_px: 64,
  same_role_baseline_tolerance_px: 24,
  person_eye_line_tolerance_px: 20,
  connector_clearance_px: 24,
  max_surface_content_rotation_deg: 2,
  surface_rotation_match_tolerance_deg: 0.05,
  max_intentional_overlap_ratio: 0.12,
});

export const bbox = (left, top, width, height) => ({left, top, width, height});

const right = (rect) => rect.left + rect.width;
const bottom = (rect) => rect.top + rect.height;
const centerX = (rect) => rect.left + rect.width / 2;
const area = (rect) => Math.max(0, rect.width) * Math.max(0, rect.height);

const intersection = (a, b) => {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const x2 = Math.min(right(a), right(b));
  const y2 = Math.min(bottom(a), bottom(b));
  if (x2 <= left || y2 <= top) return null;
  return bbox(left, top, x2 - left, y2 - top);
};

const rectDistance = (a, b) => {
  const dx = Math.max(a.left - right(b), b.left - right(a), 0);
  const dy = Math.max(a.top - bottom(b), b.top - bottom(a), 0);
  return Math.hypot(dx, dy);
};

const contains = (outer, inner) => inner.left >= outer.left && inner.top >= outer.top && right(inner) <= right(outer) && bottom(inner) <= bottom(outer);
const pairKey = (a, b) => [a, b].sort().join('::');

const glyphWidthEm = (character) => {
  if (/\s/u.test(character)) return 0.5;
  if (/[\u0000-\u007f]/u.test(character)) return /[A-Z0-9]/u.test(character) ? 0.72 : 0.62;
  if (/[·.,:;!?()[\]{}'"“”/\-→]/u.test(character)) return 0.62;
  return 1;
};

export const estimateConservativeInkWidth = (lines) => Math.ceil(Math.max(0, ...(lines ?? []).map((line) => {
  const fontSize = line.font_size_px ?? 0;
  const units = [...String(line.text ?? '')].reduce((sum, character) => sum + glyphWidthEm(character), 0);
  return units * fontSize * (line.horizontal_scale ?? 1) * 1.05 + 4;
})));

const conservativeInkBox = (cue) => {
  const width = estimateConservativeInkWidth(cue.lines);
  const align = cue.text_align ?? 'left';
  const left = align === 'center' ? centerX(cue.bbox) - width / 2 : align === 'right' ? right(cue.bbox) - width : cue.bbox.left;
  return bbox(left, cue.bbox.top, width, cue.bbox.height);
};

export function validateStyleFrameGeometry(frame, rules = STYLE_FRAME_LAYOUT_RULES) {
  const failures = [];
  const assets = frame.geometry?.assets ?? [];
  const texts = frame.geometry?.texts ?? [];
  const connectors = frame.geometry?.connectors ?? [];
  const intentional = new Set((frame.geometry?.intentional_overlaps ?? []).map((pair) => pairKey(pair.a ?? pair.foreground_id, pair.b ?? pair.background_id)));
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const contentBottom = rules.footer_start_y - rules.footer_clearance_px;

  if (frame.layout_contract_version !== STYLE_FRAME_LAYOUT_CONTRACT_VERSION) failures.push(`${frame.frame_id ?? frame.beat_id}: layout contract v2 is required`);

  for (const asset of assets) {
    if (!asset.id || !asset.bbox) { failures.push(`${frame.frame_id ?? frame.beat_id}: every asset needs id and bbox`); continue; }
    if (!asset.full_bleed && asset.role !== 'context') {
      if (asset.bbox.left < rules.safe_area.left || right(asset.bbox) > rules.canvas.width - rules.safe_area.right || asset.bbox.top < rules.safe_area.top || bottom(asset.bbox) > contentBottom) {
        failures.push(`${frame.frame_id ?? frame.beat_id}/${asset.id}: asset escapes the safe content area`);
      }
    }
  }

  for (let i = 0; i < assets.length; i += 1) {
    for (let j = i + 1; j < assets.length; j += 1) {
      const a = assets[i];
      const b = assets[j];
      if (a.role === 'context' || b.role === 'context') continue;
      const overlap = intersection(a.bbox, b.bbox);
      if (overlap) {
        if (!intentional.has(pairKey(a.id, b.id))) failures.push(`${frame.frame_id ?? frame.beat_id}: undeclared asset overlap ${a.id}/${b.id}`);
        else if (area(overlap) / Math.min(area(a.bbox), area(b.bbox)) > rules.max_intentional_overlap_ratio) failures.push(`${frame.frame_id ?? frame.beat_id}: intentional overlap exceeds 12% for ${a.id}/${b.id}`);
      }
      if (a.row_id && a.row_id === b.row_id && Math.min(bottom(a.bbox), bottom(b.bbox)) > Math.max(a.bbox.top, b.bbox.top)) {
        const gap = Math.max(a.bbox.left, b.bbox.left) - Math.min(right(a.bbox), right(b.bbox));
        if (gap < rules.same_row_asset_gap_px) failures.push(`${frame.frame_id ?? frame.beat_id}: ${a.id}/${b.id} same-row gap ${gap}px is below ${rules.same_row_asset_gap_px}px`);
      }
    }
  }

  const rowGroups = new Map();
  for (const asset of assets.filter((item) => item.row_id && item.role !== 'context')) {
    if (!asset.baseline_group && !asset.alignment_exempt_reason) failures.push(`${frame.frame_id ?? frame.beat_id}/${asset.id}: row asset needs a baseline group or an explicit alignment exemption`);
    rowGroups.set(asset.row_id, [...(rowGroups.get(asset.row_id) ?? []), asset]);
  }
  for (const [rowId, rowAssets] of rowGroups) {
    const ordered = [...rowAssets].sort((a, b) => a.bbox.left - b.bbox.left);
    const gaps = ordered.slice(1).map((asset, index) => asset.bbox.left - right(ordered[index].bbox));
    if (gaps.length > 1 && Math.max(...gaps) - Math.min(...gaps) > rules.same_row_gap_spread_px) failures.push(`${frame.frame_id ?? frame.beat_id}: row ${rowId} gap spread exceeds ${rules.same_row_gap_spread_px}px`);
  }

  const baselineGroups = new Map();
  const eyeGroups = new Map();
  for (const asset of assets) {
    if (asset.baseline_group) baselineGroups.set(asset.baseline_group, [...(baselineGroups.get(asset.baseline_group) ?? []), bottom(asset.bbox)]);
    if (asset.eye_line_group && Number.isFinite(asset.eye_line_y)) eyeGroups.set(asset.eye_line_group, [...(eyeGroups.get(asset.eye_line_group) ?? []), asset.eye_line_y]);
  }
  for (const [group, values] of baselineGroups) if (Math.max(...values) - Math.min(...values) > rules.same_role_baseline_tolerance_px) failures.push(`${frame.frame_id ?? frame.beat_id}: baseline group ${group} exceeds ${rules.same_role_baseline_tolerance_px}px`);
  for (const [group, values] of eyeGroups) if (Math.max(...values) - Math.min(...values) > rules.person_eye_line_tolerance_px) failures.push(`${frame.frame_id ?? frame.beat_id}: eye-line group ${group} exceeds ${rules.person_eye_line_tolerance_px}px`);

  for (const cue of texts) {
    if (!cue.id || !cue.bbox || !cue.semantic_role) { failures.push(`${frame.frame_id ?? frame.beat_id}: every text cue needs id, bbox, and semantic_role`); continue; }
    if (!Array.isArray(cue.lines) || cue.lines.length === 0 || cue.lines.some((line) => typeof line.text !== 'string' || line.text.length === 0 || !Number.isFinite(line.font_size_px) || line.font_size_px <= 0 || (line.horizontal_scale !== undefined && (!Number.isFinite(line.horizontal_scale) || line.horizontal_scale <= 0 || line.horizontal_scale > 1)))) {
      failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: text cue needs explicit non-empty lines and font sizes`);
      continue;
    }
    if (!['left', 'center', 'right'].includes(cue.text_align)) failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: text_align must be left, center, or right`);
    const inkBox = conservativeInkBox(cue);
    if (!contains(cue.bbox, inkBox)) failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: declared text bbox is narrower than conservative rendered ink`);
    if (cue.semantic_role === 'asset-label') {
      const target = assetById.get(cue.target_id);
      if (!target) { failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: asset-label target is missing`); continue; }
      if (cue.rotation_deg !== 0) failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: asset-label must remain at 0 degrees`);
      if ((cue.font_size_px ?? 0) < rules.asset_label_min_font_px) failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: asset-label font is below ${rules.asset_label_min_font_px}px`);
      if (inkBox.left < rules.safe_area.left || right(inkBox) > rules.canvas.width - rules.safe_area.right) failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: asset-label escapes the horizontal safe area`);
      for (const asset of assets) if (intersection(inkBox, asset.bbox)) failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: asset-label overlaps ${asset.id}`);
      if (inkBox.top < bottom(target.bbox)) failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: asset-label must be entirely below ${cue.target_id}`);
      const clearance = rectDistance(inkBox, target.bbox);
      if (clearance < rules.asset_label_clearance_px) failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: asset-label clearance is below ${rules.asset_label_clearance_px}px`);
      if (clearance > rules.asset_label_max_clearance_px) failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: asset-label clearance exceeds ${rules.asset_label_max_clearance_px}px`);
      if (Math.abs(centerX(inkBox) - centerX(target.bbox)) > rules.asset_label_center_tolerance_px) failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: label center is not aligned to ${cue.target_id}`);
    } else if (cue.semantic_role === 'surface-content') {
      const target = assetById.get(cue.target_id);
      if (cue.placement !== 'on-surface') failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: surface-content placement must be on-surface`);
      if (!target) failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: surface-content target is missing`);
      else {
        if (!contains(target.bbox, inkBox)) failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: surface-content escapes ${cue.target_id}`);
        if (!Number.isFinite(target.surface_rotation_deg)) failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: target ${cue.target_id} needs surface_rotation_deg`);
        else {
          if (Math.abs(target.surface_rotation_deg) > rules.max_surface_content_rotation_deg) failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: target surface rotation exceeds ±${rules.max_surface_content_rotation_deg} degrees`);
          if (Number.isFinite(cue.rotation_deg) && Math.abs(cue.rotation_deg - target.surface_rotation_deg) > rules.surface_rotation_match_tolerance_deg) failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: surface-content rotation does not match ${cue.target_id}`);
        }
        for (const asset of assets) if (asset.id !== target.id && intersection(inkBox, asset.bbox)) failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: surface-content overlaps non-target asset ${asset.id}`);
      }
      if (!Number.isFinite(cue.rotation_deg) || Math.abs(cue.rotation_deg) > rules.max_surface_content_rotation_deg) failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: surface-content rotation exceeds ±${rules.max_surface_content_rotation_deg} degrees`);
      if (cue.kind === 'quote' && (cue.font_size_px ?? 0) < rules.quote_min_font_px) failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: quote font is below ${rules.quote_min_font_px}px`);
    } else if (cue.semantic_role === 'screen-chrome') {
      if (cue.rotation_deg !== 0) failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: screen chrome must remain at 0 degrees`);
      for (const asset of assets) if (intersection(inkBox, asset.bbox)) failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: screen chrome overlaps ${asset.id}`);
    } else {
      failures.push(`${frame.frame_id ?? frame.beat_id}/${cue.id}: unsupported semantic text role ${cue.semantic_role}`);
    }
  }

  for (const connector of connectors) {
    if (!connector.id || !connector.bbox) { failures.push(`${frame.frame_id ?? frame.beat_id}: connector needs id and bbox`); continue; }
    for (const asset of assets) {
      if (connector.endpoint_asset_ids?.includes(asset.id) || asset.role === 'context') continue;
      if (rectDistance(connector.bbox, asset.bbox) < rules.connector_clearance_px) failures.push(`${frame.frame_id ?? frame.beat_id}/${connector.id}: connector lane is within ${rules.connector_clearance_px}px of ${asset.id}`);
    }
    for (const cue of texts.filter((item) => item.semantic_role === 'asset-label')) if (rectDistance(connector.bbox, conservativeInkBox(cue)) < rules.connector_clearance_px) failures.push(`${frame.frame_id ?? frame.beat_id}/${connector.id}: connector lane is within ${rules.connector_clearance_px}px of label ${cue.id}`);
  }

  return failures;
}

/**
 * v3 editorial-depth contract. This is deliberately separate from pixel geometry:
 * a valid rectangle is not evidence of a readable, reference-parity composition.
 */
export function validateEditorialFrameContract(frame) {
  const failures = [];
  if (frame.editorial_contract_version !== EDITORIAL_FRAME_CONTRACT_VERSION) return failures;
  const id = frame.frame_id ?? frame.beat_id ?? 'frame';
  const assets = frame.geometry?.assets ?? [];
  const ids = new Set(assets.map((asset) => asset.id));
  const focal = frame.dominant_focal_asset_id;
  if (!focal || !ids.has(focal)) failures.push(`${id}: exactly one dominant_focal_asset_id must identify an asset`);
  if (typeof frame.viewer_takeaway !== 'string' || frame.viewer_takeaway.trim().length === 0) failures.push(`${id}: viewer_takeaway is required`);
  const layers = frame.layer_roles;
  if (!layers || !Array.isArray(layers.background) || !Array.isArray(layers.midground) || !Array.isArray(layers.foreground)) failures.push(`${id}: background/midground/foreground layer roles are required`);
  else {
    const declared = [...layers.background, ...layers.midground, ...layers.foreground];
    for (const assetId of declared) if (!ids.has(assetId)) failures.push(`${id}: layer role references unknown asset ${assetId}`);
    if (new Set(declared).size !== declared.length) failures.push(`${id}: each asset may have only one depth role`);
    if (!layers.background.includes(focal) && !layers.midground.includes(focal) && !layers.foreground.includes(focal)) failures.push(`${id}: dominant focal must have a depth role`);
  }
  if (!Array.isArray(frame.hidden_asset_ids) || !Array.isArray(frame.supporting_asset_ids)) failures.push(`${id}: hidden_asset_ids and supporting_asset_ids are required`);
  if (!frame.layout_template || typeof frame.layout_template !== 'string') failures.push(`${id}: layout_template is required`);
  if (!frame.narration_window || !Number.isFinite(frame.narration_window.start_frame) || !Number.isFinite(frame.narration_window.end_frame) || frame.narration_window.end_frame <= frame.narration_window.start_frame) failures.push(`${id}: narration_window frame range is required`);
  if (!Number.isFinite(frame.stable_reading_hold_seconds) || frame.stable_reading_hold_seconds < 2) failures.push(`${id}: stable_reading_hold_seconds must be at least 2`);
  if (frame.required_review_dimensions?.wide !== '1920x1080' || frame.required_review_dimensions?.mobile !== '360x203') failures.push(`${id}: 1920x1080 and 360x203 review dimensions are required`);
  for (const overlap of frame.geometry?.intentional_overlaps ?? []) {
    if (!overlap.foreground_id || !overlap.background_id || !overlap.purpose || !Number.isFinite(overlap.max_ratio)) failures.push(`${id}: intentional overlap needs foreground_id, background_id, purpose, and max_ratio`);
    else if (overlap.max_ratio > STYLE_FRAME_LAYOUT_RULES.max_intentional_overlap_ratio) failures.push(`${id}: intentional overlap max_ratio exceeds 12%`);
  }
  const evidence = frame.evidence_view;
  if (evidence && evidence.kind === 'legal') {
    if (evidence.source_flow !== 'overview -> normalized crop -> exact retype') failures.push(`${id}: legal evidence must record overview -> normalized crop -> exact retype`);
    if (!evidence.overview_source || !evidence.normalized_crop || !evidence.exact_retype) failures.push(`${id}: legal evidence protected source views are incomplete`);
  }
  return failures;
}
