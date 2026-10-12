import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertUniqueScriptBindings, evaluateScriptQa, normalizeCaptionIntegrity, normalizeSpokenEquivalence, sha256 } from './script-sync-qa-lib.mjs';
import { REFERENCE_CAPTION_RULES } from './production-lib.mjs';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'script-sync-qa-'));
const contract = path.join(temp, 'contract.json');
fs.writeFileSync(contract, '{}');
const script = '첫 문장입니다. 보호용어입니다.';
const draftSha256 = sha256(script);
const project = {
  title: 'QA fixture', assets: [], scenes: [], captionPreset: {}, captionProtectedTerms: ['보호용어'], media: {}, transitionContract: {},
  narration: { provider: 'fixture' }, pipelineContract: { path: './contract.json', sha256: sha256(fs.readFileSync(contract)) },
};
const projectText = `${JSON.stringify(project, null, 2)}\n`;
const bindingBase = {
  schemaVersion: 'production-script-binding-v1', newsroomSlug: 'fixture-story', productionProjectId: 'fixture-project',
  authority: { path: 'production/projects/fixture-project/script.final.json', draft: script, draftSha256, status: 'final', finalizedAt: '2026-08-08T00:00:00.000Z' },
  creator: 'scripts/sync-production-script-qa.mjs', verifier: 'scripts/script-sync-qa-lib.mjs', conflicts: [], workflow: {},
};
const binding = { ...bindingBase, bindingSha256: sha256(JSON.stringify(bindingBase)) };

function handoffFixture() {
  const cues = [
    { start: 0, end: 1, text: '첫 문장입니다.', anchors: [] },
    { start: 1, end: 2, text: '보호용어입니다.', anchors: [] },
  ];
  const anchors = [
    { startChar: 0, endChar: 7, start: 0, end: 1 },
    { startChar: 7, endChar: 15, start: 1, end: 2 },
  ];
  const segment = {
    index: 1, selected: true, sourceText: script, spokenText: script, signal: { durationSeconds: 2, clippedSamples: 0 },
    asrChecks: [{ model: 'small', cer: 0 }, { model: 'medium', cer: 0 }], criticalPhraseConsensus: [{ phrase: '보호용어', passes: true, recognizedModels: ['small', 'medium'], missingModels: [] }],
  };
  const projectConfigSha256 = sha256(projectText.replace(/\r\n/g, '\n'));
  const narrationConfigSha256 = sha256(JSON.stringify({ scriptSha256: draftSha256, narration: project.narration }));
  const captionRules = { ...REFERENCE_CAPTION_RULES, protectedTerms: ['보호용어'] };
  const visualConfigSha256 = sha256(JSON.stringify({ title: project.title, assets: project.assets, scenes: project.scenes, captionPreset: project.captionPreset, captionRules, media: project.media, transitionContract: project.transitionContract, motionEvidence: project.motionEvidence }));
  return {
    versionId: 'fixture-v1', cues, captionRules, publishable: false, releaseStatus: 'preview', releaseGate: { blockers: [{ id: 'human-playback-review-required' }] },
    sourceIntegrity: { authority: binding.authority.path, slug: binding.newsroomSlug, scriptSha256: draftSha256, projectConfigSha256, contractSha256: sha256(fs.readFileSync(contract)), narrationConfigSha256, visualConfigSha256 },
    narrationProvider: { promptBankManifestSha256: 'a'.repeat(64), speechAcceptance: { attempts: [{ segments: [segment] }], evidence: { globalWordAnchors: anchors, finalSignal: { durationSeconds: 2 } } } },
  };
}

function evaluate(handoff, overrides = {}) {
  return evaluateScriptQa({ binding, handoff, handoffPath: 'fixture/handoff.json', handoffSha256: 'f'.repeat(64), project, projectText, projectDirectory: temp, bgmSourceSha256: 'b'.repeat(64), profileManifestSha256: 'a'.repeat(64), ...overrides });
}
const status = (qa, id) => qa.checks.find((item) => item.id === id)?.status;

assert.equal(normalizeCaptionIntegrity('첫 문장,\n입니다!'), '첫문장입니다');
assert.equal(normalizeSpokenEquivalence('살인 미수.'), normalizeSpokenEquivalence('살인미수.'));
assert.equal(assertUniqueScriptBindings([{ newsroomSlug: 'story-a', productionProjectId: 'project-a', authoritativeScript: 'a/script.final.json' }]).length, 1);
assert.throws(() => assertUniqueScriptBindings([
  { newsroomSlug: 'story-a', productionProjectId: 'project-a', authoritativeScript: 'a/script.final.json' },
  { newsroomSlug: 'story-a', productionProjectId: 'project-b', authoritativeScript: 'b/script.final.json' },
]), /duplicate script binding newsroomSlug/);
assert.throws(() => assertUniqueScriptBindings([
  { newsroomSlug: 'story-a', productionProjectId: 'project-a', authoritativeScript: 'a/script.final.json' },
  { newsroomSlug: 'story-b', productionProjectId: 'project-a', authoritativeScript: 'b/script.final.json' },
]), /duplicate script binding productionProjectId/);
assert.equal(status(evaluate(handoffFixture()), 'script-caption-integrity'), 'pass');

