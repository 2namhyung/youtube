# Qwen-only model cleanup — 2026-07-30

## Decision

The production speech engine is fixed to
`Qwen/Qwen3-TTS-12Hz-0.6B-Base` with BF16 inference. Model weights,
environments, and duplicate caches for Fish Speech, GPT-SoVITS, CosyVoice,
and Qwen CustomVoice were removed after the user selected Qwen Base.

## Removed execution assets

| Path | Bytes before removal | Reason |
|---|---:|---|
| `C:\Users\User\tools\fish-speech` | 19,145,793,981 | Fish Speech environment and weights |
| `C:\Users\User\tools\GPT-SoVITS` | 44,176,590 | GPT-SoVITS source checkout |
| `C:\Users\User\tools\GPT-SoVITS-official` | 19,540,330,016 | GPT-SoVITS runtime and weights |
| `C:\Users\User\.cache\huggingface\hub\models--Qwen--Qwen3-TTS-12Hz-0.6B-CustomVoice` | 2,498,383,650 | Unselected Qwen variant |
| `03-script-voice/voice-clone/models/Fun-CosyVoice3-0.5B` | 9,719,215,639 | CosyVoice weights; CAMPPlus moved first |
| `03-script-voice/voice-clone/.venv` | 6,389,582,201 | CosyVoice-only Python environment |
| `03-script-voice/voice-clone/cache` | 2,825,255,843 | Obsolete package/download cache |
| `03-script-voice/voice-clone/training/F/asr/model-cache` | 3,090,835,937 | Duplicate ASR cache |
| `03-script-voice/voice-clone/training/F/asr-turbo/model-cache` | 1,621,666,218 | Duplicate ASR cache |
| `03-script-voice/voice-clone/pilots/model-ab-20260729/gpt-v2-finetune/training` | 2,173,484,552 | GPT-SoVITS checkpoints |
| `03-script-voice/voice-clone/training/F4-target-20260729/resume` | 37,403,534 | Fish Speech resume checkpoint |
| `C:\Users\User\.cache\huggingface\hub\models--fishaudio--fish-speech-1.5` | 40 | Final stale Fish Speech cache reference |

The measured free-space increase was **66,507,542,528 bytes (61.94 GiB)**,
from 132,779,614,208 bytes to 199,287,156,736 bytes free on drive C.
Removal is permanent; these assets require a fresh download to restore.

## Preserved production and validation assets

- Qwen Base Hugging Face cache:
  `C:\Users\User\.cache\huggingface\hub\models--Qwen--Qwen3-TTS-12Hz-0.6B-Base`
- Qwen runtime:
  `C:\Users\User\tools\qwen3-tts-pilot\.venv`
- Whisper medium and small global caches under
  `C:\Users\User\.cache\huggingface\hub`
- CAMPPlus speaker validator:
  `03-script-voice/voice-clone/validators/campplus.onnx`
  (`A6AC6A63997761AE2997373E2EE1C47040854B4B759EA41EC48E4E42DF0F4D73`)
- Owner recordings, scripts, reports, manifests, ASR results, and Qwen pilot
  WAV evidence inside the workspace.

No upload or public release was performed by this cleanup.
