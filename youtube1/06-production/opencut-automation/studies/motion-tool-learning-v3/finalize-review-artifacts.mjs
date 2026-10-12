import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT, TOOL_IDS, sha256, hashJson, readPngSize} from './common.mjs';

const target = path.resolve(process.argv[2] || path.join(ROOT, 'out', 'studies', 'motion-tool-learning-v3-full-c'));
const verifier = JSON.parse(fs.readFileSync(path.join(target, 'verifier.json'), 'utf8'));
const negative = JSON.parse(fs.readFileSync(path.join(target, 'negative-tests.json'), 'utf8'));
if (!verifier.verified || !verifier.promotionEligible || verifier.sampleCount !== 60 || verifier.nearDuplicatePairs.length || !negative.passed) throw new Error('review artifact finalization blocked');
const artifacts = [];
for (const tool of TOOL_IDS) for (const suffix of ['contact-sheet.png', 'reel.mkv']) {
  const file = path.join(target, `${tool}-${suffix}`);
  if (!fs.existsSync(file)) throw new Error(`review artifact missing: ${file}`);
  const record = {tool, kind: suffix === 'contact-sheet.png' ? 'contact-sheet' : 'reel', file: path.basename(file), sha256: sha256(file), bytes: fs.statSync(file).size};
  if (record.kind === 'contact-sheet') record.dimensions = readPngSize(file);
  artifacts.push(record);
}
const combined = path.join(target, 'all-tools-contact-sheet.png');
if (fs.existsSync(combined)) artifacts.push({kind: 'combined-contact-sheet', file: path.basename(combined), sha256: sha256(combined), bytes: fs.statSync(combined).size, dimensions: readPngSize(combined)});
const report = {schema: 'motion-tool-learning-review-artifacts-v3', verifierSha256: verifier.verifierSha256, negativeTests: negative, artifacts};
report.reportSha256 = hashJson(report);
fs.writeFileSync(path.join(target, 'review-artifacts.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({artifactCount: artifacts.length, reportSha256: report.reportSha256}));

if (import.meta.url !== pathToFileURL(process.argv[1] || '').href) throw new Error('run as CLI');
