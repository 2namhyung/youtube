# Direct gait A — actual Flow submission

- Date: 2026-09-06 KST.
- Project: https://flow.google.com/project/a37f8501-9284-4599-bee5-bafd23699149
- Source history: original hanbok in asset `782edb55-2d01-4e7e-b61c-380fbdcdcd11`, 10 seconds. Visually confirmed hanbok, not Hanoi green version, before submission.
- UI model: Omni 1.1 Flash. One edit submitted through existing Chrome tab; 0% then 41% processing observed, followed by a completed history thumbnail.
- Downloaded through the scene-download button to `C:/Users/every/Downloads/Woman_walking_in_hanbok_202609061648.mp4`, 9,516,824 bytes. ffprobe: 720×1280, 24fps, 240 frames, video duration 10.000s. Generation completed; gait/quality verdict remains separate.
- Variable: walking cadence. Keep upper-body performance rather than adding the separate head-stability experiment. No cards or new images.
- Target 1.8 is a user-selected working comparison, not a measured reference coefficient or guaranteed model control.

## Exact submitted prompt

```text
Edit this entire ten-second source video. Change only the woman's walking cadence to a brisk, continuous fashion walk, aiming for about 1.8 times as many alternating footfalls per second as the source. Keep the source's full stride length and clear left-right alternation; do not substitute tiny shuffling steps. She is already walking at the first frame and maintains the new steady cadence through the last frame, with no acceleration lead-in, pause, running, hopping, or ending slowdown. Animate this faster walk naturally at normal playback speed; keep the output ten seconds long rather than shortening or globally fast-forwarding the clip. The original foot-contact timestamps must change to achieve the faster cadence. Preserve her identity, hanbok, short hair, body proportions, three-quarter orientation, average screen position and apparent size. Keep her walking in place, not advancing toward the camera. Preserve the existing pouch, facial performance and head gestures at their existing natural pace; do not add new upper-body choreography. Allow only the natural balance adjustments needed for the faster walk. Keep the locked camera, white studio and lighting unchanged. No cards, text, cuts, transitions, wardrobe changes, looping or frozen frames.
```

## Evaluation

Compare normal-playback raw output with canonical 1.00x and canonical 1.80x using equal two-second review windows starting at source 2.5s. Verify left/right step progression, non-shuffling stride, continuous motion, identity/size and upper-body pacing. Equal timestamps do not imply equal phase after deliberately changing cadence. Occluded foot contacts remain unknown. No whole-model capability verdict from a single failed candidate.
