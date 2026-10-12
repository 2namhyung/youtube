# Qwen3-TTS 0.6B Base prosody LoRA pilot

**Unsupported experimental work area.** This directory is isolated from the
production voice-clone pipeline. It never writes adapters, checkpoints, or
derived data outside this directory and must not be used as a production
profile. The pilot is deliberately fail-fast: it refuses a non-CUDA/BF16
runtime, an unverified Qwen source/model revision, an unexpected talker
attention layout, sequence overflow, or GPU watchdog limits.

The implementation follows the official Qwen3-TTS fine-tuning data contract,
but replaces full-model SFT with PEFT LoRA (rank 4, alpha 8) on only the main
talker self-attention `q_proj`, `k_proj`, `v_proj`, and `o_proj` modules. The
custom forward explicitly computes `text_embedding =
talker.get_text_embeddings()(...)` and then calls
`talker.text_projection(text_embedding)` before combining codec embeddings.

Pinned inputs:

- Qwen source commit: `022e286b98fbec7e1e916cb940cdf532cd9f488e`
- Model: `Qwen/Qwen3-TTS-12Hz-0.6B-Base`, revision
  `5d83992436eae1d760afd27aff78a71d676296fc`
- Runtime pins and commands: [`requirements.lock`](requirements.lock),
  [`config.json`](config.json)

## Commands

Use the already validated Qwen pilot Python, but install the two experimental
packages into this directory only. This neither changes that environment nor
the production runtime.

```powershell
Set-Location C:\Users\User\Desktop\app\youtube\03-script-voice\voice-clone\qwen-prosody-lora
$py = 'C:\Users\User\tools\qwen3-tts-pilot\.venv\Scripts\python.exe'
& $py -m pip install --no-cache-dir --no-deps --target .\vendor `
  'git+https://github.com/QwenLM/Qwen3-TTS.git@022e286b98fbec7e1e916cb940cdf532cd9f488e' `
  'peft==0.20.0'

# Deterministic two-clip subset; outputs stay under derived/.
& $py build_f4_subset.py

# Encode with the nested tokenizer from the pinned cached Base snapshot.
& $py prepare_dataset.py --input-jsonl derived\train_raw.jsonl `
  --tokenizer-model 'C:\Users\User\.cache\huggingface\hub\models--Qwen--Qwen3-TTS-12Hz-0.6B-Base\snapshots\5d83992436eae1d760afd27aff78a71d676296fc\speech_tokenizer'

# One-batch forward/backward probe; no optimizer step and no adapter is saved.
& $py pilot.py --probe --train-jsonl derived\train_with_codes.jsonl

# Optional 8-step overfit gate (hard limited to 16), only after a passing probe.
& $py pilot.py --run-overfit-gate --train-jsonl derived\train_with_codes.jsonl

# Bounded perceptual pilot (all outputs remain in this directory).
& $py build_perceptual_dataset.py
& $py prepare_dataset.py --input-jsonl perceptual_data\train_raw.jsonl `
  --output-jsonl perceptual_data\train_with_codes.jsonl `
  --tokenizer-model 'C:\Users\User\.cache\huggingface\hub\models--Qwen--Qwen3-TTS-12Hz-0.6B-Base\snapshots\5d83992436eae1d760afd27aff78a71d676296fc\speech_tokenizer'
& $py prepare_dataset.py --input-jsonl perceptual_data\validation_raw.jsonl `
  --output-jsonl perceptual_data\validation_with_codes.jsonl `
  --tokenizer-model 'C:\Users\User\.cache\huggingface\hub\models--Qwen--Qwen3-TTS-12Hz-0.6B-Base\snapshots\5d83992436eae1d760afd27aff78a71d676296fc\speech_tokenizer'
& $py train_perceptual.py
& $py compare_perceptual.py
& 'C:\Users\User\AppData\Local\Programs\Python\Python314\python.exe' evaluate_asr.py
& $py evaluate_audio.py
```

`pilot.py` emits a machine-readable report (`outputs/report.json`) with source/model
pins, verified target module names, trainable/total parameters, probe loss and
gradient norm, watchdog observations, and gate status. It deliberately saves
no adapter. Existing F4 assets are read and hash-checked, but never edited.

This is true parameter LoRA: low-rank matrices are injected into 112 main
talker attention projections and receive gradients. It is not reference-prompt
voice cloning, tempo adjustment, or audio post-processing. The official JSONL
has no prosody-label field; “prosody-augmented” here means expressive recordings
carry prosody in their 16-codebook acoustic targets. It does not add
instruction-controllable prosody.

The completed validation-gated comparison, playable WAVs, metrics, and strict
non-production boundary are documented in
[`PERCEPTUAL_REPORT.md`](PERCEPTUAL_REPORT.md).
