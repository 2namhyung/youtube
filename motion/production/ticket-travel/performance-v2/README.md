# Performance v2 — work in progress

2026-09-05. User requested a complete reference-inspired video with a shared walk but distinct upper-body actions and expressions. Accepted `synced-transition-v1` is preserved. This is independent of 23jung episode-001 production.

## Latest status — 2026-09-06

All five full-sequence inputs are downloaded: `intro-casual.mp4`, `canonical-hanbok-10s.mp4`, `tokyo-parasol-10s.mp4`, `shanghai-fan-10s.mp4`, `hanoi-hat-10s.mp4`. Exact new prompts and download provenance: [10-second edits](long-variant-prompts.md), [opening](intro-prompt.md). The historical submitted/pending entries below record progression, not the latest state.

The new canonical is a fresh 10-second animation of the existing ImageGen image, not an extension/loop of the accepted four-second take. [Canonical audit](../../../analysis/reference-performance-audit-v1/canonical-hanbok-10s-note.md) found continuous-looking gait and stable framing. [Variant review](../../../analysis/reference-performance-audit-v1/variant-phase-matching-note.md) distinguishes broad visible foot-phase compatibility from unmeasured exact joint correspondence.

The current 13-second assembly is [final-sequence-v2](../final-sequence-v2/README.md), rendered and decoded successfully: 720×1280, 24 fps, 312 frames. A 12 fps/312-frame half-speed review copy is included. The retained [v1](../final-sequence-v1/README.md) has inferior white-on-white Hanoi matting and is not the current deliverable. The [Hanoi green-background edit](hanoi-green-prompt.md), followed by global soft chroma key without hole filling and mild despill, preserves white garments and open arm gaps in the v2 output. Final Hanoi frames at 11.5/12/12.5 seconds were inspected. Seoul→Tokyo and Tokyo→Shanghai dense checks are `tokyo-wipe-qc.jpg` and `shanghai-wipe-qc.jpg`; they show lower-to-upper changes following the independent tilted card. Intro is separately animated and is not guaranteed phase-identical to the canonical source. This is a reference-inspired original composition, not a claim to recover the original author's pipeline or achieve pixel-identical gait.

## Evidence and direction

See [reference performance audit](../../../analysis/reference-performance-audit-v1/report.md). The reference uses distinct gestures/gaze per city and slanted/rounded card entry, backing/shadow and slight motion blur. Actual original authoring method is unknown. Our traditional clothing brief substitutes pouch/parasol/fan/non-la performances rather than copying the source person or artwork.

Core invariant: step timing, stride, direction, apparent scale and camera. Upper-body gestures, props and expression may vary. Motion preservation remains an output review question, not a guaranteed model setting.

## Shanghai edit submitted

Flow project `a37f8501-9284-4599-bee5-bafd23699149`, history source selected: original hanbok walk under media `b96890f4-9f04-4f33-9def-54303814b5c0`. Reference: existing `K3-shanghai-qipao.png`. Native Omni 1.1 Flash edit, 4-second source. Status: submitted, not yet verified.

```text
Edit this source video so the same woman wears the emerald green embroidered qipao from the reference image throughout the entire clip. Use the source video as the motion reference. Preserve the timing and progression of her walk: the same alternating steps, the same foot contacting the ground at the same moment, the same stride length, walking speed, and direction. Do not restart, slow down, pause, or replace the walk with smaller steps. Let the slit and fabric accommodate the existing leg movement. Keep her facial identity, short hair, body proportions, screen position and apparent size consistent with the source. Keep the camera locked and preserve the white studio background and lighting. Give her an independent natural upper-body performance: carry a small pearl handbag loosely in one hand and gently fan herself with an open folding fan in the other. Begin looking ahead, then briefly glance toward the camera with a subtle relaxed smile and look ahead again, without turning the hips or changing the walk. Arms, hands, gaze and facial expression may differ from the source. Replace the original pouch with these props. Use the reference only for clothing and accessory design; do not add its boarding pass, text or border. She wears the qipao from the first frame to the last. No wardrobe transformation, transition or cut.
```

## Hanoi edit submitted

Same original hanbok history source; reference `K4-hanoi-ao-dai.png`, native Omni 1.1 Flash. Shanghai completed and was downloaded as `shanghai-fan.mp4`; `shanghai-contact.jpg` shows the fan rising around the latter half and a changing expression. Exact heel/toe preservation remains unverified.

```text
Edit this source video so the same woman wears the white silk ao dai, loose white trousers and light pastel scarf from the reference image throughout the entire clip. Use the source video as the motion reference. Preserve the timing and progression of her walk: the same alternating steps, the same foot contacting the ground at the same moment, the same stride length, walking speed and direction. Do not restart, slow down, pause or replace the walk with smaller steps. Let the long panels accommodate the existing leg movement. Keep her facial identity, short hair, body proportions, screen position and apparent size consistent with the source. Keep the camera locked and preserve the white studio background and lighting. Her upper body has a different natural performance: start holding a Vietnamese conical straw hat at chest height with both hands, then smoothly lift it onto her head while continuing the same walk, lightly touch the brim and finish with a small warm smile toward the camera. Keep the hips facing the original walking direction. Arms, hands, gaze and expression may differ from the source. Remove the original pouch. Use the reference only for outfit and hat design; do not add its boarding pass, text or border. She wears the ao dai from the first frame to the last. No wardrobe transformation, transition or cut.
```

## Remaining complete-video work (checklist)

Hanoi completed and downloaded as `hanoi-hat.mp4`: `hanoi-contact.jpg` shows the hat lifted onto her head while the lower-body walking continues. Both Shanghai/Hanoi are performance probes, not yet the full timeline sources.

### Longer canonical source submitted

The source-loop audit found no proven seamless loop in the existing4sec phrase. A new10sec source from the same existing `01-seoul-hanbok.png` was submitted to Flow (9:16,720p,10sec,one output). This is new generation, NOT an exact extension of the approved4sec clip. It must pass review before replacing the short source. Proposed full length uses an opening plus continuous card sequence; exact timing still pending, original13sec brief remains target.

```text
A single continuous 10-second full-body fashion editorial shot of this woman in this hanbok. She is already walking in place at the first frame and continues with a relaxed, regular natural walking cycle through the final frame, alternating foot contacts and maintaining the same stride length and tempo. Keep her centered at the same screen position and the same apparent body size. Maintain the starting three-quarter body orientation and pelvis direction throughout. Locked-off camera, no pan, zoom or dolly. Infinite white studio background with a soft natural contact shadow. Preserve her facial identity, short hair, body proportions and outfit. Natural independent upper-body performance: lightly swing the colorful pouch with the walk, occasionally glance down at it, then look ahead with a faint relaxed smile. Small natural head movements are welcome, but no turn of the hips and no interruption of the steps. No cards, no text, no transitions, no wardrobe change, no freeze or pause. Do not slow down or stop at the end.
```

- Verify Shanghai gait/performance and acquire Tokyo/Hanoi performance variants.
- Opening passport/backpack sequence and airplane shadow.
- Review 4-second source duration against 13-second continuous timeline: do not silently loop/reset the walk or stretch four seconds into the whole film. Longer source or verified phase-matched segment assembly is required.
- Refine independent card geometry and slanted reveal (`synced-transition-v2`).
- Assemble, inspect every boundary and full playback, add sound, and obtain full-video user review. No final completion claim yet.
