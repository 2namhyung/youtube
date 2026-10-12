import {createHash} from 'node:crypto';
import {mkdir, cp, writeFile, readFile, access} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
if (!process.argv.includes('--historical-rejected-rebuild')) {
  throw new Error('Historical rejected builder is disabled. It cannot create an active EP001 root or Omni video reference.');
}
const assetsRoot = path.join(root, 'video', 'public', 'assets');
const cutsRoot = path.join(root, 'video', 'history', 'rejected-roots', 'episode-001', 'cuts');
const intakeRoot = path.join(root, 'video', 'source-intake', 'episode-001');
const templateBackground = path.join(assetsRoot, '_cut-template', 'background.png');

const cuts = [
  ['SH001', 18, 'omni', '중고 노트북 사기', 'fiction-case', ['SRC-AI-SH001', 'SRC-PROJECT-DIAGRAM'], '누가 다시 확인하지?'],
  ['SH002', 16, 'remotion', '법률 질문으로 전환', 'document', ['LAW-21857', 'LAW-196'], '제196조'],
  ['SH003', 18, 'remotion', '직접과 요구의 구분', 'split-route', ['LAW-196', 'LAW-1972'], '직접 ≠ 요구'],
  ['SH004', 18, 'remotion', '현재 절차의 큰 흐름', 'police-prosecutor', ['LAW-1972'], '현재 절차'],
  ['SH005', 18, 'remotion', '개정 전 직접 확인의 위치', 'missing-piece', ['LAW-196'], '개정 전'],
  ['SH006', 20, 'remotion', '공포와 시행의 시간축', 'calendar', ['LAW-21857'], '2026.10.02'],
  ['SH007', 18, 'remotion', '제196조 삭제 원문', 'law-page', ['LAW-196'], '제196조 삭제'],
  ['SH008', 18, 'remotion', '삭제 범위의 경계', 'route-remaining', ['LAW-196', 'LAW-1972'], '남는 요구'],
  ['SH009', 20, 'remotion', '보완수사요구가 남는다', 'request-route', ['LAW-1972'], '보완수사요구'],
  ['SH010', 18, 'remotion', '구체적인 요구서', 'request-form', ['LAW-1972'], '이유 · 내용 · 자료'],
  ['SH011', 20, 'remotion', '1개월과 별도 기한', 'deadline', ['LAW-1972'], '기본 1개월'],
  ['SH012', 20, 'remotion', '불이행과 구제 절차', 'remedy-route', ['LAW-1973', 'LAW-245'], '요구 → 이행 → 구제'],
  ['SH013', 18, 'remotion', '사실확인과 재판 증거', 'evidence-stop', ['LAW-245'], '재판 증거 아님'],
  ['SH014', 20, 'remotion', '시행 전후 특례', 'transition-90', ['LAW-TRANS'], '진행 중 사건 · 90일'],
  ['SH015', 20, 'source-photo', '입법 결정의 시간순서', 'bill-photo', ['BILL-2220257'], '의안 2220257'],
  ['SH016', 20, 'source-photo', '실제 국회 청원 기록', 'petition-photo', ['PET-2200332'], '51,018명'],
  ['SH017', 20, 'remotion', '청원은 신호이지 결과가 아니다', 'signal-scale', ['PET-2200332', 'UNKNOWN-OUTCOME'], '우려 신호'],
  ['SH018', 24, 'remotion', '아직 모르는 네 가지', 'unknown-grid', ['UNKNOWN-OUTCOME'], '시행 후 확인'],
  ['SH019', 28, 'remotion', '전체 절차 다시 읽기', 'overview', ['LAW-196', 'LAW-1972', 'LAW-TRANS'], '전체 흐름'],
  ['SH020', 18, 'remotion', '판단을 남기는 엔드카드', 'end-card', ['LAW-21857', 'UNKNOWN-OUTCOME'], '10월 2일 시행 예정'],
];

const sourceFiles = {
  'SH002': ['assets/official-law-196-delete.png', path.join(intakeRoot, 'official', 'law-196-delete.png')],
  'SH007': ['assets/official-law-196-delete.png', path.join(intakeRoot, 'official', 'law-196-delete.png')],
  'SH015': ['assets/official-bill-2220257.png', path.join(intakeRoot, 'official', 'bill-2220257-full.png')],
  'SH016': ['assets/official-petition-2200332.png', path.join(intakeRoot, 'official', 'petition-2200332-minutes.png')],
};

