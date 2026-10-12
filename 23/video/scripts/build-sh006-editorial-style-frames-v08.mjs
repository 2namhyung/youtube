import {createHash} from 'node:crypto';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {validatePersonOnlyImagegenPolicy} from './asset-origin-policy.mjs';
import {STYLE_FRAME_LAYOUT_CONTRACT_VERSION, STYLE_FRAME_LAYOUT_RULES, bbox, validateEditorialFrameContract, validateStyleFrameGeometry} from './style-frame-layout-contract.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const root = path.join(repoRoot, 'video', 'qa', 'style-frames', 'episode-001', 'SH006-editorial-v08');
const outputRoot = path.join(root, 'outputs');
const evidenceRoot = path.join(root, 'assets');
const realRoot = path.join(repoRoot, 'video', 'qa', 'production-assets', 'episode-001', 'SH006-real-photo-v01', 'assets');
const officialRoot = path.join(repoRoot, 'video', 'public', 'assets', 'episode-001-work-v01', 'cuts', 'SH006', 'assets');
const statutoryTextContract = path.join(repoRoot, 'video', 'qa', 'episode-001-work-v01', 'source-lock', 'SH006', 'SH006-paired-statutory-text-contract.json');
const viewerFirstTextContract = path.join(repoRoot, 'video', 'qa', 'episode-001-work-v01', 'source-lock', 'SH006', 'SH006-viewer-first-text-contract.json');
const background = path.join(repoRoot, 'video', 'public', 'assets', 'shared', 'paper-beige-check.png');
const WIDTH = 1920;
const HEIGHT = 1080;
const INK = '#172a34';
const RED = '#9f3f35';
const TEAL = '#2f756e';
const MUTED = '#405058';
const FONT = 'Malgun Gothic, Noto Sans KR, sans-serif';
const rel = (file) => path.relative(repoRoot, file).replaceAll('\\', '/');
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const xml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const svg = (body, width = WIDTH, height = HEIGHT) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g font-family="${FONT}" text-rendering="geometricPrecision">${body}</g></svg>`);
const text = (x, y, value, size, fill = INK, weight = 800, anchor = 'start') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="-1">${xml(value)}</text>`;
const label = (x, y, value, fill = INK) => text(x, y, value, 46, fill, 900, 'middle');
const footer = (value) => `<g><rect x="0" y="986" width="1920" height="94" fill="#efe7d9" fill-opacity=".98"/><line x1="96" y1="986" x2="1824" y2="986" stroke="${MUTED}" stroke-opacity=".22" stroke-width="2"/>${text(1824, 1042, value, 27, MUTED, 750, 'end')}</g>`;
// Connector geometry is the single source for both the manifest and the visible SVG.
// Each endpoint lands on a target asset boundary, rather than in the surrounding whitespace.
const connectorSpecs = [
  {id: 'route-person-to-article', endpoint_asset_ids: ['person-imagegen-fictional', 'retained-article-195'], start_point: {x: 332, y: 720}, end_point: {x: 360, y: 430}, control_points: [{x: 342, y: 650}, {x: 352, y: 520}], bbox: bbox(332, 404, 28, 316), direction: 'up-right', arrowhead: 'at-end', clearance_px: 24},
  {id: 'route-article-to-police', endpoint_asset_ids: ['retained-article-195', 'police-building'], start_point: {x: 1560, y: 650}, end_point: {x: 1604, y: 700}, control_points: [{x: 1576, y: 650}, {x: 1592, y: 700}], bbox: bbox(1560, 632, 44, 86), direction: 'right', arrowhead: 'at-end', clearance_px: 24},
];
const connectorMarkup = (spec) => {
  const [c1, c2] = spec.control_points;
  const path = `<path id="path-${spec.id}" d="M${spec.start_point.x} ${spec.start_point.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${spec.end_point.x} ${spec.end_point.y}" fill="none" stroke="${TEAL}" stroke-width="12" stroke-linecap="round" stroke-dasharray="26 20"/>`;
  const arrow = spec.direction === 'up-right'
    ? `<path id="arrow-${spec.id}" d="M338 450 L360 430 L340 408" fill="none" stroke="${TEAL}" stroke-width="12" stroke-linejoin="round"/>`
    : `<path id="arrow-${spec.id}" d="M1578 682 L1604 700 L1578 718" fill="none" stroke="${TEAL}" stroke-width="12" stroke-linejoin="round"/>`;
  return `<g id="${spec.id}">${path}${arrow}</g>`;
};
const routeMarkup = connectorSpecs.map(connectorMarkup).join('');
const route = routeMarkup;
const rectRight = (rect) => rect.left + rect.width;
const rectBottom = (rect) => rect.top + rect.height;
const rectArea = (rect) => rect.width * rect.height;
const pairKey = (a, b) => [a, b].sort().join('::');
const overlapRatio = (a, b) => { const w = Math.min(rectRight(a), rectRight(b)) - Math.max(a.left, b.left); const h = Math.min(rectBottom(a), rectBottom(b)) - Math.max(a.top, b.top); return w > 0 && h > 0 ? (w * h) / Math.min(rectArea(a), rectArea(b)) : 0; };
const effectiveFont = (meta) => Number((meta.source_render_font_px * meta.displayed_width_px / meta.source_dimensions.width).toFixed(2));
const recipeHash = (recipe) => createHash('sha256').update(JSON.stringify(recipe)).digest('hex');

