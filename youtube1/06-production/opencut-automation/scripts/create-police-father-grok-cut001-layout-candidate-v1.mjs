import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectId = 'research-6b1a8af9b4143acb';
const source = 'C:\\Users\\User\\.codex\\generated_images\\019fffd6-ceb0-7652-9325-8055b6b6541e\\exec-f07b58a3-fd92-489e-b8cb-6d3cbc69c41b.png';
const out = path.join(root, 'out', 'prototypes', `${projectId}-v34-grok-cut001-layout-keyframe-candidate`);
const image = path.join(out, 'cut-001-layout-keyframe-candidate-v1.png');
const manifestPath = path.join(out, 'candidate-manifest-v1.json');
const requestPath = path.join(root, 'out', 'newsroom', 'grok-sources', projectId, 'cut-001', 'request-v3', 'grok-request-v3.json');
const ffprobe = 'C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffprobe.exe';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const read = p => fs.readFileSync(p);
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const immutable = (file, bytes) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) assert(read(file).equals(bytes), `append-only drift: ${file}`);
  else { fs.writeFileSync(file, bytes, { flag: 'wx' }); fs.chmodSync(file, 0o444); }
};
const sourceBytes = read(source);
immutable(image, sourceBytes);
const probe = JSON.parse(execFileSync(ffprobe, ['-v','error','-select_streams','v:0','-show_entries','stream=width,height,pix_fmt','-of','json',image], { encoding: 'utf8' }));
assert(probe.streams?.[0]?.width === probe.streams?.[0]?.height && probe.streams[0].width >= 1024, 'layout candidate must be high-resolution square');
const attempts = [
  ['provider-web-v3','cut-001-grok-provider-source-v3.mp4','duplicate phone'],
  ['provider-web-v4','cut-001-grok-provider-source-v4.mp4','oversized document and phone; marker became card'],
  ['provider-web-v5','cut-001-grok-provider-source-v5.mp4','oversized document; authored desk layout lost'],
].map(([dir,file,failure]) => {
  const p = path.join(root,'out','newsroom','grok-sources',projectId,'cut-001',dir,file);
  return { attempt: dir, sourceSha256: sha(read(p)), semanticQa: 'rejected', failure };
});
const requestBytes = read(requestPath);
const manifest = {
  schema: 'grok-layout-keyframe-candidate-v1', projectId, cutId: 'cut-001', status: 'qa-passed-human-approval-pending',
  purpose: 'sixth reference that fixes relative scale and placement while the five approved identity references remain separate',
  sourceMode: 'built-in-imagegen-compositing-plus-single-object-removal-edit',
  file: path.basename(image), bytes: sourceBytes.length, sha256: sha(sourceBytes), dimensions: probe.streams[0],
  visualQa: {
    exactlyOneTeacher: true, exactlyOneComplaintDocument: true, exactlyOneIntactPhone: true, thinBurgundyMarker: true,
    phoneRightOfDocument: true, lowerForegroundEmpty: true, readableTextAbsent: true, logoAndInsigniaAbsent: true,
    objectScaleSuitableForSquareVideo: true,
  },
  priorAttemptEvidence: attempts,
  requestV3Sha256: sha(requestBytes),
  humanReview: { approved: false, pending: true },
  production: { approved: false, privateOnly: true, public: false },
  permissions: { providerCall: false, render: false, upload: false, publication: false, stage07: false },
};
const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
immutable(manifestPath, bytes);
console.log(JSON.stringify({ manifestPath, manifestSha256: sha(read(manifestPath)), image, imageSha256: sha(read(image)), dimensions: probe.streams[0] }, null, 2));
