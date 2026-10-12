import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const value = (name) => args[args.indexOf(name) + 1];
const workspace = path.resolve(value('--workspace') || '.');
const profile = path.resolve(value('--profile') || '');
const heldOut = path.resolve(value('--held-out') || '');
const manifestPath = path.join(profile, 'prompt-bank', 'manifest.json');
const guideAuditPath = path.join(profile, 'prompt-bank', 'validation', 'corpus-audit.json');
const admissionPath = path.resolve(workspace, '03-script-voice', 'runs', 'owner-voice-v1-20260808', 'admission-ledger.json');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/u, ''));
const relative = (file) => path.relative(workspace, file).replaceAll(path.sep, '/');

const manifest = readJson(manifestPath);
const audit = readJson(guideAuditPath);
const acceptance = readJson(heldOut);
if (manifest.profileId !== 'owner-voice-v1' || manifest.modelRoute !== 'versioned-prompt-bank-profile-no-sft') throw new Error('owner-voice-v1 manifest identity mismatch');
if (acceptance.accepted !== true || acceptance.final?.segmentCount !== 1 || acceptance.final?.synthesizedSegmentCount !== 1 || acceptance.attemptCount > 4) throw new Error('held-out paragraph did not pass the bounded one-unit synthesis contract');
if (acceptance.evidence?.loraLoaded !== false || acceptance.evidence?.adapterLoaded !== false) throw new Error('held-out paragraph used an adapter or LoRA');
const required = ['사람을죽이려한행동', '위험한물질로동료를다치게한책임', '징역1년6개월', '3년동안', '형이줄었습니다'];
const acceptedAttempt = acceptance.attempts.flatMap((attempt) => attempt.segments || []).find((segment) => segment.accepted === true);
if (!acceptedAttempt || acceptedAttempt.sourceText !== acceptedAttempt.spokenText || acceptedAttempt.criticalPhraseChecks?.length !== 2) throw new Error('held-out paragraph source/spoken/critical evidence mismatch');
for (const check of acceptedAttempt.criticalPhraseChecks) {
  if (JSON.stringify(check.required) !== JSON.stringify(required) || check.missing.length) throw new Error(`held-out critical phrase failure for ${check.model}`);
}
if (!acceptedAttempt.asrChecks?.every((check) => check.cer <= 0.08)) throw new Error('held-out dual ASR CER gate failed');
if (acceptance.evidence.finalSignal?.clippedSamples !== 0) throw new Error('held-out paragraph clipped');

const canonicalStyles = ['hook', 'news_exposition', 'tension', 'legal_explanation', 'viewer_question', 'closing'];
const hashes = canonicalStyles.map((style) => manifest.styles?.[style]?.sha256);
if (hashes.some((hash) => !/^[0-9a-f]{64}$/.test(hash || '')) || new Set(hashes).size !== canonicalStyles.length) throw new Error('canonical owner voice guides must have six distinct hashes');
const guideEvidence = canonicalStyles.map((style) => {
  const file = audit.files.find((item) => path.parse(item.fileName).name === style);
  if (!file || file.signal.clippedSamples !== 0 || file.signal.peakDbfs > -1) throw new Error(`guide signal gate failed: ${style}`);
  return {
    style,
    audioSha256: manifest.styles[style].sha256,
    signal: file.signal,
    small: file.asr.small,
    medium: file.asr.medium,
    transcriptEvidence: {
      exactTranscriptClaimed: false,
      status: manifest.styles[style].source === 'verified-owner-recording-question-spans'
        ? 'owner-span-authority-plus-dual-asr-diagnostic'
        : 'instagram-sidecar-intended-text-plus-dual-asr-diagnostic',
      note: 'Recognizer output is diagnostic and is retained verbatim; it is not silently promoted to an exact transcript claim.',
    },
  };
});

const finalManifest = {
  ...manifest,
  status: 'validation-passed',
  productionEligible: true,
  validation: {
    status: 'passed',
    admissionLedger: { path: relative(admissionPath), sha256: sha256(admissionPath) },
    guideAudit: { path: relative(guideAuditPath), sha256: sha256(guideAuditPath), styles: guideEvidence },
    heldOutNurseParagraph: {
      acceptance: relative(heldOut),
      acceptanceSha256: sha256(heldOut),
      audio: relative(path.join(path.dirname(heldOut), 'nurse-plain-legal-paragraph.wav')),
      audioSha256: acceptance.evidence.finalAudioSha256,
      attemptCount: acceptance.attemptCount,
      segmentCount: acceptance.final.segmentCount,
      generationMode: 'single-natural-semantic-paragraph',
      phraseIsolation: false,
      pronunciationHints: false,
      directOwnerTargetSpans: false,
      asrChecks: acceptedAttempt.asrChecks,
      criticalPhraseChecks: acceptedAttempt.criticalPhraseChecks,
      signal: acceptance.evidence.finalSignal,
      loudness: acceptance.evidence.loudness,
    },
    humanAuditableAudio: [
      ...canonicalStyles.map((style) => ({ role: `guide-${style}`, path: relative(path.resolve(path.dirname(manifestPath), manifest.styles[style].audio)), sha256: manifest.styles[style].sha256 })),
      { role: 'held-out-nurse-paragraph', path: relative(path.join(path.dirname(heldOut), 'nurse-plain-legal-paragraph.wav')), sha256: acceptance.evidence.finalAudioSha256 },
    ],
    humanListeningRequiredForFinalVideo: true,
  },
};
const temp = `${manifestPath}.${process.pid}.tmp`;
try {
  fs.writeFileSync(temp, `${JSON.stringify(finalManifest, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, manifestPath);
} finally {
  if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
}
console.log(JSON.stringify({ manifest: manifestPath, sha256: sha256(manifestPath), styles: canonicalStyles.length, heldOutAudioSha256: acceptance.evidence.finalAudioSha256 }, null, 2));