const sourceMeta = {
  person: {file: path.join(repoRoot, 'video', 'qa', 'production-assets', 'episode-001', 'SH006-person-imagegen-v01', 'derived', 'sh006-prosecutor-role-imagegen-clean-v01.png'), asset_class: 'person', origin: 'imagegen-person', source_kind: 'source-original', source_id: 'SH006-PERSON-IMAGEGEN-V01', original_url: null, license: 'Built-in image_gen; fictional generic role; no real-person likeness', identity_scope: 'fictional-generic', ai_disclosure: true},
  dossier: {file: path.join(realRoot, 'sh006-dossier-real-photo.png'), asset_class: 'object', origin: 'real-source', source_kind: 'real-photo', source_id: 'PEXELS-4792288', original_url: 'https://www.pexels.com/ko-kr/photo/4792288/', license: 'Pexels license (verify current terms before publication)'},
  currentArticle: {file: path.join(evidenceRoot, 'sh006-current-article-196-evidence-view.png'), asset_class: 'document', origin: 'source-derived', source_kind: 'source-original', source_id: 'LAW-196', original_url: 'https://www.law.go.kr/LSW/lsInfoP.do?ancYnChk=0&chrClsCd=010202&efYd=20260701&joNo=023200&lsiSeq=281865&urlMode=lsInfoP', license: 'Statutory text source; exact retype only; website UI/logo excluded', source_lock_file: viewerFirstTextContract, source_locator: 'sources.article_196_before_effective_date.exact_paragraph_1', exact_quote: '검사는 범죄의 혐의가 있다고 사료하는 때에는 범인, 범죄사실과 증거를 수사한다.', display_quote: '검사는 범죄의 혐의가 있다고 사료하는 때에는\n범인, 범죄사실과 증거를 수사한다.', evidence_view_sequence: ['overview', 'normalized-crop', 'exact-retype'], overview_file: path.join(path.dirname(viewerFirstTextContract), 'SH006-document-overview-hires.png'), normalized_crop_file: path.join(path.dirname(viewerFirstTextContract), 'SH006-document-focus-hires.png'), source_dimensions: {width: 1600, height: 720}, source_render_font_px: 112, displayed_width_px: 1200, derivation_recipe_id: 'SH006-v08-law-evidence-view-current-196-v02'},
  deletionArticle: {file: path.join(evidenceRoot, 'sh006-article-196-deletion-evidence-view.png'), asset_class: 'document', origin: 'source-derived', source_kind: 'source-original', source_id: 'LAW-REVISION-21857', original_url: 'https://www.law.go.kr/LSW/lsRvsDocListP.do?chrClsCd=010202&lsId=001671&lsRvsGubun=all', license: 'Statutory text source; exact retype only; website UI/logo excluded', source_lock_file: statutoryTextContract, source_locator: 'approved_exact_text.deletion; 법률 제21857호 개정문 중 제196조 삭제 문장', exact_quote: '제196조를 삭제한다.', display_quote: '제196조를\n삭제한다.', evidence_view_sequence: ['overview', 'normalized-crop', 'exact-retype'], overview_file: path.join(path.dirname(statutoryTextContract), 'SH006-document-overview-hires.png'), normalized_crop_file: path.join(path.dirname(statutoryTextContract), 'derived', 'SH006-article-196-deletion-v04.png'), source_dimensions: {width: 900, height: 500}, source_render_font_px: 150, displayed_width_px: 504, derivation_recipe_id: 'SH006-v08-law-evidence-view-deletion-196-v02'},
  retainedArticle: {file: path.join(evidenceRoot, 'sh006-article-195-retained-evidence-view.png'), asset_class: 'document', origin: 'source-derived', source_kind: 'source-original', source_id: 'LAW-REVISION-21857', original_url: 'https://www.law.go.kr/LSW/lsRvsDocListP.do?chrClsCd=010202&lsId=001671&lsRvsGubun=all', license: 'Statutory text source; exact retype only; website UI/logo excluded', source_lock_file: statutoryTextContract, source_locator: 'approved_exact_text.retained; 법률 제21857호 개정문 신설 제195조제2항에서 연속한 문장 중 직무 범위 문구', exact_quote: '보완수사요구, 재수사요구 등\n이 법률에서 정하는 직무를 수행한다.', evidence_view_sequence: ['overview', 'normalized-crop', 'exact-retype'], source_dimensions: {width: 1600, height: 720}, source_render_font_px: 112, displayed_width_px: 1200, derivation_recipe_id: 'SH006-v08-law-evidence-view-retained-195-v01'},
  routePath: {file: path.join(evidenceRoot, 'sh006-route-path.svg'), asset_class: 'path', origin: 'deterministic-editorial', source_kind: 'source-original', source_id: 'SH006-ROUTE-PATH-V08', original_url: null, license: 'Project-authored explanatory SVG; non-focal overlay only', deterministic: true, explanatory_overlay: true},
  police: {file: path.join(realRoot, 'sh006-police-building-real-photo.png'), asset_class: 'building', origin: 'real-source', source_kind: 'official-photo', source_id: 'WIKIMEDIA-3243833', original_url: 'https://commons.wikimedia.org/wiki/File%3AKorean_National_Police_Agency_Building02.jpg', license: 'CC BY 2.0'},
};

