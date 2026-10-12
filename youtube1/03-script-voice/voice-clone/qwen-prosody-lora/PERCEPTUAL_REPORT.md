# Bounded F4 perceptual pilot

Decision: **PASS for this isolated comparison; NO-GO for production or
canonical-profile integration.** The validation-gated rank-4 adapter generated
an intelligible, signal-clean matched sample, but a single sentence is not
evidence of broad perceptual improvement.

Playable comparison:

- [Base](outputs/comparison/base.wav)
- [Rank-4 adapter](outputs/comparison/adapter.wav)

Both use seed `20260730`, the same canonical F4 reference and transcript, and
the sentence `교권보호국은 교권을 보호하는 가상의 기관입니다.` The adapter
was merged into the talker only in memory; no merged model was saved.

## Data admission

All 35 unique exact-transcript F4 training hashes in the owner-locked manifest
were audited. The 52-row set contains 35 raw 24 kHz copies and 17 deterministic
mild relative `atempo` variants (`0.97..1.03`), so raw originals are 67.31%.
The augmentation retains pitch/formants and adds no fixed fall, silence,
third-party waveform/embedding, or absolute-pitch target. Per-clip source,
output and text hashes, seeds, factors, and signal checks are recorded in
[`perceptual_data/dataset_audit.json`](perceptual_data/dataset_audit.json).

The two validation rows remained untouched and were excluded from training,
augmentation, and reference prompting. Their locked source hash is
`180AC9954D84B3A7AC6ED5E4CFAAB0F53DF35F1E03CF64CFDB39FE6FBF2B7DE8`.

## Training gate

Training stopped at 16 optimizer steps (128 microsteps, accumulation 8), below
the 64-step ceiling. Rank 4, alpha 8, learning rate `1e-5`, BF16 SDPA, and the
112 main-talker attention projections were used. All losses were finite; mean
training loss moved from 14.700833 over the first 16 microsteps to 14.550123
over the final 16. Held-out validation improved from 13.785776 to 13.676899;
the material-regression ceiling was 14.061491. Peak reserved VRAM was 2,902
MiB and final temperature was 59 C.

Only after that gate passed, the experimental adapter was saved under
`outputs/perceptual_adapter_rank4_step16`. Its weight SHA-256 is
`7a134a3dc43d087bfc147a6f7688f06b3cf8a39bbd60115b123185ce67c28fde`.

## Matched quality result

| Metric | Base | Adapter |
|---|---:|---:|
| Faster-Whisper small CER | 0.0952 | **0.0000** |
| Faster-Whisper medium CER | **0.0000** | **0.0476** |
| Duration | 3.52 s | 3.36 s |
| Silence ratio (< -40 dBFS RMS) | 0.2914 | 0.2784 |
| Tempo (characters/voiced second) | 8.4196 | 8.6618 |
| Median pitch | 104.47 Hz | 105.07 Hz |
| Pitch p10/p90 | 96.35 / 111.71 Hz | 98.03 / 119.79 Hz |
| Endpoint amplitude | 0.000061 | 0.000122 |
| Max boundary-region adjacent jump | 0.000092 | 0.077637 |
| Clipped samples | 0 | 0 |

The adapter passes the repository's dual-ASR criterion (each CER <= 0.08).
It improves the small-model transcript by two edits and worsens the medium
transcript by one edit; that mixed delta is preserved rather than claimed as a
quality win. Duration ratio is 0.9545, tempo ratio 1.0288, and median-pitch
ratio 1.0058. All predeclared duration, silence, tempo, pitch, clipping,
endpoint, and boundary-jump gates pass.

Machine-readable evidence:

- [`outputs/perceptual_training_report.json`](outputs/perceptual_training_report.json)
- [`outputs/comparison/generation_report.json`](outputs/comparison/generation_report.json)
- [`outputs/comparison/asr_report.json`](outputs/comparison/asr_report.json)
- [`outputs/comparison/quality_report.json`](outputs/comparison/quality_report.json)

## Limits

This is unsupported PEFT integration around an upstream full-SFT model. The
test has one comparison sentence, one seed, and automatic metrics only; no
blinded human preference test was performed. The adapter and WAVs are research
artifacts in this directory, not deployable production assets.
