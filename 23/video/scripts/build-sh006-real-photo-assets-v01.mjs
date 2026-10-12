import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const candidateRoot = path.join(repoRoot, 'video/qa/production-assets/episode-001/SH006-real-photo-v01');
const assetRoot = path.join(candidateRoot, 'assets');
const outputRoot = path.join(candidateRoot, 'outputs');
const previousBackground = path.join(repoRoot, 'video/qa/production-assets/episode-001/SH006-editorial-v01/background.png');
const WIDTH = 1920;
const HEIGHT = 1080;

const sourceDefinitions = [
  {
    id: 'person-real-cutout',
    file: 'data/raw/pexels-media/110/photo/pexels-7845378.jpg',
    output: 'sh006-person-real-cutout.png',
    sourcePage: 'https://www.pexels.com/ko-kr/photo/7845378/',
    creator: 'RDNE',
    license: 'Pexels license (verify current terms before publication)',
    attribution: 'Photo by RDNE on Pexels',
    assetKind: 'real-photo-cutout',
    semanticUse: 'fictional explanatory role only; not a real prosecutor or case participant',
    identityConstraint: 'generic adult woman; do not identify as a named public official',
  },
  {
    id: 'dossier-real-photo',
    file: 'data/raw/pexels-media/102/photo/pexels-4792288.jpg',
    output: 'sh006-dossier-real-photo.png',
    sourcePage: 'https://www.pexels.com/ko-kr/photo/4792288/',
    creator: 'Anete Lusina',
    license: 'Pexels license (verify current terms before publication)',
    attribution: 'Photo by Anete Lusina on Pexels',
    assetKind: 'real-photo-card',
    semanticUse: 'generic case-file/folder visual; not an actual case record',
    identityConstraint: 'no person identity or official record is implied',
  },
  {
    id: 'police-building-real-photo',
    file: 'data/raw/wikimedia/106/photo/wikimedia-3243833.jpg',
    output: 'sh006-police-building-real-photo.png',
    sourcePage: 'https://commons.wikimedia.org/wiki/File%3AKorean_National_Police_Agency_Building02.jpg',
    creator: 'Gohsuke Takama',
    license: 'CC BY 2.0',
    attribution: 'Korean National Police Agency Building02.jpg by Gohsuke Takama, CC BY 2.0, via Wikimedia Commons',
    assetKind: 'real-photo-card',
    semanticUse: 'actual Korean National Police Agency building context only; do not label as another institution',
    identityConstraint: 'building is an identifiable real institution; preserve attribution and context',
  },
  {
    id: 'legal-signing-real-photo',
    file: 'data/raw/pexels-media/104/photo/pexels-8730374.jpg',
    output: 'sh006-legal-signing-real-photo.png',
    sourcePage: 'https://www.pexels.com/ko-kr/photo/8730374/',
    creator: 'Mikhail Nilov',
    license: 'Pexels license (verify current terms before publication)',
    attribution: 'Photo by Mikhail Nilov on Pexels',
    assetKind: 'real-photo-card',
    semanticUse: 'generic legal-document signing illustration; not evidence of a named case',
    identityConstraint: 'do not infer signer identity, jurisdiction, or document contents',
  },
];

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const rel = (p) => path.relative(repoRoot, p).replaceAll(path.sep, '/');

async function inspect(bytes) {
  const metadata = await sharp(bytes).metadata();
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let zero = 0; let partial = 0; let opaque = 0;
  for (let i = 3; i < data.length; i += info.channels) {
    if (data[i] === 0) zero += 1;
    else if (data[i] === 255) opaque += 1;
    else partial += 1;
  }
  return { dimensions: { width: metadata.width, height: metadata.height }, alpha: { zero_pixels: zero, partial_pixels: partial, opaque_pixels: opaque } };
}

