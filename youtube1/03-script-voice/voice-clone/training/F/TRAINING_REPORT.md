# Fish Speech F LoRA training report

Date: 2026-07-26 (Asia/Seoul)  
Runtime: Fish Speech 1.5, PyTorch 2.4.1+cu124  
GPU: NVIDIA GeForce RTX 3060 Ti, 8192 MiB, driver 591.86  
Base checkpoint (unchanged): `C:\Users\User\tools\fish-speech\checkpoints\fish-speech-1.5`  
Base `model.pth` SHA-256: `918DC960372CC1B77BBAFB14C48EF7A1634ECF75D4EB85B78607223B780D6001`

## Dataset and transcript gate

- Source: all six immutable PCM16/24 kHz/mono recordings under `voice-clone/profiles/F/refs` (295.724 s total).
- Dataset: `C:\Users\User\tools\fish-speech\data\F`.
- Machine-readable clip/source manifest: `C:\Users\User\tools\fish-speech\data\F\dataset_manifest.json`. It records every source/clip path, time range, duration, exact UTF-8 transcript, ASR scores, and SHA-256 hashes.
- Accepted: 51 clips, 215.160 s; 45 train and 6 held-out validation clips. Every recording/style contributes to both the accepted set and validation split.
- Transcript gate: Systran faster-whisper-large-v3 and mobiuslabsgmbh faster-whisper-large-v3-turbo, local CUDA float16, beam 5. Acceptance required normalized cross-model agreement, segment average log probability >= -0.35, and mean word probability >= 0.94.
- Excluded: 8 materially uncertain segments. Four were model disagreements, three were the known `04_tension` 피해자/가해자 subject ambiguity, and one was a further tension particle disagreement. No disputed word was corrected or guessed.
- Processing: sentence/silence-aligned trim only. No denoise, compression, dynamics, gain, loudness normalization, or resampling was applied to training clips.

Preparation scripts:

- `voice-clone/training/F/transcribe_f.py`
- `voice-clone/training/F/build_f_dataset.py`

## VQ and protobuf

Commands (from `C:\Users\User\tools\fish-speech`):

```powershell
.\venv\Scripts\python.exe tools\vqgan\extract_vq.py data\F\train --num-workers 1 --batch-size 8 --config-name firefly_gan_vq --checkpoint-path checkpoints\fish-speech-1.5\firefly-gan-vq-fsq-8x1024-21hz-generator.pth
.\venv\Scripts\python.exe tools\vqgan\extract_vq.py data\F\val --num-workers 1 --batch-size 6 --config-name firefly_gan_vq --checkpoint-path checkpoints\fish-speech-1.5\firefly-gan-vq-fsq-8x1024-21hz-generator.pth
.\venv\Scripts\python.exe tools\llama\build_dataset.py --input data\F\train --output data\F\protos_train --text-extension .lab --num-workers 4
.\venv\Scripts\python.exe tools\llama\build_dataset.py --input data\F\val --output data\F\protos_val --text-extension .lab --num-workers 4
```

- Train VQ files: 45/45; validation VQ files: 6/6.
- Train proto: `data/F/protos_train/00000000.protos`, 68,872 bytes, SHA-256 `B38E12B91D4E28909DE073E104FF4551A2061E4D725ECFC5AFAE793CB8C79B13`.
- Validation proto: `data/F/protos_val/00000000.protos`, 9,269 bytes, SHA-256 `E47527F8E7A325BC9F5BA832EEFD3135BCAF21C9E86D96DE7844D91D49CAA3E5`.

## LoRA training

Successful smoke test: two optimizer steps, held-out validation enabled, no OOM. Real run:

```powershell
.\venv\Scripts\python.exe fish_speech\train.py --config-name text2semantic_finetune project=F_lora_20260726_r8 pretrained_ckpt_path=checkpoints/fish-speech-1.5 '+lora@model.model.lora_config=r_8_alpha_16' 'train_dataset.proto_files=[data/F/protos_train]' 'val_dataset.proto_files=[data/F/protos_val]' max_length=512 data.batch_size=1 data.num_workers=1 trainer.accumulate_grad_batches=4 trainer.max_steps=120 trainer.precision=bf16-true trainer.strategy=auto trainer.val_check_interval=20 trainer.limit_val_batches=6 +trainer.num_sanity_val_steps=1 callbacks.model_checkpoint.every_n_train_steps=20 callbacks.model_checkpoint.save_top_k=6 model.optimizer.lr=5e-5 +trainer.enable_progress_bar=false +trainer.log_every_n_steps=1
```

