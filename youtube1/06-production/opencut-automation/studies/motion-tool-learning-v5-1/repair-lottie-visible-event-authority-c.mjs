import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const sourceRoot = path.join(root, 'out/studies/motion-tool-learning-v5-1-lottie-sealed-b');
const outputRoot = path.join(root, 'out/studies/motion-tool-learning-v5-1-lottie-sealed-c');
if (fs.existsSync(outputRoot)) throw new Error(`append-only output exists:${outputRoot}`);
fs.mkdirSync(outputRoot, {recursive: true});

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const artifact = file => ({file: relative(file), sha256: sha256(file), bytes: fs.statSync(file).size});
const authority = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'authority.json'), 'utf8'));
const input = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'verifier-input.json'), 'utf8'));
const {width, height} = authority.frameContract;
const pixels = width * height;

function readPgm(file) {
  const bytes = fs.readFileSync(file);
  const match = bytes.subarray(0, 128).toString('ascii').match(/^P5\s+(\d+)\s+(\d+)\s+255\s/);
  if (!match || +match[1] !== width || +match[2] !== height) throw new Error(`invalid mask:${file}`);
  const data = bytes.subarray(match[0].length);
  if (data.length !== pixels) throw new Error(`mask byte count:${file}`);
  return data;
}

function components(mask) {
  let count = 0;
  const seen = new Uint8Array(pixels);
  const stack = new Int32Array(pixels);
  for (let seed = 0; seed < pixels; seed++) {
    if (!mask[seed] || seen[seed]) continue;
    count++;
    let top = 0;
    stack[top++] = seed;
    seen[seed] = 1;
    while (top) {
      const current = stack[--top];
      const x = current % width;
      const y = (current / width) | 0;
      for (const next of [current - 1, current + 1, current - width, current + width]) {
        if (next < 0 || next >= pixels || seen[next] || !mask[next]) continue;
        const nx = next % width;
        const ny = (next / width) | 0;
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
        seen[next] = 1;
        stack[top++] = next;
      }
    }
  }
  return count;
}

const visible = authority.frames.map(frame => {
  const raw = frame.roles.map(role => readPgm(path.resolve(root, role.mask.file)));
  const labels = new Uint8Array(pixels);
  const zOrder = [...frame.roles.keys()].sort((a, b) => frame.roles[a].zOrder - frame.roles[b].zOrder || frame.roles[a].order - frame.roles[b].order);
  for (const roleIndex of zOrder) for (let pixel = 0; pixel < pixels; pixel++) if (raw[roleIndex][pixel]) labels[pixel] = roleIndex + 1;
  return frame.roles.map((_, roleIndex) => components(Uint8Array.from(labels, value => value === roleIndex + 1 ? 255 : 0)));
});

const eventGraph = [];
for (let roleIndex = 0; roleIndex < authority.roleIds.length; roleIndex++) {
  for (let frame = 1; frame < authority.frameContract.frameCount; frame++) {
    const from = visible[frame - 1][roleIndex];
    const to = visible[frame][roleIndex];
    let type;
    if (!from && to) type = 'appear';
    else if (from && !to) type = 'disappear';
    else if (from < to) type = 'split';
    else if (from > to) type = 'merge';
    if (type) eventGraph.push({frame, roleId: authority.roleIds[roleIndex], type, from, to});
  }
}

authority.eventGraph = eventGraph;
const authorityFile = path.join(outputRoot, 'authority.json');
fs.writeFileSync(authorityFile, `${JSON.stringify(authority, null, 2)}\n`);
input.sampleId = 'lottie-v51-neutral-c-visible-event-authority';
input.authority = artifact(authorityFile);
const inputFile = path.join(outputRoot, 'verifier-input.json');
fs.writeFileSync(inputFile, `${JSON.stringify(input, null, 2)}\n`);
const manifest = {
  schema: 'motion-tool-learning-v5.1-lottie-visible-event-authority-repair-c-v1',
  createdAt: new Date().toISOString(),
  creator: artifact(fileURLToPath(import.meta.url)),
  predecessorAuthority: artifact(path.join(sourceRoot, 'authority.json')),
  predecessorInput: artifact(path.join(sourceRoot, 'verifier-input.json')),
  authority: artifact(authorityFile),
  verifierInput: artifact(inputFile),
  repair: 'event graph recomputed from z-order-composited official role masks; no learned measurement or score consumed',
  creatorProvidedScores: false,
  promotionEligible: false,
  productionEligible: false
};
fs.writeFileSync(path.join(outputRoot, 'repair.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({output: relative(outputRoot), eventCount: eventGraph.length, authority: artifact(authorityFile), input: artifact(inputFile)}, null, 2));
