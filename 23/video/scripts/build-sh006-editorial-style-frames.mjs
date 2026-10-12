import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const root = path.join(repoRoot, 'video', 'qa', 'style-frames', 'episode-001', 'SH006-editorial-v01');
const inputRoot = path.join(root, 'input', 'imagegen');
const outputRoot = path.join(root, 'outputs');

const WIDTH = 1920;
const HEIGHT = 1080;
const FONT = 'Malgun Gothic, Noto Sans KR, sans-serif';

const prompts = {
  B01: `Use case: stylized-concept
Asset type: 16:9 premium editorial motion-graphics style frame for a Korean current-affairs explainer
Primary request: visualize the prosecutor's former investigation role as a sophisticated cut-paper editorial collage, suitable for an 8–10 minute YouTube documentary
Scene/backdrop: very subtle low-contrast ivory and warm beige checker paper background, soft paper fibers, generous breathing room
Subject: one non-identifiable Korean male prosecutor in his late 30s wearing a dark navy suit and burgundy tie, waist-up photographic cutout with clean paper edge, holding a thick kraft case folder; to his right only three evidence objects arranged as tactile photographic paper cutouts: a suspect silhouette portrait, an open case dossier, and a CCTV evidence photograph under a glass magnifier
Style/medium: premium magazine editorial collage, photorealistic subjects mixed with refined paper textures and restrained screenprint grain, museum-quality compositing, realistic soft shadows, not illustration
Composition/framing: 1920x1080 landscape; prosecutor is the single focal component occupying about 38 percent of frame on the left-center; evidence forms a clear horizontal investigation path to the right; reserve clean negative space along the upper-left and lower area for later typography
Lighting/mood: controlled soft studio light, serious but accessible, crisp subject separation
Color palette: ivory, sand beige, deep navy, muted brick red, desaturated teal
Constraints: absolutely no words, letters, numbers, logos, badges, UI, watermarks, captions, speech bubbles, icons, cartoon characters, emoji, flat vector art, glossy 3D clipart, excessive decoration; no more than one person`,
  B03: `Use case: stylized-concept
Asset type: 16:9 premium editorial motion-graphics style frame for a Korean current-affairs explainer
Primary request: visualize a criminal-procedure statute clause being deleted, as a dramatic but restrained editorial document composition
Scene/backdrop: very subtle low-contrast ivory and warm beige checker paper background with fine paper fibers
Subject: one oversized cream Korean legal-document sheet in close-up, occupying most of the frame, with realistic paper edge, faint embossed seal shapes and ruled legal-document structure but absolutely no legible writing; a clean empty two-line central text area reserved for exact typography later; a bold hand-painted muted brick-red deletion slash crosses only the left half, while a separate torn red amendment slip sits to the right with a large blank center for later exact Korean wording
Style/medium: high-end investigative journalism collage, analog paper archive photography, restrained screenprint grain, premium editorial art direction, realistic depth and shadows
Composition/framing: 1920x1080 landscape; document fills roughly 72 percent of canvas; central text-safe area is large and uncluttered; strong left-to-right reading flow; generous safe margins
Lighting/mood: soft directional desk light, authoritative and tactile rather than ominous
Color palette: ivory, warm paper beige, charcoal, muted brick red, tiny deep navy accents
Constraints: absolutely no words, letters, numbers, logos, seals with text, watermarks, UI, captions, cartoon imagery, clipart, glossy 3D; no people`,
  B05: {
    generation_prompt: `Use case: stylized-concept
Asset type: 16:9 premium editorial motion-graphics final-summary style frame for a Korean current-affairs explainer
Primary request: create a clear before-versus-after legal-role comparison in a sophisticated paper-collage scene, with one visual focal point and two large readable zones
Scene/backdrop: very subtle low-contrast ivory and warm beige checker paper background, refined paper fiber texture
Subject: left zone contains one large old cream law page with a torn lower corner and a restrained brick-red deletion mark; right zone contains one large newer cream-and-desaturated-teal law page connected by a tangible stamped request sheet and a single clean paper arrow to a realistic photographic cutout of a modern Korean police station; a small waist-up non-identifiable Korean prosecutor photographic cutout stands between the zones as the shared subject; all document faces have large blank text-safe areas and no writing
Style/medium: premium editorial news-explainer collage, photorealistic cutouts, analog print grain, tactile paper layers, consistent realistic shadows, sophisticated broadcast design
Composition/framing: 1920x1080 landscape; two equally weighted but spacious zones; left and right documents each occupy at least 28 percent of width; prosecutor is secondary and never blocks documents; reserve clean lower-center space under each zone for later labels
Lighting/mood: calm, clear, authoritative, visually balanced
Color palette: ivory, warm beige, deep navy, muted brick red on left, desaturated teal on right
Constraints: absolutely no words, letters, numbers, logos, watermarks, captions, UI, cartoon people, flat vector icons, emoji, glossy 3D clipart, clutter, tiny postage-stamp documents`,
    edit_prompt: `Use case: precise-object-edit
Asset type: 16:9 premium editorial motion-graphics style frame
Input images: Image 1 is the edit target
Primary request: remove only the police emblem, badge, flag details, antenna insignia, and every identifiable logo or institutional mark from the police-station building at the far right; replace them with plain matching stone facade and a simple blank deep-teal horizontal sign panel with no writing
Constraints: preserve the exact 16:9 composition, background, left old law page, red deletion strokes, central prosecutor, request sheet, arrow, right new law page, building geometry, lighting, shadows, paper texture, color palette, scale, and all blank text-safe areas; change nothing else; no words, letters, numbers, seals, logos, flags, watermarks, captions, or extra objects`,
  },
};

