# F4 target remediation report

## Decision

**Rejected: no target-remediation model qualified.** `selected_model=null` and
no selected marker, production configuration change, render, or upload was
created.

Machine evidence:

- [`../../../runs/F4-target-20260729/target-admission.json`](../../../runs/F4-target-20260729/target-admission.json)
- [`fish-dataset/dataset_manifest.json`](fish-dataset/dataset_manifest.json)
- [`../../../runs/F4-target-20260729/safe-resume.json`](../../../runs/F4-target-20260729/safe-resume.json)
- [`../../../runs/F4-target-20260729/base-training-safety.json`](../../../runs/F4-target-20260729/base-training-safety.json)
- [`../../../runs/F4-target-20260729/target-checkpoint-comparison.json`](../../../runs/F4-target-20260729/target-checkpoint-comparison.json)

## Target admission

All three immutable recordings passed audio QC, complete normalized-text
matching in both large-v3 and large-v3-turbo, exact critical terms, and the
no-restart/no-long-internal-pause gate.

| Source | SHA-256 | Duration | LUFS | True peak | Clips |
|---|---|---:|---:|---:|---:|
| `F4_target_songoeg.m4a.m4a` | `14D8CCEB4A3C3572BAD1EB43D5E44F2DEA852EB678D1C6EDA112032D93011853` | 14.613333 s | -26.2 | -6.9 dBFS | 0 |
| `F4_target_bwat.m4a.m4a` | `7653874CAAD79541CF5C6EAC851DA82D0AB96AA494F673DAC055B11ED664153B` | 14.826667 s | -25.9 | -4.7 dBFS | 0 |
| `F4_target_gyogwon.m4a.m4a` | `C3BABD0C005309E1F3550124E4837F2441C9812529344E86AD41204D02770DCD` | 14.869320 s | -27.2 | -5.7 dBFS | 0 |

The accepted mapping contains 10 unique sentences: three `재물손괴`, four
`봤습니다/받은/밟았습니다/바꿨습니다`, and three
`교권보호국/교권/권한` sentences.

## Mix and validation isolation

The dataset contains the prior F4 salvage base once (25 clips, 125.00 s) plus
the 10 admitted target sentences exactly twice (20 clips). Total training:
45 clips, 189.32 s. Target sampling never exceeds 2x.

The held-out validation remains two clips/14.80 s and is not in training,
augmentation, or prompt input. Source SHA remains
`180AC9954D84B3A7AC6ED5E4CFAAB0F53DF35F1E03CF64CFDB39FE6FBF2B7DE8`;
validation PCM SHA remains
`47844B884948F67B3BEA8F88742F1C6C9A1073410F4B6FC3699C2A1FF06859EF`.
VQ extraction succeeded 45/45 train and 2/2 validation; each split produced
one proto shard.

## Continuation verdict and fallback

Step 40 preflight contained global step 40, optimizer, scheduler, and loop
state. The immutable original SHA was identical before and after. A copy only
was changed to optimizer/scheduler LR `1.5e-5`; old ModelCheckpoint path/ranking
metadata was removed without altering model, optimizer, scheduler, loop, epoch,
or global-step state.

Runtime strict restoration nevertheless rejected continuation because the
LoRA-only Lightning `state_dict` omitted 203 frozen base-weight keys. No resumed
optimizer step occurred. This made continuation unsafe, so the run fell back
to a new base LoRA rather than synthesizing a nonstandard full checkpoint.

The first smoke attempt stopped before training because Hydra stripped Windows
backslashes from the proto path. The path was converted to forward slashes and
a new smoke2 run passed 2/2 steps: start 51 C, maximum 65 C, no safety stop.

## Bounded fallback training

Configuration: base Fish Speech 1.5, LoRA r8/alpha16, LR `3e-5`, batch 1,
workers 1, gradient accumulation 4, BF16, validation/checkpoint every 10, and a
60-step maximum. It started at 52 C. The monitor killed the process tree after
observing 80 C, above the 78 C hard limit. The last logged train step was 44;
the last safely stored checkpoint was step 40. No further training was run.

| Rank | Checkpoint | Validation event | Loss | Top-5 |
|---:|---:|---:|---:|---:|
| 1 | 40 | 39 | 8.3750 | 0.367188 |
| 2 | 30 | 29 | 8.4375 | 0.361328 |
| 3 | 20 | 19 | 8.4375 | 0.361328 |
| 4 | 10 | 9 | 8.4375 | 0.359375 |

## Fixed critical and held-out probes

Both candidates used the same F3 owner prompt, prompt transcript, tempo 1.0,
critical seed 20260729, held-out seed 20260730, and a 78 C probe hard stop.
Both candidates passed the complete held-out text in both ASRs.

| Candidate | Primary critical | Turbo critical | Decision |
|---|---|---|---|
| Step 40 | `봤습니다→받습니다`; `재물손괴→재물 송개` | Exact | Reject |
| Step 30 | `교권보호국→교권보호구`; `봤습니다→받습니다`; `재물손괴→재물 송개` | `교권보호국→교권보호금`; `봤습니다→받습니다` | Reject |

Probe samples:

- Step 40 critical: [`critical.wav`](../../../runs/F4-target-20260729/probes/f4-target-step40/audio/critical.wav), SHA `A1431A7E0DF03DED7CF592D777A394A99BA34238F42E96E19ED055A7A0AC073F`
- Step 40 held-out: [`heldout.wav`](../../../runs/F4-target-20260729/probes/f4-target-step40/audio/heldout.wav), SHA `9C527F8C2562373E0A375F4C3EFD24B20770BF09A486EE46482069A35CF1B4AA`
- Step 30 critical: [`critical.wav`](../../../runs/F4-target-20260729/probes/f4-target-step30/audio/critical.wav), SHA `2A6C7A06DEC0630F0E18C998483D6B18FC36995993A0C03B6115F49CA7C0D953`
- Step 30 held-out: [`heldout.wav`](../../../runs/F4-target-20260729/probes/f4-target-step30/audio/heldout.wav), SHA `2535532E74F5378703D6378BACE4335625E215B89E2517E24D096B4D0FB9DBA5`

Candidate merged models exist only for comparison:

- Step 40 model SHA `17CFEB1FD4EB15EC070DAA7D846D51349D49B1DA3E8ABE3B58E05E069B98EC97`
- Step 30 model SHA `F76B0C2CE14B6293236E7269B07BF0F0B31FA7A9F68D6AB46B230B41B9348F2B`

Base/F3 high-load probes were not rerun. Existing evidence only was used.
Neither candidate may be promoted or connected to production.
