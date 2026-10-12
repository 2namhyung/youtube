import {createHash} from 'node:crypto';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {STYLE_FRAME_LAYOUT_CONTRACT_VERSION, STYLE_FRAME_LAYOUT_RULES, bbox, validateEditorialFrameContract, validateStyleFrameGeometry} from './style-frame-layout-contract.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const root = path.join(repoRoot, 'video', 'qa', 'style-frames', 'episode-001', 'SH006-editorial-v07');
const outputRoot = path.join(root, 'outputs');
const assetRoot = path.join(repoRoot, 'video', 'qa', 'production-assets', 'episode-001', 'SH006-editorial-v01', 'assets');
const background = path.join(repoRoot, 'video', 'public', 'assets', 'shared', 'paper-beige-check.png');
const WIDTH = 1920;
const HEIGHT = 1080;
const INK = '#172a34';
const RED = '#9f3f35';
const TEAL = '#2f756e';
const BLUE = '#294f61';
const MUTED = '#405058';
const FONT = 'Malgun Gothic, Noto Sans KR, sans-serif';

const rel = (file) => path.relative(repoRoot, file).replaceAll('\\', '/');
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const xml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const svg = (body, width = WIDTH, height = HEIGHT) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><filter id="paper-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#172a34" flood-opacity="0.18"/></filter></defs><g font-family="${FONT}" text-rendering="geometricPrecision">${body}</g></svg>`);
const text = (x, y, value, size, fill = INK, weight = 800, anchor = 'start') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="-1">${xml(value)}</text>`;
const footer = (value) => `<g><rect x="0" y="986" width="1920" height="94" fill="#efe7d9" fill-opacity="0.98"/><line x1="96" y1="986" x2="1824" y2="986" stroke="${MUTED}" stroke-opacity="0.22" stroke-width="2"/>${text(1824, 1042, value, 27, MUTED, 750, 'end')}</g>`;
const header = (kicker, title, accent = RED) => `${text(96, 104, kicker, 32, accent, 900)}${text(96, 172, title, 58, INK, 900)}`;
const label = (x, y, value) => text(x, y, value, 46, INK, 900, 'middle');
const arrow = (x1, y1, x2, y2, color = TEAL) => `<path d="M${x1} ${y1} L${x2 - 28} ${y2} M${x2 - 52} ${y2 - 22} L${x2 - 28} ${y2} L${x2 - 52} ${y2 + 22}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`;
const surfaceTextGroup = ({targetId, rotationDeg, pivotX, pivotY, body}) => `<g data-surface-target="${xml(targetId)}" data-surface-rotation-deg="${rotationDeg}" transform="rotate(${rotationDeg} ${pivotX} ${pivotY})">${body}</g>`;

const rectRight = (rect) => rect.left + rect.width;
const rectBottom = (rect) => rect.top + rect.height;
const rectArea = (rect) => rect.width * rect.height;
const overlapPairKey = (a, b) => [a, b].sort().join('::');
const overlapRatio = (a, b) => {
  const width = Math.min(rectRight(a), rectRight(b)) - Math.max(a.left, b.left);
  const height = Math.min(rectBottom(a), rectBottom(b)) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? (width * height) / Math.min(rectArea(a), rectArea(b)) : 0;
};

function bindAndValidateRenderedSurfaceText(spec) {
  for (const cue of spec.geometry.texts.filter((item) => item.semantic_role === 'surface-content')) {
    const binding = `data-surface-target="${cue.target_id}" data-surface-rotation-deg="${cue.rotation_deg}" transform="rotate(${cue.rotation_deg} `;
    if (!spec.overlay.includes(binding)) throw new Error(`${spec.frame_id}/${cue.id}: rendered SVG surface group is missing or does not match manifest rotation`);
  }
}

