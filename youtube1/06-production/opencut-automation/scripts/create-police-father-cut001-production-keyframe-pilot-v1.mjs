import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const projectRoot = path.join(root, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v36-production-keyframes-v1', 'cut-001');
const inputs = [
  ['rough-storyboard', path.join(root, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v35-storyboards-production-v1', 'storyboards', 'cut-001.png')],
  ['character-son-v2', path.join(root, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v32-grok-reference-assets-production-v1', 'common-masters', 'character-son-v2.png')],
  ['character-teacher-v2', path.join(root, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v32-grok-reference-assets-production-v1', 'common-masters', 'character-teacher-v2.png')],
];
const keyframePath = path.join(projectRoot, 'cut-001-production-keyframe-v1.png');
const imagePromptPath = path.join(projectRoot, 'imagegen-prompt-v1.txt');
const grokPromptPath = path.join(projectRoot, 'grok-motion-prompt-v1.txt');
const manifestPath = path.join(projectRoot, 'production-keyframe-pilot-v1.json');

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const rel = value => path.relative(root, value).replaceAll(path.sep, '/');

function pngInfo(bytes) {
  if (bytes.length < 24 || bytes.subarray(1, 4).toString('ascii') !== 'PNG') throw new Error('not-png');
  return {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
}

async function fileRecord(id, file) {
  const bytes = await readFile(file);
  const dimensions = pngInfo(bytes);
  return {id, path: rel(file), bytes: bytes.length, sha256: sha256(bytes), ...dimensions};
}

const sourceRecords = [];
for (const [id, file] of inputs) sourceRecords.push(await fileRecord(id, file));
const keyframe = await fileRecord('cut-001-production-keyframe-v1', keyframePath);
const imagePromptBytes = await readFile(imagePromptPath);
const grokPromptBytes = await readFile(grokPromptPath);

const manifest = {
  schema: 'grok-production-keyframe-pilot-v1',
  status: 'private-preproduction-candidate-provider-blocked',
  story: 'research-6b1a8af9b4143acb',
  cutId: 'cut-001',
  purpose: 'validate a single finished character-and-paper-texture keyframe as the only Grok image-to-video input',
  sources: sourceRecords,
  imageGenPrompt: {path: rel(imagePromptPath), bytes: imagePromptBytes.length, sha256: sha256(imagePromptBytes)},
  keyframe,
  visualQa: {
    primaryAgentPass: true,
    checks: {
      oneFinishedFrameNotStoryboard: true,
      exactlyTwoPeople: true,
      approvedCharacterClothingAndHairIntegrated: true,
      premiumPaperCutTexture: true,
      phoneEntirelyBelowDesktop: true,
      phoneScreenAndUiAbsent: true,
      readableTextArrowsLogosAbsent: true,
      criticalActionOutsideBottomCaptionBand: true
    }
  },
  grokAttempt: {
    provider: 'grok-web-imagine',
    postUrl: 'https://grok.com/imagine/post/93ebda19-6749-4bc7-9f0b-9690bbc86908',
    inputCount: 1,
    inputId: keyframe.id,
    prompt: {path: rel(grokPromptPath), bytes: grokPromptBytes.length, sha256: sha256(grokPromptBytes)},
    requested: {aspectRatio: '1:1', resolution: '480p', durationSeconds: 6},
    result: 'usage-limit-reached-before-source-completion',
    sourceVideoCreated: false,
    semanticQaPerformed: false
  },
  gates: {productionApproved: false, providerRetryAllowed: false, render: false, upload: false, publication: false, stage07: false},
  nextAction: 'human approves this exact keyframe, then provider credit/reset is explicitly restored before a one-image retry'
};

const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(manifestPath, manifestBytes, {flag: 'wx'});
process.stdout.write(`${JSON.stringify({manifest: rel(manifestPath), sha256: sha256(manifestBytes), keyframeSha256: keyframe.sha256})}\n`);
