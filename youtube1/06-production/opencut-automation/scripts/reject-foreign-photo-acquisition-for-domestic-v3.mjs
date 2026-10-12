import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const predecessor = path.join(root, 'out', 'studies', 'newsroom-real-media-acquisition-v2', 'run-20260815T073650Z-curated-206e20', 'manifest.json');
const log = path.join(root, 'out', 'studies', 'newsroom-real-media-acquisition-v3-domestic-only', 'supersessions.jsonl');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

export async function rejectForeignAcquisitionForDomesticV3() {
  const bytes = await fs.readFile(predecessor);
  const record = { schema: 'newsroom-real-media-acquisition-domestic-policy-supersession-v1', recordedAt: new Date().toISOString(), predecessor: { relativePath: path.relative(root, predecessor).replaceAll('\\', '/'), manifestSha256: sha(bytes), assetCount: 46 }, disposition: 'domestic-policy-ineligible', reasons: ['origin provider is Wikimedia Commons/foreign route', 'Korean rightsholder/origin authority is not established for every item', 'captureCountry=KR is not established for every item'], preservation: 'append-only audit evidence; do not delete or seed domestic v3', successor: 'newsroom-real-media-acquisition-v3-domestic-only', production: { provider: false, render: false, upload: false, publication: false, stage07: false } };
  await fs.mkdir(path.dirname(log), { recursive: true }); await fs.appendFile(log, `${JSON.stringify(record)}\n`); return { log, predecessorSha256: record.predecessor.manifestSha256 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) rejectForeignAcquisitionForDomesticV3().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
