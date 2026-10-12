import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (v) => v.slice(1)));
const base = path.join(ROOT, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v29-common-masters-production-v4');
const out = path.join(base, 'assets', 'scene-001', 'admitted-cut001-v1');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const read = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
const artifactPath = path.join(out, 'scene-asset-admission-v1.json'); const artifact = await read(artifactPath);
const claimed = artifact.artifactSha256; delete artifact.artifactSha256;
if (claimed !== sha(Buffer.from(JSON.stringify(artifact), 'utf8'))) throw new Error('scene admission artifact hash drifted');
const queuePath = path.join(base, 'imagegen-isolated-elements-generation-queue-v1.json'); const queueBytes = await fs.readFile(queuePath);
if (sha(queueBytes) !== artifact.sourceQueue.sha256) throw new Error('queue hash drifted after admission');
if (artifact.status !== 'admitted-private-only' || artifact.assets.length !== 3) throw new Error('scene admission status/count invalid');
const py = `from PIL import Image\nfrom pathlib import Path\nimport sys\nfor f in Path(sys.argv[1]).glob('*.png'):\n im=Image.open(f).convert('RGBA')\n if im.size!=(1254,1254): raise SystemExit('bad dimensions')\n if any(im.getpixel(p)[3] != 0 for p in [(0,0),(1253,0),(0,1253),(1253,1253)]): raise SystemExit('corners not transparent')\n if im.getbbox() is None: raise SystemExit('empty alpha')\nprint('alpha-ok')\n`;
const result = spawnSync('python', ['-c', py, out], { encoding: 'utf8' }); if (result.status !== 0) throw new Error(result.stderr || 'alpha validation failed');
for (const asset of artifact.assets) { const bytes = await fs.readFile(path.join(ROOT, asset.relativePath)); if (sha(bytes) !== asset.admittedSha256 || bytes.length !== asset.bytes) throw new Error(`asset drift ${asset.assetId}`); if (!asset.masterBindings?.length || !asset.prompt) throw new Error(`binding missing ${asset.assetId}`); }
console.log(JSON.stringify({ verified: true, artifactSha256: claimed, assetCount: artifact.assets.length, queueSha256: artifact.sourceQueue.sha256 }));