async function prepared(file, width, height, rotate = 0, fit = 'contain') {
  let image = sharp(file).resize({width, height, fit, position: 'centre', background: {r: 0, g: 0, b: 0, alpha: 0}});
  if (rotate) image = image.rotate(rotate, {background: {r: 0, g: 0, b: 0, alpha: 0}});
  return image.png().toBuffer();
}

async function writeEvidenceView({file, width, height, title, quote, fontSize, lineHeightPx}) {
  const lines = quote.split('\n');
  const lineHeight = lineHeightPx ?? Math.round(fontSize * 1.34);
  const firstBaseline = Math.round(height / 2 - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.34);
  const maxTextWidth = width - 180;
  const quoteMarkup = lines.map((line, index) => {
    const rawWidth = [...line].length * fontSize;
    const scale = Math.min(1, maxTextWidth / Math.max(rawWidth, 1));
    const glyph = text(width / 2, firstBaseline + index * lineHeight, line, fontSize, INK, 900, 'middle');
    return scale < 1 ? `<g transform="translate(${width / 2} 0) scale(${scale} 1) translate(${-width / 2} 0)">${glyph}</g>` : glyph;
  }).join('');
  const body = `<rect x="20" y="20" width="${width - 40}" height="${height - 40}" rx="22" fill="#fffdf8" stroke="#d6c9b3" stroke-width="4"/><rect x="46" y="48" width="${Math.min(width - 92, 510)}" height="48" rx="24" fill="${TEAL}"/><text x="${Math.min(width - 68, 300)}" y="82" font-size="30" fill="#fffdf8" font-weight="900" text-anchor="middle">${xml(title)}</text><line x1="48" y1="124" x2="${width - 48}" y2="124" stroke="#d6c9b3" stroke-width="3"/>${quoteMarkup}<line x1="${Math.round(width * 0.12)}" y1="${height - 84}" x2="${Math.round(width * 0.88)}" y2="${height - 84}" stroke="${TEAL}" stroke-width="8" stroke-linecap="round"/>`;
  await sharp(svg(body, width, height)).png({compressionLevel: 9}).toFile(file);
}

function validateOverlaps(spec) {
  const declared = new Map((spec.geometry.intentional_overlaps ?? []).map((item) => [pairKey(item.foreground_id, item.background_id), item]));
  const observed = new Set();
  for (let i = 0; i < spec.geometry.assets.length; i += 1) for (let j = i + 1; j < spec.geometry.assets.length; j += 1) {
    const a = spec.geometry.assets[i]; const b = spec.geometry.assets[j]; const ratio = overlapRatio(a.bbox, b.bbox);
    if (!ratio) continue;
    const key = pairKey(a.id, b.id); const item = declared.get(key);
    if (!item || ratio > item.max_ratio || ratio > STYLE_FRAME_LAYOUT_RULES.max_intentional_overlap_ratio) throw new Error(`${spec.frame_id}: undeclared or excessive overlap ${key}`);
    item.actual_ratio = Number(ratio.toFixed(6)); observed.add(key);
  }
  for (const key of declared.keys()) if (!observed.has(key)) throw new Error(`${spec.frame_id}: stale intentional overlap ${key}`);
}

