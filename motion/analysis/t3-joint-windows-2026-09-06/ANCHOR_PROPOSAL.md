# Joint source-window proposal (T3, 2026-09-06)

## Scope

This is a bounded proposal before full rendering. It keeps the locked 13-second
timeline, 720x1280/24fps, external person retime 1.80x, card timing/geometry,
body matte, and original audio. It changes only the per-city source starts.
Original takes and the prior T3 candidate remain untouched.

## Proposed starts

| city | source start | source consumption | nominal source end | output use |
|---|---:|---:|---:|---|
| Seoul | 2.500s | 6.300s | 8.800s | 3.5–6.5s |
| Tokyo | **1.625s** | 5.400s | 7.025s | 6.5–9.5s (includes outgoing overlap) |
| Shanghai | 2.500s | 4.500s | 7.000s | 9.0–11.5s (includes outgoing overlap) |
| Hanoi | **5.750s** | 3.600s | 9.350s | 11.0–13.0s |

The first boundary cannot use identical numeric source times over the whole
13-second cut: Seoul's outgoing source time reaches `start + 6.3s` by the end
of its 0.5s outgoing overlap, while Tokyo must continue through its outgoing
`start + 5.4s`; the resulting constraints
are incompatible with both starts being the same and remaining inside each
10-second take. Therefore Tokyo 1.625s is a phase-equivalent visual candidate,
not a claim of exact synchronized source clocks.

## Evidence and rationale

- `seoul-tokyo-incoming-candidates.jpg` compares fixed Seoul outgoing 7.900s
  with Tokyo starts 0.000–4.500s in 0.250s steps. Tokyo 1.500–1.750s is the
  closest visible lower-body stance/foot direction to Seoul 7.900s while
  retaining the useful umbrella-adjustment action later in the Tokyo window.
  The previous 2.500s start is a visibly different broad phase in this static
  comparison. 1.625s is the midpoint candidate and preserves margin at both
  ends of the take.
- `tokyo-shanghai-incoming-candidates.jpg` was regenerated with the proposed
  Tokyo outgoing edge at **6.125s** (not the old 7.000s edge). The dense view
  `tokyo-shanghai-dense-6.125.jpg` compares Shanghai 1.750–3.250s; 2.500s
  remains the least disruptive broad stance and is retained pending the joint
  transition audition. This is a visual candidate, not an anatomical contact
  measurement.
- `shanghai-hanoi-incoming-candidates.jpg` plus the earlier Hanoi 5.750s
  candidate review show less forward-foot position jump at the first Hanoi
  reveal than 6.000s. Keep 5.750s; hat-lift behavior remains in the later
  source window.

## Bounded audition outputs

The proposed starts were rendered as 1.5-second silent composite auditions,
including dense first-frame strips. The Shanghai incoming A/B also includes a
2.750s candidate; the downstream Hanoi check propagates that alternate
Shanghai start and compares Hanoi 5.750s vs 6.000s.

- `joint-audition-seoul-tokyo-base.mp4`
- `joint-audition-tokyo-shanghai-base.mp4`
- `joint-audition-tokyo-shanghai-shanghai-2.500.mp4`
- `joint-audition-tokyo-shanghai-shanghai-2.750.mp4`
- `joint-audition-shanghai-hanoi-base.mp4`
- `joint-audition-shanghai-hanoi-chain-shanghai-2.750-hanoi-5.750.mp4`
- `joint-audition-shanghai-hanoi-chain-shanghai-2.750-hanoi-6.000.mp4`

Compact frame reviews are in `compact-*-first12.jpg`. These are visual
auditions only: the card quickly hides the lower legs, so hidden contact is
`NOT_MEASURABLE` rather than an inferred pass.

## Decision gate

Render short boundary auditions first (dense first 8 output frames and a
1.5-second normal-speed review) for Seoul→Tokyo, Tokyo→Shanghai, and
Shanghai→Hanoi. Promote to the full 13-second candidate only if no candidate
introduces a source-window reset, freeze, or card/actor geometry change.
The foot-contact phase is partly hidden by garments and the transition matte;
any such result must remain `NOT_MEASURABLE` without manual visible-contact
evidence. This proposal does not certify T3 PASS.
