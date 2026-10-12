import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, lstat, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const workspace = path.resolve(import.meta.dirname, '..', '..', '..');
const studyRoot = path.join(workspace, '06-production', 'opencut-automation', 'out', 'studies', 'three-story-real-media-acquisition-v1');
const collectedRoot = path.join(studyRoot, 'collected');
const apiEndpoint = 'https://commons.wikimedia.org/w/api.php';
const candidateSpecs = [
  { title: 'Coffeecup.jpg', storyBindings: [{ storyId: '03-nurse-pesticide-coffee', beatRoles: ['01', '02'] }], usageLabel: '자료사진' },
  { title: 'Coffee cup seen from above.jpg', storyBindings: [{ storyId: '03-nurse-pesticide-coffee', beatRoles: ['01', '02', '08', '10', '11', '18', '20'] }], usageLabel: '자료사진' },
  { title: 'Cellphone (Unsplash).jpg', storyBindings: [{ storyId: '01-police-father', beatRoles: ['01', '06'] }, { storyId: '02-jeju-school-intrusion', beatRoles: ['15'] }], usageLabel: '자료사진' },
  { title: 'CCTV cameras in Mumbai.jpg', storyBindings: [{ storyId: '02-jeju-school-intrusion', beatRoles: ['08', '10', '11'] }], usageLabel: '자료사진' },
  { title: 'Forensic tableau.JPG', storyBindings: [{ storyId: '01-police-father', beatRoles: ['09', '12', '14', '16'] }, { storyId: '02-jeju-school-intrusion', beatRoles: ['05', '15'] }, { storyId: '03-nurse-pesticide-coffee', beatRoles: ['09', '12'] }], usageLabel: '자료사진' },
  { title: 'Portable forensic tableau.JPG', storyBindings: [{ storyId: '01-police-father', beatRoles: ['09', '12', '14', '16'] }, { storyId: '02-jeju-school-intrusion', beatRoles: ['05', '15'] }], usageLabel: '자료사진' },
  { title: 'Empty class room.jpg', storyBindings: [{ storyId: '01-police-father', beatRoles: ['05'] }, { storyId: '02-jeju-school-intrusion', beatRoles: ['02', '03', '06', '09', '18'] }], usageLabel: '자료사진' },
  { title: 'Jeju District Court.JPG', storyBindings: [{ storyId: '02-jeju-school-intrusion', beatRoles: ['16'] }], usageLabel: '법원 자료사진' },
  { title: 'Jeju Special Self-Governing Provincial Office of Education.JPG', storyBindings: [{ storyId: '02-jeju-school-intrusion', beatRoles: ['01', '19', '20'] }], usageLabel: '기관 자료' },
  { title: 'Jeju police car.JPG', storyBindings: [{ storyId: '02-jeju-school-intrusion', beatRoles: ['07', '13'] }], usageLabel: '제주 지역 경찰시설 자료사진' },
  { title: 'Jeju Dongbu Police Station.JPG', storyBindings: [{ storyId: '02-jeju-school-intrusion', beatRoles: ['07', '13'] }], usageLabel: '제주 지역 경찰시설 자료사진' },
  { title: 'Supreme Court of Korea (2020).jpg', storyBindings: [{ storyId: '01-police-father', beatRoles: ['19'] }, { storyId: '03-nurse-pesticide-coffee', beatRoles: ['13', '14', '15', '16', '17'] }], usageLabel: '법원 자료사진' },
  { title: "Seoul Seobu Local Porsecutors' Office.jpg", storyBindings: [{ storyId: '01-police-father', beatRoles: ['08'] }], usageLabel: '자료사진' },
  { title: 'Corridor on the second level - NÄL hospital 1.jpg', storyBindings: [{ storyId: '03-nurse-pesticide-coffee', beatRoles: ['04', '05', '06', '12', '19'] }], usageLabel: '자료사진' },
  { title: 'Corridor on the second level - NÄL hospital 3.jpg', storyBindings: [{ storyId: '03-nurse-pesticide-coffee', beatRoles: ['04', '05', '06', '12', '19'] }], usageLabel: '자료사진' },
  { title: 'Roundup Kanister B 2020 08.JPG', storyBindings: [{ storyId: '03-nurse-pesticide-coffee', beatRoles: ['03', '09'] }], usageLabel: '자료사진', hint: 'conditional-trademark-review' },
  { title: 'Jeonju Wansan Police Station Hyoja Police Box.jpg', storyBindings: [{ storyId: '01-police-father', beatRoles: ['01', '03', '04', '06', '10', '11', '13', '17', '20'] }, { storyId: '02-jeju-school-intrusion', beatRoles: ['07', '13'] }], usageLabel: '전주 지역 경찰시설 자료사진', hint: 'cc-by-research' },
  { title: 'Hospitals corridor.jpg', storyBindings: [{ storyId: '03-nurse-pesticide-coffee', beatRoles: ['04', '05', '06', '12', '19'] }], usageLabel: '자료사진' },
  { title: "Women's Surgical Ward Nlm nlmuid-101435911.jpg", storyBindings: [{ storyId: '03-nurse-pesticide-coffee', beatRoles: ['05', '12', '19'] }], usageLabel: '기관 자료', hint: 'public-domain', humanReviewRequired: true },
];
const sourceFiles = [
  ['storylines', '01-police-father.md'],
  ['storylines', '02-jeju-school-intrusion.md'],
  ['storylines', '03-nurse-pesticide-coffee.md'],
  ['photo-needs', '01-police-father-photo-needs.md'],
  ['photo-needs', '02-jeju-school-intrusion-photo-needs.md'],
  ['photo-needs', '03-nurse-pesticide-coffee-photo-needs.md'],
];
const allowedLicenses = new Set(['cc0', 'public-domain', 'cc-by']);
const knownHumanTitles = new Set(['Cellphone (Unsplash).jpg', "Women's Surgical Ward Nlm nlmuid-101435911.jpg"]);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value) => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
const cleanTitle = (title) => title.replace(/^File:/i, '');
const extFromMime = (mime, url = '') => {
  const known = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/tiff': '.tif' };
  return known[mime] ?? (path.extname(new URL(url).pathname) || '.bin');
};
const textValue = (extmetadata, key) => extmetadata?.[key]?.value ?? '';
const classifyLicense = (info) => {
  const em = info.extmetadata ?? {};
  const text = [textValue(em, 'LicenseShortName'), textValue(em, 'License'), textValue(em, 'UsageTerms'), textValue(em, 'Copyrighted')].join(' ').toLowerCase();
  const licenseUrl = String(textValue(em, 'LicenseUrl')).toLowerCase();
  if (/cc\s*0|creative commons zero/.test(text) || /creativecommons\.org\/publicdomain\/zero/.test(licenseUrl)) return 'cc0';
  if (/public domain|pd-old|pd-us|pd-self|publicdomain/.test(text) || /publicdomain/.test(licenseUrl)) return 'public-domain';
  if (/cc\s*by(?!-?(?:sa|nd|nc))\b/.test(text) || /creativecommons\.org\/licenses\/by(?:\/|$)/.test(licenseUrl)) return 'cc-by';
  if (/cc\s*by[-\s]*(?:sa|nd|nc)|non[-\s]?commercial|no derivatives|all rights reserved|trademark|logo/.test(text)) return 'conditional';
  return 'uncertain';
};
const assertRegular = async (file) => {
  const st = await lstat(file);
  if (!st.isFile() || st.isSymbolicLink()) throw new Error(`expected physical regular file: ${file}`);
  return st;
};
const sourceBinding = async (kind, name) => {
  const file = path.join(studyRoot, kind, name);
  const bytes = await readFile(file);
  const st = await assertRegular(file);
  return { relativePath: path.relative(workspace, file).replaceAll('\\', '/'), realpath: path.resolve(file), bytes: bytes.length, sha256: sha256(bytes), symlink: st.isSymbolicLink() };
};
const fetchResponse = async (url) => {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, { headers: { 'User-Agent': 'three-story-real-media-acquisition-v1/1.0 (research collector; contact=research@example.invalid)' } });
    if (response.ok) return response;
    lastStatus = response.status;
    if (response.status !== 429 && response.status !== 503) break;
    const retryAfter = Number(response.headers.get('retry-after'));
    const delay = Number.isFinite(retryAfter) ? Math.min(5000, Math.max(250, retryAfter * 1000)) : 750 * (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error(`HTTP ${lastStatus} for ${url}`);
};
const fetchBytes = async (url) => Buffer.from(await (await fetchResponse(url)).arrayBuffer());
const queryCommons = async (title) => {
  const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', titles: `File:${title}`, prop: 'imageinfo', iiprop: 'url|mime|size|sha1|timestamp|extmetadata|dimensions' });
  const url = `${apiEndpoint}?${params}`;
  const response = await fetchResponse(url);
  const raw = Buffer.from(await response.arrayBuffer());
  const payload = JSON.parse(raw.toString('utf8'));
  const page = payload.query?.pages?.[0];
  return { url, raw, payload, page, info: page?.imageinfo?.[0] };
};
const newRunDirectory = async () => {
  await mkdir(collectedRoot, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  for (let i = 0; i < 20; i += 1) {
    const suffix = i ? `-${i}` : '';
    const dir = path.join(collectedRoot, `run-${stamp}${suffix}-${randomBytes(3).toString('hex')}`);
    try { await mkdir(dir); return dir; } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  throw new Error('could not allocate append-only run directory');
};
const createContactSheet = async (runDir, entries, fileName) => {
  const qaDir = path.join(runDir, 'qa');
  await mkdir(qaDir, { recursive: true });
  const output = path.join(qaDir, fileName);
  const python = `from PIL import Image, ImageOps, ImageDraw\nimport os, sys\nout = sys.argv[1]\nfiles = sys.argv[2:]\ncols = 4\ntw, th = 360, 300\nrows = (len(files) + cols - 1) // cols\nsheet = Image.new('RGB', (cols * tw, rows * th), 'white')\ndraw = ImageDraw.Draw(sheet)\nfor i, file in enumerate(files):\n    im = Image.open(file).convert('RGB')\n    im.thumbnail((340, 245), Image.Resampling.LANCZOS)\n    x = (i % cols) * tw + (tw - im.width) // 2\n    y = (i // cols) * th + 8\n    sheet.paste(im, (x, y))\n    label = os.path.basename(file)\n    draw.text(((i % cols) * tw + 8, (i // cols) * th + 260), label[:52], fill='black')\nsheet.save(out, format='PNG', optimize=False)\n`;
  const files = entries.map((entry) => path.join(runDir, entry.files.contactSheetImage || entry.files.original));
  const result = spawnSync('python', ['-c', python, output, ...files], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`contact sheet generation failed: ${result.stderr || result.stdout}`);
  const bytes = await readFile(output);
  return { relativePath: path.relative(runDir, output).replaceAll('\\', '/'), bytes: bytes.length, sha256: sha256(bytes), assetCount: entries.length };
};

const collect = async () => {
  const runDir = await newRunDirectory();
  const bindings = { storylines: {}, photoNeeds: {} };
  for (const [kind, name] of sourceFiles) {
    const key = name.replace(/\.md$/, '');
    bindings[kind === 'storylines' ? 'storylines' : 'photoNeeds'][key] = await sourceBinding(kind, name);
  }
  const actual = [];
  const conditional = [];
  for (let index = 0; index < candidateSpecs.length; index += 1) {
    const spec = candidateSpecs[index];
    const { title: candidateTitle, storyBindings, usageLabel, hint } = spec;
    const assetId = `commons-${String(index + 1).padStart(2, '0')}`;
    const metadataPath = path.join(runDir, 'metadata', `${assetId}.json`);
    await mkdir(path.dirname(metadataPath), { recursive: true });
    let queried;
    try {
      queried = await queryCommons(candidateTitle);
      await writeFile(metadataPath, queried.raw, { flag: 'wx' });
    } catch (error) {
      conditional.push({ assetId, candidateTitle, storyBindings, storyId: storyBindings[0]?.storyId ?? null, beatRoles: storyBindings[0]?.beatRoles ?? [], usageLabel, humanDepiction: 'none-visible-required', sensitiveParties: 'none', containsHumans: false, containsSensitiveParties: false, status: 'unavailable', reason: String(error.message), source: { provider: 'Wikimedia Commons', api: apiEndpoint }, files: {} });
      continue;
    }
    const info = queried.info;
    const pageTitle = queried.page?.title ?? `File:${candidateTitle}`;
    const base = { assetId, candidateTitle, resolvedTitle: cleanTitle(pageTitle), storyBindings, storyId: storyBindings[0]?.storyId ?? null, beatRoles: storyBindings[0]?.beatRoles ?? [], usageLabel, provenanceNote: 'generic visual reference; not an actual-case linkage', humanDepiction: 'none-visible-required', sensitiveParties: 'none', containsHumans: false, containsSensitiveParties: false, metadata: { apiUrl: queried.url, pageId: queried.page?.pageid ?? null, timestamp: info?.timestamp ?? null, mime: info?.mime ?? null, size: info?.size ?? null, sha1: info?.sha1 ?? null, width: info?.width ?? null, height: info?.height ?? null, extmetadata: info?.extmetadata ?? {} } };
    if (!info?.url) {
      conditional.push({ ...base, status: 'unavailable', reason: 'Commons page has no imageinfo URL', files: { apiMetadata: path.relative(runDir, metadataPath).replaceAll('\\', '/') }, fileHashes: { apiMetadata: { bytes: queried.raw.length, sha256: sha256(queried.raw) } } });
      continue;
    }
    const license = classifyLicense(info);
    const descriptionUrl = info.descriptionurl;
    const remoteHosts = [new URL(info.url).hostname, descriptionUrl ? new URL(descriptionUrl).hostname : ''].filter(Boolean);
    const sourceAllowed = remoteHosts.every((host) => host === 'upload.wikimedia.org' || host === 'commons.wikimedia.org');
    const minEdge = Math.min(Number(info.width) || 0, Number(info.height) || 0);
    if (!allowedLicenses.has(license) || !sourceAllowed || hint === 'conditional-trademark-review' || minEdge < 480 || knownHumanTitles.has(candidateTitle)) {
      const humanVisible = knownHumanTitles.has(candidateTitle);
      const files = { apiMetadata: path.relative(runDir, metadataPath).replaceAll('\\', '/') };
      const fileHashes = { apiMetadata: { bytes: queried.raw.length, sha256: sha256(queried.raw) } };
      if (allowedLicenses.has(license) && sourceAllowed) {
        const conditionalBytes = await fetchBytes(info.url);
        const humanPath = path.join(runDir, 'conditional-originals', `${assetId}${extFromMime(info.mime, info.url)}`);
        await mkdir(path.dirname(humanPath), { recursive: true });
        await writeFile(humanPath, conditionalBytes, { flag: 'wx' });
        files.conditionalOriginal = path.relative(runDir, humanPath).replaceAll('\\', '/');
        files.contactSheetImage = files.conditionalOriginal;
        fileHashes.conditionalOriginal = { bytes: conditionalBytes.length, sha256: sha256(conditionalBytes) };
      }
      conditional.push({ ...base, containsHumans: humanVisible, humanDepiction: humanVisible ? 'visible-humans' : base.humanDepiction, humanReviewRequired: humanVisible || undefined, license: { classification: license, allowlisted: allowedLicenses.has(license), attributionRequired: license === 'cc-by', conditions: license === 'cc-by' ? ['attribution'] : [], hint: hint ?? null }, status: 'conditional', elementOnly: minEdge < 480, reason: humanVisible ? 'visible people require human-review; excluded from actual coverage' : !sourceAllowed ? 'non-Commons source host' : hint === 'conditional-trademark-review' ? 'trademark/brand review required' : minEdge < 480 ? 'minimum edge below 480; element-only, not full-frame' : 'license is not CC0, Public Domain, or CC BY', files, fileHashes, source: { originalUrl: info.url, descriptionUrl } });
      continue;
    }
    try {
      const originalBytes = await fetchBytes(info.url);
      const originalName = `${assetId}${extFromMime(info.mime, info.url)}`;
      const originalPath = path.join(runDir, 'originals', originalName);
      await mkdir(path.dirname(originalPath), { recursive: true });
      await writeFile(originalPath, originalBytes, { flag: 'wx' });
      const descriptionBytes = descriptionUrl ? await fetchBytes(descriptionUrl) : Buffer.alloc(0);
      const descriptionPath = path.join(runDir, 'descriptions', `${assetId}.html`);
      await mkdir(path.dirname(descriptionPath), { recursive: true });
      await writeFile(descriptionPath, descriptionBytes, { flag: 'wx' });
      actual.push({ ...base, license: { classification: license, allowlisted: true, attributionRequired: license === 'cc-by', conditions: license === 'cc-by' ? ['attribution'] : [], licenseShortName: textValue(info.extmetadata, 'LicenseShortName'), licenseUrl: textValue(info.extmetadata, 'LicenseUrl'), usageTerms: textValue(info.extmetadata, 'UsageTerms') }, source: { originalUrl: info.url, descriptionUrl, hosts: remoteHosts }, files: { original: path.relative(runDir, originalPath).replaceAll('\\', '/'), apiMetadata: path.relative(runDir, metadataPath).replaceAll('\\', '/'), descriptionLicensePage: path.relative(runDir, descriptionPath).replaceAll('\\', '/') }, fileHashes: { apiMetadata: { bytes: queried.raw.length, sha256: sha256(queried.raw) }, descriptionLicensePage: { bytes: descriptionBytes.length, sha256: sha256(descriptionBytes) } }, original: { bytes: originalBytes.length, sha256: sha256(originalBytes), mime: info.mime, width: info.width ?? null, height: info.height ?? null } });
    } catch (error) {
      conditional.push({ ...base, license: { classification: license, allowlisted: true }, status: 'download-failed', reason: String(error.message), files: { apiMetadata: path.relative(runDir, metadataPath).replaceAll('\\', '/') }, source: { originalUrl: info.url, descriptionUrl } });
    }
  }
  const conditionalVisualEntries = conditional.filter((entry) => entry.files?.contactSheetImage);
  const actualContactSheet = await createContactSheet(runDir, actual, 'actual-contact-sheet.png');
  const conditionalContactSheet = await createContactSheet(runDir, conditionalVisualEntries, 'conditional-contact-sheet.png');
  const coverage = {};
  for (const storyId of ['01-police-father', '02-jeju-school-intrusion', '03-nurse-pesticide-coffee']) coverage[storyId] = { distinctBeats: [], requiredDistinctBeats: 16, provisionalBeatCount: 20, pass: false };
  for (const entry of actual) for (const binding of entry.storyBindings ?? []) if (coverage[binding.storyId]) coverage[binding.storyId].distinctBeats.push(...binding.beatRoles);
  for (const value of Object.values(coverage)) { value.distinctBeats = [...new Set(value.distinctBeats)].sort(); value.pass = value.distinctBeats.length >= value.requiredDistinctBeats; }
  const allowedBeatBindings = { '01-police-father': ['01', '03', '04', '05', '06', '08', '09', '10', '11', '12', '13', '14', '16', '17', '19', '20'], '02-jeju-school-intrusion': ['01', '02', '03', '05', '06', '07', '08', '09', '10', '11', '13', '15', '16', '18', '19', '20'], '03-nurse-pesticide-coffee': ['01', '02', '04', '05', '06', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'] };
  const manifest = { schema: 'three-story-real-media-acquisition-v1', generatedAt: new Date().toISOString(), runDirectory: path.relative(studyRoot, runDir).replaceAll('\\', '/'), sourceBindings: bindings, candidateTitles: candidateSpecs.map(({ title }) => title), allowedBeatBindings, licensePolicy: { allowlist: ['CC0', 'Public Domain', 'CC BY'], conditional: ['CC BY-SA', 'CC BY-ND', 'CC BY-NC', 'trademark', 'uncertain', 'missing', 'below-480-element-only', 'human-review'], rejects: ['remote/non-Commons media', 'news-site downloads', 'ND', 'NC'] }, actual, conditional, coverage, qa: { contactSheets: { actual: actualContactSheet, conditional: conditionalContactSheet }, visualReview: { actualNoVisibleHumansRequired: true, humanConditionalTitles: [...knownHumanTitles] } }, counts: { candidates: candidateSpecs.length, actual: actual.length, conditional: conditional.length, actualSheetImages: actual.length, conditionalSheetImages: conditionalVisualEntries.length }, production: { provider: false, render: false, upload: false, publication: false, stage07: false } };
  const manifestPath = path.join(runDir, 'manifest.json');
  await writeFile(manifestPath, jsonBytes(manifest), { flag: 'wx' });
  console.log(JSON.stringify({ ok: true, manifest: manifestPath, actual: actual.length, conditional: conditional.length }, null, 2));
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) collect().catch((error) => { console.error(`[FAIL] ${error.stack || error.message}`); process.exitCode = 1; });

export { collect, classifyLicense, allowedLicenses };
