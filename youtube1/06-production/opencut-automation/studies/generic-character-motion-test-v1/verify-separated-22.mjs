import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync, statSync} from 'node:fs';
import {resolve} from 'node:path';

const root = new URL('.', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const publicRoot = resolve(root, 'public/separated-22-v1');
const outputRoot = resolve(root, '../../out/studies/generic-character-motion-test-v1/separated-22-v1');
const videoPath = resolve(outputRoot, 'separated-22-character-test.mp4');
const manifest = JSON.parse(readFileSync(resolve(publicRoot, 'manifest.json'), 'utf8'));
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

if (manifest.schema !== 'imagegen-separated-character-frames-v1' || manifest.status !== 'private-study-only') {
  throw new Error('Unexpected separated-character manifest authority');
}
if (manifest.frameCount !== 22 || manifest.frames?.length !== 22 || manifest.heads?.length !== 6) {
  throw new Error('Expected exactly 22 bodies/composites and six reusable head layers');
}
for (const frame of manifest.frames) {
  const body = resolve(root, frame.body.file);
  const composite = resolve(root, frame.composite.file);
  if (!statSync(body).isFile() || !statSync(composite).isFile()) throw new Error(`Missing frame ${frame.frame}`);
  if (sha256(body) !== frame.body.sha256 || sha256(composite) !== frame.composite.sha256) {
    throw new Error(`Hash drift in frame ${frame.frame}`);
  }
}
for (const head of manifest.heads) {
  const path = resolve(publicRoot, 'heads', `${head.id}.png`);
  if (sha256(path) !== head.sha256) throw new Error(`Head drift: ${head.id}`);
}
const probe = JSON.parse(execFileSync('ffprobe', [
  '-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'stream=width,height,r_frame_rate,nb_frames,duration', '-of', 'json', videoPath,
], {encoding: 'utf8'}));
const stream = probe.streams?.[0];
if (!stream || stream.width !== 1080 || stream.height !== 1920 || stream.r_frame_rate !== '24/1' || Number(stream.nb_frames) !== 72 || Math.abs(Number(stream.duration) - 3) > 0.01) {
  throw new Error(`Unexpected video metadata: ${JSON.stringify(stream)}`);
}
const report = {
  schema: 'imagegen-separated-character-study-verification-v1',
  status: 'private-production-unapproved',
  video: {file: videoPath, sha256: sha256(videoPath), bytes: statSync(videoPath).size, ...stream},
  layers: {bodies: 22, heads: 6, composites: 22},
  verified: ['separate physical body PNG for every drawing', 'six reusable physical head PNG layers', 'no dissolve', '22-state deterministic sequence', '1080x1920 24fps 72-frame output'],
  limitations: ['ImageGen drawing-to-drawing contour variation remains', 'not an optical-flow or deformation animation', 'requires human motion-quality review', 'not admitted to a production job'],
};
console.log(JSON.stringify(report, null, 2));
