import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const outputRoot = path.join(repoRoot, 'video', 'qa', 'style-frames', 'episode-001', 'reference-style-families-v01');
const sharedBackground = path.join(repoRoot, 'video', 'public', 'assets', 'shared', 'paper-beige-check.png');
const newsRoot = path.join(repoRoot, 'video', 'source-intake', 'episode-001', 'news');
const officialRoot = path.join(repoRoot, 'video', 'source-intake', 'episode-001', 'official');
const sh003Root = path.join(repoRoot, 'video', 'public', 'assets', 'episode-001-work-v01', 'cuts', 'SH003', 'assets');
const sh006Root = path.join(repoRoot, 'video', 'public', 'assets', 'episode-001-work-v01', 'cuts', 'SH006', 'assets');
const historicOmniRoot = path.join(repoRoot, 'video', 'public', 'assets', 'episode-001-v03', 'cuts');

const WIDTH = 1920;
const HEIGHT = 1080;
const MOBILE_WIDTH = 360;
const MOBILE_HEIGHT = 203;
const FONT = 'Malgun Gothic, Noto Sans KR, sans-serif';
const INK = '#172a34';
const MUTED = '#405058';
const RED = '#9f3f35';
const TEAL = '#2f756e';
const BLUE = '#294f61';
const PAPER = '#f4ecdf';
const REVIEW_STATUS = 'pending-user-style-frame-review';

const rel = (file) => path.relative(repoRoot, file).replaceAll('\\', '/');
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const xml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function svg(body, width = WIDTH, height = HEIGHT) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#172a34" flood-opacity="0.20"/></filter>
      <filter id="smallShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#172a34" flood-opacity="0.18"/></filter>
      <marker id="arrowRed" markerWidth="14" markerHeight="14" refX="11" refY="7" orient="auto"><path d="M0,0 L14,7 L0,14 z" fill="${RED}"/></marker>
      <marker id="arrowTeal" markerWidth="14" markerHeight="14" refX="11" refY="7" orient="auto"><path d="M0,0 L14,7 L0,14 z" fill="${TEAL}"/></marker>
    </defs>
    <g font-family="${FONT}" text-rendering="geometricPrecision">${body}</g>
  </svg>`);
}

function text(x, y, value, size, fill = INK, weight = 800, anchor = 'start', rotation = 0) {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="-1" transform="rotate(${rotation} ${x} ${y})">${xml(value)}</text>`;
}

function targetLabel(x, y, value, rotation = 0, fill = INK, size = 36) {
  return `<g transform="rotate(${rotation} ${x} ${y})">
    <line x1="${x - 45}" y1="${y - 45}" x2="${x + 45}" y2="${y - 45}" stroke="${fill}" stroke-width="6"/>
    ${text(x, y, value, size, fill, 900, 'middle')}
  </g>`;
}

function footer(value) {
  return `<g>
    <rect x="0" y="986" width="1920" height="94" fill="#efe7d9" fill-opacity="0.96"/>
    <line x1="80" y1="986" x2="1840" y2="986" stroke="${MUTED}" stroke-opacity="0.22" stroke-width="2"/>
    ${text(1840, 1041, value, 27, MUTED, 750, 'end')}
  </g>`;
}

async function baseCanvas() {
  return sharp(sharedBackground).resize(WIDTH, HEIGHT, {fit: 'fill'}).png().toBuffer();
}

async function preparedImage(file, {width, height, fit = 'contain', rotate = 0, border = 0, background = {r: 0, g: 0, b: 0, alpha: 0}, extract = null} = {}) {
  let image = sharp(file);
  if (extract) image = image.extract(extract);
  if (width || height) image = image.resize({width, height, fit, background});
  if (border > 0) image = image.extend({top: border, bottom: border, left: border, right: border, background: '#f8f2e8'});
  if (rotate !== 0) image = image.rotate(rotate, {background: {r: 0, g: 0, b: 0, alpha: 0}});
  return image.png().toBuffer();
}

