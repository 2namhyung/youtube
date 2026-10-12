import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const auditRoot = path.join(root, 'out', 'studies', 'three-story-domestic-photo-completion-audit-v1');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

function phash(file) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=16:16,format=gray', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1']);
  const average = raw.reduce((sum, value) => sum + value, 0) / raw.length;
  let output = '';
  for (let index = 0; index < raw.length; index += 4) { let nibble = 0; for (let offset = 0; offset < 4; offset += 1) if (raw[index + offset] >= average) nibble |= 1 << (3 - offset); output += nibble.toString(16); }
  return output;
}

async function latestRun() {
  const entries = (await fs.readdir(auditRoot, {withFileTypes: true})).filter(entry => entry.isDirectory() && entry.name.startsWith('run-')).sort((a, b) => b.name.localeCompare(a.name));
  if (!entries.length) throw new Error('no-audit-run');
  return path.join(auditRoot, entries[0].name);
}

async function verify() {
  const runDir = await latestRun();
  const bytes = await fs.readFile(path.join(runDir, 'completion-audit.json'));
  const audit = JSON.parse(bytes);
  const errors = [];
  if (audit.schema !== 'three-story-domestic-photo-completion-audit-v1') errors.push('schema');
  const keys = audit.matrix.map(item => item.assignmentKey);
  if (new Set(keys).size !== keys.length) errors.push('duplicate-assignment-key');
  if (audit.matrix.length !== 53 || audit.counts.requestedRealPhotoCuts !== 46 || audit.counts.generatedCuts !== 7) errors.push('sealed-cut-counts');
  const approved = audit.matrix.filter(item => item.assignmentStatus === 'approved');
  if (approved.length !== audit.assets.length || approved.length !== audit.counts.approvedAssignments) errors.push('approved-count');
  const sourceHashes = new Set();
  for (const asset of audit.assets) {
    if (!/^nurse-pesticide-coffee:cut-(001|011)$/u.test(asset.assignmentKey)) errors.push(`semantic-binding:${asset.assignmentKey}`);
    if (asset.captureYear < 2020 || asset.temporalEra !== 'modern-2020s' || Object.values(asset.anachronismFlags).some(Boolean)) errors.push(`temporal:${asset.assetId}`);
    if (asset.domesticOrigin.originCountry !== 'KR' || asset.domesticOrigin.captureCountry !== 'KR' || asset.domesticOrigin.rightsholderCountry !== 'KR') errors.push(`domestic:${asset.assetId}`);
    if (asset.license.classification !== 'korean-cc-by' || asset.providerInputStatus !== 'denied') errors.push(`rights:${asset.assetId}`);
    const file = path.resolve(root, asset.evidence.original.relativePath);
    const real = await fs.realpath(file); const stat = await fs.lstat(file); const fileBytes = await fs.readFile(file);
    if (real !== file || stat.isSymbolicLink() || sha(fileBytes) !== asset.evidence.original.sha256 || fileBytes.length !== asset.evidence.original.bytes) errors.push(`physical:${asset.assetId}`);
    if (phash(file) !== asset.evidence.pHash) errors.push(`phash:${asset.assetId}`);
    if (sourceHashes.has(asset.evidence.original.sha256)) errors.push(`source-reuse:${asset.assetId}`); sourceHashes.add(asset.evidence.original.sha256);
    const rights = path.resolve(root, asset.evidence.itemPage.relativePath); const rightsBytes = await fs.readFile(rights);
    if (sha(rightsBytes) !== asset.evidence.itemPage.sha256 || !rightsBytes.toString('utf8').includes('CC BY')) errors.push(`rights-file:${asset.assetId}`);
  }
  for (const story of audit.stories) {
    const rows = audit.matrix.filter(item => item.authorityStoryId === story.storyId);
    const total = rows.reduce((sum, item) => sum + item.durationSeconds, 0);
    const covered = rows.filter(item => item.assignmentStatus === 'approved').reduce((sum, item) => sum + item.durationSeconds, 0);
    const ratio = covered / total;
    if (Math.abs(story.totalDurationSeconds - total) > 0.00001 || Math.abs(story.approvedRealPhotoDurationSeconds - covered) > 0.00001 || Math.abs(story.authoredDurationCoverage - ratio) > 0.000001) errors.push(`coverage:${story.slug}`);
    if (story.approved !== (ratio >= 0.8 && story.uniquePrimaryRatio >= 0.9)) errors.push(`story-approval:${story.slug}`);
  }
  if (audit.completion.complete !== false || audit.completion.admissionAuthorized !== false || audit.stories.some(story => story.approved)) errors.push('fail-closed-status');
  if (Object.values(audit.production).some(Boolean)) errors.push('production-authority');
  const report = {schema: 'three-story-domestic-photo-completion-audit-verifier-v1', verifiedAt: new Date().toISOString(), auditSha256: sha(bytes), cutRows: audit.matrix.length, requestedRealPhotoCuts: audit.counts.requestedRealPhotoCuts, approvedAssignments: audit.counts.approvedAssignments, blockedRealPhotoCuts: audit.counts.blockedRealPhotoCuts, uniqueApprovedPrimary: sourceHashes.size, stories: audit.stories.map(story => ({storyId: story.storyId, slug: story.slug, approvedAssignments: story.approvedAssignmentCount, needed: story.realPhotoNeedCount, authoredDurationCoverage: story.authoredDurationCoverage, approved: story.approved})), complete: audit.completion.complete, admissionAuthorized: audit.completion.admissionAuthorized, production: audit.production, errors, verified: errors.length === 0};
  const canonicalReport = path.join(runDir, 'verifier.json');
  let reportPath = canonicalReport;
  try {
    await fs.access(canonicalReport);
    reportPath = path.join(runDir, `verifier-rerun-${new Date().toISOString().replaceAll(/[-:.]/gu, '').replace('Z', 'Z')}.json`);
  } catch {}
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
  if (!report.verified) throw new Error(`verification-failed:${errors.join(',')}`);
  console.log(JSON.stringify({runDir, reportPath, ...report}, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) verify().catch(error => {console.error(error.stack || error); process.exitCode = 1;});
