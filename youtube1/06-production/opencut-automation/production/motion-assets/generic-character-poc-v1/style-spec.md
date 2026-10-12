# generic-character-poc-v1 style specification

Status: `human-approved-master-v1 / PoC-only`

This specification does not authorize ImageGen, rendering, provider calls, upload, or publication. It defines the first reusable character master candidate only.

## Identity invariant

- `characterId`: `generic-anonymous-adult-01`
- Anonymous Korean adult, apparent age 30–45.
- Neutral civilian with no police, medical, school, company, or government affiliation.
- Must not resemble a real person or a known reference character.
- Original educational editorial cartoon; serious documentary tone with clearly simplified proportions and expressive motion-readable forms.

## Shape and wardrobe invariant

- Body proportion: approximately `1:4.5` heads, tolerance `±0.25`.
- Hair: short dark-brown hair rendered as one chunky silhouette with no more than three interior strokes.
- Face: tiny vertical-oval eyes, short brows, one-line angular nose, one-line mouth, no realistic modeling or distinctive marks.
- Hands: intentionally oversized and simplified for readable action; arms are long, thin, slightly curved graphic forms.
- Outer garment: collarless muted-navy overshirt with two simple front panels.
- Inner garment: off-white crew-neck shirt.
- Bottom: charcoal straight trousers and charcoal shoes.
- No logos, badges, readable text, jewelry, uniform cues, props, or environment.

## Rendering invariant

- Current approved PoC canvas: `1024x1536`. A later production master should target at least `1536x2048`, but an upscale or regeneration requires separate approval and may not silently replace the approved bytes.
- Full body with at least 8% clear margin on every side.
- View: 3/4 view, approximately 20 degrees from front.
- Pose: relaxed standing; arms separated from torso, legs separated, both hands and both feet fully visible.
- Outline: irregular black ink line with visible thickness variation and slight hand-drawn wobble.
- Shading: flat matte fills; at most one simple graphic shadow per major form.
- Only minimal paint variation inside fills; no gradient, modeled lighting, depth of field, rim light, or cast shadow.
- Background: flat chroma `#FF00C8`; no background objects.

## Palette invariant

| Role | Color |
|---|---|
| outline | `#202A36` |
| hair | `#332B2A` |
| skin | `#C98F6B` |
| skin shadow | `#A96F52` |
| overshirt | `#34495E` |
| undershirt | `#E8E0D3` |
| trousers | `#4A4E55` |
| shoes | `#282C31` |
| chroma background | `#FF00C8` |

## Prompt block order

Every master or derivative request must serialize the following blocks in order:

1. purpose
2. subject identity
3. illustration style
4. pose and camera
5. exact palette
6. background
7. invariants to preserve
8. prohibited content

## Planned derivatives

Each derivative must use the approved master image as its only character image input and change one target at a time.

- `side-view-v1`: change only the view to a clean side profile; preserve identity, proportions, wardrobe, palette, line weight, expression, and scale.
- `reach-right-v1`: change only the right arm into a forward reaching pose and allow at most 10 degrees of torso rotation; add no prop.
- `concerned-expression-v1`: change only eyebrows, eyes, and mouth to a restrained concerned expression; preserve head shape, hair, pose, and every non-face pixel as closely as possible.

## Approved master

- File: `master-approved-v1.png`
- Source candidate: `master-candidate-05-ted-ed-grammar.png`
- SHA-256: `4f7717edcdda6eab8abcd6314056f98176b68e360a45a585cb83b25d7e859a56`
- Bytes: `1481857`
- Dimensions: `1024x1536`
- Approval: explicit user approval in the active task on 2026-08-12.
- Generation path: built-in `image_gen`; an exact model snapshot identifier is not exposed by this path, so this PoC cannot be promoted into Canonical authority without a later creator/verifier-compatible generation record.
- Candidates 01–04 are rejected visual-history artifacts and must never be used as derivative anchors.

## One-page model sheet

- File: `character-model-sheet-v1.png`
- SHA-256: `3c78b9842ab2b3606332f6b06ed3bb963212489ef4d8510d86c5a2da4688ebaf`
- Dimensions: `1536x1024`
- Contents: front, left 3/4, left side, back, right side; neutral, concerned, surprised, angry, sad and speaking heads; head, hair, torso, limb and hand-pose references.
- Purpose: visual design, turnaround and expression approval on one page.
- Limitation: this generated sheet is not yet a production rig atlas. Upper/lower arm separation and fully independent foot/ankle pieces are incomplete and must be rebuilt deterministically before rigging.

## Approved transparent derivative

- File: `master-approved-v1-alpha-v4.png`
- SHA-256: `8be0b62640316bb0311d171bc1e5db599740092ae1daa73377b15b55395b1136`
- Extraction: hard key from measured background `#F204A3`, tolerance 48, one-pixel edge contraction and magenta despill.
- Scope: accepted for limited transform animation only. It does not prove separated joints, hidden fills, facial swaps or rig readiness.
- Rejected history: alpha v1/v2 damaged skin opacity; alpha v3 retained a magenta fringe. `side-view-v1-candidate-needs-repair.png` and `side-view-v1-review.png` remain unapproved because wardrobe/collar identity drift was not resolved.

## Acceptance gates

### Identity consistency

- Same head silhouette, hair mass, facial spacing, body ratio, wardrobe shapes, and palette as the approved master.
- No age, sex presentation, ethnicity, or body-build drift.

### Anatomy

- Exactly two arms, two hands, five plausible fingers per visible hand, two legs, and two feet.
- No fused limb, missing joint, duplicated feature, broken wrist, or impossible shoulder connection.

### Motion readiness

- Arms do not merge into the torso; legs do not merge with each other.
- Hair, head, neck, torso, upper arms, forearms, hands, thighs, lower legs, and feet have visually separable boundaries.
- Hidden regions needed by a later rig are not assumed to exist; they require a separate hidden-fill asset and review.

### Background and extraction

- Chroma color is uniform and absent from the character palette.
- No halo, colored spill, transparency checkerboard, embedded shadow, floor, or environment.

### Privacy and editorial safety

- No resemblance to any named party, victim, suspect, minor, institution, or public figure.
- No identifying badge, uniform, logo, school mark, hospital mark, police mark, or readable document.

## Stop conditions

- `character-model-sheet-v1.png` is the user-requested one-page derivative exception. It may not replace `master-approved-v1.png` as identity authority.
- Do not treat model-sheet crops as production rig parts until exact part boundaries, hidden fills, alpha and hashes are separately verified.
- Do not create case-specific roles, a character rig, a video, or a Canonical contract migration during this PoC.
- `rig-atlas-v1.png` and `articulated-character-test.mp4` are rejected visual-history artifacts: the atlas generated upper and lower arm pieces at nearly full-arm length, producing hands below the knees, a short torso and bulky cylindrical legs. Connectivity does not override proportion failure.
- `phone-pickup-8-keyposes-v1.png` is a human-review candidate only. It uses eight full-body drawings instead of generated limb pieces; no production authority is implied.
