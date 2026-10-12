import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const assetRoot = join(root, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v33-grok-cut001-reference-fixes-candidates');
const admission = join(root, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v32-grok-reference-assets-production-v1', 'production-admission-v1.json');
const manifestPath = join(assetRoot, 'candidate-manifest-v1.json');
const ffmpeg = process.env.NEWSROOM_FFMPEG_PATH || 'C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffmpeg.exe';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fileHash = path => sha256(readFileSync(path));
const containedPhysical = path => {
  if (!existsSync(path)) throw new Error(`missing file: ${path}`);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`not a physical file: ${path}`);
  const actual = realpathSync(path);
  const base = `${realpathSync(assetRoot)}\\`;
  if (!actual.startsWith(base)) throw new Error(`file escapes candidate root: ${path}`);
  return { stat, actual };
};
const inspectPng = (path, alphaRequired) => {
  const { stat } = containedPhysical(path);
  const bytes = readFileSync(path);
  if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') throw new Error(`invalid PNG: ${basename(path)}`);
  const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20); const colorType = bytes[25];
  if (width !== 1254 || height !== 1254 || (alphaRequired ? colorType !== 6 : ![2, 6].includes(colorType))) throw new Error(`PNG geometry/color type failed: ${basename(path)}`);
  if (!alphaRequired) return { file: basename(path), bytes: stat.size, sha256: sha256(bytes), width, height, pixelFormat: colorType === 6 ? 'rgba' : 'rgb', chromaKey: '#ff00ff' };
  const decoded = spawnSync(ffmpeg, ['-v', 'error', '-i', path, '-vf', 'alphaextract', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { encoding: null, maxBuffer: 4 * 1024 * 1024 });
  if (decoded.status !== 0 || decoded.stdout.length !== width * height) throw new Error(`alpha decode failed: ${basename(path)}`);
  const alpha = decoded.stdout;
  const corners = [alpha[0], alpha[width - 1], alpha[(height - 1) * width], alpha[alpha.length - 1]];
  if (corners.some(value => value !== 0)) throw new Error(`transparent corners required: ${basename(path)}`);
  let foreground = 0; let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let index = 0; index < alpha.length; index++) if (alpha[index] > 0) { foreground++; const x = index % width; const y = Math.floor(index / width); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  if (!foreground || maxX < minX || maxY < minY) throw new Error(`empty alpha foreground: ${basename(path)}`);
  return { file: basename(path), bytes: stat.size, sha256: sha256(bytes), width, height, pixelFormat: 'rgba', transparentCorners: true, foregroundFraction: Number((foreground / alpha.length).toFixed(6)), foregroundBounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } };
};

const assets = [
  {
    assetId: 'prop-phone-intact-only-v1', role: 'prop', chroma: 'intact-phone-only-chroma.png', alpha: 'intact-phone-only.png',
    prompt: 'Preserve only the approved intact phone identity as one unbroken isolated paper-cut phone on flat magenta chroma; no broken phone, cracks, UI, text, logo, hand, shadow or extra object.',
    qa: { oneSemanticObject: true, intactOnly: true, noReadableText: true, noLogo: true, paperCutContinuity: true },
  },
  {
    assetId: 'scene-thin-scan-marker-v1', role: 'marker', chroma: 'thin-scan-marker-chroma.png', alpha: 'thin-scan-marker.png',
    prompt: 'Create one narrow burgundy fibrous paper scan strip, about 52 percent canvas width and no more than 3.5 percent canvas height, on flat magenta chroma; never a card, banner, document or label.',
    qa: { oneSemanticObject: true, scanStripOnly: true, noReadableText: true, noLogo: true, paperCutContinuity: true },
  },
].map(asset => ({ ...asset, chroma: inspectPng(join(assetRoot, asset.chroma), false), alpha: inspectPng(join(assetRoot, asset.alpha), true) }));

if (assets[0].alpha.foregroundBounds.width / 1254 > 0.5 || assets[0].alpha.foregroundBounds.height / 1254 < 0.6) throw new Error('intact phone occupancy is unsuitable');
if (assets[1].alpha.foregroundBounds.width / 1254 > 0.6 || assets[1].alpha.foregroundBounds.height / 1254 > 0.04) throw new Error('scan marker is not thin enough');

const manifest = {
  schema: 'grok-cut001-reference-fixes-candidate-v1', status: 'qa-passed-human-approval-pending', projectId: 'research-6b1a8af9b4143acb', cutId: 'cut-001',
  sourceAdmission: { relativePath: relative(root, admission).replaceAll('\\', '/'), sha256: fileHash(admission) },
  supersedesForCut001Only: ['prop-phone-state-pair-alpha-v2', 'scene-marker-strip'],
  reason: ['provider selected the broken phone from a two-state reference', 'provider enlarged the former marker into a foreground panel'],
  assets,
  humanReviewBoard: { file: 'human-review-board-v1.png', sha256: fileHash(join(assetRoot, 'human-review-board-v1.png')) },
  humanApproval: { status: 'pending', approved: false }, production: { approved: false, privateOnly: true, public: false },
  gates: { grokProvider: false, render: false, upload: false, publication: false, stage07: false },
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ manifestPath, manifestSha256: fileHash(manifestPath), assetCount: assets.length, status: manifest.status }, null, 2));