const definitions = `
  <defs>
    <filter id="paperShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#1c2c34" flood-opacity="0.22"/>
    </filter>
    <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#1c2c34" flood-opacity="0.2"/>
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

function text({x, y, value, size, weight = 700, fill = '#1c2c34', anchor = 'start', spacing = 0}) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${spacing}">${escapeXml(value)}</text>`;
}

function pill({x, y, width, label, fill, textFill = '#fff'}) {
  return `<g filter="url(#softShadow)">
    <rect x="${x}" y="${y}" width="${width}" height="54" rx="27" fill="${fill}"/>
    ${text({x: x + width / 2, y: y + 38, value: label, size: 27, weight: 800, fill: textFill, anchor: 'middle'})}
  </g>`;
}

const overlays = {
  B01: svg(`
    ${pill({x: 828, y: 74, width: 258, label: '형사소송법 제196조', fill: '#294f61'})}
    ${text({x: 828, y: 174, value: '검사가 직접 수사하던 근거', size: 58, weight: 900, fill: '#182a34', spacing: -1.7})}
    <line x1="828" y1="202" x2="1778" y2="202" stroke="#ad4d3f" stroke-width="8"/>
    ${text({x: 1000, y: 736, value: '범인', size: 38, weight: 900, fill: '#263f4b', anchor: 'middle'})}
    ${text({x: 1344, y: 736, value: '범죄사실', size: 38, weight: 900, fill: '#263f4b', anchor: 'middle'})}
    ${text({x: 1700, y: 736, value: '증거', size: 38, weight: 900, fill: '#263f4b', anchor: 'middle'})}
    <g filter="url(#paperShadow)">
      <rect x="786" y="806" width="1046" height="168" rx="8" fill="#f8f1df" fill-opacity="0.96" stroke="#d4c5a5" stroke-width="2"/>
      ${text({x: 1309, y: 874, value: '검사는 범인, 범죄사실과 증거를', size: 43, weight: 800, fill: '#192a34', anchor: 'middle', spacing: -0.8})}
      ${text({x: 1309, y: 932, value: '수사한다.', size: 43, weight: 900, fill: '#ad4d3f', anchor: 'middle'})}
    </g>
    ${text({x: 80, y: 1022, value: '출처  형사소송법 제196조 제1항 · 2026.10.2. 시행 전 조문', size: 25, weight: 700, fill: '#48565b'})}
  `),
  B03: svg(`
    ${pill({x: 318, y: 170, width: 250, label: '시행 전 제196조', fill: '#294f61'})}
    ${text({x: 760, y: 470, value: '검사는 범인, 범죄사실과 증거를', size: 49, weight: 800, fill: '#172a34', anchor: 'middle', spacing: -1})}
    ${text({x: 760, y: 542, value: '수사한다.', size: 54, weight: 900, fill: '#172a34', anchor: 'middle'})}
    <line x1="342" y1="580" x2="1185" y2="580" stroke="#ad4d3f" stroke-width="10"/>
    ${text({x: 760, y: 750, value: '검사의 수사 조문', size: 34, weight: 800, fill: '#5b6263', anchor: 'middle'})}
    ${pill({x: 1408, y: 350, width: 190, label: '개정법', fill: '#f4e9d4', textFill: '#9d3f34'})}
    ${text({x: 1645, y: 500, value: '제196조를', size: 54, weight: 900, fill: '#fff7e8', anchor: 'middle', spacing: -1})}
    ${text({x: 1645, y: 575, value: '삭제한다.', size: 64, weight: 900, fill: '#fff7e8', anchor: 'middle', spacing: -1.5})}
    <line x1="1476" y1="618" x2="1814" y2="618" stroke="#f5d8c8" stroke-width="5"/>
    ${text({x: 1645, y: 690, value: '법률 제21857호', size: 29, weight: 700, fill: '#f9e9d8', anchor: 'middle'})}
    ${text({x: 80, y: 1022, value: '출처  법률 제21857호 형사소송법 일부개정법률', size: 25, weight: 700, fill: '#48565b'})}
  `),
  B05: svg(`
    ${pill({x: 166, y: 216, width: 144, label: '삭제', fill: '#ad4d3f'})}
    ${text({x: 380, y: 370, value: '제196조', size: 68, weight: 900, fill: '#8f352e', anchor: 'middle'})}
    ${text({x: 380, y: 438, value: '검사의 수사 조문', size: 35, weight: 800, fill: '#313b3d', anchor: 'middle'})}
    <line x1="188" y1="482" x2="570" y2="482" stroke="#ad4d3f" stroke-width="7"/>
    ${text({x: 380, y: 596, value: '직접 수사 근거', size: 42, weight: 900, fill: '#8f352e', anchor: 'middle'})}
    ${text({x: 380, y: 652, value: '삭제', size: 50, weight: 900, fill: '#8f352e', anchor: 'middle'})}
    ${text({x: 884, y: 707, value: '요구서', size: 30, weight: 900, fill: '#294f61', anchor: 'middle'})}
    ${pill({x: 1122, y: 210, width: 174, label: '남음', fill: '#3d847c'})}
    ${text({x: 1370, y: 342, value: '제195조제2항', size: 54, weight: 900, fill: '#245f5a', anchor: 'middle'})}
    ${text({x: 1370, y: 462, value: '보완수사요구', size: 48, weight: 900, fill: '#172a34', anchor: 'middle'})}
    ${text({x: 1370, y: 528, value: '재수사요구', size: 48, weight: 900, fill: '#172a34', anchor: 'middle'})}
    <line x1="1176" y1="566" x2="1564" y2="566" stroke="#3d847c" stroke-width="7"/>
    ${text({x: 1370, y: 646, value: '요구 직무 존속', size: 42, weight: 900, fill: '#245f5a', anchor: 'middle'})}
    <g filter="url(#softShadow)">
      <rect x="1654" y="662" width="206" height="62" rx="4" fill="#294f61"/>
      ${text({x: 1757, y: 705, value: '경찰', size: 34, weight: 900, fill: '#fff', anchor: 'middle'})}
    </g>
    ${text({x: 80, y: 1022, value: '제196조는 삭제 · 보완수사요구와 재수사요구는 새 제195조제2항에 규정', size: 27, weight: 800, fill: '#36464c'})}
  `),
};

