import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const RISK = Object.freeze({SAFE: 'SAFE', CONDITIONAL: 'CONDITIONAL_EDITORIAL_ILLUSTRATIVE', DENY: 'HIGH_RISK_DENY'});
const DISCLOSURE = '자료사진 · 사건과 무관';
const LEGACY = new Set(['film-camera', 'optical-disc-drive', 'feature-phone', 'crt-display', 'old-document', 'pre-2020-current-device']);
function independentAssignmentCheck(row) {
  const errors = [];
  if (!row || !/^[^:]+:cut-\d{3}$/u.test(row.assignmentKey || '')) errors.push('composite-assignment-key');
  if (!Object.values(RISK).includes(row.riskTier)) errors.push('risk-tier');
  for (const key of ['copyrightUseStatus', 'editorialContextStatus', 'youtubeOriginalityStatus', 'claimRisk']) if (typeof row[key] !== 'string' || !row[key]) errors.push(key);
  if (row.riskTier === RISK.DENY && row.coverageEligible) errors.push('deny-cannot-cover');
  if (row.riskTier === RISK.CONDITIONAL) {
    if (row.disclosure !== DISCLOSURE) errors.push('conditional-disclosure');
    if (!row.narrationConceptMatch || row.actualEvidenceClaim || row.actualLocationClaim || row.actualPartyClaim) errors.push('conditional-claim-boundary');
    if (row.identifiesPrivatePerson || row.identifiesMinor || row.identifiesVictim || row.identifiesSuspect) errors.push('conditional-person-boundary');
    if (row.providerInputStatus !== 'denied' || row.editScope !== 'local-only') errors.push('conditional-local-only');
    if (!row.sourceUrl || !row.licenseCode || !row.claimRationale) errors.push('conditional-evidence');
    if (LEGACY.has(row.visualClass)) errors.push('conditional-legacy-visual');
  }
  if (row.coverageEligible) {
    if (!['cleared', 'cleared-with-attribution'].includes(row.copyrightUseStatus)) errors.push('copyright-not-cleared');
    const ypp = row.yppTransformation || {};
    if (!ypp.substantialNarration || !ypp.authoredMotion || !ypp.annotation || !/(?:pan|zoom)/iu.test(ypp.motionPlan || '') || ypp.staticSlideshow || ypp.minimalEdit) errors.push('ypp-transformation');
    if (!row.displaySha256 || !row.sourceSha256 || !row.pHash) errors.push('media-hashes');
  }
  return errors;
}
function independentReuseCheck(rows, total) {
  const errors = []; const groups = new Map();
  for (const row of rows.filter(item => item.coverageEligible)) groups.set(row.sourceSha256, [...(groups.get(row.sourceSha256) || []), row]);
  for (const [source, bucket] of groups) {
    bucket.sort((a, b) => a.order - b.order);
    if (bucket.length > 2) errors.push(`source-reuse-count:${source}`);
    if (bucket.length === 2 && (bucket[1].order !== bucket[0].order + 1 || !bucket.every(item => item.continuityRationale && item.authoredFramingId) || bucket[0].authoredFramingId === bucket[1].authoredFramingId)) errors.push(`source-reuse-contiguity-or-framing:${source}`);
    if (bucket.reduce((sum, item) => sum + item.durationSeconds, 0) / total > 0.15 + 1e-9) errors.push(`source-duration-cap:${source}`);
  }
  return errors;
}

