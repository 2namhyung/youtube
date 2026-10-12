import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = path.join(root, 'out', '.private', 'research-6b1a8af9b4143acb', 'production-keyframe-grok-v1', 'cut-001', 'cut-001-semantic-qa-v1.json');
const ffprobe = 'C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffprobe.exe';
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const claimed = artifact.artifactSha256;
delete artifact.artifactSha256;
if (sha(Buffer.from(JSON.stringify(artifact), 'utf8')) !== claimed) throw new Error('artifact hash drift');
if (artifact.status !== 'semantic-approved-private-cut' || artifact.humanApproval?.approved !== true) throw new Error('human semantic approval missing');
if (artifact.attempts?.length !== 3 || artifact.attempts[2]?.decision !== 'accepted-by-explicit-human-visual-approval') throw new Error('attempt lineage is invalid');
for (const binding of [artifact.input.productionKeyframe, artifact.input.koreanPromptPack, ...artifact.attempts.flatMap((item) => [item.source, item.contactSheet]), artifact.output]) {
  const absolute = path.resolve(root, binding.relativePath);
  const bytes = fs.readFileSync(absolute);
  if (bytes.length !== binding.bytes || sha(bytes) !== binding.sha256) throw new Error(`binding drift: ${binding.relativePath}`);
}
const output = path.resolve(root, artifact.output.relativePath);
const probe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames:format=duration', '-of', 'json', output], { encoding: 'utf8' }));
const stream = probe.streams?.[0];
if (stream?.width !== 480 || stream?.height !== 480 || stream?.r_frame_rate !== '24/1' || stream?.nb_read_frames !== '72' || Number(probe.format?.duration) !== 3) throw new Error('normalized output probe mismatch');
if (artifact.selection.selectedInSeconds !== 0.5 || artifact.selection.selectedOutSeconds !== 3.5 || artifact.selection.playbackRate !== 1) throw new Error('semantic selection drift');
if (artifact.gates.upload || artifact.gates.publication || artifact.gates.stage07 || !artifact.gates.privateOnly) throw new Error('private gates are invalid');
const report = { schema: 'grok-production-keyframe-semantic-qa-verification-v1', verified: true, artifactSha256: claimed, outputSha256: artifact.output.sha256, probe, verifiedAt: '2026-08-15T01:56:00+09:00' };
const reportPath = path.join(path.dirname(artifactPath), 'cut-001-semantic-qa-verification-v1.json');
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));

