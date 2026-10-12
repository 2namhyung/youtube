import {spawn, spawnSync} from 'node:child_process';
import path from 'node:path';

import {ROOT, REMOTION_CLI} from './qa-runtime.mjs';

const args = process.argv.slice(2);
const allowed = [];
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--port' && /^\d{2,5}$/u.test(args[index + 1] ?? '')) {
    allowed.push('--port', args[index + 1]);
    index += 1;
    continue;
  }
  if (args[index] === '--no-open') {
    allowed.push('--no-open');
    continue;
  }
  throw new Error(`unsupported Studio option: ${args[index]}`);
}

const validation = spawnSync(process.execPath, [path.resolve(ROOT, 'video/scripts/validate-render-authority.mjs')], {
  cwd: ROOT,
  encoding: 'utf8',
  windowsHide: true,
  env: {...process.env, REMOTION_DISABLE_NETWORK: '1'},
});
if (validation.status !== 0) {
  process.stderr.write(validation.stderr || validation.stdout || 'render authority validation failed\n');
  process.exit(validation.status ?? 1);
}

const studioArgs = [
  REMOTION_CLI,
  'studio',
  path.resolve(ROOT, 'video/src/production-index.tsx'),
  '--config',
  path.resolve(ROOT, 'video/remotion.config.ts'),
  ...allowed,
];
console.log(JSON.stringify({ok: true, authority_validated: true, command: process.execPath, args: studioArgs}, null, 2));
const child = spawn(process.execPath, studioArgs, {
  cwd: ROOT,
  stdio: 'inherit',
  windowsHide: false,
  env: {...process.env, REMOTION_DISABLE_NETWORK: '1'},
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
