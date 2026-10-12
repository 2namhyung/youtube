import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {ROOT, FFMPEG, TOOL_IDS} from './common.mjs';

const target = path.resolve(process.argv[2] || path.join(ROOT, 'out', 'studies', 'motion-tool-learning-v3-pilot-b'));
const creator = JSON.parse(fs.readFileSync(path.join(target, 'creator.json'), 'utf8'));
for (const tool of TOOL_IDS) {
  const samples = creator.samples.filter(id => id.startsWith(tool.replace(/-v1$/u, '') + '-'));
  const inputs = samples.flatMap(sampleId => [1, 24, 48].map(index => path.join(target, 'samples', sampleId, `frame-${String(index).padStart(4, '0')}.png`)));
  const args = ['-hide_banner', '-loglevel', 'error'];
  for (const input of inputs) args.push('-i', input);
  const tile = 220;
  const refs = inputs.map((_, index) => `[${index}:v]scale=${tile}:${tile}[v${index}]`).join(';');
  const joined = inputs.map((_, index) => `[v${index}]`).join('');
  args.push('-filter_complex', `${refs};${joined}xstack=inputs=${inputs.length}:layout=${inputs.map((_, index) => `${(index % 3) * tile}_${Math.floor(index / 3) * tile}`).join('|')}`, '-frames:v', '1', path.join(target, `${tool}-contact-sheet.png`));
  const result = spawnSync(FFMPEG, args, {windowsHide: true, encoding: 'utf8'});
  if (result.status !== 0) throw new Error(`${tool} contact sheet failed: ${result.stderr}`);
}
console.log(JSON.stringify({created: TOOL_IDS.length, samples: creator.sampleCount}));