function bindAndValidateAllAssetOverlaps(spec) {
  const declarations = new Map((spec.geometry.intentional_overlaps ?? []).map((item) => [overlapPairKey(item.foreground_id, item.background_id), item]));
  const observed = new Set();
  for (let index = 0; index < spec.geometry.assets.length; index += 1) {
    for (let next = index + 1; next < spec.geometry.assets.length; next += 1) {
      const a = spec.geometry.assets[index];
      const b = spec.geometry.assets[next];
      const ratio = overlapRatio(a.bbox, b.bbox);
      if (ratio === 0) continue;
      const key = overlapPairKey(a.id, b.id);
      const declaration = declarations.get(key);
      if (!declaration) throw new Error(`${spec.frame_id}: undeclared asset overlap ${a.id}/${b.id}, including context assets`);
      if (ratio > STYLE_FRAME_LAYOUT_RULES.max_intentional_overlap_ratio || ratio > declaration.max_ratio) throw new Error(`${spec.frame_id}: overlap ${a.id}/${b.id} ratio ${ratio.toFixed(6)} exceeds declared/global cap`);
      declaration.actual_ratio = Number(ratio.toFixed(6));
      observed.add(key);
    }
  }
  for (const key of declarations.keys()) if (!observed.has(key)) throw new Error(`${spec.frame_id}: declared intentional overlap ${key} is not present in rendered geometry`);
}

async function prepared(file, width, height, rotate = 0, fit = 'contain') {
  const metadata = await sharp(file).metadata();
  const source = metadata.hasAlpha ? sharp(file).trim({background: {r: 0, g: 0, b: 0, alpha: 0}}) : sharp(file);
  let output = source.resize({width, height, fit, position: 'centre', background: {r: 0, g: 0, b: 0, alpha: 0}});
  if (rotate) output = output.rotate(rotate, {background: {r: 0, g: 0, b: 0, alpha: 0}}).resize({width, height, fit, position: 'centre', background: {r: 0, g: 0, b: 0, alpha: 0}});
  return output.png().toBuffer();
}

async function printTreatment(buffer) {
  return sharp(buffer).grayscale().modulate({brightness: 1.04, saturation: 0.32}).png().toBuffer();
}

