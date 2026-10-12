# Voice validators

This directory contains model-independent validation assets retained by the
Qwen3-TTS production pipeline.

- `campplus.onnx`: speaker-embedding validator only. It is not a TTS model.
- Whisper ASR models remain in the Hugging Face cache and are used for strict
  transcript verification.

The canonical synthesis engine is `Qwen/Qwen3-TTS-12Hz-0.6B-Base` in BF16.
