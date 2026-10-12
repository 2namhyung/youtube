import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';

export const LOCAL_CLONE_MODEL_ID = 'FunAudioLLM/Fun-CosyVoice3-0.5B-2512';
export const LOCAL_CLONE_MODEL_REVISION = '29e01c4e8d000f4bcd70751be16fa94bf3d85a18';

export function directNarrationProvenance(provider) {
  return {
    requestedProvider: provider,
    actualProvider: provider,
    fallbackUsed: false,
    fallbackReason: null,
    modelId: null,
    modelRevision: null,
    style: null,
    referenceSha256: null,
  };
}

export function attachNarrationProvenance(target, provenance) {
  return { ...target, narrationProvider: { ...provenance } };
}

function fallbackReasonForStage(stage) {
  return new Map([
    ['reference', 'local-reference-verification-failed'],
    ['synthesis', 'local-synthesis-failed'],
    ['transcription', 'local-transcription-failed'],
  ]).get(stage) || 'local-provider-failed';
}

export async function runLocalCloneProvider({
  narration,
  scriptPath,
  stem,
  root,
  runCommand,
  cloneRoot = path.resolve(root, '..', '..', '03-script-voice', 'voice-clone'),
  platform = process.platform,
  readFile = fsp.readFile,
  remove = (target) => fsp.rm(target, { force: true }),
  warn = console.warn,
}) {
  const style = narration.style || 'neutral';
  const cloneAudioPath = `${stem}.wav`;
  const generatedSrt = `${stem}.srt`;
  const clonePython = platform === 'win32'
    ? path.join(cloneRoot, '.venv', 'Scripts', 'python.exe')
    : path.join(cloneRoot, '.venv', 'bin', 'python');
  let stage = 'reference';
  let referenceSha256 = null;
  try {
    const manifest = JSON.parse(await readFile(path.join(cloneRoot, 'manifest.json'), 'utf8'));
    const modelLock = JSON.parse(await readFile(path.join(cloneRoot, 'model-lock.json'), 'utf8'));
    if (modelLock.repository !== LOCAL_CLONE_MODEL_ID || modelLock.revision !== LOCAL_CLONE_MODEL_REVISION) {
      throw new Error('local model provenance lock does not match provider constants');
    }
    const promptRelative = manifest.styles?.[style]?.promptAudio;
    if (!promptRelative) throw new Error(`style ${style} has no prompt audio`);
    const prompt = await readFile(path.resolve(cloneRoot, promptRelative));
    referenceSha256 = crypto.createHash('sha256').update(prompt).digest('hex');

    stage = 'synthesis';
    await runCommand(clonePython, [
      path.join(cloneRoot, 'synthesize.py'),
      '--style', style,
      '--speed', String(narration.cloneSpeed ?? 1),
      '--text-file', scriptPath,
      '--output', cloneAudioPath,
    ]);
    stage = 'transcription';
    await runCommand('python', [
      path.join(root, 'scripts', 'transcribe-whisper.py'),
      cloneAudioPath,
      generatedSrt,
    ]);
    return {
      audioPath: cloneAudioPath,
      srtPath: generatedSrt,
      provenance: {
        requestedProvider: 'local-clone',
        actualProvider: 'local-clone',
        fallbackUsed: false,
        fallbackReason: null,
        modelId: LOCAL_CLONE_MODEL_ID,
        modelRevision: LOCAL_CLONE_MODEL_REVISION,
        style,
        referenceSha256,
      },
    };
  } catch (error) {
    if (narration.fallback !== 'edge-tts') throw error;
    const fallbackReason = fallbackReasonForStage(stage);
    await Promise.all([
      remove(cloneAudioPath).catch(() => {}),
      remove(generatedSrt).catch(() => {}),
    ]);
    warn(`[narration] explicit edge-tts fallback used (${fallbackReason})`);
    const fallbackAudioPath = `${stem}.mp3`;
    await runCommand('edge-tts', [
      '--voice', narration.fallbackVoice || 'ko-KR-SunHiNeural',
      '--rate', narration.fallbackRate || '+0%',
      '--pitch', narration.fallbackPitch || '+0Hz',
      '--file', scriptPath,
      '--write-media', fallbackAudioPath,
      '--write-subtitles', generatedSrt,
    ]);
    return {
      audioPath: fallbackAudioPath,
      srtPath: generatedSrt,
      provenance: {
        requestedProvider: 'local-clone',
        actualProvider: 'edge-tts',
        fallbackUsed: true,
        fallbackReason,
        modelId: LOCAL_CLONE_MODEL_ID,
        modelRevision: LOCAL_CLONE_MODEL_REVISION,
        style,
        referenceSha256,
      },
    };
  }
}
