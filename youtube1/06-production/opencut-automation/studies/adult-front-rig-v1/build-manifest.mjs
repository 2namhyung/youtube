import {createHash} from 'node:crypto';
import {readFile, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const relativeFiles = [
  'front-rig-spec.json',
  'source/appearance-pack-a/front-master-chroma.png',
  'source/appearance-pack-a/front-master-alpha.png',
  'source/appearance-pack-b/front-master-chroma.png',
  'source/appearance-pack-b/front-master-alpha-normalized.png'
];
const assets = [];
for (const relativePath of relativeFiles) {
  const absolutePath = path.join(root, relativePath);
  const bytes = await readFile(absolutePath);
  const metadata = await stat(absolutePath);
  assets.push({
    relativePath: relativePath.replaceAll('\\', '/'),
    bytes: metadata.size,
    sha256: createHash('sha256').update(bytes).digest('hex')
  });
}
const manifest = {
  schema: 'adult-front-rig-study-manifest-v1',
  status: 'private-review-candidate',
  productionApproved: false,
  parentAuthority: {
    id: 'generic-anonymous-adult-01',
    sha256: '8be0b62640316bb0311d171bc1e5db599740092ae1daa73377b15b55395b1136'
  },
  appearancePacks: ['appearance-pack-a', 'appearance-pack-b'],
  assets
};
await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote manifest.json (${assets.length} assets)`);
