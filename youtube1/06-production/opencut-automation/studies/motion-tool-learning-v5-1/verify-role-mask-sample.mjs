import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifyRoleMasks} from './role-mask-verifier.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const ffmpeg = 'C:/Users/User/tools/ffmpeg-8.1-essentials_build/bin/ffmpeg.exe';
const ffprobe = 'C:/Users/User/tools/ffmpeg-8.1-essentials_build/bin/ffprobe.exe';
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const artifact = file => ({
  file: path.relative(root, file).replaceAll('\\', '/'),
  sha256: sha256(file),
  bytes: fs.statSync(file).size
});

const relativeOutput = process.argv[2];
if (!relativeOutput) throw new Error('usage: node verify-role-mask-sample.mjs <sealed-output-directory>');
const output = path.resolve(root, relativeOutput);
if (!(output === root || output.startsWith(`${root}${path.sep}`))) throw new Error('output containment');
const inputFile = path.join(output, 'verifier-input.json');
const reportFile = path.join(output, 'verifier.json');
if (!fs.existsSync(inputFile)) throw new Error('verifier input missing');
if (fs.existsSync(reportFile)) throw new Error('append-only verifier report exists');

const input = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const result = verifyRoleMasks(input, {workspaceRoot: root, ffmpeg, ffprobe});
const report = {
  schema: 'motion-tool-learning-v5.1-role-mask-verification-report-v1',
  createdAt: new Date().toISOString(),
  verifier: artifact(path.join(here, 'role-mask-verifier.mjs')),
  runner: artifact(fileURLToPath(import.meta.url)),
  tools: {ffmpeg: artifact(ffmpeg), ffprobe: artifact(ffprobe)},
  input: artifact(inputFile),
  result,
  promotionEligible: result.pass,
  productionEligible: false
};
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({report: artifact(reportFile), pass: result.pass, scores: result.scores, agreements: result.agreements, failures: result.failures}, null, 2));
