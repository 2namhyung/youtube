# Qwen3-TTS prosody LoRA pilot report

Decision: **GO only for further bounded, non-production research; NO-GO for a
production adapter, deployment checkpoint, or a claim of upstream LoRA
support.** The custom rank-4 LoRA forward/backward path fits the RTX 3060 Ti
8 GB and takes an optimizer update, but this eight-microstep gate is far too
small to establish voice or prosody quality.

## Why the custom forward is necessary

Official Qwen source commit
[`022e286`](https://github.com/QwenLM/Qwen3-TTS/tree/022e286b98fbec7e1e916cb940cdf532cd9f488e)
documents single-speaker fine-tuning for 0.6B/1.7B, not LoRA. Its
[`sft_12hz.py`](https://github.com/QwenLM/Qwen3-TTS/blob/022e286b98fbec7e1e916cb940cdf532cd9f488e/finetuning/sft_12hz.py#L55)
passes every model parameter to AdamW. At lines 80–84 it adds raw text and
codec embeddings. The pinned official 0.6B config declares
`text_hidden_size=2048` and `hidden_size=1024`, while the model's inference
path calls `talker.text_projection`. This pilot makes that same projection
mandatory before the addition and asserts the result is 1024-wide.

PEFT is an added experimental dependency, not part of Qwen's trainer. The
adapter is scoped by an exact runtime-verified regex to the 28 main talker
layers' `q_proj`, `k_proj`, `v_proj`, and `o_proj`: 112 modules and 1,146,880
rank-4 trainable parameters. The speaker encoder, embeddings, text projection,
codec heads, and 5-layer code predictor remain frozen. The official combined
first-codebook plus `0.3 * sub_talker_loss` is retained, so the frozen
sub-talker still sends input gradients into the main talker.

## Data and runtime

- Two unique `target-remediation`, sampling-copy-1 F4 clips were selected from
  the training split only; validation and duplicate x2 rows were excluded.
- Owned copies were resampled from 44.1 kHz to 24 kHz mono PCM16. The canonical
  24 kHz F4 reference was reused for both rows.
- Qwen's pinned nested speech tokenizer produced `[28,16]` and `[33,16]`
  code tensors, all values within 0–2047.
- Runtime: Python 3.10.19, qwen-tts 0.1.1 from exact source commit, PyTorch
  2.4.1+cu124, Transformers 4.57.3, Accelerate 1.12.0, PEFT 0.20.0; BF16,
  SDPA, batch 1, sequence cap 256, gradient checkpointing, accumulation 8.
- Watchdogs: start free >=6000 MiB, physical used <=7500 MiB, PyTorch reserved
  <=7168 MiB, and hard thermal stop at 74 C.

## Results

The no-step probe passed: loss 17.175945, LoRA gradient norm 25.154197, zero
optimizer steps, 2,392 MiB peak PyTorch-reserved memory, 47 C final GPU
temperature. This proves gradients reach only the intended adapters and the
0.6B projection mismatch is fixed without mutating base weights.

The bounded gate then ran eight microsteps with accumulation 8 (one optimizer
step). Mean deterministic evaluation loss moved from 15.854256 to 15.852727.
Peak reserved memory was 2,226 MiB and final GPU temperature 48 C. No adapter
or checkpoint was saved. The tiny loss movement is only a mechanical
trainability check, not evidence of perceptual improvement or generalization.

Exact machine-readable evidence is in `outputs/probe_report.json`,
`outputs/report.json`, and `derived/subset_manifest.json`. The exact commands
are in `README.md`.

## Boundary and remaining risks

- Qwen upstream currently supports full single-speaker SFT, not this LoRA
  wrapper or PEFT adapter loading/export.
- `Qwen3TTSModel.from_pretrained()` cannot directly consume this talker-only
  PEFT adapter. A separately validated merge/export would need the exact base
  revision plus the speaker embedding row and custom-voice config changes used
  by upstream SFT. None was attempted.
- The official JSONL has `audio`, `text`, and `ref_audio` (then
  `audio_codes`); no prosody-label or instruction field exists. This learns
  acoustic behavior from expressive recordings. It is not controllable
  prosody prompting.
- Voice prompting uses a reference audio at inference and changes no weights;
  tempo/pitch processing changes a waveform after generation. Neither is
  LoRA. This pilot demonstrably changes trainable low-rank parameters, though
  it intentionally discards them after the gate.
- FlashAttention and a SoX executable are absent. SDPA was intentional and
  passed; the SoX import warning did not affect local WAV loading or this
  forward/backward path, but must be resolved before broader audio-format or
  deployment testing.
