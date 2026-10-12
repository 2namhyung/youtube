const DISABLED_EXTERNAL_NARRATION = new Set(['local-clone', 'fish-speech-lora']);

export function assertAuthorityNarrationMode(mode, narration = {}, authority = false) {
  if (DISABLED_EXTERNAL_NARRATION.has(mode) || (authority && mode === 'edge-tts')) throw Object.assign(new Error(`Authority render rejects ${mode}; use the hash-bound owner-voice-v1 Qwen profile`), { code: 'PROVIDER_BLOCKED' });
  const lockedOwnerQwen = mode === 'approved-locked' && narration.source === 'approved-locked-owner-audio' && /^[a-f0-9]{64}$/u.test(String(narration.audioSha256 || '')) && Number.isInteger(narration.cueCount) && narration.cueCount > 0;
  if (authority && !lockedOwnerQwen) throw Object.assign(new Error('Authority render requires the preplanned hash-locked owner-voice-v1 Qwen3-TTS output; render-time narration generation is forbidden'), { code: 'PROVIDER_BLOCKED' });
  return mode;
}

export function authorityCommandKind(command, { python, ffmpeg, ffprobe }) {
  if (command === python) return 'python';
  if (command === ffmpeg || command === ffprobe) return 'ffmpeg';
  throw Object.assign(new Error('Authority render forbids commands outside the declared Python and FFmpeg bundles'), { code: 'PROVIDER_BLOCKED' });
}
