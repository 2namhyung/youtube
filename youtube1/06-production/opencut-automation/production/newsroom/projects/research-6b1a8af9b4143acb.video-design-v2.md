# 경찰관 부친 휴대전화 사건 — 직접 작성 컷 설계 v2

Status: `superseded-by-video-design-v3-all-grok`; not creator/verifier sealed; no provider or render authority.

This review draft is retained only as decision history. The user subsequently directed that every cut use Grok video generation and that deterministic tools be limited to post-production reinforcement.

Authority basis: approved title `[단독] "아들이 여교사 상대로"…'경찰관 부친' 또 걸렸다`, approved two-line video headline `경찰 아버지가 / 부순 휴대전화`, approved owner narration duration `55.016s`, `paper-cut-keyframe-v1`, authoritative evidence bundle plus separately bound supplemental visual claims.

## Mode decision

- `image_to_video_animation`: 1 cut (`cut-004`). The meaning depends on articulated human action and occlusion: the son raises/angles a phone, the adult teacher notices it and recoils. ImageGen supplies the immutable 1:1 first frame; Grok produces 480x480/6s, with the meaningful action complete by 4s and a stable hold afterward.
- `deterministic_motion_graphics`: 17 cuts. Documents, phone states, maps, timelines, audit grids, relationship lines, legal barriers and non-articulated paper layers communicate these facts more precisely than reenactment.
- All-Grok was rejected for this design: booking, home search, evidence removal and internal-post scenes would otherwise invite invented gestures, tools, seized objects or exact workplace detail.

## Supplemental visual news

The video may add one separately bound, verified visual claim per screen without replacing narration:

1. `claim-09db7f2c5fa8`: the internal-network post was uploaded on the night of the 26th.
2. `claim-6ef4504d0361`: reporting on another police-family misconduct allegation led police leadership to announce reform and audit family-linked cases, through which this case was found.
3. `claim-c70549eed18d`: A inspector claimed comparison with the earlier case was unfair/unjust. The on-screen qualifier must read `A 경감 주장` and this may never be presented as an established fact.

## 18-cut plan

Every media scene is 1:1. The final canvas is 1080x1920/24fps; media is x54,y474,w972,h972; title is x540,y201/326; captions are x540,y1400. Critical media content stays above media-local y846.

