# F3 reference-prosody LoRA

## Goal

Preserve the owner's voice while learning tempo and terminal cadence derived
from `reference-audio`. Third-party reference audio is never included as a
voice prompt or training waveform.

## Data

- Owner recordings only: `F2_20260727` accepted clips.
- Original training clips: 53.
- Reference-guided owner-voice augmentations: 53.
- Untouched validation clips: 7.
- Training audio: 441.754 seconds; validation audio: 27.570 seconds.
- Reference targets: 6.90/7.31/7.71 chars per second, 0.33-second median
  pause, mostly falling terminal cadence (-0.51 to -0.67 semitones).
- Formants are preserved during all owner-voice augmentation.

Dataset manifest:
`C:/Users/User/tools/fish-speech/data/F3_reference_prosody_20260727/dataset_manifest.json`

## Training

- Fish Speech 1.5 text-to-semantic LoRA.
- Rank 8, alpha 16, learning rate `5e-5`.
- Effective batch size 4; 160 steps; BF16.
- Selected checkpoint: step 160.
- Final validation loss: 8.1875.
- Final validation top-5 accuracy: 0.412109.

LoRA checkpoint:
`C:/Users/User/tools/fish-speech/results/F3_prosody_lora_20260727_r8/checkpoints/step_000000160.ckpt`

Merged model:
`C:/Users/User/tools/fish-speech/checkpoints/fish-speech-1.5-F3-prosody-r8-step160-20260727`

## Integrity

- LoRA SHA-256: `80148A50D32DE2C8754A2FE8D7328A5A0A7A41F9D7957126741BC6E1A588216A`
- Merged model SHA-256: `B04303B3507FF3A2C7C23E7C67F13EBE6F0C802EA5C2D0972CC80267BC2F55EE`
- Owner prompt SHA-256: `6BF6C9A83EB492806F8930035B38D5EED965F42D0922B5C172731D8DFDED2F11`

## Production result

- Final render: `school-case-ms2vsj67-26480-vfgvac.mp4`.
- Duration: 59.966667 seconds.
- 18 authoritative script cues; 20 editable display captions.
- OpenCut project: `0986312f-e8a4-4354-8725-9134e71e247c`.
- Post-synthesis tempo: 1.18x with pitch preserved.