const supportingSourceFiles = {
  'SH010': [['source-photo/official-law-197-2.png', path.join(intakeRoot, 'official', 'law-197-2-requirement-deadline.png'), 'LAW-1972']],
  'SH011': [['source-photo/official-law-197-2.png', path.join(intakeRoot, 'official', 'law-197-2-requirement-deadline.png'), 'LAW-1972']],
};

let sh001Source = ['omni/SH001-case-keyframe-v2.png', path.join(intakeRoot, 'ai', 'SH001-case-keyframe-v2.png')];
let sh001Final = ['omni/SH001-case-keyframe-v2.png', path.join(intakeRoot, 'ai', 'SH001-case-keyframe-v2.png')];

const colours = {ink: '#1c2733', teal: '#237d77', coral: '#d96c55', gold: '#c8943e', paper: '#fbf8f0', line: '#52636d', pale: '#e8ded0'};

function esc(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function svgWrap(content, background = 'none') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="${background}"/>${content}</svg>`;
}

function storyEvidenceSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="260" viewBox="0 0 1000 260">
    <g fill="none" stroke="#fffaf0" stroke-width="13" stroke-linecap="round" stroke-linejoin="round">
      <rect x="25" y="58" width="170" height="110" rx="12"/><path d="M10 192h200M58 192l18-24h70l18 24"/>
      <path d="M230 125h92m-30-28 30 28-30 28" stroke="#f2c77e"/>
      <path d="M355 85h190v115H355zM355 85l42-37h106l42 37M450 86v114"/><path d="M414 48l36 37 36-37" stroke="#f2c77e"/>
      <path d="M575 125h92m-30-28 30 28-30 28" stroke="#f2c77e"/>
      <rect x="700" y="38" width="120" height="190" rx="20"/><path d="M724 82h72M724 116h52M724 150h64"/>
      <path d="M858 72l112 112M970 72L858 184" stroke="#e27a64" stroke-width="18"/>
    </g>
  </svg>`;
}

function person(x, y, color, label) {
  return `<g transform="translate(${x} ${y})"><circle cx="0" cy="-92" r="52" fill="${color}"/><path d="M-92 170Q-88 8 0 0Q88 8 92 170Z" fill="${color}"/><path d="M-42 58Q0 22 42 58" fill="none" stroke="${colours.paper}" stroke-width="9" stroke-linecap="round"/><text x="0" y="232" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" font-weight="700" fill="${colours.ink}">${esc(label)}</text></g>`;
}

function fileIcon(x, y, scale = 1, fill = colours.paper, stroke = colours.ink) {
  return `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M-120-170h160l80 80v260h-240z" fill="${fill}" stroke="${stroke}" stroke-width="10"/><path d="M40-170v80h80" fill="none" stroke="${stroke}" stroke-width="10"/><path d="M-76-22h130M-76 32h130M-76 86h92" stroke="${stroke}" stroke-width="13" stroke-linecap="round"/></g>`;
}

function arrow(x1, y1, x2, y2, color = colours.teal, width = 14) {
  const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
  return `<g><path d="M${x1} ${y1}L${x2} ${y2}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/><path d="M${x2 - 24} ${y2 - 18}L${x2} ${y2}L${x2 - 24} ${y2 + 18}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" transform="rotate(${angle} ${x2} ${y2})"/></g>`;
}