async function renderFrame(spec) {
  bindAndValidateRenderedSurfaceText(spec);
  bindAndValidateAllAssetOverlaps(spec);
  const focal = spec.focal;
  const contract = {...spec, editorial_contract_version: 3, dominant_focal_asset_id: focal, viewer_takeaway: spec.takeaway, layer_roles: spec.layers, hidden_asset_ids: [], supporting_asset_ids: spec.assets.filter((item) => item.id !== focal).map((item) => item.id), layout_template: spec.template, narration_window: {start_frame: 0, end_frame: 180}, stable_reading_hold_seconds: 2.4, required_review_dimensions: {wide: '1920x1080', mobile: '360x203'}};
  const failures = [...validateStyleFrameGeometry(spec), ...validateEditorialFrameContract(contract)];
  if (failures.length) throw new Error(`Style-frame geometry failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  const output = path.join(outputRoot, `${spec.frame_id}.png`);
  const mobile = path.join(outputRoot, `${spec.frame_id}-360x203.png`);
  const base = await sharp(background).resize(WIDTH, HEIGHT, {fit: 'fill'}).modulate({brightness: 0.98, saturation: 0.68}).composite([{input: svg('<rect width="1920" height="1080" fill="#fff" fill-opacity=".34"/>'), left: 0, top: 0}]).png().toBuffer();
  const composites = [];
  if (spec.underlay) composites.push({input: svg(spec.underlay), left: 0, top: 0});
  for (const asset of spec.assets) {
    let input = await prepared(asset.file, asset.bbox.width, asset.bbox.height, asset.rotate ?? 0, asset.fit ?? 'contain');
    if (asset.printTreatment) {
      input = await printTreatment(input);
      if (asset.redOffset) {
        const silhouette = await sharp(input).tint(RED).modulate({brightness: 0.72}).png().toBuffer();
        composites.push({input: silhouette, left: asset.bbox.left + 16, top: asset.bbox.top + 12});
      }
    }
    composites.push({input, left: asset.bbox.left, top: asset.bbox.top});
  }
  composites.push({input: svg(spec.overlay), left: 0, top: 0});
  await sharp(base).composite(composites).png({compressionLevel: 9, adaptiveFiltering: true}).toFile(output);
  await sharp(output).resize(360, 203, {fit: 'fill'}).png({compressionLevel: 9}).toFile(mobile);
  return {
    beat_id: spec.beat_id, frame_id: spec.frame_id, layout_contract_version: spec.layout_contract_version, editorial_contract_version: 3,
    dominant_focal_asset_id: focal, viewer_takeaway: spec.takeaway, layer_roles: spec.layers, hidden_asset_ids: [], supporting_asset_ids: spec.assets.filter((item) => item.id !== focal).map((item) => item.id), layout_template: spec.template,
    narration_window: {start_frame: 0, end_frame: 180}, stable_reading_hold_seconds: 2.4, required_review_dimensions: {wide: '1920x1080', mobile: '360x203'},
    evidence_view: {kind: 'legal', source_flow: 'overview -> normalized crop -> exact retype', overview_source: 'raw/sources/episode-001-sh006-viewer-first-law-sources-2026-08-29.md §1', normalized_crop: 'SH006 normalized clause crop', exact_retype: 'source-locked clause copy'},
    output: rel(output), output_sha256: await sha256(output), mobile: rel(mobile), mobile_sha256: await sha256(mobile), dimensions: {width: WIDTH, height: HEIGHT},
    inputs: await Promise.all(spec.assets.map(async (asset) => ({asset_id: asset.id, path: rel(asset.file), sha256: await sha256(asset.file)}))), geometry: spec.geometry,
  };
}

await rm(root, {recursive: true, force: true});
await mkdir(outputRoot, {recursive: true});
const files = {
  person: path.join(assetRoot, 'sh006-prosecutor-editorial.png'), suspect: path.join(assetRoot, 'sh006-suspect-dossier-editorial.png'), facts: path.join(assetRoot, 'sh006-facts-folder-editorial.png'), alley: path.join(assetRoot, 'sh006-alley-photo-editorial.png'),
  blankLaw: path.join(assetRoot, 'sh006-blank-law-document-editorial.png'), amendment: path.join(assetRoot, 'sh006-amendment-paper-editorial.png'), deleted: path.join(assetRoot, 'sh006-deleted-document-editorial.png'), request: path.join(assetRoot, 'sh006-request-card-editorial.png'), building: path.join(assetRoot, 'sh006-public-office-building-editorial.png'),
};

const frameSpecs = [
  {
    beat_id: 'B01', frame_id: 'SH006-B01-editorial-layout-v07', layout_contract_version: STYLE_FRAME_LAYOUT_CONTRACT_VERSION, focal: 'prosecutor-role', template: 'dominant-person-with-dossier-collage', takeaway: '검사와 하나의 증거 묶음이 직접 수사의 대상을 보여준다', layers: {background: [], midground: ['evidence-dossier'], foreground: ['prosecutor-role']},
    assets: [
      {id: 'prosecutor-role', file: files.person, bbox: bbox(120, 218, 560, 620), role: 'foreground', printTreatment: true, redOffset: true},
      {id: 'evidence-dossier', file: files.facts, bbox: bbox(640, 286, 1160, 570), role: 'context', fit: 'cover', printTreatment: true, redOffset: true},
    ],
    overlay: `${label(400, 910, '검사', RED)}${label(1220, 920, '직접 수사 대상', BLUE)}${footer('출처 · 형사소송법 제196조 제1항(시행 전 조문)')}`,
    geometry: {assets: [{id: 'prosecutor-role', bbox: bbox(120, 218, 560, 620)}, {id: 'evidence-dossier', bbox: bbox(640, 286, 1160, 570), role: 'context'}], texts: [
      {id: 'label-prosecutor', semantic_role: 'asset-label', target_id: 'prosecutor-role', bbox: bbox(234, 880, 332, 48), rotation_deg: 0, font_size_px: 46, text_align: 'center', lines: [{text: '검사', font_size_px: 46}]},
      {id: 'label-dossier', semantic_role: 'asset-label', target_id: 'evidence-dossier', bbox: bbox(1000, 890, 440, 48), rotation_deg: 0, font_size_px: 46, text_align: 'center', lines: [{text: '직접 수사 대상', font_size_px: 46}]},
      {id: 'source', semantic_role: 'screen-chrome', bbox: bbox(96, 1000, 1728, 42), rotation_deg: 0, font_size_px: 27, text_align: 'right', lines: [{text: '출처 · 형사소송법 제196조 제1항(시행 전 조문)', font_size_px: 27}]},
    ], connectors: [], intentional_overlaps: [{foreground_id: 'prosecutor-role', background_id: 'evidence-dossier', purpose: '인물과 사건철을 한 수사 장면으로 물리적으로 결속한다', max_ratio: 0.07}]},
  },
  {
    beat_id: 'B03', frame_id: 'SH006-B03-editorial-layout-v07', layout_contract_version: STYLE_FRAME_LAYOUT_CONTRACT_VERSION, focal: 'old-clause-paper', template: 'near-fullscreen-paper-with-pasted-correction', takeaway: '원문 위에 삭제 개정문이 물리적으로 붙는 변화를 확인한다', layers: {background: ['old-clause-paper'], midground: ['deletion-event'], foreground: []},
    assets: [{id: 'old-clause-paper', file: files.blankLaw, bbox: bbox(112, 156, 1120, 790), role: 'context', fit: 'cover', rotate: -1.2, surface_rotation_deg: -1.2}, {id: 'deletion-event', file: files.amendment, bbox: bbox(1196, 470, 620, 420), role: 'midground', rotate: 2, surface_rotation_deg: 2}],
    overlay: `${surfaceTextGroup({targetId: 'old-clause-paper', rotationDeg: -1.2, pivotX: 660, pivotY: 520, body: `${text(280, 420, '범인, 범죄사실과', 80, INK, 900)}${text(280, 518, '증거를 수사한다.', 80, INK, 900)}<line x1="274" y1="553" x2="1080" y2="553" stroke="${RED}" stroke-width="8"/>`})}${surfaceTextGroup({targetId: 'deletion-event', rotationDeg: 2, pivotX: 1506, pivotY: 680, body: `${text(1260, 590, '제196조를', 78, '#fff3d8', 900)}${text(1260, 688, '삭제한다.', 86, '#fff3d8', 900)}`})}${footer('출처 · 형사소송법 제196조(시행 전) / 법률 제21857호 개정문')}`,
    geometry: {assets: [{id: 'old-clause-paper', bbox: bbox(112, 156, 1120, 790), role: 'context', surface_rotation_deg: -1.2}, {id: 'deletion-event', bbox: bbox(1196, 470, 620, 420), surface_rotation_deg: 2}], texts: [
      {id: 'old-clause-copy', semantic_role: 'surface-content', placement: 'on-surface', target_id: 'old-clause-paper', bbox: bbox(260, 320, 900, 270), rotation_deg: -1.2, font_size_px: 80, kind: 'quote', text_align: 'left', lines: [{text: '범인, 범죄사실과', font_size_px: 80}, {text: '증거를 수사한다.', font_size_px: 80}]},
      {id: 'amendment-copy', semantic_role: 'surface-content', placement: 'on-surface', target_id: 'deletion-event', bbox: bbox(1250, 500, 540, 230), rotation_deg: 2, font_size_px: 86, kind: 'quote', text_align: 'left', lines: [{text: '제196조를', font_size_px: 78}, {text: '삭제한다.', font_size_px: 86}]},
      {id: 'source', semantic_role: 'screen-chrome', bbox: bbox(96, 1000, 1728, 42), rotation_deg: 0, font_size_px: 27, text_align: 'right', lines: [{text: '출처 · 형사소송법 제196조(시행 전) / 법률 제21857호 개정문', font_size_px: 27}]},
    ], connectors: [], intentional_overlaps: [{foreground_id: 'deletion-event', background_id: 'old-clause-paper', purpose: '삭제 개정문을 기존 조문 가장자리에 붙여 변경 사건을 연결한다', max_ratio: 0.06}]},
  },
  {
    beat_id: 'B05', frame_id: 'SH006-B05-editorial-layout-v07', layout_contract_version: STYLE_FRAME_LAYOUT_CONTRACT_VERSION, focal: 'request-sheet', template: 'foreground-request-bridge-to-anchored-agency', takeaway: '삭제된 직접수사 근거 뒤에는 검사의 구체적 요구가 수사기관으로 건너가는 경로가 남는다', layers: {background: ['deleted-direct-investigation'], midground: ['prosecutor', 'investigation-agency'], foreground: ['request-sheet']},
    underlay: `<path d="M805 510 C880 495 925 470 985 438 M1450 430 C1510 442 1550 462 1610 500" fill="none" stroke="${TEAL}" stroke-width="14" stroke-linecap="round"/><path d="M1582 474 L1610 500 L1574 508" fill="none" stroke="${TEAL}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>`,
    assets: [{id: 'deleted-direct-investigation', file: files.deleted, bbox: bbox(50, 200, 400, 700), role: 'context', fit: 'cover', surface_rotation_deg: 0}, {id: 'prosecutor', file: files.person, bbox: bbox(430, 270, 510, 610), role: 'midground', printTreatment: true, redOffset: true}, {id: 'request-sheet', file: files.request, bbox: bbox(835, 160, 690, 460), role: 'foreground', rotate: -1.8, surface_rotation_deg: -1.8}, {id: 'investigation-agency', file: files.building, bbox: bbox(1485, 240, 435, 500), role: 'context', fit: 'contain', printTreatment: true, redOffset: true}],
    overlay: `${surfaceTextGroup({targetId: 'deleted-direct-investigation', rotationDeg: 0, pivotX: 250, pivotY: 550, body: `${text(90, 390, '제196조', 42, RED, 900)}${text(90, 492, '직접 수사', 72, INK, 900)}${text(90, 596, '삭제', 90, RED, 900)}<line x1="88" y1="628" x2="405" y2="628" stroke="${RED}" stroke-width="9"/>`})}${surfaceTextGroup({targetId: 'request-sheet', rotationDeg: -1.8, pivotX: 1180, pivotY: 390, body: `${text(1200, 408, '보완수사요구', 60, TEAL, 900, 'middle')}`})}${label(685, 935, '검사')}${label(1703, 795, '수사기관')}${footer('출처 · 형사소송법 개정문 · 제196조 삭제 / 제195조제2항 보완수사요구·재수사요구 직무')}`,
    geometry: {assets: [{id: 'deleted-direct-investigation', bbox: bbox(50, 200, 400, 700), role: 'context', surface_rotation_deg: 0}, {id: 'prosecutor', bbox: bbox(430, 270, 510, 610)}, {id: 'request-sheet', bbox: bbox(835, 160, 690, 460), surface_rotation_deg: -1.8}, {id: 'investigation-agency', bbox: bbox(1485, 240, 435, 500), role: 'context'}], texts: [
      {id: 'deleted-copy', semantic_role: 'surface-content', placement: 'on-surface', target_id: 'deleted-direct-investigation', bbox: bbox(70, 330, 350, 320), rotation_deg: 0, font_size_px: 72, kind: 'quote', text_align: 'left', lines: [{text: '제196조', font_size_px: 42}, {text: '직접 수사', font_size_px: 72}, {text: '삭제', font_size_px: 90}]},
      {id: 'request-copy', semantic_role: 'surface-content', placement: 'on-surface', target_id: 'request-sheet', bbox: bbox(950, 320, 500, 100), rotation_deg: -1.8, font_size_px: 60, kind: 'object-label', text_align: 'center', lines: [{text: '보완수사요구', font_size_px: 60}]},
      {id: 'label-prosecutor', semantic_role: 'asset-label', target_id: 'prosecutor', bbox: bbox(565, 912, 240, 48), rotation_deg: 0, font_size_px: 46, text_align: 'center', lines: [{text: '검사', font_size_px: 46}]},
      {id: 'label-agency', semantic_role: 'asset-label', target_id: 'investigation-agency', bbox: bbox(1580, 772, 245, 48), rotation_deg: 0, font_size_px: 46, text_align: 'center', lines: [{text: '수사기관', font_size_px: 46}]},
      {id: 'source', semantic_role: 'screen-chrome', bbox: bbox(96, 1000, 1728, 42), rotation_deg: 0, font_size_px: 27, text_align: 'right', lines: [{text: '출처 · 형사소송법 개정문 · 제196조 삭제 / 제195조제2항 보완수사요구·재수사요구 직무', font_size_px: 27}]},
    ], connectors: [
      {id: 'prosecutor-to-request-route', bbox: bbox(805, 430, 180, 90), endpoint_asset_ids: ['prosecutor', 'request-sheet']},
      {id: 'request-to-agency-route', bbox: bbox(1450, 420, 170, 100), endpoint_asset_ids: ['request-sheet', 'investigation-agency']},
    ], intentional_overlaps: [
      {foreground_id: 'prosecutor', background_id: 'deleted-direct-investigation', purpose: '이전 조문의 가장자리를 인물이 이어받아 장면 연속성을 만든다', max_ratio: 0.05},
      {foreground_id: 'request-sheet', background_id: 'prosecutor', purpose: '요구서가 검사에게서 출발하는 전경 다리로 보이게 한다', max_ratio: 0.12},
      {foreground_id: 'investigation-agency', background_id: 'request-sheet', purpose: '요구서 끝을 수사기관 구조물에 물리적으로 고정한다', max_ratio: 0.08},
    ]},
  },
];