| Cut | Time | Mode | Scene and state change | Narration function / added news | Masters |
|---|---:|---|---|---|---|
| 01 | 0.000–3.000 | MG | A blank complaint document enters left; an intact phone token enters right; a marker line connects complaint→core evidence. End state locks the phone as the focal object. | Makes the opening complaint/evidence relationship immediately legible. No supplemental claim. | teacher role color, phone pair, document pack |
| 02 | 3.000–6.000 | MG | Static father role token appears behind a relationship hub; phone state wipes from `present` to `absent/broken`. No hand, tool or breaking gesture. | Explains that the evidence change is linked to the police father, not the student. | police father static token, phone pair |
| 03 | 6.000–9.000 | MG | Abstract Jeonju map field reveals one anonymous station node, then an `A 경감` role card. No precise address or building likeness. | Establishes place and role before the incident detail. | map/grid paper elements, police father static token |
| 04 | 9.000–13.000 | **Grok** | Classroom wide: the faceless son subtly raises/angles a phone; the faceless adult teacher notices, turns away and steps back. One action only; no screen contents or sensational reaction. | The only beat whose meaning requires human pose, gaze direction and occlusion. AI reconstruction disclosure required. | son, teacher, classroom |
| 05 | 13.000–16.500 | MG | An internal-post document slides open; a date tab reveals `26일 밤`; intact and broken phone tokens compare without showing how the damage happened. | Adds omitted verified news: the post timing. Bound to `claim-09db7f2c5fa8`. | records office, phone pair, document pack |
| 06 | 16.500–19.000 | MG | A case-file token moves once from police node to prosecution node along a trimmed arrow and settles. | Simplifies “son transferred to prosecution” into one clear handoff. | document pack, connector/arrow |
| 07 | 19.000–22.000 | MG | Two timeline nodes are separated by an intentionally empty interval; the discovery node remains dim. | Visualizes “not found immediately” without inventing an exact elapsed period. | timeline rail, state marker |
| 08 | 22.000–26.000 | MG | Three-stage causal flow: `다른 경찰 가족 사건 보도` → `쇄신책` → `가족 연루 사건 전수조사`. Each stage appears in narration order. | Adds the verified reason the audit existed. Bound only to `claim-6ef4504d0361`. | document pack, audit folders, flow connectors |
| 09 | 26.000–29.000 | MG | Audit folders populate a grid; one anonymous A-inspector folder appears late and pulses once. | Returns from the supplemental context to the narrated fact that this case was found later. | audit folders, police father static token |
| 10 | 29.000–32.000 | MG | A separate response card unfolds with a persistent qualifier chip `A 경감 주장`; a comparison divider stops short of the “confirmed” side. | Adds the omitted rebuttal that comparison was unfair/unjust, as a claim rather than fact. Bound to `claim-c70549eed18d`. | police father static token, document card, qualifier chip |
| 11 | 32.000–35.000 | MG | Split comparison: evidence-preservation duty track remains intact; family-case phone track ends in the broken/absent state. | Makes the core institutional conflict easier to understand without repeating the breaking scene. | phone pair, duty shield/token, divider |
| 12 | 35.000–38.500 | MG | Three static role cards—colleagues, adult female teacher, institution—connect in sequence; the teacher card becomes focal while the criticism paraphrase is rendered in the caption track. | Keeps the victim visible as an adult teacher and explains why colleagues criticized the act. | teacher static token, neutral colleague tokens, relationship lines |
| 13 | 38.500–41.000 | MG | A blank case card receives an `입건` status tab; father role token remains static and anonymous. | Communicates legal status, not guilt or outcome. | police father static token, document pack, status tab |
| 14 | 41.000–44.000 | MG | Anonymous home plate appears; a search-authority document crosses the threshold and locks. No investigator body, drawer, box or seized object moves. | Shows the confirmed home search while avoiding invented search methods and evidence. | home, abstract document card |
| 15 | 44.000–47.000 | MG | An open investigation flow reveals allegation→verification nodes, leaving the final node outlined and unresolved. | Clarifies that interference is being checked, not established. | investigator static token, flow nodes/connectors |
| 16 | 47.000–50.000 | MG | Family relationship token reaches a legal barrier and stops; qualifier `경찰 설명상` remains visible for the entire cut. | Explains the reported direct-relative punishment exception without presenting it as settled independent legal advice. | relationship tokens, legal barrier |
| 17 | 50.000–53.000 | MG | Two parallel tracks advance together: `입건·수사 가능` continues; `실제 처벌` stops at a gap. | Converts the legal explanation into the central investigation-versus-punishment distinction. | track pair, divider/barrier |
| 18 | 53.000–55.016 | MG | The phone, case file and institution nodes return on a rail; the rail stops before the viewer-facing question marker and holds. | Ends on the narrated trust question. It is an inference/question, never a factual claim that trust has already been lost. | phone pair, document pack, institution token |

## Common-master decision

The currently approved v29 master manifest remains the only production authority. A visually stronger v31 candidate set was created first at `out/prototypes/research-6b1a8af9b4143acb-v31-paper-master-candidates/`; it contains four corrected faceless characters, three square environments and two isolated prop packs. Its exact candidate hashes are listed in that directory's `README.md`.

The v31 set is deliberately `human-review-pending`. No cut-specific ImageGen frame, Grok generation, motion-graphics element generation, render, upload or Stage 07 step may consume it until a successor creator/verifier admission records explicit human approval and exact bytes.
