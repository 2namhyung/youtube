import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const workspace = path.resolve('../..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(workspace, relativePath), 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const profileRoot = path.join(workspace, '03-script-voice/voice-clone/profiles/owner-voice-v1/prompt-bank');
const profile = readJson('03-script-voice/voice-clone/profiles/owner-voice-v1/prompt-bank/manifest.json');
const ledger = readJson('03-script-voice/runs/owner-voice-v1-20260808/admission-ledger.json');
const acceptance = readJson('03-script-voice/runs/owner-voice-v1-20260808/held-out/nurse-plain-legal-paragraph.acceptance.json');
const script = readJson('06-production/opencut-automation/production/projects/coffee-pesticide-hospital-short-v1/script.final.json');
const project = readJson('06-production/opencut-automation/production/projects/coffee-pesticide-hospital-short-v1/project-editorial-cartoon.json');

assert.equal(profile.schemaVersion, 1);
assert.equal(profile.profileId, 'owner-voice-v1');
assert.equal(profile.status, 'validation-passed');
assert.equal(profile.productionEligible, true);
assert.equal(profile.ownerVoice, true);
assert.equal(profile.modelRoute, 'versioned-prompt-bank-profile-no-sft');
assert.deepEqual(profile.model, {
  id: 'Qwen/Qwen3-TTS-12Hz-0.6B-Base',
  revision: '5d83992436eae1d760afd27aff78a71d676296fc',
  precision: 'bf16',
  language: 'Korean',
  loraAllowed: false,
  adapterAllowed: false,
  fallbackAllowed: false,
});

const ledgerPath = path.join(workspace, profile.admissionLedger.path);
assert.equal(sha256(ledgerPath), profile.admissionLedger.sha256);
assert.equal(ledger.status, 'final');
assert.equal(ledger.authorization.ownerVoice, true);
assert.equal(ledger.authorization.thirdPartyAudio, false);
assert.equal(ledger.authorization.externalPublishAuthorized, false);
assert.equal(ledger.modelRoute.fullSft, false);
assert.equal(ledger.modelRoute.loraAllowed, false);
assert.equal(ledger.modelRoute.adapterAllowed, false);
assert.equal(ledger.modelRoute.fallbackAllowed, false);

const sourceDir = path.join(workspace, '03-script-voice/reference-audio/user');
const sourceFiles = fs.readdirSync(sourceDir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
assert.equal(sourceFiles.length, 30);
assert.deepEqual(ledger.files.map(({ fileName }) => fileName).sort(), sourceFiles);
assert.deepEqual(ledger.counts, { total: 30, admitted: 27, admittedWithRestrictions: 2, rejected: 1 });
assert.equal(ledger.files.filter(({ decision }) => decision === 'admitted').length, 27);
assert.equal(ledger.files.filter(({ decision }) => decision === 'admitted-with-restrictions').length, 2);
assert.equal(ledger.files.filter(({ decision }) => decision === 'rejected').length, 1);
for (const file of ledger.files) {
  assert.equal(file.ownerVoice, true, `${file.fileName}: ownerVoice`);
  assert.equal(file.thirdPartyAudio, false, `${file.fileName}: thirdPartyAudio`);
  assert.equal(file.originalPreservedReadOnly, true, `${file.fileName}: original preservation`);
  assert.equal(sha256(path.join(sourceDir, file.fileName)), file.sha256, `${file.fileName}: source hash`);
  if (!file.fileName.endsWith('.json')) {
    assert.deepEqual(file.dualAsrDiagnostic.models, ['small', 'medium']);
    assert.equal(file.dualAsrDiagnostic.exactTranscriptClaimed, false);
    for (const key of ['smallArtifact', 'mediumArtifact']) {
      const artifactPath = path.join(path.dirname(ledgerPath), file.dualAsrDiagnostic[key]);
      assert.ok(fs.existsSync(artifactPath), `${file.fileName}: missing ${key}`);
      assert.equal(sha256(artifactPath), file.dualAsrDiagnostic[`${key}Sha256`]);
    }
  } else {
    assert.deepEqual(file.uses, ['validation-provenance']);
  }
}

const requiredStyles = ['hook', 'news_exposition', 'tension', 'legal_explanation', 'viewer_question', 'closing'];
assert.deepEqual(Object.keys(profile.styles).sort(), [...requiredStyles].sort());
assert.equal(new Set(requiredStyles.map((style) => profile.styles[style].sha256)).size, requiredStyles.length);
for (const style of requiredStyles) {
  const guide = profile.styles[style];
  assert.equal(guide.ownerVoice, true, `${style}: ownerVoice`);
  assert.equal(sha256(path.join(profileRoot, guide.audio)), guide.sha256, `${style}: guide hash`);
  if ('thirdPartyAudio' in guide) assert.equal(guide.thirdPartyAudio, false, `${style}: thirdPartyAudio`);
  if ('thirdPartySpeakerIdentityRetained' in guide) assert.equal(guide.thirdPartySpeakerIdentityRetained, false, `${style}: identity retention`);
}
assert.equal(profile.generationContract.targetUnit, 'natural-sentence-or-semantic-paragraph');
assert.equal(profile.generationContract.phraseIsolationAllowed, false);
assert.equal(profile.generationContract.fixedPauseSeconds, null);
assert.equal(profile.validation.status, 'passed');
assert.equal(profile.validation.humanListeningRequiredForFinalVideo, true);

assert.equal(acceptance.accepted, true);
assert.equal(acceptance.attemptCount, 1);
assert.equal(acceptance.final.segmentCount, 1);
assert.equal(acceptance.final.ownerSegmentCount, 0);
assert.equal(acceptance.final.synthesizedSegmentCount, 1);
assert.equal(acceptance.final.synthesizedSegmentsDualAsr, true);
const acceptedSegment = acceptance.attempts[0].segments[0];
assert.equal(acceptedSegment.sourceText, acceptedSegment.spokenText);
assert.equal(acceptedSegment.generationMode, 'qwen-resynthesis');
assert.equal(acceptedSegment.pitchCorrections.length, 0);
assert.equal(acceptedSegment.signal.clippedSamples, 0);
assert.equal(acceptedSegment.asrChecks.length, 2);
assert.ok(acceptedSegment.asrChecks.every(({ cer }) => cer <= 0.08));
assert.ok(acceptedSegment.criticalPhraseChecks.every(({ missing }) => missing.length === 0));

const currentDraftSha256 = crypto.createHash('sha256').update(script.draft, 'utf8').digest('hex');
assert.equal(currentDraftSha256, '1e79b194c356f52ef41dc010c60b11c3b56abc4c2c1f808a933c0cad31c4aba2');
assert.equal('normalization' in script, false);
assert.equal(script.restoration?.exactCharacterRestoration, true);
assert.equal(script.restoration?.restoredDraftSha256, '740d18db54134f4bee1db672bebaa50c3a8ce7396ffb19b1fcb8ab6acc317a8d');
assert.equal(script.revision?.draftSha256, currentDraftSha256);
assert.equal(script.revision?.sourceRestoration?.restoredDraftSha256, script.restoration?.restoredDraftSha256);
assert.deepEqual(script.restoration?.removedRuleIds, [
  'legal-attempted-murder-plain-v1',
  'legal-special-injury-plain-v1',
  'legal-suspended-sentence-plain-v1',
]);
assert.ok(script.draft.includes('검찰은 살인미수를 주장했지만 법원이 인정한 건 특수상해였습니다.'));
assert.ok(script.draft.includes('항소심에선 징역 1년 6개월에 집행유예 3년으로 형이 줄었습니다.'));
for (const rejectedRewrite of ['사람을 죽이려 한 행동', '위험한 물질로 동료를 다치게 한 책임', '3년 동안 문제를 일으키지 않으면 바로 감옥에 가지 않는 판결']) {
  assert.ok(!script.draft.includes(rejectedRewrite), `rejected rewrite remains: ${rejectedRewrite}`);
}
assert.equal(project.narration.criticalPhraseIsolation, false);
assert.equal(project.narration.criticalPhraseAgreement, 'at-least-one-model');
assert.ok(project.narration.criticalPhrases.includes('안심하고 일할 수 없다면'));
assert.deepEqual(project.narration.pronunciationHints, [
  { source: '살인미수', spoken: '살인 미수' },
  { source: '특수상해', spoken: '특수 상해' },
  { source: '집행유예', spoken: '집행 유예' },
]);
for (const hint of project.narration.pronunciationHints) {
  assert.equal(hint.source.replaceAll(/\s/gu, ''), hint.spoken.replaceAll(/\s/gu, ''), `${hint.source}: pronunciation hint must be whitespace-only`);
}
assert.ok(!project.narration.ownerQuestionAudio, 'direct owner spans must remain disabled for this project');
assert.equal(project.narration.removeSilence, false);
assert.equal(project.narration.sentencePauseSeconds, 0);
assert.equal(project.narration.semanticPauseSeconds, 0);
assert.equal(project.narration.joinSafetySeconds, 0);
assert.equal(project.narration.questionStyle, 'viewer_question');
assert.equal(project.scenes.length, 23);
assert.deepEqual(project.transitionContract.boundaries.filter(({ type }) => type === 'dip-to-black').map(({ from, frames }) => [from, frames]), [[3, 12], [18, 12], [22, 12]]);
assert.deepEqual(project.transitionContract.boundaries.filter(({ type }) => type === 'slide-left').map(({ from, frames }) => [from, frames]), [[12, 12]]);
assert.ok(project.transitionContract.boundaries.filter(({ type }) => type === 'hard-cut').every(({ frames }) => frames === 0));
assert.ok(project.scenes.every((scene) => scene.camera === 'none' && scene.intensity === 0 && scene.zoom === 1));

console.log(JSON.stringify({ status: 'pass', sourceFiles: sourceFiles.length, styles: requiredStyles.length, heldOutAttempts: acceptance.attemptCount, heldOutSegments: acceptance.final.segmentCount, scenes: project.scenes.length, semanticTransitions: 4 }, null, 2));
