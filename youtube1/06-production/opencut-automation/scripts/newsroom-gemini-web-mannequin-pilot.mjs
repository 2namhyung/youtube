import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stableStringify } from './evidence-bundle.mjs';

export const PILOT_INPUT_SCHEMA = 'newsroom-gemini-web-mannequin-pilot-input-v1';
export const PILOT_PACKET_SCHEMA = 'newsroom-gemini-web-mannequin-pilot-packet-v1';
export const PILOT_OPERATOR_INPUT_SCHEMA = 'newsroom-gemini-web-mannequin-pilot-operator-input-v1';
export const PILOT_CAPTURE_SCHEMA = 'newsroom-gemini-web-mannequin-pilot-source-capture-v1';
export const PILOT_QA_PENDING_SCHEMA = 'newsroom-gemini-web-mannequin-pilot-shot-qa-pending-v1';

const ROLE_SCOPE = Object.freeze({
  'storyboard-reference': 'composition-only',
  'character-reference': 'appearance-continuity-only',
  'location-reference': 'environment-layout-only',
  'prop-reference': 'object-shape-only',
  'creature-reference': 'appearance-continuity-only',
  'style-reference': 'style-only',
  'entry-frame-reference': 'first-frame-continuity-only',
});
const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[a-z0-9][a-z0-9._-]{0,79}$/u;
const execFileAsync = promisify(execFile);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const round = (value) => Number(Number(value).toFixed(6));
const lockedProduction = () => ({ sourceAdmission: false, derivative: false, render: false, upload: false, publication: false, stage07: false, continuationAuthorized: false, finalApproved: false });
const fail = (message) => { throw Object.assign(new Error(message), { code: 'CODEX_ADMIN_BLOCKED' }); };
const hashWithout = (value, field) => { const copy = structuredClone(value); delete copy[field]; return sha256(Buffer.from(stableStringify(copy), 'utf8')); };

function boundedText(value, label, max = 4000, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > max) fail(`${label} is invalid`);
  return value.trim();
}

function relativeSafe(value, label) {
  const normalized = boundedText(value, label, 400).replaceAll('\\', '/');
  if (path.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) fail(`${label} must be a contained relative path`);
  return normalized;
}

async function physicalFile(root, relativePath, label) {
  const rootReal = await fs.realpath(path.resolve(root));
  const relative = relativeSafe(relativePath, `${label}.relativePath`);
  const resolved = path.resolve(rootReal, relative);
  if (!resolved.startsWith(`${rootReal}${path.sep}`)) fail(`${label} escapes its root`);
  const stat = await fs.lstat(resolved);
  const real = await fs.realpath(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || real !== resolved) fail(`${label} must be a physical nonsymlink file`);
  const bytes = await fs.readFile(real);
  return { relativePath: relative, realpath: real, bytes: bytes.length, sha256: sha256(bytes), preserved: true, exactBytes: bytes };
}

function decodeImage(bytes, label) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), mimeType: 'image/png' };
  }
  if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5), mimeType: 'image/jpeg' };
      if (marker === 0xd9 || marker === 0xda) break;
      const length = bytes.readUInt16BE(offset + 2); if (length < 2) break; offset += 2 + length;
    }
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    if (bytes.subarray(12, 16).toString('ascii') === 'VP8X' && bytes.length >= 30) return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3), mimeType: 'image/webp' };
  }
  fail(`${label} must be a decodable PNG, JPEG, or extended WebP image`);
}

async function probeMedia(file, ffprobe = 'ffprobe') {
  const { stdout } = await execFileAsync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-show_entries', 'stream=codec_type,width,height,r_frame_rate', '-of', 'json', file], { maxBuffer: 1024 * 1024 });
  const parsed = JSON.parse(stdout); const video = parsed.streams?.find((stream) => stream.codec_type === 'video');
  const audio = parsed.streams?.find((stream) => stream.codec_type === 'audio');
  const durationSeconds = Number(parsed.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) fail('ffprobe did not return a valid media duration');
  if (!video) return { durationSeconds: round(durationSeconds), audioPresent: Boolean(audio), videoPresent: false, width: 0, height: 0, fps: 0 };
  const [numerator, denominator] = String(video.r_frame_rate || '').split('/').map(Number);
  const fps = denominator ? numerator / denominator : numerator;
  return { durationSeconds: round(durationSeconds), audioPresent: Boolean(audio), videoPresent: true, width: Number(video.width), height: Number(video.height), fps: round(fps) };
}

