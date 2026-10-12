# Local voice clone

The active voice-clone engine is fixed to `Qwen/Qwen3-TTS-12Hz-0.6B-Base`, CUDA BF16. It uses the owner's local reference recording and never falls back to another voice provider.

## Canonical profile

- Profile: [`profiles/qwen-f4/manifest.json`](profiles/qwen-f4/manifest.json)
- Reference audio: [`pilots/model-ab-20260729/f4_ref_gyogwon.wav`](pilots/model-ab-20260729/f4_ref_gyogwon.wav)
- Runtime: `C:/Users/User/tools/qwen3-tts-pilot/.venv`
- Hugging Face cache: `C:/Users/User/.cache/huggingface/hub/models--Qwen--Qwen3-TTS-12Hz-0.6B-Base`
- Provider: [`../../06-production/opencut-automation/scripts/qwen3-tts-provider.mjs`](../../06-production/opencut-automation/scripts/qwen3-tts-provider.mjs)
- Persistent Python worker: [`../../06-production/opencut-automation/scripts/qwen3-tts-worker.py`](../../06-production/opencut-automation/scripts/qwen3-tts-worker.py)

The provider generates complete sentence groups at native speed, verifies every candidate with two local ASR models, maps accepted word timestamps to the editorial captions, then optionally applies one whole-wave tempo adjustment of at most 1.08x. It does not insert fixed pauses between fragments.

## Verification

```powershell
cd C:\Users\User\Desktop\app\youtube\06-production\opencut-automation
npm run test:qwen3-tts-provider
npm run test:qwen3-tts-gpu-smoke
```

The 2026-07-30 GPU smoke generated Korean speech successfully in BF16, passed both ASR checks, and peaked at 54 C. Evidence is stored under [`../../03-script-voice/runs/qwen-canonical-20260730`](../runs/qwen-canonical-20260730).

## Retained and removed assets

Owner recordings, evaluation reports, manifests, Qwen pilot WAV files, Whisper validators and CAMPPlus are retained. Fish Speech, GPT-SoVITS, CosyVoice, Qwen CustomVoice and duplicate caches were removed after the Base model was selected. See [`MODEL_CLEANUP_20260730.md`](MODEL_CLEANUP_20260730.md).