async function makePersonCutout(sourcePath, outputPath) {
  const resized = await sharp(sourcePath).resize({ width: 2400, withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = resized;
  const protectedPolygon = [
    [1110, 950], [1660, 950], [1680, 1285], [1110, 1285],
  ];
  const insidePolygon = (x, y) => {
    let inside = false;
    for (let i = 0, j = protectedPolygon.length - 1; i < protectedPolygon.length; j = i, i += 1) {
      const xi = protectedPolygon[i][0]; const yi = protectedPolygon[i][1];
      const xj = protectedPolygon[j][0]; const yj = protectedPolygon[j][1];
      const cross = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1) + xi);
      if (cross) inside = !inside;
    }
    return inside;
  };
  const bg = { r: data[0], g: data[1], b: data[2] };
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * info.channels;
      const dr = data[i] - bg.r; const dg = data[i + 1] - bg.g; const db = data[i + 2] - bg.b;
      const distance = Math.sqrt(dr * dr + dg * dg + db * db);
      const redLift = data[i] - data[i + 1];
      const blueLift = data[i + 2] - data[i + 1];
      const pinkBackdrop = redLift > 42 && blueLift > -10;
      const protectedBinder = insidePolygon(x, y);
      if (!protectedBinder) {
        if (pinkBackdrop) data[i + 3] = 0;
        else data[i + 3] = distance < 32 ? 0 : distance < 62 ? Math.round(((distance - 32) / 30) * 255) : 255;
      } else {
        data[i + 3] = 255;
      }
    }
  }
  await sharp(data, { raw: info }).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toFile(outputPath);
}