- LoRA: rank 8, alpha 16, dropout 0.01; 6.2M trainable / 637M frozen parameters.
- Effective batch: 4 (batch 1, accumulation 4); maximum sequence length 512; AdamW learning rate 5e-5; bf16 true precision.
- 120 optimizer steps, approximately 10.7 effective dataset passes; total wall time 266.8 s including load/validation/checkpointing.
- Observed live training memory: 4,441 MiB / 8,192 MiB; no OOM.

| Checkpoint | Train loss | Validation loss | Validation top-5 | SHA-256 |
|---|---:|---:|---:|---|
| step 20 | 8.4375 | 8.3750 | 0.406250 | `8CD21B8CE2376ABDAA177C4BC3526C5B5CCF1DBBBA19220741F2E496B7082079` |
| step 40 | 8.2500 | 8.3125 | 0.417969 | `D7BCB7B262DAFB26374CFBA91A43A3E24D287697EBCE52048120F9427B4F41B9` |
| step 60 | 7.9375 | 8.2500 | 0.423828 | `B3684B55864A24ACB97EFB8C887E5602E2B4C2C3614C756B1EC05F2E4A2BD9A1` |
| step 80 | 8.1250 | 8.1875 | 0.425781 | `FE61EE13A97637EC52D16134656085BEC4E3148C65ADC7CB8EA8070E4AA2445C` |
| step 100 | 7.4375 | 8.1250 | 0.433594 | `8825C035B423173926F26ED346C3098B7E1CFA157BE40E17FAD7534E620EA75A` |
| step 120 | 7.1250 | 8.1250 | 0.431641 | `42F476DB54CB959207470BBFEC7848301459017258E285E6BB20C10D562ADE95` |

The selected checkpoint is step 100: it is the earliest checkpoint on the best validation-loss plateau and has slightly better validation top-5 accuracy than step 120.

## Merge and load validation

```powershell
.\venv\Scripts\python.exe tools\llama\merge_lora.py --lora-config r_8_alpha_16 --base-weight checkpoints\fish-speech-1.5 --lora-weight results\F_lora_20260726_r8\checkpoints\step_000000100.ckpt --output checkpoints\fish-speech-1.5-F-r8-step100-20260726
```

- Isolated merged checkpoint: `C:\Users\User\tools\fish-speech\checkpoints\fish-speech-1.5-F-r8-step100-20260726`.
- Merged `model.pth` SHA-256: `7EE588A059E05D22B1E350ECA441821CC984E7AF4440F4FC3383CA16C70D9EC0`.
- Fish merge validation found a significant tensor difference from base. Supported text2semantic inference subsequently restored the merged checkpoint successfully, proving it loads.

## Comparison inference and QC

Target (identical to the prior A/C/E comparison sentence):

`범인은 잡혔습니다. 그런데 피해자의 공포는 그때부터 시작했습니다. 잡혔는데도 끝나지 않은 사건 대체 무엇이 잘못된 걸까요?`

Prompt: existing transcript-aligned `voice-clone/samples/f-comparison-v2/F-prompt.wav` and its exact UTF-8 prompt text. Fish's supported VQ encode -> text2semantic generate -> VQ decode workflow was used with seed 20260726. The merged model generated 211 semantic frames and restored the exact two target text chunks in its inference log.

- Raw: `voice-clone/samples/f-fish-trained-20260726/F-fish-r8-step100-comparison.wav`; mono PCM16/44.1 kHz; 9.798821 s; -32.0 LUFS; -11.8 dBTP; SHA-256 `0CC6CCEF572CA80CB0D56C561105537B1443F4CEFA11838B6D79BB1D61EAEB2F`.
- Listen master: `voice-clone/samples/f-fish-trained-20260726/F-fish-r8-step100-comparison-master.wav`; gain-only +9 dB, no dynamics/denoise; approximately -23.0 LUFS; -2.8 dBTP; no clipping; SHA-256 `A7201EE4361334085FB83340555BB04FA33401B50FC45B8EF88916A44D5C7416`.
- Semantic codes SHA-256: `4B37E48731851037C495CDD583E9E82F0121EF946C57DA320B09036D12545604`.
- Large-v3 intelligibility QC transcribed all target words exactly (punctuation-only comma/period difference). Two segments had mean word probabilities 0.998866 and 0.998804; minimum word probability 0.997070.
- QC ASR record: `voice-clone/samples/f-fish-trained-20260726/qc-asr/F-fish-r8-step100-comparison.asr.json`.

No source recording, base checkpoint, or prior C/E/F output was deleted or overwritten. Nothing was uploaded or published.
