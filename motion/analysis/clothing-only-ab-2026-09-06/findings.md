# Clothing-only A/B findings

## Scope

The new B input is the downloaded Flow output `C:/Users/every/Downloads/Woman_walking_in_hanbok_202609061909.mp4` (720×1280, 24 fps, 10 s; SHA-256 `38D8D3EE340CEBEC35F0D9E34C8332526B55AD0F0387E9D640C8AD009055081D`). A is the historical `production/ticket-travel/performance-v2/tokyo-parasol-10s.mp4`. Both were assembled with the same 7.9 s incoming source time, 1.80× person sampling and the existing 6.5 s card boundary.

## Evidence

- [6-frame card-boundary sheet](AB-transition-6frames.jpg) samples global 6.500–6.708 s.
- [Initial matched-clock lower-body sheet](raw-three-way-matched-source-clock-feet.jpg) samples source 7.900–8.275 s.
- [Late residual-area matched-clock sheet](raw-three-way-late-source-clock-feet.jpg) samples source 8.500, 8.575, 8.650, 8.725, 8.800 and 8.875 s.
- [A/B transition video](AB-clothing-only-sameclock-1.5s.mp4) is the 36-frame, 1.5 s silent diagnostic; no video was rerendered for the late sheet.

## Findings

At the tested source-clock snapshots, B follows the same broad alternating-foot progression as A and does not show an obvious source-time restart. The new clothing-only prompt also removes the added parasol; the source pouch and lowered/source arm behavior remain visible in the sampled transition. These observations do **not** establish that B is better than A in lower-body phase: the frame sheets show the two candidates are already nearly the same in this test.

The late 8.500–8.875 s sheet is a residual-state check, not a causal proof. A and B are independently generated Flow renders, so any remaining footwear, garment silhouette or sub-frame pose differences can be stochastic. The defensible conclusion is that B is a cleaner candidate for isolating clothing-only editing and is compatible with same-source-time assembly; it is not a measured anatomical gait PASS.

## Main-agent visual review correction

The denser late sheet shows a raised rear foot in Seoul, A and B at source 8.575 s. The earlier statement that Seoul remained in contact while Tokyo had lifted was too strong based on the earlier coarse sheet. Differences in ankle angle, shoe shape and lift height remain visible, but these samples do not establish a contact-timing error or its magnitude. A and B look very similar in lower-body progression; the clear benefit of B here is the smaller upper-body/prop discontinuity, not demonstrated improvement in walking cadence.
