import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const assetRoot = join(root, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v32-grok-reference-assets-v1');
const promptPack = join(root, 'production', 'newsroom', 'projects', 'research-6b1a8af9b4143acb.grok-multi-reference-prompt-pack-v2.md');
const masterRoot = join(root, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v32-paper-master-candidates');
const masterReadme = join(masterRoot, 'README.md');
const masterReviewBoard = join(masterRoot, 'human-review-board-v1', 'v32-master-review-board.png');
const masterSquareRoot = join(masterRoot, 'grok-square-v1');
const manifestPath = join(assetRoot, 'asset-manifest-v1.json');
const verifierPath = join(assetRoot, 'verifier-v1.json');
const ffmpeg = process.env.NEWSROOM_FFMPEG_PATH || 'C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffmpeg.exe';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const fileHash = path => sha256(readFileSync(path));
const mustPhysical = path => {
  if (!existsSync(path)) throw new Error(`missing file: ${path}`);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`not a physical file: ${path}`);
  return stat;
};
const decode = (path, args, expectedBytes) => {
  const result = spawnSync(ffmpeg, ['-v', 'error', '-i', path, ...args], {encoding: null, maxBuffer: 16 * 1024 * 1024});
  if (result.status !== 0) throw new Error(`ffmpeg decode failed for ${basename(path)}: ${String(result.stderr)}`);
  if (result.stdout.length !== expectedBytes) throw new Error(`decoded byte count mismatch for ${basename(path)}`);
  return result.stdout;
};
const inspectPng = (chromaPath, alphaPath) => {
  mustPhysical(chromaPath); mustPhysical(alphaPath);
  const header = readFileSync(alphaPath).subarray(0, 33);
  if (header.toString('hex', 1, 4) !== '504e47' || header.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`invalid PNG: ${alphaPath}`);
  const width = header.readUInt32BE(16); const height = header.readUInt32BE(20); const colorType = header[25];
  if (width !== height || width < 1024 || colorType !== 6) throw new Error(`alpha PNG contract failed: ${basename(alphaPath)}`);
  const alpha = decode(alphaPath, ['-vf', 'alphaextract', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], width * height);
  const cornerAlpha = [alpha[0], alpha[width - 1], alpha[(height - 1) * width], alpha[alpha.length - 1]];
  if (cornerAlpha.some(value => value !== 0)) throw new Error(`opaque corner: ${basename(alphaPath)}`);
  let transparent = 0; let opaque = 0; let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let i = 0; i < alpha.length; i++) {
    const value = alpha[i];
    if (value === 0) transparent++;
    if (value >= 245) { opaque++; const x = i % width; const y = Math.floor(i / width); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  }
  const transparentRatio = transparent / alpha.length; const opaqueRatio = opaque / alpha.length;
  if (transparentRatio < 0.15 || opaqueRatio < 0.002 || maxX <= minX || maxY <= minY) throw new Error(`empty or unextractable object: ${basename(alphaPath)}`);
  const sourceHeader = readFileSync(chromaPath).subarray(0, 33);
  const sourceWidth = sourceHeader.readUInt32BE(16); const sourceHeight = sourceHeader.readUInt32BE(20); const sourceColorType = sourceHeader[25];
  const rgb = decode(chromaPath, ['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], sourceWidth * sourceHeight * 3);
  const pixel = index => [rgb[index * 3], rgb[index * 3 + 1], rgb[index * 3 + 2]];
  const corners = [pixel(0), pixel(sourceWidth - 1), pixel((sourceHeight - 1) * sourceWidth), pixel(sourceWidth * sourceHeight - 1)];
  let sourceTransparentCorners = false;
  if (sourceColorType === 6) {
    const sourceAlpha = decode(chromaPath, ['-vf', 'alphaextract', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], sourceWidth * sourceHeight);
    sourceTransparentCorners = [sourceAlpha[0], sourceAlpha[sourceWidth - 1], sourceAlpha[(sourceHeight - 1) * sourceWidth], sourceAlpha[sourceAlpha.length - 1]].every(value => value === 0);
  }
  const magentaCorners = corners.every(([r, g, b]) => r >= 210 && g <= 60 && b >= 205 && Math.abs(r - b) <= 35);
  if (!sourceTransparentCorners && !magentaCorners) throw new Error(`source extraction background failed: ${basename(chromaPath)}`);
  return {width, height, pixelFormat: 'rgba', cornerAlpha, transparentRatio: Number(transparentRatio.toFixed(6)), opaqueRatio: Number(opaqueRatio.toFixed(6)), opaqueBounds: {x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1}};
};

const inspectMaster = (file, declaredSha256) => {
  const filePath = join(masterRoot, file); const stat = mustPhysical(filePath);
  if (fileHash(filePath) !== declaredSha256) throw new Error(`common master hash drift: ${file}`);
  const header = readFileSync(filePath).subarray(0, 33);
  if (header.toString('hex', 1, 4) !== '504e47' || header.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`invalid common master PNG: ${file}`);
  const width = header.readUInt32BE(16); const height = header.readUInt32BE(20); const colorType = header[25];
  if (width < 1024 || height < 1024) throw new Error(`common master resolution contract failed: ${file}`);
  const isolated = file.startsWith('character-') || file.startsWith('prop-');
  if (isolated && colorType !== 6) throw new Error(`isolated common master must be RGBA: ${file}`);
  let transparentCorners = null;
  if (isolated) {
    const alpha = decode(filePath, ['-vf', 'alphaextract', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], width * height);
    transparentCorners = [alpha[0], alpha[width - 1], alpha[(height - 1) * width], alpha[alpha.length - 1]].every(value => value === 0);
    if (!transparentCorners) throw new Error(`isolated common master has opaque corner: ${file}`);
  }
  const squarePath = join(masterSquareRoot, file); const squareStat = mustPhysical(squarePath); const squareHeader = readFileSync(squarePath).subarray(0, 33);
  const squareWidth = squareHeader.readUInt32BE(16); const squareHeight = squareHeader.readUInt32BE(20); const squareColorType = squareHeader[25];
  if (squareWidth !== 1254 || squareHeight !== 1254 || (isolated && squareColorType !== 6)) throw new Error(`Grok-square common master contract failed: ${file}`);
  let squareTransparentCorners = null;
  if (isolated) {
    const alpha = decode(squarePath, ['-vf', 'alphaextract', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], squareWidth * squareHeight);
    squareTransparentCorners = [alpha[0], alpha[squareWidth - 1], alpha[(squareHeight - 1) * squareWidth], alpha[alpha.length - 1]].every(value => value === 0);
    if (!squareTransparentCorners) throw new Error(`Grok-square common master has opaque corner: ${file}`);
  }
  return {file, bytes: stat.size, sha256: declaredSha256, width, height, pixelFormat: colorType === 6 ? 'rgba' : 'rgb', transparentCorners, grokSquare: {file: `grok-square-v1/${file}`, bytes: squareStat.size, sha256: fileHash(squarePath), width: squareWidth, height: squareHeight, pixelFormat: squareColorType === 6 ? 'rgba' : 'rgb', transparentCorners: squareTransparentCorners}};
};

const masterEntries = [...readFileSync(masterReadme, 'utf8').matchAll(/^\|[^|]+\|\s*`([^`]+\.png)`\s*\|\s*`([a-f0-9]{64})`\s*\|$/gmu)].map(match => inspectMaster(match[1], match[2]));
if (masterEntries.length !== 13 || new Set(masterEntries.map(entry => entry.file)).size !== 13) throw new Error(`expected 13 unique common masters, found ${masterEntries.length}`);
mustPhysical(masterReviewBoard);

const promptPackText = readFileSync(promptPack, 'utf8');
const expectedIds = [...new Set((promptPackText.match(/scene-[a-z0-9-]+/g) || []))].sort();
if (expectedIds.length !== 51) throw new Error(`expected 51 scene assets, found ${expectedIds.length}`);
const masterAliases = new Set(['teacher', 'records-office', 'phone', 'father', 'son', 'classroom', 'marker', 'investigator', 'male-colleague', 'female-colleague', 'home', 'connector', 'divider', 'civilian-male', 'civilian-female']);
const cutRows = [...promptPackText.matchAll(/^\|\s*(\d{2})\s*\|\s*([^|]+)\|/gm)].map(match => ({cutId: match[1], references: match[2].split(',').map(value => value.trim().replaceAll('`', ''))}));
if (cutRows.length !== 18 || new Set(cutRows.map(row => row.cutId)).size !== 18) throw new Error('expected 18 unique Grok cut upload packs');
const usedSceneIds = new Set();
for (const row of cutRows) {
  if (row.references.length < 2 || row.references.length > 7) throw new Error(`cut ${row.cutId} must upload 2-7 references`);
  if (new Set(row.references).size !== row.references.length) throw new Error(`cut ${row.cutId} has duplicate references`);
  for (const reference of row.references) {
    if (reference.startsWith('scene-')) usedSceneIds.add(reference);
    else if (!masterAliases.has(reference)) throw new Error(`cut ${row.cutId} has unknown master alias: ${reference}`);
  }
}
if (usedSceneIds.size !== expectedIds.length || expectedIds.some(assetId => !usedSceneIds.has(assetId))) throw new Error('cut upload packs do not cover every required scene asset exactly as an admitted ID set');

const build = () => {
  const assets = expectedIds.map(assetId => {
    const chromaPath = join(assetRoot, 'chroma', `${assetId}.png`);
    const alphaPath = join(assetRoot, 'final', `${assetId}.png`);
    const chromaStat = mustPhysical(chromaPath); const alphaStat = mustPhysical(alphaPath);
    return {assetId, role: 'grok-information-element', styleAuthority: 'paper-cut-keyframe-v1', generationMode: 'imagegen-chroma-or-native-alpha-to-square-v1', chroma: {file: `chroma/${assetId}.png`, bytes: chromaStat.size, sha256: fileHash(chromaPath)}, alpha: {file: `final/${assetId}.png`, bytes: alphaStat.size, sha256: fileHash(alphaPath), ...inspectPng(chromaPath, alphaPath)}, visualQa: {status: 'primary-agent-reviewed-pass', noReadableText: true, singleSemanticElement: true, noCompletedInfographic: true, paperCutStyle: true}};
  });
  if (new Set(assets.map(asset => asset.alpha.sha256)).size !== assets.length) throw new Error('duplicate alpha assets');
  const manifest = {schema: 'grok-multi-reference-scene-assets-v1', status: 'qa-passed-human-approval-pending', production: {approved: false, public: false}, projectId: 'research-6b1a8af9b4143acb', count: assets.length, commonMasterCandidateId: 'research-6b1a8af9b4143acb-v32-paper-master-candidates', commonMasterReadmeSha256: fileHash(masterReadme), commonMasterQa: {count: masterEntries.length, reviewBoardSha256: fileHash(masterReviewBoard), assets: masterEntries}, promptPackFile: basename(promptPack), promptPackSha256: fileHash(promptPack), contactSheet: {file: 'contact-sheet-51-alpha.png', sha256: fileHash(join(assetRoot, 'contact-sheet-51-alpha.png'))}, visualReview: {reviewer: 'primary-agent-visual-review-v1', limitation: 'not explicit human production approval', checked: ['semantic silhouette', 'paper-cut style', 'no readable generated text', 'no completed infographic', 'no people except abstract family token']}, assets};
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
};

const verify = () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.schema !== 'grok-multi-reference-scene-assets-v1' || manifest.count !== 51 || manifest.assets.length !== 51) throw new Error('manifest schema/count mismatch');
  if (manifest.status !== 'qa-passed-human-approval-pending' || manifest.production.approved !== false) throw new Error('unsafe approval state');
  if (manifest.promptPackSha256 !== fileHash(promptPack) || manifest.commonMasterReadmeSha256 !== fileHash(masterReadme)) throw new Error('authority drift');
  if (manifest.commonMasterQa?.count !== 13 || manifest.commonMasterQa.reviewBoardSha256 !== fileHash(masterReviewBoard) || JSON.stringify(manifest.commonMasterQa.assets) !== JSON.stringify(masterEntries)) throw new Error('common master QA drift');
  const seenIds = new Set(); const seenHashes = new Set();
  for (const asset of manifest.assets) {
    if (!expectedIds.includes(asset.assetId) || seenIds.has(asset.assetId)) throw new Error(`asset id mismatch: ${asset.assetId}`);
    seenIds.add(asset.assetId);
    const chromaPath = join(assetRoot, asset.chroma.file); const alphaPath = join(assetRoot, asset.alpha.file);
    if (asset.chroma.sha256 !== fileHash(chromaPath) || asset.alpha.sha256 !== fileHash(alphaPath)) throw new Error(`asset drift: ${asset.assetId}`);
    if (seenHashes.has(asset.alpha.sha256)) throw new Error(`duplicate alpha hash: ${asset.assetId}`); seenHashes.add(asset.alpha.sha256);
    const fresh = inspectPng(chromaPath, alphaPath);
    if (JSON.stringify(fresh) !== JSON.stringify({width: asset.alpha.width, height: asset.alpha.height, pixelFormat: asset.alpha.pixelFormat, cornerAlpha: asset.alpha.cornerAlpha, transparentRatio: asset.alpha.transparentRatio, opaqueRatio: asset.alpha.opaqueRatio, opaqueBounds: asset.alpha.opaqueBounds})) throw new Error(`inspection drift: ${asset.assetId}`);
  }
  const report = {schema: 'grok-multi-reference-scene-assets-verifier-v1', verified: true, commonMasterCount: masterEntries.length, assetCount: seenIds.size, manifestSha256: fileHash(manifestPath), promptPackSha256: fileHash(promptPack), commonMasterReviewBoardSha256: fileHash(masterReviewBoard), contactSheetSha256: fileHash(join(assetRoot, 'contact-sheet-51-alpha.png')), verifierSourceSha256: fileHash(fileURLToPath(import.meta.url)), productionApproved: false};
  writeFileSync(verifierPath, JSON.stringify(report, null, 2) + '\n');
  return report;
};

if (process.argv.includes('--verify')) console.log(JSON.stringify(verify(), null, 2));
else { build(); console.log(JSON.stringify(verify(), null, 2)); }
