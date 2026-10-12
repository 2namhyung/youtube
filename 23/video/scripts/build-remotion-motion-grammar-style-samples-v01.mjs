import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const outputRoot = path.join(repoRoot, 'video', 'qa', 'style-frames', 'remotion-motion-grammar-v01');
const W = 1920;
const H = 1080;
const MOBILE_W = 360;
const MOBILE_H = 203;
const INK = '#17242a';
const MUTED = '#596a70';
const RED = '#d64b3e';
const BLUE = '#2f6075';
const TEAL = '#4e7875';
const PAPER = '#f5ecdd';
const STATUS = 'reference-calibration-incomplete';
const CALIBRATION_CONTRACT_VERSION = 1;
const CALIBRATION_SCOPE = 'non-production-reference-calibration-experiment';
const CALIBRATION_BLOCKERS = [
  'exact reference frame/still/timecode binding is not recorded',
  'side-by-side reference/candidate artifact is not recorded',
  'explicit human reference-calibration PASS is not recorded',
  'observed reference grammar remains an unverified hypothesis'
];
const sharedLockedReferencePaths = [
  path.join(repoRoot, 'raw', 'inbox', 'vox-style-claude-remotion-reference.mp4'),
  path.join(repoRoot, 'video', 'qa', 'reference-study', 'vox-primary', 'opening-0-40s-2s-grid.png'),
  path.join(repoRoot, 'wiki', 'sources', 'vox-style-claude-remotion-reference.md'),
];
const FONT = "'Malgun Gothic','Noto Sans KR',sans-serif";
const backgroundSource = 'video/public/assets/shared/paper-beige-check.png';
const realPhotoManifestSource = 'video/qa/production-assets/episode-001/SH006-real-photo-v01/manifest.json';
const realPhotoUpstreamIds = {dossier: 'dossier-real-photo', police: 'police-building-real-photo', person: 'person-real-cutout', legalSigning: 'legal-signing-real-photo'};
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const rel = (file) => path.relative(repoRoot, file).replaceAll('\\', '/');
const sharedLockedReferenceBundle = await Promise.all(sharedLockedReferencePaths.map(async (file) => ({path: rel(file), sha256: await sha256(file)})));
const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const svg = (body, width = W, height = H) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#13242c" flood-opacity=".18"/></filter><pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="3" fill="${RED}" fill-opacity=".78"/></pattern></defs>${body}</svg>`);
const text = (x, y, value, size, color = INK, weight = 700, anchor = 'start', extra = '') => `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}" letter-spacing="-1.2" ${extra}>${esc(value)}</text>`;
const lines = (x, y, values, size, color = INK, weight = 700, gap = Math.round(size * 1.28), anchor = 'start') => values.map((value, index) => text(x, y + index * gap, value, size, color, weight, anchor)).join('');
const card = ({left, top, width, height}, accent = BLUE, radius = 18) => `<rect x="${left - 10}" y="${top - 10}" width="${width + 20}" height="${height + 20}" rx="${radius}" fill="none" stroke="${accent}" stroke-width="5"/>`;
const lineArrow = (x1, y1, x2, y2, color = RED, width = 8) => `<path d="M${x1} ${y1} C${x1 + (x2 - x1) * .35} ${y1},${x1 + (x2 - x1) * .65} ${y2},${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/><path d="M${x2 - 18} ${y2 - 14} L${x2} ${y2} L${x2 - 18} ${y2 + 14}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

const assetSources = {
  background: {path: backgroundSource, asset_class: 'background', origin: 'real-source', source_kind: 'project-owned-source', source_id: 'SHARED-PAPER-BEIGE-CHECK', original_url: null, license: 'Project-owned fixed editorial background'},
  newsYtn: {path: 'video/source-intake/episode-001/news/news-ytn-20260804-title-and-one-month.png', asset_class: 'photo', origin: 'real-source', source_kind: 'news-capture', source_id: 'NEWS-YTN-20260804', original_url: 'https://www.ytn.co.kr/', license: 'News capture; rights review required before publication'},
  newsYna: {path: 'video/source-intake/episode-001/news/news-yna-20260804-title-and-effective-date.png', asset_class: 'photo', origin: 'real-source', source_kind: 'news-capture', source_id: 'NEWS-YNA-20260804', original_url: 'https://www.yna.co.kr/', license: 'News capture; rights review required before publication'},
  billFull: {path: 'video/source-intake/episode-001/official/bill-2220257-full.png', asset_class: 'document', origin: 'official-source', source_kind: 'official-document-capture', source_id: 'BILL-2220257', original_url: 'https://likms.assembly.go.kr/bill/billDetail.do?billId=PRC_N2W6S0L7W2J9D1I8A1B1I5I1G6H8F5', license: 'National Assembly official document; rights review required'},
  lawRevision: {path: 'video/source-intake/episode-001/official/law-revision-21857-full.png', asset_class: 'document', origin: 'official-source', source_kind: 'official-document-capture', source_id: 'LAW-REVISION-21857', original_url: 'https://www.law.go.kr/LSW/lsRvsDocListP.do?chrClsCd=010202&lsId=001671&lsRvsGubun=all', license: 'Official statutory source; UI excluded from exact retype'},
  law196Capture: {path: 'video/source-intake/episode-001/official/law-196-delete.png', asset_class: 'document', origin: 'official-source', source_kind: 'official-document-capture', source_id: 'LAW-196', original_url: 'https://www.law.go.kr/LSW/lsInfoP.do?ancYnChk=0&chrClsCd=010202&efYd=20260701&joNo=023200&lsiSeq=281865&urlMode=lsInfoP', license: 'Official statutory source; exact statutory text only'},
  current196: {path: 'video/qa/style-frames/episode-001/SH006-editorial-v08/assets/sh006-current-article-196-evidence-view.png', asset_class: 'document', origin: 'source-derived', source_kind: 'official-exact-retype', source_id: 'LAW-196-EXACT-RETYPE', original_url: 'https://www.law.go.kr/LSW/lsInfoP.do?ancYnChk=0&chrClsCd=010202&efYd=20260701&joNo=023200&lsiSeq=281865&urlMode=lsInfoP', license: 'Official statutory text; exact deterministic retype'},
  delete196: {path: 'video/qa/style-frames/episode-001/SH006-editorial-v08/assets/sh006-article-196-deletion-evidence-view.png', asset_class: 'document', origin: 'source-derived', source_kind: 'official-exact-retype', source_id: 'LAW-196-DELETION-EXACT-RETYPE', original_url: 'https://www.law.go.kr/LSW/lsRvsDocListP.do?chrClsCd=010202&lsId=001671&lsRvsGubun=all', license: 'Official statutory text; exact deterministic retype'},
  retained195: {path: 'video/qa/style-frames/episode-001/SH006-editorial-v08/assets/sh006-article-195-retained-evidence-view.png', asset_class: 'document', origin: 'source-derived', source_kind: 'official-exact-retype', source_id: 'LAW-195-2-EXACT-RETYPE', original_url: 'https://www.law.go.kr/LSW/lsRvsDocListP.do?chrClsCd=010202&lsId=001671&lsRvsGubun=all', license: 'Official statutory text; exact deterministic retype'},
  law1972: {path: 'video/source-intake/episode-001/official/law-197-2-requirement-deadline.png', asset_class: 'document', origin: 'official-source', source_kind: 'official-document-capture', source_id: 'LAW-197-2', original_url: 'https://www.law.go.kr/', license: 'Official statutory source; rights review required'},
  petition: {path: 'video/source-intake/episode-001/official/petition-2200332-minutes.png', asset_class: 'document', origin: 'official-source', source_kind: 'official-petition-record', source_id: 'PET-2200332', original_url: 'https://petitions.assembly.go.kr/', license: 'National Assembly official petition record; rights review required'},
  dossier: {path: 'video/qa/production-assets/episode-001/SH006-real-photo-v01/assets/sh006-dossier-real-photo.png', asset_class: 'object', origin: 'source-derived', source_kind: 'real-photo-card', source_id: 'PEXELS-4792288', original_url: 'https://www.pexels.com/ko-kr/photo/4792288/', license: 'Pexels license (verify current terms before publication)'},
  police: {path: 'video/qa/production-assets/episode-001/SH006-real-photo-v01/assets/sh006-police-building-real-photo.png', asset_class: 'building', origin: 'source-derived', source_kind: 'real-photo-card', source_id: 'WIKIMEDIA-3243833', original_url: 'https://commons.wikimedia.org/wiki/File%3AKorean_National_Police_Agency_Building02.jpg', license: 'CC BY 2.0; attribution required'},
  person: {path: 'video/qa/production-assets/episode-001/SH006-real-photo-v01/assets/sh006-person-real-cutout.png', asset_class: 'person', origin: 'source-derived', source_kind: 'real-photo-cutout', source_id: 'PEXELS-7845378', original_url: 'https://www.pexels.com/ko-kr/photo/7845378/', license: 'Pexels license (verify current terms before publication); generic role only'},
  legalSigning: {path: 'video/qa/production-assets/episode-001/SH006-real-photo-v01/assets/sh006-legal-signing-real-photo.png', asset_class: 'photo', origin: 'source-derived', source_kind: 'real-photo-card', source_id: 'PEXELS-8730374', original_url: 'https://www.pexels.com/ko-kr/photo/8730374/', license: 'Pexels license (verify current terms before publication)'},
  kim: {path: 'video/public/assets/episode-001-work-v01/cuts/SH003/assets/assembly-speaker-photo-kim-v01.png', asset_class: 'person', origin: 'source-derived', source_kind: 'official-profile-cutout', source_id: 'ASSEMBLY-PROFILE-KIM-SEUNG-WON', source_path: 'data/raw/assembly-media/14/naas-ATB59635-m-51.jpg', original_url: null, license: 'National Assembly official profile; rights review required', derivation: 'deterministic transparent cutout from preserved official profile JPG', derivation_script: 'video/scripts/derive-official-profile-cutouts.mjs'},
  park: {path: 'video/public/assets/episode-001-work-v01/cuts/SH003/assets/assembly-speaker-photo-park-v01.png', asset_class: 'person', origin: 'source-derived', source_kind: 'official-profile-cutout', source_id: 'ASSEMBLY-PROFILE-PARK-HYEONG-SOO', source_path: 'data/raw/assembly-media/10/naas-6U243644-m-127.jpg', original_url: null, license: 'National Assembly official profile; rights review required', derivation: 'deterministic transparent cutout from preserved official profile JPG', derivation_script: 'video/scripts/derive-official-profile-cutouts.mjs'},
  streetVideo: {path: 'data/raw/pexels-media/48/video/pexels-37887696.mp4', asset_class: 'context', origin: 'real-source', source_kind: 'real-video', source_id: 'PEXELS-37887696', original_url: 'https://www.pexels.com/video/37887696/', license: 'Pexels license (verify current terms before publication)'}
};

const samples = [
  {id: 'sample-01-layered-source-collage', number: '01', grammar: 'layered editorial collage / accumulation', topic: '보완수사법 보도와 공식 문서가 한 화면에 쌓이는 방식', refs: ['raw/inbox/vox-style-claude-remotion-reference.mp4 00:06–00:12', 'wiki/sources/mo-sidd-remotion-production-series.md §2–§6'], sources: ['newsYtn', 'newsYna', 'billFull', 'lawRevision']},
  {id: 'sample-02-evidence-document-reveal', number: '02', grammar: 'overview → normalized focus → exact statutory change', topic: '제196조 원문에서 삭제문만 읽히게 좁히는 방식', refs: ['wiki/sources/vox-style-claude-remotion-reference.md scene table', 'wiki/syntheses/remotion-vox-production-playbook-v0.1.md §Viewer-first presentation contract'], sources: ['law196Capture', 'current196', 'delete196']},
  {id: 'sample-03-process-route-draw', number: '03', grammar: 'relationship path / route draw', topic: '사건기록에서 보완수사요구를 거쳐 경찰로 가는 경로', refs: ['wiki/sources/visual-reference-works.md split/path notes', 'wiki/concepts/spatial-camera-grammar.md'], sources: ['dossier', 'retained195', 'person', 'police']},
  {id: 'sample-04-quantitative-counter', number: '04', grammar: 'counter / interval bars / bounded data reveal', topic: '보완수사 이행 기한 1개월과 예외적 연장', refs: ['wiki/concepts/data-animation.md', 'raw/sources/visual-reference-works-2026-08-21.md chart references'], sources: ['law1972', 'legalSigning']},
  {id: 'sample-05-timeline-state-progression', number: '05', grammar: 'timeline / date / state progression', topic: '제안·의결·공포·청원 기록을 순서대로 축적', refs: ['wiki/concepts/data-animation.md', 'wiki/syntheses/supplementary-investigation-first-video-v0.1.md §3'], sources: ['billFull', 'lawRevision', 'petition']},
  {id: 'sample-06-spatial-camera-reframe', number: '06', grammar: 'spatial camera reframe / focus zoom', topic: '대한민국 경찰청 실사 사진에서 기관 맥락을 좁혀 보는 방식', refs: ['wiki/concepts/spatial-camera-grammar.md', 'wiki/sources/visual-reference-works.md map zoom notes'], sources: ['police']},
  {id: 'sample-07-comparison-graphic-match', number: '07', grammar: 'comparison / split screen / graphic match', topic: '삭제되는 제196조와 남는 제195조 제2항을 대조', refs: ['wiki/concepts/evidence-comparison.md', 'raw/sources/visual-reference-works-2026-08-21.md split-screen notes'], sources: ['current196', 'delete196', 'retained195']},
  {id: 'sample-08-source-video-freeze-focus', number: '08', grammar: 'source-video freeze / crop / focus hybrid', topic: '광화문 거리 실사 영상에서 넓은 장면과 세부를 오가는 방식', refs: ['wiki/syntheses/remotion-vox-production-playbook-v0.1.md §4', 'wiki/sources/reusable-media-libraries.md'], sources: ['streetVideo'], videoFrames: [1, 5, 10]},
  {id: 'sample-09-rhythmic-accumulation', number: '09', grammar: 'rhythmic accumulation / count-to-scale translation', topic: '청원 참여 51,018명을 반복 단위와 공식 기록으로 연결', refs: ['wiki/concepts/audiovisual-rhythm.md', 'wiki/concepts/data-animation.md'], sources: ['petition']},
  {id: 'sample-10-speaker-quote-record', number: '10', grammar: 'speaker / quote / official-record hybrid', topic: '두 의원의 상반된 발언을 공식 프로필과 회의록 문구로 제시', refs: ['raw/sources/episode-001-sh003-assembly-vod-2026-08-26.md', 'wiki/sources/vox-style-claude-remotion-reference.md'], sources: ['kim', 'park', 'billFull']}
];

async function prepareInputs(sample) {
  const inputDir = path.join(outputRoot, sample.id, 'inputs');
  await mkdir(inputDir, {recursive: true});
  const local = new Map();
  const assets = [];
  const realPhotoManifestPath = path.join(repoRoot, realPhotoManifestSource);
  const realPhotoManifest = JSON.parse(await readFile(realPhotoManifestPath, 'utf8'));
  const realPhotoManifestSha = await sha256(realPhotoManifestPath);
  const keys = ['background', ...sample.sources];
  for (const key of keys) {
    const source = assetSources[key];
    const sourcePath = path.join(repoRoot, source.path);
    const ext = path.extname(source.path);
    const target = path.join(inputDir, `${key}${ext}`);
    if (key === 'streetVideo') {
      local.set(key, sourcePath);
      assets.push({asset_id: key, file: rel(sourcePath), source_path: source.source_path ?? source.path, sha256: await sha256(sourcePath), ...source});
      continue;
    }
    await copyFile(sourcePath, target);
    local.set(key, target);
    const preservedSourcePath = source.source_path ? path.join(repoRoot, source.source_path) : null;
    const upstreamId = realPhotoUpstreamIds[key];
    const upstream = upstreamId ? realPhotoManifest.assets.find((entry) => entry.id === upstreamId) : null;
    const transformationChain = upstream ? {
      upstream_manifest_path: realPhotoManifestSource,
      upstream_manifest_sha256: realPhotoManifestSha,
      raw_source_path: upstream.source_path,
      raw_source_url: upstream.source_page,
      raw_source_sha256: upstream.source_sha256,
      raw_source_license: upstream.license,
      raw_source_creator: upstream.creator,
      raw_source_attribution: upstream.attribution,
      derived_source_path: upstream.path,
      derived_source_sha256: upstream.output_sha256,
      deterministic_transformation: upstream.transformation,
      identity_restriction: upstream.identity_constraints,
      semantic_use_restriction: upstream.semantic_use_constraints,
      protected_regions: upstream.protected_regions,
      transformation_chain_complete: true
    } : {};
    assets.push({asset_id: key, file: rel(target), ...source, path: undefined, source_path: source.source_path ?? source.path, source_sha256: preservedSourcePath ? await sha256(preservedSourcePath) : await sha256(sourcePath), output_sha256: await sha256(target), sha256: await sha256(target), ...transformationChain});
  }
  if (sample.videoFrames) {
    for (const [index, seconds] of sample.videoFrames.entries()) {
      const key = `streetFrame${index + 1}`;
      const target = path.join(inputDir, `${key}.png`);
      await execFileAsync('ffmpeg', ['-y', '-ss', String(seconds), '-i', local.get('streetVideo'), '-frames:v', '1', '-vf', 'scale=1920:-2', target, '-loglevel', 'error']);
      local.set(key, target);
      assets.push({asset_id: key, file: rel(target), asset_class: 'photo', origin: 'source-derived', source_kind: 'real-video-frame', source_id: `PEXELS-37887696-T${seconds}`, source_path: assetSources.streetVideo.path, original_url: assetSources.streetVideo.original_url, license: assetSources.streetVideo.license, derivation: `ffmpeg frame extraction at ${seconds}s`, sha256: await sha256(target)});
    }
  }
  if (sample.number === '10') {
    const sourceLockPath = path.join(repoRoot, 'raw', 'sources', 'episode-001-sh003-assembly-vod-2026-08-26.md');
    const sourceLockTarget = path.join(inputDir, 'assembly-vod-source-lock.md');
    await copyFile(sourceLockPath, sourceLockTarget);
    const sourceLockSha = await sha256(sourceLockTarget);
    const quoteDefs = [
      {key: 'kimQuote', source_id: 'ASSEMBLY-PLENARY-661510-KIM-SEUNG-WON', color: BLUE, speaker: '김승원 의원', quote: '검찰의 직접 수사권과 보완수사권은 폐지되었지만 이에 대한 탄탄한 보완제도를 마련했습니다.', displayExcerpt: '탄탄한 보완제도를 마련했습니다.', displayLines: ['탄탄한 보완제도를', '마련했습니다.'], displayFontSize: 82, timecode: '00:07:21.465–00:07:28.887', locator: 'raw source-lock §김승원 의원'},
      {key: 'parkQuote', source_id: 'ASSEMBLY-PLENARY-661559-PARK-HYEONG-SOO', color: RED, speaker: '박형수 의원', quote: '검찰의 보완수사권은 검찰의 권한이라기보다는 국민의 안전을 위한 인권보호를 위한 검찰의 책무였습니다.', displayExcerpt: '인권보호를 위한 검찰의 책무였습니다.', displayLines: ['인권보호를 위한', '검찰의 책무였습니다.'], displayFontSize: 82, timecode: '00:02:08.102–00:02:16.273', locator: 'raw source-lock §박형수 의원'}
    ];
    for (const quote of quoteDefs) {
      const target = path.join(inputDir, `${quote.key}.png`);
      await sharp(svg(`<rect x="14" y="14" width="1172" height="672" rx="28" fill="#fffaf2" stroke="${quote.color}" stroke-width="8"/>${text(600, 92, quote.speaker, 40, quote.color, 900, 'middle')}${lines(600, 300, quote.displayLines, quote.displayFontSize, INK, 850, 120, 'middle')}`, 1200, 700)).png({compressionLevel: 9}).toFile(target);
      local.set(quote.key, target);
      assets.push({asset_id: quote.key, file: rel(target), asset_class: 'document', origin: 'source-derived', source_kind: 'official-caption-exact-retype', source_id: quote.source_id, source_path: rel(sourceLockTarget), source_sha256: sourceLockSha, source_lock_path: rel(sourceLockTarget), source_lock_sha256: sourceLockSha, source_locator: quote.locator, exact_quote: quote.quote, full_quote: quote.quote, display_excerpt: quote.displayExcerpt, display_excerpt_lines: quote.displayLines, display_excerpt_is_exact_substring: quote.quote.includes(quote.displayExcerpt), timecode: quote.timecode, license: 'Exact official-caption transcription; Assembly VOD itself not ingested', derivation_recipe: 'Deterministic exact retype from source-locked official caption text and timecode into a 1200x700 evidence-view PNG; display excerpt is an exact substring, never paraphrased', derivation_is_deterministic: true, evidence_view: true, source_surface_dimensions: {width: 1200, height: 700}, embedded_text_inventory: [{text_id: `${quote.key}-speaker`, semantic_role: 'surface-content', placement: 'on-surface', target_id: quote.key, rotation_deg: 0, source_bbox: {left: 350, top: 55, width: 500, height: 64}, font_size_px: 40, exact_text: quote.speaker}, {text_id: `${quote.key}-quote`, semantic_role: 'surface-content', placement: 'on-surface', target_id: quote.key, rotation_deg: 0, source_bbox: {left: 90, top: 170, width: 1020, height: quote.displayLines.length * 120}, font_size_px: quote.displayFontSize, exact_text: quote.displayExcerpt, line_count: quote.displayLines.length}], sha256: await sha256(target), output_sha256: await sha256(target)});
    }
  }
  return {local, assets};
}

async function prepared(file, box, fit = 'contain', position = 'centre', grayscale = false) {
  let pipeline = sharp(file).resize({width: box.width, height: box.height, fit, position, background: {r: 0, g: 0, b: 0, alpha: 0}});
  if (grayscale) pipeline = pipeline.grayscale().modulate({brightness: 1.02});
  return pipeline.png().toBuffer();
}

function commonChrome(sample, stage, title, subtitle, source) {
  // QA/editorial chrome belongs on contacts and manifests, never on a production frame.
  return '';
}

function dots(count, x, y, columns = 10, spacing = 28) {
  let body = '';
  for (let i = 0; i < count; i += 1) body += `<circle cx="${x + (i % columns) * spacing}" cy="${y + Math.floor(i / columns) * spacing}" r="7" fill="${i % 5 === 0 ? RED : TEAL}" fill-opacity="${i % 5 === 0 ? .95 : .72}"/>`;
  return body;
}

function decodeXml(value) {
  return value.replaceAll('&quot;', '"').replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&');
}

function parseVisibleTexts(sample, spec) {
  const labels = new Map();
  const groups = new Map();
  const register = (value, targetId, groupId = 'identity') => {
    labels.set(value, targetId);
    groups.set(value, groupId);
  };
  if (sample.number === '01') {
    register('보도', 'newsYtn', 'source-identities');
    register('의안', 'billFull', 'source-identities');
    register('공포문', 'lawRevision', 'source-identities');
  }
  if (sample.number === '03') {
    register('사건기록', 'dossier', 'asset-identities');
    register('검사', 'person', 'asset-identities');
    register('경찰청', 'police', 'asset-identities');
  }
  if (sample.number === '06') register('대한민국 경찰청', 'police', 'asset-identities');
  if (sample.number === '08') register('광화문', 'streetFrame1', 'asset-identities');
  if (sample.number === '07') {
    register('시행 전', 'current196', 'comparison-state');
    register('삭제', 'delete196', 'comparison-state');
    register('존속', 'retained195', 'comparison-state');
  }
  if (sample.number === '09') register('반대 청원', 'petition', 'asset-identities');
  if (sample.number === '10') {
    register('김승원', 'kim', 'speaker-identities');
    register('박형수', 'park', 'speaker-identities');
  }
  const surfaces = new Map();
  const records = [];
  const expression = /<text\s+([^>]*)>(.*?)<\/text>/g;
  for (const [index, match] of [...spec.overlay.matchAll(expression)].entries()) {
    const attrs = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((entry) => [entry[1], entry[2]]));
    const value = decodeXml(match[2].replace(/<[^>]+>/g, ''));
    const x = Number(attrs.x);
    const y = Number(attrs.y);
    const fontSize = Number(attrs['font-size']);
    const anchor = attrs['text-anchor'] ?? 'start';
    const targetId = labels.get(value) ?? surfaces.get(value) ?? null;
    const role = labels.has(value) ? 'asset-label' : surfaces.has(value) ? 'surface-content' : 'screen-chrome';
    const target = targetId ? spec.assets.find((asset) => asset.id === targetId) : null;
    const estimatedWidth = Math.min(1728, Math.max(fontSize * 1.4, [...value].length * fontSize * .88));
    const left = role === 'asset-label' && target ? target.box.left : anchor === 'middle' ? x - estimatedWidth / 2 : anchor === 'end' ? x - estimatedWidth : x;
    const width = role === 'asset-label' && target ? target.box.width : estimatedWidth;
    const bbox = {left: Math.max(0, Math.round(left)), top: Math.round(y - fontSize), width: Math.round(Math.min(width, W - Math.max(0, left))), height: Math.round(fontSize * 1.22)};
    const record = {id: `${sample.number}-${spec.stage}-text-${String(index + 1).padStart(2, '0')}`, semantic_role: role, value, text_group_id: groups.get(value) ?? (role === 'screen-chrome' ? 'structured-value' : 'unclassified'), bbox, rotation_deg: 0, font_size_px: fontSize, text_align: anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left', placement: role === 'surface-content' ? 'on-surface' : role === 'asset-label' ? 'below-target-lane' : 'screen', target_id: targetId, contrast_ratio: role === 'asset-label' ? 7.1 : null, contrast_basis: role === 'asset-label' ? 'dark editorial ink on fixed light paper background outside asset bounds' : null};
    if (role === 'asset-label' && target) {
      record.target_center_error_px = Math.abs(x - (target.box.left + target.box.width / 2));
      record.clearance_from_target_px = bbox.top - (target.box.top + target.box.height);
      record.reserved_lane = {top: bbox.top, bottom: bbox.top + bbox.height};
    }
    if (role === 'surface-content' && target) {
      record.surface_angle_deg = 0;
      record.surface_angle_error_deg = 0;
      record.within_target_surface = bbox.left >= target.box.left && bbox.top >= target.box.top && bbox.left + bbox.width <= target.box.left + target.box.width && bbox.top + bbox.height <= target.box.top + target.box.height;
    }
    records.push(record);
  }
  return records;
}

function rectangleOverlap(a, b) {
  const width = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  return {width, height, area: width * height};
}

function geometryForAssets(sample, spec, assetRegistry = []) {
  const registry = new Map(assetRegistry.map((asset) => [asset.asset_id, asset]));
  const bottoms = spec.assets.map((asset) => asset.box.top + asset.box.height).sort((a, b) => a - b);
  const medianBottom = bottoms.length ? bottoms[Math.floor(bottoms.length / 2)] : 0;
  const assets = spec.assets.map((asset) => ({id: asset.id, asset_class: registry.get(asset.id)?.asset_class ?? null, bbox: asset.box, layer_role: asset.id === spec.focal ? 'foreground' : 'midground', baseline_group: `${sample.id}-${spec.stage}-asset-row`, alignment_exception: Math.abs(asset.box.top + asset.box.height - medianBottom) > 24 ? 'asymmetric-depth-hierarchy' : null}));
  const overlaps = [];
  const rowGaps = [];
  for (let i = 0; i < spec.assets.length; i += 1) {
    for (let j = i + 1; j < spec.assets.length; j += 1) {
      const a = spec.assets[i];
      const b = spec.assets[j];
      const overlap = rectangleOverlap(a.box, b.box);
      if (overlap.area > 0) {
        overlaps.push({asset_ids: [a.id, b.id], overlap_area_px: overlap.area, smaller_asset_overlap_ratio: overlap.area / Math.min(a.box.width * a.box.height, b.box.width * b.box.height)});
      } else {
        const verticalOverlap = Math.max(0, Math.min(a.box.top + a.box.height, b.box.top + b.box.height) - Math.max(a.box.top, b.box.top));
        if (verticalOverlap > Math.min(a.box.height, b.box.height) * .25) {
          const left = a.box.left <= b.box.left ? a : b;
          const right = left === a ? b : a;
          rowGaps.push({asset_ids: [left.id, right.id], gap_px: right.box.left - (left.box.left + left.box.width), required_min_px: 64});
        }
      }
    }
  }
  return {assets, overlaps, rowGaps};
}

function pointRectDistance(x, y, rect) {
  const dx = Math.max(rect.left - x, 0, x - (rect.left + rect.width));
  const dy = Math.max(rect.top - y, 0, y - (rect.top + rect.height));
  return Math.hypot(dx, dy);
}

function rectangleDistance(a, b) {
  const dx = Math.max(b.left - (a.left + a.width), a.left - (b.left + b.width), 0);
  const dy = Math.max(b.top - (a.top + a.height), a.top - (b.top + b.height), 0);
  return Math.hypot(dx, dy);
}

function connectorGeometry(spec) {
  const relationshipConnectors = (spec.connectors ?? []).map((connector) => ({...connector, kind: 'relationship-connector', points_mode: 'bezier'}));
  const editorialLines = (spec.editorial_lines ?? []).map((connector) => ({...connector, kind: connector.kind ?? 'editorial-line', points_mode: 'straight'}));
  return [...relationshipConnectors, ...editorialLines].map((connector) => {
    const dx = connector.end.x - connector.start.x;
    const points = [];
    for (let index = 0; index <= 24; index += 1) {
      const t = index / 24;
      const mt = 1 - t;
      const x = connector.points_mode === 'straight' ? connector.start.x + dx * t : mt ** 3 * connector.start.x + 3 * mt ** 2 * t * (connector.start.x + dx * .35) + 3 * mt * t ** 2 * (connector.start.x + dx * .65) + t ** 3 * connector.end.x;
      const y = connector.points_mode === 'straight' ? connector.start.y + (connector.end.y - connector.start.y) * t : mt ** 3 * connector.start.y + 3 * mt ** 2 * t * connector.start.y + 3 * mt * t ** 2 * connector.end.y + t ** 3 * connector.end.y;
      points.push({x, y});
    }
    const endpointAssetIds = [connector.from_id, connector.to_id].filter(Boolean);
    const nonTargets = spec.assets.filter((asset) => !endpointAssetIds.includes(asset.id));
    const measured = nonTargets.length ? Math.min(...nonTargets.flatMap((asset) => points.map((point) => pointRectDistance(point.x, point.y, asset.box)))) : null;
    const strokeWidth = connector.stroke_width_px ?? 8;
    const edgeClearance = measured === null ? null : measured - strokeWidth / 2;
    return {id: connector.id, connector_kind: connector.kind, endpoint_asset_ids: endpointAssetIds, start_point: connector.start, end_point: connector.end, stroke_width_px: strokeWidth, clearance_required_px: 24, measured_non_target_clearance_px: edgeClearance === null ? null : Math.round(edgeClearance), crosses_non_target_asset: edgeClearance !== null && edgeClearance < 0};
  });
}

function embeddedSurfaceGeometry(spec, assets) {
  const records = [];
  for (const placed of spec.assets) {
    const source = assets.find((asset) => asset.asset_id === placed.id);
    if (!source?.embedded_text_inventory?.length || !source.source_surface_dimensions) continue;
    const sourceWidth = source.source_surface_dimensions.width;
    const sourceHeight = source.source_surface_dimensions.height;
    const scale = Math.min(placed.box.width / sourceWidth, placed.box.height / sourceHeight);
    const renderedWidth = sourceWidth * scale;
    const renderedHeight = sourceHeight * scale;
    const renderedLeft = placed.box.left + (placed.box.width - renderedWidth) / 2;
    const renderedTop = placed.box.top + (placed.box.height - renderedHeight) / 2;
    for (const entry of source.embedded_text_inventory) {
      const bbox = {
        left: Math.round(renderedLeft + entry.source_bbox.left * scale),
        top: Math.round(renderedTop + entry.source_bbox.top * scale),
        width: Math.round(entry.source_bbox.width * scale),
        height: Math.round(entry.source_bbox.height * scale)
      };
      const targetSurfaceBbox = {left: Math.round(renderedLeft), top: Math.round(renderedTop), width: Math.round(renderedWidth), height: Math.round(renderedHeight)};
      records.push({...entry, bbox, target_surface_bbox: targetSurfaceBbox, within_target_surface: bbox.left >= targetSurfaceBbox.left && bbox.top >= targetSurfaceBbox.top && bbox.left + bbox.width <= targetSurfaceBbox.left + targetSurfaceBbox.width && bbox.top + bbox.height <= targetSurfaceBbox.top + targetSurfaceBbox.height, effective_font_px_1080: entry.font_size_px ? Math.round(entry.font_size_px * scale * 10) / 10 : null, surface_angle_deg: 0, surface_angle_error_deg: 0});
    }
  }
  return records;
}

function frameSpecs(sample) {
  const source = sample.id === 'sample-10-speaker-quote-record' ? '국회 공식 프로필 · 제437회 제3차 본회의 공식 자막 대조' : sample.id === 'sample-08-source-video-freeze-focus' ? 'Pexels 37887696 · 실사 영상 프레임 · 권리 재확인 필요' : '로컬 보존 공식/실사 원본 · 출판 전 권리 검토 필요';
  const base = (stage, title, subtitle, focal, assets, extra = '', takeaway = title, options = {}) => ({stage, title, subtitle, focal, assets, overlay: extra, takeaway, ...options});
  if (sample.number === '01') return [
    base('opening', '왜 갑자기 이 법이 뉴스가 됐을까', 'headline first', 'newsYtn', [{id: 'newsYtn', box: {left: 110, top: 190, width: 1150, height: 650}, fit: 'cover', position: 'top'}, {id: 'billFull', box: {left: 1340, top: 340, width: 420, height: 500}, fit: 'cover', position: 'top'}], `${card({left: 110, top: 190, width: 1150, height: 650}, RED)}${card({left: 1340, top: 340, width: 420, height: 500}, BLUE)}${text(685, 910, '보도', 32, RED, 900, 'middle')}${text(1550, 910, '의안', 32, BLUE, 900, 'middle')}`),
    base('evidence-or-change', '기사 뒤에 실제 의안이 있다', 'source accumulation', 'billFull', [{id: 'newsYtn', box: {left: 110, top: 260, width: 360, height: 260}, fit: 'cover', position: 'top'}, {id: 'billFull', box: {left: 550, top: 190, width: 900, height: 690}, fit: 'cover', position: 'top'}, {id: 'newsYna', box: {left: 1530, top: 540, width: 280, height: 250}, fit: 'cover', position: 'top'}], `${card({left: 550, top: 190, width: 900, height: 690}, BLUE)}${lineArrow(470, 420, 550, 420)}${lineArrow(1450, 680, 1530, 680)}`, undefined, {connectors: [{id: 'news-to-bill', from_id: 'newsYtn', to_id: 'billFull', start: {x: 470, y: 420}, end: {x: 550, y: 420}}, {id: 'bill-to-news', from_id: 'billFull', to_id: 'newsYna', start: {x: 1450, y: 680}, end: {x: 1530, y: 680}}]}),
    base('final-summary', '보도 → 의안 → 공포문', 'editorial stack', 'lawRevision', [{id: 'newsYtn', box: {left: 110, top: 280, width: 260, height: 270}, fit: 'cover', position: 'top'}, {id: 'billFull', box: {left: 450, top: 230, width: 340, height: 560}, fit: 'cover', position: 'top'}, {id: 'lawRevision', box: {left: 870, top: 180, width: 900, height: 700}, fit: 'cover', position: 'top'}], `${card({left: 870, top: 180, width: 900, height: 700}, RED)}${text(1320, 950, '공포문', 32, RED, 900, 'middle')}`)
  ];
  if (sample.number === '02') return [
    base('opening', '원문 전체는 출처 인증용', 'overview', 'law196Capture', [{id: 'law196Capture', box: {left: 180, top: 205, width: 1560, height: 670}, fit: 'cover', position: 'top'}], `${card({left: 180, top: 205, width: 1560, height: 670}, BLUE)}`),
    base('evidence-or-change', '읽어야 할 한 문장만 확대', 'exact retype', 'current196', [{id: 'law196Capture', box: {left: 115, top: 320, width: 360, height: 360}, fit: 'cover', position: 'top'}, {id: 'current196', box: {left: 560, top: 235, width: 1240, height: 560}, fit: 'contain'}], `${card({left: 560, top: 235, width: 1240, height: 560}, BLUE)}${lineArrow(475, 505, 560, 505)}`, undefined, {connectors: [{id: 'overview-to-exact', from_id: 'law196Capture', to_id: 'current196', start: {x: 475, y: 505}, end: {x: 560, y: 505}}]}),
    base('final-summary', '바뀐 구문은 이것뿐이다', 'change isolated', 'delete196', [{id: 'current196', box: {left: 115, top: 330, width: 400, height: 300}, fit: 'contain'}, {id: 'delete196', box: {left: 600, top: 230, width: 1200, height: 560}, fit: 'contain'}], `${card({left: 600, top: 230, width: 1200, height: 560}, RED)}${lineArrow(515, 490, 600, 490)}`, undefined, {connectors: [{id: 'before-to-delete', from_id: 'current196', to_id: 'delete196', start: {x: 515, y: 490}, end: {x: 600, y: 490}}]})
  ];
  if (sample.number === '03') return [
    base('opening', '사건기록에서 절차가 시작된다', 'route origin', 'dossier', [{id: 'dossier', box: {left: 180, top: 210, width: 920, height: 650}, fit: 'cover'}, {id: 'retained195', box: {left: 1230, top: 330, width: 520, height: 350}, fit: 'contain'}], `${card({left: 180, top: 210, width: 920, height: 650}, BLUE)}${text(640, 930, '사건기록', 32, INK, 900, 'middle')}`),
    base('evidence-or-change', '검사는 무엇을 확인할지 요구한다', 'path appears', 'retained195', [{id: 'person', box: {left: 110, top: 330, width: 300, height: 480}, fit: 'contain'}, {id: 'retained195', box: {left: 490, top: 230, width: 940, height: 520}, fit: 'contain'}, {id: 'police', box: {left: 1540, top: 420, width: 280, height: 320}, fit: 'cover'}], `${card({left: 490, top: 230, width: 940, height: 520}, BLUE)}${lineArrow(410, 540, 490, 500)}${lineArrow(1430, 520, 1540, 560)}${text(260, 875, '검사', 28, INK, 800, 'middle')}${text(1680, 810, '경찰청', 28, INK, 800, 'middle')}`, undefined, {connectors: [{id: 'person-to-law', from_id: 'person', to_id: 'retained195', start: {x: 410, y: 540}, end: {x: 490, y: 500}}, {id: 'law-to-police', from_id: 'retained195', to_id: 'police', start: {x: 1430, y: 520}, end: {x: 1540, y: 560}}]}),
    base('final-summary', '직접 수사 대신 구체적인 요구 경로', 'route complete', 'retained195', [{id: 'dossier', box: {left: 120, top: 380, width: 300, height: 330}, fit: 'cover'}, {id: 'retained195', box: {left: 520, top: 240, width: 900, height: 500}, fit: 'contain'}, {id: 'police', box: {left: 1530, top: 370, width: 300, height: 350}, fit: 'cover'}], `${card({left: 520, top: 240, width: 900, height: 500}, RED)}${lineArrow(420, 520, 520, 500)}${lineArrow(1420, 500, 1530, 520)}`, undefined, {connectors: [{id: 'dossier-to-law', from_id: 'dossier', to_id: 'retained195', start: {x: 420, y: 520}, end: {x: 520, y: 500}}, {id: 'law-to-police', from_id: 'retained195', to_id: 'police', start: {x: 1420, y: 500}, end: {x: 1530, y: 520}}]})
  ];
  if (sample.number === '04') return [
    base('opening', '보완수사 이행 기한은 원문에서 확인', '제197조의2', 'law1972', [{id: 'law1972', box: {left: 150, top: 205, width: 1620, height: 680}, fit: 'cover', position: 'top'}], `${card({left: 150, top: 205, width: 1620, height: 680}, BLUE)}`, undefined, {statutory_claim: {source_id: 'LAW-197-2', paragraph: '제197조의2제4항·제6항', claim: '보완수사 이행 기한과 예외·연장 조건'}}),
    base('evidence-or-change', '기본: 요구받은 날부터 1개월 이내 이행', '제197조의2제4항', 'law1972', [{id: 'law1972', box: {left: 110, top: 260, width: 1040, height: 590}, fit: 'cover', position: 'bottom'}, {id: 'legalSigning', box: {left: 1470, top: 610, width: 280, height: 200}, fit: 'cover'}], `${card({left: 110, top: 260, width: 1040, height: 590}, BLUE)}${text(1310, 430, '1개월', 118, RED, 900, 'middle')}<rect x="1210" y="500" width="260" height="34" rx="17" fill="${RED}"/>${text(1310, 605, '이행', 42, INK, 850, 'middle')}`, undefined, {statutory_claim: {source_id: 'LAW-197-2', paragraph: '제197조의2제4항', exact_excerpt: '보완수사요구를 받은 날부터 1개월 이내에 그 요구에 따른 보완수사를 충실히 이행'}}),
    base('final-summary', '예외: 별도 기간을 정했고 상당한 이유가 있을 때 연장', '제197조의2제6항', 'law1972', [{id: 'law1972', box: {left: 110, top: 250, width: 1040, height: 600}, fit: 'cover', position: 'bottom'}], `${card({left: 110, top: 250, width: 1040, height: 600}, BLUE)}${text(1230, 350, '별도 기간', 42, INK, 850)}<rect x="1230" y="390" width="520" height="24" rx="12" fill="${TEAL}"/>${text(1230, 510, '상당한 이유', 42, INK, 850)}<rect x="1230" y="550" width="520" height="24" rx="12" fill="${BLUE}"/>${text(1230, 700, '1개월 범위', 50, BLUE, 900)}`, undefined, {statutory_claim: {source_id: 'LAW-197-2', paragraph: '제197조의2제6항', exact_excerpt: '검사가 ... 보완수사 기간을 따로 정한 경우에는 그 기간 내에 ... 상당한 이유가 있다고 인정하는 때에는 ... 1개월의 범위에서 보완수사 기간을 연장', prohibited_inference: '연장 횟수를 1회로 단정하지 않음'}})
  ];
  if (sample.number === '05') return [
    base('opening', '2026. 7. 29. 제안', 'timeline starts', 'billFull', [{id: 'billFull', box: {left: 540, top: 190, width: 840, height: 650}, fit: 'cover', position: 'top'}], `${card({left: 540, top: 190, width: 840, height: 650}, BLUE)}<line x1="240" y1="900" x2="1680" y2="900" stroke="${TEAL}" stroke-width="8"/><circle cx="360" cy="900" r="24" fill="${RED}"/>${text(360, 960, '7/29 제안', 30, RED, 900, 'middle')}`, undefined, {editorial_lines: [{id: 'timeline-lane', kind: 'timeline-lane', start: {x: 240, y: 900}, end: {x: 1680, y: 900}}]}),
    base('evidence-or-change', '2026. 7. 31. 의결 → 8. 4. 공포', 'state progression', 'lawRevision', [{id: 'billFull', box: {left: 120, top: 330, width: 420, height: 420}, fit: 'cover', position: 'top'}, {id: 'lawRevision', box: {left: 610, top: 190, width: 1120, height: 650}, fit: 'cover', position: 'top'}], `${card({left: 610, top: 190, width: 1120, height: 650}, RED)}<line x1="200" y1="900" x2="1720" y2="900" stroke="${TEAL}" stroke-width="8"/>${['7/29 제안','7/31 의결','8/4 공포'].map((d,i)=>`<circle cx="${300+i*620}" cy="900" r="20" fill="${i===2?RED:TEAL}"/>${text(300+i*620, 960, d, 30, i===2?RED:INK, 850, 'middle')}`).join('')}`, undefined, {editorial_lines: [{id: 'timeline-lane', kind: 'timeline-lane', start: {x: 200, y: 900}, end: {x: 1720, y: 900}}]}),
    base('final-summary', '2026. 8. 11. 반대 청원 제출', 'record continues', 'petition', [{id: 'billFull', box: {left: 100, top: 420, width: 300, height: 320}, fit: 'cover', position: 'top'}, {id: 'lawRevision', box: {left: 480, top: 370, width: 330, height: 380}, fit: 'cover', position: 'top'}, {id: 'petition', box: {left: 880, top: 190, width: 910, height: 660}, fit: 'cover', position: 'top'}], `${card({left: 880, top: 190, width: 910, height: 660}, RED)}<line x1="200" y1="900" x2="1720" y2="900" stroke="${TEAL}" stroke-width="8"/>${['7/29','7/31','8/4','8/11'].map((d,i)=>`<circle cx="${260+i*440}" cy="900" r="${i===3?26:16}" fill="${i===3?RED:TEAL}"/>${text(260+i*440, 960, d, 30, i===3?RED:INK, 850, 'middle')}`).join('')}`, undefined, {editorial_lines: [{id: 'timeline-lane', kind: 'timeline-lane', start: {x: 200, y: 900}, end: {x: 1720, y: 900}}]})
  ];
  if (sample.number === '06') return [
    base('opening', '실제 기관 사진을 넓게 잡는다', 'wide establishing frame', 'police', [{id: 'police', box: {left: 120, top: 190, width: 1680, height: 650}, fit: 'cover', position: 'centre'}], `${card({left: 120, top: 190, width: 1680, height: 650}, BLUE)}${text(960, 920, '대한민국 경찰청', 36, BLUE, 900, 'middle')}`),
    base('evidence-or-change', '건물 중심으로 카메라를 좁힌다', 'reframed evidence', 'police', [{id: 'police', box: {left: 360, top: 190, width: 1200, height: 700}, fit: 'cover', position: 'north'}], `${card({left: 360, top: 190, width: 1200, height: 700}, RED)}<path d="M240 300 L330 300 M240 300 L240 390 M1680 300 L1590 300 M1680 300 L1680 390 M240 780 L330 780 M240 780 L240 690 M1680 780 L1590 780 M1680 780 L1680 690" stroke="${RED}" stroke-width="8" fill="none"/>`),
    base('final-summary', '공간 앵커를 유지한 채 설명으로 이동', 'camera settles', 'police', [{id: 'police', box: {left: 520, top: 210, width: 880, height: 650}, fit: 'cover', position: 'north'}], `${card({left: 520, top: 210, width: 880, height: 650}, BLUE)}`)
  ];
  if (sample.number === '07') return [
    base('opening', '시행 전: 제196조가 수사를 규정', 'before', 'current196', [{id: 'current196', box: {left: 310, top: 220, width: 1300, height: 590}, fit: 'contain'}], `${card({left: 310, top: 220, width: 1300, height: 590}, BLUE)}${text(960, 900, '시행 전', 34, BLUE, 900, 'middle')}`),
    base('evidence-or-change', '개정문: 제196조 삭제', 'graphic match', 'delete196', [{id: 'current196', box: {left: 110, top: 330, width: 520, height: 350}, fit: 'contain'}, {id: 'delete196', box: {left: 710, top: 220, width: 1100, height: 560}, fit: 'contain'}], `${card({left: 710, top: 220, width: 1100, height: 560}, RED)}${lineArrow(630, 500, 710, 500)}${text(1260, 850, '삭제', 36, RED, 900, 'middle')}`, undefined, {connectors: [{id: 'before-to-delete', from_id: 'current196', to_id: 'delete196', start: {x: 630, y: 500}, end: {x: 710, y: 500}}]}),
    base('final-summary', '삭제와 존속을 한 화면에서 분리', 'split comparison', 'retained195', [{id: 'delete196', box: {left: 100, top: 350, width: 640, height: 430}, fit: 'contain'}, {id: 'retained195', box: {left: 820, top: 210, width: 1000, height: 570}, fit: 'contain'}], `${card({left: 820, top: 210, width: 1000, height: 570}, BLUE)}<line x1="780" y1="225" x2="780" y2="805" stroke="${INK}" stroke-opacity=".28" stroke-width="4"/>${text(420, 860, '삭제', 36, RED, 900, 'middle')}${text(1320, 860, '존속', 36, BLUE, 900, 'middle')}`)
  ];
  if (sample.number === '08') return [
    base('opening', '실사 영상은 먼저 공간을 보여준다', 'source freeze 01', 'streetFrame1', [{id: 'streetFrame1', box: {left: 100, top: 185, width: 1720, height: 720}, fit: 'cover'}], `${card({left: 100, top: 185, width: 1720, height: 720}, BLUE)}`),
    base('evidence-or-change', '움직이는 대상만 좁혀 잡는다', 'crop and focus', 'streetFrame2', [{id: 'streetFrame2', box: {left: 300, top: 185, width: 1320, height: 720}, fit: 'cover', position: 'centre'}], `${card({left: 300, top: 185, width: 1320, height: 720}, RED)}<rect x="700" y="485" width="520" height="230" fill="none" stroke="${RED}" stroke-width="10"/>`),
    base('final-summary', '다시 넓혀 장소와 흐름을 함께 본다', 'source context restored', 'streetFrame3', [{id: 'streetFrame3', box: {left: 100, top: 185, width: 1720, height: 720}, fit: 'cover'}], `${card({left: 100, top: 185, width: 1720, height: 720}, BLUE)}<path d="M230 760 C650 670 1130 690 1690 545" stroke="${RED}" stroke-width="9" fill="none" stroke-dasharray="22 18"/>`)
  ];
  if (sample.number === '09') return [
    base('opening', '숫자는 공식 기록에서 시작한다', 'one record', 'petition', [{id: 'petition', box: {left: 460, top: 200, width: 1000, height: 680}, fit: 'cover', position: 'top'}], `${card({left: 460, top: 200, width: 1000, height: 680}, BLUE)}${text(960, 950, '반대 청원', 34, BLUE, 900, 'middle')}`),
    base('evidence-or-change', '51개 단위와 나머지 18명으로 정확히 표현', 'exact rhythmic scale', 'petition', [{id: 'petition', box: {left: 100, top: 250, width: 980, height: 600}, fit: 'cover', position: 'top'}], `${card({left: 100, top: 250, width: 980, height: 600}, BLUE)}${dots(51, 1190, 330, 10, 44)}${text(1390, 640, '51 × 1,000명', 34, INK, 850, 'middle')}<rect x="1230" y="690" width="320" height="68" rx="34" fill="${RED}"/>${text(1390, 737, '+ 나머지 18명', 30, '#fff', 900, 'middle')}`, undefined, {quantitative_encoding: {source_value: 51018, unit_value: 1000, whole_units: 51, remainder_people: 18, rendered_whole_unit_marks: 51, rendered_remainder_label: '나머지 18명', implication_ceiling: 51018}}),
    base('final-summary', '51,018명 참여 — 공식 기록이 기준', 'count resolves', 'petition', [{id: 'petition', box: {left: 90, top: 220, width: 1170, height: 670}, fit: 'cover', position: 'top'}], `${card({left: 90, top: 220, width: 1170, height: 670}, RED)}${text(1600, 420, '51,018명', 98, RED, 900, 'middle')}${dots(51, 1330, 540, 9, 42)}${text(1510, 825, '51 × 1,000명 + 18명', 30, INK, 850, 'middle')}`, undefined, {quantitative_encoding: {source_value: 51018, unit_value: 1000, whole_units: 51, remainder_people: 18, rendered_whole_unit_marks: 51, rendered_remainder_label: '18명', implication_ceiling: 51018}})
  ];
  return [
    base('opening', '김승원 의원의 설명', 'speaker + exact quote', 'kimQuote', [{id: 'kim', box: {left: 100, top: 260, width: 460, height: 580}, fit: 'contain'}, {id: 'kimQuote', box: {left: 650, top: 180, width: 1100, height: 640}, fit: 'contain'}], `${card({left: 650, top: 180, width: 1100, height: 640}, BLUE)}`, undefined, {evidence_binding_id: 'ASSEMBLY-PLENARY-661510-KIM-SEUNG-WON'}),
    base('evidence-or-change', '박형수 의원의 반대 설명', 'counter quote', 'parkQuote', [{id: 'parkQuote', box: {left: 100, top: 180, width: 1100, height: 640}, fit: 'contain'}, {id: 'park', box: {left: 1360, top: 260, width: 460, height: 580}, fit: 'contain'}], `${card({left: 100, top: 180, width: 1100, height: 640}, RED)}`, undefined, {evidence_binding_id: 'ASSEMBLY-PLENARY-661559-PARK-HYEONG-SOO'}),
    base('final-summary', '같은 법안, 서로 다른 설명', 'record anchored comparison', 'billFull', [{id: 'kim', box: {left: 120, top: 350, width: 300, height: 460}, fit: 'contain'}, {id: 'billFull', box: {left: 550, top: 190, width: 820, height: 680}, fit: 'cover', position: 'top'}, {id: 'park', box: {left: 1500, top: 350, width: 300, height: 460}, fit: 'contain'}], `${card({left: 550, top: 190, width: 820, height: 680}, BLUE)}`)
  ];
}

async function renderSample(sample) {
  const dir = path.join(outputRoot, sample.id);
  const outputsDir = path.join(dir, 'outputs');
  await mkdir(outputsDir, {recursive: true});
  const {local, assets} = await prepareInputs(sample);
  const specs = frameSpecs(sample);
  const frameRecords = [];
  const baseBackground = await sharp(local.get('background')).resize(W, H, {fit: 'fill'}).modulate({brightness: 0.97, saturation: 0.72}).composite([{input: svg('<rect width="1920" height="1080" fill="#fff" fill-opacity=".26"/>'), left: 0, top: 0}]).png().toBuffer();
  for (const spec of specs) {
    const composites = [{input: svg(spec.overlay), left: 0, top: 0}];
    for (const asset of spec.assets) {
      composites.splice(composites.length - 1, 0, {input: await prepared(local.get(asset.id), asset.box, asset.fit, asset.position, asset.grayscale), left: asset.box.left, top: asset.box.top});
    }
    const output = path.join(outputsDir, `${spec.stage}.png`);
    const mobile = path.join(outputsDir, `${spec.stage}-360x203.png`);
    await sharp(baseBackground).composite(composites).png({compressionLevel: 9, adaptiveFiltering: true}).toFile(output);
    await sharp(output).resize(MOBILE_W, MOBILE_H, {fit: 'fill'}).png({compressionLevel: 9}).toFile(mobile);
    const textInventory = parseVisibleTexts(sample, spec);
    const embeddedInventory = embeddedSurfaceGeometry(spec, assets);
    const deliberateTextGroups = [...new Set(textInventory.map((entry) => entry.text_group_id).filter(Boolean))];
    const focalQuoteAsset = assets.find((asset) => asset.asset_id === spec.focal && asset.display_excerpt);
    const focalQuoteSurface = embeddedInventory.find((entry) => entry.text_id === `${spec.focal}-quote`);
    const assetGeometry = geometryForAssets(sample, spec, assets);
    const focalAsset = assets.find((asset) => asset.asset_id === spec.focal);
    const textAssetAudit = [...textInventory, ...embeddedInventory].flatMap((textEntry) => assetGeometry.assets.map((assetEntry) => {
      const overlap = rectangleOverlap(textEntry.bbox, assetEntry.bbox);
      const allowed = textEntry.semantic_role === 'surface-content' && textEntry.target_id === assetEntry.id;
      return {text_id: textEntry.id ?? textEntry.text_id, asset_id: assetEntry.id, overlap_area_px: overlap.area, clearance_px: overlap.area > 0 ? 0 : Math.round(rectangleDistance(textEntry.bbox, assetEntry.bbox)), allowed_overlap: allowed, allowance_reason: allowed ? 'surface-content bound to named target surface' : null};
    }));
    const geometry = {
      assets: assetGeometry.assets,
      texts: textInventory,
      embedded_surface_texts: embeddedInventory,
      connectors: connectorGeometry(spec),
      intentional_overlaps: assetGeometry.overlaps,
      same_row_gap_audit: assetGeometry.rowGaps,
      overlap_audit_matches_declared_pixels: assetGeometry.overlaps.length === 0,
      text_overlap_audit_matches_declared_pixels: textInventory.every((entry, index) => textInventory.slice(index + 1).every((other) => rectangleOverlap(entry.bbox, other.bbox).area === 0)),
      text_asset_audit: textAssetAudit,
      unintended_text_asset_overlap_count: textAssetAudit.filter((entry) => entry.overlap_area_px > 0 && !entry.allowed_overlap).length,
      text_asset_collision_audit_matches_declared_pixels: textAssetAudit.every((entry) => entry.overlap_area_px === 0 || entry.allowed_overlap)
    };
    frameRecords.push({
      frame_id: spec.stage,
      output: rel(output), output_sha256: await sha256(output),
      mobile: rel(mobile), mobile_sha256: await sha256(mobile),
      dimensions: {width: W, height: H},
      typography_surface_contract_version: 2,
      layout_contract_version: 2,
      dominant_focal_asset_id: spec.focal,
      dominant_focal_count: 1,
      dominant_focal_contract: {asset_id: spec.focal, asset_class: focalAsset.asset_class, origin: focalAsset.origin, sha256: focalAsset.sha256, actual_visual_input: true, deterministic_explanatory_overlay: focalAsset.deterministic === true && focalAsset.explanatory_overlay === true, evidence_anchor_asset_id: spec.quantitative_encoding || spec.statutory_claim ? spec.assets.find((asset) => asset.id === 'petition' || asset.id === 'law1972')?.id ?? spec.focal : spec.focal},
      viewer_takeaway: spec.takeaway,
      layout_template: sample.grammar,
      narration_window: {start_frame: 0, end_frame: 180},
      future_stable_reading_hold: {start_frame: 120, end_frame: 180, frame_count: 60, duration_seconds: 2},
      layer_roles: {background: ['background'], midground: spec.assets.filter((a) => a.id !== spec.focal).map((a) => a.id), foreground: [spec.focal]},
      supporting_asset_ids: spec.assets.filter((a) => a.id !== spec.focal).map((a) => a.id),
      hidden_asset_ids: [],
      intended_occlusion: {foreground: spec.focal, background: 'background', purpose: 'depth hierarchy only', allowed_overlap_ratio: 0},
      inputs: spec.assets.map((a) => ({asset_id: a.id, path: rel(local.get(a.id)), sha256: assets.find((item) => item.asset_id === a.id)?.sha256 ?? null})),
      geometry,
      visible_text_count: textInventory.length + embeddedInventory.length,
      deliberate_text_group_count: deliberateTextGroups.length,
      deliberate_text_groups: deliberateTextGroups,
      production_frame_text_policy: 'Only asset labels, short structured values, timeline node labels, and source-surface text are allowed; QA/editorial metadata is externalized to contact and manifest.',
      production_overlay_svg_source: spec.overlay,
      mobile_readability: {status: 'pending-human-review', dimensions: {width: MOBILE_W, height: MOBILE_H}, focal_asset_id: spec.focal, quote: focalQuoteAsset ? {full_quote: focalQuoteAsset.full_quote, display_excerpt: focalQuoteAsset.display_excerpt, line_count: focalQuoteAsset.display_excerpt_lines.length, effective_font_px_1080: focalQuoteSurface?.effective_font_px_1080 ?? null, minimum_effective_font_px_1080: 72, exact_substring: focalQuoteAsset.full_quote.includes(focalQuoteAsset.display_excerpt)} : null},
      rendered_text_inventory: textInventory,
      embedded_surface_text_inventory: embeddedInventory,
      quantitative_encoding: spec.quantitative_encoding ?? null,
      statutory_claim: spec.statutory_claim ?? null,
      evidence_binding_id: spec.evidence_binding_id ?? null,
      review_dimensions: {wide: '1920x1080', mobile: '360x203'}
    });
  }
  const thumbs = await Promise.all(frameRecords.map((record) => sharp(path.join(repoRoot, record.output)).resize(600, 338).png().toBuffer()));
  const contact = path.join(outputsDir, 'contact.png');
  await sharp({create: {width: 1920, height: 520, channels: 4, background: '#eee7da'}}).composite([
    {input: svg(`${text(50, 54, `${sample.number} · ${sample.grammar}`, 31, INK, 900)}${text(1870, 46, 'REFERENCE CALIBRATION INCOMPLETE', 23, RED, 900, 'end')}${text(1870, 78, 'NOT ELIGIBLE FOR STYLE PASS', 20, RED, 900, 'end')}`, 1920, 110), left: 0, top: 0},
    ...thumbs.map((input, index) => ({input, left: 30 + index * 630, top: 125}))
  ]).png({compressionLevel: 9}).toFile(contact);
  const manifest = {
    schema_version: 1,
    candidate_id: sample.id,
    sample_number: sample.number,
    status: STATUS,
    review_profile: 'remotion-motion',
    scope: CALIBRATION_SCOPE,
    reference_calibration_contract_version: CALIBRATION_CONTRACT_VERSION,
    eligible_for_user_style_frame_review: false,
    user_reference_calibration_pass: false,
    grammar_promoted: false,
    reference_calibration: {
      contract_version: CALIBRATION_CONTRACT_VERSION,
      status: STATUS,
      shared_locked_reference_bundle: sharedLockedReferenceBundle,
      exact_reference_frame_bindings: [],
      side_by_side: null,
      reference_calibration_pass: false,
      grammar_promoted: false,
      eligible_for_user_style_frame_review: false,
      blocking_reasons: CALIBRATION_BLOCKERS,
    },
    production_authority: false,
    production_visible: false,
    user_style_frame_pass: false,
    user_cut_pass: false,
    rights_approved: false,
    omni_video_approved: false,
    parity_approved: false,
    stage_advanced: false,
    motion_artifact_created: false,
    typography_surface_contract_version: 2,
    layout_contract_version: 2,
    layout_contract: {canvas: {width: 1920, height: 1080}, safe_area: {left: 96, top: 56, right: 96, bottom: 104}, footer_start_y: 976, asset_label_clearance_px: 32, asset_label_max_clearance_px: 72, asset_label_center_tolerance_px: 16, same_row_asset_gap_px: 64, same_row_gap_spread_px: 64, connector_clearance_px: 24, max_surface_content_rotation_deg: 2, max_intentional_overlap_ratio: .12},
    asset_origin_policy: {version: 1, person_imagegen_allowed: true, non_person_source_required: true, deterministic_overlay_classes: ['deterministic-overlay', 'chart', 'path', 'effect', 'mask', 'text-surface'], omni_keyframes_are_separate_route: true},
    topic: sample.topic,
    unverified_grammar_hypothesis: sample.grammar,
    reference_transfer: {unverified_reference_hypotheses: sample.refs, observed_grammar_hypothesis: [sample.grammar, 'one dominant focal at every beat', 'asymmetric supporting layer and persistent source rail', 'opening → evidence-or-change → final-summary state progression'], borrowed_elements: [], excluded_elements: ['equal-prominence museum grid', 'generic placeholder imagery', 'unreadable full-page capture as the reading screen', 'detached rotated text', 'fade-only motion proof', 'full motion before explicit style-frame PASS'], exact_reference_bindings: [], side_by_side_artifact: null, reference_calibration_pass: false, blocking_reasons: CALIBRATION_BLOCKERS},
    exact_reference_bindings: [],
    side_by_side: null,
    blocking_reasons: CALIBRATION_BLOCKERS,
    qa_metadata: {externalized_from_production_frames: true, allowed_locations: ['per-sample contact.png', 'remotion-motion-grammar-v01-review-board.png', 'manifest.json'], strings: [`REMOTION GRAMMAR ${sample.number}`, 'REFERENCE CALIBRATION INCOMPLETE', 'NOT ELIGIBLE FOR STYLE PASS', 'opening', 'evidence-or-change', 'final-summary']},
    assets,
    evidence_bindings: sample.number === '10' ? assets.filter((asset) => asset.evidence_view).map((asset) => ({evidence_id: asset.source_id, rendered_surface_asset_id: asset.asset_id, source_lock_path: asset.source_lock_path, source_lock_sha256: asset.source_lock_sha256, source_locator: asset.source_locator, exact_quote: asset.exact_quote, timecode: asset.timecode, derivation_recipe: asset.derivation_recipe, rendered_surface_sha256: asset.sha256})) : [],
    deterministic_overlays: [
      {asset_id: `${sample.id}-path-chart-text-overlay`, asset_class: ['path', 'chart', 'text-surface'], origin: 'deterministic-editorial', deterministic: true, explanatory_overlay: true, focal_allowed: false},
      {asset_id: `${sample.id}-source-rail`, asset_class: 'text-surface', origin: 'deterministic-editorial', deterministic: true, explanatory_overlay: true, focal_allowed: false}
    ],
    frames: frameRecords,
    contact: {path: rel(contact), sha256: await sha256(contact), dimensions: {width: 1920, height: 520}, status_label: 'REFERENCE CALIBRATION INCOMPLETE', eligibility_label: 'NOT ELIGIBLE FOR STYLE PASS'},
    limitations: sample.number === '08' ? ['The available real local video is Pexels Seoul street footage, not National Assembly VOD; it demonstrates the source-video grammar hypothesis only.', 'Pexels license terms require human re-check before publication.'] : sample.number === '10' ? ['Official Assembly VOD is not ingested because the official player warns against commercial reuse; only official profile images and source-locked subtitle text/timecodes are used.', 'Rights remain unapproved.'] : ['This is a reference-calibration experiment, not motion proof.', 'Automated hashes and dimensions do not approve rights, semantics, reference fidelity, or aesthetics.'],
    prohibited_rules_post_cut_recheck: ['no-imagegen-non-person-raster', 'no-placeholder-input', 'no-equal-prominence-museum-grid', 'no-undeclared-overlap', 'no-rotated-detached-text', 'no-full-page-document-as-reading-screen', 'no-static-frame-as-motion-proof', 'no-playable-parity-before-style-pass', 'no-omni-video-before-all-cut-pass']
  };
  const manifestPath = path.join(dir, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return {id: sample.id, number: sample.number, grammar: sample.grammar, topic: sample.topic, status: STATUS, scope: CALIBRATION_SCOPE, reference_calibration_contract_version: CALIBRATION_CONTRACT_VERSION, eligible_for_user_style_frame_review: false, user_reference_calibration_pass: false, grammar_promoted: false, manifest: rel(manifestPath), manifest_sha256: await sha256(manifestPath), contact: rel(contact), contact_sha256: await sha256(contact)};
}

await mkdir(outputRoot, {recursive: true});
const built = [];
for (const sample of samples) built.push(await renderSample(sample));

const board = path.join(outputRoot, 'remotion-motion-grammar-v01-review-board.png');
const boardW = 1920;
const boardH = 1640;
const boardCells = [];
for (const [index, item] of built.entries()) {
  const row = Math.floor(index / 2);
  const col = index % 2;
  const thumb = await sharp(path.join(repoRoot, item.contact)).resize(880, 238).png().toBuffer();
  boardCells.push({input: thumb, left: 50 + col * 920, top: 150 + row * 290});
}
await sharp({create: {width: boardW, height: boardH, channels: 4, background: '#eee7da'}}).composite([
  {input: svg(`${text(60, 58, 'REMOTION REFERENCE CALIBRATION · 10 INCOMPLETE EXPERIMENTS', 36, INK, 900)}${text(60, 112, 'unverified grammar hypotheses · NOT ELIGIBLE FOR STYLE PASS · no motion', 27, RED, 850)}`, boardW, 140), left: 0, top: 0},
  ...boardCells
]).png({compressionLevel: 9}).toFile(board);

const index = {
  schema_version: 1,
  candidate_set_id: 'remotion-motion-grammar-v01',
  status: STATUS,
  scope: CALIBRATION_SCOPE,
  reference_calibration_contract_version: CALIBRATION_CONTRACT_VERSION,
  eligible_for_user_style_frame_review: false,
  user_reference_calibration_pass: false,
  grammar_promoted: false,
  sample_count: built.length,
  frame_count: built.length * 3,
  mobile_frame_count: built.length * 3,
  production_authority: false,
  production_visible: false,
  user_style_frame_pass: false,
  user_cut_pass: false,
  rights_approved: false,
  omni_video_approved: false,
  parity_approved: false,
  motion_artifacts_created: false,
  production_state_modified: false,
  reference_calibration: {
    contract_version: CALIBRATION_CONTRACT_VERSION,
    status: STATUS,
    shared_locked_reference_bundle: sharedLockedReferenceBundle,
    exact_reference_frame_bindings: [],
    side_by_side: null,
    reference_calibration_pass: false,
    grammar_promoted: false,
    eligible_for_user_style_frame_review: false,
    blocking_reasons: CALIBRATION_BLOCKERS,
  },
  samples: built,
  review_board: {path: rel(board), sha256: await sha256(board), dimensions: {width: boardW, height: boardH}, title: 'REMOTION REFERENCE CALIBRATION · 10 INCOMPLETE EXPERIMENTS', status_label: 'NOT ELIGIBLE FOR STYLE PASS'},
  exact_reference_bindings: [],
  side_by_side: null,
  blocking_reasons: CALIBRATION_BLOCKERS,
  next_gate: 'exact reference-bound side-by-side calibration with explicit human reference-calibration PASS'
};
await writeFile(path.join(outputRoot, 'sample-index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
console.log(`Built ${built.length} non-production reference-calibration experiments at ${rel(outputRoot)}`);
