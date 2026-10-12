import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (v) => v.slice(1)));
const BASE = path.join(ROOT, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v29-common-masters-production-v4');
const PREVIEW = path.join(BASE, 'assets', 'scene-001', 'preview-gsap-v1');
const OUT = path.join(BASE, 'assets', 'scene-001', 'private-render-gsap-v1');
const HTML = path.join(PREVIEW, 'cut-001-gsap-preview.html');
const PREVIEW_MANIFEST = path.join(PREVIEW, 'cut-001-gsap-preview-v1.json');
const ADMISSION = path.join(BASE, 'assets', 'scene-001', 'admitted-cut001-v1', 'scene-asset-admission-v1.json');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const FFMPEG = 'C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffmpeg.exe';
const FFPROBE = 'C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffprobe.exe';
const WIDTH = 972;
const HEIGHT = 972;
const FPS = 24;
const FRAMES = 96;
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const rel = (file) => path.relative(ROOT, file).replaceAll('\\', '/');
const run = (exe, args, cwd = ROOT) => new Promise((resolve, reject) => {
  const child = spawn(exe, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`${path.basename(exe)} exited ${code}: ${stderr}`)));
});

const preview = JSON.parse(await fs.readFile(PREVIEW_MANIFEST, 'utf8'));
const admission = JSON.parse(await fs.readFile(ADMISSION, 'utf8'));
if (preview.privateOnly !== true || preview.composition?.width !== WIDTH || preview.composition?.height !== HEIGHT || preview.composition?.fps !== FPS || preview.composition?.frames !== FRAMES || preview.composition?.durationSeconds !== 4 || preview.composition?.audio !== false) throw new Error('cut001 preview composition contract is not renderable');
if (preview.engine?.id !== 'gsap-html-v1' || preview.engine?.authorityId !== 'gsap-html-authority-v1' || preview.engine?.rendererContract !== 'gsap-paused-timeline-frame-seek-972-v1') throw new Error('cut001 GSAP authority mismatch');
const htmlBytes = await fs.readFile(HTML);
if (sha256(htmlBytes) !== preview.previewHtml.sha256 || !htmlBytes.includes(Buffer.from('gsap.timeline({paused:true'))) throw new Error('cut001 HTML drifted or is not a paused GSAP timeline');
const admissionBytes = await fs.readFile(ADMISSION);
if (sha256(admissionBytes) !== preview.sourceAdmission.sha256 || admission.status !== 'admitted-private-only') throw new Error('cut001 admission drifted');
for (const asset of preview.assets) {
  const bytes = await fs.readFile(path.join(ROOT, asset.relativePath));
  if (sha256(bytes) !== asset.admittedSha256) throw new Error(`cut001 admitted asset drift: ${asset.assetId}`);
}

await fs.mkdir(OUT, { recursive: true });
const frameDir = path.join(OUT, 'frames');
await fs.rm(frameDir, { recursive: true, force: true });
await fs.mkdir(frameDir, { recursive: true });
const browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--allow-file-access-from-files', '--disable-network-service'] });
let timelineInfo = { duration: 0, count: 0 };
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  await page.route('**/*', (route) => {
    const url = route.request().url();
    return url.startsWith('file:') || url.startsWith('data:') ? route.continue() : route.abort('blockedbyclient');
  });
  await page.goto(pathToFileURL(HTML).href, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.gsap !== 'undefined' && window.gsap.globalTimeline.getChildren().length > 0);
  timelineInfo = await page.evaluate(() => {
    const timelines = window.gsap.globalTimeline.getChildren(true, true, true).filter((item) => item && item.constructor?.name === 'Timeline' && typeof item.seek === 'function');
    if (!timelines.length) throw new Error('GSAP timeline not found');
    timelines[0].pause(0);
    return { duration: timelines[0].duration(), count: timelines.length };
  });
  if (!(timelineInfo.duration > 0) || timelineInfo.count < 1) throw new Error('invalid GSAP timeline');
  for (let frame = 0; frame < FRAMES; frame += 1) {
    const seconds = frame / FPS;
    await page.evaluate((time) => {
      const timelines = window.gsap.globalTimeline.getChildren(true, true, true).filter((item) => item && item.constructor?.name === 'Timeline' && typeof item.seek === 'function');
      for (const timeline of timelines) timeline.pause().seek(time, false);
      document.body.dataset.frameReady = String(time);
    }, seconds);
    await page.screenshot({ path: path.join(frameDir, `frame-${String(frame + 1).padStart(4, '0')}.png`) });
  }
  await page.close();
} finally {
  await browser.close();
}

const frameFiles = [];
for (let frame = 1; frame <= FRAMES; frame += 1) {
  const file = path.join(frameDir, `frame-${String(frame).padStart(4, '0')}.png`);
  const bytes = await fs.readFile(file);
  if (bytes.readUInt32BE(16) !== WIDTH || bytes.readUInt32BE(20) !== HEIGHT) throw new Error(`frame dimensions invalid: ${file}`);
  frameFiles.push({ frame, relativePath: rel(file), sha256: sha256(bytes), bytes: bytes.length });
}

