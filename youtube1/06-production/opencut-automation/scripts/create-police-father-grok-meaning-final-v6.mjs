import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const project = 'research-6b1a8af9b4143acb';
const privateRoot = path.join(root, 'out', '.private', project);
const priorRoot = path.join(privateRoot, 'grok-final-v5r1');
const outputRoot = path.join(privateRoot, 'grok-meaning-final-v6r1');
const ffmpeg = 'C:/Users/User/tools/ffmpeg-8.1-essentials_build/bin/ffmpeg.exe';
const ffprobe = 'C:/Users/User/tools/ffmpeg-8.1-essentials_build/bin/ffprobe.exe';
const priorVideo = path.join(priorRoot, 'police-father-grok-final-private-v5r1.mp4');
const priorManifest = path.join(priorRoot, 'final-manifest-v5r1.json');
const cut001 = path.join(privateRoot, 'production-keyframe-grok-v1', 'cut-001', 'cut-001-semantic-approved-480-v1.mp4');
const cut001Qa = path.join(privateRoot, 'production-keyframe-grok-v1', 'cut-001', 'cut-001-semantic-qa-v1.json');
const keyframeRoot = path.join(root, 'out', 'prototypes', `${project}-v37-production-keyframes-v1`);
const keyframeContact = path.join(keyframeRoot, 'production-keyframes-contact-sheet-v1.png');
const promptPack = path.join(root, 'production', 'newsroom', 'projects', `${project}.grok-korean-storyboard-prompt-pack-v3.md`);
const outputVideo = path.join(outputRoot, 'police-father-grok-meaning-final-private-v6r1.mp4');
const contact = path.join(outputRoot, 'qa', 'final-contact-sheet-v6r1.png');
const manifestPath = path.join(outputRoot, 'final-manifest-v6r1.json');

const sha = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const fileRecord = async (file) => ({
  file: path.relative(root, file).replaceAll('\\', '/'),
  bytes: (await stat(file)).size,
  sha256: await sha(file),
});
const run = (exe, args) => {
  const result = spawnSync(exe, args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${path.basename(exe)} failed: ${result.stderr}`);
};

await mkdir(path.dirname(contact), { recursive: true });
run(ffmpeg, [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-i', priorVideo, '-i', cut001,
  '-filter_complex', "[1:v]scale=972:972:flags=lanczos,setpts=PTS-STARTPTS[k];[0:v][k]overlay=54:474:enable='lt(t,3)'[v]",
  '-map', '[v]', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
  '-pix_fmt', 'yuv420p', '-r', '24', '-c:a', 'copy', '-movflags', '+faststart', outputVideo,
]);
run(ffmpeg, [
  '-hide_banner', '-loglevel', 'error', '-y', '-i', outputVideo,
  '-vf', 'fps=1/3,scale=270:480,tile=5x4:padding=8:margin=8:color=0x12191d',
  '-frames:v', '1', '-update', '1', contact,
]);
const probe = JSON.parse(spawnSync(ffprobe, [
  '-v', 'error', '-show_entries', 'format=duration:stream=index,codec_type,codec_name,width,height,r_frame_rate,nb_frames',
  '-of', 'json', outputVideo,
], { encoding: 'utf8' }).stdout);
const prior = JSON.parse(await readFile(priorManifest, 'utf8'));
const cutQa = JSON.parse(await readFile(cut001Qa, 'utf8'));
const manifest = {
  schema: 'grok-meaning-final-private-v6r1',
  project,
  status: 'private-candidate-primary-agent-meaning-qa',
  createdAt: new Date().toISOString(),
  qaPolicy: {
    rule: 'meaning-first-human-approval-v1',
    acceptedUiCandidates: [1, 3, 4],
    rejectedUiCandidates: [2],
    authority: 'user message 2026-08-15: candidates 1,3,4 communicate meaning; candidate 2 fails',
    criticalFailuresOnly: ['wrong person', 'opposite event', 'invented guilt or destruction method', 'identity exposure', 'meaning reversal'],
  },
  assembly: {
    method: 'append-only successor; replace canonical media window for first 3 seconds only',
    layoutInheritedFrom: await fileRecord(priorManifest),
    priorFinal: await fileRecord(priorVideo),
    cut001Replacement: await fileRecord(cut001),
    cut001Qa: { ...await fileRecord(cut001Qa), selected: cutQa.selected ?? null },
    remainingCuts: {
      source: 'existing Grok provider sources and trims bound by v5r1 manifest',
      disclosure: 'Cuts after 3.000s are requalified existing Grok outputs, not newly regenerated from v37 keyframes.',
      cutCount: prior.cuts?.length ?? 18,
    },
  },
  preproduction: {
    keyframeContact: await fileRecord(keyframeContact),
    promptPack: await fileRecord(promptPack),
    keyframeCount: 17,
  },
  output: await fileRecord(outputVideo),
  contactSheet: await fileRecord(contact),
  probe,
  gates: { privateOnly: true, upload: false, publication: false, stage07: false },
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputRoot, output: manifest.output, contactSheet: manifest.contactSheet, manifest: await fileRecord(manifestPath) }, null, 2));
