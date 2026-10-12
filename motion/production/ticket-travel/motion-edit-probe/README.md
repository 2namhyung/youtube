# Canonical walking video edit probe

## Latest outcome

After the user reported a successful retry, the main inspected the completed kimono edit in Flow History and downloaded it as `edit-kimono.mp4`. The earlier edit rejection is historical, not the current state. The exact edit prompt remains visible in History.

Both files were downloaded through the gallery context menu (720p original size). `comparison.mp4` places source on the left and edit on the right at matched timestamps, without retiming. Verification findings are recorded separately in `findings.md` when complete.

Date: 2026-09-05

Status: edit submitted, unverified. The source was successfully retried; the main observed Flow video is `b96890f4-9f04-4f33-9def-54303814b5c0` in project `a37f8501-9284-4599-bee5-bafd23699149`, a 4-second white-studio hanbok walk. Native Omni1.1Flash video edit was submitted with the existing `K2-tokyo-kimono.png` reference. The reference card and umbrella are present, but the edit prompt explicitly excludes them. The earlier failed source attempt is retained below as historical record, not a current blocker.

## Purpose

Test whether Flow native Omni video editing preserves a source walk while changing clothing. Do not infer success from endpoint images or a matching face. Card transitions are excluded from this first probe.

## Current source and edit attempt

Main observed Flow source video: `b96890f4-9f04-4f33-9def-54303814b5c0`, project `a37f8501-9284-4599-bee5-bafd23699149`. Duration: 4 seconds. Description: white studio, walking woman in hanbok.

Native Omni1.1Flash video edit: completed following user retry; downloaded for verification. Existing outfit reference: `K2-tokyo-kimono.png`.

Exact submitted prompt:

```text
Change only the woman’s clothing throughout this source video to the pale pink floral kimono and obi shown in the supplied reference image. Preserve the source video’s exact walking motion, alternating foot-contact timing, arm motion, body proportions, face, short hair, screen position and apparent size. Keep the original white studio background, camera and lighting unchanged. Use the reference only for the kimono fabric and garment design; do not add its boarding pass, text, border, umbrella or hairstyle. Keep the original handheld item and its motion. The kimono is already worn from the first frame to the last: no transformation, no transition and no cut. Keep everything else the same.
```

## Historical failed attempt

An earlier source generation was rejected by Flow's celebrity-generation policy check; wardrobe edit and verification were not performed for that attempt. Flow media: `cfb90b2a-f908-446b-836f-c4da31e9197e`. Existing uploaded ImageGen asset: `01-seoul-hanbok.png`. Flow displayed: `이 프롬프트는 유명인의 동영상 생성에 관한 Google 정책을 위반할 가능성이 있습니다.` The UI explicitly said this generation was not charged. This message does not establish that the fictional ImageGen character is an actual celebrity; the cause of the classification is unverified.

Historical exact submitted prompt:

```text
A single continuous 4-second full-body fashion editorial shot of this exact woman in this exact hanbok. She walks in place with a relaxed, regular natural walking cycle throughout, alternating foot contacts and gentle arm swing. Keep her centered at the same screen position and the same apparent body size. Maintain the starting three-quarter body orientation. Locked-off camera, no pan, zoom or dolly. Infinite white studio background with a soft natural contact shadow. Preserve her face, hair, body proportions and outfit. No cards, no text, no transitions, no wardrobe change, no freeze or pause.
```

## Planned comparison

Edit the actual generated video, not a pair of extracted stills. Add an existing ImageGen outfit reference, asking for clothing only. Compare source and edit at matched timestamps: foot contact, pelvis/head position, orientation, apparent body scale, background and silhouette artifacts. Strict prompt wording is not a guaranteed constraint.

Do not add Characters during this isolated test: changing both identity conditioning and edit mode would confound the comparison. No template or compositor changes are part of this probe.
