import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {lstat, readFile, realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
if (manifest.schema !== 'adult-front-rig-study-manifest-v1' || manifest.productionApproved !== false) throw new Error('manifest authority invalid');
for (const asset of manifest.assets) {
  const candidate = path.join(root, asset.relativePath);
  const resolved = await realpath(candidate);
  if (!resolved.toLowerCase().startsWith(`${(await realpath(root)).toLowerCase()}${path.sep}`)) throw new Error(`escaped root: ${asset.relativePath}`);
  if ((await lstat(candidate)).isSymbolicLink()) throw new Error(`symlink rejected: ${asset.relativePath}`);
  const bytes = await readFile(candidate);
  if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`hash mismatch: ${asset.relativePath}`);
}
const python = String.raw`
from PIL import Image
import json,sys
out=[]
for p in sys.argv[1:]:
 im=Image.open(p).convert('RGBA')
 out.append({'size':im.size,'bbox':im.getchannel('A').getbbox()})
print(json.dumps(out))
`;
const packPaths = ['source/appearance-pack-a/front-master-alpha.png', 'source/appearance-pack-b/front-master-alpha-normalized.png'].map((p) => path.join(root, p));
const geometry = JSON.parse(execFileSync('python', ['-c', python, ...packPaths], {encoding: 'utf8'}));
for (const item of geometry) {
  if (item.size[0] !== 1024 || item.size[1] !== 1536) throw new Error('canvas mismatch');
  if (JSON.stringify(item.bbox) !== JSON.stringify([182, 110, 842, 1430])) throw new Error(`alpha bounds mismatch: ${JSON.stringify(item.bbox)}`);
}
console.log('adult-front-rig-v1 valid: 2 packs, shared canvas and alpha bounds, hashes/non-symlink guards pass');
