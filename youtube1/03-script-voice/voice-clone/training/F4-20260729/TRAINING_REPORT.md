# F4 LoRA salvage training report

## Decision

**Rejected for production. No F4 model was selected.**

The eight new recordings failed whole-file admission, but a stricter
sentence-level salvage pass admitted 25 of 43 canonical units (125.00 s). That
was enough for a bounded LoRA experiment. Training was safety-stopped after the
monitor observed 83 C (hard limit 82 C) at logged step 114. The two permitted
candidate checkpoints, steps 60 and 40, both failed the fixed dual-ASR critical
token gate. Their merged directories are comparison candidates only and must
not be configured as production models.

Machine-readable evidence:

- [`../../../runs/F4-20260729/new-recordings-admission-rejection.json`](../../../runs/F4-20260729/new-recordings-admission-rejection.json)
- [`../../../runs/F4-20260729/sentence-salvage.json`](../../../runs/F4-20260729/sentence-salvage.json)
- [`fish-dataset/dataset_manifest.json`](fish-dataset/dataset_manifest.json)
- [`../../../runs/F4-20260729/checkpoint-comparison.json`](../../../runs/F4-20260729/checkpoint-comparison.json)

## Source locks and recording QC

The original sources were not overwritten.

| Source | Duration | SHA-256 |
|---|---:|---|
| `F4_train.wav.m4a` | 68.117354 s | `9932CBE39DBD18C005E36CD25F815F5C7B489E31BD62B600427A38F42466EC20` |
| `F4_validation.wav.m4a` | 18.133313 s | `180AC9954D84B3A7AC6ED5E4CFAAB0F53DF35F1E03CF64CFDB39FE6FBF2B7DE8` |
| Validation PCM | 18.133313 s | `47844B884948F67B3BEA8F88742F1C6C9A1073410F4B6FC3699C2A1FF06859EF` |
| `F4_extra_01.m4a.m4a` | 41.237292 s | `14A574B2B244E979B8A579EA2ACAF1A83C25729E149989668F5BF9477AFE2699` |
| `F4_extra_02.m4a.m4a` | 30.698688 s | `0D1D40DD70A8A25C264F52E2F544F3FF1B15804DFBF84C8DDE4205C582552375` |
| `F4_extra_03.m4a.m4a` | 59.882625 s | `63674980D68675976CE8DB3C3C1A10C93AA97900FC160CDFA141AA0FF410F9F5` |
| `F4_extra_04.m4a.m4a` | 35.199938 s | `4BA1C2C9695F6447CDED9A9CD46CE0564A064105EEF4948563724772E57F01AA` |
| `F4_extra_05.m4a.m4a` | 45.866667 s | `455F30CD4EA82CD4E254B1B21146A1029AC30A958764107505C02BDBF9E50523` |
| `F4_extra_06.m4a.m4a` | 41.301250 s | `33DD959BA91DF19D183D8AEDFEA5B046AF143D7759632CE4500D4701F601F19F` |
| `F4_extra_07.m4a.m4a` | 45.525292 s | `70C31791016AD3024753332D9A27BB7D9D13EC1FD5D422222D4A5BB12C7BC10B` |
| `녹음 (8).m4a` | 35.519938 s | `DB4EB0DBD06DE727AEE105BF652E294856DE7E34B9A250DBC347A24ED0BBFAE7` |

Across the eight new files, integrated loudness ranged from -31.2 to -26.2
LUFS, true peaks from -9.6 to -4.1 dBFS, and clipped samples were zero. Detected
silences ranged from 0.256 to 1.782 s.

## Whole-file admission versus sentence salvage

Whole-file admission remained rejected. Examples include `익명에`, `새솔리`,
`교실한`, `기간`, `동선은`, `재물 송계`, and `제품`; the requested four old
replacement sentences were not present as complete admissible takes.

Sentence salvage used a narrower rule: the normalized complete sentence had to
occur in both the large-v3 and large-v3-turbo word streams, critical terms had
to be exact, the maximum internal pause was 1.25 s, and each clip had a 150 ms
boundary guard. Result: 25 accepted, 18 rejected, exactly 125.00 s. Every WAV
and label hash in the salvage manifest was rechecked with zero mismatches.

Validation remained isolated: two clips, 14.80 s. It was not used for training,
augmentation, or prompting. VQ extraction succeeded for all 25 training clips
and both validation clips; one proto shard was produced per split.

## Training and safety stop

Configuration: Fish Speech 1.5 LoRA rank 8, alpha 16, dropout 0.01, batch 1,
one worker, gradient accumulation 4, BF16 mixed precision, learning rate
`5e-5`, validation/checkpoint every 20 steps. A two-step smoke run passed.

The bounded run was stopped immediately when the GPU monitor observed 83 C,
above the 82 C hard limit, at logged step 114. A step-120 checkpoint exists due
to the stop/checkpoint race, but it is explicitly excluded and was not merged or
probed.

| Rank | Step | Validation loss | Top-5 accuracy | Disposition |
|---:|---:|---:|---:|---|
| 1 | 60 | 8.3750 | 0.369141 | Allowed candidate; probed |
| 2 | 40 | 8.3750 | 0.367188 | Allowed candidate; probed |
| 3 | 20 | 8.4375 | 0.361328 | Not probed |
| 4 | 80 | 8.5000 | 0.367188 | Not probed |
| 5 | 100 | 8.8750 | 0.357422 | Not probed |

## Fixed probe results

Both candidates used the same F3 owner prompt, prompt text, tempo 1.0, critical
seed 20260729, and held-out seed 20260730. The held-out text passed both ASRs
for both candidates after punctuation/spacing normalization.

| Candidate | large-v3 critical failure | turbo critical failure | Result |
|---|---|---|---|
| Step 60 | `봤습니다` → `받습니다`; `재물손괴` → `재물 송개` | `교권보호국` → `교건보호국`; `재물손괴` → `재물 송개` | Reject |
| Step 40 | `봤습니다` → `받습니다` | `재물손괴` → `재물 송개` | Reject |

Base and F3 were not rerun after safety finalization. Once both F4 candidates
failed the non-negotiable gate, further high-load inference was prohibited.
The partially initialized `probes/base` directory is not comparison evidence.

Candidate-only merged directories:

- `C:/Users/User/tools/fish-speech/checkpoints/fish-speech-1.5-F4-salvage-r8-step60-20260729`
- `C:/Users/User/tools/fish-speech/checkpoints/fish-speech-1.5-F4-salvage-r8-step40-20260729`

No `selected` marker, production checkpoint, or production configuration was
created or changed.

## Required next concentrated recordings

Before another F4 run, record multiple clean, short variations centered on the
three remaining unstable terms:

1. `교권보호국` — preserve all syllables, especially `권`.
2. `봤습니다` — contrast explicitly with `받습니다` in separate sentences.
3. `재물손괴` — preserve `손괴`; avoid the recurring `송개` realization.

Re-admit only sentences that pass both ASRs exactly. Keep validation hash-locked
and separate, and start any later bounded run only after the GPU is at or below
55 C with the same 82 C hard stop.
