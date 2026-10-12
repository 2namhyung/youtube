import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync, realpathSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const study = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(study, '..', '..');
const output = path.join(root, 'out', 'studies', 'godot-reusable-front-skeleton-v1');
const files = ['pack-a.avi', 'pack-b.avi', 'shared-skeleton-comparison.mp4'];
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

for (const name of files) {
  const file = path.join(output, name);
  if (!statSync(file).isFile() || realpathSync(file) !== file) throw new Error(`${name} must be a physical file`);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames', '-show_entries', 'format=duration', '-of', 'json', file], {encoding: 'utf8'}));
  const stream = probe.streams[0];
  if (stream.r_frame_rate !== '24/1' || stream.nb_frames !== '72' || Number(probe.format.duration) !== 3) throw new Error(`${name} timing mismatch`);
  if (name.startsWith('pack-') && (stream.width !== 1080 || stream.height !== 1920)) throw new Error(`${name} dimensions mismatch`);
  if (name.startsWith('shared-') && (stream.width !== 1080 || stream.height !== 960)) throw new Error(`${name} dimensions mismatch`);
}

const source = readFileSync(path.join(study, 'main.gd'), 'utf8');
if (!source.includes('SharedFrontSkeleton') || !source.includes('pack_id')) throw new Error('shared skeleton or pack switch missing');
for (const log of ['pack-a-render.log', 'pack-b-render.log']) {
  const value = readFileSync(path.join(output, log), 'utf8');
  if (/WARNING|ERROR/.test(value)) throw new Error(`${log} contains engine warnings/errors`);
}

const manifest = {
  schema: 'private-godot-reusable-skeleton-study-v1',
  status: 'private-review-only',
  productionAuthority: false,
  uploadAllowed: false,
  sharedSkeleton: 'SharedFrontSkeleton',
  safeMotionEnvelope: {upperArmDegrees: 7, forearmDegrees: 16, note: 'Larger acting requires purpose-authored hidden-fill layers.'},
  outputs: Object.fromEntries(files.map((name) => [name, {sha256: sha256(path.join(output, name)), bytes: statSync(path.join(output, name)).size}]))
};
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
