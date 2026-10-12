import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const assetRoot = join(root, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v33-grok-cut001-reference-fixes-candidates');
const manifestPath = join(assetRoot, 'candidate-manifest-v1.json');
const reportPath = join(assetRoot, 'verifier-v1.json');
const ffmpeg = process.env.NEWSROOM_FFMPEG_PATH || 'C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffmpeg.exe';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fileHash = path => sha256(readFileSync(path));
const physical = file => {
  const path = join(assetRoot, file);
  if (!existsSync(path)) throw new Error(`missing: ${file}`);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`not physical: ${file}`);
  if (!realpathSync(path).startsWith(`${realpathSync(assetRoot)}\\`)) throw new Error(`escaped root: ${file}`);
  return { path, stat };
};
const inspect = (file, alphaRequired) => {
  const { path, stat } = physical(file); const bytes = readFileSync(path);
  if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') throw new Error(`invalid PNG: ${file}`);
  const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20); const colorType = bytes[25];
  if (width !== 1254 || height !== 1254 || (alphaRequired ? colorType !== 6 : ![2, 6].includes(colorType))) throw new Error(`geometry/color type mismatch: ${file}`);
  if (!alphaRequired) return { file, bytes: stat.size, sha256: sha256(bytes), width, height, pixelFormat: colorType === 6 ? 'rgba' : 'rgb', chromaKey: '#ff00ff' };
  const decoded = spawnSync(ffmpeg, ['-v', 'error', '-i', path, '-vf', 'alphaextract', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { encoding: null, maxBuffer: 4 * 1024 * 1024 });
  if (decoded.status !== 0 || decoded.stdout.length !== width * height) throw new Error(`alpha decode failed: ${file}`);
  const alpha = decoded.stdout; const corners = [alpha[0], alpha[width - 1], alpha[(height - 1) * width], alpha[alpha.length - 1]];
  if (corners.some(value => value !== 0)) throw new Error(`opaque corner: ${file}`);
  let foreground = 0; let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let index = 0; index < alpha.length; index++) if (alpha[index] > 0) { foreground++; const x = index % width; const y = Math.floor(index / width); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return { file, bytes: stat.size, sha256: sha256(bytes), width, height, pixelFormat: 'rgba', transparentCorners: true, foregroundFraction: Number((foreground / alpha.length).toFixed(6)), foregroundBounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } };
};

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.schema !== 'grok-cut001-reference-fixes-candidate-v1' || manifest.status !== 'qa-passed-human-approval-pending' || manifest.production?.approved !== false || manifest.humanApproval?.approved !== false || manifest.gates?.grokProvider !== false) throw new Error('candidate safety state drifted');
if (!Array.isArray(manifest.assets) || manifest.assets.length !== 2 || new Set(manifest.assets.map(asset => asset.assetId)).size !== 2) throw new Error('asset identity/count mismatch');
for (const asset of manifest.assets) {
  const freshChroma = inspect(asset.chroma.file, false); const freshAlpha = inspect(asset.alpha.file, true);
  if (JSON.stringify(freshChroma) !== JSON.stringify(asset.chroma) || JSON.stringify(freshAlpha) !== JSON.stringify(asset.alpha)) throw new Error(`asset inspection drift: ${asset.assetId}`);
  if (!asset.prompt || Object.values(asset.qa || {}).some(value => value !== true)) throw new Error(`asset prompt/QA missing: ${asset.assetId}`);
}
const phone = manifest.assets.find(asset => asset.assetId === 'prop-phone-intact-only-v1').alpha.foregroundBounds;
const marker = manifest.assets.find(asset => asset.assetId === 'scene-thin-scan-marker-v1').alpha.foregroundBounds;
if (phone.width / 1254 > 0.5 || phone.height / 1254 < 0.6 || marker.width / 1254 > 0.6 || marker.height / 1254 > 0.04) throw new Error('semantic occupancy gate failed');
const board = physical(manifest.humanReviewBoard.file);
if (fileHash(board.path) !== manifest.humanReviewBoard.sha256) throw new Error('review board drifted');
const sourceAdmission = resolve(root, manifest.sourceAdmission.relativePath);
if (fileHash(sourceAdmission) !== manifest.sourceAdmission.sha256) throw new Error('source admission drifted');
const report = { schema: 'grok-cut001-reference-fixes-verifier-v1', verified: true, productionApproved: false, humanApprovalPending: true, assetCount: 2, manifestSha256: fileHash(manifestPath), reviewBoardSha256: manifest.humanReviewBoard.sha256, verifierSourceSha256: fileHash(fileURLToPath(import.meta.url)), checks: ['physical-nonsymlink', 'contained-realpath', 'exact-hash', '1254-square-rgba', 'transparent-corners', 'nonempty-foreground', 'intact-phone-occupancy', 'thin-marker-occupancy', 'safe-gates'] };
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, reportSha256: fileHash(reportPath), ...report }, null, 2));
