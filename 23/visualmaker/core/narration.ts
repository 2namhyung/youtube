import {createHash, randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {attachNarrationTake, getProject, narrationDirectory, narrationFile, StoreError, verifyNarrationTakes} from './store.ts';
import type {NarrationTake, Plan} from './model.ts';

export const MAX_NARRATION_BYTES = 40_000_000;
export const MAX_NARRATION_REQUEST_BYTES = 40_100_000;

function sniffFormat(bytes: Buffer): Pick<NarrationTake, 'format' | 'mimeType'> {
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') return {format:'wav', mimeType:'audio/wav'};
  if (bytes.length >= 3 && bytes.toString('ascii', 0, 3) === 'ID3' ||
      bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return {format:'mp3', mimeType:'audio/mpeg'};
  if (bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp') return {format:'m4a', mimeType:'audio/mp4'};
  throw new StoreError('WAV, MP3 또는 M4A 음성 파일이 필요합니다.');
}

function probeAudio(bytes: Buffer, format: NarrationTake['format']) {
  const stagingRoot = narrationDirectory('staging');
  const dir = mkdtempSync(path.join(stagingRoot, 'narration-'));
  const file = path.join(dir, `input.${format}`);
  try {
    writeFileSync(file, bytes, {flag:'wx'});
    const result = spawnSync('ffprobe', ['-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',file],
      {encoding:'utf8', windowsHide:true, timeout:15_000, maxBuffer:1_000_000});
    if (result.error && 'code' in result.error && result.error.code === 'ENOENT') throw new StoreError('ffprobe를 찾을 수 없습니다. FFmpeg를 설치하고 서버를 다시 시작하세요.', 503);
    if (result.error || result.status !== 0) throw new StoreError('음성 스트림을 읽을 수 없습니다. 파일 또는 ffprobe를 확인하세요.');
    let output: {streams?: Array<{codec_type?:string; duration?:string; sample_rate?:string; channels?:number}>; format?:{duration?:string}};
    try { output = JSON.parse(result.stdout); } catch { throw new StoreError('음성 측정 결과를 읽을 수 없습니다.'); }
    const streams = output.streams ?? [];
    if (streams.some(stream => stream.codec_type === 'video')) throw new StoreError('영상 스트림이 없는 음성 파일만 등록할 수 있습니다.');
    const audio = streams.find(stream => stream.codec_type === 'audio');
    if (!audio) throw new StoreError('음성 스트림이 없습니다.');
    const durationSeconds = Number(audio.duration || output.format?.duration);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new StoreError('양수 길이의 음성 스트림이 필요합니다.');
    const sampleRate = audio.sample_rate === undefined ? null : Number(audio.sample_rate);
    const channels = audio.channels === undefined ? null : Number(audio.channels);
    if (sampleRate !== null && (!Number.isInteger(sampleRate) || sampleRate <= 0) ||
        channels !== null && (!Number.isInteger(channels) || channels <= 0)) throw new StoreError('음성 채널 정보를 읽을 수 없습니다.');
    return {durationSeconds, sampleRate, channels};
  } finally {
    try { unlinkSync(file); } catch { /* An error before staging write leaves no file. */ }
    rmdirSync(dir);
  }
}

/** Decode and measure a recording with the same rules as local intake. */
export function measureNarrationBytes(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_NARRATION_BYTES) throw new StoreError('녹음 파일은 40MB 이하여야 합니다.', 413);
  const {format,mimeType}=sniffFormat(bytes);
  return {format,mimeType,...probeAudio(bytes,format)};
}

export function currentNarrationTakes(plan: Plan) {
  return (plan.narrationTakes ?? []).map(take => ({...take, currentScriptMatch:take.scriptSha256 === plan.script.rawSha256}));
}

export function attachNarrationUpload(id: string, baseRevision: number, scriptSha256: string, originalName: string, bytes: Buffer) {
  const plan = getProject(id);
  if (!Number.isInteger(baseRevision) || plan.revision !== baseRevision || plan.script.rawSha256 !== scriptSha256)
    throw new StoreError('프로젝트 또는 대본이 변경되었습니다. 최신 내용을 불러온 뒤 다시 등록하세요.', 409);
  if (!bytes.length || bytes.length > MAX_NARRATION_BYTES) throw new StoreError('녹음 파일은 40MB 이하여야 합니다.', 413);
  if (!originalName.trim() || originalName.length > 500) throw new StoreError('녹음 파일 이름을 확인하세요.');
  const {format, mimeType,...measured} = measureNarrationBytes(bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const take: NarrationTake = {
    id:`take_${randomUUID()}`, projectId:id, originalName:path.basename(originalName), format, mimeType,
    byteCount:bytes.length, sha256, path:`narration/${sha256}.${format}`, ...measured,
    createdAt:new Date().toISOString(), capturedRevision:baseRevision, scriptSha256,
    measurement:'ffprobe', alignmentStatus:'unavailable', productionAuthority:false,
  };
  const saved = attachNarrationTake(id, baseRevision, scriptSha256, take, bytes);
  return {plan:saved, take, currentScriptMatch:true};
}

export function readNarrationTake(id: string, takeId: string) {
  const plan = getProject(id);
  const take = (plan.narrationTakes ?? []).find(item => item.id === takeId);
  if (!take) throw new StoreError('녹음을 찾을 수 없습니다.', 404);
  verifyNarrationTakes({...plan, narrationTakes:[take]});
  return {take, bytes:readFileSync(narrationFile(take))};
}
