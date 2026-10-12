import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {STYLE_FRAME_LAYOUT_CONTRACT_VERSION, STYLE_FRAME_LAYOUT_RULES, bbox, validateStyleFrameGeometry} from './style-frame-layout-contract.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const root = path.join(repoRoot, 'video', 'qa', 'style-frames', 'episode-001', 'SH006-editorial-v05');
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
const svg = (body, width = WIDTH, height = HEIGHT) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="13" flood-color="#172a34" flood-opacity="0.18"/></filter><marker id="arrow" markerWidth="14" markerHeight="14" refX="11" refY="7" orient="auto"><path d="M0 0 L14 7 L0 14 Z" fill="${TEAL}"/></marker></defs><g font-family="${FONT}" text-rendering="geometricPrecision">${body}</g></svg>`);
const text = (x, y, value, size, fill = INK, weight = 800, anchor = 'start') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="-1">${xml(value)}</text>`;
const label = (x, y, value, color = BLUE, size = 46) => `<g><circle cx="${x - 18}" cy="${y - 15}" r="6" fill="${color}"/>${text(x, y, value, size, INK, 900, 'middle')}</g>`;
const footer = (value) => `<g><rect x="0" y="986" width="1920" height="94" fill="#efe7d9" fill-opacity="0.98"/><line x1="96" y1="986" x2="1824" y2="986" stroke="${MUTED}" stroke-opacity="0.22" stroke-width="2"/>${text(1824, 1042, value, 27, MUTED, 750, 'end')}</g>`;
const header = (kicker, title, accent = RED) => `${text(96, 106, kicker, 32, accent, 900)}${text(96, 172, title, 58, INK, 900)}`;