function validateSurface(value) {
  const allowedStatus = new Set(['unknown', 'observed-partial', 'observed']);
  const allowedDuration = new Set(['unknown', 'not-observed', 'observed-8s', 'observed-10s']);
  if (!value || !allowedStatus.has(value.status) || value.surface !== 'gemini-web' || !allowedDuration.has(value.durationControlStatus) || ![8, 10].includes(value.requestedDurationIntentSeconds) || value.providerDurationSupportClaimed !== false) fail('surfaceObservation is invalid or claims unverified duration support');
  if (value.aspectRatio !== 'unknown' && value.aspectRatio !== '9:16') fail('surfaceObservation.aspectRatio must be unknown or observed 9:16');
  if (value.durationControlStatus === 'observed-8s' && value.requestedDurationIntentSeconds !== 8) fail('observed 8s duration must use an 8s intent');
  if (value.durationControlStatus === 'observed-10s' && value.requestedDurationIntentSeconds !== 10) fail('observed 10s duration must use a 10s intent');
  return {
    status: value.status,
    observedAt: boundedText(value.observedAt, 'surfaceObservation.observedAt', 80, value.status === 'unknown'),
    observedBy: boundedText(value.observedBy, 'surfaceObservation.observedBy', 160),
    surface: 'gemini-web',
    modelLabel: boundedText(value.modelLabel, 'surfaceObservation.modelLabel', 160, true),
    modeLabel: boundedText(value.modeLabel, 'surfaceObservation.modeLabel', 160, true),
    aspectRatio: value.aspectRatio,
    durationControlStatus: value.durationControlStatus,
    requestedDurationIntentSeconds: value.requestedDurationIntentSeconds,
    providerDurationSupportClaimed: false,
  };
}

function validateScenePlan(scenePlan) {
  if (scenePlan?.schema !== 'newsroom-provisional-scene-plan-paused-preview-v1' || scenePlan.status !== 'paused-preview-only' || scenePlan.approved !== false || !Array.isArray(scenePlan.cuts) || scenePlan.cuts.length !== 27 || scenePlan.cutCount !== 27) fail('exact 27-cut paused preview scene plan is required');
  if (!(Number(scenePlan.totalActualDurationSeconds) >= 65 && Number(scenePlan.totalActualDurationSeconds) <= 80)) fail('paused preview duration must remain inside 65-80 seconds');
  let previousEnd = 0;
  for (const [index, cut] of scenePlan.cuts.entries()) {
    if (cut.cutId !== `cut-${String(index + 1).padStart(3, '0')}` || Math.abs(Number(cut.actualStartSeconds) - previousEnd) > 0.001 || Number(cut.actualEndSeconds) <= Number(cut.actualStartSeconds)) fail('paused preview cut order or continuity drifted');
    previousEnd = Number(cut.actualEndSeconds);
  }
  if (Math.abs(previousEnd - Number(scenePlan.totalActualDurationSeconds)) > 0.001) fail('paused preview cuts no longer cover the full audio');
  return scenePlan;
}

function pilotShots(sourceIntentSeconds, requestedShots) {
  if (!Array.isArray(requestedShots) || requestedShots.length < 1 || requestedShots.length > 3) fail('pilot must contain one to three fictional shot intents');
  const ids = new Set(); let cursor = 0;
  const shots = requestedShots.map((requested, index) => {
    if (!ID.test(String(requested?.shotId || '')) || ids.has(requested.shotId)) fail('pilot shotId is invalid or duplicated');
    ids.add(requested.shotId);
    const duration = Number(requested.requestedDurationSeconds);
    if (!(duration >= 1.5 && duration <= 6) || requested.sourceCutCoverageClaimed !== false) fail('pilot shot duration or non-coverage declaration is invalid');
    const start = round(cursor); cursor += duration; const end = index === requestedShots.length - 1 ? sourceIntentSeconds : round(cursor);
    return {
      shotId: requested.shotId,
      purpose: boundedText(requested.purpose, `${requested.shotId}.purpose`, 400),
      sourceCutCoverageClaimed: false,
      upstreamTimingUse: 'none-fictional-style-and-continuity-pilot-only',
      requestedProviderWindow: { inSeconds: start, outSeconds: end, durationSeconds: round(end - start), authority: 'intent-only-until-downloaded-source-is-measured' },
    };
  });
  if (Math.abs(cursor - sourceIntentSeconds) > 0.001) fail('fictional shot intents must sum to the requested source duration');
  return shots;
}

