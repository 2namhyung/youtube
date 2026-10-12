# 경찰관 부친 휴대전화 사건 — Grok 모션 프롬프트 팩 v1

Status: `superseded-rejected-single-first-frame-contract`; preserved for history only. Use `research-6b1a8af9b4143acb.grok-multi-reference-prompt-pack-v2.md`. Its four-second completion and frozen-tail instructions are invalid and must not be executed.

## Research conclusion

xAI's official image-to-video guidance says the supplied still is the starting frame and the prompt should direct motion, camera movement, pacing and atmosphere while the model preserves the source image. xAI also recommends staging individual frames and chaining shots for visual consistency. Its API treats image-to-video and reference-to-video as mutually exclusive modes, so this pipeline first composes every approved recurring master into one immutable 1:1 scene frame, then submits that frame through image-to-video. Separate character reference images are not mixed into the same request.

The transferable image-to-video prompting rule is: let the image define composition, subjects, lighting and style; use the text almost entirely for subject motion, environmental motion, camera path, timing, direction and speed. Start simple, specify one primary action, and add only the constraints needed to prevent drift.

Primary references:

- xAI Grok Imagine 1.5: https://x.ai/news/grok-imagine-1-5
- xAI short-video prompting: https://x.ai/grok/use-cases/video-generation
- xAI video generation modes/configuration: https://docs.x.ai/developers/model-capabilities/video/generation
- Runway image-to-video motion-prompt guidance, used only as transferable prompting research: https://help.runwayml.com/hc/en-us/articles/48324313115155-Image-to-Video-Prompting-Guide

## Project prompt grammar

Each request concatenates the cut-specific prompt below with this shared lock:

> Square 1:1 image-to-video. Continue from the exact supplied first frame. Premium matte fibrous torn-paper editorial collage with layered paper edges and restrained beige, dark green, navy and burgundy. Smooth deliberate motion-graphic timing with believable paper weight. One primary action. Complete the meaningful action by second 4, then hold the final composition completely stable through second 6. Preserve the exact characters, blank faces, clothing, props, colors, lighting, layer order and square composition. Keep all critical action above the lower 13 percent of frame. No readable text, letters, numbers, logos, rank marks, new objects, extra people, facial features, lip movement, dialogue, object morphing, body duplication, photorealism, glossy 3D, camera orbit, sudden zoom, reversal or loop.

Recommended cadence translated from the local motion studies:

- enter: 0.00–0.60s, ease-out, at most 3% overshoot;
- reveal/draw: 0.60–1.40s, linear or gentle ease-in-out;
- emphasis: 1.40–2.10s, one 3–4% pulse or short camera push;
- settle: finish by 4.00s;
- stable editorial hold: 4.00–6.00s.

The prompts do not ask Grok to render factual typography. Dates, status, source, relationships and legal qualifiers are overlaid after semantic QA.

## Cut prompts

### Cut 01 — complaint and phone evidence

- Library translation: `document-marker-scan` + restrained source-card push.
- First frame: teacher seated at left side of anonymous desk; blank complaint sheet under her resting hand; intact phone at right; clear space between them for a connector; camera at medium-wide height.
- Grok prompt:

> The adult teacher slowly slides the blank paper document from left toward the intact phone and stops with her hand resting beside the document by second 1.2. The phone lifts only a few millimeters like a weighted paper token and settles. A translucent paper marker strip sweeps once across the document from top to bottom between seconds 1.2 and 1.8. The camera performs a very slow 2 percent push toward the phone, then stops. Her posture stays restrained and neutral. Hold the document and phone as the final focal pair.

- Post: exact complaint→phone connector; AI-reconstruction disclosure.

### Cut 02 — phone state changed, father linked

- Library translation: `before-after-divider-wipe`.
- First frame: father standing motionless behind evidence table; intact phone on left; broken-state phone concealed behind a vertical paper divider on right.
- Grok prompt:

> The father remains completely still with both hands visibly away from the table. A vertical paper divider moves smoothly from left to right between seconds 0.5 and 1.4, covering the intact phone and revealing the broken-state phone behind it. The broken phone settles with one restrained 3 percent scale pulse, then becomes still. Use a locked camera with only subtle paper-depth parallax. Never show contact between the father and either phone and never depict how the damage happened.

- Post: present/changed state labels; no breaking method.

### Cut 03 — anonymous Jeonju spatial context

- Library translation: `map-route-draw`.
- First frame: abstract paper map with generic Jeonju-region field, anonymous station block at upper right, rolled paper route strip at lower left; no people.
- Grok prompt:

> The layered paper map shifts with gentle parallax as the camera pans slowly from the wide regional field toward the anonymous station block. A narrow dark-green paper route strip unrolls from the lower-left origin to the station endpoint between seconds 0.6 and 1.8. The endpoint lifts once and settles with a soft 3 percent pulse. End on a stable medium map framing with the station block clearly separated from the lower safe area.

- Post: authoritative map dot, route and anonymous location label.

### Cut 04 — phone attempt noticed