async function writeFrame(familyRoot, frameId, composites, overlay, inputRecords) {
  const outputDir = path.join(familyRoot, 'outputs');
  await mkdir(outputDir, {recursive: true});
  const output = path.join(outputDir, `${frameId}.png`);
  const mobile = path.join(outputDir, `${frameId}-360x203.png`);
  const background = await baseCanvas();
  await sharp(background).composite([...composites, {input: overlay, left: 0, top: 0}]).png({compressionLevel: 9}).toFile(output);
  await sharp(output).resize(MOBILE_WIDTH, MOBILE_HEIGHT, {fit: 'fill'}).png({compressionLevel: 9}).toFile(mobile);
  return {
    frame_id: frameId,
    output: rel(output),
    output_sha256: await sha256(output),
    mobile: rel(mobile),
    mobile_sha256: await sha256(mobile),
    inputs: await Promise.all(inputRecords.map(async (file) => ({path: rel(file), sha256: await sha256(file)}))),
  };
}

async function writeContact(familyRoot, familyId, records, captions) {
  const contact = path.join(familyRoot, 'outputs', `${familyId}-contact.png`);
  const panelWidth = 600;
  const panelHeight = 338;
  const thumbs = await Promise.all(records.map((record) => sharp(path.join(repoRoot, record.output)).resize(panelWidth, panelHeight).png().toBuffer()));
  const labelLayer = svg(`
    ${text(60, 56, `${familyId} · REFERENCE STYLE REVIEW ONLY`, 31, INK, 900)}
    ${captions.map((caption, index) => text(60 + index * panelWidth, 104, caption, 23, index === 2 ? TEAL : BLUE, 850)).join('')}
  `, 1920, 520);
  await sharp({create: {width: 1920, height: 520, channels: 4, background: '#eee7da'}})
    .composite([
      {input: labelLayer, left: 0, top: 0},
      ...thumbs.map((input, index) => ({input, left: 60 + index * panelWidth, top: 132})),
    ])
    .png({compressionLevel: 9})
    .toFile(contact);
  return {path: rel(contact), sha256: await sha256(contact), dimensions: {width: 1920, height: 520}};
}