function compilePrompt(shots, references, sourceIntentSeconds, surface) {
  const referenceLines = references.map((asset) => `${asset.ordinal}. ${asset.assetId}: ${asset.role}; use only for ${asset.influenceScope}.`).join('\n');
  const shotLines = shots.map((shot, index) => `[${shot.requestedProviderWindow.inSeconds.toFixed(3)}-${shot.requestedProviderWindow.outSeconds.toFixed(3)} seconds] SHOT ${index + 1}: ${shot.visual}`).join('\n');
  const durationNote = surface.durationControlStatus.startsWith('observed-')
    ? `The ${sourceIntentSeconds}-second option was observed on this web surface.`
    : `${sourceIntentSeconds} seconds is an operator request intent. The web UI did not expose a verified duration control; actual duration will be measured after download.`;
  return `Create one fictional editorial reenactment video in vertical 9:16. Visual style: realistic proportions rendered as simple faceless matte resin mannequins, clean low-detail 3D diorama, soft overcast daylight, restrained Korean urban-road context, muted cream and charcoal palette, no photoreal human skin. This is illustrative reenactment, not actual case footage.\n\nUse the four uploaded images in this exact order and only for their stated role:\n${referenceLines}\n\nCreate exactly THREE sequential full-screen shots with two clean editorial hard cuts. Never morph one shot into another. Preserve the exact same male mannequin, cream car, dark charcoal car, materials, colors, scale, daylight and road direction across all shots. Continue object positions logically across the two cuts.\n${shotLines}\n\n${durationNote}\nNo extra shot, split screen, montage, captions, readable text, logos, license plates, police lights, collision, blood, injury, facial features, visible identity, added people, added vehicles, or dramatic weapon detail. No dialogue and no generated audio is needed.`;
}

function markdown(packet) {
  const refs = packet.references.map((item) => `${item.ordinal}. \`${item.assetId}\` — \`${item.file.relativePath}\` — SHA-256 \`${item.file.sha256}\``).join('\n');
  const shots = packet.shots.map((shot) => `- ${shot.shotId}: ${shot.requestedProviderWindow.inSeconds.toFixed(3)}–${shot.requestedProviderWindow.outSeconds.toFixed(3)}초 — ${shot.purpose}`).join('\n');
  return `# Gemini Web 무광 마네킹 3-shot 파일럿\n\n상태: **${packet.status}**. 이 패킷은 사용자가 승인한 단 한 번의 fictional provider pilot만 허용한다. final script/title/voice/storyline/cut-plan 승인이나 production source admission을 뜻하지 않는다.\n\n## 업로드 순서\n\n${refs}\n\n## 쇼트 의도\n\n${shots}\n\n## 실행\n\n1. Gemini Web에서 관찰된 모델/모드와 세로 9:16을 유지한다.\n2. 위 reference 이미지를 정확한 순서로 업로드한다.\n3. \`${packet.prompt.submittedFile.relativePath}\`의 UTF-8 텍스트를 그대로 붙여넣는다.\n4. 한 번만 생성하고 결과 원본 MP4와 실행 화면 영수증을 보존한다.\n5. 다운로드 후 import-source를 실행한다. 실제 길이는 그때 ffprobe로 측정하며, 8초 또는 10초 지원을 현재 패킷에서 주장하지 않는다.\n\n전체 production 승인: **false**\n`;
}

