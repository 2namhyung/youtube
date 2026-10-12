import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const project = 'research-6b1a8af9b4143acb';
const outputRoot = path.join(root, 'out', '.private', project, 'grok-meaning-final-v6r1');
const manifestPath = path.join(outputRoot, 'final-manifest-v6r1.json');
const reportPath = path.join(outputRoot, 'verification-v6r1.json');
const ffprobe = 'C:/Users/User/tools/ffmpeg-8.1-essentials_build/bin/ffprobe.exe';
const sha = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const failures = [];
const verifyRecord = async (record) => {
  const file = path.resolve(root, record.file);
  const info = await stat(file);
  if (info.size !== record.bytes) failures.push(`byte drift: ${record.file}`);
  if (await sha(file) !== record.sha256) failures.push(`hash drift: ${record.file}`);
  return file;
};
for (const record of [manifest.assembly.layoutInheritedFrom, manifest.assembly.priorFinal, manifest.assembly.cut001Replacement, manifest.assembly.cut001Qa, manifest.preproduction.keyframeContact, manifest.preproduction.promptPack, manifest.output, manifest.contactSheet]) await verifyRecord(record);
if (manifest.qaPolicy.acceptedUiCandidates.join(',') !== '1,3,4') failures.push('meaning approval drift');
if (manifest.qaPolicy.rejectedUiCandidates.join(',') !== '2') failures.push('rejected candidate drift');
if (!manifest.assembly.remainingCuts.disclosure.includes('not newly regenerated')) failures.push('reuse disclosure missing');
if (!manifest.gates.privateOnly || manifest.gates.upload || manifest.gates.publication || manifest.gates.stage07) failures.push('gate drift');
const output = path.resolve(root, manifest.output.file);
const probe = JSON.parse(spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate,nb_frames', '-of', 'json', output], { encoding: 'utf8' }).stdout);
const video = probe.streams.find((stream) => stream.codec_type === 'video');
const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
const duration = Number(probe.format.duration);
if (video?.width !== 1080 || video?.height !== 1920 || video?.r_frame_rate !== '24/1') failures.push('video contract mismatch');
if (!audio) failures.push('audio missing');
if (Math.abs(duration - 55.04) > 0.08) failures.push(`duration mismatch: ${duration}`);
const report = {
  schema: 'grok-meaning-final-private-verification-v6r1',
  verified: failures.length === 0,
  failures,
  manifestSha256: await sha(manifestPath),
  outputSha256: await sha(output),
  probe,
  gates: manifest.gates,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
if (failures.length) throw new Error(JSON.stringify(report, null, 2));
console.log(JSON.stringify({ reportPath, reportSha256: await sha(reportPath), outputSha256: report.outputSha256 }, null, 2));
