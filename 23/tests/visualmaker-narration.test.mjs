import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {createPlan, prepareImportedCopy, validatePlan} from '../visualmaker/core/director.ts';
import {attachNarrationUpload, currentNarrationTakes, readNarrationTake} from '../visualmaker/core/narration.ts';
import {attachNarrationTake, insertProject, getProject, updateProject, narrationFile} from '../visualmaker/core/store.ts';

function wav(seconds = 0.4) {
  const rate = 8000; const samples = Math.round(rate * seconds); const payload = samples * 2;
  const bytes = Buffer.alloc(44 + payload);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + payload, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(payload, 40);
  return bytes;
}
function dataDir() { process.env.VISUALMAKER_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'visualmaker-narration-')); }
function plan() { return insertProject(createPlan('녹음 검사', '첫 대본 문장입니다.')); }
function newTake(existing, bytes, revision) {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return {...existing, id:`take_${randomUUID()}`, originalName:'another.wav', byteCount:bytes.length,
    sha256, path:`narration/${sha256}.wav`, capturedRevision:revision, createdAt:new Date().toISOString()};
}

test('real WAV measurement is durable, revision/script bound, and survives unchanged-script edits', () => {
  dataDir(); const initial = plan(); const bytes = wav();
  const saved = attachNarrationUpload(initial.id, initial.revision, initial.script.rawSha256, 'voice.mp3', bytes);
  assert.equal(saved.plan.revision, 2);
  assert.equal(saved.take.format, 'wav');
  assert.equal(saved.take.mimeType, 'audio/wav');
  assert.equal(saved.take.sampleRate, 8000);
  assert.ok(Math.abs(saved.take.durationSeconds - 0.4) < 0.01);
  assert.equal(saved.take.productionAuthority, false);
  assert.equal(saved.take.alignmentStatus, 'unavailable');
  assert.deepEqual(readNarrationTake(initial.id, saved.take.id).bytes, bytes);
  assert.deepEqual(getProject(initial.id).narrationTakes, [saved.take]);
  const changed = updateProject(initial.id, 2, {type:'edit-beat', beatId:initial.beats[0].id, intent:'바뀐 연출 의도', role:'context'});
  assert.equal(currentNarrationTakes(changed)[0].currentScriptMatch, true);
  const revised = updateProject(initial.id, 3, {type:'revise-script', text:'다른 대본 문장입니다.'});
  assert.equal(currentNarrationTakes(revised)[0].currentScriptMatch, false);
  const copy = insertProject(prepareImportedCopy(revised), true);
  assert.deepEqual(copy.narrationTakes, []);
});

test('bad, renamed, video-only and unprobeable files never enter a plan', () => {
  dataDir(); const initial = plan(); const args = [initial.id, 1, initial.script.rawSha256];
  assert.throws(() => attachNarrationUpload(...args, 'fake.wav', Buffer.from('not-audio')));
  assert.throws(() => attachNarrationUpload(...args, 'fake.mp3', Buffer.from('ID3\0bad')));
  assert.throws(() => attachNarrationUpload(...args, 'too-large.wav', Buffer.alloc(40_000_001)), error => error.status === 413);
  const video = spawnSync('ffmpeg', ['-v','error','-f','lavfi','-i','color=c=black:s=16x16:d=0.2','-an','-movflags','frag_keyframe+empty_moov','-f','mp4','pipe:1'], {maxBuffer:2_000_000});
  assert.equal(video.status, 0);
  assert.throws(() => attachNarrationUpload(...args, 'video.m4a', video.stdout));
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = '';
    assert.throws(() => attachNarrationUpload(...args, 'voice.wav', wav()), /ffprobe/);
  } finally { process.env.PATH = originalPath; }
  assert.equal(getProject(initial.id).revision, 1);
});

test('stale writes and duplicate bytes preserve the original recording and receipt', () => {
  dataDir(); const initial = plan(); const bytes = wav();
  const first = attachNarrationUpload(initial.id, 1, initial.script.rawSha256, 'one.wav', bytes);
  assert.throws(() => attachNarrationUpload(initial.id, 1, initial.script.rawSha256, 'late.wav', bytes), error => error.status === 409);
  const second = attachNarrationUpload(initial.id, 2, initial.script.rawSha256, 'two.wav', bytes);
  assert.equal(second.take.path, first.take.path);
  assert.notEqual(second.take.id, first.take.id);
  assert.deepEqual(readFileSync(narrationFile(first.take)), bytes);
  assert.equal(readdirSync(path.join(process.env.VISUALMAKER_DATA_DIR, 'narration')).length, 1);
  assert.throws(() => attachNarrationUpload(initial.id, 3, '0'.repeat(64), 'wrong-script.wav', bytes), error => error.status === 409);
});

