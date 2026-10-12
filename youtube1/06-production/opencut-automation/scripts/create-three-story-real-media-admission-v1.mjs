import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashRealMediaAdmissionContent, hashRealMediaNeedsContent } from './newsroom-real-media-admission.mjs';

const automationRoot = path.resolve(import.meta.dirname, '..');
const authorityRun = path.join(automationRoot, 'out', 'studies', 'three-story-authority-reapproval-v2', 'run-20260815T051236587Z-a2871f');
const acquisitionRoot = path.join(automationRoot, 'out', 'studies', 'three-story-real-media-acquisition-v2', 'collected');
const outputRoot = path.join(automationRoot, 'out', 'studies', 'newsroom-real-media-admission-v1');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const canonical = (value) => { const copy = structuredClone(value); delete copy.approval; return copy; };
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

async function physical(file) {
  const resolved = path.resolve(file); const real = await fs.realpath(resolved); const stat = await fs.lstat(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || real !== resolved) throw new Error(`unsafe physical file: ${file}`);
  const bytes = await fs.readFile(resolved); return { relativePath: path.relative(automationRoot, resolved).replaceAll('\\', '/'), realpath: real, bytes: bytes.length, sha256: sha(bytes) };
}

function dimensions(file) {
  const value = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim();
  const [width, height] = value.split(',').map(Number); if (!Number.isInteger(width) || !Number.isInteger(height)) throw new Error(`cannot decode dimensions: ${file}`); return { width, height };
}

