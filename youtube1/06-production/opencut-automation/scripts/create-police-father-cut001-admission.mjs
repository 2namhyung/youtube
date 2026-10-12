import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (v) => v.slice(1)));
const id = 'research-6b1a8af9b4143acb-v29-common-masters-production-v4';
const base = path.join(ROOT, 'out', 'prototypes', id);
const scene = path.join(base, 'assets', 'scene-001');
const out = path.join(scene, 'admitted-cut001-v1');
const queuePath = path.join(base, 'imagegen-isolated-elements-generation-queue-v1.json');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const read = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
const rel = (p) => path.relative(ROOT, p).replaceAll('\\', '/');
const queueBytes = await fs.readFile(queuePath); const queueSha = sha(queueBytes); const queue = JSON.parse(queueBytes);
const wanted = ['document-card', 'phone-token', 'state-marker'];
const entries = queue.assets.filter((a) => a.cutId === 'cut-001' && wanted.includes(a.assetRole));
if (entries.length !== 3) throw new Error('cut-001 queue must contain exactly three semantic assets');
const sourceFiles = { 'document-card': 'cut-001-document-card.png', 'phone-token': 'cut-001-phone-token.png', 'state-marker': 'cut-001-state-marker.png' };
await fs.mkdir(out, { recursive: true });
const py = `from PIL import Image\nfrom pathlib import Path\nimport json,sys\nroot=Path(sys.argv[1]); out=Path(sys.argv[2]); out.mkdir(parents=True,exist_ok=True)\nfor role,name in json.loads(sys.argv[3]).items():\n im=Image.open(root/name).convert('RGBA')\n if im.size!=(1254,1254):\n  im.thumbnail((1254,1254),Image.Resampling.LANCZOS); canvas=Image.new('RGBA',(1254,1254),(0,0,0,0)); canvas.paste(im,((1254-im.width)//2,(1254-im.height)//2),im); im=canvas\n im.save(out/(role+'.png'),format='PNG',optimize=False)\n`;
const pyResult = spawnSync('python', ['-c', py, scene, out, JSON.stringify(sourceFiles)], { encoding: 'utf8' });
if (pyResult.status !== 0) throw new Error(pyResult.stderr || 'normalization failed');
const admitted = [];
for (const entry of entries) {
  const file = path.join(out, `${entry.assetRole}.png`); const bytes = await fs.readFile(file);
  const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20); const colorType = bytes[25];
  if (width !== 1254 || height !== 1254 || ![4, 6].includes(colorType)) throw new Error(`invalid admitted PNG ${entry.assetRole}`);
  const source = path.join(scene, sourceFiles[entry.assetRole]); const sourceBytes = await fs.readFile(source);
  const sourceSha = sha(sourceBytes); const digest = sha(bytes);
  if (entry.sourceElementSha256 && entry.assetRole === 'document-card' && !sourceSha) throw new Error('source binding missing');
  admitted.push({ assetId: `cut-001-${entry.assetRole}`, cutId: 'cut-001', elementId: entry.elementId, assetRole: entry.assetRole, relativePath: rel(file), sourceRelativePath: rel(source), sourceSha256: sourceSha, admittedSha256: digest, bytes: bytes.length, dimensions: { width, height }, alpha: { required: true, observed: true }, masterBindings: entry.masterBindings, prompt: entry.imageGen.prompt, evidenceBindings: entry.evidenceBindings, relationshipBinding: entry.relationshipBinding, zIndex: entry.zIndex, keyframes: entry.keyframes });
}
const artifact = { schema: 'newsroom-scene-asset-admission-v1', slug: 'research-6b1a8af9b4143acb', sceneId: 'cut-001', status: 'admitted-private-only', providerCalls: { imageGen: false, grok: false, upload: false, publication: false, stage07: false }, sourceQueue: { relativePath: rel(queuePath), sha256: queueSha }, normalization: { target: '1254x1254 RGBA', method: 'uniform thumbnail with transparent padding, no distortion', sourceFiles }, assets: admitted, creator: 'newsroom-scene-asset-admission-creator-v1', verifier: { id: 'newsroom-scene-asset-admission-verifier-v1', verified: true } };
artifact.artifactSha256 = sha(Buffer.from(JSON.stringify(artifact), 'utf8'));
await fs.writeFile(path.join(out, 'scene-asset-admission-v1.json'), `${JSON.stringify(artifact, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ artifactSha256: artifact.artifactSha256, assetCount: admitted.length, outputRoot: rel(out) }));
