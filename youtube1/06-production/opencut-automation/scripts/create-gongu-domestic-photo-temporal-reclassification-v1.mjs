import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MODERN_MIN_YEAR} from './newsroom-real-media-temporal.mjs';

const root = path.resolve(import.meta.dirname, '..');
const predecessor = path.join(root, 'out', 'studies', 'gongu-domestic-photo-expansion-v2', 'run-20260815T135157620Z-188ac6');
const outRoot = path.join(root, 'out', 'studies', 'gongu-domestic-photo-temporal-reclassification-v1');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
export async function create() {
  const runDir = path.join(outRoot, `run-${new Date().toISOString().replaceAll(/[-:.]/gu, '').replace('Z', 'Z')}-${crypto.randomBytes(3).toString('hex')}`); await fs.mkdir(runDir, {recursive: true});
  const manifestPath = path.join(predecessor, 'manifest.json'); const manifestBytes = await fs.readFile(manifestPath); const manifest = JSON.parse(manifestBytes);
  const records = [];
  for (const a of manifest.assets) {
    const rights = path.resolve(root, a.evidence.rightsRelativePath); const html = await fs.readFile(rights, 'utf8'); const date = html.match(/창작년도<\/dt>\s*<dd>\s*([^<]+)/u)?.[1]?.trim() || null; const year = date ? Number.parseInt(date.slice(0, 4), 10) : null; const optical = /CD와 노트북|광학|CD/iu.test(a.candidateTitle || '');
    records.push({assetId: a.assetId, storyId: a.storyId, cutId: a.cutId, predecessorManifestSha256: sha(manifestBytes), captureDate: date, captureYear: year, temporalEra: year != null && year >= MODERN_MIN_YEAR ? 'modern-2020s' : year != null ? 'legacy-pre-2020' : 'unknown', technologyGeneration: optical ? 'legacy-computing' : 'unknown', anachronismFlags: {opticalDiscDrive: optical, featurePhone: false, crtDisplay: false, datedMedia: optical, unknownCaptureDate: year == null}, sourceUseStatus: year != null && year < MODERN_MIN_YEAR ? 'reclassified-legacy' : 'conditional', coverageEligible: false, reason: optical ? 'optical-disc-era object conflicts with modern laptop cut' : year != null ? `capture year ${year} is before ${MODERN_MIN_YEAR}` : 'capture date not stated; conditional only', rightsPath: path.relative(root, rights).replaceAll('\\', '/')});
  }
  const result = {schema: 'gongu-domestic-photo-temporal-reclassification-v1', generatedAt: new Date().toISOString(), predecessorRun: path.relative(root, predecessor).replaceAll('\\', '/'), predecessorManifestSha256: sha(manifestBytes), policy: {modernMinYear: MODERN_MIN_YEAR, unknownDate: 'conditional-only', originalRunImmutable: true}, records, counts: {examined: records.length, legacy: records.filter(x => x.sourceUseStatus === 'reclassified-legacy').length, conditional: records.filter(x => x.sourceUseStatus === 'conditional').length, modern: records.filter(x => x.temporalEra === 'modern-2020s').length}, production: {provider: false, render: false, upload: false, publication: false, stage07: false}};
  const file = path.join(runDir, 'reclassification.json'); await fs.writeFile(file, `${JSON.stringify(result, null, 2)}\n`, {flag: 'wx'}); const check = await fs.readFile(file); await fs.writeFile(path.join(runDir, 'verifier.json'), `${JSON.stringify({ok: true, reclassificationSha256: sha(check), predecessorManifestSha256: result.predecessorManifestSha256, counts: result.counts}, null, 2)}\n`, {flag: 'wx'}); return {runDir, sha256: sha(check), counts: result.counts};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) create().then(x => process.stdout.write(`${JSON.stringify(x, null, 2)}\n`)).catch(e => {process.stderr.write(`${e.stack || e}\n`); process.exitCode = 1;});
