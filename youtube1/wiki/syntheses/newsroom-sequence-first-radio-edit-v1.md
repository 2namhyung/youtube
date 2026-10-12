# Newsroom sequence-first / radio-edit visual assembly v1

This successor is intentionally downstream of the locked owner narration and
sealed semantic cut plans. It does not re-author titles, narration, storyline,
cut IDs, order, or duration intents.

- Semantic units, editorial visual blocks, and reusable source assets are
  separate records in `newsroom-sequence-first-radio-edit-v1`.
- Visual roles are `evidence`, `context`, `explanation`, and `rhythm`.
  Evidence requires an actual-evidence binding; generic context carries the
  disclosure `자료사진 · 사건과 무관` and cannot imply case, location, or party.
- A source can span contiguous cuts only with a continuity rationale and
  distinct authored treatments (`full`, `crop`, `pan`, `zoom`, `annotation`).
- Coverage is authored screen time, not asset count. There is no fixed
  photo-per-cut or 0.90 unique-primary rule.
- Rights/privacy, provider-local-only, and YPP-authored transformation gates
  remain fail-closed. The plan is pre-production only.

The append-only three-story plan is created from authority run
`run-20260815T051236587Z-a2871f` and v5 assets
`run-20260815T162235412Z-7840eb`; its evidence-gap report remains truthful:
6, 9, and 7 real-photo cuts are still blocked for police-father,
jeju-school-intrusion, and nurse-pesticide-coffee respectively.

Verified append-only output: [run-20260816T000003000Z-sequence-v1](../../06-production/opencut-automation/out/studies/three-story-visual-assembly-v1/run-20260816T000003000Z-sequence-v1/), plan SHA-256 `ad02ebd469856a154aac9f4694f28bb37527014a5247ab6a6a65b5fa69a6a3f9`.

The v2 coverage/evidence split successor is recorded at
`out/studies/three-story-visual-assembly-v2/run-20260816T000007000Z-sequence-v2`.
It reports photo screen-time coverage `0.842100/0.882359/0.882363` for
police-father, jeju-school-intrusion, and nurse-pesticide-coffee, while
`evidenceCompleteness=false` with unresolved gaps `6/9/7`.

The v3 v5-preserving run is
`out/studies/three-story-visual-assembly-v3/run-20260816T000009000Z-sequence-v3`.
It keeps all original admitted cut assignments and fills only blocked cuts with
phase-compatible context; plan SHA-256 is
`861d0bfad08a342b2bdaf4bb8101dc7a5d3368f4c6844df833bf5bf8fe0a04de`.