const captionMismatch = handoffFixture(); captionMismatch.cues[1].text = '다른 말입니다.';
assert.equal(status(evaluate(captionMismatch), 'script-caption-integrity'), 'fail');

const overlap = handoffFixture(); overlap.cues[1].start = 0.8;
assert.equal(status(evaluate(overlap), 'caption-structure'), 'fail');
const gap = handoffFixture(); gap.cues[1].start = 1.5; gap.cues[1].end = 2.5;
assert.equal(status(evaluate(gap), 'caption-structure'), 'fail');
const duration = handoffFixture(); duration.cues[0].end = 0.2; duration.cues[1].start = 0.2;
assert.equal(status(evaluate(duration), 'caption-structure'), 'fail');
const forbiddenSemanticCue = handoffFixture();
forbiddenSemanticCue.captionRules.protectedTerms = ['첫 문장입니다', '보호용어'];
forbiddenSemanticCue.cues = [
  { start: 0, end: 0.6, text: '첫', anchors: [] },
  { start: 0.6, end: 1, text: '문장입니다.', anchors: [] },
  forbiddenSemanticCue.cues[1],
];
assert.equal(status(evaluate(forbiddenSemanticCue), 'caption-structure'), 'fail');
assert.ok(evaluate(forbiddenSemanticCue).checks.find((item) => item.id === 'caption-structure').details.some((item) => item.code === 'forbidden-korean-cue-boundary'));

const lead = handoffFixture(); lead.cues[1].start = 0.4;
assert.equal(status(evaluate(lead), 'caption-audio-timing'), 'fail');
const lag = handoffFixture(); lag.cues[1].end = 2.7;
assert.equal(status(evaluate(lag), 'caption-audio-timing'), 'fail');
const orphan = handoffFixture(); orphan.narrationProvider.speechAcceptance.evidence.globalWordAnchors = [orphan.narrationProvider.speechAcceptance.evidence.globalWordAnchors[0]];
assert.equal(status(evaluate(orphan), 'caption-audio-timing'), 'fail');

const rewrite = handoffFixture(); rewrite.narrationProvider.speechAcceptance.attempts[0].segments[0].spokenText = '승인되지 않은 다른 뜻입니다.';
assert.equal(status(evaluate(rewrite), 'narration-integrity'), 'fail');
const stale = handoffFixture(); stale.sourceIntegrity.scriptSha256 = '0'.repeat(64);
assert.equal(status(evaluate(stale), 'render-freshness'), 'fail');
const warning = handoffFixture(); warning.narrationProvider.speechAcceptance.attempts[0].segments[0].criticalPhraseConsensus[0].missingModels = ['medium']; warning.narrationProvider.speechAcceptance.attempts[0].segments[0].criticalPhraseConsensus[0].recognizedModels = ['small'];
assert.equal(status(evaluate(warning), 'asr-diagnostic'), 'warning');