async function writeManifest(familyRoot, family) {
  const manifestPath = path.join(familyRoot, 'manifest.json');
  const manifest = {
    schema_version: 1,
    episode_id: 'episode-001',
    candidate_id: family.id,
    status: REVIEW_STATUS,
    production_visible: false,
    user_style_frame_pass: false,
    user_cut_pass: false,
    rights_approved: false,
    stage_advanced: false,
    review_profile: family.reviewProfile,
    representative_shots: family.representativeShots,
    reference_basis: family.referenceBasis,
    visual_contract: {
      canvas: '1920x1080',
      fixed_background: rel(sharedBackground),
      one_focal_component_per_frame: true,
      independent_asset_layers: true,
      target_labels_below_center: true,
      text_boxes_as_primary_visual: false,
      stable_reading_hold_required_after_motion: 'minimum 60 frames at 30fps',
      final_hold_preserves_hierarchy: true,
    },
    typography_surface_contract_version: 1,
    typography_rotation_contract: {
      rotatable_text: 'runtime text physically overlaid on and explicitly bound to a named PNG surface',
      rotatable_placement: 'on-surface',
      non_surface_text_rotation_deg: 0,
      below_center_label_rotation_deg: 0,
      screen_space_text_rotation_deg: 0,
      canonical_example: 'SH006 B03 legal text over the document PNG',
    },
    source_boundary: family.sourceBoundary,
    frames: family.records,
    contact: family.contact,
    prohibited_rules_post_cut_recheck: [
      'no-placeholder-or-unrelated-substitute',
      'no-flat-composite-as-independent-motion-proof',
      'no-animation-name-without-runtime-delta',
      'no-reading-hold-camera-or-document-motion',
      'no-unapproved-morph-or-scene-to-scene-claim',
      'no-omni-video-before-all-cut-pass',
      'no-explanatory-text-box-as-focal',
      'no-source-ui-as-reading-screen',
      'no-text-rotation-without-named-png-surface-and-on-surface-placement',
      'no-rotation-for-below-center-labels-or-screen-space-text',
    ],
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return {path: rel(manifestPath), sha256: await sha256(manifestPath), candidate_id: family.id};
}

async function buildHookFamily() {
  const familyRoot = path.join(outputRoot, 'hook-source-collage-v01');
  const yna1 = path.join(newsRoot, 'news-yna-20260729-title-and-qa.png');
  const yna2 = path.join(newsRoot, 'news-yna-20260804-title-and-effective-date.png');
  const ytn = path.join(newsRoot, 'news-ytn-20260804-title-and-one-month.png');
  const law = path.join(officialRoot, 'law-196-delete.png');

  const yna1Crop = await preparedImage(yna1, {extract: {left: 112, top: 231, width: 760, height: 205}, width: 960, border: 18, rotate: -2});
  const yna2Crop = await preparedImage(yna2, {extract: {left: 112, top: 230, width: 760, height: 205}, width: 960, border: 18, rotate: 1.8});
  const ytnCrop = await preparedImage(ytn, {extract: {left: 20, top: 264, width: 900, height: 185}, width: 860, border: 18, rotate: -1.2});
  const lawOverview = await preparedImage(law, {width: 670, height: 430, fit: 'cover', border: 16, rotate: 3});

  const frames = [];
  frames.push(await writeFrame(familyRoot, 'SH001-H01-opening', [
    {input: lawOverview, left: 1135, top: 230},
    {input: yna1Crop, left: 145, top: 230},
  ], svg(`
    ${targetLabel(640, 655, '반복된 쟁점', 0, RED, 42)}
    ${targetLabel(1480, 745, '공식 개정문', 0, BLUE, 34)}
    ${footer('출처 후보 · 연합뉴스 2026.7.29 / 국가법령정보센터 · 권리·사용 승인 전 스타일 검수')}
  `), [yna1, law]));

  frames.push(await writeFrame(familyRoot, 'SH001-H02-evidence', [
    {input: yna1Crop, left: 95, top: 140},
    {input: yna2Crop, left: 760, top: 388},
    {input: ytnCrop, left: 1020, top: 104},
  ], svg(`
    ${targetLabel(568, 565, '7월 29일', 0, BLUE, 31)}
    ${targetLabel(1275, 785, '8월 4일', 0, RED, 31)}
    ${targetLabel(1470, 454, '같은 날', 0, TEAL, 31)}
    ${footer('출처 후보 · 연합뉴스·YTN 기사 화면의 제목·발행시각 crop · 재배포 권리 검토 전')}
  `), [yna1, yna2, ytn]));

  frames.push(await writeFrame(familyRoot, 'SH005-H03-summary', [
    {input: yna1Crop, left: 90, top: 175},
    {input: lawOverview, left: 650, top: 260},
    {input: yna2Crop, left: 1015, top: 150},
  ], svg(`
    <path d="M560 470 C730 410 820 410 940 482" fill="none" stroke="${RED}" stroke-width="9" marker-end="url(#arrowRed)"/>
    <path d="M1000 498 C1120 440 1220 435 1330 470" fill="none" stroke="${TEAL}" stroke-width="9" marker-end="url(#arrowTeal)"/>
    ${targetLabel(952, 790, '기사에서 원문으로', 0, INK, 44)}
    ${footer('영상의 출발점 · 반복 보도 → 공식 개정문 → 실제 절차 설명')}
  `), [yna1, yna2, law]));

  const contact = await writeContact(familyRoot, 'hook-source-collage-v01', frames, ['H01 한 출처로 진입', 'H02 반복 보도 축적', 'H03 원문으로 수렴']);
  return writeManifest(familyRoot, {
    id: 'hook-source-collage-v01', reviewProfile: 'source-photo-treatment', representativeShots: ['SH001', 'SH001', 'SH005'], records: frames, contact,
    referenceBasis: ['raw/inbox/vox-style-claude-remotion-reference.mp4 00:06–00:12 publication-to-object sequence', 'wiki/sources/vox-style-claude-remotion-reference.md'],
    sourceBoundary: 'News and law images are pending intake candidates used only in non-production style review. No editorial-use or rights approval is implied.',
  });
}

async function buildAssemblyFamily() {
  const familyRoot = path.join(outputRoot, 'assembly-editorial-v01');
  const rearWall = path.join(sh003Root, 'assembly-rear-wall-v01.png');
  const podium = path.join(sh003Root, 'assembly-speaker-podium-v01.png');
  const kim = path.join(sh003Root, 'assembly-speaker-photo-kim-v01.png');
  const park = path.join(sh003Root, 'assembly-speaker-photo-park-v01.png');
  const bill = path.join(sh003Root, 'assembly-bill-card-v01.svg');
  const rear = await preparedImage(rearWall, {width: 1260, height: 590});
  const podiumPlate = await preparedImage(podium, {width: 330, height: 340});
  const kimPlate = await preparedImage(kim, {width: 420, height: 590});
  const parkPlate = await preparedImage(park, {width: 400, height: 560});
  const billPlate = await preparedImage(bill, {width: 430, height: 360});
  const anchor = [
    {input: rear, left: 390, top: 130},
    {input: podiumPlate, left: 796, top: 486},
  ];
  const frames = [];
  frames.push(await writeFrame(familyRoot, 'SH003-A01-place', anchor, svg(`
    ${targetLabel(960, 902, '국회 본회의장', 0, BLUE, 42)}
    ${footer('설명용 2.5D 본회의장 구조 · 실제 국회 영상 프레임 대체가 아닌 공간 anchor')}
  `), [rearWall, podium]));
  frames.push(await writeFrame(familyRoot, 'SH003-A02-person', [...anchor, {input: kimPlate, left: 130, top: 310}], svg(`
    ${targetLabel(340, 930, '김승원 의원', 0, RED, 39)}
    ${targetLabel(960, 902, '국회 본회의장', 0, BLUE, 35)}
    ${footer('출처 후보 · 국회 공식 프로필 사진 / 본회의 영상은 시간코드·원문 검증용')}
  `), [rearWall, podium, kim]));
  frames.push(await writeFrame(familyRoot, 'SH003-A03-issue', [...anchor,
    {input: kimPlate, left: 95, top: 320},
    {input: billPlate, left: 745, top: 500},
    {input: parkPlate, left: 1430, top: 335},
  ], svg(`
    ${targetLabel(305, 934, '김승원 의원', 0, RED, 35)}
    ${targetLabel(960, 934, '형사소송법 일부개정법률안', 0, INK, 38)}
    ${targetLabel(1630, 934, '박형수 의원', 0, BLUE, 35)}
    ${footer('출처 후보 · 국회 공식 프로필 / 의안 2220257 · 권리 검토 전 스타일 프레임')}
  `), [rearWall, podium, kim, park, bill]));
  const contact = await writeContact(familyRoot, 'assembly-editorial-v01', frames, ['A01 장소 anchor', 'A02 인물 누적', 'A03 법안·상대 인물 누적']);
  return writeManifest(familyRoot, {
    id: 'assembly-editorial-v01', reviewProfile: 'remotion-motion', representativeShots: ['SH003', 'SH003', 'SH003'], records: frames, contact,
    referenceBasis: ['raw/inbox/vox-style-claude-remotion-reference.mp4 00:06–00:12 shared-background cumulative collage', 'wiki/sources/mo-sidd-remotion-production-series.md §2–§6'],
    sourceBoundary: 'Official profile photos remain rights-review-required. The chamber structure is a designed spatial anchor and must not be represented as an official video frame.',
  });
}

async function buildDesignedProcessAssets(inputRoot) {
  await mkdir(inputRoot, {recursive: true});
  const assets = {
    account: svg(`<rect x="35" y="35" width="330" height="250" rx="12" fill="${PAPER}" stroke="${BLUE}" stroke-width="7"/><circle cx="95" cy="105" r="28" fill="${BLUE}"/><line x1="145" y1="94" x2="320" y2="94" stroke="${INK}" stroke-width="12"/><line x1="72" y1="170" x2="328" y2="170" stroke="${MUTED}" stroke-width="8"/><line x1="72" y1="215" x2="270" y2="215" stroke="${MUTED}" stroke-width="8"/>`, 400, 320),
    cctv: svg(`<path d="M55 85 L300 38 L330 168 L82 212 Z" fill="${PAPER}" stroke="${INK}" stroke-width="8"/><circle cx="274" cy="104" r="38" fill="${BLUE}" stroke="${INK}" stroke-width="8"/><path d="M120 218 L250 218 L290 280 L80 280 Z" fill="${MUTED}"/>`, 390, 320),
    parcel: svg(`<path d="M55 105 L195 35 L335 105 L195 182 Z" fill="#d8ad71" stroke="${INK}" stroke-width="7"/><path d="M55 105 L55 250 L195 320 L195 182 Z" fill="#c89253" stroke="${INK}" stroke-width="7"/><path d="M335 105 L335 250 L195 320 L195 182 Z" fill="#b87f43" stroke="${INK}" stroke-width="7"/>`, 390, 350),
    result: svg(`<path d="M35 70 L215 20 L365 105 L185 165 Z" fill="#f5ead7" stroke="${INK}" stroke-width="7"/><path d="M35 70 L35 250 L185 335 L185 165 Z" fill="#d6b98b" stroke="${INK}" stroke-width="7"/><path d="M365 105 L365 285 L185 335 L185 165 Z" fill="#c69e67" stroke="${INK}" stroke-width="7"/><path d="M105 170 L170 230 L290 120" fill="none" stroke="${TEAL}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`, 400, 360),
  };
  const outputs = {};
  for (const [key, body] of Object.entries(assets)) {
    const file = path.join(inputRoot, `${key}.png`);
    await sharp(body).png().toFile(file);
    outputs[key] = file;
  }
  return outputs;
}

async function buildProcessFamily() {
  const familyRoot = path.join(outputRoot, 'process-route-editorial-v01');
  const inputRoot = path.join(familyRoot, 'input', 'assets');
  const designed = await buildDesignedProcessAssets(inputRoot);
  const prosecutor = path.join(sh006Root, 'sh006-prosecutor.png');
  const police = path.join(sh006Root, 'sh006-police-building.png');
  const request = path.join(sh006Root, 'sh006-request-sheet.png');
  const prosecutorPlate = await preparedImage(prosecutor, {width: 420, height: 610});
  const policePlate = await preparedImage(police, {width: 530, height: 520});
  const requestPlate = await preparedImage(request, {width: 365, height: 430, rotate: -4});
  const accountPlate = await preparedImage(designed.account, {width: 320});
  const cctvPlate = await preparedImage(designed.cctv, {width: 320});
  const parcelPlate = await preparedImage(designed.parcel, {width: 300});
  const resultPlate = await preparedImage(designed.result, {width: 330});
  const frames = [];
  frames.push(await writeFrame(familyRoot, 'SH019-P01-converge', [
    {input: accountPlate, left: 110, top: 260}, {input: cctvPlate, left: 250, top: 570}, {input: parcelPlate, left: 1260, top: 540}, {input: requestPlate, left: 770, top: 285},
  ], svg(`
    <path d="M420 390 C620 370 690 390 805 470" fill="none" stroke="${RED}" stroke-width="9" marker-end="url(#arrowRed)"/>
    <path d="M560 700 C680 650 720 610 815 560" fill="none" stroke="${RED}" stroke-width="9" marker-end="url(#arrowRed)"/>
    <path d="M1260 675 C1120 650 1060 610 1015 565" fill="none" stroke="${RED}" stroke-width="9" marker-end="url(#arrowRed)"/>
    ${targetLabel(270, 608, '계좌', 0, BLUE, 34)}${targetLabel(410, 922, 'CCTV', 0, BLUE, 34)}${targetLabel(1410, 900, '배송 기록', 0, BLUE, 34)}${targetLabel(952, 830, '구체적 요구서', 0, RED, 42)}
    ${footer('설명 도식 · 계좌·CCTV·배송 기록처럼 확인 대상을 요구서로 모음')}
  `), [designed.account, designed.cctv, designed.parcel, request]));
  frames.push(await writeFrame(familyRoot, 'SH030-P02-transfer', [
    {input: prosecutorPlate, left: 105, top: 260}, {input: requestPlate, left: 780, top: 310}, {input: policePlate, left: 1270, top: 285},
  ], svg(`
    <path d="M520 555 C690 500 760 500 840 530" fill="none" stroke="${RED}" stroke-width="10" marker-end="url(#arrowRed)"/>
    <path d="M1060 535 C1170 500 1250 500 1340 530" fill="none" stroke="${TEAL}" stroke-width="10" marker-end="url(#arrowTeal)"/>
    ${targetLabel(315, 930, '검사', 0, RED, 38)}${targetLabel(952, 830, '보완수사요구', 0, INK, 40)}${targetLabel(1535, 900, '수사기관', 0, BLUE, 38)}
    ${footer('관계 설명 · 검사 → 구체적 요구서 → 수사기관')}
  `), [prosecutor, request, police]));
  frames.push(await writeFrame(familyRoot, 'SH048-P03-summary', [
    {input: prosecutorPlate, left: 85, top: 280}, {input: requestPlate, left: 790, top: 320}, {input: policePlate, left: 1265, top: 255}, {input: resultPlate, left: 1420, top: 610},
  ], svg(`
    <path d="M505 430 C690 300 1130 300 1350 430" fill="none" stroke="${RED}" stroke-width="12" stroke-dasharray="28 18"/>
    <path d="M785 245 L1125 555" stroke="${RED}" stroke-width="22"/><path d="M1125 245 L785 555" stroke="${RED}" stroke-width="22"/>
    <path d="M515 640 C670 610 760 590 830 560" fill="none" stroke="${TEAL}" stroke-width="11" marker-end="url(#arrowTeal)"/>
    <path d="M1065 555 C1190 550 1260 530 1350 520" fill="none" stroke="${TEAL}" stroke-width="11" marker-end="url(#arrowTeal)"/>
    ${targetLabel(320, 940, '검사', 0, RED, 36)}${targetLabel(960, 850, '구체적 요구', 0, TEAL, 40)}${targetLabel(1525, 905, '확인 결과', 0, BLUE, 36)}
    ${footer('최종 관계 · 직접 확인 경로는 닫히고 구체적 요구→확인 결과 경로는 남음')}
  `), [prosecutor, request, police, designed.result]));
  const contact = await writeContact(familyRoot, 'process-route-editorial-v01', frames, ['P01 항목이 요구서로', 'P02 기관 간 전달', 'P03 삭제/존속 경로']);
  return writeManifest(familyRoot, {
    id: 'process-route-editorial-v01', reviewProfile: 'remotion-motion', representativeShots: ['SH019', 'SH030', 'SH048'], records: frames, contact,
    referenceBasis: ['raw/inbox/mo-sidd-remotion/Y6mOBK5peDU/Y6mOBK5peDU.en.vtt 03:14 onward', 'wiki/sources/mo-sidd-remotion-production-series.md §5–§7'],
    sourceBoundary: 'Designed props explain relationships and never substitute for LAW-1972 evidence. Role/building cutouts are reconstruction assets, not actual people or event footage.',
  });
}

async function buildTimeAssets(inputRoot) {
  await mkdir(inputRoot, {recursive: true});
  const calendar = svg(`<rect x="30" y="60" width="540" height="430" rx="18" fill="${PAPER}" stroke="${INK}" stroke-width="8"/><rect x="30" y="60" width="540" height="95" rx="18" fill="${RED}"/><circle cx="145" cy="60" r="20" fill="${INK}"/><circle cx="455" cy="60" r="20" fill="${INK}"/>${text(300, 132, '한 달', 58, '#fff', 900, 'middle')}${Array.from({length: 5}, (_, row) => Array.from({length: 7}, (_, col) => `<rect x="${72 + col * 68}" y="${190 + row * 55}" width="42" height="32" rx="4" fill="${row === 4 && col > 1 ? '#d8cdbb' : '#fff'}" stroke="${MUTED}" stroke-width="3"/>`).join('')).join('')}`, 600, 540);
  const oct2 = svg(`<path d="M90 20 L500 20 L550 70 L550 480 L40 480 L40 70 Z" fill="${PAPER}" stroke="${INK}" stroke-width="8"/><rect x="40" y="70" width="510" height="105" fill="${BLUE}"/>${text(295, 145, '2026년', 46, '#fff', 900, 'middle')}${text(295, 310, '10월 2일', 88, RED, 900, 'middle')}${text(295, 405, '주요 규정 시행', 42, INK, 850, 'middle')}`, 600, 520);
  const folder = svg(`<path d="M30 100 L180 100 L230 45 L520 45 L570 100 L570 430 L30 430 Z" fill="#d5ad70" stroke="${INK}" stroke-width="8"/><path d="M30 145 L570 145" stroke="#9a6934" stroke-width="8"/>`, 600, 480);
  const outputs = {};
  for (const [key, body] of Object.entries({calendar, oct2, folder})) {
    const file = path.join(inputRoot, `${key}.png`);
    await sharp(body).png().toFile(file);
    outputs[key] = file;
  }
  return outputs;
}

async function buildTimeFamily() {
  const familyRoot = path.join(outputRoot, 'time-data-editorial-v01');
  const inputRoot = path.join(familyRoot, 'input', 'assets');
  const designed = await buildTimeAssets(inputRoot);
  const request = path.join(sh006Root, 'sh006-request-sheet.png');
  const requestPlate = await preparedImage(request, {width: 335, height: 390, rotate: -3});
  const calendarPlate = await preparedImage(designed.calendar, {width: 690});
  const datePlate = await preparedImage(designed.oct2, {width: 620, rotate: 2});
  const folderPlate = await preparedImage(designed.folder, {width: 400});
  const frames = [];
  frames.push(await writeFrame(familyRoot, 'SH024-T01-month', [
    {input: requestPlate, left: 130, top: 340}, {input: calendarPlate, left: 620, top: 215}, {input: folderPlate, left: 1390, top: 370},
  ], svg(`
    <path d="M470 555 C590 500 650 490 720 500" fill="none" stroke="${RED}" stroke-width="10" marker-end="url(#arrowRed)"/>
    <path d="M1285 505 C1370 500 1410 510 1450 530" fill="none" stroke="${TEAL}" stroke-width="10" marker-end="url(#arrowTeal)"/>
    ${targetLabel(300, 850, '요구받은 날', 0, RED, 36)}${targetLabel(960, 865, '한 달', 0, INK, 55)}${targetLabel(1590, 860, '결과 송부', 0, TEAL, 36)}
    ${footer('제197조의2 · 한 달은 피해 회복 기간이 아니라 결과 송부의 원칙적 기준')}
  `), [request, designed.calendar, designed.folder]));
  frames.push(await writeFrame(familyRoot, 'SH038-T02-effective-date', [
    {input: folderPlate, left: 180, top: 380}, {input: datePlate, left: 1140, top: 250},
  ], svg(`
    <line x1="500" y1="560" x2="1210" y2="560" stroke="${INK}" stroke-width="10"/>
    <circle cx="570" cy="560" r="24" fill="${RED}"/><circle cx="1150" cy="560" r="30" fill="${TEAL}"/>
    ${text(570, 645, '8월 4일 공포', 38, RED, 900, 'middle')}${text(1150, 645, '10월 2일 시행', 42, TEAL, 900, 'middle')}
    ${targetLabel(380, 870, '법률 제21857호', 0, BLUE, 34)}${targetLabel(1448, 850, '절차가 바뀌는 날', 0, INK, 38)}
    ${footer('법률 제21857호 부칙 · 공포일과 주요 규정 시행일을 분리')}
  `), [designed.folder, designed.oct2]));
  frames.push(await writeFrame(familyRoot, 'SH040-T03-transition', [
    {input: folderPlate, left: 180, top: 300}, {input: folderPlate, left: 430, top: 340}, {input: folderPlate, left: 680, top: 380}, {input: folderPlate, left: 930, top: 420},
  ], svg(`
    <rect x="900" y="300" width="440" height="440" fill="#efe7d9" fill-opacity="0.66" stroke="${RED}" stroke-width="10" stroke-dasharray="22 16"/>
    <line x1="1150" y1="785" x2="1710" y2="785" stroke="${RED}" stroke-width="14"/>
    <line x1="1150" y1="755" x2="1150" y2="815" stroke="${RED}" stroke-width="12"/><line x1="1710" y1="755" x2="1710" y2="815" stroke="${RED}" stroke-width="12"/>
    ${text(1430, 750, '최대 90일', 70, RED, 900, 'middle')}${targetLabel(1115, 865, '일부 전환기 사건', 0, INK, 40)}
    ${footer('부칙 제12조 · 모든 사건이 아니라 시행 당시 이미 수사 중인 일부 사건의 경과조치')}
  `), [designed.folder]));
  const contact = await writeContact(familyRoot, 'time-data-editorial-v01', frames, ['T01 한 달 기준', 'T02 공포/시행 분리', 'T03 90일 적용 범위']);
  return writeManifest(familyRoot, {
    id: 'time-data-editorial-v01', reviewProfile: 'remotion-motion', representativeShots: ['SH024', 'SH038', 'SH040'], records: frames, contact,
    referenceBasis: ['raw/inbox/mo-sidd-remotion/dv3ADYu74DE/dv3ADYu74DE.en.vtt', 'wiki/sources/mo-sidd-remotion-production-series.md §7'],
    sourceBoundary: 'Dates and durations are explanatory data objects and require exact source IDs in production. Designed calendar/folder assets do not replace the statutory text.',
  });
}

async function buildOmniFamily() {
  const familyRoot = path.join(outputRoot, 'omni-fiction-continuity-v01');
  const inputs = [
    path.join(historicOmniRoot, 'SH008', 'assets', 'start.png'),
    path.join(historicOmniRoot, 'SH011', 'assets', 'start.png'),
    path.join(historicOmniRoot, 'SH014', 'assets', 'start.png'),
  ];
  const frameIds = ['SH008-O01-payment', 'SH011-O02-wrong-item', 'SH014-O03-report'];
  const frames = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const image = await preparedImage(inputs[index], {width: WIDTH, height: HEIGHT, fit: 'cover'});
    frames.push(await writeFrame(familyRoot, frameIds[index], [{input: image, left: 0, top: 0}], svg(''), [inputs[index]]));
  }
  const contact = await writeContact(familyRoot, 'omni-fiction-continuity-v01', frames, ['O01 결제 행동', 'O02 다른 물건 확인', 'O03 신고 행동']);
  return writeManifest(familyRoot, {
    id: 'omni-fiction-continuity-v01', reviewProfile: 'omni-keyframe-input', representativeShots: ['SH008', 'SH011', 'SH014'], records: frames, contact,
    referenceBasis: ['wiki/sources/action-driven-ai-video-generation.md', 'wiki/syntheses/remotion-vox-production-playbook-v0.1.md Omni gate'],
    sourceBoundary: 'These are historical rejected-root stills reused only to review continuity, action readability, and no-overlay direction. They are not production keyframes and cannot unlock Omni video generation.',
  });
}

