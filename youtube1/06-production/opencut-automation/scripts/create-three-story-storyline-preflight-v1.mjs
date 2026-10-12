import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const automationRoot = path.resolve(path.dirname(scriptPath), '..');
const workspaceRoot = path.resolve(automationRoot, '../..');
const ffprobe = 'C:/Users/User/tools/ffmpeg-8.1-essentials_build/bin/ffprobe.exe';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (relative) => fs.readFileSync(path.join(workspaceRoot, relative));
const json = (relative) => JSON.parse(read(relative).toString('utf8'));
const file = (relative) => {
  const absolute = path.join(workspaceRoot, relative);
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`authority must be a physical file: ${relative}`);
  return { relative, bytes: stat.size, sha256: sha256(fs.readFileSync(absolute)) };
};
const duration = (relative) => Number(execFileSync(ffprobe, [
  '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path.join(workspaceRoot, relative),
], { encoding: 'utf8', windowsHide: true }).trim());

const policeApprovalPath = '06-production/opencut-automation/production/newsroom/narration-approvals/research-6b1a8af9b4143acb.json';
const policeSourceRoot = '06-production/opencut-automation/out/newsroom/narration-revisions/research-6b1a8af9b4143acb/partial-qa-v1-eb9b25b00f5e200f';
const policeAudioPath = `${policeSourceRoot}/narration-final.m4a`;
const policeScriptPath = '06-production/opencut-automation/out/newsroom/jobs/production-eb9b25b00f5e200f7362a048c9cd4f73954e4636/authority/script.final.json';
const policeApproval = json(policeApprovalPath);
const policeAudio = file(policeAudioPath);
const policeAudioDuration = duration(policeAudioPath);
const policeScript = json(policeScriptPath);
const policeDraftSha256 = sha256(Buffer.from(policeScript.draft, 'utf8'));

const jejuAudioPath = '03-script-voice/releases/qwen-jeju-canonical-20260801/approved-narration/narration-retimed.m4a';
const nurseBindingPath = '06-production/opencut-automation/production/newsroom/projects/research-657380fce7eaccc9.script-binding.json';
const nurseBinding = json(nurseBindingPath);

