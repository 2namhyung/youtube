import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(here, 'seal-role-mask-samples-a.mjs');
const root = path.resolve(here, '../..');
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const wrapperSha = sha256(fileURLToPath(import.meta.url));

let source = fs.readFileSync(base, 'utf8');
source = source
  .replace('learnedGroups.map(g=>union(g.map(r=>learnedAlpha[r][f])));', 'learnedGroups.map(g=>union(g.map(r=>learnedAlpha[r][f]))));')
  .replaceAll('motion-tool-learning-v5-1-gsap-neutral-b', 'motion-tool-learning-v5-1-gsap-neutral-c')
  .replaceAll('motion-tool-learning-v5-1-gsap-sealed-a', 'motion-tool-learning-v5-1-gsap-sealed-c')
  .replaceAll("sampleId:'gsap-v51-neutral-a'", "sampleId:'gsap-v51-neutral-c'");

const lottieCall = ";seal({out:'out/studies/motion-tool-learning-v5-1-lottie-sealed-a'";
const lottieOffset = source.indexOf(lottieCall);
if (lottieOffset < 0) throw new Error('lottie truncation anchor missing');
source = `${source.slice(0, lottieOffset)};\n`;

const temporary = path.join(here, `.motion-v51-gsap-seal-c-${process.pid}.mjs`);
fs.writeFileSync(temporary, source);
try {
  await import(pathToFileURL(temporary));
  const out = path.join(root, 'out/studies/motion-tool-learning-v5-1-gsap-sealed-c');
  const generated = path.join(out, 'generated-sealer.mjs');
  fs.writeFileSync(generated, source);
  fs.writeFileSync(path.join(out, 'wrapper.attestation.json'), `${JSON.stringify({
    schema: 'motion-tool-learning-v5.1-gsap-seal-c-wrapper-v1',
    wrapper: {file: 'studies/motion-tool-learning-v5-1/seal-gsap-role-mask-sample-c.mjs', sha256: wrapperSha},
    base: {file: 'studies/motion-tool-learning-v5-1/seal-role-mask-samples-a.mjs', sha256: sha256(base)},
    generated: {file: 'generated-sealer.mjs', sha256: sha256(generated)},
    changes: ['base syntax repair', 'GSAP neutral-c binding', 'GSAP-only append-only output']
  }, null, 2)}\n`);
} finally {
  fs.rmSync(temporary, {force: true});
}