test('transaction rechecks a revision changed after intake preflight before materializing files', () => {
  dataDir(); const initial = plan();
  const first = attachNarrationUpload(initial.id, 1, initial.script.rawSha256, 'first.wav', wav());
  const competing = updateProject(initial.id, 2, {type:'edit-beat', beatId:initial.beats[0].id, intent:'동시 수정', role:'context'});
  const laterBytes = wav(0.55);
  const lateTake = newTake(first.take, laterBytes, 2);
  assert.throws(() => attachNarrationTake(initial.id, 2, initial.script.rawSha256, lateTake, laterBytes), error => error.status === 409);
  assert.equal(getProject(initial.id).revision, competing.revision);
  assert.equal(existsSync(path.join(process.env.VISUALMAKER_DATA_DIR, lateTake.path)), false);
  assert.equal(existsSync(path.join(process.env.VISUALMAKER_DATA_DIR, 'narration-receipts', `${lateTake.id}.json`)), false);
  assert.deepEqual(readNarrationTake(initial.id, first.take.id).bytes, wav());
});

test('receipt write failure rolls back only owned new bytes, preserving a shared existing recording', () => {
  dataDir(); const initial = plan();
  const first = attachNarrationUpload(initial.id, 1, initial.script.rawSha256, 'first.wav', wav());
  const newBytes = wav(0.6);
  const failed = newTake(first.take, newBytes, 2);
  const receiptPath = path.join(process.env.VISUALMAKER_DATA_DIR, 'narration-receipts', `${failed.id}.json`);
  writeFileSync(receiptPath, 'occupied');
  assert.throws(() => attachNarrationTake(initial.id, 2, initial.script.rawSha256, failed, newBytes));
  assert.equal(getProject(initial.id).revision, 2);
  assert.equal(existsSync(path.join(process.env.VISUALMAKER_DATA_DIR, failed.path)), false);
  assert.equal(readFileSync(receiptPath, 'utf8'), 'occupied');
  const shared = newTake(first.take, wav(), 2);
  const sharedReceipt = path.join(process.env.VISUALMAKER_DATA_DIR, 'narration-receipts', `${shared.id}.json`);
  writeFileSync(sharedReceipt, 'occupied');
  assert.throws(() => attachNarrationTake(initial.id, 2, initial.script.rawSha256, shared, wav()));
  assert.deepEqual(readNarrationTake(initial.id, first.take.id).bytes, wav());
  assert.equal(readFileSync(sharedReceipt, 'utf8'), 'occupied');
  assert.equal(getProject(initial.id).revision, 2);
});

test('hash, receipt, path and approval tampering fail closed', () => {
  dataDir(); const initial = plan(); const saved = attachNarrationUpload(initial.id, 1, initial.script.rawSha256, 'voice.wav', wav());
  const malicious = structuredClone(saved.plan);
  malicious.narrationTakes[0].productionAuthority = true;
  assert.throws(() => validatePlan(malicious));
  malicious.narrationTakes[0].productionAuthority = false;
  malicious.narrationTakes[0].finalVoiceApproved = true;
  assert.throws(() => validatePlan(malicious));
  delete malicious.narrationTakes[0].finalVoiceApproved;
  malicious.narrationTakes[0].path = '../../raw/secret';
  assert.throws(() => validatePlan(malicious));
  const receiptPath = path.join(process.env.VISUALMAKER_DATA_DIR, 'narration-receipts', `${saved.take.id}.json`);
  writeFileSync(receiptPath, '{}');
  assert.throws(() => readNarrationTake(initial.id, saved.take.id), /검증 기록/);
  const receipt = {version:1, take:saved.take, takeSha256:''};
  writeFileSync(receiptPath, JSON.stringify(receipt));
  assert.throws(() => getProject(initial.id), /검증 기록/);
  receipt.takeSha256 = createHash('sha256').update(JSON.stringify(saved.take)).digest('hex');
  writeFileSync(receiptPath, JSON.stringify(receipt));
  writeFileSync(narrationFile(saved.take), Buffer.from('changed'));
  assert.throws(() => readNarrationTake(initial.id, saved.take.id), /검증 기록/);
});