const records = [];
for (const spec of frameSpecs) records.push(await renderFrame(spec));
const contact = path.join(outputRoot, 'SH006-editorial-layout-v07-contact.png');
const thumbs = await Promise.all(records.map((record) => sharp(path.join(repoRoot, record.output)).resize(600, 338).png().toBuffer()));
const contactHeader = svg(`${text(62, 56, 'SH006 · EDITORIAL DEPTH / STYLE FRAME REVIEW ONLY', 30, INK, 900)}${text(62, 100, 'B01 · 전경 인물 + 증거 묶음', 22, RED, 850)}${text(662, 100, 'B03 · 원문 종이 + 삭제 사건', 22, BLUE, 850)}${text(1262, 100, 'B05 · 큰 삭제 조문 + 단계적 경로', 22, TEAL, 850)}`, 1920, 520);
await sharp({create: {width: 1920, height: 520, channels: 4, background: '#eee7da'}}).composite([{input: contactHeader, left: 0, top: 0}, ...thumbs.map((input, index) => ({input, left: 20 + index * 640, top: 132}))]).png({compressionLevel: 9}).toFile(contact);

const manifest = {
  schema_version: 3, episode_id: 'episode-001', shot_id: 'SH006', candidate_id: 'SH006-editorial-v07', supersedes_for_style_review: 'SH006-editorial-v06', supersession_reason: 'V07 increases focal scale and occupied canvas, preserves object continuity, and uses physical paper surfaces with source-locked legal text.',
  status: 'pending-user-style-frame-review', review_scope: 'reference-parity-editorial-depth-and-typography-composition-only', review_profile: 'source-photo-treatment', editorial_contract_version: 3, production_visible: false, user_style_frame_pass: false, user_cut_pass: false, rights_approved: false, omni_video_approved: false, stage_advanced: false,
  typography_surface_contract_version: 2, layout_contract_version: STYLE_FRAME_LAYOUT_CONTRACT_VERSION, typography_semantic_roles: {'asset-label': 'External asset name in a dedicated zero-degree lane.', 'surface-content': 'Source-locked or object-label words placed on one named physical paper surface and rotated only with that surface.', 'screen-chrome': 'Quiet source rail only; zero degrees and outside assets.'}, layout_contract: STYLE_FRAME_LAYOUT_RULES,
  typography_source: 'raw/sources/episode-001-sh006-viewer-first-law-sources-2026-08-29.md §1–§2', reference_transfer: {reference_frames: ['raw/inbox/vox-style-claude-remotion-reference.mp4 00:06–00:12', 'wiki/sources/mo-sidd-remotion-production-series.md §5–§7'], observed_grammar: ['large dominant hero object', 'asymmetric object relationship', 'physical paper collage and bleed', 'consistent grayscale print treatment with restrained red offset', 'quiet source rail without slide headers'], excluded_elements: ['equal-prominence museum grid', 'generic gray UI panels', 'large explanatory slide titles', 'small icon row as the primary explanation', 'static PNG treated as motion proof']},
  reference_parity: {dominant_focal_required: true, asymmetric_support_required: true, protected_evidence_zones: true, static_to_playable_parity: {status: 'blocked-pre-style-pass', required_after_user_style_pass: true, pass: false, parity_record: null}, motion_proof: {status: 'not-applicable-before-style-pass', static_png_is_not_motion_proof: true, pass: false}},
  provenance_note: 'V07 is a new static candidate composed from independent local production assets. Legal copy is deterministic retypesetting from the cited raw source; the blank paper asset is not a legal document scan.', frames: records,
  contact: {path: rel(contact), sha256: await sha256(contact), dimensions: {width: 1920, height: 520}}, prohibited_rules_post_cut_recheck: ['no-asset-label-on-or-over-any-asset', 'no-screen-chrome-on-or-over-any-asset', 'no-rotation-for-asset-label-or-screen-chrome', 'no-arbitrary-asset-coordinates-without-geometry-record', 'no-undeclared-asset-overlap', 'no-surface-content-without-on-surface-placement', 'no-surface-content-angle-mismatch-or-non-target-overlap', 'no-flat-composite-as-independent-motion-proof', 'no-omni-video-before-all-cut-pass', 'no-source-ui-as-reading-screen'],
};
await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile(path.join(root, 'README.md'), '# SH006 editorial reference-parity style frames v07\n\n- Status: pending user style-frame review; production_visible=false.\n- V07 uses a large focal object, asymmetric support, physical paper surfaces, deliberate crop/bleed, a common grayscale print treatment, restrained red offset, and a quiet source rail.\n- B01: prosecutor foreground hero physically joined to one evidence dossier. B03: dominant old-clause paper with exact source-locked retype and a pasted deletion event. B05: the deleted clause persists while the prosecutor, request paper, and investigation agency form the remaining route.\n- Large slide headers and duplicated explanatory labels are excluded. Only text on a named PNG surface rotates with that surface; detached labels and source chrome remain level.\n- Static style frames are not motion proof, cut PASS, Omni approval, or production approval.\n', 'utf8');
console.log(JSON.stringify({candidate: manifest.candidate_id, outputs: records.map((record) => ({frame_id: record.frame_id, output: record.output, sha256: record.output_sha256, mobile: record.mobile, mobile_sha256: record.mobile_sha256})), contact: manifest.contact}, null, 2));