function validateConnectors(spec) {
  for (const connector of spec.geometry.connectors ?? []) {
    const [fromId, toId] = connector.endpoint_asset_ids;
    const from = spec.geometry.assets.find((asset) => asset.id === fromId);
    const to = spec.geometry.assets.find((asset) => asset.id === toId);
    if (!from || !to) throw new Error(`${spec.frame_id}: connector target missing ${connector.id}`);
    const onRightBoundary = connector.start_point.x === rectRight(from.bbox) && connector.start_point.y >= from.bbox.top && connector.start_point.y <= rectBottom(from.bbox);
    const onLeftBoundary = connector.end_point.x === to.bbox.left && connector.end_point.y >= to.bbox.top && connector.end_point.y <= rectBottom(to.bbox);
    if (!onRightBoundary || !onLeftBoundary) throw new Error(`${spec.frame_id}: connector ${connector.id} is not bound to target boundaries`);
    if (connector.arrowhead !== 'at-end' || connector.clearance_px < 24) throw new Error(`${spec.frame_id}: connector ${connector.id} lacks endpoint arrow/clearance`);
  }
}

async function renderFrame(spec) {
  validateOverlaps(spec);
  validateConnectors(spec);
  const contract = {...spec, editorial_contract_version: 3, dominant_focal_asset_id: spec.focal, viewer_takeaway: spec.takeaway, layer_roles: spec.layers, hidden_asset_ids: [], supporting_asset_ids: spec.assets.filter((a) => a.id !== spec.focal).map((a) => a.id), layout_template: spec.template, narration_window: {start_frame: 0, end_frame: 180}, stable_reading_hold_seconds: 2.4, required_review_dimensions: {wide: '1920x1080', mobile: '360x203'}};
  const failures = [...validateStyleFrameGeometry(spec), ...validateEditorialFrameContract(contract)];
  if (failures.length) throw new Error(`${spec.frame_id}: ${failures.join('; ')}`);
  const output = path.join(outputRoot, `${spec.frame_id}.png`); const mobile = path.join(outputRoot, `${spec.frame_id}-360x203.png`);
  const base = await sharp(background).resize(WIDTH, HEIGHT, {fit: 'fill'}).png().toBuffer();
  const composites = [];
  if (spec.underlay) composites.push({input: svg(spec.underlay), left: 0, top: 0});
  for (const asset of spec.assets) composites.push({input: await prepared(asset.file, asset.bbox.width, asset.bbox.height, asset.rotate ?? 0, asset.fit ?? 'contain'), left: asset.bbox.left, top: asset.bbox.top});
  composites.push({input: svg(spec.overlay), left: 0, top: 0});
  await sharp(base).composite(composites).png({compressionLevel: 9, adaptiveFiltering: true}).toFile(output);
  await sharp(output).resize(360, 203, {fit: 'fill'}).png({compressionLevel: 9}).toFile(mobile);
  return {...contract, output: rel(output), output_sha256: await sha256(output), mobile: rel(mobile), mobile_sha256: await sha256(mobile), dimensions: {width: WIDTH, height: HEIGHT}, inputs: await Promise.all(spec.assets.map(async (asset) => ({asset_id: asset.id, path: rel(asset.file), sha256: await sha256(asset.file)}))), geometry: spec.geometry};
}