const root = path.resolve(import.meta.dirname, '..'); const study = path.join(root, 'out', 'studies', 'three-story-domestic-photo-admission-v5'); const sha = value => crypto.createHash('sha256').update(value).digest('hex');
async function latest() { const entries = (await fs.readdir(study, {withFileTypes: true})).filter(item => item.isDirectory() && item.name.startsWith('run-')).sort((a, b) => b.name.localeCompare(a.name)); if (!entries.length) throw new Error('no-run'); return path.join(study, entries[0].name); }
async function verify() {
  const runDir = await latest(); const bytes = await fs.readFile(path.join(runDir, 'admission-with-contact-sheets.json')); const artifact = JSON.parse(bytes); const errors = [];
  if (artifact.schema !== 'three-story-domestic-photo-admission-v5') errors.push('schema'); if (artifact.matrix.length !== 53 || artifact.counts.requestedRealPhotoCuts !== 46 || artifact.counts.generatedCuts !== 7) errors.push('sealed-counts');
  if (artifact.policy?.conditionalDisclosure !== DISCLOSURE || artifact.policy?.providerInput !== 'denied' || artifact.policy?.reuse?.maximumContiguousCutsPerPrimary !== 2 || artifact.policy?.reuse?.maximumStoryDurationFractionPerPrimary !== 0.15 || !Array.isArray(artifact.policy?.deniedLegacyVisualClasses) || !artifact.policy.deniedLegacyVisualClasses.includes('film-camera') || !artifact.policy.deniedLegacyVisualClasses.includes('old-document')) errors.push('policy');
  if (new Set(artifact.matrix.map(item => item.assignmentKey)).size !== 53) errors.push('assignment-keys');
  for (const row of artifact.matrix.filter(item => item.coverageEligible)) errors.push(...independentAssignmentCheck(row).map(error => `${row.assignmentKey}:${error}`));
  for (const asset of artifact.assets) { if (LEGACY.has(asset.temporalClass) || LEGACY.has(asset.visualClass)) errors.push(`legacy-asset:${asset.assetId}`); for (const field of ['source', 'display', 'rightsEvidence']) { const record = asset[field]; const file = path.resolve(root, record.relativePath); const real = await fs.realpath(file); const stat = await fs.lstat(file); const content = await fs.readFile(file); if (real !== file || stat.isSymbolicLink() || sha(content) !== record.sha256 || content.length !== record.bytes) errors.push(`physical:${asset.assetId}:${field}`); } }
  for (const story of artifact.stories) { const rows = artifact.matrix.filter(item => item.authorityStoryId === story.storyId); const total = rows.reduce((sum, item) => sum + item.durationSeconds, 0); const covered = rows.filter(item => item.coverageEligible).reduce((sum, item) => sum + item.durationSeconds, 0); errors.push(...independentReuseCheck(rows, total).map(error => `${story.slug}:${error}`)); const ratio = covered / total; const remaining = rows.filter(item => item.sourceClass !== 'grok-generated' && !item.coverageEligible).length; if (Math.abs(story.totalDurationSeconds - total) > 1e-6 || Math.abs(story.admittedRealPhotoDurationSeconds - covered) > 1e-6 || Math.abs(story.authoredDurationCoverage - ratio) > 1e-6 || story.remainingRealPhotoCuts !== remaining || story.approved !== (ratio >= 0.8)) errors.push(`coverage:${story.slug}`); const sheet = path.resolve(root, story.contactSheet.relativePath); const sheetBytes = await fs.readFile(sheet); if (sha(sheetBytes) !== story.contactSheet.sha256 || story.contactSheet.visualReview !== 'primary-agent-inspected-source-and-final-sheet') errors.push(`contact-sheet:${story.slug}`); }
  if (artifact.completion.complete || artifact.completion.admissionAuthorized || artifact.stories.some(item => item.approved)) errors.push('fail-closed'); if (Object.values(artifact.production).some(Boolean)) errors.push('production');
  const report = {schema: 'three-story-domestic-photo-admission-v5-verifier', verifierMode: 'independent-policy-reimplementation', verifiedAt: new Date().toISOString(), admissionSha256: sha(bytes), counts: artifact.counts, stories: artifact.stories.map(({storyId, slug, assignedRealPhotoCuts, realPhotoNeedCount, remainingRealPhotoCuts, totalDurationSeconds, admittedRealPhotoDurationSeconds, authoredDurationCoverage, approved}) => ({storyId, slug, assignedRealPhotoCuts, realPhotoNeedCount, remainingRealPhotoCuts, totalDurationSeconds, admittedRealPhotoDurationSeconds, authoredDurationCoverage, approved})), errors, verified: errors.length === 0, production: artifact.production}; let reportName = 'verifier.json'; try { await fs.access(path.join(runDir, reportName)); reportName = `verifier-rerun-${new Date().toISOString().replaceAll(/[-:.]/gu, '')}.json`; } catch {} await fs.writeFile(path.join(runDir, reportName), `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'}); if (!report.verified) throw new Error(errors.join(',')); console.log(JSON.stringify({runDir, reportFile: reportName, ...report}, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) verify().catch(error => {console.error(error.stack || error); process.exitCode = 1;});
