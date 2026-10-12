import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve('.');
const e2eTempRoot = path.join(root, 'out', '.private');
fs.mkdirSync(e2eTempRoot, { recursive: true });
const temp = fs.mkdtempSync(path.join(e2eTempRoot, 'one-frame-thumbnail-'));
const privateOutput = path.join(root, 'out', '.private', 'one-frame-thumbnail-e2e');
const customPrivateOutput = path.join(root, 'out', '.private', 'custom-thumbnail-e2e');
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `${command} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
const resolveTool = (name) => String(spawnSync('where.exe', [name], { encoding: 'utf8' }).stdout || '').split(/\r?\n/u).find((line) => path.isAbsolute(line.trim()))?.trim();
const productionToolArgs = ['--ffmpeg-executable', resolveTool('ffmpeg'), '--ffprobe-executable', resolveTool('ffprobe'), '--python-executable', resolveTool('python'), '--edge-tts-executable', resolveTool('edge-tts')];

try {
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=#334155:s=1080x1920:d=0.01', '-frames:v', '1', path.join(temp, 'asset.png')]);
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1.2', path.join(temp, 'narration.wav')]);
  fs.writeFileSync(path.join(temp, 'narration.srt'), '1\n00:00:00,000 --> 00:00:00,010\n한\n');
  fs.writeFileSync(path.join(temp, 'narration.srt'), '1\n00:00:00,000 --> 00:00:01,000\nA');
  const projectPath = path.join(temp, 'project.json');
  fs.writeFileSync(projectPath, JSON.stringify({
    id: 'one-frame-thumbnail-e2e',
    title: { line1: '한 프레임', line2: '썸네일 검증' },
    scenes: [{ asset: 'asset.png' }],
    narration: { mode: 'file', audio: 'narration.wav', srt: 'narration.srt' },
  }));
  const registryPath = path.join(root, 'out', 'latest-render.json');
  const registryBefore = fs.readFileSync(registryPath, 'utf8');
  const output = run('node', [path.join(root, 'scripts', 'produce-short.mjs'), '--project', projectPath, '--no-register', ...productionToolArgs]);
  const jsonStart = output.lastIndexOf('\n{');
  const metadata = JSON.parse(output.slice(jsonStart < 0 ? output.indexOf('{') : jsonStart + 1));
  assert.ok(metadata.frames >= 1);
  assert.equal(metadata.registered, false);
  assert.ok(fs.statSync(metadata.path).isFile());
  assert.ok(fs.statSync(metadata.thumbnailPath).isFile());
  const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames,width,height,codec_name', '-of', 'json', metadata.path]));
  assert.equal(Number(probe.streams[0].nb_read_frames), metadata.frames);
  const thumbnailProbe = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'json', metadata.thumbnailPath]));
  assert.equal(thumbnailProbe.streams[0].codec_name, 'png');
  assert.equal(thumbnailProbe.streams[0].width, 1080);
  assert.equal(thumbnailProbe.streams[0].height, 1920);
  assert.equal(fs.readFileSync(registryPath, 'utf8'), registryBefore);
  console.log('thumbnail E2E passed (1080x1920 PNG, registry unchanged)');

  const customProjectPath = path.join(temp, 'custom-project.json');
  const customBytes = fs.readFileSync(path.join(temp, 'asset.png'));
  const customSha256 = (await import('node:crypto')).createHash('sha256').update(customBytes).digest('hex');
  fs.writeFileSync(customProjectPath, JSON.stringify({
    id: 'custom-thumbnail-e2e',
    title: { line1: 'custom', line2: 'thumbnail' },
    scenes: [{ asset: 'asset.png' }],
    thumbnail: { image: 'asset.png', sha256: customSha256, source: 'thumbnail-e2e' },
    narration: { mode: 'file', audio: 'narration.wav', srt: 'narration.srt' },
  }));
  const customOutput = run('node', [path.join(root, 'scripts', 'produce-short.mjs'), '--project', customProjectPath, '--no-register', ...productionToolArgs]);
  const customStart = customOutput.lastIndexOf('\n{');
  const customMetadata = JSON.parse(customOutput.slice(customStart < 0 ? customOutput.indexOf('{') : customStart + 1));
  assert.equal(customMetadata.thumbnailOverride.sha256, customSha256);
  assert.deepEqual(fs.readFileSync(customMetadata.thumbnailPath), customBytes);
  assert.deepEqual(fs.readFileSync(path.join(path.dirname(customMetadata.handoffPath), 'thumbnail.png')), customBytes);
  console.log('custom thumbnail override E2E passed (hash and handoff bytes preserved)');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
  fs.rmSync(privateOutput, { recursive: true, force: true });
  fs.rmSync(customPrivateOutput, { recursive: true, force: true });
}
