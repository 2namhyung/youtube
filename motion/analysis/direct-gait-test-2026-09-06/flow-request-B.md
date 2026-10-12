# Direct gait B — concise motion replacement

- 2026-09-06 KST, same Flow project and original 10-second hanbok history as A, visually reselected before submission. Omni 1.1 Flash; one candidate submitted.
- Reason: A's sampled foot poses remained close to the 1.00x source, rather than demonstrating the 1.80x comparison cadence. Test whether a shorter instruction with fewer preservation constraints changes this behavior. This is a prompt variant, not evidence that the model universally cannot change gait.

```text
Replace the slow walking action with a clearly faster, energetic walk in place for this entire ten-second video. She takes nearly twice as many alternating left-right steps during the same ten seconds, with full natural strides, not tiny quick shuffles. Change the actual leg choreography and foot-contact timing; do not keep the original slow step sequence. She is already at this brisk steady cadence in frame one and keeps walking beyond the final frame. Keep it a walk, never a run or a hop. Keep the same woman, hanbok, pouch, camera, white background, screen position and body size. Her face and upper body remain naturally paced, not globally fast-forwarded. Keep the output ten seconds long with no cuts, no freeze and no looping.
```

Completed and downloaded to `C:/Users/every/Downloads/Woman_walking_in_hanbok_202609061655.mp4` (9,565,412 bytes). [Comparison](direct-gait-original1.00x-flowB-original1.80x-2s.mp4) and [frame sheet](direct-gait-flowB-head-feet-contact.jpg) show sampled leg progression close to original 1.00x, while the 1.80x retime differs. Current result: target faster cadence not demonstrated in A or B; neither adopted as the new gait baseline. This is not a universal impossibility verdict for Flow. Continue production evaluation using the existing user-selected 1.80x route.
