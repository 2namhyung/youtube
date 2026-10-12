import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const plateRoot = path.join(repoRoot, 'video', 'qa', 'style-frames', 'episode-001', 'SH006-editorial-v01');
const previousRoot = path.join(repoRoot, 'video', 'qa', 'style-frames', 'episode-001', 'SH006-editorial-v02');
const root = path.join(repoRoot, 'video', 'qa', 'style-frames', 'episode-001', 'SH006-editorial-v03');
const inputRoot = path.join(plateRoot, 'input', 'imagegen');
const outputRoot = path.join(root, 'outputs');

const WIDTH = 1920;
const HEIGHT = 1080;
const FONT = 'Malgun Gothic, Noto Sans KR, sans-serif';
const SOURCE = '#405058';
const NAVY = '#172a34';
const BLUE = '#294f61';
const RED = '#9f3f35';
const TEAL = '#2f756e';

const definitions = `
  <defs>
    <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#1c2c34" flood-opacity="0.18"/>
    </filter>
  </defs>`;

function svg(body, width = WIDTH, height = HEIGHT) {
  return Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    ${definitions}
    <g font-family="${FONT}" text-rendering="geometricPrecision">${body}</g>
  </svg>`);
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function text({x, y, value, size, weight = 700, fill = NAVY, anchor = 'start', spacing = 0, opacity = 1}) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" fill-opacity="${opacity}" text-anchor="${anchor}" letter-spacing="${spacing}">${escapeXml(value)}</text>`;
}

function surface({angle, cx, cy, body}) {
  return `<g transform="rotate(${angle} ${cx} ${cy})">${body}</g>`;
}

function kicker({x, y, value, color = BLUE, ruleWidth = 76}) {
  return `<g>
    <line x1="${x}" y1="${y - 13}" x2="${x + ruleWidth}" y2="${y - 13}" stroke="${color}" stroke-width="7"/>
    ${text({x: x + ruleWidth + 20, y, value, size: 29, weight: 800, fill: color, spacing: -0.4})}
  </g>`;
}

function footer(value) {
  return `<g>
    <rect x="0" y="976" width="1920" height="104" fill="#efe7d9" fill-opacity="0.92"/>
    <line x1="92" y1="976" x2="1828" y2="976" stroke="#405058" stroke-opacity="0.24" stroke-width="2"/>
    ${text({x: 1828, y: 1033, value, size: 29, weight: 750, fill: SOURCE, anchor: 'end', spacing: -0.35})}
  </g>`;
}

const rotations = {
  B01: {
    quote: 0,
    suspectLabel: 1,
    factsLabel: 7,
    evidenceLabel: -3,
  },
  B03: {
    mainDocument: -0.5,
    amendmentPaper: -7,
  },
  B05: {
    deletedDocument: 0.8,
    requestCard: -10.5,
    retainedDocument: 0,
    policeLabel: 0,
  },
};

