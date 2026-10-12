import { createHash } from 'node:crypto';
import { readFile, lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(import.meta.dirname, '..', '..', '..');
const studyRoot = path.join(workspace, '06-production', 'opencut-automation', 'out', 'studies', 'three-story-real-media-acquisition-v1');
const expectedTitles = ['Coffeecup.jpg', 'Coffee cup seen from above.jpg', 'Cellphone (Unsplash).jpg', 'CCTV cameras in Mumbai.jpg', 'Forensic tableau.JPG', 'Portable forensic tableau.JPG', 'Empty class room.jpg', 'Jeju District Court.JPG', 'Jeju Special Self-Governing Provincial Office of Education.JPG', 'Jeju police car.JPG', 'Jeju Dongbu Police Station.JPG', 'Supreme Court of Korea (2020).jpg', "Seoul Seobu Local Porsecutors' Office.jpg", 'Corridor on the second level - NÄL hospital 1.jpg', 'Corridor on the second level - NÄL hospital 3.jpg', 'Roundup Kanister B 2020 08.JPG', 'Jeonju Wansan Police Station Hyoja Police Box.jpg', 'Hospitals corridor.jpg', "Women's Surgical Ward Nlm nlmuid-101435911.jpg"];
const allowedBeatBindings = { '01-police-father': new Set(['01', '03', '04', '05', '06', '08', '09', '10', '11', '12', '13', '14', '16', '17', '19', '20']), '02-jeju-school-intrusion': new Set(['01', '02', '03', '05', '06', '07', '08', '09', '10', '11', '13', '15', '16', '18', '19', '20']), '03-nurse-pesticide-coffee': new Set(['01', '02', '04', '05', '06', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20']) };
const allowedLicenses = new Set(['cc0', 'public-domain', 'cc-by']);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const metadataValue = (extmetadata, key) => extmetadata?.[key]?.value ?? '';
const classifyLicense = (info) => {
  const em = info.extmetadata ?? {};
  const text = [metadataValue(em, 'LicenseShortName'), metadataValue(em, 'License'), metadataValue(em, 'UsageTerms'), metadataValue(em, 'Copyrighted')].join(' ').toLowerCase();
  const licenseUrl = String(metadataValue(em, 'LicenseUrl')).toLowerCase();
  if (/cc\s*0|creative commons zero/.test(text) || /creativecommons\.org\/publicdomain\/zero/.test(licenseUrl)) return 'cc0';
  if (/public domain|pd-old|pd-us|pd-self|publicdomain/.test(text) || /publicdomain/.test(licenseUrl)) return 'public-domain';
  if (/cc\s*by(?!-?(?:sa|nd|nc))\b/.test(text) || /creativecommons\.org\/licenses\/by(?:\/|$)/.test(licenseUrl)) return 'cc-by';
  if (/cc\s*by[-\s]*(?:sa|nd|nc)|non[-\s]?commercial|no derivatives|all rights reserved|trademark|logo/.test(text)) return 'conditional';
  return 'uncertain';
};
const fail = (errors, message) => errors.push(message);
const isInside = (root, target) => {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
const hostAllowed = (value, media = false) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (media ? url.hostname === 'upload.wikimedia.org' : url.hostname === 'commons.wikimedia.org');
  } catch { return false; }
};
const dimensions = (bytes, mime) => {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes.subarray(0, 6).toString() === 'GIF89a' || bytes.subarray(0, 6).toString() === 'GIF87a') return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' && bytes.subarray(12, 16).toString() === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  if (mime === 'image/jpeg' || bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1]; offset += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(offset);
      if (marker >= 0xc0 && marker <= 0xc3 || marker >= 0xc5 && marker <= 0xc7 || marker >= 0xc9 && marker <= 0xcb || marker >= 0xcd && marker <= 0xcf) return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
      offset += length;
    }
  }
  return null;
};
const physical = async (runDir, relative, errors, label) => {
  if (!relative || path.isAbsolute(relative) || relative.includes('..')) { fail(errors, `${label}: unsafe path`); return null; }
  const target = path.resolve(runDir, relative);
  if (!isInside(runDir, target)) { fail(errors, `${label}: path escapes run directory`); return null; }
  try {
    const st = await lstat(target);
    if (!st.isFile() || st.isSymbolicLink()) { fail(errors, `${label}: not a physical regular file`); return null; }
    return { target, bytes: await readFile(target) };
  } catch (error) { fail(errors, `${label}: ${error.message}`); return null; }
};
const verifyEntry = async (entry, runDir, errors, conditional = false) => {
  if (!Array.isArray(entry.storyBindings) || entry.storyBindings.length === 0 || !entry.storyBindings.every((binding) => typeof binding.storyId === 'string' && Array.isArray(binding.beatRoles) && binding.beatRoles.every((beat) => /^\d{2}$/.test(beat)))) fail(errors, `${entry.assetId}: invalid storyBindings`);
  if (!conditional) for (const binding of entry.storyBindings || []) for (const beat of binding.beatRoles || []) if (!allowedBeatBindings[binding.storyId]?.has(beat)) fail(errors, `${entry.assetId}: beat ${binding.storyId}/${beat} is outside explicit allowed mapping`);
  const bindings = new Set((entry.storyBindings || []).map((binding) => binding.storyId));
  if ((entry.candidateTitle === 'Jeju police car.JPG' || entry.candidateTitle === 'Jeju Dongbu Police Station.JPG') && bindings.has('01-police-father')) fail(errors, `${entry.assetId}: Jeju police asset cannot bind to police-father story`);
  if (entry.candidateTitle === 'Jeonju Wansan Police Station Hyoja Police Box.jpg' && entry.usageLabel !== '전주 지역 경찰시설 자료사진') fail(errors, `${entry.assetId}: Wansan asset must be generic regional police-facility 자료사진`);
  if (entry.candidateTitle === 'Jeju District Court.JPG' && bindings.has('03-nurse-pesticide-coffee')) fail(errors, `${entry.assetId}: Jeju District Court cannot bind to nurse story`);
  if (entry.candidateTitle === 'Supreme Court of Korea (2020).jpg' && entry.usageLabel !== '법원 자료사진') fail(errors, `${entry.assetId}: Supreme Court asset must be generic court 자료사진`);
  if (!entry.storyId || !Array.isArray(entry.beatRoles) || entry.sensitiveParties !== 'none' || entry.containsSensitiveParties !== false) fail(errors, `${entry.assetId}: invalid story/beat/content binding`);
  if (!conditional && (entry.humanDepiction !== 'none-visible-required' || entry.containsHumans !== false)) fail(errors, `${entry.assetId}: actual asset has human depiction or missing no-human attestation`);
  if (conditional && entry.containsHumans === true && entry.humanReviewRequired !== true) fail(errors, `${entry.assetId}: human-visible conditional lacks human-review gate`);
  if (entry.license?.classification && (entry.license.classification === 'cc-by-nd' || entry.license.classification === 'cc-by-nc' || /nd|nc/i.test(entry.license.classification))) fail(errors, `${entry.assetId}: ND/NC license rejected`);
  const metadata = await physical(runDir, entry.files?.apiMetadata, errors, `${entry.assetId} metadata`);
  if (metadata && entry.fileHashes?.apiMetadata && (metadata.bytes.length !== entry.fileHashes.apiMetadata.bytes || sha256(metadata.bytes) !== entry.fileHashes.apiMetadata.sha256)) fail(errors, `${entry.assetId}: API metadata hash mismatch`);
  if (metadata) {
    try {
      const payload = JSON.parse(metadata.bytes.toString('utf8'));
      const info = payload.query?.pages?.[0]?.imageinfo?.[0];
      if (!info) fail(errors, `${entry.assetId}: metadata has no imageinfo`);
      else if (classifyLicense(info) !== entry.license?.classification) fail(errors, `${entry.assetId}: license classification not reproducible from API metadata`);
    } catch (error) { fail(errors, `${entry.assetId}: invalid metadata JSON (${error.message})`); }
  }
  if (entry.source?.originalUrl && !hostAllowed(entry.source.originalUrl, true)) fail(errors, `${entry.assetId}: remote/non-Commons source URL`);
  if (entry.source?.descriptionUrl && !hostAllowed(entry.source.descriptionUrl, false)) fail(errors, `${entry.assetId}: remote/non-Commons description URL`);
  if (entry.source?.api && !hostAllowed(entry.source.api, false)) fail(errors, `${entry.assetId}: remote/non-Commons API URL`);
  if (entry.metadata?.apiUrl && !hostAllowed(entry.metadata.apiUrl, false)) fail(errors, `${entry.assetId}: remote/non-Commons API URL`);
  if (conditional) return;
  if (!allowedLicenses.has(entry.license?.classification) || entry.license?.allowlisted !== true) fail(errors, `${entry.assetId}: non-allowlisted license admitted as actual`);
  const original = await physical(runDir, entry.files?.original, errors, `${entry.assetId} original`);
  if (!original) return;
  if (entry.original?.bytes !== original.bytes.length || entry.original?.sha256 !== sha256(original.bytes)) fail(errors, `${entry.assetId}: original bytes/hash mismatch`);
  const decoded = dimensions(original.bytes, entry.original?.mime);
  if (!decoded || decoded.width !== entry.original?.width || decoded.height !== entry.original?.height || decoded.width < 1 || decoded.height < 1) fail(errors, `${entry.assetId}: decoded dimensions mismatch`);
  if (!String(entry.original?.mime || '').startsWith('image/')) fail(errors, `${entry.assetId}: non-image MIME`);
  const description = await physical(runDir, entry.files?.descriptionLicensePage, errors, `${entry.assetId} description/license page`);
  if (description && entry.fileHashes?.descriptionLicensePage && (description.bytes.length !== entry.fileHashes.descriptionLicensePage.bytes || sha256(description.bytes) !== entry.fileHashes.descriptionLicensePage.sha256)) fail(errors, `${entry.assetId}: description/license bytes hash mismatch`);
};
const verify = async (manifestPath) => {
  const errors = [];
  let absoluteManifest;
  if (manifestPath) absoluteManifest = path.resolve(manifestPath);
  else {
    const runs = (await readdir(path.join(studyRoot, 'collected'), { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.startsWith('run-')).map((entry) => path.join(studyRoot, 'collected', entry.name, 'manifest.json'));
    if (!runs.length) throw new Error('no collected run manifest found');
    const mtimes = await Promise.all(runs.map(async (file) => ({ file, mtime: (await lstat(file)).mtimeMs })));
    absoluteManifest = mtimes.sort((a, b) => b.mtime - a.mtime)[0].file;
  }
  const manifestBytes = await readFile(absoluteManifest);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.schema !== 'three-story-real-media-acquisition-v1') fail(errors, 'manifest schema mismatch');
  if (JSON.stringify([...manifest.candidateTitles].sort()) !== JSON.stringify([...expectedTitles].sort())) fail(errors, 'candidate title set mismatch');
  for (const [kind, records] of Object.entries(manifest.sourceBindings || {})) for (const [key, record] of Object.entries(records || {})) {
    const file = path.resolve(workspace, record.relativePath);
    if (file !== path.resolve(record.realpath) || !isInside(workspace, file)) fail(errors, `${kind}.${key}: invalid contained realpath`);
    try { const st = await lstat(file); const bytes = await readFile(file); if (!st.isFile() || st.isSymbolicLink() || record.symlink || record.bytes !== bytes.length || record.sha256 !== sha256(bytes)) fail(errors, `${kind}.${key}: source binding changed`); } catch (error) { fail(errors, `${kind}.${key}: ${error.message}`); }
  }
  const runDir = path.dirname(absoluteManifest);
  const sheets = manifest.qa?.contactSheets || {};
  if (!sheets.actual || !sheets.conditional || sheets.actual.relativePath === sheets.conditional.relativePath) fail(errors, 'actual and conditional contact sheets must be distinct');
  for (const [kind, expectedCount] of [['actual', (manifest.actual || []).length], ['conditional', (manifest.conditional || []).filter((entry) => entry.files?.contactSheetImage).length]]) {
    const sheet = sheets[kind];
    const image = await physical(runDir, sheet?.relativePath, errors, `QA ${kind} contact sheet`);
    if (image) {
      if (sheet.bytes !== image.bytes.length || sheet.sha256 !== sha256(image.bytes)) fail(errors, `QA ${kind} contact sheet hash mismatch`);
      if (sheet.assetCount !== expectedCount) fail(errors, `QA ${kind} contact sheet asset count mismatch`);
    }
  }
  for (const title of ['Cellphone (Unsplash).jpg', "Women's Surgical Ward Nlm nlmuid-101435911.jpg"]) if (!manifest.qa?.visualReview?.humanConditionalTitles?.includes(title)) fail(errors, `visual review must record human-visible conditional: ${title}`);
  for (const entry of manifest.actual || []) await verifyEntry(entry, runDir, errors, false);
  for (const entry of manifest.conditional || []) await verifyEntry(entry, runDir, errors, true);
  for (const entry of manifest.conditional || []) if (entry.files?.conditionalOriginal) {
    const original = await physical(runDir, entry.files.conditionalOriginal, errors, `${entry.assetId} conditional original`);
    if (original && entry.fileHashes?.conditionalOriginal && (original.bytes.length !== entry.fileHashes.conditionalOriginal.bytes || sha256(original.bytes) !== entry.fileHashes.conditionalOriginal.sha256)) fail(errors, `${entry.assetId}: conditional original hash mismatch`);
  }
  const computedCoverage = {};
  for (const storyId of ['01-police-father', '02-jeju-school-intrusion', '03-nurse-pesticide-coffee']) computedCoverage[storyId] = new Set();
  for (const entry of manifest.actual || []) for (const binding of entry.storyBindings || []) if (computedCoverage[binding.storyId]) for (const beat of binding.beatRoles) computedCoverage[binding.storyId].add(beat);
  for (const [storyId, beats] of Object.entries(computedCoverage)) {
    if (beats.size < 16) fail(errors, `${storyId}: only ${beats.size} distinct beats covered; need >=16`);
    const recorded = manifest.coverage?.[storyId];
    if (!recorded || recorded.pass !== true || recorded.distinctBeats?.length !== beats.size || recorded.distinctBeats?.some((beat) => !beats.has(beat))) fail(errors, `${storyId}: recorded coverage does not match actual entries`);
  }
  if (manifest.production?.provider !== false || manifest.production?.upload !== false || manifest.production?.publication !== false) fail(errors, 'production/provider/upload/publication must be false');
  if ((manifest.counts?.actual ?? -1) !== (manifest.actual || []).length || (manifest.counts?.conditional ?? -1) !== (manifest.conditional || []).length) fail(errors, 'manifest counts mismatch');
  for (const [storyId, beats] of Object.entries(allowedBeatBindings)) if (JSON.stringify(manifest.allowedBeatBindings?.[storyId] || []) !== JSON.stringify([...beats].sort())) fail(errors, `${storyId}: allowed beat mapping missing or changed`);
  if (errors.length) { console.error(JSON.stringify({ ok: false, errors }, null, 2)); process.exitCode = 1; return; }
  console.log(JSON.stringify({ ok: true, manifest: absoluteManifest, actual: manifest.actual.length, conditional: manifest.conditional.length }, null, 2));
};

const manifestFlagIndex = process.argv.indexOf('--manifest');
const supplied = manifestFlagIndex >= 0 ? process.argv[manifestFlagIndex + 1] : process.argv.slice(2).find((arg) => !arg.startsWith('-'));
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) verify(supplied).catch((error) => { console.error(`[FAIL] ${error.stack || error.message}`); process.exitCode = 1; });

export { verify, dimensions };
