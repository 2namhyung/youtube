# Qwen F4 owner prompt bank

This bank contains five exact-transcript, owner-voice F4 sentence prompts for
the canonical Qwen3-TTS 0.6B Base provider. Each asset is a resampled-only mono
24 kHz PCM16 copy of a hash-locked F4 training clip; no third-party audio,
embedding, synthetic prompt, denoise, pitch transform, or LoRA output is used.

Supported production styles are `hook`, `news_exposition`, `tension`,
`criticism`, and `solution_closing`. Omitting `narration.style` preserves the
existing canonical `neutral` reference.

All five fixed Base samples passed signal gates and Whisper small/medium CER
`<= 0.08`. Playable samples and machine evidence are under [`validation`](validation).
This validates automated intelligibility and signal integrity, not listener
preference; no blinded human evaluation was performed.

Production must load only
`Qwen/Qwen3-TTS-12Hz-0.6B-Base` revision
`5d83992436eae1d760afd27aff78a71d676296fc` in BF16. The manifest explicitly
forbids LoRA/adapters, and the worker reports and gates that invariant.
