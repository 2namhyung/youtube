import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const automationRoot = path.resolve(here, '..');
const workspaceRoot = path.resolve(automationRoot, '../..');
const studyRoot = path.join(automationRoot, 'out', 'studies', 'three-story-authority-reapproval-v2');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const stableStringify = (value) => Array.isArray(value)
  ? `[${value.map(stableStringify).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const canonicalHash = (value) => sha256(Buffer.from(stableStringify(value), 'utf8'));
const latest = () => fs.readdirSync(studyRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith('run-')).map((entry) => entry.name).sort().at(-1);
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function verifyFile(record) {
  const absolute = path.resolve(workspaceRoot, record.relative);
  if (!absolute.startsWith(`${workspaceRoot}${path.sep}`)) throw new Error(`authority escapes workspace: ${record.relative}`);
  const stat = fs.lstatSync(absolute); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`authority is not physical: ${record.relative}`);
  const bytes = fs.readFileSync(absolute); if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256) throw new Error(`authority drift: ${record.relative}`);
}
function verifyCanonical(value, label) { if (!value.approval?.approved || !/^[a-f0-9]{64}$/u.test(value.approval.sha256)) throw new Error(`${label} approval missing`); const copy = structuredClone(value); delete copy.approval; if (canonicalHash(copy) !== value.approval.sha256) throw new Error(`${label} canonical hash mismatch`); }

export function verifyPackage(runDir = path.join(studyRoot, latest())) {
  if (!runDir || !path.resolve(runDir).startsWith(`${studyRoot}${path.sep}`)) throw new Error('run must be contained in successor study root');
  const manifest = readJson(path.join(runDir, 'manifest.json'));
  if (manifest.schema !== 'three-story-authority-reapproval-package-v2') throw new Error('manifest schema mismatch');
  for (const [name, record] of Object.entries(manifest.artifacts || {})) { const bytes = fs.readFileSync(path.join(runDir, name)); if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256) throw new Error(`generated artifact drift: ${name}`); }
  const authority = readJson(path.join(runDir, manifest.authorityReapproval));
  if (authority.schema !== 'three-story-authority-reapproval-v2') throw new Error('authority-reapproval schema mismatch');
  if (authority.humanReviewPolicy.policeYoutubeClaim !== false) throw new Error('police YouTube claim must be false');
  if (authority.humanReviewPolicy.youtubeClaimsAllowed.join(',') !== 'zxdR6K_6vO0,zuJXFG1SlvU') throw new Error('YouTube review allowlist drifted');
  verifyCanonical(authority, 'authority-reapproval');
  if (authority.cases.length !== 3) throw new Error('exactly three cases required');
  const byCase = new Map(authority.cases.map((item) => [item.caseId, item]));
  for (const item of authority.cases) for (const record of Object.values(item.authorities)) verifyFile(record);
  const police = byCase.get('research-6b1a8af9b4143acb');
  if (police.youtubeReview?.platformId || police.youtubeReview?.receipt) throw new Error('police must not carry YouTube evidence');
  if (police.youtubeReview?.status !== 'none') throw new Error('police YouTube status must be none');
  for (const [caseId, platformId] of [['jeju-school-intrusion', 'zxdR6K_6vO0'], ['research-657380fce7eaccc9', 'zuJXFG1SlvU']]) {
    const item = byCase.get(caseId); if (item.youtubeReview?.platformId !== platformId || item.youtubeReview?.role !== 'human-review-reapproval-evidence-only' || item.youtubeReview?.rights === undefined) throw new Error(`${caseId} YouTube review evidence mismatch`);
    const receipt = readJson(path.resolve(workspaceRoot, item.authorities.youtubeReceipt.relative));
    if (receipt.platformId !== platformId || receipt.privacy !== 'public' || receipt.state !== 'published') throw new Error(`${caseId} receipt is not public review evidence`);
    const expectedVideoSha = caseId === 'jeju-school-intrusion' ? 'ffe3e25e27e4728a4b8764f3cfa808a179340e0765ba59870c84f204117692c6' : 'd5b12b315721eaa69ffd5be90d4b5c7faeb0a92f64464146b5c793ddcc2df832';
    if (receipt.videoSha256 !== expectedVideoSha || item.authorities.video.sha256 !== expectedVideoSha) throw new Error(`${caseId} exact MP4 authority drifted`);
  }
  const needs = readJson(path.join(runDir, manifest.realMediaNeeds)); verifyCanonical(needs, 'real-media-needs');
  if (needs.cases.length !== 3 || needs.policy.providerInputDefault !== 'denied' || needs.policy.productionContinuationAuthorized !== false) throw new Error('real-media policy drifted');
  const names = ['police-father', 'jeju-school-intrusion', 'nurse-pesticide-coffee'];
  for (const name of names) {
    const storyline = readJson(path.join(runDir, `${name}.storyline.json`)); const plan = readJson(path.join(runDir, `${name}.semantic-cut-plan.json`));
    if (storyline.schema !== 'newsroom-storyline-v2' || plan.schema !== 'newsroom-semantic-cut-plan-v2' || plan.pathFree !== true) throw new Error(`${name} storyline/cut-plan schema mismatch`);
    verifyCanonical(storyline, `${name} storyline`); verifyCanonical(plan, `${name} cut-plan`);
    if (plan.authorities.storylineSha256 !== storyline.approval.sha256 || plan.cuts.length !== plan.timing.cutCount) throw new Error(`${name} cut-plan authority mismatch`);
    const total = plan.cuts.reduce((sum, cut) => sum + Number(cut.durationIntent.authoredDurationSeconds), 0);
    if (Math.abs(total - Number(plan.timing.narrationDurationSeconds)) > 0.01) throw new Error(`${name} cut duration sum mismatch`);
    for (const cut of plan.cuts) { const seconds = Number(cut.durationIntent.authoredDurationSeconds); if (seconds < 2 || seconds > 3) throw new Error(`${name} cut outside 2-3 seconds: ${cut.cutId}`); if (cut.durationIntent.exceptionReason !== 'none') throw new Error(`${name} unapproved duration exception`); }
  }
  if (!manifest.jejuContactSheet?.inspected || !/^[a-f0-9]{64}$/u.test(manifest.jejuContactSheet.sha256)) throw new Error('Jeju contact-sheet inspection record missing');
  const contact = path.resolve(workspaceRoot, manifest.jejuContactSheet.relative); const bytes = fs.readFileSync(contact); if (bytes.length !== manifest.jejuContactSheet.bytes || sha256(bytes) !== manifest.jejuContactSheet.sha256) throw new Error('Jeju contact-sheet hash drifted');
  const result = { schema: 'three-story-authority-reapproval-verifier-v2', verified: true, runDir, authorityReapprovalSha256: authority.approval.sha256, realMediaNeedsSha256: needs.approval.sha256, verifierSourceSha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url))) };
  fs.writeFileSync(path.join(runDir, 'verifier.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { try { process.stdout.write(`${JSON.stringify(verifyPackage(process.argv[2]), null, 2)}\n`); } catch (error) { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; } }