const f = sourceMeta;
const sourceLockDir = path.dirname(statutoryTextContract);
Object.assign(f.currentArticle, {
  overview_file: path.join(sourceLockDir, 'derived', 'SH006-document-overview-hires.png'),
  normalized_crop_file: path.join(sourceLockDir, 'derived', 'SH006-document-focus-hires.png'),
  derivation_recipe_id: 'SH006-v08-law-evidence-view-current-196-v02',
});
Object.assign(f.deletionArticle, {
  overview_file: path.join(sourceLockDir, 'derived', 'SH006-document-overview-hires.png'),
  normalized_crop_file: path.join(sourceLockDir, 'derived', 'SH006-article-196-deletion-v04.png'),
  derivation_recipe_id: 'SH006-v08-law-evidence-view-deletion-196-v02',
});
Object.assign(f.retainedArticle, {
  overview_file: path.join(sourceLockDir, 'derived', 'SH006-document-overview-hires.png'),
  normalized_crop_file: path.join(sourceLockDir, 'derived', 'SH006-article-195-retained-v04.png'),
  derivation_recipe_id: 'SH006-v08-law-evidence-view-retained-195-v02',
});
const frameSpecs = [
  {beat_id: 'B01', frame_id: 'SH006-B01-editorial-layout-v08', layout_contract_version: 2, focal: 'person-imagegen-fictional', template: 'dominant-imagegen-fictional-person-with-real-source-dossier', takeaway: '가상의 검사 역할과 실제 사건 파일 사진이 수사의 출발점을 보여준다', layers: {background: [], midground: ['dossier-real'], foreground: ['person-imagegen-fictional']}, assets: [{id: 'person-imagegen-fictional', file: f.person.file, bbox: bbox(200, 150, 470, 700), role: 'foreground'}, {id: 'dossier-real', file: f.dossier.file, bbox: bbox(850, 205, 800, 620), role: 'midground'}], overlay: `${label(435, 919, '검사 역할', RED)}${label(1250, 894, '사건 파일', TEAL)}${footer('자료 출처 · built-in image_gen(가상 인물) · Pexels 사진 4792288')}`, geometry: {assets: [{id: 'person-imagegen-fictional', bbox: bbox(200, 150, 470, 700), role: 'foreground'}, {id: 'dossier-real', bbox: bbox(850, 205, 800, 620), role: 'midground'}], texts: [{id: 'person-label', semantic_role: 'asset-label', target_id: 'person-imagegen-fictional', bbox: bbox(210, 885, 450, 55), rotation_deg: 0, font_size_px: 46, text_align: 'center', lines: [{text: '검사 역할', font_size_px: 46}]}, {id: 'dossier-label', semantic_role: 'asset-label', target_id: 'dossier-real', bbox: bbox(1060, 858, 380, 55), rotation_deg: 0, font_size_px: 46, text_align: 'center', lines: [{text: '사건 파일', font_size_px: 46}]}, {id: 'source', semantic_role: 'screen-chrome', bbox: bbox(96, 1000, 1728, 42), rotation_deg: 0, font_size_px: 27, text_align: 'right', lines: [{text: '자료 출처 · built-in image_gen(가상 인물) · Pexels 사진 4792288', font_size_px: 27}]}], connectors: [], intentional_overlaps: []}},
  {beat_id: 'B03', frame_id: 'SH006-B03-editorial-layout-v08', layout_contract_version: 2, focal: 'current-article-196', viewer_text_min_px_1080: Math.min(effectiveFont(f.currentArticle), effectiveFont(f.deletionArticle)), template: 'two-source-document-comparison', takeaway: '시행 전 제196조 원문과 개정문에서 삭제된 변화를 직접 비교한다', layers: {background: [], midground: ['deletion-article-196'], foreground: ['current-article-196']}, assets: [{id: 'current-article-196', file: f.currentArticle.file, bbox: bbox(96, 130, 1200, 560), role: 'foreground'}, {id: 'deletion-article-196', file: f.deletionArticle.file, bbox: bbox(1320, 300, 504, 280), role: 'midground'}], overlay: `${label(696, 730, '시행 전 형사소송법 제196조', RED)}${label(1572, 620, '개정문 · 삭제', TEAL)}${footer('공식 원문 출처 · 국가법령정보센터 형사소송법 · 법률 제21857호 개정문')}`, geometry: {assets: [{id: 'current-article-196', bbox: bbox(96, 130, 1200, 560), role: 'foreground'}, {id: 'deletion-article-196', bbox: bbox(1320, 300, 504, 280), role: 'midground'}], texts: [{id: 'current-label', semantic_role: 'asset-label', target_id: 'current-article-196', bbox: bbox(246, 730, 900, 55), rotation_deg: 0, font_size_px: 46, text_align: 'center', lines: [{text: '시행 전 형사소송법 제196조', font_size_px: 46}]}, {id: 'deletion-label', semantic_role: 'asset-label', target_id: 'deletion-article-196', bbox: bbox(1320, 620, 504, 55), rotation_deg: 0, font_size_px: 46, text_align: 'center', lines: [{text: '개정문 · 삭제', font_size_px: 46}]}, {id: 'source', semantic_role: 'screen-chrome', bbox: bbox(96, 1000, 1728, 42), rotation_deg: 0, font_size_px: 27, text_align: 'right', lines: [{text: '공식 원문 출처 · 국가법령정보센터 형사소송법 · 법률 제21857호 개정문', font_size_px: 27}]}], connectors: [], intentional_overlaps: []}},
  {beat_id: 'B05', frame_id: 'SH006-B05-editorial-layout-v08', layout_contract_version: 2, focal: 'retained-article-195', viewer_text_min_px_1080: effectiveFont(f.retainedArticle), template: 'left-imagegen-fictional-supporting-person-center-document-right-police', takeaway: '가상의 검사 역할에서 새 제195조를 거쳐 실제 경찰청으로 이어지는 수사 요구 경로를 보여준다', layers: {background: [], midground: ['person-imagegen-fictional', 'police-building'], foreground: ['retained-article-195']}, assets: [{id: 'route-path', file: f.routePath.file, bbox: bbox(0, 0, WIDTH, HEIGHT), role: 'context', full_bleed: true}, {id: 'person-imagegen-fictional', file: f.person.file, bbox: bbox(112, 620, 220, 260), role: 'midground'}, {id: 'retained-article-195', file: f.retainedArticle.file, bbox: bbox(360, 120, 1200, 560), role: 'foreground'}, {id: 'police-building', file: f.police.file, bbox: bbox(1604, 600, 220, 260), role: 'midground'}], overlay: `${label(236, 950, '검사 역할', RED)}${label(960, 760, '새 제195조 제2항', TEAL)}${label(1714, 930, '경찰청', TEAL)}${footer('공식 원문 출처 · 법률 제21857호 개정문 · 건물 사진 Wikimedia Commons CC BY 2.0')}`, geometry: {assets: [{id: 'person-imagegen-fictional', bbox: bbox(112, 620, 220, 260), role: 'midground'}, {id: 'retained-article-195', bbox: bbox(360, 120, 1200, 560), role: 'foreground'}, {id: 'police-building', bbox: bbox(1604, 600, 220, 260), role: 'midground'}], texts: [{id: 'person-label', semantic_role: 'asset-label', target_id: 'person-imagegen-fictional', bbox: bbox(96, 915, 280, 55), rotation_deg: 0, font_size_px: 46, text_align: 'center', lines: [{text: '검사 역할', font_size_px: 46}]}, {id: 'article-label', semantic_role: 'asset-label', target_id: 'retained-article-195', bbox: bbox(710, 720, 500, 55), rotation_deg: 0, font_size_px: 46, text_align: 'center', lines: [{text: '새 제195조 제2항', font_size_px: 46}]}, {id: 'building-label', semantic_role: 'asset-label', target_id: 'police-building', bbox: bbox(1604, 895, 220, 55), rotation_deg: 0, font_size_px: 46, text_align: 'center', lines: [{text: '경찰청', font_size_px: 46}]}, {id: 'source', semantic_role: 'screen-chrome', bbox: bbox(96, 1000, 1728, 42), rotation_deg: 0, font_size_px: 27, text_align: 'right', lines: [{text: '공식 원문 출처 · 법률 제21857호 개정문 · 건물 사진 Wikimedia Commons CC BY 2.0', font_size_px: 27}]}], connectors: connectorSpecs, intentional_overlaps: []}},
];

