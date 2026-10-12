# 03 Script and voice

The reusable production owner profile is `releases/qwen-f4-owner-base-v1/manifest.json`. It is a self-contained, versioned prompt-bank release for the locked Qwen3-TTS Base revision; project generation remains subject to deterministic seed, dual-ASR CER, signal, tempo and no-fallback gates. Recording-source paths are provenance only and are not runtime dependencies.

The production narration engine is fixed to Qwen3-TTS 12Hz 0.6B Base on CUDA BF16.

- Canonical profile: [`voice-clone/profiles/qwen-f4/manifest.json`](voice-clone/profiles/qwen-f4/manifest.json)
- Voice-clone operations: [`voice-clone/README.md`](voice-clone/README.md)
- Model cleanup evidence: [`voice-clone/MODEL_CLEANUP_20260730.md`](voice-clone/MODEL_CLEANUP_20260730.md)
- GPU smoke evidence: [`runs/qwen-canonical-20260730`](runs/qwen-canonical-20260730)
- Automatic mixed-style smoke evidence: [`runs/qwen-auto-style-20260730`](runs/qwen-auto-style-20260730)
- Production provider: [`../06-production/opencut-automation/scripts/qwen3-tts-provider.mjs`](../06-production/opencut-automation/scripts/qwen3-tts-provider.mjs)

Current generation contract:

1. load the Base model once in BF16 and cache each used canonical owner prompt once;
2. keep manual/omitted neutral behavior, or classify blank-line sections with deterministic `style: auto` rules and content-hash-bound overrides;
3. synthesize natural sentence groups at 1.0x without mid-section style changes, caption-sized fragments, or inserted silence;
4. reject candidates unless both local ASR models are within 8% character error rate;
5. apply capped gain-only loudness matching and reject clipping or discontinuous boundaries;
6. map global accepted word timestamps back to the editorial caption cues;
7. if needed, apply one final whole-wave tempo change capped at 1.08x;
8. record classifier/rules, prompt and audio hashes, seeds, ASR/signal gates, fallback status and peak GPU temperature in provenance.

Historical F/F3/F4 LoRA and model-comparison reports remain as evidence only. Their non-Qwen model weights were removed and are not active production dependencies.

## Locked Jeju voice pipeline (2026-08-01)

The accepted owner-voice pipeline is pinned in [`releases/qwen-jeju-canonical-20260801/manifest.json`](releases/qwen-jeju-canonical-20260801/manifest.json). It uses Qwen3-TTS 0.6B Base revision `5d83992436eae1d760afd27aff78a71d676296fc` in BF16 with no LoRA, adapter, fallback, or BGM. Declaratives use the existing F4 guide; only these exact sentences route to the owner-only `question` prompt: `현실에도 진짜 필요한 거 아니에요?`, `이게 말이 되나요?`, and `하지만 수사 상황 통지와 피해자 보호는 필요하지 않을까요?`.

The spoken-only normalization is `<참교육>` → `참교육에 나오는` and `성적 목적` → `성적인 목적`; authoritative captions/source remain unchanged. Sentence boundaries are semantic (13 pauses at 0.45 s) with a forward-only 20 ms acoustic-tail guard after the final ASR word anchor. Dual Whisper small+medium, critical-phrase, clipping/endpoint, monotonic-anchor, and no-BGM gates are fail-closed.

Run the generation-free golden regression from the OpenCut directory:

```text
npm run test:qwen-canonical-jeju
```

Golden evidence is preview-only (`msa88n03-34276-4w0ivx`); it is not publishable and upload remains blocked pending legal review.

The active prompt-bank manifest is sanitized and uses only a source ID, SHA-256, duration, and owner/local-only flags. The immutable golden handoff records the pre-sanitization prompt-bank SHA for evidence comparison only; keep prompt assets local/private and never publish biometric provenance.

Owner prompt WAVs and source recordings are local-only biometric assets: do not publish, upload, package into releases, or expose through handoff/API endpoints.

Next stage: [`../04-visual-assets`](../04-visual-assets)

## Source-grounded script input (2026-08-06)

Generic Stage 03 requires an explicit user-selected tone and pacing. It receives a URL-free, hash-bound case history and the approved Stage 02 policy, not raw article rows or source links. The deterministic draft path uses the confirmed chronology, keeps prosecution/defense assertions attributed, distinguishes court findings, and carries conflicts and unknowns forward. Semantic validation rejects prohibited assertions, missing attribution, unsupported factual additions, and invented generic advice before a draft can be saved.

The package and validator are implemented in [`../06-production/opencut-automation/scripts/newsroom-lib.mjs`](../06-production/opencut-automation/scripts/newsroom-lib.mjs).
