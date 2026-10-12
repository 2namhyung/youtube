import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {FFMPEG} from './common.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.argv[2] || path.join(HERE, '../../out/studies/motion-tool-learning-v3-pilot-a'));
const VERIFY = path.join(HERE, 'verify-v3.mjs');
const cases = [];
const hashJson = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function expectFail(name, mutate) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), `mtl-v3-negative-${name}-`));
  fs.cpSync(ROOT, target, {recursive: true});
  try {
    mutate(target);
    const result = spawnSync(process.execPath, [VERIFY, target], {encoding: 'utf8', windowsHide: true});
    if (result.status === 0) throw new Error(`${name}: verifier accepted invalid fixture`);
    const lines = String(result.stderr).trim().split(/\r?\n/u);
    cases.push({name, rejected: true, diagnostic: lines.find(line => /Error:/u.test(line)) || lines[0] || `exit ${result.status}`});
  } finally { fs.rmSync(target, {recursive: true, force: true}); }
}

function expectUnverified(name, mutate) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), `mtl-v3-negative-${name}-`));
  fs.cpSync(ROOT, target, {recursive: true});
  try {
    mutate(target);
    const result = spawnSync(process.execPath, [VERIFY, target], {encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024, env: {...process.env, MOTION_V3_FAIL_FAST: '1'}});
    if (result.status !== 0) { const lines = String(result.stderr).trim().split(/\r?\n/u); cases.push({name, rejected: true, diagnostic: lines.find(line => /Error:/u.test(line)) || lines[0] || `exit ${result.status}`}); return; }
    const report = JSON.parse(fs.readFileSync(path.join(target, 'verifier.json'), 'utf8'));
    if (report.verified !== false || report.promotionEligible !== false) throw new Error(`${name}: invalid fixture remained eligible`);
    cases.push({name, rejected: true, diagnostic: report.promotionBlockers.join('; ') || 'verified=false'});
  } finally { fs.rmSync(target, {recursive: true, force: true}); }
}

function resealSample(file, sample) {
  delete sample.recordSha256; sample.recordSha256 = hashJson(sample); fs.writeFileSync(file, JSON.stringify(sample, null, 2) + '\n');
}

expectFail('artifact-byte-drift', target => {
  const creator = JSON.parse(fs.readFileSync(path.join(target, 'creator.json'), 'utf8'));
  const file = path.join(target, 'samples', creator.samples[0], 'sample.mkv');
  fs.appendFileSync(file, Buffer.from([0]));
});
expectFail('creator-score-injection', target => {
  const creator = JSON.parse(fs.readFileSync(path.join(target, 'creator.json'), 'utf8'));
  const file = path.join(target, 'samples', creator.samples[0], 'creator.sample.json');
  const sample = JSON.parse(fs.readFileSync(file, 'utf8')); sample.score = {total: 100, status: 'passed'}; fs.writeFileSync(file, JSON.stringify(sample));
});
expectFail('duplicate-mechanic-binding', target => {
  const creator = JSON.parse(fs.readFileSync(path.join(target, 'creator.json'), 'utf8'));
  const [a, b] = creator.samples.slice(0, 2); const aFile = path.join(target, 'samples', a, 'creator.sample.json'); const bFile = path.join(target, 'samples', b, 'creator.sample.json');
  const first = JSON.parse(fs.readFileSync(aFile, 'utf8')); const second = JSON.parse(fs.readFileSync(bFile, 'utf8')); second.topic = first.topic; delete second.recordSha256; second.recordSha256 = hashJson(second); fs.writeFileSync(bFile, JSON.stringify(second));
});
expectFail('authored-execution-evidence-drift', target => {
  const creator = JSON.parse(fs.readFileSync(path.join(target, 'creator.json'), 'utf8')); const sampleDir = path.join(target, 'samples', creator.samples[0]); const sample = JSON.parse(fs.readFileSync(path.join(sampleDir, 'creator.sample.json'), 'utf8'));
  fs.appendFileSync(path.join(sampleDir, sample.creatorInvocation.authoredExecutionEvidence.file), '\n<!-- drift -->\n');
});
expectFail('remote-runtime-injection', target => {
  const creator = JSON.parse(fs.readFileSync(path.join(target, 'creator.json'), 'utf8')); const sampleDir = path.join(target, 'samples', creator.samples[0]); const sampleFile = path.join(sampleDir, 'creator.sample.json'); const sample = JSON.parse(fs.readFileSync(sampleFile, 'utf8')); const evidenceFile = path.join(sampleDir, sample.creatorInvocation.authoredExecutionEvidence.file);
  fs.appendFileSync(evidenceFile, '\n<script src="https://invalid.example/runtime.js"></script>\n'); sample.creatorInvocation.authoredExecutionEvidence.sha256 = createHash('sha256').update(fs.readFileSync(evidenceFile)).digest('hex'); sample.creatorInvocation.authoredExecutionEvidence.bytes = fs.statSync(evidenceFile).size; resealSample(sampleFile, sample);
});
expectUnverified('static-48-frame-video', target => {
  const creator = JSON.parse(fs.readFileSync(path.join(target, 'creator.json'), 'utf8')); const sampleDir = path.join(target, 'samples', creator.samples[0]); const sampleFile = path.join(sampleDir, 'creator.sample.json'); const sample = JSON.parse(fs.readFileSync(sampleFile, 'utf8')); const artifact = path.join(sampleDir, sample.artifact.file); const still = path.join(sampleDir, 'frame-0001.png');
  const result = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-loop', '1', '-framerate', '24', '-i', still, '-frames:v', '48', '-c:v', 'ffv1', '-level', '3', '-y', artifact], {windowsHide: true, encoding: 'utf8'}); if (result.status !== 0) throw new Error(result.stderr); sample.artifact.sha256 = createHash('sha256').update(fs.readFileSync(artifact)).digest('hex'); sample.artifact.bytes = fs.statSync(artifact).size; resealSample(sampleFile, sample);
});
expectUnverified('within-tool-video-copy', target => {
  const creator = JSON.parse(fs.readFileSync(path.join(target, 'creator.json'), 'utf8')); const [a, b] = creator.samples.slice(0, 2); const aDir = path.join(target, 'samples', a); const bDir = path.join(target, 'samples', b); const bFile = path.join(bDir, 'creator.sample.json'); const source = JSON.parse(fs.readFileSync(path.join(aDir, 'creator.sample.json'), 'utf8')); const sample = JSON.parse(fs.readFileSync(bFile, 'utf8')); const sourceArtifact = path.join(aDir, source.artifact.file); const artifact = path.join(bDir, sample.artifact.file); fs.copyFileSync(sourceArtifact, artifact); sample.artifact.sha256 = createHash('sha256').update(fs.readFileSync(artifact)).digest('hex'); sample.artifact.bytes = fs.statSync(artifact).size; sample.artifact.probe = source.artifact.probe; resealSample(bFile, sample);
});
const report = {schema: 'motion-tool-learning-negative-tests-v3', passed: cases.length === 7, cases};
if (process.argv[3]) fs.writeFileSync(path.resolve(process.argv[3]), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
