import {createHash} from 'node:crypto';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
import {
  CONTACT_HEIGHT,
  CONTACT_WIDTH,
  RENDERER_RECIPE_ID,
  RENDERER_RECIPE_PATH,
  renderBlockedContactBuffer,
  renderBoardBuffer,
  renderContactBuffer,
  renderStyleFrameBuffers,
} from './lib/grammar-bound-style-frame-renderer-v05.mjs';

const root = process.cwd();
const OUT_REL = 'video/qa/style-frames/episode-001/reference-style-families-v05';
const out = path.join(root, OUT_REL);
const grammarPath = path.join(root, 'video/episodes/episode-001/reference-grammar-contract.json');
const specPath = path.join(root, 'video/episodes/episode-001/episode-spec.json');
const gatesPath = path.join(root, 'video/episodes/episode-001/reference-style-gates.json');
const statePath = path.join(root, 'video/episodes/episode-001/production-state.json');
const blueprintPath = path.join(root, 'video/episodes/episode-001/generated/reference-cut-blueprint.json');
const oldIndexPath = path.join(root, 'video/qa/style-frames/episode-001/reference-style-families-v04/family-index.json');
const BEATS = ['opening', 'evidence-or-change', 'final-summary'];
const FAMILY_IDS = ['hook-source-collage', 'assembly-editorial', 'law-document-editorial', 'omni-fiction-continuity', 'process-route-editorial', 'time-data-editorial'];
const digest = (value) => createHash('sha256').update(value).digest('hex');
const shaFile = async (file) => digest(await readFile(file));
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const writeJson = async (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const rel = (file) => path.relative(root, file).replaceAll('\\', '/');
const stableDigest = (value) => digest(Buffer.from(JSON.stringify(value)));
const run = (file) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [file], {cwd: root, stdio: 'inherit'});
  child.on('error', reject);
  child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)));
});
const xml = (value) => String(value).replace(/[&<>"']/gu, (character) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[character]));
const tc = (frame, fps) => {
  const seconds = frame / fps;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${remainder.toFixed(3).padStart(6, '0')}`;
};

const grammar = await readJson(grammarPath);
const spec = await readJson(specPath);
const specRecord = {path: rel(specPath), sha256: await shaFile(specPath)};
const grammarRecord = {path: rel(grammarPath), sha256: await shaFile(grammarPath)};
const rendererRecord = {recipe_id: RENDERER_RECIPE_ID, path: RENDERER_RECIPE_PATH, sha256: await shaFile(path.join(root, RENDERER_RECIPE_PATH))};
const oldIndexRecord = {path: rel(oldIndexPath), sha256: await shaFile(oldIndexPath), authority: 'historical-human-review-failed', used_as_render_input: false};
const shots = new Map(spec.cuts.map((cut) => [cut.shot_id, cut]));
const shotBinding = (shotId) => {
  const cut = shots.get(shotId);
  if (!cut) throw new Error(`unknown representative shot ${shotId}`);
  return {shot_id: shotId, production_mode: cut.production_mode, viewer_takeaway: cut.viewer_takeaway, cut_sha256: stableDigest(cut)};
};

const sampleDirectories = new Map([
  [1, 'sample-01-shared-background-accumulation'],
  [2, 'sample-02-numeric-step-progression'],
  [3, 'sample-03-chart-reveal'],
  [4, 'sample-04-map-route-reframe'],
  [5, 'sample-05-object-preserving-layout-reframe'],
  [6, 'sample-06-directional-exit-hard-cut-pair'],
  [7, 'sample-07-hook-reel-collage-montage'],
  [8, 'sample-08-speaker-supporting-overlay-entry-corrected'],
  [9, 'sample-09-device-light-focal-motion-corrected'],
]);
const legacyEventDirectory = new Map([[8, 'sample-08-speaker-supporting-overlay-entry'], [9, 'sample-09-device-light-focal-motion']]);
const eventStillSpecs = {
  1: [[157, '01-background-only.png'], [184, '03-building-settled.png'], [232, '06-accumulated-layout.png']],
  2: [[571, '01-numeric-group-hidden.png'], [593, '04-$57.png'], [623, '08-$116.png']],
  3: [[749, '01-empty-fixed-chart-shell.png'], [793, '04-pre-spike-series.png'], [837, '07-complete-series.png']],
  4: [[190, '01-US-map-person-marker.png'], [345, '04-Iran-outline-and-aircraft.png'], [450, '08-route-final.png']],
  5: [[995, '01-chart-and-map-side-by-side.png'], [1003, '02-map-moving-left.png'], [1021, '04-map-centered-chart-exited.png']],
  6: [[711, '01-full-scene-before-exit.png'], [718, '02-scene-group-exiting-left.png'], [726, '03-scene-cleared.png']],
  7: [[0, '01-speaker-opening.png'], [160, '06-gallery-horizontal-scroll.png'], [300, '11-title-final.png']],
  8: [[0, '01-speaker-only.png'], [72, '03-handshake-icon-settled.png'], [211, '05-two-supporting-icons.png']],
  9: [[60, '02-device-dashboard-visible.png'], [90, '03-device-state-change.png'], [120, '04-device-and-brand-icons.png']],
};
const familyBySample = {1: ['assembly-editorial', 'process-route-editorial'], 2: ['time-data-editorial'], 3: ['time-data-editorial'], 4: ['process-route-editorial'], 5: ['law-document-editorial'], 6: ['hook-source-collage'], 7: ['hook-source-collage'], 8: ['assembly-editorial'], 9: ['time-data-editorial']};
const shotsBySample = {1: ['SH003', 'SH047'], 2: ['SH040'], 3: ['SH040'], 4: ['SH047'], 5: ['SH006'], 6: ['SH001', 'SH005'], 7: ['SH001'], 8: ['SH003'], 9: ['SH040']};
const futureOperators = {
  1: [{grammar_id: 'staggered-object-accumulation', runtime_operator_id: 'transform.spring@1', target_scope: 'independent asset targets'}],
  2: [{grammar_id: 'numeric-group-rise-fade-count-up', runtime_operator_id: 'transform.tween@1', target_scope: 'registered numeric group with deterministic content state'}],
  3: [{grammar_id: 'plot-local-progressive-reveal', runtime_operator_id: 'chart.reveal@1', target_scope: 'plot only; shell remains fixed'}],
  4: [{grammar_id: 'map-reframe-local-overlay-lifecycle', runtime_operator_id: 'camera.transform@1 + svg.stroke-draw@1', target_scope: 'registered route board and local overlays'}],
  5: [{grammar_id: 'object-preserving-layout-reframe', runtime_operator_id: 'transform.tween@1', target_scope: 'same source-bound document identity'}],
  6: [{grammar_id: 'directional-scene-exit-left', runtime_operator_id: 'transform.tween@1', target_scope: 'whole scene parent'}, {grammar_id: 'hard-cut', runtime_operator_id: 'hard-cut-zero-blend', target_scope: 'adjacent source/remotion boundary only'}],
  7: [{grammar_id: 'staggered-object-accumulation', runtime_operator_id: 'transform.spring@1', target_scope: 'independent source objects'}, {grammar_id: 'hard-cut', runtime_operator_id: 'hard-cut-zero-blend', target_scope: 'montage boundary'}],
  8: [{grammar_id: 'staggered-object-accumulation', runtime_operator_id: 'transform.spring@1', target_scope: 'non-person side overlays only'}],
  9: [{grammar_id: 'source-surface-state-progression', runtime_operator_id: 'opacity.tween@1', target_scope: 'inside source-bound surface; no presenter reconstruction'}],
};

const transferMatrix = [];
for (let sampleNumber = 1; sampleNumber <= 9; sampleNumber += 1) {
  const directory = sampleDirectories.get(sampleNumber);
  const contractPath = path.join(root, 'video/qa/reference-study/frame-accurate-motion-contract-v02', directory, 'contract.json');
  const contract = await readJson(contractPath);
  const eventDir = legacyEventDirectory.get(sampleNumber) ?? directory;
  const stills = [];
  for (const [sourceFrame, filename] of eventStillSpecs[sampleNumber]) {
    const stillPath = path.join(root, 'video/qa/reference-study/frame-accurate-motion-contract-v01', eventDir, 'events', filename);
    stills.push({path: rel(stillPath), sha256: await shaFile(stillPath), source_frame: sourceFrame, timecode: tc(sourceFrame, contract.source_binding.fps)});
  }
  const grammarIds = [...new Set(grammar.bindings.filter((row) => row.sample_number === sampleNumber).map((row) => row.grammar_id))].sort();
  transferMatrix.push({
    sample_number: sampleNumber,
    sample_id: contract.sample_id,
    contract: {path: rel(contractPath), sha256: await shaFile(contractPath), contract_id: contract.contract_id},
    source_locator: {path: contract.source_binding.path, sha256: contract.source_binding.sha256, fps: contract.source_binding.fps, start_frame: contract.source_binding.window.start_frame, end_frame: contract.source_binding.window.end_frame, start_timecode: tc(contract.source_binding.window.start_frame, contract.source_binding.fps), end_timecode: tc(contract.source_binding.window.end_frame, contract.source_binding.fps)},
    exact_reference_stills: stills,
    approved_grammar_ids: grammarIds,
    family_ids: familyBySample[sampleNumber],
    representative_shots: shotsBySample[sampleNumber].map(shotBinding),
    state_roles: BEATS,
    future_runtime_operator_transfer: futureOperators[sampleNumber].map((row) => ({...row, status: 'planned-not-implemented'})),
    static_state_evidence_only: true,
    motion_parity_claimed: false,
  });
}

await rm(out, {recursive: true, force: true});
await mkdir(path.join(out, 'source-inputs'), {recursive: true});

const sourceInputRoot = path.join(out, 'source-inputs');
const writeSvgPng = async (name, svg) => {
  const file = path.join(sourceInputRoot, name);
  await sharp(Buffer.from(svg)).png({compressionLevel: 9, adaptiveFiltering: false}).toFile(file);
  return rel(file);
};
const cropSource = async (name, source, extract) => {
  const file = path.join(sourceInputRoot, name);
  await sharp(path.join(root, source)).extract(extract).resize(1180, 360, {fit: 'fill'}).png({compressionLevel: 9, adaptiveFiltering: false}).toFile(file);
  return rel(file);
};
const cardSvg = ({title, lines, accent = '#2f7d74', footer}) => `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="620"><rect x="8" y="8" width="1384" height="604" rx="24" fill="#fffdf8" stroke="#d8cdbc" stroke-width="8"/><rect x="44" y="40" width="520" height="76" rx="38" fill="${accent}"/><text x="304" y="92" text-anchor="middle" font-family="Malgun Gothic,Arial,sans-serif" font-weight="700" font-size="44" fill="#fff">${xml(title)}</text>${lines.map((line, index) => `<text x="700" y="${250 + index * 116}" text-anchor="middle" font-family="Malgun Gothic,Arial,sans-serif" font-weight="700" font-size="84" fill="#17212b">${xml(line)}</text>`).join('')}<text x="70" y="570" font-family="Malgun Gothic,Arial,sans-serif" font-size="28" fill="#62594f">${xml(footer)}</text></svg>`;

const sourceNews1 = 'video/source-intake/episode-001/news/news-yna-20260729-title-and-qa.png';
const sourceNews2 = 'video/source-intake/episode-001/news/news-yna-20260804-title-and-effective-date.png';
const news1Crop = await cropSource('news-yna-20260729-headline-crop.png', sourceNews1, {left: 110, top: 205, width: 820, height: 250});
const news2Crop = await cropSource('news-yna-20260804-headline-crop.png', sourceNews2, {left: 110, top: 205, width: 820, height: 250});
const currentLaw = await writeSvgPng('law-current-196-retype.png', cardSvg({title: '시행 전 제196조', lines: ['검사는 범죄의 혐의가 있다고', '사료하는 때에는'], footer: '국가법령정보센터 원문 대조 · 제196조'}));
const deleteLaw = await writeSvgPng('law-delete-196-retype.png', cardSvg({title: '개정문', lines: ['제196조를 삭제한다.'], footer: '법률 제21857호 · 정확 재조판', accent: '#9b3b35'}));
const retainedLaw = await writeSvgPng('law-retained-195-retype.png', cardSvg({title: '새 제195조제2항', lines: ['보완수사요구, 재수사요구 등', '이 법률에서 정하는 직무'], footer: '법률 제21857호 · 원문 중 정확 발췌 재조판'}));
const routePartial = await writeSvgPng('process-route-partial.png', `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="500"><path d="M100 420 C420 420 530 420 790 420" fill="none" stroke="#a33d37" stroke-width="20" stroke-linecap="round"/><circle cx="100" cy="420" r="26" fill="#a33d37"/><circle cx="790" cy="420" r="26" fill="#a33d37"/></svg>`);
const routeFull = await writeSvgPng('process-route-full.png', `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="500"><defs><marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0 0 L12 6 L0 12 z" fill="#a33d37"/></marker></defs><path d="M100 420 C430 420 560 420 800 420 S1180 420 1500 420" fill="none" stroke="#a33d37" stroke-width="20" stroke-linecap="round" marker-end="url(#arrow)"/><circle cx="100" cy="420" r="26" fill="#a33d37"/><circle cx="800" cy="420" r="26" fill="#a33d37"/></svg>`);
const chartShell = await writeSvgPng('time-90day-chart-shell.png', `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="720"><rect x="8" y="8" width="1484" height="704" rx="24" fill="#fffdf8" stroke="#d8cdbc" stroke-width="8"/><text x="80" y="95" font-family="Malgun Gothic,Arial,sans-serif" font-size="54" font-weight="700" fill="#17212b">일부 불가피한 사건의 경과규정 상한</text><line x1="120" y1="560" x2="1380" y2="560" stroke="#978c7e" stroke-width="8"/><g font-family="Arial,sans-serif" font-size="34" fill="#62594f"><text x="110" y="625">0</text><text x="720" y="625">45</text><text x="1320" y="625">90일</text></g><text x="80" y="680" font-family="Malgun Gothic,Arial,sans-serif" font-size="28" fill="#62594f">출처: 법률 제21857호 경과규정 · 최대 90일</text></svg>`);
const plot = async (name, endX, endY, c2x, c2y) => writeSvgPng(name, `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="720"><path d="M120 520 C360 500 ${c2x} ${c2y} ${endX} ${endY}" fill="none" stroke="#d85645" stroke-width="26" stroke-linecap="round"/><circle cx="${endX}" cy="${endY}" r="24" fill="#d85645"/></svg>`);
const plotMid = await plot('time-90day-plot-mid.png', 760, 380, 560, 430);
const plotFull = await plot('time-90day-plot-full.png', 1380, 180, 980, 300);
const numberGroup = async (name, value) => writeSvgPng(name, `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="250"><rect width="520" height="250" rx="32" fill="#17212b"/><text x="260" y="155" text-anchor="middle" font-family="Arial,sans-serif" font-size="128" font-weight="800" fill="#fff">${value}/90</text><text x="260" y="215" text-anchor="middle" font-family="Malgun Gothic,Arial,sans-serif" font-size="30" fill="#f3dfba">진행 상태 · 일</text></svg>`);
const number0 = await numberGroup('time-number-0.png', 0);
const number45 = await numberGroup('time-number-45.png', 45);
const number90 = await numberGroup('time-number-90.png', 90);

const real = (source_kind, source_id, license, extra = {}) => ({origin: 'real-or-official-source', source_kind, source_id, license, rights_status: 'pending-human-review', ai_disclosure: false, ...extra});
const sourceDerived = (source_id, source_path, derivation) => real('source-derived-evidence-view', source_id, 'official-source-rights-review-pending', {source_path, derivation});
const deterministicSourceView = (source_id, source_path, derivation) => real('source-derived-deterministic-data-view', source_id, 'official-source-rights-review-pending', {source_path, derivation, deterministic: true});
const assetDefs = {
  news1: {path: news1Crop, asset_class: 'document', provenance: sourceDerived('NEWS-YNA-20260729', sourceNews1, 'headline/date normalized crop')},
  news2: {path: news2Crop, asset_class: 'document', provenance: sourceDerived('NEWS-YNA-20260804', sourceNews2, 'headline/date normalized crop')},
  current: {path: currentLaw, asset_class: 'document', provenance: sourceDerived('LAW-196', 'raw/sources/episode-001-sh006-viewer-first-law-sources-2026-08-29.md', 'exact two-line deterministic retype')},
  deleted: {path: deleteLaw, asset_class: 'document', provenance: sourceDerived('LAW-REVISION-21857', 'raw/sources/episode-001-sh006-viewer-first-law-sources-2026-08-29.md', 'exact one-line deterministic retype')},
  retained: {path: retainedLaw, asset_class: 'document', provenance: sourceDerived('LAW-REVISION-21857', 'raw/sources/episode-001-sh006-viewer-first-law-sources-2026-08-29.md', 'exact two-line deterministic retype')},
  dossier: {path: 'video/qa/production-assets/episode-001/SH006-real-photo-v01/assets/sh006-dossier-real-photo.png', asset_class: 'document', provenance: sourceDerived('PEXELS-DOSSIER-4792288', 'data/raw/pexels-media/102/photo/pexels-4792288.jpg', 'transparent presentation derivative')},
  police: {path: 'video/qa/production-assets/episode-001/SH006-real-photo-v01/assets/sh006-police-building-real-photo.png', asset_class: 'building', provenance: sourceDerived('WIKIMEDIA-POLICE-3243833', 'data/raw/wikimedia/106/photo/wikimedia-3243833.jpg', 'presentation crop')},
  routePartial: {path: routePartial, asset_class: 'path', provenance: deterministicSourceView('LAW-1972', 'raw/sources/episode-001-sh006-viewer-first-law-sources-2026-08-29.md', 'partial route state from statutory relation')},
  routeFull: {path: routeFull, asset_class: 'path', provenance: deterministicSourceView('LAW-1972', 'raw/sources/episode-001-sh006-viewer-first-law-sources-2026-08-29.md', 'complete route state from statutory relation')},
  chartShell: {path: chartShell, asset_class: 'chart', provenance: deterministicSourceView('LAW-TRANS-APPLICATION', 'video/source-intake/episode-001/official/law-trans-90-day.png', 'fixed 0–90 day source-bound chart shell')},
  plotMid: {path: plotMid, asset_class: 'chart-plot', provenance: deterministicSourceView('LAW-TRANS-APPLICATION', 'video/source-intake/episode-001/official/law-trans-90-day.png', 'intermediate plot-local progress state; not an asserted legal milestone')},
  plotFull: {path: plotFull, asset_class: 'chart-plot', provenance: deterministicSourceView('LAW-TRANS-APPLICATION', 'video/source-intake/episode-001/official/law-trans-90-day.png', 'complete plot-local progress state')},
  number0: {path: number0, asset_class: 'numeric-group', provenance: deterministicSourceView('LAW-TRANS-APPLICATION', 'video/source-intake/episode-001/official/law-trans-90-day.png', 'counter start state')},
  number45: {path: number45, asset_class: 'numeric-group', provenance: deterministicSourceView('LAW-TRANS-APPLICATION', 'video/source-intake/episode-001/official/law-trans-90-day.png', 'intermediate counter state; not an asserted legal milestone')},
  number90: {path: number90, asset_class: 'numeric-group', provenance: deterministicSourceView('LAW-TRANS-APPLICATION', 'video/source-intake/episode-001/official/law-trans-90-day.png', 'source-bound maximum counter state')},
};

const L = (asset_id, key, bbox, {fit = 'contain', layer = 'foreground'} = {}) => ({asset_id, key, bbox, fit, layer});
const supported = [
  {id: 'hook-source-collage', sample_numbers: [6, 7], shots: ['SH001', 'SH001', 'SH005'], frames: [
    {takeaway: '첫 보도 원문이 도입부의 물리적 출처 오브젝트가 된다.', focal: 'report-a', layout: 'single-source-object', layers: [L('report-a', 'news1', {left: 120, top: 240, width: 1420, height: 435})]},
    {takeaway: '독립 출처 오브젝트가 누적되고 전체 그룹이 왼쪽 퇴장을 준비한다.', focal: 'report-b', layout: 'accumulated-source-group-before-exit', layers: [L('report-a', 'news1', {left: 40, top: 250, width: 820, height: 250}, {layer: 'midground'}), L('report-b', 'news2', {left: 980, top: 470, width: 820, height: 250})]},
    {takeaway: '하드컷 뒤 공식 삭제문이 다음 장면의 단일 근거가 된다.', focal: 'deleted-law', layout: 'hard-cut-incoming-evidence', layers: [L('deleted-law', 'deleted', {left: 210, top: 190, width: 1500, height: 664})], hard_cut_from_previous: true, readability: {effective_font_px_1080: 90, line_count: 1}},
  ]},
  {id: 'law-document-editorial', sample_numbers: [5], shots: ['SH006', 'SH006', 'SH006'], frames: [
    {takeaway: '시행 전 제196조의 역할을 한 장의 읽을 수 있는 법률 표면으로 고정한다.', focal: 'current-law', layout: 'source-locked-reading-surface', layers: [L('current-law', 'current', {left: 180, top: 170, width: 1560, height: 691})], readability: {effective_font_px_1080: 93, line_count: 2}},
    {takeaway: '같은 제196조 오브젝트는 왼쪽에 유지·재배치되고 삭제문이 새 focal로 등장한다.', focal: 'deleted-law', layout: 'object-preserving-document-reframe', layers: [L('current-law', 'current', {left: 50, top: 300, width: 700, height: 310}, {layer: 'midground'}), L('deleted-law', 'deleted', {left: 690, top: 160, width: 1180, height: 523})], readability: {effective_font_px_1080: 81, line_count: 1}},
    {takeaway: '삭제된 제196조와 남은 제195조제2항을 같은 증거 세계에서 구분한다.', focal: 'retained-law', layout: 'source-locked-before-after-summary', layers: [L('deleted-law', 'deleted', {left: 40, top: 330, width: 600, height: 266}, {layer: 'midground'}), L('retained-law', 'retained', {left: 590, top: 130, width: 1280, height: 567})], readability: {effective_font_px_1080: 77, line_count: 2}},
  ]},
  {id: 'process-route-editorial', sample_numbers: [1, 4], shots: ['SH047', 'SH047', 'SH047'], frames: [
    {takeaway: '사건파일이 절차 보드의 출발점으로 먼저 고정된다.', focal: 'case-file', layout: 'route-anchor-opening', layers: [L('case-file', 'dossier', {left: 130, top: 155, width: 760, height: 676})]},
    {takeaway: '법률 근거가 focal이 되고 첫 구간만 위치에 결속되어 드러난다.', focal: 'retained-law', layout: 'registered-local-route-change', layers: [L('route-partial', 'routePartial', {left: 100, top: 300, width: 1560, height: 488}, {layer: 'background'}), L('case-file', 'dossier', {left: 90, top: 390, width: 390, height: 347}, {layer: 'midground'}), L('retained-law', 'retained', {left: 540, top: 120, width: 1260, height: 558})], readability: {effective_font_px_1080: 76, line_count: 2}},
    {takeaway: '같은 보드 위에서 경로와 도착 기관이 누적되어 최종 관계가 완성된다.', focal: 'retained-law', layout: 'registered-route-final-summary', layers: [L('route-full', 'routeFull', {left: 100, top: 300, width: 1640, height: 512}, {layer: 'background'}), L('case-file', 'dossier', {left: 30, top: 520, width: 270, height: 240}, {layer: 'midground'}), L('police', 'police', {left: 1600, top: 520, width: 290, height: 235}, {fit: 'cover', layer: 'midground'}), L('retained-law', 'retained', {left: 360, top: 100, width: 1200, height: 531})], readability: {effective_font_px_1080: 72, line_count: 2}},
  ]},
  {id: 'time-data-editorial', sample_numbers: [2, 3, 9], shots: ['SH040', 'SH040', 'SH040'], frames: [
    {takeaway: '90일 상한의 차트 셸과 시작 숫자 그룹을 먼저 고정한다.', focal: 'time-number', layout: 'fixed-chart-shell-counter-start', layers: [L('time-number', 'number0', {left: 700, top: 20, width: 520, height: 250}), L('chart-shell', 'chartShell', {left: 120, top: 260, width: 1680, height: 806}, {layer: 'midground'})], readability: {effective_font_px_1080: 128, line_count: 1}},
    {takeaway: '차트 셸은 그대로 두고 plot 내부와 숫자 그룹만 중간 상태로 바뀐다.', focal: 'time-number', layout: 'plot-local-change-only', layers: [L('time-number', 'number45', {left: 700, top: 20, width: 520, height: 250}), L('chart-shell', 'chartShell', {left: 120, top: 260, width: 1680, height: 806}, {layer: 'midground'}), L('plot-series', 'plotMid', {left: 120, top: 260, width: 1680, height: 806})], readability: {effective_font_px_1080: 128, line_count: 1}},
    {takeaway: 'plot 내부 진행과 숫자 그룹이 90일 상한에서 함께 멈춘다.', focal: 'time-number', layout: 'plot-local-final-state', layers: [L('time-number', 'number90', {left: 700, top: 20, width: 520, height: 250}), L('chart-shell', 'chartShell', {left: 120, top: 260, width: 1680, height: 806}, {layer: 'midground'}), L('plot-series', 'plotFull', {left: 120, top: 260, width: 1680, height: 806})], readability: {effective_font_px_1080: 128, line_count: 1}},
  ]},
];

const blocked = [
  {id: 'assembly-editorial', sample_numbers: [1, 8], shots: ['SH003', 'SH003', 'SH003'], blockers: ['Korean National Assembly chamber source/design layers are not materialized.', 'Official VOD is metadata-only and production-rights-blocked.', 'The U.S. House chamber image is forbidden as a Korean-context substitute.']},
  {id: 'omni-fiction-continuity', sample_numbers: [], shots: ['SH008', 'SH011', 'SH014'], blockers: ['Continuity-locked keyframes for laptop payment → wrong-item reveal → police intake are absent.', 'v04 receipt/household/report plates do not match the episode-spec action chain.', 'Omni remains keyframe-input only; no generated video or Remotion motion claim is allowed.']},
];

const buildFrame = async ({family, frameSpec, index, familyDir}) => {
  const representativeBeat = BEATS[index];
  const frameId = `${family.id}-${representativeBeat}-v05`;
  const inputs = [];
  const layers = [];
  const roles = {background: [], midground: [], foreground: []};
  for (const [zIndex, layer] of frameSpec.layers.entries()) {
    const asset = assetDefs[layer.key];
    const sha256 = await shaFile(path.join(root, asset.path));
    inputs.push({asset_id: layer.asset_id, path: asset.path, sha256, asset_class: asset.asset_class, asset_provenance: asset.provenance, renderer_recipe_sha256: rendererRecord.sha256});
    layers.push({asset_id: layer.asset_id, path: asset.path, sha256, bbox: layer.bbox, fit: layer.fit, z_index: zIndex});
    roles[layer.layer].push(layer.asset_id);
  }
  const inputIds = inputs.map((row) => row.asset_id);
  const previousIds = index === 0 ? [] : family.frames[index - 1].layers.map((row) => row.asset_id);
  const stateDelta = {added_asset_ids: inputIds.filter((id) => !previousIds.includes(id)), removed_asset_ids: previousIds.filter((id) => !inputIds.includes(id)), preserved_asset_ids: inputIds.filter((id) => previousIds.includes(id)), content_state_changed_asset_ids: []};
  if (family.id === 'time-data-editorial' && index > 0) stateDelta.content_state_changed_asset_ids = ['time-number', 'plot-series'];
  if (family.id === 'hook-source-collage' && index === 2) stateDelta.transition_state = 'hard-cut-incoming-first-frame-static-evidence';
  const frame = {
    frame_id: frameId,
    representative_beat: representativeBeat,
    representative_shot: shotBinding(family.shots[index]),
    viewer_takeaway: frameSpec.takeaway,
    dominant_focal_asset_id: frameSpec.focal,
    dominant_focal_kind: 'visual-input-asset',
    asset_text_substitution: false,
    inputs,
    declared_visible_components: inputIds,
    state_delta_from_previous: stateDelta,
    static_state_evidence_only: true,
    motion_parity_claimed: false,
    planned_runtime_operator_refs: family.sample_numbers.flatMap((sampleNumber) => futureOperators[sampleNumber]).map((row) => ({...row, status: 'planned-not-implemented'})),
    geometry: {assets: layers.map((row) => ({id: row.asset_id, bbox: row.bbox, surface_rotation_deg: 0, baseline_group: `${frameId}-${row.asset_id}`})), texts: [], connectors: [], intentional_overlaps: []},
    layer_roles: roles,
    hidden_asset_ids: [],
    supporting_asset_ids: inputIds.filter((id) => id !== frameSpec.focal),
    layout_template: frameSpec.layout,
    source_locked_readability: frameSpec.readability ? {...frameSpec.readability, mobile_effective_font_px: Math.round(frameSpec.readability.effective_font_px_1080 * 360 / 1920 * 10) / 10, role: 'surface-content', placement: 'on-surface'} : null,
    required_review_dimensions: {wide: '1920x1080', mobile: '360x203'},
    render_recipe: {recipe_id: RENDERER_RECIPE_ID, renderer_sha256: rendererRecord.sha256, canvas: {width: 1920, height: 1080}, layers},
    layout_contract_version: 2,
    typography_surface_contract_version: 2,
  };
  const outputDir = path.join(familyDir, 'outputs');
  const widePath = path.join(outputDir, `${frameId}-1920x1080.png`);
  const mobilePath = path.join(outputDir, `${frameId}-360x203.png`);
  const rendered = await renderStyleFrameBuffers({root, frame});
  await writeFile(widePath, rendered.wide);
  await writeFile(mobilePath, rendered.mobile);
  return {...frame, output: rel(widePath), output_sha256: await shaFile(widePath), mobile: rel(mobilePath), mobile_sha256: await shaFile(mobilePath), dimensions: {width: 1920, height: 1080}};
};

const indexRows = [];
for (const family of supported) {
  const familyDir = path.join(out, `${family.id}-v05`);
  await mkdir(path.join(familyDir, 'outputs'), {recursive: true});
  const frames = [];
  const familyForDelta = {...family, frames: family.frames};
  for (let index = 0; index < family.frames.length; index += 1) frames.push(await buildFrame({family: familyForDelta, frameSpec: family.frames[index], index, familyDir}));
  const inputRows = [...new Map(frames.flatMap((frame) => frame.inputs.map((input) => [`${input.path}|${input.sha256}`, {kind: 'visual-input', path: input.path, sha256: input.sha256}])).map(([key, value]) => [key, value])).values()];
  inputRows.push({kind: 'renderer-recipe', path: rendererRecord.path, sha256: rendererRecord.sha256});
  inputRows.sort((a, b) => `${a.kind}|${a.path}`.localeCompare(`${b.kind}|${b.path}`));
  const contactPath = path.join(familyDir, 'outputs', `${family.id}-v05-contact-1920x520.png`);
  await writeFile(contactPath, await renderContactBuffer({root, familyId: family.id, frames}));
  const sampleRows = transferMatrix.filter((row) => family.sample_numbers.includes(row.sample_number));
  const manifest = {
    schema_version: 5,
    episode_id: 'episode-001',
    family_id: family.id,
    candidate_id: `${family.id}-v05`,
    status: 'candidate-built-blocked-until-all-six-families-ready',
    eligible_for_user_style_frame_review: false,
    production_visible: false,
    production_authority: false,
    user_style_frame_pass: false,
    user_cut_pass: false,
    rights_approved: false,
    omni_video_approved: false,
    stage_advanced: false,
    review_profile: 'source-photo-treatment',
    representative_beats: BEATS,
    representative_shots: family.shots.map(shotBinding),
    episode_spec_binding: specRecord,
    reference_grammar_contract: grammarRecord,
    transfer_matrix_rows: sampleRows,
    transfer_matrix_sample_numbers: family.sample_numbers,
    exact_input_bundle: {rows: inputRows, sha256: digest(Buffer.from(inputRows.map((row) => `${row.kind}|${row.path}|${row.sha256}`).join('\n')))},
    typography_surface_contract_version: 2,
    layout_contract_version: 2,
    frames,
    contact: {path: rel(contactPath), sha256: await shaFile(contactPath), dimensions: {width: CONTACT_WIDTH, height: CONTACT_HEIGHT}, visible_labels: {family_id: family.id, states: BEATS}},
    reference_parity: {static_only: true, motion_proof: false, playable_parity: false, status: 'blocked-pre-style-pass'},
    v04_history: oldIndexRecord,
    prohibited_substitutes: ['full-page-source-capture-as-readable-focal', 'unrelated-context-source', 'self-referential-frame-id-as-reference-locator', 'static-frame-as-motion-proof'],
  };
  const manifestPath = path.join(familyDir, 'manifest.json');
  await writeJson(manifestPath, manifest);
  await writeFile(path.join(familyDir, 'README.md'), `# ${family.id} v05\n\nTransfer-matrix-bound static state candidate. Built, but not independently reviewable until every required family input is complete. No motion, cut, rights, Omni-video, or production PASS.\n`, 'utf8');
  indexRows.push({family_id: family.id, status: manifest.status, review_profile: manifest.review_profile, path: rel(manifestPath), sha256: await shaFile(manifestPath), contact: manifest.contact, representative_shot_ids: family.shots, sample_numbers: family.sample_numbers, blocker_ids: []});
}

for (const family of blocked) {
  const familyDir = path.join(out, `${family.id}-v05`);
  await mkdir(path.join(familyDir, 'outputs'), {recursive: true});
  const contactPath = path.join(familyDir, 'outputs', `${family.id}-v05-blocked-contact-1920x520.png`);
  await writeFile(contactPath, await renderBlockedContactBuffer({familyId: family.id, blockers: family.blockers}));
  const manifest = {
    schema_version: 5, episode_id: 'episode-001', family_id: family.id, candidate_id: `${family.id}-v05`, status: 'blocked-missing-required-source-inputs', eligible_for_user_style_frame_review: false, production_visible: false, production_authority: false, user_style_frame_pass: false, user_cut_pass: false, rights_approved: false, omni_video_approved: false, stage_advanced: false,
    review_profile: family.id === 'omni-fiction-continuity' ? 'omni-keyframe-input' : 'source-photo-treatment', representative_beats: BEATS, representative_shots: family.shots.map(shotBinding), episode_spec_binding: specRecord, reference_grammar_contract: grammarRecord, transfer_matrix_rows: transferMatrix.filter((row) => family.sample_numbers.includes(row.sample_number)), transfer_matrix_sample_numbers: family.sample_numbers, typography_surface_contract_version: 2, layout_contract_version: 2, frames: [], exact_input_bundle: {rows: [], sha256: digest(Buffer.from(''))}, blockers: family.blockers.map((reason, index) => ({blocker_id: `${family.id}-B${index + 1}`, reason, required_evidence: family.id === 'assembly-editorial' ? ['local Korean National Assembly chamber/design asset', 'source/rights/provenance record', 'exact input SHA-256'] : ['three continuity-locked ImageGen PNG keyframes', 'same fictional identity/place/prop continuity record', 'SH008/SH011/SH014 episode-spec binding']})), contact: {path: rel(contactPath), sha256: await shaFile(contactPath), dimensions: {width: CONTACT_WIDTH, height: CONTACT_HEIGHT}, visible_labels: {family_id: family.id, states: ['BLOCKED — NOT A REVIEW SURFACE']}}, reference_parity: {static_only: true, motion_proof: false, playable_parity: false, status: 'blocked-pre-style-pass'}, v04_history: oldIndexRecord,
  };
  const manifestPath = path.join(familyDir, 'manifest.json');
  await writeJson(manifestPath, manifest);
  await writeFile(path.join(familyDir, 'README.md'), `# ${family.id} v05\n\nBlocked. This directory intentionally contains no style frames because required, context-correct inputs are unavailable. The contact is a blocker notice, not a review surface.\n`, 'utf8');
  indexRows.push({family_id: family.id, status: manifest.status, review_profile: manifest.review_profile, path: rel(manifestPath), sha256: await shaFile(manifestPath), contact: manifest.contact, representative_shot_ids: family.shots, sample_numbers: family.sample_numbers, blocker_ids: manifest.blockers.map((row) => row.blocker_id)});
}

indexRows.sort((a, b) => FAMILY_IDS.indexOf(a.family_id) - FAMILY_IDS.indexOf(b.family_id));
const boardPath = path.join(out, 'EP001-transfer-bound-six-family-review-board-v05.png');
await writeFile(boardPath, await renderBoardBuffer({root, rows: indexRows}));
const index = {
  schema_version: 5,
  episode_id: 'episode-001',
  candidate_set_id: 'episode-001-transfer-bound-six-family-v05',
  status: 'blocked-pending-required-source-inputs',
  eligible_for_user_style_frame_review: false,
  user_approved: false,
  production_visible: false,
  production_authority: false,
  episode_spec_binding: specRecord,
  reference_grammar_contract: grammarRecord,
  reference_grammar_approval_marker: grammar.approval_marker,
  reference_calibration_approval_marker: grammar.calibration_approval_marker,
  renderer_recipe: rendererRecord,
  v04_history: oldIndexRecord,
  transfer_matrix: transferMatrix,
  sample_coverage: {required: [1, 2, 3, 4, 5, 6, 7, 8, 9], excluded: [10], mapped: [...new Set(transferMatrix.map((row) => row.sample_number))].sort((a, b) => a - b)},
  family_count: 6,
  built_family_count: 4,
  blocked_family_count: 2,
  families: indexRows,
  review_board: {path: rel(boardPath), sha256: await shaFile(boardPath), dimensions: {width: 1920, height: 110 + indexRows.length * 548}, visible_labels: {candidate_set_id: 'episode-001-transfer-bound-six-family-v05', family_ids: FAMILY_IDS, states: BEATS, blocked_label: 'BLOCKED — NOT A REVIEW SURFACE'}},
  blockers: blocked.flatMap((family) => family.blockers.map((reason) => ({family_id: family.id, reason}))),
  sample10_policy: {sample_number: 10, review_profile: 'source-video-selection', active_motion_bindings: 0, excluded_from_style_motion_transfer: true},
  static_to_playable_parity: {status: 'blocked-pre-style-pass', pass: false, parity_record: null},
  full_motion_expansion_allowed: false,
  active_cut_root: null,
};
const indexPath = path.join(out, 'family-index.json');
await writeJson(indexPath, index);

const gates = await readJson(gatesPath);
gates.status = 'blocked-pending-required-source-inputs';
Object.assign(gates.reference_calibration, {eligible_for_user_style_frame_review: false, blockers: ['assembly-editorial requires a Korean National Assembly chamber source or approved source-bound design layers', 'omni-fiction-continuity requires continuity-locked SH008/SH011/SH014 keyframes'], next_gate: 'complete-v05-required-source-inputs'});
for (const family of gates.visual_families) {
  const row = indexRows.find((item) => item.family_id === family.family_id);
  Object.assign(family, {status: row.status, representative_shot_ids: row.representative_shot_ids, candidate_manifest: row.path, candidate_manifest_sha256: row.sha256, contact: row.contact.path, contact_sha256: row.contact.sha256, user_approved: false, approval_marker: null, approved_inputs_sha256: null, approval_marker_sha256: null, review_ready: false, inputs_complete: row.status === 'candidate-built-blocked-until-all-six-families-ready', blockers: row.blocker_ids});
}
await writeJson(gatesPath, gates);
await run('video/scripts/build-episode-001-reference-blueprint.mjs');

const state = await readJson(statePath);
state.reference_calibration = {...gates.reference_calibration, note: 'Corrected samples 01–09 and the derived grammar remain approved. The v05 transfer matrix is complete, but Korean assembly context and continuity-locked Omni inputs are missing, so style review remains blocked.'};
state.style_frame_review = {status: 'blocked-pending-required-source-inputs', candidate_id: index.candidate_set_id, representative_beats: BEATS, manifest: rel(indexPath), manifest_sha256: await shaFile(indexPath), user_approved: false, approval_marker: null, approval_marker_sha256: null, approved_inputs_sha256: null, production_asset_decomposition_status: 'blocked-pending-current-style-frame-pass', blockers: index.blockers, note: 'Four legitimate static families are built; assembly and Omni rows are blocker notices, not review surfaces. Human style review cannot start until all six are valid.'};
Object.assign(state.reference_style_gates, {status: 'blocked-pending-required-source-inputs', contract: rel(gatesPath), contract_sha256: await shaFile(gatesPath), candidate_index: rel(indexPath), candidate_index_sha256: await shaFile(indexPath), cut_blueprint: rel(blueprintPath), cut_blueprint_sha256: await shaFile(blueprintPath), approved_family_ids: [], pending_family_ids: FAMILY_IDS, blocked_family_ids: blocked.map((row) => row.id), all_family_style_pass_required_before_full_motion_expansion: true, note: 'v05 is the sole current candidate index. Two families remain fail-closed for missing context-correct inputs.'});
for (const section of ['generation_input_review', 'playable_cut_review', 'provisional_video', 'visual_review', 'final_script', 'final_voice', 'picture_lock']) state[section].status = 'blocked-pending-required-source-inputs';
state.provisional_artifacts['video/qa/style-frames/episode-001/reference-style-families-v04'] = 'historical-human-review-failed';
state.stage = 'timing-draft';
state.active_cut_root = null;
await writeJson(statePath, state);

process.stdout.write(`${JSON.stringify({index: rel(indexPath), index_sha256: await shaFile(indexPath), board: index.review_board, built_families: 4, blocked_families: blocked.map((row) => row.id), transfer_samples: 9}, null, 2)}\n`);
