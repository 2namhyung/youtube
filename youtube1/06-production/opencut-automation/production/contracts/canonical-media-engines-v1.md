# Canonical media engines v1

This contract separates reusable engines from event-bound media.

- Voice: use the versioned owner profile at `03-script-voice/releases/qwen-f4-owner-base-v1`. The prompt-bank manifest and every prompt WAV are hash-bound and self-contained. Qwen Base revision, CUDA BF16, deterministic seeds, dual-ASR CER 0.08, signal gates, tempo 1.08 maximum, and no LoRA/adapter/fallback are fail-closed invariants.
- BGM: reuse only the ACE-Step engine manifest. Every event creates a new prompt, seed, WAV, provenance manifest and SHA. Output is 48 kHz stereo PCM24 at -24 LUFS. The default render mix is -16 dB with narration ducking and a 1.2 second fade.
- Project binding: Qwen projects name the portable prompt-bank path. ACE-Step projects name the engine contract, event audio, event provenance, prompt, seed, license and exact SHA. `verify-editorial-cartoon-project.mjs` rejects event-slug, engine, model, rights, output or hash drift.

Create the versioned manifests with `node scripts/create-canonical-media-contracts.mjs` and verify them with `npm run test:canonical-media-contract`.