const liveBinding = JSON.parse(fs.readFileSync(new URL('../production/newsroom/projects/research-657380fce7eaccc9.script-binding.json', import.meta.url)));
const liveQa = JSON.parse(fs.readFileSync(new URL('../production/newsroom/projects/research-657380fce7eaccc9.script-qa.json', import.meta.url)));
assert.equal(liveBinding.authority.draftSha256, '1e79b194c356f52ef41dc010c60b11c3b56abc4c2c1f808a933c0cad31c4aba2');
assert.equal(liveBinding.authority.restorationStatus, 'editorial-revised');
assert.equal(liveBinding.authority.revision.revisionId, 'coffee-suspense-transition-v2');
assert.equal(liveBinding.authority.revision.previousDraftSha256, 'bf43f0e97c1eb916d544ff3d6fe28b2fdbc02e8ffe420b4db8f17c571f64873e');
assert.equal(liveBinding.authority.revision.previousRevision.previousDraftSha256, '740d18db54134f4bee1db672bebaa50c3a8ce7396ffb19b1fcb8ab6acc317a8d');
assert.ok(liveBinding.authority.draft.includes('항소심에선 징역 1년 6개월에 집행유예 3년으로 형이 줄었습니다.'));
assert.ok(liveBinding.authority.draft.includes('하지만 피해자의 커피잔에 남은 공포도 줄었을까요?\n\n형은 언젠가 끝나지만,\n피해자는 그 이후를 살아가야 합니다.'));
assert.ok(!liveBinding.authority.draft.includes('\n\n형량은 줄었습니다.'));
assert.equal(liveBinding.bindingSha256, sha256(JSON.stringify(Object.fromEntries(Object.entries(liveBinding).filter(([key]) => key !== 'bindingSha256')))));
assert.equal(liveQa.qaSha256, sha256(JSON.stringify(Object.fromEntries(Object.entries(liveQa).filter(([key]) => key !== 'qaSha256')))));
assert.equal(liveBinding.conflicts.length, 1);
assert.equal(liveBinding.conflicts[0].projectId, 'research-657380fce7eaccc9-editorial-cartoon');
assert.equal(liveQa.authoritativeDraftSha256, liveBinding.authority.draftSha256);
const simulatedModifiedDraftSha256 = sha256(`${liveBinding.authority.draft}\n승인된 수정`);
assert.notEqual(simulatedModifiedDraftSha256, liveBinding.authority.draftSha256, 'a production script modification must stale the binding');
assert.notEqual(simulatedModifiedDraftSha256, liveQa.authoritativeDraftSha256, 'a production script modification must invalidate QA');
const liveHandoffPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', liveQa.artifact.handoffPath);
const liveHandoffText = fs.readFileSync(liveHandoffPath, 'utf8');
const liveHandoff = JSON.parse(liveHandoffText);
assert.equal(liveQa.artifact.versionId, liveHandoff.versionId, 'QA must bind the selected current private handoff');
assert.equal(liveQa.artifact.handoffSha256, sha256(liveHandoffText));
assert.equal(liveQa.checks.find((item) => item.id === 'script-caption-integrity').status, 'pass');
assert.equal(liveQa.checks.find((item) => item.id === 'caption-audio-timing').status, 'pass');
assert.equal(liveQa.checks.find((item) => item.id === 'render-freshness').status, 'pass');
assert.equal(liveQa.checks.find((item) => item.id === 'asr-diagnostic').status, 'warning');
const liveWorkflow = JSON.parse(fs.readFileSync(new URL('../production/newsroom/projects/research-657380fce7eaccc9.workflow.json', import.meta.url)));
assert.equal(liveWorkflow.draft.variants.length, 4, 'all historical workflow variants remain stored');
assert.deepEqual(liveWorkflow.draft.variants.map(({ id }) => id), ['documentary', 'direct', 'suspense', 'empathy']);
assert.equal(liveWorkflow.draft.selectedDraftId, 'suspense');
const variantOrder = ['hook', 'incident', 'timeline', 'frustrating', 'solution', 'legal', 'confirmation'];
assert.deepEqual(Object.fromEntries(liveWorkflow.draft.variants.map((variant) => [variant.id, sha256(variantOrder.map((key) => String(variant.sections[key] ?? '').trim()).filter(Boolean).join('\n\n'))])), {
  documentary: 'c4bd38868e7ffc0a392e31eed9422b580e466a7bf278dba45c7deecf3167fb9a',
  direct: '6106cbaf0226ca3932d1e658af71d3583a18f3ff921de69e03a6cf2945cae612',
  suspense: 'f3de5d5bdd7c0ecb9b7f98ad25c46ce2a7faaf615e26d392df5542c0dcd16a6a',
  empathy: '1fcc29e952488aa0e147969214c37722acd42d6b2454d43cd8e8131e13240ec3',
});

const frontendRoot = new URL('../opencut-classic/apps/web/src/', import.meta.url);
const storiesRoute = fs.readFileSync(new URL('app/stories/[slug]/script/page.tsx', frontendRoot), 'utf8');
const newsroomRoute = fs.readFileSync(new URL('app/newsroom/[slug]/script/page.tsx', frontendRoot), 'utf8');
assert.match(storiesRoute, /loadProductionScriptDesk\(slug\)/, 'the canonical stories Script route must load the shared production desk');
assert.match(storiesRoute, /<ProductionScriptDesk initialState=\{productionDesk\}/, 'the stories Script route must render the authoritative desk');
assert.match(newsroomRoute, /redirect\(`\/stories\/\$\{encodeURIComponent\(slug\)\}\/script`\)/, 'the legacy newsroom Script route must redirect to stories');
assert.equal(fs.existsSync(new URL('components/newsroom/production-script-desk.tsx', frontendRoot)), true);
assert.match(fs.readFileSync(new URL('components/newsroom/production-script-desk.tsx', frontendRoot), 'utf8'), /state\.workflow\.variants\.map/, 'the production desk must display stored workflow variants read-only');
assert.equal(fs.existsSync(new URL('app/newsroom/[slug]/script/production-script-desk.tsx', frontendRoot)), false, 'there must not be a second route-owned production desk');

const generatedRoot = new URL('../production/newsroom/projects/', import.meta.url);
const bindingPath = new URL('research-657380fce7eaccc9.script-binding.json', generatedRoot);
const qaPath = new URL('research-657380fce7eaccc9.script-qa.json', generatedRoot);
const creator = new URL('./sync-production-script-qa.mjs', import.meta.url);
const before = [fs.readFileSync(bindingPath, 'utf8'), fs.readFileSync(qaPath, 'utf8')];
for (let run = 0; run < 2; run += 1) {
  const result = spawnSync(process.execPath, [fileURLToPath(creator), '--slug', 'research-657380fce7eaccc9'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
assert.deepEqual([fs.readFileSync(bindingPath, 'utf8'), fs.readFileSync(qaPath, 'utf8')], before, 'creator refresh must be byte-idempotent');
assert.equal(fs.readdirSync(generatedRoot).filter((name) => name === 'research-657380fce7eaccc9.script-binding.json').length, 1);
assert.equal(fs.readdirSync(generatedRoot).filter((name) => name === 'research-657380fce7eaccc9.script-qa.json').length, 1);

console.log('script sync and QA tests passed');