const cases = [
  {
    caseId: 'research-6b1a8af9b4143acb',
    label: '경찰관 부친 휴대전화 증거 훼손 사건',
    status: 'blocked',
    sealEligible: false,
    authorities: {
      workflow: file('06-production/opencut-automation/production/newsroom/projects/research-6b1a8af9b4143acb.workflow.json'),
      titleReconciliation: file('06-production/opencut-automation/production/newsroom/reconciliations/research-6b1a8af9b4143acb/reconciliation-38a660c4c1e120d426c26026.json'),
      narrationApproval: file(policeApprovalPath),
      canonicalScript: file(policeScriptPath),
      narrationManifest: file(`${policeSourceRoot}/manifest.json`),
      narrationHandoff: file(`${policeSourceRoot}/handoff.json`),
      canonicalNarrationAudio: { ...policeAudio, durationSeconds: policeAudioDuration },
      excludedAlternateRelease: file('03-script-voice/runs/research-6b1a8af9b4143acb-narration-20260811/approved-empathy-owner-voice-v1.wav'),
    },
    declared: { scriptSha256: policeApproval.scriptSha256, audioSha256: policeApproval.audioSha256, durationSeconds: policeApproval.durationSeconds },
    observed: { canonicalDraftSha256: policeDraftSha256, canonicalAudioSha256: policeAudio.sha256, canonicalAudioDurationSeconds: policeAudioDuration },
    blockers: [
      'workflow source verification and downstream stages remain incomplete',
      'the current-contract title, script, narration, and evidence tuple has not been explicitly reconfirmed',
      'no admitted newsroom-storyline-v2 or newsroom-semantic-cut-plan-v2 exists',
    ],
    nextAction: 'finish source verification and explicitly reconfirm the recovered exact script/audio tuple before sealing',
  },
  {
    caseId: 'jeju-school-intrusion',
    label: '제주 초등학교 교실 침입 사건',
    status: 'reconfirmation-required',
    sealEligible: false,
    authorities: {
      approvedTitle: file('06-production/video_project/layout_title.txt'),
      approvedKicker: file('06-production/video_project/layout_kicker.txt'),
      finalScript: file('06-production/video_project/final_script.txt'),
      narrationHandoff: file('03-script-voice/releases/qwen-jeju-canonical-20260801/approved-narration/handoff.json'),
      narrationAudio: { ...file(jejuAudioPath), durationSeconds: duration(jejuAudioPath) },
      newsroomProject: file('06-production/opencut-automation/production/newsroom/projects/jeju-school-intrusion.json'),
      legalDecision: file('07-quality-assurance/runs/legal-release-decision.json'),
      humanApproval: file('07-quality-assurance/runs/human-approval.json'),
      stage07Audit: file('07-quality-assurance/runs/latest-stage07-audit.json'),
    },
    blockers: [
      'historical v17/private-upload approval cannot be promoted into the current v2 storyline/cut contract',
      'no admitted newsroom-storyline-v2 or newsroom-semantic-cut-plan-v2 exists',
      'current-contract title, script, narration, and evidence tuple requires explicit reconfirmation',
    ],
    nextAction: 'reconfirm the exact current tuple, then create a new evidence-bound storyline and path-free semantic cut plan',
  },
  {
    caseId: 'research-657380fce7eaccc9',
    label: '간호조무사 커피 살충제 사건',
    status: 'blocked',
    sealEligible: false,
    authorities: {
      binding: file(nurseBindingPath),
      boundScript: file('06-production/opencut-automation/production/projects/coffee-pesticide-hospital-short-v1/script.final.json'),
      competingScript: file('06-production/opencut-automation/production/projects/research-657380fce7eaccc9-editorial-cartoon/script.final.json'),
      workflow: file('06-production/opencut-automation/production/newsroom/projects/research-657380fce7eaccc9.workflow.json'),
      quality: file('06-production/opencut-automation/production/newsroom/projects/research-657380fce7eaccc9.quality.json'),
      scriptQa: file('06-production/opencut-automation/production/newsroom/projects/research-657380fce7eaccc9.script-qa.json'),
    },
    declared: { boundDraftSha256: nurseBinding.authority?.draftSha256, boundFileSha256: nurseBinding.authority?.fileSha256, conflictCount: nurseBinding.conflicts?.length ?? 0 },
    blockers: [
      'competing finalized script authority remains recorded',
      'no approved owner narration authority with exact audio SHA-256 and duration is present',
      'preview/non-publishable QA history must be reconciled against the later quality record',
      'no admitted newsroom-storyline-v2 or newsroom-semantic-cut-plan-v2 exists',
    ],
    nextAction: 'resolve the script authority and approve one exact owner narration/title tuple before sealing',
  },
];

const now = new Date();
const runId = `run-${now.toISOString().replace(/[-:.]/gu, '').replace('T', 'T').replace('Z', 'Z')}-${sha256(Buffer.from(String(process.pid))).slice(0, 6)}`;
const studyRoot = path.join(automationRoot, 'out', 'studies', 'three-story-storyline-preflight-v1');
fs.mkdirSync(studyRoot, { recursive: true });
const out = path.join(studyRoot, runId);
fs.mkdirSync(out, { recursive: false });
const report = {
  schema: 'three-story-storyline-preflight-v1',
  createdAt: now.toISOString(),
  activeContract: 'evidence-motion-documentary-v13-hybrid-real-media-admission',
  supersedes: { reportSha256: 'cca1806b647b7dc21c4e3391235325f67269b83eb46d759441f24644063993cf', reason: 'the approved police narration source root was subsequently recovered and verified' },
  requiredSequence: ['newsroom-storyline-v2', 'newsroom-semantic-cut-plan-v2'],
  designGuidance: file('wiki/syntheses/three-story-narration-storyboard-common-rules.md'),
  creator: { source: file('06-production/opencut-automation/scripts/create-three-story-storyline-preflight-v1.mjs') },
  verifier: { source: file('06-production/opencut-automation/scripts/verify-three-story-storyline-preflight-v1.mjs') },
  cases,
  summary: { total: cases.length, sealEligible: cases.filter((item) => item.sealEligible).length, blocked: cases.filter((item) => !item.sealEligible).length },
  actionsExcluded: ['storyline-admission', 'semantic-cut-plan-seal', 'provider', 'render', 'upload', 'publication', 'stage07'],
};
const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(out, 'preflight.json'), bytes, { flag: 'wx' });
fs.writeFileSync(path.join(out, 'preflight.sha256'), `${sha256(bytes)}  preflight.json\n`, { flag: 'wx' });
console.log(JSON.stringify({ out, reportSha256: sha256(bytes), summary: report.summary }));
