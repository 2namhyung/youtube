import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
export async function verify(runDir) {
  const file = path.join(runDir, 'reclassification.json'); const x = JSON.parse(await fs.readFile(file, 'utf8'));
  if (x.schema !== 'gongu-domestic-photo-temporal-reclassification-v1' || x.policy.originalRunImmutable !== true) throw new Error('schema-or-immutability');
  if (x.records.length !== x.counts.examined || x.counts.examined !== 6) throw new Error('counts');
  for (const r of x.records) { for (const k of ['captureDate', 'captureYear', 'temporalEra', 'technologyGeneration', 'anachronismFlags']) if (!(k in r)) throw new Error(`missing-${k}:${r.assetId}`); if (r.coverageEligible !== false) throw new Error(`eligible:${r.assetId}`); }
  const predecessor = path.resolve(root, x.predecessorRun, 'manifest.json'); const b = await fs.readFile(predecessor); if (sha(b) !== x.predecessorManifestSha256) throw new Error('predecessor-mutated');
  return {ok: true, reclassificationSha256: sha(await fs.readFile(file)), predecessorManifestSha256: sha(b), counts: x.counts};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) verify(path.resolve(process.argv[2])).then(x => process.stdout.write(`${JSON.stringify(x, null, 2)}\n`)).catch(e => {process.stderr.write(`${e.stack || e}\n`); process.exitCode = 1;});
