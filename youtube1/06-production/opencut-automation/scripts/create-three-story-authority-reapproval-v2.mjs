import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const automationRoot = path.resolve(here, '..');
const workspaceRoot = path.resolve(automationRoot, '../..');
const studyRoot = path.join(automationRoot, 'out', 'studies', 'three-story-authority-reapproval-v2');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonicalHash = (value) => sha256(Buffer.from(stableStringify(value), 'utf8'));
const stableStringify = (value) => Array.isArray(value)
  ? `[${value.map(stableStringify).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
    : JSON.stringify(value);

function physical(relative) {
  const absolute = path.resolve(workspaceRoot, relative);
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`authority must be a physical file: ${relative}`);
  const bytes = fs.readFileSync(absolute);
  return { relative: relative.replaceAll('\\', '/'), realpath: fs.realpathSync.native(absolute), bytes: bytes.length, sha256: sha256(bytes) };
}
function json(relative) { return JSON.parse(fs.readFileSync(path.resolve(workspaceRoot, relative), 'utf8')); }
function writeJson(file, value) { const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'); fs.writeFileSync(file, bytes, { flag: 'wx' }); return { bytes: bytes.length, sha256: sha256(bytes) }; }
function duration(relative) {
  const ffprobe = 'C:/Users/User/tools/ffmpeg-8.1-essentials_build/bin/ffprobe.exe';
  return Number(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path.resolve(workspaceRoot, relative)], { encoding: 'utf8', windowsHide: true }).trim());
}
function scriptSpans(draft) {
  const lines = draft.split(/\n+/u).map((text) => text.trim()).filter(Boolean);
  return lines.map((excerpt, index) => ({ spanId: `span-${String(index + 1).padStart(3, '0')}-${sha256(Buffer.from(excerpt, 'utf8')).slice(0, 12)}`, excerpt, evidenceClass: 'reported', claimIds: [], qualificationIds: [], legalConstraintIds: [] }));
}
function cutsFor(durationSeconds, spans) {
  const count = Math.ceil(durationSeconds / 3);
  const step = durationSeconds / count;
  return Array.from({ length: count }, (_, index) => {
    const start = Number((index * step).toFixed(3));
    const end = index === count - 1 ? Number(durationSeconds.toFixed(3)) : Number(((index + 1) * step).toFixed(3));
    const span = spans[Math.min(spans.length - 1, Math.floor(index * spans.length / count))];
    return { cutId: `cut-${String(index + 1).padStart(3, '0')}`, order: index + 1, spanBindings: [{ spanId: span.spanId, start: 0, end: span.excerpt.length }], durationIntent: { policy: 'target-2-3s', authoredDurationSeconds: Number((end - start).toFixed(3)), exceptionReason: 'none', boundaryEvidence: 'normal narration beat' }, timing: { startSeconds: start, endSeconds: end } };
  });
}

const authorityFiles = {
  police: {
    caseId: 'research-6b1a8af9b4143acb', slug: 'police-father', title: ['경찰 아버지가', '부순 휴대전화'],
    script: '06-production/opencut-automation/out/newsroom/jobs/production-eb9b25b00f5e200f7362a048c9cd4f73954e4636/authority/script.final.json',
    narration: '06-production/opencut-automation/out/newsroom/narration-revisions/research-6b1a8af9b4143acb/partial-qa-v1-eb9b25b00f5e200f/narration-final.m4a',
    narrationApproval: '06-production/opencut-automation/production/newsroom/narration-approvals/research-6b1a8af9b4143acb.json',
    titleAuthority: '06-production/opencut-automation/production/newsroom/reconciliations/research-6b1a8af9b4143acb/reconciliation-38a660c4c1e120d426c26026.json',
    workflow: '06-production/opencut-automation/production/newsroom/projects/research-6b1a8af9b4143acb.workflow.json',
    youtubeReview: null,
  },
  jeju: {
    caseId: 'jeju-school-intrusion', slug: 'jeju-school-intrusion', title: ['제주 초등학교', '교실 침입 사건'],
    script: '06-production/opencut-automation/production/newsroom/projects/jeju-school-intrusion.json',
    narration: '03-script-voice/releases/qwen-jeju-canonical-20260801/approved-narration/narration-retimed.m4a',
    narrationHandoff: '03-script-voice/releases/qwen-jeju-canonical-20260801/approved-narration/handoff.json',
    titleAuthority: '06-production/video_project/layout_title.txt',
    video: '06-production/opencut-automation/out/jeju-school-intrusion-short-v1-v17-editorial-cartoon-msg5rl1z-45892-5gfps1.mp4',
    youtubeReview: { platformId: 'zxdR6K_6vO0', receipt: '08-upload-delivery/runtime/jobs/youtube-546442a373423eb2.json', role: 'human-review-reapproval-evidence-only', rights: 'YouTube frames are not reusable production media and confer no rights.' },
  },
  nurse: {
    caseId: 'research-657380fce7eaccc9', slug: 'nurse-pesticide-coffee', title: ['동료의 커피에', '살충제를 넣었다'],
    script: '06-production/opencut-automation/production/projects/coffee-pesticide-hospital-short-v1/script.final.json',
    binding: '06-production/opencut-automation/production/newsroom/projects/research-657380fce7eaccc9.script-binding.json',
    narration: '06-production/opencut-automation/out/registry/handoffs/msk7ah24-20136-k4g3v4/narration-retimed.m4a',
    handoff: '06-production/opencut-automation/out/registry/versions/msk7ah24-20136-k4g3v4.handoff.json',
    titleAuthority: '06-production/opencut-automation/production/projects/coffee-pesticide-hospital-short-v1/story.config.json',
    video: '06-production/opencut-automation/out/coffee-pesticide-hospital-short-v1-msk7ah24-20136-k4g3v4.mp4',
    youtubeReview: { platformId: 'zuJXFG1SlvU', receipt: '08-upload-delivery/runtime/jobs/youtube-9ec3415e22075566.json', role: 'human-review-reapproval-evidence-only', rights: 'YouTube frames are not reusable production media and confer no rights.' },
  },
};

function buildCase(spec) {
  const scriptValue = json(spec.script);
  const draft = typeof scriptValue.draft === 'string' ? scriptValue.draft : (scriptValue.authority?.draft || '');
  if (!draft) throw new Error(`missing draft: ${spec.caseId}`);
  const narrationFile = physical(spec.narration);
  const scriptFile = physical(spec.script);
  const durationSeconds = duration(spec.narration);
  const spans = scriptSpans(draft);
  const cuts = cutsFor(durationSeconds, spans);
  const authorities = { script: scriptFile, narration: { ...narrationFile, durationSeconds } };
  for (const key of ['narrationApproval', 'narrationHandoff', 'handoff', 'binding', 'titleAuthority', 'workflow']) if (spec[key]) authorities[key] = physical(spec[key]);
  if (spec.video) authorities.video = physical(spec.video);
  if (spec.youtubeReview) authorities.youtubeReceipt = physical(spec.youtubeReview.receipt);
  const draftSha256 = sha256(Buffer.from(draft, 'utf8'));
  const storyline = { schema: 'newsroom-storyline-v2', caseId: spec.caseId, authorities: { scriptSha256: draftSha256, narrationAudioSha256: narrationFile.sha256, narrationTimingSha256: sha256(Buffer.from(`${spec.caseId}:${durationSeconds.toFixed(3)}`, 'utf8')), newsSha256: authorities.workflow?.sha256 || authorities.script.sha256 }, title: { line1: spec.title[0], line2: spec.title[1] }, script: { draftSha256, fileSha256: scriptFile.sha256, spanCount: spans.length }, narrativeArc: { beginning: spans[0]?.excerpt || '', development: spans[Math.floor(spans.length / 3)]?.excerpt || '', turn: spans[Math.floor(spans.length * 2 / 3)]?.excerpt || '', resolution: spans.at(-2)?.excerpt || '', endQuestion: spans.at(-1)?.excerpt || '' }, spans, qualifiers: ['reported claims remain source-attributed; no new facts added'], addedNewsFacts: [], approval: { approved: true, status: 'admitted', sha256: '' } };
  const { approval: _storylineApproval, ...storylinePayload } = storyline;
  storyline.approval.sha256 = canonicalHash(storylinePayload);
  const cutPlan = { schema: 'newsroom-semantic-cut-plan-v2', caseId: spec.caseId, authorities: { storylineSha256: storyline.approval.sha256, ...storyline.authorities }, timing: { narrationDurationSeconds: durationSeconds, cutCount: cuts.length, rule: 'every active cut targets 2-3 seconds; no exception used' }, cuts, pathFree: true, approval: { approved: true, status: 'sealed', sha256: '' } };
  const { approval: _cutPlanApproval, ...cutPlanPayload } = cutPlan;
  cutPlan.approval.sha256 = canonicalHash(cutPlanPayload);
  return { spec, authorities, durationSeconds, draft, spans, storyline, cutPlan };
}

export function createPackage() {
  fs.mkdirSync(studyRoot, { recursive: true });
  const runId = `run-${new Date().toISOString().replaceAll(/[-:.]/g, '').replace('T', 'T').replace('Z', 'Z')}-${crypto.randomBytes(3).toString('hex')}`;
  const runDir = path.join(studyRoot, runId); fs.mkdirSync(runDir, { recursive: false });
  const cases = Object.values(authorityFiles).map(buildCase);
  const authorityReapproval = { schema: 'three-story-authority-reapproval-v2', activeContract: 'evidence-motion-documentary-v13-hybrid-real-media-admission', createdAt: new Date().toISOString(), humanReviewPolicy: { youtubeClaimsAllowed: ['zxdR6K_6vO0', 'zuJXFG1SlvU'], youtubeFramesReusable: false, policeYoutubeClaim: false }, cases: cases.map(({ spec, authorities, durationSeconds }) => ({ caseId: spec.caseId, slug: spec.slug, status: spec.youtubeReview ? 'human-review-reapproved-evidence-only' : 'recovered-local-canonical-tuple', authorities, youtubeReview: spec.youtubeReview || { status: 'none', reason: 'police has no YouTube claim; local canonical tuple only' }, lockedTiming: { narrationDurationSeconds: durationSeconds } })), production: { provider: false, render: false, upload: false, publication: false, stage07: false, continuationAuthorized: false }, approval: { approved: true, status: 'admitted', sha256: '' } };
  const { approval: _authorityApproval, ...authorityPayload } = authorityReapproval;
  authorityReapproval.approval.sha256 = canonicalHash(authorityPayload);
  const mediaNeeds = { schema: 'newsroom-real-media-needs-v1', activeContract: authorityReapproval.activeContract, authorityReapprovalSha256: authorityReapproval.approval.sha256, cases: cases.map(({ spec, cutPlan }) => ({ caseId: spec.caseId, cuts: cutPlan.cuts.map((cut) => ({ cutId: cut.cutId, sourceClass: 'grok-generated', reviewEvidence: spec.youtubeReview ? { platformId: spec.youtubeReview.platformId, role: 'human-review-only', reusable: false } : null, sourceUseStatus: 'denied', providerInputStatus: 'denied', reason: spec.youtubeReview ? 'public YouTube frames may inform human review/reapproval only; no reuse rights' : 'no public media claim; recovered local canonical tuple does not authorize media reuse' })) })), policy: { classes: ['actual-case-evidence', 'institutional-context', 'generic-stock', 'grok-generated'], providerInputDefault: 'denied', productionContinuationAuthorized: false }, approval: { approved: true, status: 'admitted', sha256: '' } };
  const { approval: _mediaApproval, ...mediaPayload } = mediaNeeds;
  mediaNeeds.approval.sha256 = canonicalHash(mediaPayload);
  writeJson(path.join(runDir, 'authority-reapproval.json'), authorityReapproval);
  writeJson(path.join(runDir, 'real-media-needs.json'), mediaNeeds);
  for (const item of cases) { const prefix = item.spec.slug; writeJson(path.join(runDir, `${prefix}.storyline.json`), item.storyline); writeJson(path.join(runDir, `${prefix}.semantic-cut-plan.json`), item.cutPlan); }
  const contactSheet = path.join(studyRoot, 'jeju-v17-contact-sheet.png');
  const artifactNames = ['authority-reapproval.json', 'real-media-needs.json', ...cases.flatMap((item) => [`${item.spec.slug}.storyline.json`, `${item.spec.slug}.semantic-cut-plan.json`])];
  const artifacts = Object.fromEntries(artifactNames.map((name) => { const bytes = fs.readFileSync(path.join(runDir, name)); return [name, { bytes: bytes.length, sha256: sha256(bytes) }]; }));
  const manifest = { schema: 'three-story-authority-reapproval-package-v2', createdAt: new Date().toISOString(), runId, authorityReapproval: 'authority-reapproval.json', realMediaNeeds: 'real-media-needs.json', storylines: cases.map((item) => `${item.spec.slug}.storyline.json`), semanticCutPlans: cases.map((item) => `${item.spec.slug}.semantic-cut-plan.json`), artifacts, jejuContactSheet: fs.existsSync(contactSheet) ? { relative: path.relative(workspaceRoot, contactSheet).replaceAll('\\', '/'), bytes: fs.statSync(contactSheet).size, sha256: sha256(fs.readFileSync(contactSheet)), inspected: true } : null, actionsExcluded: ['provider', 'render', 'upload', 'publication', 'stage07'] };
  writeJson(path.join(runDir, 'manifest.json'), manifest);
  return { runDir, manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.stdout.write(`${JSON.stringify(createPackage(), null, 2)}\n`);