const output = path.join(OUT, 'cut-001-gsap-private.mp4');
const contactSheet = path.join(OUT, 'cut-001-gsap-contact-sheet.png');
const encodeArgs = ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(frameDir, 'frame-%04d.png'), '-frames:v', String(FRAMES), '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output];
const contactArgs = ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(frameDir, 'frame-%04d.png'), '-vf', "select='eq(n,0)+eq(n,19)+eq(n,47)+eq(n,95)',tile=2x2:padding=8:margin=8", '-frames:v', '1', '-c:v', 'png', contactSheet];
const probeArgs = ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames,codec_name,pix_fmt', '-of', 'json', output];
const toolInvocation = {
  schema: 'newsroom-cut-private-render-tool-invocation-v1',
  networkBlocked: true,
  capture: { executable: EDGE, executableSha256: sha256(await fs.readFile(EDGE)), html: rel(HTML), width: WIDTH, height: HEIGHT, fps: FPS, frames: FRAMES, browserArgs: ['--allow-file-access-from-files', '--disable-network-service'], blockedSchemes: ['http:', 'https:'] },
  encode: { executable: FFMPEG, executableSha256: sha256(await fs.readFile(FFMPEG)), args: encodeArgs.map((arg) => arg === output ? rel(output) : arg.startsWith(frameDir) ? rel(arg) : arg) },
  contactSheet: { executable: FFMPEG, args: contactArgs.map((arg) => arg === contactSheet ? rel(contactSheet) : arg.startsWith(frameDir) ? rel(arg) : arg) },
  probe: { executable: FFPROBE, executableSha256: sha256(await fs.readFile(FFPROBE)), args: probeArgs.map((arg) => arg === output ? rel(output) : arg) }
};
const invocationPath = path.join(OUT, 'tool-invocation-v1.json');
await fs.writeFile(invocationPath, `${JSON.stringify(toolInvocation, null, 2)}\n`);
const invocationBytes = Buffer.from(`${JSON.stringify(toolInvocation, null, 2)}\n`, 'utf8');
await run(FFMPEG, encodeArgs);
await run(FFMPEG, contactArgs);
const probe = JSON.parse(await run(FFPROBE, probeArgs)).streams?.[0];
if (probe?.width !== WIDTH || probe?.height !== HEIGHT || probe?.r_frame_rate !== '24/1' || Number(probe?.nb_read_frames) !== FRAMES || probe?.codec_name !== 'h264' || probe?.pix_fmt !== 'yuv420p') throw new Error(`private MP4 probe contract failed: ${JSON.stringify(probe)}`);
const renderBytes = await fs.readFile(output);
const contactBytes = await fs.readFile(contactSheet);
const first = frameFiles[0]; const emphasis = frameFiles[19]; const hold = frameFiles[47]; const end = frameFiles[95];
const artifact = {
  schema: 'newsroom-cut-private-render-v1',
  slug: 'research-6b1a8af9b4143acb',
  cutId: 'cut-001',
  status: 'private-rendered',
  privateOnly: true,
  providerCalls: { imageGen: false, grok: false, upload: false, publication: false, stage07: false },
  sourcePreview: { relativePath: rel(PREVIEW_MANIFEST), sha256: sha256(await fs.readFile(PREVIEW_MANIFEST)) },
  sourceHtml: { relativePath: rel(HTML), sha256: sha256(htmlBytes) },
  sourceAdmission: { relativePath: rel(ADMISSION), sha256: sha256(admissionBytes) },
  toolInvocation: { relativePath: rel(invocationPath), sha256: sha256(invocationBytes) },
  engine: { id: preview.engine.id, authorityId: preview.engine.authorityId, authorityBundleId: preview.engine.authorityBundleId, authorityBundleSha256: preview.engine.authorityBundleSha256, adapterSha256: preview.engine.adapterSha256, rendererContract: preview.engine.rendererContract, dependency: preview.engine.dependency },
  composition: { width: WIDTH, height: HEIGHT, fps: FPS, durationSeconds: 4, frames: FRAMES, audio: false, title: false, captions: false },
  frameSeek: { timelineDurationSeconds: timelineInfo.duration, frameHashes: frameFiles, visualChange: { first, emphasis, hold, end, firstAndEndMayMatch: true } },
  output: { relativePath: rel(output), sha256: sha256(renderBytes), bytes: renderBytes.length, probe },
  contactSheet: { relativePath: rel(contactSheet), sha256: sha256(contactBytes), bytes: contactBytes.length, frames: [1, 20, 48, 96] },
  creator: 'newsroom-cut-private-render-creator-v1',
  verifier: { id: 'newsroom-cut-private-render-verifier-v1', verified: true, networkBlocked: true, finalEncodeMuxQc: 'ffmpeg' }
};
artifact.artifactSha256 = sha256(Buffer.from(JSON.stringify(artifact), 'utf8'));
await fs.writeFile(path.join(OUT, 'cut-001-gsap-private-render-v1.json'), `${JSON.stringify(artifact, null, 2)}\n`, { flag: 'w' });
console.log(JSON.stringify({ artifactSha256: artifact.artifactSha256, output: rel(output), contactSheet: rel(contactSheet), frames: FRAMES, probe }));
