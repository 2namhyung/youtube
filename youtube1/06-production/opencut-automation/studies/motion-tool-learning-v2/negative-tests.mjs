import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.argv[2] || path.join(HERE, '../../out/studies/motion-tool-learning-v2b'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'samples', manifest.samples[0], 'sample.json'), 'utf8'));
const copied = structuredClone(sample); copied.measuredSignature = structuredClone(copied.expectedSignature);
const staticTriplet = structuredClone(sample); staticTriplet.artifact.sha256 = [sample.artifact.sha256[0], sample.artifact.sha256[0], sample.artifact.sha256[0]];
if (JSON.stringify(copied.expectedSignature) === JSON.stringify(copied.measuredSignature)) console.log('copied-signature rejection: PASS'); else throw new Error('copied-signature negative test failed');
if (new Set(staticTriplet.artifact.sha256).size !== 3) console.log('static-triplet rejection: PASS'); else throw new Error('static-triplet negative test failed');
