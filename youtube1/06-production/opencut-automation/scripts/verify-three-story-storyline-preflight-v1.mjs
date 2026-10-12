import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const automationRoot = path.resolve(path.dirname(scriptPath), '..');
const workspaceRoot = path.resolve(automationRoot, '../..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const latestRun = () => {
  const root = path.join(automationRoot, 'out', 'studies', 'three-story-storyline-preflight-v1');
  return fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().at(-1);
};
const runDir = path.resolve(process.argv[2] || path.join(automationRoot, 'out', 'studies', 'three-story-storyline-preflight-v1', latestRun()));
const expectedRoot = path.join(automationRoot, 'out', 'studies', 'three-story-storyline-preflight-v1');
if (!runDir.startsWith(`${expectedRoot}${path.sep}`)) throw new Error('run must be contained in the preflight study root');
const reportPath = path.join(runDir, 'preflight.json');
const reportBytes = fs.readFileSync(reportPath);
const report = JSON.parse(reportBytes.toString('utf8'));
const errors = [];
if (report.schema !== 'three-story-storyline-preflight-v1') errors.push('schema mismatch');
if (report.activeContract !== 'evidence-motion-documentary-v13-hybrid-real-media-admission') errors.push('contract mismatch');
if (report.cases?.length !== 3 || report.summary?.total !== 3) errors.push('three cases are required');
if (report.summary?.sealEligible !== 0 || report.summary?.blocked !== 3) errors.push('current fail-closed result drifted');
if (report.cases?.some((item) => item.sealEligible || !item.blockers?.length || !item.nextAction)) errors.push('every case must remain blocked with an actionable reason');
for (const authority of [report.designGuidance, report.creator?.source, report.verifier?.source, ...report.cases.flatMap((item) => Object.values(item.authorities || {}))]) {
  if (!authority?.relative || !/^[a-f0-9]{64}$/u.test(authority.sha256) || !Number.isInteger(authority.bytes)) { errors.push('authority record is malformed'); continue; }
  const absolute = path.resolve(workspaceRoot, authority.relative);
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || !absolute.startsWith(`${workspaceRoot}${path.sep}`)) { errors.push(`authority containment failed: ${authority.relative}`); continue; }
  const bytes = fs.readFileSync(absolute);
  if (bytes.length !== authority.bytes || sha256(bytes) !== authority.sha256) errors.push(`authority drift: ${authority.relative}`);
}
const police = report.cases.find((item) => item.caseId === 'research-6b1a8af9b4143acb');
if (police?.declared?.audioSha256 !== police?.observed?.canonicalAudioSha256) errors.push('police canonical audio SHA-256 mismatch');
if (Math.abs(Number(police?.declared?.durationSeconds) - Number(police?.observed?.canonicalAudioDurationSeconds)) > 0.001) errors.push('police canonical audio duration mismatch');
if (police?.declared?.scriptSha256 !== police?.observed?.canonicalDraftSha256) errors.push('police canonical script mismatch');
if (report.supersedes?.reportSha256 !== 'cca1806b647b7dc21c4e3391235325f67269b83eb46d759441f24644063993cf') errors.push('superseded false-negative report is not bound');
const nurse = report.cases.find((item) => item.caseId === 'research-657380fce7eaccc9');
if (!(nurse?.declared?.conflictCount > 0)) errors.push('nurse competing authority blocker disappeared');
const storedSha = fs.readFileSync(path.join(runDir, 'preflight.sha256'), 'utf8').trim().split(/\s+/u)[0];
if (storedSha !== sha256(reportBytes)) errors.push('report hash file mismatch');
const result = {
  schema: 'three-story-storyline-preflight-verifier-v1',
  verified: errors.length === 0,
  reportSha256: sha256(reportBytes),
  verifierSourceSha256: sha256(fs.readFileSync(scriptPath)),
  errors,
};
fs.writeFileSync(path.join(runDir, 'verifier.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
if (errors.length) throw new Error(errors.join('; '));
console.log(JSON.stringify(result));