await mkdir(outputRoot, {recursive: true});
const manifests = [];
for (const build of [buildHookFamily, buildAssemblyFamily, buildProcessFamily, buildTimeFamily, buildOmniFamily]) manifests.push(await build());

const lawManifestPath = path.join(repoRoot, 'video', 'qa', 'style-frames', 'episode-001', 'SH006-editorial-v04', 'manifest.json');
const lawManifest = JSON.parse(await readFile(lawManifestPath, 'utf8'));
const pendingManifests = [lawManifest, ...(await Promise.all(manifests.map(async (record) => JSON.parse(await readFile(path.join(repoRoot, record.path), 'utf8')))))];
const boardPath = path.join(outputRoot, 'EP001-reference-style-family-review-board.png');
const boardContacts = pendingManifests.map((manifest) => ({path: path.join(repoRoot, manifest.contact.path), status: `PENDING USER PASS · ${manifest.candidate_id}`}));
const boardHeader = svg(`
  ${text(70, 70, 'EP001 · REFERENCE-BOUND VISUAL FAMILY GATE', 42, INK, 900)}
  ${text(70, 118, '텍스트 회전 규칙 정정으로 6계열 모두 사용자 PASS 전 전체 모션 확장 금지', 28, RED, 850)}
`, 1920, 150);
const boardRows = await Promise.all(boardContacts.map(async (record) => {
  const contact = await sharp(record.path).resize(1800, 488, {fit: 'fill'}).png().toBuffer();
  const status = svg(`<rect x="0" y="0" width="1800" height="44" fill="#172a34" fill-opacity="0.94"/>${text(1780, 32, record.status, 24, '#fff', 850, 'end')}`, 1800, 488);
  return sharp(contact).composite([{input: status, left: 0, top: 0}]).png().toBuffer();
}));
await sharp({create: {width: 1920, height: 150 + boardRows.length * 508 + 40, channels: 4, background: '#eee7da'}})
  .composite([
    {input: boardHeader, left: 0, top: 0},
    ...boardRows.map((input, index) => ({input, left: 60, top: 150 + index * 508})),
  ])
  .png({compressionLevel: 9})
  .toFile(boardPath);
