import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const args = process.argv.slice(2);
const allowed = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--port' && /^\d{2,5}$/u.test(args[i + 1] ?? '')) {
    allowed.push('--port', args[++i]);
  } else if (args[i] === '--no-open') {
    allowed.push('--no-open');
  } else {
    throw new Error(`unsupported Studio option: ${args[i]}`);
  }
}
const cli = path.resolve(root, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const entry = path.resolve(root, 'video', 'src', 'sh006-vox-motion-calibration-index.tsx');
const commandArgs = [cli, 'studio', entry, '--config', path.resolve(root, 'video/remotion.config.ts'), ...allowed];
console.log(JSON.stringify({ok: true, authoritative: false, composition: 'SH006-VoxMotion-B03-B05-Provisional', command: process.execPath, args: commandArgs}, null, 2));
const child = spawn(process.execPath, commandArgs, {cwd: root, stdio: 'inherit', windowsHide: false, env: {...process.env, REMOTION_DISABLE_NETWORK: '1'}});
child.on('exit', (code, signal) => { if (signal) process.kill(process.pid, signal); else process.exit(code ?? 1); });

