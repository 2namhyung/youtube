# Five-role rank-4 comparison

Decision: **NO PROMOTION.** All ten matched generations completed, all five
adapter samples pass dual-ASR CER `<= 0.08`, and every raw/mastered signal gate
passes. However, the small recognizer is worse than base in three of five
roles. That trips the predeclared no-majority-regression gate, so the mixed
result is not promoted even though aggregate dual-model CER improves.

This remains **unsupported experimental** work. It does not change any
production model, canonical profile, reference, or cache. There was no blinded
human evaluation.

## Playable mastered pairs

- Hook: [base](outputs/role_suite/mastered/hook_base.wav) · [adapter](outputs/role_suite/mastered/hook_adapter.wav)
- News/exposition: [base](outputs/role_suite/mastered/news_exposition_base.wav) · [adapter](outputs/role_suite/mastered/news_exposition_adapter.wav)
- Tension: [base](outputs/role_suite/mastered/tension_base.wav) · [adapter](outputs/role_suite/mastered/tension_adapter.wav)
- Criticism: [base](outputs/role_suite/mastered/criticism_base.wav) · [adapter](outputs/role_suite/mastered/criticism_adapter.wav)
- Solution/closing: [base](outputs/role_suite/mastered/solution_closing_base.wav) · [adapter](outputs/role_suite/mastered/solution_closing_adapter.wav)

Each pair uses the exact same role text, seed `20260730`, canonical F4
reference and transcript, model revision
`5d83992436eae1d760afd27aff78a71d676296fc`, BF16 SDPA, Korean language,
speed `1.0`, and non-streaming voice-clone decoding. The adapter was merged
only in memory; no merged checkpoint was saved.

## Compact mastered comparison

Values shown as `base / adapter`. F0 range is p10–p90 in semitones.

| Role | CER small | CER medium | Duration s | Silence ratio | Tempo chars/voiced-s | Median F0 Hz | F0 range st |
|---|---:|---:|---:|---:|---:|---:|---:|
| Hook | 0 / 0 | 0 / 0 | 10.80 / 12.00 | .233 / .300 | 7.24 / 7.14 | 105.1 / 111.3 | 5.47 / 5.70 |
| News/exposition | 0 / .0141 | .0141 / 0 | 12.40 / 12.40 | .268 / .245 | 7.82 / 7.58 | 110.0 / 104.5 | 7.14 / 6.10 |
| Tension | 0 / .0577 | .0192 / 0 | 8.96 / 8.32 | .182 / .164 | 7.10 / 7.47 | 106.9 / 104.5 | 7.60 / 6.10 |
| Criticism | 0 / .0299 | 0 / 0 | 12.40 / 12.08 | .256 / .237 | 7.26 / 7.27 | 103.3 / 104.5 | 5.90 / 5.27 |
| Solution/closing | .0533 / 0 | .0400 / 0 | 13.52 / 14.00 | .234 / .263 | 7.24 / 7.27 | 108.2 / 106.3 | 6.00 / 5.76 |

Adapter CERs are small `[0, .0141, .0577, .0299, 0]` and medium
`[0, 0, 0, 0, 0]`. Small mean CER changes `.01067 -> .02033` (+.00966),
while medium changes `.01466 -> 0` (-.01466). Across both recognizers the
mean improves, but the small model's three role regressions prevent promotion.

Raw integrated loudness ranged from -27.9 to -26.7 LUFS. Mastering used one
common -23.0 LUFS target per pair, gain only, with no trimming or dynamics;
every pair measured -23.0 / -23.0 LUFS after PCM16 output and had zero clipped
samples. Raw and mastered duration, silence, tempo, F0, endpoint, and boundary
metrics are retained in [`outputs/role_suite/audio_metrics.json`](outputs/role_suite/audio_metrics.json).
The maximum adapter endpoint amplitude is `0.000122`, and the maximum adapter
boundary-region adjacent jump is `0.00525`, both within gate.

## Evidence and limits

- [`outputs/role_suite/manifest.json`](outputs/role_suite/manifest.json)
- [`outputs/role_suite/generation_base.json`](outputs/role_suite/generation_base.json)
- [`outputs/role_suite/generation_adapter.json`](outputs/role_suite/generation_adapter.json)
- [`outputs/role_suite/mastering_report.json`](outputs/role_suite/mastering_report.json)
- [`outputs/role_suite/audio_metrics.json`](outputs/role_suite/audio_metrics.json)
- [`outputs/role_suite/asr_report.json`](outputs/role_suite/asr_report.json)

The start-free watchdog was lowered from 6,000 to 5,400 MiB only for this
inference suite, with explicit authorization based on the measured generation
footprint. Physical VRAM (7,500 MiB), reserved VRAM (7,168 MiB), and thermal
(74 C) stops were unchanged. Generation stayed below those caps.

This suite covers five representative texts and one deterministic seed. ASR
and acoustic measurements cannot establish naturalness, speaker similarity,
or listener preference. A future promotion attempt would require resolving the
small-model role regression and then passing a blinded human comparison.