function html(packet) {
  const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>Gemini Web matte pilot</title><style>body{font:16px/1.55 system-ui;max-width:900px;margin:40px auto;padding:0 24px;color:#202124}code,pre{background:#f5f5f5;padding:.2em .4em}pre{white-space:pre-wrap;padding:18px}.warn{border-left:4px solid #d93025;padding:10px 14px;background:#fce8e6}</style><h1>Gemini Web 무광 마네킹 3-shot 파일럿</h1><p class="warn">파일럿 1회만 승인됨. full production/final approval/render/upload/publication은 모두 false.</p><h2>업로드 순서</h2><ol>${packet.references.map((item) => `<li><code>${escape(item.assetId)}</code> — <code>${escape(item.file.sha256)}</code></li>`).join('')}</ol><h2>복사할 exact prompt</h2><pre>${escape(packet.prompt.text)}</pre></html>`;
}

async function writeCanonical(file, value) {
  await fs.writeFile(file, `${stableStringify(value)}\n`, 'utf8');
}

export async function prepareMannequinPilot({ input, bundleRoot, outputRoot = bundleRoot, scenePlanPath, audioPath, ffprobe = 'ffprobe', probe = probeMedia, writeOutputs = true }) {
  if (input?.schema !== PILOT_INPUT_SCHEMA || !ID.test(String(input.storyId || '')) || !ID.test(String(input.pilotId || ''))) fail('pilot input schema/storyId/pilotId is invalid');
  if (!boundedText(input.authorization?.scope, 'authorization.scope', 240) || !/^\d{4}-\d{2}-\d{2}$/u.test(String(input.authorization?.authorizedOn || '')) || input.authorization.source !== 'current-user-request') fail('pilot authorization is absent or invalid');
  const surface = validateSurface(input.surfaceObservation);
  const root = path.resolve(bundleRoot); const output = path.resolve(outputRoot); if (writeOutputs) await fs.mkdir(output, { recursive: true });
  const sceneFile = await physicalFile(path.dirname(scenePlanPath), path.basename(scenePlanPath), 'scene plan');
  const scenePlan = validateScenePlan(JSON.parse(sceneFile.exactBytes.toString('utf8')));
  const audioFile = await physicalFile(path.dirname(audioPath), path.basename(audioPath), 'owner voice preview');
  if (audioFile.sha256 !== scenePlan.audioPreviewSha256) fail('owner voice preview does not match the paused scene plan SHA-256');
  const audioMedia = await probe(audioFile.realpath, ffprobe);
  if (audioMedia.videoPresent || !audioMedia.audioPresent || Math.abs(audioMedia.durationSeconds - Number(scenePlan.totalActualDurationSeconds)) > 0.001) fail('owner voice paused preview media duration or stream type drifted');
  if (!Array.isArray(input.references) || input.references.length < 1 || input.references.length > 5) fail('one to five canonical pilot references are required');
  const ids = new Set(); const ordinals = new Set(); const references = [];
  for (const raw of input.references) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(String(raw.assetId || '')) || ids.has(raw.assetId) || ordinals.has(raw.ordinal) || ROLE_SCOPE[raw.role] !== raw.influenceScope) fail('pilot reference IDs, roles, scopes, or ordinals are invalid');
    ids.add(raw.assetId); ordinals.add(raw.ordinal);
    const file = await physicalFile(root, raw.imageRelativePath, raw.assetId);
    const decoded = decodeImage(file.exactBytes, raw.assetId);
    if (decoded.width < 480 || decoded.height < 480) fail(`${raw.assetId} minimum edge must be at least 480px`);
    const prompt = await physicalFile(root, raw.promptRelativePath, `${raw.assetId} prompt`);
    if (!prompt.exactBytes.toString('utf8').trim()) fail(`${raw.assetId} prompt must not be empty`);
    references.push({
      assetId: raw.assetId, role: raw.role, ordinal: raw.ordinal, influenceScope: raw.influenceScope,
      generatorLabel: boundedText(raw.generatorLabel, `${raw.assetId}.generatorLabel`, 160), authority: 'non-authoritative-fictional-continuity-reference-only',
      file: { relativePath: file.relativePath, realpath: file.realpath, bytes: file.bytes, sha256: file.sha256, width: decoded.width, height: decoded.height, mimeType: decoded.mimeType, preserved: true },
      generationPrompt: { relativePath: prompt.relativePath, realpath: prompt.realpath, bytes: prompt.bytes, sha256: prompt.sha256, encoding: 'utf-8', preserved: true },
    });
  }
  references.sort((a, b) => a.ordinal - b.ordinal);
  const expectedOrdinals = Array.from({ length: references.length }, (_, index) => index + 1);
  if (stableStringify([...ordinals].sort((a, b) => a - b)) !== stableStringify(expectedOrdinals)) fail('reference upload ordinals must be contiguous and one-based');
  const duration = surface.requestedDurationIntentSeconds; const shots = pilotShots(duration, input.shots);
  const intentPrompt = await physicalFile(root, input.videoPromptIntentRelativePath, 'video prompt intent');
  const submittedPrompt = await physicalFile(root, input.submittedPromptRelativePath, 'submitted video prompt');
  const promptText = submittedPrompt.exactBytes.toString('utf8'); if (!promptText.trim()) fail('submitted video prompt must not be empty');
  const packet = {
    schema: PILOT_PACKET_SCHEMA, storyId: input.storyId, pilotId: input.pilotId,
    status: surface.durationControlStatus.startsWith('observed-') ? 'operator-ready-duration-observed' : 'operator-ready-duration-unverified',
    authorization: { scope: input.authorization.scope, authorizedOn: input.authorization.authorizedOn, source: input.authorization.source, providerPilotAllowed: true, maxProviderSources: 1, fullProductionApproval: false },
    upstream: {
      status: 'provisional-preview-only', finalAuthorityClaimed: false,
      scenePlan: { schema: scenePlan.schema, status: scenePlan.status, approved: false, externalRealpath: sceneFile.realpath, bytes: sceneFile.bytes, sha256: sceneFile.sha256, cutCount: 27, durationSeconds: scenePlan.totalActualDurationSeconds },
      narration: { status: 'owner-voice-paused-preview-not-locked-production-authority', externalRealpath: audioFile.realpath, bytes: audioFile.bytes, sha256: audioFile.sha256, durationSeconds: audioMedia.durationSeconds },
    },
    surfaceObservation: surface, references, shots,
    prompt: { intentFile: { relativePath: intentPrompt.relativePath, realpath: intentPrompt.realpath, bytes: intentPrompt.bytes, sha256: intentPrompt.sha256, encoding: 'utf-8', preserved: true }, submittedFile: { relativePath: submittedPrompt.relativePath, realpath: submittedPrompt.realpath, bytes: submittedPrompt.bytes, sha256: submittedPrompt.sha256, encoding: 'utf-8', preserved: true }, text: promptText, requestedSourceDurationSeconds: duration, durationAuthority: 'operator-intent-only-until-source-import', exactSubmittedBytesAuthority: true },
    operatorInstructions: { execution: 'manual-gemini-web-single-pilot', exactUploadOrderRequired: true, exactPromptRequired: true, screenshotReceiptRequired: true, downloadedOriginalRequired: true, independentShotQaRequired: true, automaticWebCallImplemented: false },
    production: lockedProduction(),
  };
  packet.integrity = { verified: true, status: 'operator-packet-integrity-only-not-production-approval', sha256: hashWithout(packet, 'integrity') };
  if (writeOutputs) {
    await writeCanonical(path.join(output, 'pilot-packet.json'), packet);
    await fs.writeFile(path.join(output, 'operator-packet.md'), markdown(packet), 'utf8');
    await fs.writeFile(path.join(output, 'operator-packet.html'), html(packet), 'utf8');
  }
  return packet;
}

