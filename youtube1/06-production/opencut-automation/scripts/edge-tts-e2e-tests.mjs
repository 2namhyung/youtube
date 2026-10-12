import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve('.');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-tts-production-'));
const privateOutput = path.join(root, 'out', '.private', 'edge-tts-e2e');
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `${command} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
const resolveTool = (name) => String(spawnSync('where.exe', [name], { encoding: 'utf8' }).stdout || '').split(/\r?\n/u).find((line) => path.isAbsolute(line.trim()))?.trim();
const productionToolArgs = ['--ffmpeg-executable', resolveTool('ffmpeg'), '--ffprobe-executable', resolveTool('ffprobe'), '--python-executable', resolveTool('python'), '--edge-tts-executable', resolveTool('edge-tts')];

try {
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=#0f172a:s=1080x1920:d=0.1', '-frames:v', '1', path.join(temp, 'asset.png')]);
  fs.writeFileSync(path.join(temp, 'script.txt'), '교권보호국. 안전한 학교를 함께 만들어요.\n');
  const projectPath = path.join(temp, 'project.json');
  fs.writeFileSync(projectPath, JSON.stringify({
    id: 'edge-tts-e2e',
    title: { line1: '엣지 음성', line2: '비공개 검증' },
    scriptFile: 'script.txt',
    scenes: [{ asset: 'asset.png' }],
    narration: { mode: 'edge-tts', voice: 'ko-KR-SunHiNeural', rate: '+0%', pitch: '+0Hz' },
  }));
  const registryPath = path.join(root, 'out', 'latest-render.json');
  const registryBefore = fs.readFileSync(registryPath, 'utf8');
  const output = run('node', [path.join(root, 'scripts', 'produce-short.mjs'), '--project', projectPath, '--no-register', ...productionToolArgs]);
  const jsonStart = output.lastIndexOf('\n{');
  const metadata = JSON.parse(output.slice(jsonStart < 0 ? output.indexOf('{') : jsonStart + 1));
  assert.equal(metadata.registered, false);
  assert.ok(metadata.frames > 1);
  assert.ok(fs.statSync(metadata.path).isFile());
  assert.ok(fs.statSync(metadata.thumbnailPath).isFile());
  assert.ok(path.resolve(metadata.path).startsWith(path.resolve(privateOutput) + path.sep));
  assert.equal(fs.readFileSync(registryPath, 'utf8'), registryBefore);
  console.log(`Edge TTS private-render E2E passed (${metadata.frames} frames, registry unchanged)`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
  fs.rmSync(privateOutput, { recursive: true, force: true });
}
