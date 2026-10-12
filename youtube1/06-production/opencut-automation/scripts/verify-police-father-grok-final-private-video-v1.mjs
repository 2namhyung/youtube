import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectId = 'research-6b1a8af9b4143acb';
const outputRoot = path.join(root, 'out', '.private', projectId, 'grok-final-v4');
const manifestPath = path.join(outputRoot, 'final-manifest-v1.json');
const verificationPath = path.join(outputRoot, 'verification-v1.json');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const read = (p) => fs.readFileSync(p);
const assert = (v, m) => { if (!v) throw new Error(m); };
const probe = (p) => { const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=index,codec_type,width,height,r_frame_rate,nb_frames,duration:format=duration', '-of', 'json', p], { encoding: 'utf8' }); if (r.status !== 0) throw new Error(`ffprobe failed ${p}: ${r.stderr}`); return JSON.parse(r.stdout); };
const relPath = (rel) => { const p = path.resolve(root, rel); assert(p === root || p.startsWith(`${root}${path.sep}`), `path escapes root: ${rel}`); return p; };

const manifest = JSON.parse(read(manifestPath).toString('utf8'));
assert(manifest.schema === 'grok-final-private-video-v1' && manifest.status === 'private-only', 'manifest schema/status invalid');
assert(manifest.permissions?.upload === false && manifest.permissions?.publication === false && manifest.permissions?.stage07 === false, 'release gate opened');
assert(manifest.authorities.executionManifest.sha256 === 'cbfd8a618ded4fcd6415d88dc4a632fdf244f04998c7df0c897c41369b4bd008', 'execution authority mismatch');
const execPath = relPath(manifest.authorities.executionManifest.file); assert(sha(read(execPath)) === manifest.authorities.executionManifest.sha256, 'execution bytes drift');
const audioPath = relPath(manifest.authorities.narration.file); assert(sha(read(audioPath)) === manifest.authorities.narration.sha256, 'narration bytes drift');
assert(manifest.authorities.narration.durationSeconds === 55.016 && manifest.authorities.narration.cues.length === 7, 'narration cue authority invalid');
assert(manifest.authorities.title.line1 === '경찰 아버지가' && manifest.authorities.title.line2 === '부순 휴대전화', 'title authority mismatch');

const finalPath = relPath(manifest.output.file); assert(sha(read(finalPath)) === manifest.output.sha256, 'final output hash drift');
const finalProbe = probe(finalPath); const video = finalProbe.streams.find((s) => s.codec_type === 'video'); const audio = finalProbe.streams.find((s) => s.codec_type === 'audio');
assert(video && video.width === 1080 && video.height === 1920 && video.r_frame_rate === '24/1' && Number(video.nb_frames) >= 1320, 'final video geometry/fps invalid');
assert(audio && Math.abs(Number(audio.duration) - 55.016) < 0.1, 'final audio duration invalid');
assert(Math.abs(Number(finalProbe.format.duration) - 55.016) < 0.1, 'final duration invalid');

assert(manifest.cuts.length === 18, 'cut count invalid');
const sourceChecks = []; let total = 0;
for (const cut of manifest.cuts) {
  assert(cut.selectedOutSeconds > cut.selectedInSeconds && cut.durationSeconds >= 2 && cut.durationSeconds <= 4, `selection invalid ${cut.cutId}`);
  total += cut.durationSeconds; const source = relPath(cut.provider.file); const stat = fs.lstatSync(source); assert(stat.isFile() && !stat.isSymbolicLink(), `provider source unsafe ${cut.cutId}`); assert(sha(read(source)) === cut.provider.sha256 && stat.size === cut.provider.bytes, `provider source drift ${cut.cutId}`);
  const p = probe(source); const sv = p.streams.find((s) => s.codec_type === 'video'); assert(sv && sv.width === sv.height && sv.width >= 480 && sv.height >= 480 && sv.r_frame_rate === '24/1', `provider geometry invalid ${cut.cutId}`); assert(Math.abs(Number(p.format.duration) - 6.04) < 0.2, `provider duration invalid ${cut.cutId}`);
  const trim = relPath(cut.trim.file); const ts = fs.lstatSync(trim); assert(ts.isFile() && !ts.isSymbolicLink() && sha(read(trim)) === cut.trim.sha256, `trim drift ${cut.cutId}`); assert(cut.trim.frames === Math.round(cut.durationSeconds * 24), `trim frame count invalid ${cut.cutId}`);
  sourceChecks.push({ cutId: cut.cutId, providerSha256: cut.provider.sha256, trimSha256: cut.trim.sha256, selectedInSeconds: cut.selectedInSeconds, selectedOutSeconds: cut.selectedOutSeconds });
}
assert(Math.abs(total - 55) < 1e-6, `timeline total invalid ${total}`);
assert(manifest.postProcessing?.cut010SafetyRedaction?.applied === true && manifest.postProcessing.cut010SafetyRedaction.coversCharacter === false, 'cut010 safety redaction missing');
assert(manifest.supplementalVisualOverlay?.cutId === 'cut-010' && manifest.supplementalVisualOverlay.startSeconds === 29 && manifest.supplementalVisualOverlay.endSeconds === 32, 'supplemental overlay metadata missing');
const assPath = relPath(manifest.captionTrack.file); const assText = read(assPath).toString('utf8'); assert(sha(read(assPath)) === manifest.captionTrack.sha256, 'caption track drift'); assert(assText.includes('pos(540,1400)') && assText.includes('경찰 아버지가') && assText.includes('부순 휴대전화'), 'caption/title geometry missing');
assert(assText.includes('A 경감 주장') && assText.includes('다른 사건 비교는\\N억울·부당') && assText.includes('0:00:29.00,0:00:32.00'), 'supplemental overlay event missing');

const priorReport = fs.existsSync(verificationPath) ? JSON.parse(read(verificationPath).toString('utf8')) : null;
const verifiedAt = priorReport?.verifiedAt || new Date().toISOString();
assert(typeof verifiedAt === 'string' && !Number.isNaN(Date.parse(verifiedAt)), 'verification timestamp invalid');
const report = { schema: 'grok-final-private-video-verification-v1', verifiedAt, status: 'passed', final: { file: manifest.output.file, sha256: manifest.output.sha256, ffprobe: finalProbe }, sourceChecks, gates: manifest.permissions, redaction: manifest.postProcessing.cut010SafetyRedaction };
const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
if (fs.existsSync(verificationPath)) assert(read(verificationPath).equals(bytes), 'verification report drift'); else fs.writeFileSync(verificationPath, bytes, { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, finalSha256: manifest.output.sha256, verificationPath, verificationSha256: sha(read(verificationPath)), cuts: sourceChecks.length, totalSeconds: total, video: { width: video.width, height: video.height, fps: video.r_frame_rate, frames: video.nb_frames }, audioSeconds: Number(audio.duration) }, null, 2));