const overlays = {
  B01: svg(`
    ${kicker({x: 838, y: 112, value: '시행 전 · 형사소송법 제196조'})}
    ${text({x: 838, y: 202, value: '“검사는 범인, 범죄사실과 증거를', size: 55, weight: 850, fill: NAVY, spacing: -1.4})}
    ${text({x: 838, y: 279, value: '수사한다.”', size: 68, weight: 900, fill: RED, spacing: -1.8})}
    <line x1="838" y1="303" x2="1196" y2="303" stroke="${RED}" stroke-width="8"/>
    ${surface({angle: rotations.B01.suspectLabel, cx: 1000, cy: 752, body: text({x: 1000, y: 752, value: '범인', size: 34, weight: 850, fill: BLUE, anchor: 'middle'})})}
    ${surface({angle: rotations.B01.factsLabel, cx: 1344, cy: 752, body: text({x: 1344, y: 752, value: '범죄사실', size: 34, weight: 850, fill: BLUE, anchor: 'middle'})})}
    ${surface({angle: rotations.B01.evidenceLabel, cx: 1700, cy: 752, body: text({x: 1700, y: 752, value: '증거', size: 34, weight: 850, fill: BLUE, anchor: 'middle'})})}
    ${footer('출처 · 형사소송법 제196조 제1항(2026.10.2. 시행 전 조문)')}
  `),
  B03: svg(`
    ${surface({angle: rotations.B03.mainDocument, cx: 744, cy: 426, body: `
      ${kicker({x: 316, y: 222, value: '시행 전 제196조'})}
      ${text({x: 344, y: 414, value: '“검사는 범인, 범죄사실과 증거를', size: 50, weight: 800, fill: NAVY, spacing: -1.3})}
      ${text({x: 344, y: 487, value: '수사한다.”', size: 65, weight: 900, fill: NAVY, spacing: -1.7})}
      <line x1="344" y1="530" x2="1164" y2="530" stroke="${RED}" stroke-width="9"/>
    `})}
    ${surface({angle: rotations.B03.amendmentPaper, cx: 1642, cy: 548, body: `
      ${text({x: 1472, y: 414, value: '개정법', size: 29, weight: 850, fill: '#f8ead9', spacing: 0.4})}
      ${text({x: 1472, y: 505, value: '제196조를', size: 50, weight: 850, fill: '#fff7e8', spacing: -1})}
      ${text({x: 1472, y: 590, value: '삭제한다.', size: 72, weight: 900, fill: '#fff7e8', spacing: -2})}
      <line x1="1472" y1="626" x2="1812" y2="626" stroke="#f4d7c7" stroke-width="6"/>
      ${text({x: 1472, y: 682, value: '법률 제21857호', size: 27, weight: 750, fill: '#f8ead9'})}
    `})}
    ${footer('출처 · 법률 제21857호 「형사소송법 일부개정법률」')}
  `),
  B05: svg(`
    ${surface({angle: rotations.B05.deletedDocument, cx: 381, cy: 450, body: `
      ${text({x: 214, y: 322, value: '제196조', size: 44, weight: 850, fill: RED, spacing: -0.8})}
      ${text({x: 214, y: 425, value: '직접 수사', size: 64, weight: 900, fill: NAVY, spacing: -1.6})}
      ${text({x: 214, y: 532, value: '삭제', size: 88, weight: 900, fill: RED, spacing: -2.2})}
      <line x1="214" y1="564" x2="548" y2="564" stroke="${RED}" stroke-width="9"/>
    `})}
    ${surface({angle: rotations.B05.requestCard, cx: 884, cy: 705, body: text({x: 884, y: 705, value: '요구서', size: 30, weight: 850, fill: BLUE, anchor: 'middle'})})}
    ${surface({angle: rotations.B05.retainedDocument, cx: 1360, cy: 470, body: `
      ${text({x: 1188, y: 302, value: '제195조제2항', size: 40, weight: 850, fill: TEAL, spacing: -0.8})}
      ${text({x: 1188, y: 411, value: '보완수사요구', size: 54, weight: 900, fill: NAVY, spacing: -1.4})}
      ${text({x: 1188, y: 480, value: '재수사요구', size: 54, weight: 900, fill: NAVY, spacing: -1.4})}
      ${text({x: 1188, y: 598, value: '남음', size: 78, weight: 900, fill: TEAL, spacing: -2})}
      <line x1="1188" y1="629" x2="1515" y2="629" stroke="${TEAL}" stroke-width="9"/>
    `})}
    ${surface({angle: rotations.B05.policeLabel, cx: 1757, cy: 688, body: `
      <g filter="url(#softShadow)">
        <rect x="1654" y="658" width="206" height="60" rx="4" fill="${BLUE}"/>
        ${text({x: 1757, y: 701, value: '경찰', size: 32, weight: 900, fill: '#fff', anchor: 'middle'})}
      </g>
    `})}
    ${footer('형사소송법 개정문 · 제196조 삭제 / 제195조제2항의 보완수사요구·재수사요구 직무')}
  `),
};

const frames = [
  {id: 'B01', input: 'SH006-B01-role-plate.png', output: 'SH006-B01-editorial-layout-v03.png'},
  {id: 'B03', input: 'SH006-B03-deletion-plate.png', output: 'SH006-B03-editorial-layout-v03.png'},
  {id: 'B05', input: 'SH006-B05-summary-plate.png', output: 'SH006-B05-editorial-layout-v03.png'},
];