function visualSvg(kind, keyword) {
  const c = colours;
  let content = '';
  if (kind === 'phone') {
    content = `<g transform="translate(810 450) rotate(-10)"><rect x="-170" y="-300" width="340" height="600" rx="40" fill="#202a34" stroke="${c.ink}" stroke-width="16"/><rect x="-135" y="-220" width="270" height="430" rx="20" fill="#d5e5e2"/><circle cx="0" cy="248" r="24" fill="#9db7b0"/><path d="M-70-80Q0-150 70-80M-70-20Q0-90 70-20" fill="none" stroke="${c.coral}" stroke-width="18" stroke-linecap="round"/></g><path d="M380 770Q450 430 700 520" fill="none" stroke="#d7a780" stroke-width="92" stroke-linecap="round"/><g transform="translate(400 760) rotate(-18)">${fileIcon(0,0,.62,'#fffaf0',c.coral)}</g><circle cx="1100" cy="180" r="72" fill="${c.gold}" opacity=".28"/><path d="M1100 120v120M1040 180h120" stroke="${c.gold}" stroke-width="18" stroke-linecap="round"/>`;
  } else if (kind === 'document' || kind === 'law-page') {
    content = `${fileIcon(640,470,1.7,'#fffdf5',c.ink)}<path d="M448 382h340M448 470h340M448 558h260" stroke="${c.teal}" stroke-width="22" stroke-linecap="round"/><circle cx="1120" cy="440" r="112" fill="none" stroke="${c.coral}" stroke-width="24"/><path d="M1058 440h124" stroke="${c.coral}" stroke-width="24" stroke-linecap="round"/>`;
  } else if (kind === 'split-route') {
    content = `${person(420,500,c.teal,'검사')} ${person(1180,500,c.coral,'경찰')}${fileIcon(800,455,.75,'#fffdf5',c.ink)}${arrow(530,440,700,440,c.coral)}${arrow(900,560,1070,560,c.teal)}<circle cx="800" cy="250" r="74" fill="${c.gold}" opacity=".25"/>`;
  } else if (kind === 'police-prosecutor') {
    content = `${person(360,490,c.coral,'경찰')} ${person(1240,490,c.teal,'검사')}<g transform="translate(800 450)">${fileIcon(0,0,1.05,'#fffdf5',c.ink)}</g>${arrow(520,430,660,430,c.teal)}<path d="M940 530H1080" stroke="${c.line}" stroke-width="15" stroke-dasharray="20 20"/>`;
  } else if (kind === 'missing-piece') {
    content = `${fileIcon(760,470,1.9,'#fffdf5',c.ink)}<path d="M620 264L760 150L900 264" fill="none" stroke="${c.coral}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/><circle cx="1080" cy="290" r="90" fill="${c.gold}" opacity=".2"/><path d="M1080 240v100M1080 380v8" stroke="${c.gold}" stroke-width="22" stroke-linecap="round"/>`;
  } else if (kind === 'calendar' || kind === 'transition-90') {
    content = `<g transform="translate(800 450)"><rect x="-285" y="-220" width="570" height="440" rx="28" fill="#fffdf5" stroke="${c.ink}" stroke-width="14"/><path d="M-285-100H285M-170-275v110M170-275v110" stroke="${c.ink}" stroke-width="18" stroke-linecap="round"/><circle cx="-120" cy="40" r="42" fill="${c.teal}"/><circle cx="0" cy="40" r="42" fill="${c.gold}"/><circle cx="120" cy="40" r="42" fill="${c.coral}"/><path d="M-160 140H160" stroke="${c.line}" stroke-width="17" stroke-linecap="round"/></g>`;
  } else if (kind === 'route-remaining' || kind === 'request-route' || kind === 'remedy-route') {
    content = `${person(380,500,c.teal,'검사')} ${person(1220,500,c.coral,'경찰')}${fileIcon(800,450,.8,'#fffdf5',c.ink)}${arrow(515,430,680,430,c.coral)}${arrow(920,565,1085,565,c.teal)}<path d="M530 640C700 780 900 780 1070 640" fill="none" stroke="${c.gold}" stroke-width="18" stroke-dasharray="24 24"/>`;
  } else if (kind === 'request-form') {
    content = `${fileIcon(800,450,1.7,'#fffdf5',c.ink)}<circle cx="1120" cy="315" r="40" fill="${c.coral}"/><circle cx="1120" cy="450" r="40" fill="${c.gold}"/><circle cx="1120" cy="585" r="40" fill="${c.teal}"/><path d="M1060 315H940M1060 450H940M1060 585H940" stroke="${c.line}" stroke-width="18" stroke-linecap="round"/>`;
  } else if (kind === 'deadline') {
    content = `<path d="M260 560H1340" stroke="${c.line}" stroke-width="22" stroke-linecap="round"/>${[340,610,880,1150].map((x, i) => `<circle cx="${x}" cy="560" r="${i === 1 ? 42 : 30}" fill="${[c.teal,c.gold,c.coral,c.ink][i]}"/>`).join('')}<path d="M340 430H610" stroke="${c.teal}" stroke-width="38" stroke-linecap="round"/><path d="M610 430H880" stroke="${c.gold}" stroke-width="38" stroke-linecap="round"/><path d="M880 430H1150" stroke="${c.coral}" stroke-width="38" stroke-linecap="round"/>`;
  } else if (kind === 'evidence-stop') {
    content = `${fileIcon(600,470,1.5,'#fffdf5',c.ink)}<path d="M930 250L1280 600" stroke="${c.coral}" stroke-width="34" stroke-linecap="round"/><path d="M1280 250L930 600" stroke="${c.coral}" stroke-width="34" stroke-linecap="round"/><path d="M1020 690h320" stroke="${c.line}" stroke-width="22" stroke-linecap="round"/>`;
  } else if (kind === 'bill-photo' || kind === 'petition-photo') {
    content = `<rect x="390" y="170" width="820" height="560" rx="28" fill="#fffdf5" stroke="${c.ink}" stroke-width="14"/><path d="M490 310h610M490 400h470M490 490h550M490 580h420" stroke="${c.line}" stroke-width="20" stroke-linecap="round"/><circle cx="1080" cy="250" r="62" fill="${c.teal}" opacity=".85"/><path d="M1048 250l24 24 44-54" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else if (kind === 'signal-scale') {
    content = `<path d="M800 230V690M540 360h520" stroke="${c.ink}" stroke-width="22" stroke-linecap="round"/><path d="M540 360L420 560H660zM1060 360L940 560h240z" fill="#fffdf5" stroke="${c.ink}" stroke-width="14"/><circle cx="540" cy="650" r="70" fill="${c.gold}" opacity=".8"/><circle cx="1060" cy="650" r="70" fill="${c.teal}" opacity=".8"/>`;
  } else if (kind === 'unknown-grid') {
    content = `${[0,1,2,3].map((i) => { const x = 470 + (i % 2) * 430; const y = 260 + Math.floor(i / 2) * 300; return `<circle cx="${x}" cy="${y}" r="100" fill="#fffdf5" stroke="${[c.coral,c.gold,c.teal,c.ink][i]}" stroke-width="18"/><path d="M${x-22} ${y+42}Q${x-62} ${y-80} ${x} ${y-82}Q${x+62} ${y-80} ${x+22} ${y+42}M${x} ${y+75}v4" fill="none" stroke="${[c.coral,c.gold,c.teal,c.ink][i]}" stroke-width="20" stroke-linecap="round"/>`; }).join('')}`;
  } else if (kind === 'overview') {
    content = `${person(270,520,c.coral,'경찰')}${person(1330,520,c.teal,'검사')}${fileIcon(800,440,.9,'#fffdf5',c.ink)}${arrow(410,420,690,420,c.teal)}${arrow(910,560,1190,560,c.gold)}<path d="M430 680C680 800 960 800 1210 680" fill="none" stroke="${c.coral}" stroke-width="18" stroke-dasharray="28 24"/>`;
  } else {
    content = `${fileIcon(800,450,1.7,'#fffdf5',c.ink)}<circle cx="800" cy="450" r="260" fill="none" stroke="${c.teal}" stroke-width="18" stroke-dasharray="32 18"/>`;
  }
  const label = kind === 'phone' ? '' : `<text x="800" y="820" text-anchor="middle" font-family="Arial,sans-serif" font-size="36" font-weight="700" fill="${c.ink}">${esc(keyword)}</text>`;
  return svgWrap(content + label);
}

function assetFileFor(shotId, mode, kind) {
  if (shotId === 'SH001') return sh001Source[0];
  if (shotId === 'SH002' || shotId === 'SH007') return 'assets/official-law-196-delete.png';
  if (shotId === 'SH015') return 'assets/official-bill-2220257.png';
  if (shotId === 'SH016') return 'assets/official-petition-2200332.png';
  return `assets/${kind}.png`;
}

function sourceRef(shotId, sourceIds) {
  const explicit = sourceFiles[shotId]?.[0];
  return explicit ?? `generated/${shotId}.svg`;
}

async function renderGeneratedAsset(target, kind, keyword) {
  await sharp(Buffer.from(visualSvg(kind, keyword))).png().toFile(target);
}

async function copyPrimarySourceAsset(shotId, source, target) {
  if (shotId === 'SH015') {
    const metadata = await sharp(source).metadata();
    const width = metadata.width ?? 1264;
    const height = Math.min(metadata.height ?? 900, 900);
    await sharp(source).extract({left: 0, top: 0, width, height}).png().toFile(target);
    return;
  }
  await cp(source, target, {force: true});
}

function manifestFor([shotId, seconds, mode, subject, kind, sourceIds, keyword], index) {
  const frames = seconds * 30;
  const assetId = `${shotId.toLowerCase()}-visual`;
  const file = assetFileFor(shotId, mode, kind);
  const mediaType = file.endsWith('.mp4') ? 'video/mp4' : 'image/png';
  const revealStart = 12;
  const revealEnd = Math.min(frames - 30, Math.max(36, Math.floor(frames * 0.42)));
  const transitionType = index === 0 ? 'match' : 'scene-to-scene';
  const next = cuts[index + 1]?.[0] ?? null;
  const transition = {
    type: transitionType,
    start_frame: Math.max(0, frames - 24),
    duration_frames: 24,
    continuity_asset_id: shotId === 'SH001' ? 'sh001-omni-final' : assetId,
    next_shot_id: next,
    continuity: next ? {
      relation: 'camera-state',
      outgoing_asset_ids: [shotId === 'SH001' ? 'sh001-omni-final' : assetId],
      incoming_asset_ids: [`${next.toLowerCase()}-visual`],
      outgoing_state: {x: 0, y: 0, scale: 1},
      incoming_state: {x: 0, y: 0, scale: 1},
    } : null,
  };
  const isOmni = mode === 'omni';
  const isSource = mode === 'source-photo';
  const assetList = shotId === 'SH001' && file.endsWith('.mp4')
    ? [
      {asset_id: 'sh001-omni-video', file, media_type: 'video/mp4', role: 'plate', z_index: 2, source_id: sourceIds[0] ?? null},
      {asset_id: 'sh001-omni-final', file: sh001Final[0], media_type: 'image/png', role: 'plate', z_index: 3, source_id: sourceIds[0] ?? null},
      {asset_id: 'sh001-story-evidence', file: 'assets/story-evidence.png', media_type: 'image/png', role: 'story-prop', z_index: 4, source_id: 'SRC-PROJECT-DIAGRAM'},
    ]
    : shotId === 'SH001'
      ? [
        {asset_id: assetId, file, media_type: mediaType, role: 'plate', z_index: 2, source_id: sourceIds[0] ?? null},
        {asset_id: 'sh001-story-evidence', file: 'assets/story-evidence.png', media_type: 'image/png', role: 'story-prop', z_index: 4, source_id: 'SRC-PROJECT-DIAGRAM'},
      ]
      : [{asset_id: assetId, file, media_type: mediaType, role: isSource ? 'document' : 'plate', z_index: 2, source_id: sourceIds[0] ?? null}];
  const finalAssetIds = assetList.map((asset) => asset.asset_id);
  const animations = shotId === 'SH001' ? assetList.map((asset) => ({
    animation_id: `${asset.asset_id}-reveal`,
    target_id: asset.asset_id,
    type: 'ease-move',
    start_frame: asset.asset_id === 'sh001-story-evidence' ? 260 : 12,
    end_frame: asset.asset_id === 'sh001-story-evidence' ? 290 : 40,
    from: {opacity: 0, scale: 0.96, y: 20},
    to: {opacity: 1, scale: 1, y: 0},
    easing: 'easeOutCubic',
  })) : finalAssetIds.map((targetId) => ({animation_id: `${targetId}-reveal`, target_id: targetId, type: 'ease-move', start_frame: revealStart, end_frame: revealEnd, from: {opacity: 0, scale: 0.92, y: 36}, to: {opacity: 1, scale: 1, y: 0}, easing: 'easeOutCubic'}));
  const lifecycleRevealEnd = shotId === 'SH001' ? 390 : revealEnd;
  return {
    schema_version: 1,
    episode_id: 'episode-001',
    shot_id: shotId,
    fps: 30,
    duration_frames: frames,
    claim_id: sourceIds[0] ?? null,
    visual_subject: subject,
    background: 'background.png',
    asset_directory: 'assets',
    production_mode: mode,
    voiceover: {audio: null, text: null, start_frame: 0, end_frame: null, word_cues: []},
    assets: assetList,
    animations,
    lifecycle: {
      background_only: {start_frame: 0, end_frame: revealStart, visible_asset_ids: [], visible_effect_ids: []},
      reveal: {start_frame: revealStart, end_frame: lifecycleRevealEnd},
      final_hold: {start_frame: lifecycleRevealEnd, end_frame: frames},
      final_visible_asset_ids: finalAssetIds,
      final_visible_effect_ids: [],
    },
    text_cues: shotId === 'SH001' ? [
      {cue_id: 'sh001-payment', text: '중고 노트북 · 70만원', kind: 'keyword', start_frame: 24, end_frame: 132},
      {cue_id: 'sh001-empty-box', text: '도착한 건 빈 상자', kind: 'keyword', start_frame: 120, end_frame: 246},
      {cue_id: 'sh001-seller-gone', text: '판매자는 잠적', kind: 'keyword', start_frame: 234, end_frame: 378},
      {cue_id: 'sh001-account-mismatch', text: '계좌 명의 불일치', kind: 'keyword', start_frame: 360, end_frame: frames},
      {cue_id: 'sh001-question', text: '누가 다시 확인하지?', kind: 'keyword', start_frame: 390, end_frame: frames},
    ] : [{cue_id: `${shotId.toLowerCase()}-keyword`, text: keyword, kind: 'keyword', start_frame: revealEnd - 18, end_frame: frames}],
    chart: null,
    effects: [],
    transition,
    source_ids: sourceIds,
    source_materials: (supportingSourceFiles[shotId] ?? []).map(([supportingFile, , sourceId]) => ({file: supportingFile, source_id: sourceId, role: 'verification-reference'})),
    ai_disclosure: isOmni ? 'AI 재구성 · 가상 사례' : null,
    review_state: 'asset-locked',
  };
}

await mkdir(cutsRoot, {recursive: true});
const background = await readFile(templateBackground);
for (const [index, cut] of cuts.entries()) {
  const [shotId, , mode, , kind, , keyword] = cut;
  const shotRoot = path.join(cutsRoot, shotId);
  for (const directory of ['assets', 'remotion', 'omni', 'source-photo', 'source-video', 'audio', 'preview']) await mkdir(path.join(shotRoot, directory), {recursive: true});
  await writeFile(path.join(shotRoot, 'background.png'), background);
  const source = shotId === 'SH001' ? sh001Source : sourceFiles[shotId];
  if (source) {
    await access(source[1]);
    await copyPrimarySourceAsset(shotId, source[1], path.join(shotRoot, source[0]));
    if (shotId === 'SH001') await cp(sh001Final[1], path.join(shotRoot, sh001Final[0]), {force: true});
  } else {
    await renderGeneratedAsset(path.join(shotRoot, 'assets', `${kind}.png`), kind, keyword);
  }
  if (shotId === 'SH001') await sharp(Buffer.from(storyEvidenceSvg())).png().toFile(path.join(shotRoot, 'assets', 'story-evidence.png'));
  for (const [supportingFile, supportingSource] of supportingSourceFiles[shotId] ?? []) {
    await access(supportingSource);
    await cp(supportingSource, path.join(shotRoot, supportingFile), {force: true});
  }
  const manifest = manifestFor(cut, index);
  await writeFile(path.join(shotRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(shotRoot, 'remotion', 'README.md'), `# ${shotId}\n\nRemotion cut asset package. The renderer loads manifest.json and this cut-local PNG.\n`);
}

const provenance = {
  episode_id: 'episode-001',
  generated_at: new Date().toISOString(),
  fixed_background: 'video/public/assets/_cut-template/background.png',
  source_intake: 'video/source-intake/episode-001',
  cuts: cuts.map(([shotId, seconds, mode, subject, kind, sourceIds, keyword], index) => ({shotId, seconds, mode, subject, kind, sourceIds, keyword, manifest: `cuts/${shotId}/manifest.json`, asset: `cuts/${shotId}/${assetFileFor(shotId, mode, kind)}`})),
  notes: ['SH001 is one disclosed fictional story: a job seeker pays for a used laptop, receives an empty box, loses contact with the seller, and notices an account-name mismatch. It never represents a real victim or case.', 'SH001 uses a project-created evidence-strip PNG over the imagegen/Gemini plate; the MP4 is muted in the silent master.', 'All other generated visual PNGs are project-created diagrams; they do not assert unknown post-implementation outcomes.', 'Official captures are copied from the source-intake package; raw and data/raw were not modified.', 'SH010 and SH011 retain the exact Article 197-2 capture as cut-local verification material.', 'SH015 renders a top-of-page display crop while preserving the full official capture in source-intake.'],
};
provenance.sha256 = createHash('sha256').update(JSON.stringify(provenance)).digest('hex');
await writeFile(path.join(path.dirname(cutsRoot), 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
// The historical builder never writes runtime modules. Runtime activation requires a new reviewed root.
console.log(`Built ${cuts.length} cut folders under ${path.relative(root, cutsRoot)}`);
