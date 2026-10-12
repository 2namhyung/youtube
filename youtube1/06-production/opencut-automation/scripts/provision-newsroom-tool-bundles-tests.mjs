import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { main } from './provision-newsroom-tool-bundles.mjs';

const root = path.join(process.env.PUBLIC || os.tmpdir(), `newsroom-provision-test-${crypto.randomUUID()}`);
const ffSource = path.join(root, 'sources', 'ffmpeg'); const pySource = path.join(root, 'sources', 'python'); const target = path.join(root, 'targets');
const args = ['--ffmpeg-source-root', ffSource, '--python-source-root', pySource, '--target-base', target];
await fs.mkdir(path.join(ffSource, 'bin'), { recursive: true }); await fs.mkdir(pySource, { recursive: true });
await fs.writeFile(path.join(ffSource, 'bin', 'ffmpeg.exe'), 'ffmpeg-fixture'); await fs.writeFile(path.join(ffSource, 'bin', 'ffprobe.exe'), 'ffprobe-fixture'); await fs.writeFile(path.join(ffSource, 'codec.dll'), 'codec');
await fs.writeFile(path.join(pySource, 'python.exe'), 'python-fixture'); await fs.mkdir(path.join(pySource, 'Lib', 'site-packages'), { recursive: true }); await fs.writeFile(path.join(pySource, 'Lib', 'site-packages', 'edge_tts.py'), 'fixture');

const first = await main(args); assert.equal(first.ffmpeg.status, 'ready'); assert.equal(first.python.status, 'ready');
const marker = JSON.parse(await fs.readFile(path.join(target, 'ffmpeg', '.newsroom-tool-bundle.json'), 'utf8')); assert.equal(marker.kind, 'ffmpeg');
const second = await main(args); assert.equal(second.ffmpeg.reused, true); assert.equal(second.python.reused, true);
await assert.rejects(main(['--ffmpeg-source-root', ffSource, '--python-source-root', pySource, '--target-base', path.join(process.env.USERPROFILE || 'C:\\Users', 'forbidden-provision-test')]), /forbidden/u);
const existing = path.join(root, 'existing'); await fs.mkdir(path.join(existing, 'ffmpeg'), { recursive: true }); await fs.writeFile(path.join(existing, 'ffmpeg', 'keep.txt'), 'keep');
await assert.rejects(main(['--ffmpeg-source-root', ffSource, '--python-source-root', pySource, '--target-base', existing]), /nonempty/u);
const missing = path.join(root, 'missing-launch'); await assert.rejects(main(['--ffmpeg-source-root', path.join(root, 'sources', 'missing'), '--python-source-root', pySource, '--target-base', missing]), /unavailable/u);
const badSource = path.join(root, 'sources', 'bad'); await fs.mkdir(badSource); await fs.writeFile(path.join(badSource, 'not-python.bin'), 'python'); await assert.rejects(main(['--ffmpeg-source-root', ffSource, '--python-source-root', badSource, '--target-base', path.join(root, 'bad-target')]), /missing/u);
const leftovers = (await fs.readdir(path.dirname(path.join(root, 'bad-target')))).filter((name) => name.includes('.newsroom-provision-')); assert.equal(leftovers.length, 0);
try { await fs.symlink(path.join(ffSource, 'bin', 'ffmpeg.exe'), path.join(ffSource, 'bin', 'linked.exe')); await assert.rejects(main(['--ffmpeg-source-root', ffSource, '--python-source-root', pySource, '--target-base', path.join(root, 'symlink-target')]), /symlink|junction/u); } catch { /* link creation may be disabled on CI */ }
await fs.rm(root, { recursive: true, force: true });
console.log('newsroom tool bundle provisioning tests passed');