async function hashFile(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

await mkdir(outputRoot, {recursive: true});
const records = [];

for (const frame of frames) {
  const input = path.join(inputRoot, frame.input);
  const output = path.join(outputRoot, frame.output);
  await sharp(input)
    .resize(WIDTH, HEIGHT, {fit: 'cover'})
    .composite([{input: overlays[frame.id], top: 0, left: 0}])
    .png({compressionLevel: 9, adaptiveFiltering: true})
    .toFile(output);
  const mobile = path.join(outputRoot, frame.output.replace('.png', '-360x203.png'));
  await sharp(output).resize(360, 203, {fit: 'fill'}).png({compressionLevel: 9}).toFile(mobile);
  records.push({
    beat_id: frame.id,
    input: path.relative(repoRoot, input).replaceAll('\\', '/'),
    input_sha256: await hashFile(input),
    output: path.relative(repoRoot, output).replaceAll('\\', '/'),
    output_sha256: await hashFile(output),
    mobile: path.relative(repoRoot, mobile).replaceAll('\\', '/'),
    mobile_sha256: await hashFile(mobile),
    dimensions: {width: WIDTH, height: HEIGHT},
    surface_rotation_deg: rotations[frame.id],
  });
}

const thumbWidth = 600;
const thumbHeight = 338;
const contactWidth = 1920;
const contactHeight = 520;
const contactBackground = await sharp({
  create: {width: contactWidth, height: contactHeight, channels: 4, background: '#eee7da'},
}).png().toBuffer();
const contactLabels = svg(`
  ${text({x: 60, y: 62, value: 'SH006 · surface-aligned typography v03 · STYLE REVIEW ONLY', size: 32, weight: 900, fill: NAVY})}
  ${text({x: 60, y: 103, value: 'B01 대상별 미세 기울기', size: 23, weight: 800, fill: BLUE})}
  ${text({x: 660, y: 103, value: 'B03 문서 기준선 결속', size: 23, weight: 800, fill: RED})}
  ${text({x: 1260, y: 103, value: 'B05 카드 각도 결속', size: 23, weight: 800, fill: TEAL})}
`, contactWidth, contactHeight);
const thumbBuffers = await Promise.all(records.map((record) => sharp(path.join(repoRoot, record.output)).resize(thumbWidth, thumbHeight).png().toBuffer()));
const contact = path.join(outputRoot, 'SH006-editorial-layout-v03-contact.png');
await sharp(contactBackground)
  .composite([
    {input: contactLabels, top: 0, left: 0},
    {input: thumbBuffers[0], top: 132, left: 60},
    {input: thumbBuffers[1], top: 132, left: 660},
    {input: thumbBuffers[2], top: 132, left: 1260},
  ])
  .png({compressionLevel: 9})
  .toFile(contact);

const previousManifest = path.join(previousRoot, 'manifest.json');
const manifest = {
  schema_version: 1,
  episode_id: 'episode-001',
  shot_id: 'SH006',
  candidate_id: 'SH006-editorial-v03',
  supersedes_for_style_review: 'SH006-editorial-v02',
  status: 'pending-user-style-frame-review',
  review_scope: 'typography-composition-and-surface-registration-only',
  review_profile: 'remotion-motion',
  production_visible: false,
  user_style_frame_pass: false,
  user_cut_pass: false,
  rights_approved: false,
  omni_video_approved: false,
  stage_advanced: false,
  base_plate_generation: {
    mode: 'built-in image_gen',
    inherited_manifest: path.relative(repoRoot, previousManifest).replaceAll('\\', '/'),
    inherited_manifest_sha256: await hashFile(previousManifest),
    note: 'The text-free imagegen plates and V02 hierarchy are unchanged. V03 registers deterministic text groups to visible paper and object baselines.',
  },
  typography_source: 'raw/sources/episode-001-sh006-viewer-first-law-sources-2026-08-29.md §1–§2',
  layout_contract: {
    canvas: '1920x1080',
    safe_margin: {left: 92, right: 92, top: 74, bottom: 53},
    hierarchy: ['one focal quote or contrast', 'one context kicker', 'asset-bound short labels', 'source footer'],
    max_focal_lines: 2,
    no_explanatory_card: true,
    long_text_alignment: 'left',
    asset_label_alignment: 'below-center',
    surface_registration: 'rotate text group around its own surface anchor using the visible paper or object baseline',
    screen_chrome_rotation_deg: 0,
    mobile_reduction: '360x203',
  },
  frames: records,
  contact: {
    path: path.relative(repoRoot, contact).replaceAll('\\', '/'),
    sha256: await hashFile(contact),
    dimensions: {width: contactWidth, height: contactHeight},
  },
};

await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile(path.join(root, 'README.md'), `# SH006 editorial typography/layout style frames v03

- Status: pending user style-frame review
- Scope: B01, B03, B05 typography, composition, and surface-registration direction only
- Text-free imagegen plates and V02 hierarchy are unchanged
- Paper-bound text rotates around the visible paper baseline; screen-space quote and source chrome remain level
- Exact Korean legal text is composed deterministically from the official source lock
- Not a style PASS, cut PASS, production asset approval, rights approval, Omni approval, or stage advance
`, 'utf8');

console.log(JSON.stringify(manifest, null, 2));
