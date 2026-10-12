import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUTOMATION_ROOT = path.resolve(HERE, '../..');
const ROOT = path.resolve(process.argv[2] || path.join(AUTOMATION_ROOT, 'out', 'studies', 'motion-tool-learning-v1'));
const FFMPEG = 'C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffmpeg.exe';
const TOOLS = ['gsap-html-v1', 'motion-canvas-v1', 'canvas-d3-v1', 'lottie-web-v1', 'dotlottie-web-v1', 'ffmpeg-layer-keyframes-v1'];
const run = args => new Promise((resolve, reject) => { const p = spawn(FFMPEG, args, {windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']}); let err = ''; p.stderr.on('data', d => err += d); p.on('error', reject); p.on('close', c => c ? reject(new Error(err)) : resolve()); });
for (const tool of TOOLS) {
  const prefix = tool.replace(/-v1$/u, '');
  const dirs = fs.readdirSync(path.join(ROOT, 'samples')).filter(name => name.startsWith(`${prefix}-`)).sort();
  const files = dirs.flatMap(dir => [1, 24, 48].map(index => path.join(ROOT, 'samples', dir, `frame-${String(index).padStart(4, '0')}.png`)));
  const args = ['-hide_banner', '-loglevel', 'error']; files.forEach(file => args.push('-i', file));
  args.push('-filter_complex', `${files.map((_, i) => `[${i}:v]`).join('')}concat=n=${files.length}:v=1:a=0,tile=3x${dirs.length}:padding=4:margin=4`, '-frames:v', '1', path.join(ROOT, `${tool}-contact-sheet.png`));
  await run(args);
}
console.log(JSON.stringify({root: ROOT, tools: TOOLS, generated: true}));
