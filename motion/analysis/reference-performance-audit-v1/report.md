# Ticket-travel reference performance audit

Compared:

- Reference: `references/taoagou/nonfinger/ticket_travel_7648553013002489109.mp4` — 1080×2160, 30 fps, 400 frames, 13.333 s.
- Accepted: `production/ticket-travel/synced-transition-v1/synced-transition-v1.mp4` — 720×1280, 24 fps, 96 frames, 4.000 s.

Evidence sheets: [reference whole](ref/contact-2fps.jpg), [reference transition](ref/transition-fine2.jpg), [accepted 4 fps](acc/contact-4fps.jpg), and city performance crops [Bangkok](ref/bangkok-perf.jpg), [Seoul](ref/seoul-perf.jpg), [Dali](ref/dali-perf.jpg), [Tokyo](ref/tokyo-perf.jpg).

## Main timing and transition behavior

- The reference holds the backpack traveler from 0.0 through about 4.2 s. She first reads the passport/booklet with both hands; by 4.0–4.3 s she has lowered it and is in a walking stride. The accepted clip starts already on the Seoul card and has no person-performance lead-in.
- At about 4.3–4.5 s the first ticket (BANGKOK) enters from the bottom edge. It settles around 4.9–5.0 s: roughly 0.5–0.7 s. The card is a separate, near-screen-width panel with rounded corners, offset gray backing/shadow, a visible slanted/tilted leading edge, and slight entry softness/motion blur. The edge is not a clean full-width horizontal line.
- The reveal is staggered in screen space: the card first covers the traveler’s legs/lower torso while the old upper body remains visible; the old person continues a pose/stride during the overlap. Do not translate one person+card bitmap. This differs materially from the accepted pure vertical cubic card wipe.
- Subsequent card changes are similarly bottom-up overlaps: BANGKOK→SEOUL about 6.6–7.0 s, SEOUL→DALI about 8.8–9.1 s, DALI→TOKYO about 11.1–11.4 s (each ~0.4–0.5 s). A sliver/stack of the prior card can remain at the lower/right edge during the overlap.

## Observable independent performances (not guesses)

The embedded figure keeps walking/posing independently of the static card typography and panel. Each city has a distinct upper-body action, gaze, and facial state:

- **BANGKOK, ~4.9–6.5 s:** peach dress + sunhat. Head turned toward screen-left, eyes looking off left; lips slightly parted/pleasant. Right hand holds a pink phone/camera up near her mouth/cheek; left arm hangs and swings. Sunglasses hang from the tan shoulder bag. Across the crop sheet the hand/phone and walking legs change while card text/barcodes stay fixed.
- **SEOUL, ~6.6–8.8 s:** white cap shades the eyes; gaze is down at a smartphone in the raised left hand. Right forearm is folded across the waist; red shoulder bag stays on the right side. Expression is neutral/concentrated, not the Bangkok smile/phone-near-mouth action.
- **DALI (大理 / TO DALI), ~8.8–11.1 s:** no hat; gaze is screen-left with a neutral, slightly alert face. Right hand grips the large tan backpack strap at chest/shoulder; opposite arm hangs/sweeps down. The strap/arm and crossed walking legs shift independently; boots and layered skirt move with the stride.
- **TOKYO, ~11.1–13.33 s:** glasses, white blouse, black skirt and black shoulder bag. Head/gaze are down-left toward the extended wrist/arm; the arm is held straight across the body as if checking a watch/bracelet, then lowers/sways while walking. Expression remains focused/soft, distinct from Dali’s side-looking pose.

## Actionable production deltas

1. Extend the sequence to include the ~4.3 s person lead-in and city-card cadence above; the accepted 4 s two-card clip cannot match the reference timing or performance.
2. Keep person/costume motion on a fixed screen-space track and animate the ticket/backing as a separate bottom-up panel. Use a soft/slanted moving edge and short motion blur; preserve the stagger where legs/lower body are replaced before head/upper body.
3. Author city-specific upper-body pose/gaze/prop tracks (phone near mouth, phone reading + folded arm, backpack-strap grip, wrist-check) rather than reusing one generic person animation. Preserve the fixed card typography/barcodes while those actions continue.
