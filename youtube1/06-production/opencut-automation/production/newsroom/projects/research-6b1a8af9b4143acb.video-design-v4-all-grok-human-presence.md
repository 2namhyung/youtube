# 경찰관 부친 휴대전화 사건 — 전 컷 Grok·인물 중심 설계 v4

Status: `design-and-assets-production-approved-provider-ready-private-only`; supersedes v3. Private Grok provider input is authorized; render/upload/publication/Stage 07 remain unauthorized.

Supersession note (2026-08-14): the multi-reference contract in `research-6b1a8af9b4143acb.grok-multi-reference-prompt-pack-v2.md` overrides every later mention of a cut-specific first frame, four-second completion, frozen tail, or playback from zero. The 13 common masters and 51 cut reference elements completed technical/visual QA, explicit human approval and append-only private production admission. The active next gate is 2-7 image Grok upload → independent semantic-QA in/out selection. FFmpeg trim and final assembly remain separately gated.

Execution prompts, individual ImageGen reference packs and motion-library translations are specified in `research-6b1a8af9b4143acb.grok-multi-reference-prompt-pack-v2.md`. The v1 single-first-frame prompt pack is superseded.

## Decision

- All 18 cuts use Grok for the base moving image.
- Fourteen cuts contain recurring paper people; four cuts remain object/diagram-only because a person would distract from the information.
- Human scenes use only the v32 common masters and carry `사건 내용 기반 AI 재구성`. No generated character is an actual likeness.
- Grok receives 2-7 individually generated 1:1 reference images and produces 1:1, 480x480, six-second source clips. Semantic QA selects the best continuous narration-fitting in/out window; there is no four-second completion or frozen-tail requirement. FFmpeg trims at 1x, fits the selected clip without stretch into the 972x972 media square, and owns final encode, narration mux, title and captions.
- Exact Korean text, dates, source/status labels, legal qualifiers, relationship lines and other evidence-critical graphics are deterministic overlays. Grok must not generate readable text.

## Human-presence balance

- Human-present cuts: 01, 02, 04, 05, 08, 09, 10, 11, 12, 13, 14, 15, 16, 18 (`14/18`).
- Object/diagram-only cuts: 03, 06, 07, 17 (`4/18`).
- Evidence-grounded reenacted actions: complaint setup, phone-attempt detection, internal-post writing, audit handling, home-search arrival.
- Editorial explanatory actions: folder discovery, response-card presentation, relationship-board review, legal-barrier staging and public-view return. These are explicitly reconstruction, not claims that the exact action occurred on camera.

## Cut-by-cut scene design

| Cut | Slot | Grok scene | Person/action boundary | Post-production and added news |
|---|---:|---|---|---|
| 01 | 0.000–3.000 | Teacher sits at an anonymous desk and places a blank complaint document beside the intact phone; camera pushes toward the phone. | Teacher action represents the verified complaint at a high level; no clerk or exact filing procedure. | Complaint→phone connector. No supplemental claim. |
| 02 | 3.000–6.000 | Father stands behind an evidence table while the phone moves from intact to broken/absent state; his hands remain away from it. | Human presence identifies the relationship, but no breaking or concealment action is shown. | State labels only. |
| 03 | 6.000–9.000 | Human-free layered Jeonju map moves to one anonymous station exterior. | A person would add no factual value. | Exact anonymous map dot and location label. |
| 04 | 9.000–13.000 | Son subtly raises/angles the phone; teacher notices, turns away and steps back. | One evidence-grounded articulated action; no phone-screen content or sensational reaction. | AI-reconstruction disclosure. |
| 05 | 13.000–16.500 | Father sits in the records office and types briefly; a blank internal-post card unfolds while intact/broken phone states appear beside him. | Represents the verified act of posting, not exact keystrokes, interface or wording. | `26일 밤 내부망 글`; adds verified post timing. |
| 06 | 16.500–19.000 | Human-free case folder travels from police-side stack to prosecution-side stack. | Avoids an invented human handoff. | Exact endpoints and arrow. |
| 07 | 19.000–22.000 | Human-free timeline extends through an empty interval; discovery node appears late. | Keeps the delay factual and avoids a fictional investigator reaction. | No numeric duration invented. |
| 08 | 22.000–26.000 | Investigator sorts anonymous family-case folders while three background panels appear in order. | Symbolic audit work; no claim about actual room or personnel. | `다른 경찰 가족 사건 보도→쇄신책→전수조사`; adds verified causal background. |
| 09 | 26.000–29.000 | Investigator pulls one A-inspector folder from a populated audit wall and brings it to the foreground. | Editorial representation of discovery, not literal footage. | Late-discovery marker. |
| 10 | 29.000–32.000 | Father stands neutrally as a response card slides forward; he does not speak or emote. | Presence identifies whose position is being summarized without lip-sync or invented quote. | Persistent `A 경감 주장`; adds qualified unfair-comparison rebuttal. |
| 11 | 32.000–35.000 | Father remains between an upright evidence-duty emblem and the diverging broken-phone track; the tracks move around him. | No new human act; the person anchors the institutional conflict. | Duty/family labels and endpoint lock. |
| 12 | 35.000–38.500 | Male and female colleague masters enter one side; teacher enters the other; camera settles on the teacher. | No invented conversation or pointing. Presence visualizes the narrated criticism and victim perspective. | Relationship lines; exact criticism stays in captions. |
| 13 | 38.500–41.000 | Father takes one restrained step behind a blank case card; an `입건` tab locks over the card. | Status visualization only; no arrest, handcuffs or guilt implication. | Exact `입건` label. |
| 14 | 41.000–44.000 | Two anonymous investigator/colleague figures walk toward the exterior side of the home door and stop before entry. | Shows arrival only. No forced entry, drawers, seizure or evidence object. | `자택 압수수색`; abstract authority boundary. |
| 15 | 44.000–47.000 | Investigator stands at a relationship board and moves one blank card into an unresolved branch; final node stays open. | Symbolic verification work, not a claim about an actual board or discovered link. | Persistent `확인 중` qualifier. |
| 16 | 47.000–50.000 | Father and son stand on opposite sides of a family token as a paper legal barrier lowers between the token and punishment endpoint. | Figures remain neutral; barrier carries the meaning. | Persistent `경찰 설명상`; exact legal caption. |
| 17 | 50.000–53.000 | Human-free investigation and punishment tracks advance together; punishment stops at a gap. | Diagram is clearer than another character scene. | Exact track labels and divider. |
| 18 | 53.000–55.016 | Male and female civilian viewers step into the foreground with backs/three-quarter backs to camera, facing an anonymous institution silhouette; motion stops before the final question. | Anonymous public viewpoint only, not actual witnesses. | Approved trust question in deterministic title/caption typography. |

## Shared Grok prohibitions

No generated cut may add a face, likeness, logo, rank, exact station, address, readable in-scene text, phone interface, breaking method/tool, evidence-concealment act, seized item, search procedure, arrest, handcuffs, guilt finding or legal outcome. No action reverses. No new character or prop may appear beyond the bound v32 masters and cut-specific approved scene elements.

## Next gate

The exact v32 common masters and 51 information elements are admitted under `research-6b1a8af9b4143acb-v32-grok-reference-assets-production-v1` (`production.approved=true`, `privateOnly=true`, `public=false`). Each cut must now use its creator/verifier-bound ordered 2-7 image request, then one private Grok generation and independent semantic QA. A failed semantic result is regenerated rather than hidden by trimming.
