import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const v02Root = path.join(repoRoot, 'video', 'qa', 'style-frames', 'episode-001', 'SH006-editorial-v02');
const v03Root = path.join(repoRoot, 'video', 'qa', 'style-frames', 'episode-001', 'SH006-editorial-v03');
const root = path.join(repoRoot, 'video', 'qa', 'style-frames', 'episode-001', 'SH006-editorial-v04');
const outputRoot = path.join(root, 'outputs');
const WIDTH = 1920;
const HEIGHT = 1080;

const frames = [
  {
    beat_id: 'B01',
    source: path.join(v02Root, 'outputs', 'SH006-B01-editorial-layout-v02.png'),
    output: 'SH006-B01-editorial-layout-v04.png',
    overlay_text: {
      on_png_surface: [],
      level: ['시행 전 · 형사소송법 제196조', '주 인용문', '범인', '범죄사실', '증거', '출처'],
    },
  },
  {
    beat_id: 'B03',
    source: path.join(v03Root, 'outputs', 'SH006-B03-editorial-layout-v03.png'),
    output: 'SH006-B03-editorial-layout-v04.png',
    overlay_text: {
      on_png_surface: [
        {target: 'main-document-png', rotation_deg: -0.5},
        {target: 'amendment-paper-png', rotation_deg: -7},
      ],
      level: ['출처'],
    },
  },
  {
    beat_id: 'B05',
    source: path.join(v03Root, 'outputs', 'SH006-B05-editorial-layout-v03.png'),
    output: 'SH006-B05-editorial-layout-v04.png',
    overlay_text: {
      on_png_surface: [
        {target: 'deleted-document-png', rotation_deg: 0.8},
        {target: 'request-card-png', rotation_deg: -10.5},
      ],
      level: ['제195조제2항 비교문', '경찰', '출처'],
    },
  },
];

const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const relative = (file) => path.relative(repoRoot, file).replaceAll('\\', '/');

await mkdir(outputRoot, {recursive: true});
const records = [];
for (const frame of frames) {
  const output = path.join(outputRoot, frame.output);
  await sharp(frame.source).png({compressionLevel: 9, adaptiveFiltering: true}).toFile(output);
  const mobile = path.join(outputRoot, frame.output.replace('.png', '-360x203.png'));
  await sharp(output).resize(360, 203, {fit: 'fill'}).png({compressionLevel: 9}).toFile(mobile);
  records.push({
    beat_id: frame.beat_id,
    inherited_review_frame: relative(frame.source),
    inherited_review_frame_sha256: await sha256(frame.source),
    output: relative(output),
    output_sha256: await sha256(output),
    mobile: relative(mobile),
    mobile_sha256: await sha256(mobile),
    dimensions: {width: WIDTH, height: HEIGHT},
    overlay_text: frame.overlay_text,
  });
}

const svg = (body, width, height) => Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><g font-family="Malgun Gothic, Noto Sans KR, sans-serif">${body}</g></svg>`);
const contactWidth = 1920;
const contactHeight = 520;
const contact = path.join(outputRoot, 'SH006-editorial-layout-v04-contact.png');
const thumbs = await Promise.all(records.map((record) => sharp(path.join(repoRoot, record.output)).resize(600, 338).png().toBuffer()));
await sharp({create: {width: contactWidth, height: contactHeight, channels: 4, background: '#eee7da'}})
  .composite([
    {input: svg('<text x="60" y="62" font-size="32" font-weight="900" fill="#172a34">SH006 · PNG 표면 결속 텍스트만 회전 · STYLE REVIEW ONLY</text><text x="60" y="103" font-size="23" font-weight="800" fill="#294f61">B01 독립 라벨 0°</text><text x="660" y="103" font-size="23" font-weight="800" fill="#9f3f35">B03 문서 PNG 위 조문만 표면각 상속</text><text x="1260" y="103" font-size="23" font-weight="800" fill="#2f756e">B05 문서·요구서 표면만 회전</text>', contactWidth, contactHeight), left: 0, top: 0},
    {input: thumbs[0], left: 60, top: 132},
    {input: thumbs[1], left: 660, top: 132},
    {input: thumbs[2], left: 1260, top: 132},
  ])
  .png({compressionLevel: 9})
  .toFile(contact);

const manifest = {
  schema_version: 1,
  episode_id: 'episode-001',
  shot_id: 'SH006',
  candidate_id: 'SH006-editorial-v04',
  supersedes_for_style_review: 'SH006-editorial-v03',
  supersession_reason: 'The clarified rule permits rotation only for text overlaid on and explicitly bound to a PNG surface. Detached labels and all other text remain level.',
  status: 'pending-user-style-frame-review',
  review_scope: 'typography-composition-and-png-surface-binding-only',
  review_profile: 'remotion-motion',
  production_visible: false,
  user_style_frame_pass: false,
  user_cut_pass: false,
  rights_approved: false,
  omni_video_approved: false,
  stage_advanced: false,
  typography_surface_contract_version: 1,
  typography_rotation_contract: {
    rotatable_text: 'runtime text physically overlaid on and explicitly bound to a named PNG surface',
    rotatable_placement: 'on-surface',
    non_surface_text_rotation_deg: 0,
    below_center_label_rotation_deg: 0,
    screen_space_text_rotation_deg: 0,
    example: 'SH006 B03 legal text over the document PNG',
  },
  provenance_note: 'B01 reuses the level-label V02 review frame. B03 and B05 reuse the approved V03 composition because their rotated text is placed on named PNG document/card surfaces. These are still flat style-review frames, never production motion inputs.',
  typography_source: 'raw/sources/episode-001-sh006-viewer-first-law-sources-2026-08-29.md §1–§2',
  frames: records,
  contact: {path: relative(contact), sha256: await sha256(contact), dimensions: {width: contactWidth, height: contactHeight}},
  prohibited_rules_post_cut_recheck: [
    'no-text-rotation-without-named-png-surface-and-on-surface-placement',
    'no-rotation-for-below-center-labels',
    'no-rotation-for-kicker-title-quote-or-source-chrome',
    'no-flat-composite-as-independent-motion-proof',
    'no-reading-hold-camera-or-document-motion',
    'no-unapproved-morph-or-scene-to-scene-claim',
    'no-omni-video-before-all-cut-pass',
    'no-source-ui-as-reading-screen',
  ],
};

await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile(path.join(root, 'README.md'), '# SH006 editorial typography/layout style frames v04\n\n- Status: pending user style-frame review\n- Only text overlaid on and explicitly bound to a PNG surface may inherit that PNG angle.\n- Detached below-center labels, kicker, title, quote, and source chrome remain level at 0 degrees.\n- SH006 B03 is the canonical positive example.\n- These files do not grant cut PASS, rights approval, Omni approval, or a stage advance.\n', 'utf8');
console.log(JSON.stringify(manifest, null, 2));