const indexPath = path.join(outputRoot, 'family-index.json');
const index = {
  schema_version: 1,
  episode_id: 'episode-001',
  status: 'pending-user-review-for-six-families',
  production_visible: false,
  measured_reference_sample: {
    source: 'raw/inbox/vox-style-claude-remotion-reference.mp4',
    window: '00:00-00:40 sampled every 2 seconds',
    contact: 'video/qa/reference-study/vox-primary/opening-0-40s-2s-grid.png',
    observation: 'publication crop -> persistent physical object -> numeric object -> chart -> debt/map accumulation; this is a timing sample, not exact cut-boundary evidence',
  },
  superseded_style_direction: {
    candidate_id: 'SH006-editorial-v03',
    historical_only: true,
    reason: 'The user clarified that only text overlaid on a PNG surface may rotate; detached B01 labels must remain level.',
  },
  approved_existing_family: null,
  pending_families: [{path: rel(lawManifestPath), sha256: await sha256(lawManifestPath), candidate_id: lawManifest.candidate_id}, ...manifests],
  review_board: {
    path: rel(boardPath),
    sha256: await sha256(boardPath),
    dimensions: {width: 1920, height: 150 + boardRows.length * 508 + 40},
  },
  unlock_rule: 'All distinct visual families require exact user style-frame PASS before full-family motion expansion. This index grants no cut PASS, rights approval, active-root promotion, Omni video generation, or stage advance.',
};
await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({index: rel(indexPath), index_sha256: await sha256(indexPath), pending_families: manifests}, null, 2));
