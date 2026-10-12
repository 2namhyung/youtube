# Sequential Flow experiment results — 2026-09-06

Existing 13-second v2 and production source files are preserved. These are bounded tests in the existing Flow project using original hanbok history, not replacement production approvals.

| Gate | Actual work | Current conclusion |
|---|---|---|
| 1: Faster natural gait without retime | Omni 1.1 Flash edits A and concise B, each requested ten seconds, downloaded and compared with 1.00x/1.80x source | Neither sampled result demonstrates target faster cadence. Keep the existing 1.80x working route; no universal Flow impossibility claim. |
| 2: Stable head, live expression/hands | H1 detailed edit generated, scene export and individual generated clip checked; H2 concise edit submitted | H1 retains head dips and is not adopted. H2 was rejected by Flow's possible-public-figure policy check; UI states no charge. No retry after rejection. |
| 3: Card motion | No new M1 request submitted this turn | Pending. No claim that card acceleration failed; selected gait/head baseline is not ready for integration. |
| 4: Integrated continuity | Prior Seoul→Tokyo local 1.80x candidate preserved | All-city gait/scale/reveal continuity remains unapproved. |

## Review artifacts

- [Gait B comparison: original 1.00x / Flow B raw / original 1.80x](direct-gait-original1.00x-flowB-original1.80x-2s.mp4)
- [Head comparison: original 1.80x / H1 1.80x](flow-head-stable-H1-original1.80x-vs-H1-1.80x-2s.mp4)
- [Gait A report](FLOW_A_REPORT.md), [gait B report](FLOW_B_REPORT.md), [head H1 report](FLOW_H1_REPORT.md)
- Actual submitted prompts: [A](flow-request-A.md), [B](flow-request-B.md), [H1](flow-request-H1.md), [H2 and rejection](flow-request-H2.md)

## Interpretation and next gate

These video-edit prompts were intended to change temporal action while preserving other content. Visible samples retain much of the original action. This supports revisiting the input/edit route rather than repeatedly treating unchanged motion as success. It does not establish the model's internal mechanism or rule out a different supported generation workflow. Before further H2 attempts, resolve the provider's policy rejection through its supported review/feedback route; do not bypass that rejection. Existing unmodified 1.80x assets remain available, but do not falsely label them head-stabilized.

## Verification

Raw downloads retained; equal-duration review windows explicitly recorded; comparison resizing is not speed manipulation. FFmpeg decoding, frame-count/duration probes, JSON and script syntax checks are recorded in each experiment report. No repository-wide canonical diagnostic exists for this local media experiment. Exact hidden foot contacts and eye vectors remain unmeasured. H2 is a provider failure, not a completed media artifact.