export async function verifyMannequinPilot({ packet, input, bundleRoot, outputRoot = bundleRoot, scenePlanPath, audioPath, ffprobe = 'ffprobe', probe = probeMedia }) {
  if (packet?.integrity?.sha256 !== hashWithout(packet, 'integrity') || packet.integrity.status !== 'operator-packet-integrity-only-not-production-approval') fail('pilot packet integrity is stale');
  const recreated = await prepareMannequinPilot({ input, bundleRoot, outputRoot, scenePlanPath, audioPath, ffprobe, probe, writeOutputs: false });
  if (stableStringify(recreated) !== stableStringify(packet)) fail('pilot packet or exact physical inputs drifted');
  return true;
}

export async function importMannequinPilotSource({ packet, operatorInput, bundleRoot, sourceRoot, sourceRelativePath, receiptRoot, ffprobe = 'ffprobe', probe = probeMedia }) {
  if (packet?.schema !== PILOT_PACKET_SCHEMA || packet.integrity?.sha256 !== hashWithout(packet, 'integrity') || stableStringify(packet.production) !== stableStringify(lockedProduction())) fail('valid non-production pilot packet is required');
  if (operatorInput?.schema !== PILOT_OPERATOR_INPUT_SCHEMA || operatorInput.storyId !== packet.storyId || operatorInput.pilotId !== packet.pilotId || operatorInput.surface !== 'gemini-web' || !Number.isFinite(Date.parse(operatorInput.capturedAt))) fail('operator input identity/time/surface is invalid');
  if (operatorInput.promptCopiedSha256 !== packet.prompt.submittedFile.sha256) fail('operator did not copy the exact pilot prompt');
  const expectedUpload = packet.references.map((item) => ({ ordinal: item.ordinal, assetId: item.assetId, sha256: item.file.sha256, bytes: item.file.bytes }));
  if (stableStringify(operatorInput.uploadOrder) !== stableStringify(expectedUpload)) fail('operator upload order or exact reference bytes drifted');
  if (operatorInput.statement !== 'I operated the recorded Gemini Web UI, copied the exact submitted prompt, uploaded the recorded references in the recorded order, and downloaded this source from that pilot run.') fail('operator statement is missing');
  const source = await physicalFile(sourceRoot, sourceRelativePath, 'Gemini pilot source');
  const media = await probe(source.realpath, ffprobe);
  if (!media.videoPresent || media.width < 1 || media.height < 1 || Math.abs(media.width / media.height - 9 / 16) > 0.03 || media.fps <= 0) fail('Gemini pilot source must decode as vertical 9:16 video');
  const receipt = await physicalFile(receiptRoot, operatorInput.receiptRelativePath, 'Gemini pilot screenshot receipt');
  const receiptImage = decodeImage(receipt.exactBytes, 'Gemini pilot screenshot receipt');
  const capture = {
    schema: PILOT_CAPTURE_SCHEMA, storyId: packet.storyId, pilotId: packet.pilotId, status: 'captured-pilot-source-awaiting-independent-shot-qa',
    authorities: { pilotPacketSha256: packet.integrity.sha256, promptSha256: packet.prompt.submittedFile.sha256, referenceSha256s: packet.references.map((item) => item.file.sha256) },
    manualExecution: { performedBy: boundedText(operatorInput.performedBy, 'performedBy', 160), capturedAt: operatorInput.capturedAt, surface: 'gemini-web', modelLabel: boundedText(operatorInput.modelLabel, 'modelLabel', 160), modeLabel: boundedText(operatorInput.modeLabel, 'modeLabel', 160), promptCopiedSha256: operatorInput.promptCopiedSha256, uploadOrder: expectedUpload, statement: operatorInput.statement, providerEchoAuthority: false, receipt: { relativePath: receipt.relativePath, realpath: receipt.realpath, bytes: receipt.bytes, sha256: receipt.sha256, width: receiptImage.width, height: receiptImage.height, mimeType: receiptImage.mimeType, preserved: true } },
    source: { relativePath: source.relativePath, realpath: source.realpath, bytes: source.bytes, sha256: source.sha256, width: media.width, height: media.height, durationSeconds: media.durationSeconds, fps: media.fps, audioPresent: media.audioPresent, preservedOriginal: true },
    durationObservation: { requestedIntentSeconds: packet.prompt.requestedSourceDurationSeconds, requestedIntentAuthority: 'intent-only', observedDownloadedDurationSeconds: media.durationSeconds, observedBy: 'ffprobe', surfaceDurationSupportConclusion: Math.abs(media.durationSeconds - packet.prompt.requestedSourceDurationSeconds) <= 0.25 ? 'single-output-observed-near-intent-not-general-support-proof' : 'output-differs-from-request-intent' },
    shotQa: { status: 'pending-independent-review', semanticMatch: 'unknown', continuityPass: 'unknown', visibleChange: 'unknown', noReversal: 'unknown', usableContinuousWindows: [] },
    production: lockedProduction(),
  };
  capture.integrity = { verified: true, status: 'capture-integrity-only-not-semantic-or-production-approval', sha256: hashWithout(capture, 'integrity') };
  const pendingQa = {
    schema: PILOT_QA_PENDING_SCHEMA, storyId: packet.storyId, pilotId: packet.pilotId,
    authorities: { pilotPacketSha256: packet.integrity.sha256, sourceCaptureSha256: capture.integrity.sha256, sourceSha256: capture.source.sha256 },
    status: 'pending-independent-shot-qa', requestedShots: packet.shots.map((shot) => ({ shotId: shot.shotId, purpose: shot.purpose, requestedDurationSeconds: shot.requestedProviderWindow.durationSeconds, sourceCutCoverageClaimed: false })),
    requirements: ['review all observed shot boundaries', 'derive start/end frames from the preserved source', 'verify prompt match, visible change, identity continuity, and no reversal', 'record usable continuous windows without promoting this style pilot to main-cut coverage'],
    production: lockedProduction(),
  };
  pendingQa.integrity = { verified: true, status: 'pending-record-integrity-only', sha256: hashWithout(pendingQa, 'integrity') };
  const root = path.resolve(bundleRoot); await fs.mkdir(root, { recursive: true });
  await writeCanonical(path.join(root, 'pilot-source-capture.json'), capture);
  await writeCanonical(path.join(root, 'pilot-shot-qa-pending.json'), pendingQa);
  return { capture, pendingQa };
}
