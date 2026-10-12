import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve('.');
const cloneRoot = path.resolve(root, '..', '..', '03-script-voice', 'voice-clone');
const clonePython = process.platform === 'win32'
  ? path.join(cloneRoot, '.venv', 'Scripts', 'python.exe')
  : path.join(cloneRoot, '.venv', 'bin', 'python');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'local-clone-provider-'));

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.equal(
    result.status,
    0,
    `${command} failed:\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout;
}

try {
  const scriptPath = path.join(temp, 'script.txt');
  const audioPath = path.join(temp, 'narration.wav');
  const srtPath = path.join(temp, 'narration.srt');
  fs.writeFileSync(
    scriptPath,
    '잡혔는데도 끝나지 않은 사건. 대체 무엇이 잘못된 걸까요?\n',
    'utf8',
  );
  run(clonePython, [
    path.join(cloneRoot, 'synthesize.py'),
    '--style', 'hook',
    '--text-file', scriptPath,
    '--output', audioPath,
  ]);
  run('python', [
    path.join(root, 'scripts', 'transcribe-whisper.py'),
    audioPath,
    srtPath,
  ]);
  const probe = JSON.parse(run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'json',
    audioPath,
  ]));
  assert.ok(Number(probe.format?.duration) > 0);
  assert.match(fs.readFileSync(srtPath, 'utf8'), /잡혔는데도|끝나지 않은 사건/);
  console.log('local-clone provider E2E passed');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
