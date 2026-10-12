import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve('C:/Users/User/Desktop/app/youtube');
const outDir = path.join(root, '06-production', 'opencut-automation', 'out', 'studies', 'research-6b1a8af9b4143acb', 'motion-design-preproduction-v1');
const artifactPath = path.join(outDir, 'motion-design-preproduction-v1.json');
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const errors = [];
if (artifact.schema !== 'motion-design-preproduction-v1') errors.push('schema');
if (artifact.cuts.length !== 18) errors.push(`cut-count:${artifact.cuts.length}`);
if (artifact.durationSeconds !== 55.016) errors.push('duration');
if (artifact.fps !== 24) errors.push('fps');
if (artifact.geometry.media.x !== 54 || artifact.geometry.media.y !== 474 || artifact.geometry.media.width !== 972 || artifact.geometry.media.height !== 972) errors.push('media-geometry');
if (artifact.geometry.captions.x !== 540 || artifact.geometry.captions.y !== 1400 || artifact.geometry.captions.safeWidth !== 920) errors.push('caption-geometry');
let cursor = 0;
for (const [i, cut] of artifact.cuts.entries()) {
  const t = cut.timeline;
  if (Math.abs(t.startSeconds - cursor) > 0.00001) errors.push(`non-contiguous:${cut.cutId}`);
  if (t.endSeconds <= t.startSeconds) errors.push(`duration:${cut.cutId}`);
  if (!cut.preproduction.claim.claimId || cut.preproduction.claim.status !== 'observed-from-authoritative-plan') errors.push(`claim:${cut.cutId}`);
  if (cut.preproduction.functionalLayers.length < 6 || cut.preproduction.functionalLayers.length > 10) errors.push(`layers:${cut.cutId}`);
  if (cut.preproduction.focalObjectOccupancyPercent < 70 || cut.preproduction.focalObjectOccupancyPercent > 85) errors.push(`occupancy:${cut.cutId}`);
  if (cut.implementationMode === 'image_to_video_animation' && cut.cutId !== 'cut-004') errors.push(`grok-exception:${cut.cutId}`);
  if (cut.cutId === 'cut-004' && cut.preproduction.engineAssignment.status !== 'placeholder-only') errors.push('cut004-placeholder');
  cursor = t.endSeconds;
}
if (Math.abs(cursor - artifact.durationSeconds) > 0.00001) errors.push(`timeline-end:${cursor}`);
const reportPath = path.join(outDir, 'render-report.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
for (const [label, file] of Object.entries({ video: path.join(outDir, 'animatic', 'animatic-1080x1920-24fps.mp4'), contactSheet: path.join(outDir, 'animatic-contact-sheet.png'), styleframe: path.join(outDir, 'cut001-styleframe', 'cut001-styleframe.png') })) {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) errors.push(`missing:${label}`);
}
let ffprobe = {};
try { ffprobe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path.join(outDir, 'animatic', 'animatic-1080x1920-24fps.mp4')], { encoding: 'utf8' })); } catch { errors.push('ffprobe'); }
const video = ffprobe.streams?.find((s) => s.codec_type === 'video');
if (!video || video.width !== 1080 || video.height !== 1920 || video.r_frame_rate !== '24/1') errors.push('video-geometry');
const result = { schema: 'motion-design-preproduction-verifier-v1', verifiedAt: new Date().toISOString(), artifactSha256: sha(artifactPath), renderReportSha256: sha(reportPath), errors, pass: errors.length === 0, observed: { videoDurationSeconds: ffprobe.format?.duration ? Number(ffprobe.format.duration) : null, frameCount: video?.nb_frames ? Number(video.nb_frames) : null, videoCodec: video?.codec_name || null }, policy: { providerCalls: false, productionRender: false, upload: false, publication: false, priorBytesModified: false } };
fs.writeFileSync(path.join(outDir, 'motion-design-preproduction-v1.verifier.json'), JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exit(1);
