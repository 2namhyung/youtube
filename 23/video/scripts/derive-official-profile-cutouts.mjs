import {copyFile, mkdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Deterministic, non-generative derivative for official Assembly profile photos.
// Only the connected near-white border is made transparent; subject pixels are
// retained at source dimensions. Keep this algorithm versioned in metadata.
const ALGORITHM_VERSION = 'connected-border-alpha-v1';
// Park's official JPEG has a light-grey (#dde0e4) studio background; the
// connected-border test therefore uses 215, while chroma gating protects the
// neutral background from removing coloured subject pixels.
const WHITE_THRESHOLD = 215;
const WHITE_CHROMA_MAX = 18;

const root = process.cwd();
const qaRoot = path.join(root, 'video', 'qa', 'style-calibration', 'episode-001-sh003-assembly-set-v03');
const sourceRoot = path.join(root, 'data', 'raw', 'assembly-media');
const records = [
  {
    id: 'assembly-profile-kim-seung-won',
    input: path.join(sourceRoot, '14', 'naas-ATB59635-m-51.jpg'),
    sourcePhoto: path.join(qaRoot, 'source-photo', 'kim-seung-won-official.jpg'),
    output: path.join(qaRoot, 'assets', 'assembly-speaker-photo-kim-v01.png'),
    naasCd: 'ATB59635',
    graph: {photoNode: 429, membership: 51, person: 61, evidence: 4},
  },
  {
    id: 'assembly-profile-park-hyeong-soo',
    input: path.join(sourceRoot, '10', 'naas-6U243644-m-127.jpg'),
    sourcePhoto: path.join(qaRoot, 'source-photo', 'park-hyeong-soo-official.jpg'),
    output: path.join(qaRoot, 'assets', 'assembly-speaker-photo-park-v01.png'),
    naasCd: '6U243644',
    graph: {photoNode: 386, membership: 127, person: 138, evidence: 5},
  },
];

function nearWhite(data, index) {
  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];
  return r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD
    && Math.max(r, g, b) - Math.min(r, g, b) <= WHITE_CHROMA_MAX;
}

async function derive(record) {
  await mkdir(path.dirname(record.sourcePhoto), {recursive: true});
  await mkdir(path.dirname(record.output), {recursive: true});
  await copyFile(record.input, record.sourcePhoto);
  const {data: rgb, info} = await sharp(record.input).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const pixelCount = info.width * info.height;
  const connectedBorder = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  const enqueue = (x, y) => {
    const p = y * info.width + x;
    if (connectedBorder[p] || !nearWhite(rgb, p * 3)) return;
    connectedBorder[p] = 1;
    queue[tail++] = p;
  };
  for (let x = 0; x < info.width; x += 1) {
    enqueue(x, 0);
    enqueue(x, info.height - 1);
  }
  for (let y = 1; y < info.height - 1; y += 1) {
    enqueue(0, y);
    enqueue(info.width - 1, y);
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % info.width;
    const y = Math.floor(p / info.width);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < info.width && ny >= 0 && ny < info.height) enqueue(nx, ny);
      }
    }
  }

  const rgba = Buffer.alloc(pixelCount * 4);
  let transparentPixels = 0;
  let partialPixels = 0;
  let opaquePixels = 0;
  for (let p = 0; p < pixelCount; p += 1) {
    const rgbIndex = p * 3;
    const rgbaIndex = p * 4;
    rgba[rgbaIndex] = rgb[rgbIndex];
    rgba[rgbaIndex + 1] = rgb[rgbIndex + 1];
    rgba[rgbaIndex + 2] = rgb[rgbIndex + 2];
    if (connectedBorder[p]) {
      rgba[rgbaIndex + 3] = 0;
      transparentPixels += 1;
      continue;
    }
    // A one-pixel, conservative anti-halo feather only for bright edge pixels.
    const x = p % info.width;
    const y = Math.floor(p / info.width);
    let touchesBorder = false;
    for (let dy = -1; dy <= 1 && !touchesBorder; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < info.width && ny >= 0 && ny < info.height && connectedBorder[ny * info.width + nx]) {
          touchesBorder = true;
          break;
        }
      }
    }
    const luminance = 0.2126 * rgb[rgbIndex] + 0.7152 * rgb[rgbIndex + 1] + 0.0722 * rgb[rgbIndex + 2];
    const alpha = touchesBorder && luminance >= 220 ? 224 : 255;
    rgba[rgbaIndex + 3] = alpha;
    if (alpha === 255) opaquePixels += 1;
    else partialPixels += 1;
  }
  await sharp(rgba, {raw: {width: info.width, height: info.height, channels: 4}})
    .png({compressionLevel: 9, adaptiveFiltering: false})
    .toFile(record.output);
  const sourceHash = (await readFile(record.sourcePhoto)).toString('base64');
  return {record, width: info.width, height: info.height, alpha: {transparentPixels, partialPixels, opaquePixels}, sourceBytesBase64Length: sourceHash.length};
}

const results = [];
for (const record of records) results.push(await derive(record));
console.log(JSON.stringify({algorithm: ALGORITHM_VERSION, whiteThreshold: WHITE_THRESHOLD, whiteChromaMax: WHITE_CHROMA_MAX, results}, null, 2));
