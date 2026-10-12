import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(root, 'output');
const source = path.resolve(root, '..', '..', 'reference-reverse-v1', 'source', 'VQazcEuV9Xw.mp4');
const ffprobe = process.env.FFPROBE || 'C:/Users/User/tools/ffmpeg-8.1-essentials_build/bin/ffprobe.exe';
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const bytes = (file) => fs.statSync(file).size;
const probe = (file) => {
  const result = spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,r_frame_rate,nb_frames', '-of', 'json', file], {encoding: 'utf8', shell: false});
  if (result.status !== 0) throw new Error(`ffprobe failed for ${file}`);
  return JSON.parse(result.stdout);
};
const fileRecord = (file, role) => ({path: path.relative(root, file).replaceAll('\\', '/'), role, sha256: sha256(file), bytes: bytes(file), probe: probe(file)});
const hashRecord = (file, role) => ({path: path.relative(root, file).replaceAll('\\', '/'), role, sha256: sha256(file), bytes: bytes(file)});
const records = [
  fileRecord(source, 'reference-read-only'),
  fileRecord(path.join(out, 'reconstruction-only.mp4'), 'own-reconstruction'),
  fileRecord(path.join(out, 'comparison.mp4'), 'local-comparison')
];
const manifest = {
  schema: 'reference-reverse-v2-reconstruction-manifest-v2',
  createdAt: new Date().toISOString(),
  reference: {videoId: 'VQazcEuV9Xw', analysisOnly: true},
  assets: records,
  authoring: [
    hashRecord(path.join(root, 'config', 'motion-parameters.json'), 'consumed-motion-parameters'),
    hashRecord(path.join(root, 'src', 'scene.jsx'), 'own-svg-scene-source'),
    hashRecord(path.join(out, 'reconstruction-contact.jpg'), 'timestamped-own-contact-sheet'),
    hashRecord(path.join(out, 'comparison-contact.jpg'), 'timestamped-comparison-contact-sheet')
  ],
  sampleFrames: [0, 40, 80, 102, 103, 130, 142, 232, 250, 262],
  geometryEvidence: {
    coordinateSystem: 'local 360x338 scene scaled 1.5 into x=0,y=246,w=540,h=507; background and subjects share the clip',
    droneFarmer: 'both grip hands use the exact lower-bar y=99 anchor above the head; the parent group starts with the farmer outside the viewport and ends with the full farmer visible while the drone top is cropped',
    robot: 'mouth y=128 is inside head y=25..160; raised index arm is shoulder-connected on viewer-left; the left-entering ladle bowl and local-y=275..320 glitch caption are visible in the final viewport',
    reviewMethod: 'manual review of timestamped decoded comparison frames; no automatic similarity pass'
  },
  rejectedPredecessor: 'output/rejected-20260923-geometry-v1',
  audio: {reconstruction: false, comparison: false, voiceSynthesis: false},
  notices: ['own reconstruction uses code-drawn SVG assets only', 'reference remains local analysis input', 'config/motion-parameters.json is consumed by src/scene.jsx', 'no original easing, pixel style, similarity, or production pass is claimed'],
  gates: {productionEligible: false, promotionEligible: false, similarityPassClaim: false}
};
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
