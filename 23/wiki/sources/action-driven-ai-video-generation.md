# Action-driven AI video generation

- Verified: 2026-08-25
- Status: reviewed
- Scope: fictional explanatory scenes generated with imagegen and Google Flow/Gemini Omni/Veo, then assembled in Remotion

## Official-source findings

### One focused action per generated clip

Google's current best-practices page says a short-video prompt should cover one focused moment. Chaining distinct events such as `A then B then C` in one short prompt often produces incomplete or muddled results; Google recommends generating each event as a separate clip. Source: [Google video-generation best practices — Focus short videos on a single scene](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/best-practice#focus_short_videos_on_a_single_scene), verified 2026-08-25.

Veo and Gemini Omni prompts treat action as the video's verb: movement, interaction, reaction, or a small process. A prompt can sequence closely connected micro-actions inside one moment, but the model still needs a concrete subject, action, scene and camera rather than an abstract explanation. Source: [Google video-generation prompt guide — Action](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/video-gen-prompt-guide#action), verified 2026-08-25.

### Image-to-video prompts describe motion, not the picture again

Google treats the input image as the basis for character detail, lighting and style. For image-to-video it recommends a sharp, well-composed source frame and a motion prompt that concentrates on camera movement, subject animation and environmental change. Re-describing the person, room and lighting already visible in the image can confuse the generation. Source: [Google video-generation best practices — Image-to-video](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/best-practice#image-to-video), verified 2026-08-25.

### Start/end frames and ingredients preserve a planned state change

Google Flow can animate a start frame or generate between a supplied start and end frame; its prompt should describe the action or transition between them. Flow ingredients can carry the same character and key objects between clips, and Google recommends clean references with a consistent look. Source: [Google Flow — Create videos](https://support.google.com/flow/answer/16353334), verified 2026-08-25.

Flow can save a generated video's paused frame as an image and reuse it as an ingredient, a new start frame or an end frame. Its Scenebuilder can then arrange, trim and preview multiple clips. Source: [Google Flow — Edit videos and build scenes](https://support.google.com/labs/answer/16935718), verified 2026-08-25.

Feature availability is model- and region-dependent. Gemini Omni Flash is Google's default general video-generation recommendation, while Veo 3.1 is the route when last-frame control or scene extension is required. Source: [Gemini API video-generation overview](https://ai.google.dev/gemini-api/docs/video), [Google Flow models and supported features](https://support.google.com/flow/answer/16352836), verified 2026-08-25.

### Reuse image references instead of independently redrawing every shot

OpenAI's image-generation guide supports multi-turn editing and one or more reference images. GPT Image 2 processes reference inputs at high fidelity. For this project, using a locked character/location/prop reference pack and deriving later action frames through reference-based edits is therefore preferred over unrelated from-scratch generations. The preference is a 23jung production inference; the tool capabilities are documented by OpenAI. Source: [OpenAI image generation — multi-turn and reference-image workflows](https://developers.openai.com/api/docs/guides/image-generation), verified 2026-08-25.

### Remotion is the assembly layer

Remotion `Sequence` places a clip at an exact frame range. `TransitionSeries` overlaps adjacent scenes during a transition and shortens the total duration by the transition length, so the final timeline must account for overlap. Source: [Remotion Sequence](https://www.remotion.dev/docs/sequence), [Remotion TransitionSeries](https://www.remotion.dev/docs/transitions/transitionseries), verified 2026-08-25.

## 23jung production synthesis

The following is an internal production rule derived from the verified capabilities above, not a claim made by the tool providers.

### Silent-action rule

- An AI-generated story clip does not receive explanatory captions, keyword boxes, callouts, arrows, floating labels or a narrator-like UI layer.
- Do not ask the image or video model to render captions, subtitles, logos or readable interface copy. A phone may show symbolic UI states such as a product thumbnail, a call button, a failed-call icon or a greyed-out contact, but the story must not depend on generated text being legible.
- The story is understood through `goal → action → visible result → reaction → failed recovery`.
- AI provenance is kept in the asset record. A necessary audience disclosure is placed outside the uninterrupted action plate—for example in the preceding transition, episode credit card or publication description—rather than used to explain the scene.

### Generation unit

One story can contain several AI clips, but one AI clip contains only one focused causal action. Each action unit has:

1. a locked start state;
2. one primary subject action;
3. at most one directly connected reaction;
4. a visible end state that can be checked without narration;
5. a motion-only prompt;
6. a negative list for captions, subtitles, readable text, logos, watermarks, identity change, wardrobe change, new objects, malformed hands and unintended cuts.

Use an explicit end frame only when the exact final state matters, such as the wrong object being visible inside a parcel or a contact becoming unavailable. Otherwise generate from the start frame, review the result, and save an approved final frame for the next clip.

### Continuity pack before action frames

Create and lock these references before generating the story clips:

- anonymous adult character reference, including unchanged clothes and carried objects;
- apartment entryway and dining-table spatial reference;
- generic phone reference with non-readable symbolic UI;
- parcel exterior, parcel interior and wrong-item references;
- lighting, lens, color and texture reference.

Each later imagegen frame is an edit or referenced derivative of this pack. Only the action, pose, camera position and required prop state change.

### Prompt record

For every action clip preserve:

```text
action_id
story_state_before
story_state_after
start_frame
end_frame (optional)
ingredient/reference images
motion_prompt
negative_prompt
tool/model/date
generated video
approved first/last frame
QC result
```

## SH001 researched action plan

The fictional used-laptop incident should be a five-action visual sequence. It must not display explanatory phrases such as `사기`, `판매자 잠적` or `누가 다시 확인하지?` over the AI footage.

| Action unit | Approx. screen time | Visible action | Required end state | Imagegen requirement |
|---|---:|---|---|---|
| A01 transaction | 3–4s | At a table, the person sees a laptop product image on a generic phone, confirms payment with a thumb, then puts the phone down | phone rests beside an empty place on the table | start frame; optional payment-confirmed end frame |
| A02 delivery | 3–4s | Doorbell reaction, door opens, parcel is lifted from the doorstep and carried inside | parcel is in the person's hands inside the doorway | doorway start frame; final frame may be saved from approved video |
| A03 opening | 3–4s | Parcel is set on the same table, tape is cut, and both flaps are pulled open | open parcel fills the lower center of frame | start and end frames recommended |
| A04 wrong item | 3–4s | The person reaches in, removes an unrelated cheap object and checks the otherwise empty box | wrong object, empty box and frozen hand reaction are all visible | start and end frames required |
| A05 blocked recovery | 4–5s | The person attempts a call, retries, sees the contact become unavailable, lowers the phone and looks between it and the box | dark/grey phone, open box and helpless body posture | start and end frames recommended |

This plan requires at least five approved imagegen start frames. Add two or three separate end frames where the final physical state must be exact. The previous single 18-second Omni plate is not production-approved because it compresses the incident into one tableau and relies on explanatory overlays.

## Uncertainty and review gate

- The signed-in Flow account's available models, lengths, credits and first-plus-last-frame support must be checked at generation time because Google marks feature availability as model- and region-dependent.
- Generated phone interfaces can invent glyphs or pseudo-text. Any clip whose meaning depends on reading that content fails QC.
- Character/prop continuity remains probabilistic even with references and seed reuse. Every clip needs first-frame, midpoint and final-frame visual review before Remotion assembly.

## Related

- [[ai-visual-production-tools]]
- [[../syntheses/remotion-vox-production-playbook-v0.1]]
- [[../syntheses/supplementary-investigation-first-video-v0.1]]