const frames = [
  {id: 'B01', input: 'SH006-B01-role-plate.png', output: 'SH006-B01-editorial-style-frame.png'},
  {id: 'B03', input: 'SH006-B03-deletion-plate.png', output: 'SH006-B03-editorial-style-frame.png'},
  {id: 'B05', input: 'SH006-B05-summary-plate.png', output: 'SH006-B05-editorial-style-frame.png'},
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
  ${text({x: 60, y: 66, value: 'SH006 · editorial style-frame review · NOT CUT PASS', size: 34, weight: 900, fill: '#172a34'})}
  ${text({x: 60, y: 104, value: 'B01 역할 설명', size: 24, weight: 800, fill: '#294f61'})}
  ${text({x: 660, y: 104, value: 'B03 제196조 삭제', size: 24, weight: 800, fill: '#ad4d3f'})}
  ${text({x: 1260, y: 104, value: 'B05 삭제·존속 요약', size: 24, weight: 800, fill: '#3d847c'})}
`, contactWidth, contactHeight).subarray(0);
const thumbBuffers = await Promise.all(records.map((record) => sharp(path.join(repoRoot, record.output)).resize(thumbWidth, thumbHeight).png().toBuffer()));
const contact = path.join(outputRoot, 'SH006-editorial-style-frames-contact.png');
await sharp(contactBackground)
  .composite([
    {input: contactLabels, top: 0, left: 0},
    {input: thumbBuffers[0], top: 132, left: 60},
    {input: thumbBuffers[1], top: 132, left: 660},
    {input: thumbBuffers[2], top: 132, left: 1260},
  ])
  .png({compressionLevel: 9})
  .toFile(contact);

const manifest = {
  schema_version: 1,
  episode_id: 'episode-001',
  shot_id: 'SH006',
  candidate_id: 'SH006-editorial-v01',
  status: 'pending-user-style-frame-review',
  review_scope: 'style-frame-direction-only',
  review_profile: 'remotion-motion',
  production_visible: false,
  user_cut_pass: false,
  rights_approved: false,
  omni_video_approved: false,
  stage_advanced: false,
  image_generation: {
    mode: 'built-in image_gen',
    purpose: 'editorial photographic plates only; exact Korean legal text is added deterministically after generation',
    ai_disclosure_required_if_promoted: true,
    prompts,
  },
  typography_source: 'raw/sources/episode-001-sh006-viewer-first-law-sources-2026-08-29.md §1–§2',
  frames: records,
  contact: {
    path: path.relative(repoRoot, contact).replaceAll('\\', '/'),
    sha256: await hashFile(contact),
    dimensions: {width: contactWidth, height: contactHeight},
  },
};

await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile(path.join(root, 'README.md'), `# SH006 editorial style frames v01\n\n- Status: pending user style-frame review\n- Scope: B01, B03, B05 visual-direction stills only\n- Not a cut PASS, production asset approval, rights approval, Omni approval, or stage advance\n- Exact Korean legal text is composed deterministically after image generation\n- Generated plates remain non-production QA inputs until separately approved and decomposed into independent assets\n`, 'utf8');

console.log(JSON.stringify(manifest, null, 2));