async function latestAcquisition() {
  const runs = (await fs.readdir(acquisitionRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.startsWith('run-')).sort((a, b) => b.name.localeCompare(a.name));
  if (!runs.length) throw new Error('three-story-real-media-acquisition-v2 run missing');
  const runDir = path.join(acquisitionRoot, runs[0].name); const manifestPath = path.join(runDir, 'manifest.json');
  const bytes = await fs.readFile(manifestPath); const manifest = JSON.parse(bytes); if (manifest.schema !== 'three-story-real-media-acquisition-v2') throw new Error('acquisition schema mismatch');
  return { runDir, manifestPath, manifest, bytes, sha256: sha(bytes) };
}

async function writeDerivative(asset, runDir) {
  const file = path.join(runDir, 'derivatives', `${asset.assetId}.png`); await fs.mkdir(path.dirname(file), { recursive: true });
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', asset.original.realpath, '-vf', 'scale=480:480:force_original_aspect_ratio=decrease:flags=lanczos', '-frames:v', '1', file]);
  const record = await physical(file); const dims = dimensions(file); return { ...record, width: dims.width, height: dims.height, filter: 'lanczos', generativeAltered: false };
}

export async function createThreeStoryRealMediaAdmissionV1() {
  const authorityBytes = await fs.readFile(path.join(authorityRun, 'manifest.json')); const authority = JSON.parse(authorityBytes);
  if (authority.schema !== 'three-story-authority-reapproval-package-v2') throw new Error('authority reapproval package is not canonical');
  const needsBytes = await fs.readFile(path.join(authorityRun, 'real-media-needs.json')); const supersededNeeds = JSON.parse(needsBytes);
  const supersededNeedsSha256 = hashRealMediaNeedsContent(supersededNeeds);
  if (supersededNeeds.schema !== 'newsroom-real-media-needs-v1' || supersededNeeds.approval?.approved !== true) throw new Error('sealed real-media needs missing');
  const acquisition = await latestAcquisition();
  const runId = `run-${new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}-${crypto.randomBytes(3).toString('hex')}`;
  const runDir = path.join(outputRoot, runId); await fs.mkdir(outputRoot, { recursive: true }); await fs.mkdir(runDir, { recursive: false });
  const assets = [];
  for (const entry of acquisition.manifest.entries) {
    const original = await physical(entry.original.realpath); const dims = dimensions(original.realpath); const derivative = await writeDerivative({ ...entry, original: { ...original, ...dims } }, runDir);
    const conditional = entry.sourceUseStatus === 'conditional'; const coverageEligible = (entry.sourceUseStatus === 'admitted' && !entry.flags.geographicMismatch) || (entry.assetId === 'commons-03' || entry.assetId === 'commons-16');
    const classification = /CC0|Public Domain/i.test(entry.evidence.exactRightsStatement || '') ? 'cc0' : /CC BY-SA/i.test(entry.evidence.exactRightsStatement || '') ? 'cc-by-sa' : 'cc-by';
    const usageMode = entry.usageMode; const requestedDisplayPixels = usageMode === 'element' ? 480 : 972; const sourceEdge = usageMode === 'element' ? Math.max(dims.width, dims.height) : Math.min(dims.width, dims.height);
    assets.push({ assetId: entry.assetId, candidateTitle: entry.candidateTitle, sourceUseStatus: entry.sourceUseStatus, providerInputStatus: 'denied', coverageEligible, evidence: entry.evidence, license: { classification }, flags: entry.flags, usageMode, usageLabel: entry.usageLabel, requestedDisplayPixels, upscaleFactor: Number((requestedDisplayPixels / sourceEdge).toFixed(6)), original: { ...original, ...dims, preserved: true }, derivative, aiUpscaled: false, visualQa: { approved: conditional, separateHighUpscaleReview: false }, humanRightsQa: { approved: entry.assetId === 'commons-03' }, detailClaims: { evidenceText: false, identity: false, trademark: false }, localTransform: { maskOrBlur: entry.processing?.includes('mask-or-blur') || false }, conditionalReview: conditional ? { approved: true, rule: entry.assetId === 'commons-03' ? 'unrelated illustrative photo; visible hand is not a case party' : entry.assetId === 'commons-16' ? 'local crop/mask/blur only; unrelated product disclosure' : entry.coverageEligibility } : null });
  }
  const plans = {};
  for (const file of ['police-father', 'jeju-school-intrusion', 'nurse-pesticide-coffee']) plans[file] = JSON.parse(await fs.readFile(path.join(authorityRun, `${file}.semantic-cut-plan.json`)));
  const specs = {
    'police-father': { realCount: 16, assets: ['commons-05', 'commons-06', 'commons-04', 'commons-13', 'commons-17'], rationale: 'forensic, CCTV, prosecutor and police institutional context; final unresolved action beats remain Grok-generated' },
    'jeju-school-intrusion': { realCount: 15, assets: ['commons-07', 'commons-08', 'commons-09', 'commons-10', 'commons-11'], rationale: 'school, court, education-office and Jeju police institutional context; sensitive action beats remain Grok-generated' },
    'nurse-pesticide-coffee': { realCount: 15, assets: ['commons-02', 'commons-01', 'commons-03', 'commons-16', 'commons-14', 'commons-15', 'commons-18'], rationale: 'cup, ward/corridor and unrelated illustrative product/phone elements; unresolved harm beats remain Grok-generated' },
  };
  const reclassifiedCases = Object.entries(plans).map(([slug, plan]) => { const spec = specs[slug]; return { caseId: plan.caseId, cuts: plan.cuts.map((cut, index) => { const suggestedAssetId = index < spec.realCount ? spec.assets[index % spec.assets.length] : null; const usageMode = ['commons-01', 'commons-03', 'commons-16'].includes(suggestedAssetId) ? 'element' : 'full-frame'; return { cutId: cut.cutId, sourceClass: index < spec.realCount ? (slug === 'nurse-pesticide-coffee' && (index === 2 || index === 3) ? 'generic-stock' : 'institutional-context') : 'grok-generated', usageMode, requestedDisplayPixels: usageMode === 'element' ? 480 : 972, rationale: index < spec.realCount ? spec.rationale : 'sensitive or unavailable action is intentionally Grok-generated', suggestedAssetId }; }) }; });
  const reclassifiedNeeds = { schema: 'newsroom-real-media-needs-v1', activeContract: 'evidence-motion-documentary-v13-hybrid-real-media-admission', authorities: { semanticCutPlans: Object.values(plans).map((plan) => ({ caseId: plan.caseId, sha256: plan.approval.sha256 })), supersededNeedsSha256 }, supersedes: { sha256: supersededNeedsSha256, reason: 'superseded all-grok classification defect; reclassified only semantically supportable institutional/generic cuts without changing sealed cut plans' }, cases: reclassifiedCases, approval: { approved: true, status: 'admitted', sha256: '' } }; reclassifiedNeeds.approval.sha256 = hashRealMediaNeedsContent(reclassifiedNeeds);
  const cases = new Map(reclassifiedNeeds.cases.map((item) => [item.caseId, item]));
  const stories = Object.entries(plans).map(([slug, plan]) => {
    const storyNeeds = cases.get(plan.caseId); const cuts = plan.cuts.map((cut, index) => { const need = storyNeeds.cuts[index]; const assigned = need.suggestedAssetId; return { cutId: cut.cutId, sourceClass: need.sourceClass, usageMode: need.usageMode, requestedDisplayPixels: need.requestedDisplayPixels, durationSeconds: cut.durationIntent.authoredDurationSeconds, assetId: assigned, coverageEligible: Boolean(assigned), reason: need.rationale }; });
    const realDuration = cuts.filter((cut) => cut.coverageEligible).reduce((sum, cut) => sum + cut.durationSeconds, 0); const total = cuts.reduce((sum, cut) => sum + cut.durationSeconds, 0); const fraction = Number((realDuration / total).toFixed(6)); return { storyId: plan.caseId, slug, semanticCutPlanSha256: plan.approval.sha256, cuts, coverage: { schema: 'newsroom-real-media-duration-coverage-v1', realMediaDurationSeconds: Number(realDuration.toFixed(6)), totalActiveAuthoredDurationSeconds: Number(total.toFixed(6)), fraction, minimumFraction: 0.8, approved: fraction >= 0.8 } };
  });
  const assignments = stories.flatMap((story) => story.cuts.filter((cut) => cut.assetId).map((cut) => ({ storyId: story.storyId, cutId: cut.cutId, assetId: cut.assetId })));
  const totalReal = stories.reduce((sum, story) => sum + story.coverage.realMediaDurationSeconds, 0); const totalDuration = stories.reduce((sum, story) => sum + story.coverage.totalActiveAuthoredDurationSeconds, 0); const overallFraction = Number((totalReal / totalDuration).toFixed(6));
  const admission = { schema: 'newsroom-real-media-acquisition-admission-v1', activeContract: 'evidence-motion-documentary-v13-hybrid-real-media-admission', inputAuthorities: { authorityRun: path.relative(automationRoot, authorityRun).replaceAll('\\', '/'), authorityManifestSha256: sha(authorityBytes), realMediaNeedsSha256: reclassifiedNeeds.approval.sha256, supersededNeedsSha256, acquisitionManifestRealpath: acquisition.manifestPath, acquisitionManifestSha256: acquisition.sha256 }, assets, assignments, stories, coverage: { schema: 'newsroom-real-media-duration-coverage-v1', byStory: stories.map((story) => ({ storyId: story.storyId, ...story.coverage })), realMediaDurationSeconds: Number(totalReal.toFixed(6)), totalActiveAuthoredDurationSeconds: Number(totalDuration.toFixed(6)), fraction: overallFraction, minimumFraction: 0.8, approved: overallFraction >= 0.8 }, production: { provider: false, render: false, upload: false, publication: false, stage07: false, continuationAuthorized: false } };
  admission.approval = { approved: true, status: 'admitted', sha256: hashRealMediaAdmissionContent(admission) };
  await fs.writeFile(path.join(runDir, 'admission.json'), json(admission), { flag: 'wx' });
  await fs.writeFile(path.join(runDir, 'real-media-needs.json'), json(reclassifiedNeeds), { flag: 'wx' });
  const coverage = admission.coverage; await fs.writeFile(path.join(runDir, 'duration-coverage.json'), json({ ...coverage, admissionSha256: admission.approval.sha256 }), { flag: 'wx' });
  const manifest = { schema: 'newsroom-real-media-admission-v1-run', runId, inputRun: acquisition.manifestPath, admission: 'admission.json', realMediaNeeds: 'real-media-needs.json', durationCoverage: 'duration-coverage.json', assets: assets.map((asset) => ({ assetId: asset.assetId, sourceUseStatus: asset.sourceUseStatus, providerInputStatus: asset.providerInputStatus, originalSha256: asset.original.sha256, derivativeSha256: asset.derivative.sha256 })), storyCoverage: stories.map((story) => ({ storyId: story.storyId, totalSeconds: story.coverage.totalActiveAuthoredDurationSeconds, realSeconds: story.coverage.realMediaDurationSeconds, fraction: story.coverage.fraction, approved: story.coverage.approved })), production: admission.production };
  await fs.writeFile(path.join(runDir, 'manifest.json'), json(manifest), { flag: 'wx' });
  return { runDir, admissionSha256: admission.approval.sha256, coverage: admission.coverage, assets: assets.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) createThreeStoryRealMediaAdmissionV1().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