- Library translation: human articulated action; no graphic pattern replaces it.
- First frame: son seated or standing at mid-left with phone low; teacher at mid-right facing classroom activity; sufficient negative space between them; classroom master unchanged.
- Grok prompt:

> The high-school son subtly raises and angles the phone toward the adult teacher in one restrained motion. The teacher notices the phone, turns her upper body away and takes one short step backward, finishing by second 2.5. The son stops immediately and lowers the phone slightly; do not repeat the motion. Use a slow 2 percent push-in that stops before second 3. Preserve the exact blank faces and clothing. Show no phone-screen content, no physical contact and no exaggerated reaction.

- Post: persistent AI-reconstruction disclosure only.

### Cut 05 — internal post and phone comparison

- Library translation: `document-marker-scan` with two-state paper reveal.
- First frame: father seated at records-office desk; blank keyboard-like paper surface; folded blank post card; intact/broken phone pair at right.
- Grok prompt:

> The father makes two restrained typing motions with both hands and stops by second 1.2. The folded blank post card opens upward like a paper file between seconds 1.0 and 1.8. A narrow marker strip travels once across the blank card, then the intact and broken phone tokens pivot slightly toward each other and settle into a side-by-side comparison. Use a locked three-quarter camera with a slow 2 percent push. Do not create an interface, words, a breaking action or any tool.

- Post: exact `26일 밤 내부망 글` and evidence highlight.

### Cut 06 — transfer to prosecution

- Library translation: `vertical-investigation-flow`.
- First frame: closed case folder at top-left police stack; lower-right prosecution stack; one recessed paper channel between them; no people.
- Grok prompt:

> The closed case folder lifts from the first stack, travels once along the recessed paper channel toward the second stack, and settles squarely on top by second 2.2. The channel reveals progressively beneath the folder as it moves, then stops glowing when the folder arrives. Camera stays overhead with a very slow 2 percent diagonal drift that stops at arrival. No hand, person, text or extra folder enters.

- Post: exact endpoint labels and arrow direction.

### Cut 07 — delayed discovery

- Library translation: `beat-timeline-rows`.
- First frame: folded horizontal paper timeline; first event node visible; second node hidden beneath a long empty folded section; no people.
- Grok prompt:

> The paper timeline unfolds from left to right at a steady linear pace. The first node lifts immediately, then the motion crosses a deliberately empty interval with no new marker. The hidden discovery node rises only near second 2.4 and settles with one soft pulse. Camera tracks the unfolding rail at constant speed and stops on the late node. Do not add clocks, dates, numbers or a measured duration.

- Post: narration-timed event markers only.

### Cut 08 — report, reform, audit

- Library translation: `stacked-panel-directional-wipe` + `vertical-investigation-flow`.
- First frame: investigator before three stacked blank panels and three small folder groups; panels partially concealed left-to-right.
- Grok prompt:

> The investigator places one anonymous folder into each of three positions from left to right. With each placement, the corresponding stacked paper panel wipes open in the same order: first panel, second panel, third panel. Use 0.35-second spacing between stages and a gentle 3 percent panel overshoot before settling. The investigator finishes the third placement by second 2.8 and becomes still. Camera makes a restrained lateral slide following the three stages, then locks.

- Post: exact causal labels `다른 경찰 가족 사건 보도 → 쇄신책 → 전수조사`.

### Cut 09 — late folder discovered

- Library translation: `audit-grid-population`.
- First frame: investigator before a nearly full grid of anonymous paper folders; one final folder recessed in the rear row.
- Grok prompt:

> The folder grid rises in a short ordered wave from front-left to back-right between seconds 0.3 and 1.2. The investigator scans the grid with one restrained head turn, reaches to the recessed final folder, pulls it straight forward and places it in the center foreground by second 2.6. The selected folder lifts once with a 4 percent emphasis and settles. Use a slow camera push toward the selected folder. No surprise expression, readable label or additional document appears.

- Post: A-inspector folder marker and late-discovery emphasis.

### Cut 10 — qualified rebuttal

- Library translation: `stacked-panel-directional-wipe`.
- First frame: father standing neutrally behind two offset blank paper cards; response card recessed behind confirmed-report card.
- Grok prompt:

> The father remains neutral and does not speak. The recessed response card slides horizontally from behind the front card, moves to a separate right-hand position and stops before touching the central divider by second 1.8. The front card remains fixed. Add one restrained 3 percent camera push toward the separated response card and hold. No mouth movement, gesture, quotation marks, text or emotional reaction.

- Post: persistent `A 경감 주장` qualifier and approved paraphrase.

### Cut 11 — evidence duty versus family breach

- Library translation: `before-after-divider-wipe` with diverging tracks.
- First frame: father centered; upright duty emblem behind left shoulder; intact phone track on right; two layered paper rails aligned beneath him.
- Grok prompt:

> The father stays completely still. The left evidence-duty rail remains straight and the upright emblem stays locked. The right family-linked phone rail gradually bends away, carrying the phone toward the broken-state endpoint between seconds 0.7 and 2.0. A paper divider rises between the two final tracks and settles with a small weighted bounce. Camera remains symmetrical and slowly pushes in 2 percent. Never show the father touching the phone.

