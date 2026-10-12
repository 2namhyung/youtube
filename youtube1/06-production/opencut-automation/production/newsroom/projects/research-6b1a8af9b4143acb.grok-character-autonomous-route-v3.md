# Grok character-reference/autonomous-scene route v3

Status: active private-production design authority, 2026-08-14.

This successor supersedes the project’s multi-reference prompt pack for provider input. All 18 cuts remain Grok-generated. `human-action` cuts upload one approved character master; `information-motion` cuts upload no image. Grok autonomously generates environment, props, documents, diagrams, lines, markers, textures, layout and effects from evidence-bounded scene direction. Historical environment/prop/cut PNGs remain immutable audit artifacts and must not be uploaded.

Prompt order:

1. Character identity/clothing invariants, only when a character master is uploaded.
2. Autonomous square scene, object count, size, placement and focal hierarchy.
3. One evidence-bound visible state change.
4. Object route, reveal order and the selected motion-library grammar.
5. Camera movement and paper material.
6. Unsupported people, objects, text, identity, action and reversal prohibitions.

Cut 001 uses the neutral empty-hand `character-teacher-neutral-v3` master only. Grok generated one teacher, one normal desk-scale blank sheet and one intact phone, and completed the sheet-slide action without reversal. The provider’s later perimeter glow was excluded. Semantic QA selected 0.50–3.75 seconds; FFmpeg Lanczos normalized the selection to 480x480/24fps and added a separately attested thin burgundy top-to-bottom scan overlay after the sheet settled. The final private cut-source SHA-256 is `8e5a00f5936a576533ec9e72e1ee0e348291618d0141fd26a4545bab2141a74d`; QA artifact SHA-256 is `c53aebfb8d217775f9cdb13fd3d3894105800227155fa053455263988b34351e`.

Provider source, final assembly, upload, publication and Stage 07 remain separate gates.
