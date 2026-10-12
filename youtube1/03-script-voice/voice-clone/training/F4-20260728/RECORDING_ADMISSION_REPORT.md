# F4 recording admission report

## Decision

Rejected before dataset creation. No F4 Fish Speech dataset, proto, smoke run,
bounded training run, checkpoint, merged model, reference prompt, augmentation,
or target-token synthesis was created.

The fixed eight-item training script is in the correct order, but four items
fail the required dual-ASR/restart gate. The two held-out validation items pass
both ASRs after punctuation and whitespace normalization.

Machine-readable evidence:
[`../../../runs/F4-20260728/recording-admission-rejection.json`](../../../runs/F4-20260728/recording-admission-rejection.json)

## Immutable source lock

| Recording | Duration | SHA-256 |
|---|---:|---|
| `F4_train.wav.m4a` | 68.117354 s | `9932CBE39DBD18C005E36CD25F815F5C7B489E31BD62B600427A38F42466EC20` |
| `F4_validation.wav.m4a` | 18.133313 s | `180AC9954D84B3A7AC6ED5E4CFAAB0F53DF35F1E03CF64CFDB39FE6FBF2B7DE8` |

The validation PCM is isolated at `validation-lock/F4_validation.full.wav`
(`47844B884948F67B3BEA8F88742F1C6C9A1073410F4B6FC3699C2A1FF06859EF`).
It was used only for recording admission ASR and was not used for training,
augmentation, prompting, or checkpoint selection.

## Recording QC

| Split | LUFS-I | LRA | True peak | PCM RMS | Clipped samples |
|---|---:|---:|---:|---:|---:|
| Train | -29.4 | 8.0 LU | -5.7 dBFS | -30.571 dBFS | 0 |
| Held-out validation | -28.7 | 4.1 LU | -9.1 dBFS | -29.749 dBFS | 0 |

Both recordings contain clear natural sentence gaps. The train gaps detected at
-42 dBFS range from 0.37 to 3.35 seconds; validation gaps range from 0.57 to
2.32 seconds. The files contain digital-zero padding, so `astats` reports an
unbounded digital silence floor; the JSON also records a deterministic quiet
50 ms window percentile instead of presenting that as ambient microphone noise.

## Exactly four required re-recordings

Record each item as one clean take. Keep 0.2–0.4 seconds at the start and end,
and use only the written sentence boundaries for a short natural pause. Do not
edit inside a sentence, denoise, normalize, pitch-correct, or splice words.

1. Replace original item 4 (22.52–28.71 s):
   “교사용 의자에 소변을 봤습니다. 신고를 받은 경찰은 현장에 남은 흔적을 확인했습니다.”
   Both models heard `받습니다` instead of `봤습니다`.

2. Replace original item 5 (31.41–36.89 s):
   “경찰은 건조물침입과 재물손괴 혐의를 적용해 사건 경위를 조사했습니다.”
   Large-v3 heard `재물손기`; turbo heard the required `재물손괴`.

3. Replace original item 6 (36.67–45.14 s):
   “피해 교사 측은 휴대전화와 컴퓨터 포렌식 영장을 요청했지만, 법원은 기각했습니다.”
   Both models timestamp an initial `피해`, followed by about 2.5 seconds of
   silence, then a restart at `교사 측은`. Record it without a false start.

4. Replace original item 8 (59.30–66.79 s):
   “범인이 붙잡힌 뒤에도 피해자는 불안에서 벗어나지 못했습니다. 학교의 출입 관리와 피해자 보호가 정말 필요하지 않을까요?”
   Large-v3 heard `불안해서`; turbo heard the required `불안에서`.

Both ASRs display the spoken `열여섯 살` in item 2 as `16살`. This is recorded
as a display-normalization note, not used as a training label; the label must
remain the fixed written script.

## Reusable clean segment plan (not a dataset)

The following ranges may be reused only after the four replacements pass the
same admission gate. They have not been copied into a Fish Speech dataset.

| Item | Range |
|---|---:|
| 1 | 1.13–6.79 s |
| 2 | 7.86–13.00 s |
| 3 | 15.09–19.77 s |
| 7 | 48.53–55.85 s |

## Commands and models

- PCM inspection copies: FFmpeg mono PCM16, 44.1 kHz, metadata removed; source
  files were never overwritten.
- QC: `ffprobe`; FFmpeg `ebur128=peak=true`, `astats`, and
  `silencedetect=noise=-42dB:d=0.25`; deterministic sample QC in
  `evaluate_f4_recordings.py`.
- Primary ASR: cached `Systran/faster-whisper-large-v3`, CUDA float16, Korean,
  beam 5, word timestamps, VAD, no previous-text conditioning.
- Consensus ASR: cached
  `mobiuslabsgmbh/faster-whisper-large-v3-turbo` with the same decoding policy.
- Evidence validation:
  `python -m json.tool 03-script-voice/runs/F4-20260728/recording-admission-rejection.json`.

Training may resume only after all four replacement items pass both ASRs with
no false starts or internal edits and the validation hashes above still match.
