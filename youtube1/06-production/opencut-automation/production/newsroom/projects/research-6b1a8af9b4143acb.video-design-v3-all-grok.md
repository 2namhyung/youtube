# 경찰관 부친 휴대전화 사건 — 전 컷 Grok 설계 v3

Status: `superseded-by-video-design-v4-all-grok-human-presence`; not creator/verifier sealed; no provider/render/upload/publication authority.

This draft is retained as decision history. v4 increases recurring human presence while preserving the all-Grok base-video decision.

## Production decision

- All 18 cuts use `image_to_video_animation` as the base moving image.
- Each Grok input is a 1:1 paper-cut scene assembled from approved common masters. The requested output is 480x480, 6 seconds; the meaningful visual change completes by 4 seconds and the remaining time settles into a stable hold. Editorial assembly trims each clip to its narration slot.
- Grok may animate people, paper objects, documents, maps, diagrams, timelines and abstract legal structures. It must preserve the faceless matte fibrous paper-cut world and may not add readable text, logos, identities or unsupported evidence.
- FFmpeg is the final encode/mux/QC boundary. GSAP/D3/Lottie/Motion Canvas may add restrained overlays only when useful: exact relationship lines, path highlights, masks, state markers and timing accents.
- Approved title, captions, dates, legal qualifiers, source/claim labels and all other readable Korean text are deterministic post-production tracks, never generated inside Grok pixels.
- Final canvas remains 1080x1920/24fps; Grok media is fitted without stretch into x54,y474,w972,h972. Title is x540,y201/326; captions are x540,y1400. Critical scene content stays above media-local y846.

## Common masters

The v31 candidate set is at `out/prototypes/research-6b1a8af9b4143acb-v31-paper-master-candidates/`. It contains four faceless characters, three 1:1 environments, a phone-state pair and an abstract document pack. It is `human-review-pending`; no Grok call may consume it until a creator/verifier-backed successor records explicit human approval and exact hashes.

## 18 Grok cuts and deterministic reinforcement

| Cut | Slot | Grok scene/action | Why Grok | Deterministic reinforcement | News added beyond narration |
|---|---:|---|---|---|---|
| 01 | 0.000–3.000 | Complaint document slides onto a paper desk; intact phone rotates slightly into the evidence position; camera makes a short push. | Establishes the paper world with real depth and object settling. | Complaint→phone connector and emphasis pulse. | None. |
| 02 | 3.000–6.000 | Static father figure remains behind the table while the phone moves from an available position to an empty/broken-state position. No hand touches it. | Gives the evidence-state change physical weight without inventing the breaking act. | Present→changed state markers. | None. |
| 03 | 6.000–9.000 | Layered paper map pushes from Jeonju region to one anonymous station node; a static A-inspector role token settles beside it. | Grok supplies paper parallax and camera travel. | Exact map dot, anonymous-location label and route line. | None. |
| 04 | 9.000–13.000 | In the classroom, the son subtly raises/angles the phone; the adult teacher notices, turns away and steps back. One action, no screen detail. | Human pose, gaze direction and occlusion are central. | `AI 재구성` disclosure only; no extra action overlay. | None. |
| 05 | 13.000–16.500 | Internal-post card unfolds in the records office; intact and broken phone states pivot into comparison. No breaking method or tool. | Paper document opening and phone-state transition benefit from physical motion. | Exact label `26일 밤 내부망 글`; document highlight. | Verified post timing on the night of the 26th. |
| 06 | 16.500–19.000 | Case folder travels from a police-side stack to a prosecution-side stack and settles. No human handoff. | A tangible file journey reads faster than a static arrow. | Exact endpoint labels and one directional arrow. | None. |
| 07 | 19.000–22.000 | Paper timeline extends; the second node stays hidden through an empty interval, then appears late. | Grok gives the interval and delayed reveal natural paper motion. | Timeline ticks; no invented numeric duration. | None. |
| 08 | 22.000–26.000 | Three paper panels enter sequentially: earlier misconduct reporting, leadership reform, family-linked case audit. | Turns omitted background into a short causal visual story. | Exact three-stage labels and arrows. | Verified causal background: earlier report→reform→audit. |
| 09 | 26.000–29.000 | An audit wall fills with anonymous folders; the A-inspector folder arrives last and lifts forward. | Folder population and late discovery gain clear temporal progression. | Audit scope label and final-folder marker. | None; returns to narrated discovery. |
| 10 | 29.000–32.000 | A separate response card slides from behind the father token and stops before a comparison divider. | Gives the rebuttal its own visual beat without mixing it with confirmed facts. | Persistent `A 경감 주장` qualifier and accurate paraphrase. | Verified claim that comparison with the earlier case was unfair/unjust. |
| 11 | 32.000–35.000 | Evidence-duty emblem remains upright while the family-linked phone track bends away toward the broken state. | Physical track divergence emphasizes the institutional conflict. | Duty/family track labels and endpoint lock. | None. |
| 12 | 35.000–38.500 | Static colleague, teacher and institution tokens appear one by one; camera lands on the adult teacher token. No body articulation. | Grok gives the relationship board depth and emotional pacing. | Exact relationship lines; criticism text stays in captions. | None. |
| 13 | 38.500–41.000 | A blank case card opens; the father token shifts behind it as a status tab locks into place. | Paper-layer occlusion makes the booking status visually decisive. | Exact `입건` tab; no guilt/outcome wording. | None. |
| 14 | 41.000–44.000 | Anonymous home doorway moves into view; a plain authority document crosses the threshold and rests. No person searches, no drawer opens, no object is seized. | Camera movement communicates location while avoiding fabricated procedure. | `자택 압수수색` label and abstract boundary line. | None. |
| 15 | 44.000–47.000 | Investigation nodes unfold from allegation to verification; the final node remains open and gently oscillates before hold. | Grok makes unresolved inquiry visually distinct from a completed finding. | Exact `확인 중` qualifier and connector path. | None. |
| 16 | 47.000–50.000 | A family relationship token travels toward a paper legal barrier and stops; the barrier flexes but does not open. | Physical obstruction makes the reported exception intuitive. | Persistent `경찰 설명상`; exact legal caption outside media. | None. |
| 17 | 50.000–53.000 | Two paper tracks advance together; investigation continues while punishment track stops at a visible gap. | Gives an abstract legal distinction a memorable state change. | Exact `입건·수사 가능` / `실제 처벌` labels and divider. | None. |
| 18 | 53.000–55.016 | Phone, case file and institution nodes return toward the viewer; motion stops before a question-shaped negative space. | Creates a closing return without asserting a factual trust loss. | Final trust question in approved title/caption typography. | None; remains an inference/question. |

## Grok prompt invariants for every cut

1. `1:1 square, 480x480, 6 seconds, meaningful action complete by 4 seconds, stable hold afterward`.
2. `premium matte fibrous torn-paper collage, layered paper edges, restrained beige/dark-green/navy/burgundy palette`.
3. Bind exact approved master image IDs/bytes; do not redesign recurring characters, environments or props.
4. Smooth blank faces; no eyes, nose, mouth, eyebrows or facial lines.
5. No readable text, logos, insignia, exact police station, address, broadcast footage, article screenshot or branded UI.
6. No invented phone-breaking method, search method, seized object, guilt finding or legal outcome.
7. One primary action only; no reversal; no new people or props; no camera crop that hides the action.
8. The first frame must match the immutable ImageGen scene frame. Separate generator and semantic QA must verify first/last frames, dimensions, duration and intended visible change.