await rm(root, {recursive: true, force: true});
await mkdir(outputRoot, {recursive: true});
await mkdir(evidenceRoot, {recursive: true});
await writeEvidenceView({file: f.currentArticle.file, width: f.currentArticle.source_dimensions.width, height: f.currentArticle.source_dimensions.height, title: '제196조(검사의 수사)', quote: f.currentArticle.display_quote, fontSize: f.currentArticle.source_render_font_px});
await writeEvidenceView({file: f.deletionArticle.file, width: f.deletionArticle.source_dimensions.width, height: f.deletionArticle.source_dimensions.height, title: '개정문 · 제196조', quote: f.deletionArticle.display_quote, fontSize: f.deletionArticle.source_render_font_px, lineHeightPx: 140});
await writeEvidenceView({file: f.retainedArticle.file, width: f.retainedArticle.source_dimensions.width, height: f.retainedArticle.source_dimensions.height, title: '새 제195조제2항', quote: f.retainedArticle.exact_quote, fontSize: f.retainedArticle.source_render_font_px});
await writeFile(f.routePath.file, svg(routeMarkup, WIDTH, HEIGHT), 'utf8');
for (const meta of [f.currentArticle, f.deletionArticle, f.retainedArticle]) {
  meta.effective_font_px_1080 = effectiveFont(meta);
  meta.derivation_script = 'video/scripts/build-sh006-editorial-style-frames-v08.mjs';
  meta.derivation_version = 'v08.4';
  meta.source_lock_sha256 = await sha256(meta.source_lock_file);
  meta.evidence_view_steps = {
    overview: {path: rel(meta.overview_file), sha256: await sha256(meta.overview_file)},
    'normalized-crop': {path: rel(meta.normalized_crop_file), sha256: await sha256(meta.normalized_crop_file)},
    'exact-retype': {path: rel(meta.file), sha256: await sha256(meta.file)},
  };
  meta.derivation_recipe = {
    recipe_id: meta.derivation_recipe_id,
    version: meta.derivation_version,
    derivation_script: meta.derivation_script,
    source_lock_path: rel(meta.source_lock_file),
    source_lock_sha256: meta.source_lock_sha256,
    source_locator: meta.source_locator,
    exact_quote: meta.exact_quote,
    display_quote: meta.display_quote,
    source_dimensions: meta.source_dimensions,
    source_render_font_px: meta.source_render_font_px,
    displayed_width_px: meta.displayed_width_px,
    evidence_view_sequence: meta.evidence_view_sequence,
    evidence_view_steps: meta.evidence_view_steps,
    typography: 'Malgun Gothic exact quote in source-sized SVG',
  };
  meta.recipe_sha256 = recipeHash(meta.derivation_recipe);
}
const assets = [{asset_id: 'fixed-background', file: rel(background), asset_class: 'background', origin: 'real-source', source_kind: 'source-original', source_id: 'SHARED-PAPER-BEIGE-CHECK', source_path: rel(background), license: 'Project-owned fixed editorial background'}];
for (const [key, meta] of Object.entries(sourceMeta)) assets.push({asset_id: key === 'routePath' ? 'route-path' : key === 'person' ? 'person-imagegen-fictional' : key, file: rel(meta.file), asset_class: meta.asset_class, origin: meta.origin, source_kind: meta.source_kind, source_id: meta.source_id, original_url: meta.original_url, source_path: rel(meta.file), license: meta.license, ...(meta.identity_scope ? {identity_scope: meta.identity_scope, ai_disclosure: meta.ai_disclosure} : {}), ...(meta.deterministic ? {deterministic: true, explanatory_overlay: true} : {}), ...(meta.source_lock_file ? {source_lock_path: rel(meta.source_lock_file), source_lock_sha256: meta.source_lock_sha256, source_locator: meta.source_locator, exact_quote: meta.exact_quote, display_quote: meta.display_quote ?? meta.exact_quote, evidence_view_sequence: meta.evidence_view_sequence, evidence_view_steps: meta.evidence_view_steps, source_dimensions: meta.source_dimensions, source_render_font_px: meta.source_render_font_px, displayed_width_px: meta.displayed_width_px, effective_font_px_1080: meta.effective_font_px_1080, derivation_script: meta.derivation_script, derivation_version: meta.derivation_version, derivation_recipe_id: meta.derivation_recipe_id, derivation_recipe: meta.derivation_recipe, recipe_sha256: meta.recipe_sha256} : {})});
const provenance = await Promise.all(assets.map(async (asset) => ({asset_id: asset.asset_id, origin: asset.origin, source_kind: asset.source_kind, source_id: asset.source_id, source_path: asset.source_path, original_url: asset.original_url ?? null, license: asset.license, ...(asset.identity_scope ? {identity_scope: asset.identity_scope, ai_disclosure: asset.ai_disclosure} : {}), ...(asset.deterministic ? {deterministic: true, explanatory_overlay: true} : {}), ...(asset.source_lock_path ? {source_lock_path: asset.source_lock_path, source_lock_sha256: asset.source_lock_sha256, source_locator: asset.source_locator, exact_quote: asset.exact_quote, display_quote: asset.display_quote, evidence_view_sequence: asset.evidence_view_sequence, evidence_view_steps: asset.evidence_view_steps, source_dimensions: asset.source_dimensions, source_render_font_px: asset.source_render_font_px, displayed_width_px: asset.displayed_width_px, effective_font_px_1080: asset.effective_font_px_1080, derivation_script: asset.derivation_script, derivation_version: asset.derivation_version, derivation_recipe_id: asset.derivation_recipe_id, derivation_recipe: asset.derivation_recipe, recipe_sha256: asset.recipe_sha256} : {}), sha256: await sha256(path.join(repoRoot, asset.file))})));
for (const entry of provenance) assets.find((asset) => asset.asset_id === entry.asset_id).sha256 = entry.sha256;
const manifestBase = {schema_version: 3, episode_id: 'episode-001', shot_id: 'SH006', candidate_id: 'SH006-editorial-v08', supersedes_for_style_review: 'SH006-editorial-v07', supersession_is_historical_only: true, production_authority: false, supersession_reason: 'Historical style comparison only: replaces self-authored non-person raster art with source-derived evidence views and permits exactly one disclosed fictional-generic imagegen person while retaining the v07 object-led visual grammar.', status: 'pending-user-style-frame-review', review_scope: 'real-source-quality-and-viewer-first-editorial-composition-only', review_profile: 'source-photo-treatment', editorial_contract_version: 3, production_visible: false, user_style_frame_pass: false, user_cut_pass: false, rights_approved: false, omni_video_approved: false, stage_advanced: false, typography_surface_contract_version: 2, layout_contract_version: 2, asset_origin_policy: {version: 1, person_imagegen_allowed: true, non_person_source_required: true, deterministic_overlay_classes: ['deterministic-overlay', 'chart', 'path', 'effect', 'mask', 'text-surface'], omni_keyframes_are_separate_route: true}, assets, asset_provenance: provenance, reference_transfer: {reference_frames: ['raw/inbox/vox-style-claude-remotion-reference.mp4 00:06–00:12', 'wiki/sources/mo-sidd-remotion-production-series.md §5–§7'], observed_grammar: ['large real-source focal object', 'asymmetric support', 'physical paper relationship', 'quiet level source rail'], excluded_elements: ['imagegen non-person raster', 'duplicate retyped text over official document PNGs', 'viewer-facing production jargon', 'self-authored building or paper substitute']}, reference_parity: {dominant_focal_required: true, asymmetric_support_required: true, protected_evidence_zones: true, static_to_playable_parity: {status: 'blocked-pre-style-pass', required_after_user_style_pass: true, pass: false, parity_record: null}, motion_proof: {status: 'not-applicable-before-style-pass', static_png_is_not_motion_proof: true, pass: false}}, provenance_note: 'Independent non-person raster assets are source-derived or real/official source material. Legal evidence views bind the official source-lock contract, exact quote, derivation recipe and local generated bytes. The single person raster is a disclosed fictional-generic imagegen derivative labeled 검사 역할 and is not a named or identifiable official; police building is labeled 경찰청. Supersession is historical style-review bookkeeping only and does not grant production authority.', frames: [], prohibited_rules_post_cut_recheck: ['no-imagegen-non-person-raster', 'no-duplicate-retyped-overlay-on-official-documents', 'no-self-authored-building-or-paper-object-substitute', 'no-asset-label-on-or-over-any-asset', 'no-screen-chrome-on-or-over-any-asset', 'no-arbitrary-asset-overlap', 'no-omni-video-before-all-cut-pass']};
manifestBase.connector_specs = connectorSpecs;
manifestBase.frames = [];
for (const spec of frameSpecs) manifestBase.frames.push(await renderFrame(spec));
const thumbs = await Promise.all(manifestBase.frames.map((frame) => sharp(path.join(repoRoot, frame.output)).resize(600, 338).png().toBuffer()));
const contact = path.join(outputRoot, 'SH006-editorial-real-source-v08-contact.png');
const contactTitle = svg(`${text(54, 54, 'SH006 · REAL / OFFICIAL SOURCE STYLE FRAME REVIEW', 30, INK, 900)}${text(54, 96, 'B01 · 가상 인물 + 사건 파일', 22, RED, 850)}${text(654, 96, 'B03 · 공식 조문 원문 비교', 22, TEAL, 850)}${text(1254, 96, 'B05 · 검사 → 제195조 → 경찰청', 22, MUTED, 850)}`, 1920, 520);
await sharp({create: {width: 1920, height: 520, channels: 4, background: '#eee7da'}}).composite([{input: contactTitle, left: 0, top: 0}, ...thumbs.map((input, index) => ({input, left: 20 + index * 640, top: 132}))]).png({compressionLevel: 9}).toFile(contact);
manifestBase.contact = {path: rel(contact), sha256: await sha256(contact), dimensions: {width: 1920, height: 520}};
const policyFailures = validatePersonOnlyImagegenPolicy(manifestBase, {label: 'SH006-editorial-v08', requirePolicy: true});
if (policyFailures.length) throw new Error(policyFailures.join('\n'));
await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifestBase, null, 2)}\n`, 'utf8');
await writeFile(path.join(root, 'README.md'), '# SH006 editorial real/official-source style frames v08\n\n- Status: pending user style-frame and asset review; production_visible=false.\n- Exactly one person raster is imagegen-derived with `origin=imagegen-person`, `identity_scope=fictional-generic`, and `ai_disclosure=true`; it is labeled 검사 역할 and is not a named official. All non-person raster assets are real/official-source or source-derived evidence views.\n- B01 uses the fictional imagegen person asset (`person-imagegen-fictional`) and real dossier photo. B03 uses v08-local source-lock-derived evidence views without duplicate viewer overlay; the current Article 196 card is the dominant 1200px-wide focal and the deletion quote is a readable two-line support card. B05 routes the imagegen fictional supporting person → dominant 1200px-wide retained Article 195 → right Korean National Police Agency photo.\n- B03 and B05 declare calculated `viewer_text_min_px_1080` values from source font, source dimensions, and displayed width; both meet the 72px minimum in the 360×203 review.\n- Each legal evidence view records an independent source-lock contract/hash, locator, exact/display quote, source dimensions, displayed width, and `overview -> normalized-crop -> exact-retype` step paths/hashes inside its own derivation recipe/hash. The B05 route is a separate deterministic `path` asset generated from the same connector specs as manifest geometry; both connectors have visible arrowheads and endpoint-bound coordinates, and the path is not a paper/building/object substitute.\n- `supersedes_for_style_review` is historical bookkeeping only (`supersession_is_historical_only=true`); this candidate remains pending comparison review, `production_authority=false`, and is not motion proof, cut PASS, rights approval, Omni approval, or production authority.\n', 'utf8');
console.log(JSON.stringify({candidate: manifestBase.candidate_id, outputs: manifestBase.frames.map((frame) => ({frame_id: frame.frame_id, output: frame.output, sha256: frame.output_sha256, mobile: frame.mobile, mobile_sha256: frame.mobile_sha256})), contact: manifestBase.contact, policy: 'PASS'}, null, 2));
