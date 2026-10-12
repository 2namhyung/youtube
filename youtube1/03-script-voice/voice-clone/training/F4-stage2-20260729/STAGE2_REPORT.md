# F4 stage-2 pronunciation correction — 2026-07-29

## Decision

`REJECT_NO_STAGE2_CANDIDATE_QUALIFIED`

The only eligible stored candidate, step 10, failed the fixed critical probe under both independent ASR engines. It remains a candidate-only artifact. No production model, selected marker, render, or upload was changed.

## Stacked-base provenance

- Base Fish 1.5 model SHA-256: `918DC960372CC1B77BBAFB14C48EF7A1634ECF75D4EB85B78607223B780D6001`
- Stage-1 LoRA step 40 SHA-256: `845F2A48E7C4649FDC9457CA525E9657BB012C8720B8E31DFC6E0A495F9F9D65`
- CPU-merged stage-1 model SHA-256: `17CFEB1FD4EB15EC070DAA7D846D51349D49B1DA3E8ABE3B58E05E069B98EC97`
- Structure validation: 203 tensor keys, all shapes equal to base, 145 tensors changed.

Exact machine evidence is in `fish-dataset-v2/dataset_manifest.json`.

## Dataset

- Target remediation: 10 unique sentences, materialized twice = 20 clips.
- General salvage representative set: 10 clips, materialized once.
- Train total: 30 clips, 113.21 seconds.
- Validation: the existing two held-out clips only; source audio and label hashes are locked in the manifest and neither appears in train.
- Train proto SHA-256: `EEBCFE01771982E6C4C8DA12366022C3CD8BEDD0F618DF0620DA11D21895F756`
- Validation proto SHA-256: `223AC9DCE308279D1195173596B0875379ACB3F6CCE3BF0417A843C82CBDDFA7`

## Training

- Fresh stage-2 adapter on the CPU-merged stage-1 base.
- LoRA r4, alpha 8, dropout 0.01. r8 was not needed because the direct Hydra r4 configuration composed and trained successfully.
- Learning rate `1e-5`; batch 1; workers 1; gradient accumulation 4; BF16.
- Planned maximum 20 optimizer steps; validation and checkpoint every 5 steps.
- Smoke: 2/2 steps completed, start 51°C, maximum 68°C.
- Full run: start 52°C; 0.5-second polling; hard stop 74°C.
- Safety stop: 75°C observed, so the process tree was stopped and the run was not resumed.
- Stored checkpoints: steps 5 and 10. Of the allowed candidates 10/15/20, only step 10 exists.
- Step 10 stored validation: loss 8.375, top-5 accuracy 0.36328125, event step 9.

Safety evidence is in `03-script-voice/runs/F4-stage2-20260729/{smoke,training}-safety.json`; stored validation ranking is in `validation-ranking.json`.

## Candidate merge and fixed probe

- Step 10 checkpoint SHA-256: `7AB3F50F137FD87DF1EB440AB7E0B9C50A71AD716F562A9C5B670FA4650DFBA9`
- Candidate-only merged model: `C:\Users\User\tools\fish-speech\checkpoints\fish-speech-1.5-F4-stage2-r4-step10-20260729`
- Candidate model SHA-256: `6F8D4632A1C9A5F680EEC6956081E4A9E4401BDD83E8507C5EBE329C30CA0C5D`
- CPU merge validation: 203 tensor keys, shape match, 145 tensors changed relative to the stage-1 stacked base.
- Fixed probe: start at or below 52°C, maximum 68°C, hard stop 74°C, seeds and tempo unchanged from the prior F4 comparison.

Both primary large-v3 and turbo ASR accepted the held-out sentence exactly. Both transcribed the critical `봤습니다` token as `받습니다`; therefore critical full-text exactness and all-token exactness failed in both engines. The candidate is rejected.

Machine-readable verdict: `03-script-voice/runs/F4-stage2-20260729/stage2-checkpoint-comparison.json`.

## Safety and ownership

- No resumed training after the 75°C stop.
- No new base or F3 high-load probes.
- No production selection or model pointer change.
- No rendering or uploading.
- `api.txt` was not read or modified.
