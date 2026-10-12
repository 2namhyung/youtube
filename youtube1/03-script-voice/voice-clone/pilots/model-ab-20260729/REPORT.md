# Model A/B voice-clone pilot — 2026-07-29

Private bounded pilot; no production/OpenCut/render/upload/API changes.

## Gate and reference

- Initial GPU temperature: 52.0°C (gate <=52°C); hard stop 74°C; polling 0.5 s.
- F4 reference: `owner-recording-f4-target`; SHA-256 `C3BABD0C005309E1F3550124E4837F2441C9812529344E86AD41204D02770DCD` (local-only source).
- Fixed critical and held-out text are recorded verbatim in `pilot-manifest.json`; tempo 1.0.

## Qwen3-TTS 12Hz 0.6B Base

- Environment: `C:\Users\User\tools\qwen3-tts-pilot\.venv`; qwen-tts 0.1.1; model license Apache-2.0.
- Completed on CUDA; peak temperature 59.0°C, peak VRAM 5042.0 MB.
- Primary large-v3 ASR: critical FAIL (제주→제주한, 재물손괴→재물송계); held-out FAIL.
- Turbo large-v3 ASR: critical FAIL (제주→제주한); held-out PASS normalized.
- Audio duration/silence/boundary/pitch metrics are in `audio-metrics.json`; output WAVs are local pilot artifacts.

## GPT-SoVITS V2

- Official repo commit `d523079fc05d9a8028d6085bffe4a2757c32abb6` cloned into `C:\Users\User\tools\GPT-SoVITS\src`.
- Requirements fallback stopped at `jieba-fast==0.53` because Microsoft Visual C++ 14.0+ was unavailable; no system toolchain changes were made.
- The official 6.75 GB Windows integrated package was then used for the bounded rerun below; exact URL/hash/size and extraction evidence are in `pilot-manifest.json`.

## Decision

**No model promoted or selected.** Both models are evidence-only because the strict dual-ASR gate failed.

## GPT-SoVITS integrated-package rerun

- Official package SHA-256: `4D0CA857A36A81BADB65AB865958BE635ACBBA7F388AB7B216B519B0958023B7`; archive 6,754,961,256 bytes, extracted 12,551,951,793 bytes (50,010 files).
- V2 zero-shot completed with a trimmed F4 gyogwon reference (3–10 s requirement); peak temperature 48.0°C, peak VRAM 2890.0 MB.
- Primary and turbo ASR both failed strict critical and held-out exactness; detailed transcripts are in `asr-result.json`.
- CAMPPlus CPU cosine similarity was computed against the full F4 reference; values and model hash are in `campplus-similarity.json`.
- Final verdict: both models are evidence-only; no promotion/production change.

## GPT-SoVITS V2 bounded few-shot follow-up

- Dataset is pilot-owned `gpt-v2-finetune/dataset/dataset-manifest.json`: 25 sentence-level dual-ASR accepted F4 clips (125.0 s) with per-audio/lab/text hashes. Validation, critical, held-out, and whole-file raw audio were excluded from training and prompt use.
- Official V2 S1 recipe ran batch 1, fp16: one-epoch smoke then two-epoch bounded training. Smoke peaked at 47°C/2,574 MB VRAM; full peaked at 58°C/5,226 MB. S2 full G+D was not run because the official V2 path has no gradient-checkpoint option and was not assumed safe within 8 GB.
- Full-e2 half-weight generated `gpt-v2-finetune/gpt_ft_critical.wav` (13.22 s) and `gpt-v2-finetune/gpt_ft_heldout.wav` (13.34 s) at tempo 1.0. Candidate generation peaked at 46°C/2,764 MB.
- Primary and turbo ASR remained non-exact on both critical and held-out text; strict few-shot improvement gate: **FAIL**. CAMPPlus cosine improved versus zero-shot (critical 0.763347 → 0.820711; held-out 0.791504 → 0.813372), but this does not override the strict ASR gate. See `gpt-v2-finetune/evaluation.json` and updated `pilot-manifest.json`.
- Candidate-only evidence; no Production/Fish/OpenCut/render/upload/API connection or model promotion.