- Post: exact duty/family labels.

### Cut 12 — colleagues and adult teacher

- Library translation: `constellation-network-build`.
- First frame: teacher at right; male and female colleague characters at left; neutral institution card behind; rolled paper connectors concealed under the floor layer.
- Grok prompt:

> The two colleague figures enter from the left with one short synchronized step and stop. The adult teacher enters from the right with one short step and stops at a clearly separate position. Thin paper connector strips grow from the institution card toward the colleagues and teacher in narration order, never touching their bodies. The camera slides gently from the colleagues to the teacher and ends with the teacher as the focal subject by second 2.8. No conversation, pointing, lip movement or dramatic reaction.

- Post: exact relationship lines and criticism caption.

### Cut 13 — booking status

- Library translation: `document-marker-scan` + status lock.
- First frame: father in rear plane; blank case card folded in foreground; small status tab recessed above card.
- Grok prompt:

> The father takes one restrained half-step backward and stops behind the blank case card. The case card unfolds upward between seconds 0.7 and 1.4. The small status tab slides straight down into a notch at the top of the card, locks with a 3 percent weighted bounce and becomes still by second 2.0. Camera is fixed and frontal. Do not show arrest, restraint, handcuffs, accusation text or guilt.

- Post: exact `입건` status tab.

### Cut 14 — home-search arrival

- Library translation: `map-route-draw` adapted to a doorway approach.
- First frame: anonymous home exterior/entry, two investigators at lower-left approach point, closed door centered; no search objects.
- Grok prompt:

> The two anonymous investigators walk together along one short straight approach toward the closed home door and stop outside it by second 2.4. A narrow paper route strip reveals beneath their path as they move and stops at the threshold. The door remains closed and no one reaches for it. Camera performs a slow forward dolly that stops with the investigators still outside. No forced entry, drawer, cabinet, box, seized item, weapon or resident appears.

- Post: exact `자택 압수수색` label and authority boundary.

### Cut 15 — investigation-interference inquiry

- Library translation: `vertical-investigation-flow` + open-node emphasis.
- First frame: investigator at a paper relationship board; three blank nodes, with final node outlined but empty; one loose card in investigator's hand.
- Grok prompt:

> The investigator places the loose blank card into the middle node. Paper connector strips reveal upward from allegation to verification in one continuous trace, then stop before fully closing the final outlined node. The investigator lowers the hand and becomes still by second 2.2. The unresolved final node makes one gentle 3 percent pulse and remains open. Camera performs a slow vertical rise following the connector and locks. Do not create a confirmed endpoint or new evidence.

- Post: exact `확인 중` qualifier.

### Cut 16 — reported family legal barrier

- Library translation: `legal-track-barrier`.
- First frame: father and son standing neutrally on opposite sides of a family token; punishment track extends behind token; barrier folded above track.
- Grok prompt:

> The father and son remain neutral and motionless. The family token moves slowly toward the punishment endpoint. A thick paper legal barrier lowers from above, stops the token, flexes backward 3 percent from the impact and locks upright by second 2.0. The token does not pass through and the barrier does not reopen. Camera stays centered with a restrained 2 percent push. No judge, courtroom, prison, verdict or punishment imagery appears.

- Post: persistent `경찰 설명상` and exact legal caption.

### Cut 17 — investigation versus punishment gap

- Library translation: `legal-track-barrier` + `before-after-divider-wipe`.
- First frame: two parallel paper tracks with equal starting markers; investigation track continuous, punishment track containing a concealed gap; no people.
- Grok prompt:

> Both track markers begin moving at the same steady speed. The upper investigation marker continues to the far endpoint. A vertical paper divider wipes across the lower punishment track and reveals a physical gap; the lower marker stops precisely at the gap while the upper marker finishes. Both markers settle by second 2.3 and remain still. Use a locked overhead camera with slight depth parallax. No courthouse, prison, gavel or outcome icon appears.

- Post: exact `입건·수사 가능` and `실제 처벌` labels.

### Cut 18 — return to public trust question

- Library translation: `return-rail`.
- First frame: male and female civilian viewers at lower foreground with backs/three-quarter backs; anonymous institution silhouette at upper center; phone and case-file tokens recessed on side rails.
- Grok prompt:

> The two civilian viewers take one short step into the foreground and stop facing the anonymous institution silhouette. At the same time, the phone and case-file tokens travel inward along two curved paper rails and stop before reaching the institution, leaving a clean unresolved negative space between them. The camera makes a slow 2 percent pullback, revealing the complete relationship, and becomes still by second 3. No person turns toward camera and no conclusion symbol, verdict or collapsing institution appears.

- Post: approved closing trust question and final hold.

## Semantic QA per cut

Independent QA checks the immutable first-frame hash, decoded first/last frames, 1:1 480x480 dimensions, six-second duration, expected action completed by four seconds, stable final hold, no reversal, character/master continuity, blank faces, one-action discipline, forbidden-object absence, and exact space reserved for deterministic overlays. Grok audio is discarded; approved owner narration remains the only voice authority.
