import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'out', '.private', 'research-6b1a8af9b4143acb', 'production-keyframe-grok-v1', 'cut-001');
const projectPrompt = path.join(root, 'production', 'newsroom', 'projects', 'research-6b1a8af9b4143acb.grok-korean-storyboard-prompt-pack-v3.md');
const keyframe = path.join(root, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v36-production-keyframes-v1', 'cut-001', 'cut-001-production-keyframe-v1.png');
const target = path.join(out, 'cut-001-semantic-qa-v1.json');
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const rel = (value) => path.relative(root, value).replaceAll('\\', '/');
const bind = (name) => { const absolute = path.join(out, name); const bytes = fs.readFileSync(absolute); return { relativePath: rel(absolute), sha256: sha(bytes), bytes: bytes.length }; };
const promptBytes = fs.readFileSync(projectPrompt);
const keyframeBytes = fs.readFileSync(keyframe);

const artifact = {
  schema: 'grok-production-keyframe-semantic-qa-v1',
  projectId: 'research-6b1a8af9b4143acb',
  cutId: 'cut-001',
  status: 'semantic-approved-private-cut',
  humanApproval: {
    approved: true,
    approvedAt: '2026-08-15T01:55:00+09:00',
    authority: 'explicit-user-message-current-video-is-pass',
    criterion: 'core-news-meaning-is-intuitively-communicated',
  },
  input: {
    productionKeyframe: { relativePath: rel(keyframe), sha256: sha(keyframeBytes), bytes: keyframeBytes.length },
    koreanPromptPack: { relativePath: rel(projectPrompt), sha256: sha(promptBytes), bytes: promptBytes.length, language: 'ko' },
    providerPostUrl: 'https://grok.com/imagine/post/dbe8b00d-6590-485c-a4d9-602ab81f3ce4',
  },
  attempts: [
    { attempt: 1, decision: 'rejected-primary-agent-pre-user-approval', source: bind('cut-001-grok-provider-source-v1.mp4'), contactSheet: bind('cut-001-grok-contact-sheet-v1.png'), reason: 'phone trajectory reversed and teacher reaction was weak' },
    { attempt: 2, decision: 'rejected-primary-agent-pre-user-approval', source: bind('cut-001-grok-provider-source-v2.mp4'), contactSheet: bind('cut-001-grok-contact-sheet-v2.png'), reason: 'phone rose above desktop and teacher walked away' },
    { attempt: 3, decision: 'accepted-by-explicit-human-visual-approval', source: bind('cut-001-grok-provider-source-v3.mp4'), contactSheet: bind('cut-001-grok-contact-sheet-v3.png'), warnings: ['phone rises higher than authored preference', 'minor trajectory reversal', 'teacher reaction is less pronounced than authored target'], meaningPass: ['student visibly handles a phone in classroom', 'teacher visibly notices or reorients', 'two-person paper-cut classroom scene remains understandable'] },
  ],
  selection: { sourceAttempt: 3, selectedInSeconds: 0.5, selectedOutSeconds: 3.5, durationSeconds: 3, playbackRate: 1, reason: 'continuous window communicates the student-phone and teacher-notice relationship accepted by the user' },
  output: { ...bind('cut-001-semantic-approved-480-v1.mp4'), width: 480, height: 480, fps: 24, frameCount: 72, durationSeconds: 3, audio: false },
  gates: { privateOnly: true, upload: false, publication: false, stage07: false },
  creator: 'police-father-cut001-production-keyframe-grok-creator-v1',
  verifier: 'police-father-cut001-production-keyframe-grok-verifier-v1',
};
artifact.artifactSha256 = sha(Buffer.from(JSON.stringify(artifact), 'utf8'));
fs.writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ artifact: rel(target), artifactSha256: artifact.artifactSha256, outputSha256: artifact.output.sha256 }, null, 2));

