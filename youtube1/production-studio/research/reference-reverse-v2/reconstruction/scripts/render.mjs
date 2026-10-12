import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(root, 'output');
const studyDir = path.resolve(root, '..', '..', '..', '..', '06-production', 'opencut-automation', 'studies', 'generic-character-motion-test-v1');
const cli = path.join(studyDir, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const entry = path.join(root, 'src', 'index.jsx');
const renderOut = path.join(out, 'reconstruction-only.mp4');
const ffmpeg = process.env.FFMPEG || 'C:/Users/User/tools/ffmpeg-8.1-essentials_build/bin/ffmpeg.exe';
const source = path.resolve(root, '..', '..', 'reference-reverse-v1', 'source', 'VQazcEuV9Xw.mp4');
const fps = 30000 / 1001;
const panelFont = 'C\\:/Windows/Fonts/malgunbd.ttf';
const sampleFrames = [0, 40, 80, 102, 103, 130, 142, 232, 250, 262];
fs.mkdirSync(out, {recursive: true});
if (!fs.existsSync(cli)) throw new Error(`Remotion CLI not found at ${cli}`);
const args = [cli, 'render', entry, 'VQazcEu9XwReconstruction', renderOut, '--codec', 'h264', '--crf', '18', '--concurrency', '1', '--muted'];
const result = spawnSync(process.execPath, args, {cwd: studyDir, stdio: 'inherit', shell: false});
if (result.status !== 0) process.exit(result.status ?? 1);

const sideBySide = path.join(out, 'comparison.mp4');
const referenceSnippet = path.join(out, '.reference-snippet.mp4');
const referenceFilter = [
  '[0:v]trim=start_frame=575:end_frame=678,setpts=N/(30000/1001*TB),scale=540:960:force_original_aspect_ratio=decrease,pad=540:960:(ow-iw)/2:(oh-ih)/2:black[a0]',
  '[0:v]trim=start_frame=1304:end_frame=1464,setpts=N/(30000/1001*TB),scale=540:960:force_original_aspect_ratio=decrease,pad=540:960:(ow-iw)/2:(oh-ih)/2:black[b0]',
  '[a0][b0]concat=n=2:v=1:a=0,setpts=N/(30000/1001*TB)[out]'
].join(';');
const referenceArgs = ['-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-filter_complex', referenceFilter, '-map', '[out]', '-an', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', referenceSnippet];
const referenceResult = spawnSync(ffmpeg, referenceArgs, {cwd: root, stdio: 'inherit', shell: false});
if (referenceResult.status !== 0) process.exit(referenceResult.status ?? 1);
const compareFilter = `[0:v]scale=540:960,setpts=N/(30000/1001*TB),drawtext=fontfile='${panelFont}':text='ORIGINAL · 원본 발췌':x=18:y=18:fontcolor=white:fontsize=24:box=1:boxcolor=black@0.78:boxborderw=9[ref];[1:v]scale=540:960,setpts=N/(30000/1001*TB)[own];[ref][own]hstack=inputs=2,setpts=N/(30000/1001*TB),fps=30000/1001[out]`;
const compareArgs = ['-hide_banner', '-loglevel', 'error', '-y', '-i', referenceSnippet, '-i', renderOut, '-filter_complex', compareFilter, '-map', '[out]', '-an', '-frames:v', '263', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', sideBySide];
const compared = spawnSync(ffmpeg, compareArgs, {cwd: root, stdio: 'inherit', shell: false});
if (compared.status !== 0) process.exit(compared.status ?? 1);
try { fs.unlinkSync(referenceSnippet); } catch {}

const createContactSheet = (input, target, cellWidth, cellHeight, tag) => {
  const tempDir = path.join(out, `.contact-${tag}`);
  fs.mkdirSync(tempDir, {recursive: true});
  const frames = [];
  for (const frame of sampleFrames) {
    const png = path.join(tempDir, `frame-${String(frame).padStart(3, '0')}.png`);
    const timestamp = (frame / fps).toFixed(3);
    const filter = `select='eq(n\\,${frame})',scale=${cellWidth}:${cellHeight},drawtext=fontfile='${panelFont}':text='FRAME ${frame} · t=${timestamp}s':x=8:y=h-th-8:fontcolor=white:fontsize=16:box=1:boxcolor=black@0.82:boxborderw=5`;
    const extracted = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vf', filter, '-frames:v', '1', png], {cwd: root, stdio: 'inherit', shell: false});
    if (extracted.status !== 0) process.exit(extracted.status ?? 1);
    frames.push(png);
  }
  const inputs = frames.flatMap((file) => ['-i', file]);
  const stack = '[0:v][1:v][2:v][3:v][4:v]hstack=inputs=5[top];[5:v][6:v][7:v][8:v][9:v]hstack=inputs=5[bottom];[top][bottom]vstack=inputs=2[out]';
  const stacked = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', stack, '-map', '[out]', '-frames:v', '1', '-q:v', '2', target], {cwd: root, stdio: 'inherit', shell: false});
  if (stacked.status !== 0) process.exit(stacked.status ?? 1);
  for (const frame of frames) try { fs.unlinkSync(frame); } catch {}
  try { fs.rmdirSync(tempDir); } catch {}
};

createContactSheet(renderOut, path.join(out, 'reconstruction-contact.jpg'), 216, 384, 'own');
createContactSheet(sideBySide, path.join(out, 'comparison-contact.jpg'), 432, 384, 'comparison');
console.log(JSON.stringify({renderOut, sideBySide, source, audio: false, frames: 263, sampleFrames}, null, 2));