async function prepared(file, width, height) {
  const metadata = await sharp(file).metadata();
  const source = metadata.hasAlpha ? sharp(file).trim({background: {r: 0, g: 0, b: 0, alpha: 0}}) : sharp(file);
  return source.resize({width, height, fit: 'contain', background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer();
}

async function renderFrame(spec) {
  const failures = validateStyleFrameGeometry(spec);
  if (failures.length) throw new Error(`Style-frame geometry failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  const output = path.join(outputRoot, `${spec.frame_id}.png`);
  const mobile = path.join(outputRoot, `${spec.frame_id}-360x203.png`);
  const base = await sharp(background).resize(WIDTH, HEIGHT, {fit: 'fill'}).png().toBuffer();
  const composites = [];
  for (const asset of spec.assets) composites.push({input: await prepared(asset.file, asset.bbox.width, asset.bbox.height), left: asset.bbox.left, top: asset.bbox.top});
  composites.push({input: svg(spec.overlay), left: 0, top: 0});
  await sharp(base).composite(composites).png({compressionLevel: 9, adaptiveFiltering: true}).toFile(output);
  await sharp(output).resize(360, 203, {fit: 'fill'}).png({compressionLevel: 9}).toFile(mobile);
  return {
    beat_id: spec.beat_id,
    frame_id: spec.frame_id,
    layout_contract_version: spec.layout_contract_version,
    output: rel(output), output_sha256: await sha256(output), mobile: rel(mobile), mobile_sha256: await sha256(mobile),
    dimensions: {width: WIDTH, height: HEIGHT},
    inputs: await Promise.all(spec.assets.map(async (asset) => ({asset_id: asset.id, path: rel(asset.file), sha256: await sha256(asset.file)}))),
    geometry: spec.geometry,
  };
}

await mkdir(outputRoot, {recursive: true});
const inputRoot = path.join(root, 'input', 'assets');
await mkdir(inputRoot, {recursive: true});
const comparisonDocument = path.join(inputRoot, 'article-196-wide-document.png');
const comparisonAmendment = path.join(inputRoot, 'law-21857-wide-amendment.png');
await sharp(svg(`<rect x="20" y="20" width="760" height="520" rx="16" fill="#f7efe1" stroke="#294f61" stroke-width="8"/><rect x="42" y="42" width="716" height="476" rx="10" fill="none" stroke="#294f61" stroke-opacity="0.34" stroke-width="3"/><circle cx="690" cy="90" r="34" fill="none" stroke="#9f8e78" stroke-width="5" opacity="0.42"/>`, 800, 560)).png().toFile(comparisonDocument);
await sharp(svg(`<g transform="rotate(-1.2 400 280)"><rect x="55" y="65" width="690" height="430" fill="#172a34" opacity="0.96"/></g><g transform="rotate(1.5 400 280)"><rect x="50" y="60" width="700" height="440" fill="#a84035"/><rect x="78" y="88" width="644" height="384" fill="none" stroke="#f4d4bf" stroke-width="5" opacity="0.72"/></g>`, 800, 560)).png().toFile(comparisonAmendment);

const files = {
  person: path.join(assetRoot, 'sh006-prosecutor-editorial.png'),
  suspect: path.join(assetRoot, 'sh006-suspect-dossier-editorial.png'),
  facts: path.join(assetRoot, 'sh006-facts-folder-editorial.png'),
  alley: path.join(assetRoot, 'sh006-alley-photo-editorial.png'),
  document: comparisonDocument,
  amendment: comparisonAmendment,
  deleted: path.join(assetRoot, 'sh006-deleted-document-editorial.png'),
  request: path.join(assetRoot, 'sh006-request-card-editorial.png'),
  building: path.join(assetRoot, 'sh006-public-office-building-editorial.png'),
};

const frameSpecs = [
  {
    beat_id: 'B01', frame_id: 'SH006-B01-editorial-layout-v05', layout_contract_version: STYLE_FRAME_LAYOUT_CONTRACT_VERSION,
    assets: [
      {id: 'prosecutor-role', file: files.person, bbox: bbox(120, 220, 500, 560), row_id: 'evidence-row', baseline_group: 'evidence-row'},
      {id: 'suspect-record', file: files.suspect, bbox: bbox(750, 500, 240, 280), row_id: 'evidence-row', baseline_group: 'evidence-row'},
      {id: 'facts-folder', file: files.facts, bbox: bbox(1120, 500, 250, 280), row_id: 'evidence-row', baseline_group: 'evidence-row'},
      {id: 'evidence-photo', file: files.alley, bbox: bbox(1500, 500, 280, 280), row_id: 'evidence-row', baseline_group: 'evidence-row'},
    ],
    overlay: `${header('시행 전 · 형사소송법 제196조', '검사는 무엇을 직접 수사했나?')}${text(760, 300, '“범인·범죄사실·증거를', 76, INK, 900)}${text(760, 388, '수사한다.”', 88, RED, 900)}<line x1="760" y1="414" x2="1260" y2="414" stroke="${RED}" stroke-width="8"/>${label(370, 876, '검사', RED)}${label(870, 876, '범인', BLUE)}${label(1245, 876, '범죄사실', BLUE)}${label(1640, 876, '증거', BLUE)}${footer('출처 · 형사소송법 제196조 제1항(2026.10.2. 시행 전 조문)')}`,
    geometry: {
      assets: [
        {id: 'prosecutor-role', bbox: bbox(120, 220, 500, 560), row_id: 'evidence-row', baseline_group: 'evidence-row'},
        {id: 'suspect-record', bbox: bbox(750, 500, 240, 280), row_id: 'evidence-row', baseline_group: 'evidence-row'},
        {id: 'facts-folder', bbox: bbox(1120, 500, 250, 280), row_id: 'evidence-row', baseline_group: 'evidence-row'},
        {id: 'evidence-photo', bbox: bbox(1500, 500, 280, 280), row_id: 'evidence-row', baseline_group: 'evidence-row'},
      ],
      texts: [
        {id: 'label-prosecutor', semantic_role: 'asset-label', target_id: 'prosecutor-role', bbox: bbox(230, 820, 280, 70), rotation_deg: 0, font_size_px: 46, text_align: 'center', lines: [{text: '검사', font_size_px: 46}]},
        {id: 'label-suspect', semantic_role: 'asset-label', target_id: 'suspect-record', bbox: bbox(750, 820, 240, 70), rotation_deg: 0, font_size_px: 46, text_align: 'center', lines: [{text: '범인', font_size_px: 46}]},
        {id: 'label-facts', semantic_role: 'asset-label', target_id: 'facts-folder', bbox: bbox(1120, 820, 250, 70), rotation_deg: 0, font_size_px: 46, text_align: 'center', lines: [{text: '범죄사실', font_size_px: 46}]},
        {id: 'label-evidence', semantic_role: 'asset-label', target_id: 'evidence-photo', bbox: bbox(1500, 820, 280, 70), rotation_deg: 0, font_size_px: 46, text_align: 'center', lines: [{text: '증거', font_size_px: 46}]},
        {id: 'header', semantic_role: 'screen-chrome', bbox: bbox(96, 72, 1400, 110), rotation_deg: 0, font_size_px: 58, text_align: 'left', lines: [{text: '시행 전 · 형사소송법 제196조', font_size_px: 32}, {text: '검사는 무엇을 직접 수사했나?', font_size_px: 58}]},
        {id: 'headline', semantic_role: 'screen-chrome', bbox: bbox(760, 220, 1000, 210), rotation_deg: 0, font_size_px: 88, text_align: 'left', lines: [{text: '“범인·범죄사실·증거를', font_size_px: 76}, {text: '수사한다.”', font_size_px: 88}]},
        {id: 'source', semantic_role: 'screen-chrome', bbox: bbox(96, 1000, 1728, 42), rotation_deg: 0, font_size_px: 27, text_align: 'right', lines: [{text: '출처 · 형사소송법 제196조 제1항(2026.10.2. 시행 전 조문)', font_size_px: 27}]},
      ], connectors: [], intentional_overlaps: [],
    },
  },
  {
    beat_id: 'B03', frame_id: 'SH006-B03-editorial-layout-v05', layout_contract_version: STYLE_FRAME_LAYOUT_CONTRACT_VERSION,
    assets: [
      {id: 'article-196-document', file: files.document, bbox: bbox(160, 220, 700, 560), row_id: 'law-pair', baseline_group: 'law-pair', surface_rotation_deg: 0},
      {id: 'amendment-paper', file: files.amendment, bbox: bbox(1060, 220, 700, 560), row_id: 'law-pair', baseline_group: 'law-pair', surface_rotation_deg: 1.5},
    ],
    overlay: `${header('조문 변화 · 원문 대조', '제196조는 이렇게 삭제됩니다')}${text(250, 336, '제196조', 52, BLUE, 900)}<g transform="translate(250 0) scale(0.74 1) translate(-250 0)">${text(250, 436, '범인·범죄사실·증거', 72, INK, 900)}</g>${text(250, 526, '직접 수사', 88, INK, 900)}<line x1="250" y1="558" x2="690" y2="558" stroke="${RED}" stroke-width="8"/><g transform="rotate(1.5 1410 500)">${text(1150, 348, '개정문', 48, '#fff', 900)}${text(1150, 472, '“제196조를', 76, '#fff', 900)}${text(1150, 564, '삭제한다.”', 88, '#fff', 900)}</g><path d="M910 490 L990 490 M965 466 L990 490 L965 514" fill="none" stroke="${TEAL}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>${label(510, 876, '시행 전 제196조', BLUE)}${label(1410, 876, '법률 제21857호 개정문', RED)}${footer('출처 · 형사소송법 시행 전 제196조 / 법률 제21857호 「형사소송법 일부개정법률」')}`,
    geometry: {
      assets: [
        {id: 'article-196-document', bbox: bbox(160, 220, 700, 560), row_id: 'law-pair', baseline_group: 'law-pair', surface_rotation_deg: 0},
        {id: 'amendment-paper', bbox: bbox(1060, 220, 700, 560), row_id: 'law-pair', baseline_group: 'law-pair', surface_rotation_deg: 1.5},
      ],
      texts: [
        {id: 'article-196-copy', semantic_role: 'surface-content', placement: 'on-surface', target_id: 'article-196-document', bbox: bbox(250, 300, 600, 280), rotation_deg: 0, font_size_px: 88, kind: 'quote', text_align: 'left', lines: [{text: '제196조', font_size_px: 52}, {text: '범인·범죄사실·증거', font_size_px: 72, horizontal_scale: 0.74}, {text: '직접 수사', font_size_px: 88}]},
        {id: 'amendment-copy', semantic_role: 'surface-content', placement: 'on-surface', target_id: 'amendment-paper', bbox: bbox(1150, 300, 580, 300), rotation_deg: 1.5, font_size_px: 88, kind: 'quote', text_align: 'left', lines: [{text: '개정문', font_size_px: 48}, {text: '“제196조를', font_size_px: 76}, {text: '삭제한다.”', font_size_px: 88}]},
        {id: 'label-article', semantic_role: 'asset-label', target_id: 'article-196-document', bbox: bbox(310, 820, 400, 70), rotation_deg: 0, font_size_px: 46, text_align: 'center', lines: [{text: '시행 전 제196조', font_size_px: 46}]},
        {id: 'label-amendment', semantic_role: 'asset-label', target_id: 'amendment-paper', bbox: bbox(1120, 820, 580, 70), rotation_deg: 0, font_size_px: 46, text_align: 'center', lines: [{text: '법률 제21857호 개정문', font_size_px: 46}]},
        {id: 'header', semantic_role: 'screen-chrome', bbox: bbox(96, 72, 1400, 110), rotation_deg: 0, font_size_px: 58, text_align: 'left', lines: [{text: '조문 변화 · 원문 대조', font_size_px: 32}, {text: '제196조는 이렇게 삭제됩니다', font_size_px: 58}]},
        {id: 'source', semantic_role: 'screen-chrome', bbox: bbox(96, 1000, 1728, 42), rotation_deg: 0, font_size_px: 27, text_align: 'right', lines: [{text: '출처 · 형사소송법 시행 전 제196조 / 법률 제21857호 「형사소송법 일부개정법률」', font_size_px: 27}]},
      ], connectors: [{id: 'change-arrow', bbox: bbox(900, 454, 120, 72), endpoint_asset_ids: ['article-196-document', 'amendment-paper']}], intentional_overlaps: [],
    },
  },
  {
    beat_id: 'B05', frame_id: 'SH006-B05-editorial-layout-v05', layout_contract_version: STYLE_FRAME_LAYOUT_CONTRACT_VERSION,
    assets: [
      {id: 'deleted-direct-investigation', file: files.deleted, bbox: bbox(110, 250, 500, 510), row_id: 'summary-row', baseline_group: 'summary-row', surface_rotation_deg: 0},
      {id: 'prosecutor', file: files.person, bbox: bbox(720, 290, 280, 470), row_id: 'summary-row', baseline_group: 'summary-row'},
      {id: 'request-sheet', file: files.request, bbox: bbox(1090, 380, 300, 380), row_id: 'summary-row', baseline_group: 'summary-row'},
      {id: 'investigation-agency', file: files.building, bbox: bbox(1510, 360, 310, 400), row_id: 'summary-row', baseline_group: 'summary-row'},
    ],
    overlay: `${header('삭제와 존속 · 최종 비교', '없어진 길과 남아 있는 길')}${text(200, 350, '제196조', 50, RED, 900)}${text(200, 450, '직접 수사', 74, INK, 900)}${text(200, 542, '삭제', 92, RED, 900)}<line x1="200" y1="572" x2="500" y2="572" stroke="${RED}" stroke-width="9"/>${text(760, 248, '제195조제2항 · 보완수사요구·재수사요구 직무는 남음', 42, TEAL, 900)}<path d="M1018 515 L1068 515 M1046 493 L1068 515 L1046 537" fill="none" stroke="${TEAL}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M1410 515 L1484 515 M1462 493 L1484 515 L1462 537" fill="none" stroke="${TEAL}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>${label(360, 856, '직접 수사 근거 삭제', RED)}${label(860, 856, '검사', BLUE)}${label(1240, 856, '구체적 요구서', TEAL)}${label(1665, 856, '수사기관', BLUE)}${footer('출처 · 형사소송법 개정문 · 제196조 삭제 / 제195조제2항 보완수사요구·재수사요구 직무')}`,
    geometry: {
      assets: [
        {id: 'deleted-direct-investigation', bbox: bbox(110, 250, 500, 510), row_id: 'summary-row', baseline_group: 'summary-row', surface_rotation_deg: 0},
        {id: 'prosecutor', bbox: bbox(720, 290, 280, 470), row_id: 'summary-row', baseline_group: 'summary-row'},
        {id: 'request-sheet', bbox: bbox(1090, 380, 300, 380), row_id: 'summary-row', baseline_group: 'summary-row'},
        {id: 'investigation-agency', bbox: bbox(1510, 360, 310, 400), row_id: 'summary-row', baseline_group: 'summary-row'},
      ],
      texts: [
        {id: 'deleted-copy', semantic_role: 'surface-content', placement: 'on-surface', target_id: 'deleted-direct-investigation', bbox: bbox(190, 310, 380, 290), rotation_deg: 0, font_size_px: 92, kind: 'quote', text_align: 'left', lines: [{text: '제196조', font_size_px: 50}, {text: '직접 수사', font_size_px: 74}, {text: '삭제', font_size_px: 92}]},
        {id: 'label-deleted', semantic_role: 'asset-label', target_id: 'deleted-direct-investigation', bbox: bbox(125, 800, 470, 70), rotation_deg: 0, font_size_px: 46, text_align: 'center', lines: [{text: '직접 수사 근거 삭제', font_size_px: 46}]},
        {id: 'label-prosecutor', semantic_role: 'asset-label', target_id: 'prosecutor', bbox: bbox(720, 800, 280, 70), rotation_deg: 0, font_size_px: 46, text_align: 'center', lines: [{text: '검사', font_size_px: 46}]},
        {id: 'label-request', semantic_role: 'asset-label', target_id: 'request-sheet', bbox: bbox(1070, 800, 340, 70), rotation_deg: 0, font_size_px: 46, text_align: 'center', lines: [{text: '구체적 요구서', font_size_px: 46}]},
        {id: 'label-agency', semantic_role: 'asset-label', target_id: 'investigation-agency', bbox: bbox(1510, 800, 310, 70), rotation_deg: 0, font_size_px: 46, text_align: 'center', lines: [{text: '수사기관', font_size_px: 46}]},
        {id: 'header', semantic_role: 'screen-chrome', bbox: bbox(96, 72, 1400, 110), rotation_deg: 0, font_size_px: 58, text_align: 'left', lines: [{text: '삭제와 존속 · 최종 비교', font_size_px: 32}, {text: '없어진 길과 남아 있는 길', font_size_px: 58}]},
        {id: 'route-caption', semantic_role: 'screen-chrome', bbox: bbox(760, 200, 1170, 60), rotation_deg: 0, font_size_px: 42, text_align: 'left', lines: [{text: '제195조제2항 · 보완수사요구·재수사요구 직무는 남음', font_size_px: 42}]},
        {id: 'source', semantic_role: 'screen-chrome', bbox: bbox(96, 1000, 1728, 42), rotation_deg: 0, font_size_px: 27, text_align: 'right', lines: [{text: '출처 · 형사소송법 개정문 · 제196조 삭제 / 제195조제2항 보완수사요구·재수사요구 직무', font_size_px: 27}]},
      ],
      connectors: [
        {id: 'request-arrow', bbox: bbox(1018, 479, 52, 72), endpoint_asset_ids: ['prosecutor', 'request-sheet']},
        {id: 'agency-arrow', bbox: bbox(1410, 479, 76, 72), endpoint_asset_ids: ['request-sheet', 'investigation-agency']},
      ], intentional_overlaps: [],
    },
  },
];

const records = [];
for (const spec of frameSpecs) records.push(await renderFrame(spec));

const contact = path.join(outputRoot, 'SH006-editorial-layout-v05-contact.png');
const thumbs = await Promise.all(records.map((record) => sharp(path.join(repoRoot, record.output)).resize(560, 315).png().toBuffer()));
const contactHeader = svg(`${text(60, 50, 'SH006 · LABEL LANE / SPATIAL RHYTHM · STYLE REVIEW ONLY', 30, INK, 900)}${text(60, 96, 'B01 4개 asset 분리', 22, BLUE, 850)}${text(660, 96, 'B03 동등한 법률 원문 대조', 22, RED, 850)}${text(1260, 96, 'B05 삭제/존속 경로 분리', 22, TEAL, 850)}`, 1920, 500);
await sharp({create: {width: 1920, height: 520, channels: 4, background: '#eee7da'}}).composite([
  {input: contactHeader, left: 0, top: 0},
  ...thumbs.map((input, index) => ({input, left: 60 + index * 600, top: 132})),
]).png({compressionLevel: 9}).toFile(contact);

const manifest = {
  schema_version: 2,
  episode_id: 'episode-001', shot_id: 'SH006', candidate_id: 'SH006-editorial-v05',
  supersedes_for_style_review: 'SH006-editorial-v04',
  supersession_reason: 'V04 copied earlier flat frames and did not validate label/asset overlap, alignment, spacing, or connector lanes. V05 rebuilds every representative frame on measurable semantic layout geometry.',
  status: 'pending-user-style-frame-review', review_scope: 'typography-composition-label-lanes-and-spatial-rhythm-only', review_profile: 'remotion-motion',
  production_visible: false, user_style_frame_pass: false, user_cut_pass: false, rights_approved: false, omni_video_approved: false, stage_advanced: false,
  typography_surface_contract_version: 2,
  typography_semantic_roles: {
    'asset-label': 'Names or explains an asset; must remain 0 degrees in a reserved external label lane and never overlap any asset.',
    'surface-content': 'Source-locked words with placement on-surface on one named document surface; must match that surface angle, remain inside it, and overlap no other asset.',
    'screen-chrome': 'Kicker, title, general explanation, and source rail; fixed at 0 degrees and outside every asset.',
  },
  layout_contract: STYLE_FRAME_LAYOUT_RULES,
  typography_source: 'raw/sources/episode-001-sh006-viewer-first-law-sources-2026-08-29.md §1–§2',
  provenance_note: 'All representative frames are newly composed from independent local production-asset candidates. No V02/V03/V04 review PNG is copied into V05.',
  frames: records,
  contact: {path: rel(contact), sha256: await sha256(contact), dimensions: {width: 1920, height: 520}},
  prohibited_rules_post_cut_recheck: [
    'no-asset-label-on-or-over-any-asset', 'no-screen-chrome-on-or-over-any-asset', 'no-rotation-for-asset-label-or-screen-chrome', 'no-arbitrary-asset-coordinates-without-geometry-record',
    'no-undeclared-asset-overlap', 'no-connector-through-asset-or-label-lane', 'no-surface-content-without-on-surface-placement', 'no-surface-content-angle-mismatch-or-non-target-overlap',
    'no-flat-composite-as-independent-motion-proof', 'no-reading-hold-camera-or-document-motion', 'no-unapproved-morph-or-scene-to-scene-claim',
    'no-omni-video-before-all-cut-pass', 'no-source-ui-as-reading-screen',
  ],
};

await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile(path.join(root, 'README.md'), '# SH006 editorial typography/layout style frames v05\n\n- Status: pending user style-frame review.\n- Asset labels and screen chrome are external, level, and separated from every asset by at least 32px.\n- Same-row assets keep at least 64px spacing; connector paths use reserved gaps.\n- Only source-locked document content may sit on its named document surface; its angle must match that surface within 0.05° and remain within ±2°.\n- V04 is preserved as a rejected historical candidate.\n- These files do not grant cut PASS, rights approval, Omni approval, or a stage advance.\n', 'utf8');
console.log(JSON.stringify(manifest, null, 2));