async function makePhotoCard(sourcePath, outputPath, extract) {
  await sharp(sourcePath).extract(extract).resize({ width: 1500, height: 900, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toFile(outputPath);
}

function svgLabel(title, subtitle, width = 460, height = 78) {
  const safe = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" rx="16" fill="#fffaf1" fill-opacity=".94"/><text x="24" y="32" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#243f4b">${safe(title)}</text><text x="24" y="58" font-family="Arial, sans-serif" font-size="16" fill="#755f4c">${safe(subtitle)}</text></svg>`);
}

async function makeContact(records, file, width, height) {
  const background = await sharp(previousBackground).resize(width, height, { fit: 'fill' }).png().toBuffer();
  const cardWidth = Math.floor(width / 2) - 70;
  const cardHeight = Math.floor(height / 2) - 90;
  const composites = [];
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    const card = await sharp(path.join(repoRoot, record.path)).resize(cardWidth, cardHeight, { fit: 'contain', background: { r: 255, g: 250, b: 241, alpha: 1 } }).png().toBuffer();
    const x = 38 + (i % 2) * (Math.floor(width / 2));
    const y = 80 + Math.floor(i / 2) * (Math.floor(height / 2));
    composites.push({ input: card, left: x, top: y });
    composites.push({ input: svgLabel(record.id, record.assetKind), left: x, top: y + cardHeight - 78 });
  }
  composites.push({ input: svgLabel('SH006 실사 자산 후보', '생성 AI 0 · pending-user-asset-review', Math.min(width - 76, 760), 62), left: 38, top: 12 });
  await sharp(background).composite(composites).png({ compressionLevel: 9 }).toFile(file);
}

await fs.mkdir(assetRoot, { recursive: true });
await fs.mkdir(outputRoot, { recursive: true });
const records = [];
for (const definition of sourceDefinitions) {
  const sourcePath = path.join(repoRoot, definition.file);
  const sourceBytes = await fs.readFile(sourcePath);
  const outputPath = path.join(assetRoot, definition.output);
  if (definition.id === 'person-real-cutout') {
    await makePersonCutout(sourcePath, outputPath);
  } else if (definition.id === 'dossier-real-photo') {
    await makePhotoCard(sourcePath, outputPath, { left: 1500, top: 0, width: 4516, height: 4016 });
  } else if (definition.id === 'police-building-real-photo') {
    await makePhotoCard(sourcePath, outputPath, { left: 120, top: 80, width: 1680, height: 1360 });
  } else {
    await makePhotoCard(sourcePath, outputPath, { left: 200, top: 160, width: 5600, height: 3800 });
  }
  const outputBytes = await fs.readFile(outputPath);
  const inspection = await inspect(outputBytes);
  records.push({
    ...definition,
    path: rel(outputPath),
    sourcePath: rel(sourcePath),
    sourceSha256: sha256(sourceBytes),
    sha256: sha256(outputBytes),
    source_path: rel(sourcePath),
    source_page: definition.sourcePage,
    source_sha256: sha256(sourceBytes),
    output_sha256: sha256(outputBytes),
    asset_kind: definition.assetKind,
    identity_constraints: definition.identityConstraint,
    semantic_use_constraints: definition.semanticUse,
    dimensions: inspection.dimensions,
    alpha: inspection.alpha,
    transformation: definition.id === 'person-real-cutout'
      ? 'deterministic resize to 2400px, solid-pink color-key alpha, protected binder polygon, alpha trim; no generative segmentation'
      : 'deterministic high-resolution crop and PNG transcode; opaque photo card retained because clean alpha isolation is not reliable',
    protected_regions: definition.id === 'person-real-cutout' ? ['same-pink binder polygon retained as opaque subject prop'] : [],
  });
}

const backgroundBytes = await fs.readFile(previousBackground);
const backgroundOutput = path.join(candidateRoot, 'background.png');
await sharp(backgroundBytes).resize(WIDTH, HEIGHT, { fit: 'fill' }).png().toFile(backgroundOutput);
const contactPath = path.join(outputRoot, 'SH006-real-photo-assets-contact.png');
const mobileContactPath = path.join(outputRoot, 'SH006-real-photo-assets-contact-360x203.png');
await makeContact(records, contactPath, WIDTH, HEIGHT);
await sharp(contactPath).resize(360, 203, { fit: 'fill' }).png({ compressionLevel: 9 }).toFile(mobileContactPath);

const outputs = [];
for (const outputPath of [backgroundOutput, contactPath, mobileContactPath]) {
  const bytes = await fs.readFile(outputPath);
  const meta = await inspect(bytes);
  outputs.push({ path: rel(outputPath), sha256: sha256(bytes), dimensions: meta.dimensions });
}

const manifest = {
  schema_version: 1,
  episode_id: 'episode-001',
  shot_id: 'SH006',
  candidate_id: 'SH006-real-photo-v01',
  status: 'pending-user-asset-review',
  review_profile: 'source-photo-treatment',
  production_authority: false,
  production_visible: false,
  generative_ai_used: false,
  user_cut_pass: false,
  rights_approved: false,
  omni_video_approved: false,
  source_policy: 'real-photo-only candidate; generated imagery and generative segmentation are prohibited',
  source_exclusions: [
    { media_id: '365', reason: 'excluded: creator self-identifies AI GENERATIVE; not used in this candidate' },
    { media_id: '366', reason: 'excluded: creator self-identifies AI GENERATIVE; not used in this candidate' },
  ],
  background: { path: rel(backgroundOutput), sha256: sha256(await fs.readFile(backgroundOutput)), dimensions: { width: WIDTH, height: HEIGHT }, fixed_editorial_background: true },
  assets: records,
  outputs: { contact: outputs[1], mobile: outputs[2] },
  review_constraints: [
    'A generic stock person may not be named or presented as a real official.',
    'The police building is the actual Korean National Police Agency building and must retain attribution.',
    'Opaque photo cards are intentional where a reliable transparent cutout is unavailable; no fake alpha is claimed.',
    'This candidate cannot enter cut PASS or production authority without human asset review and rights confirmation.',
  ],
};
manifest.manifest_sha256 = sha256(Buffer.from(JSON.stringify(manifest)));
await fs.writeFile(path.join(candidateRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await fs.writeFile(path.join(candidateRoot, 'README.md'), `# SH006 real-photo asset candidate v01\n\nThis is a non-generative, real-photo-only asset candidate. It is pending-user-asset-review and is not production authority.\n\n- generative_ai_used: false\n- production_authority: false\n- user_cut_pass: false\n- Source originals remain immutable under data/raw/.\n- The person PNG uses deterministic solid-pink color-key alpha with a protected polygon for the same-pink binder. The folder, building, and signing assets remain opaque PNG photo cards because a reliable alpha cutout would damage their photographic edges.\n- Rebuild with pnpm run video:build-sh006-real-photo-assets.\n\nSee manifest.json for source pages, creators, licenses, attributions, hashes, dimensions, transformations, semantic constraints, and exclusions.\n`, 'utf8');
console.log(JSON.stringify({ candidateRoot: rel(candidateRoot), assets: records.map((r) => ({ id: r.id, path: r.path, dimensions: r.dimensions, alpha: r.alpha })), outputs }, null, 2));
