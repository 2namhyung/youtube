# Same-event research gate

Research candidates are collected for broad recall, then verified with the
event fingerprint in `research-pipeline.mjs`. Only verified candidates enter
`relatedCoverage` or `followUps`; rejected/low-confidence rows are discarded
before snapshot/API/UI serialization. Verified rows retain matched anchors,
fingerprint, and confidence. YouTube candidates use the same gate.

On 2026-08-06, refreshing `research-657380fce7eaccc9` reduced the prior
17 related rows (5 videos) to 2 verified same-event rows. The prior snapshot is retained as
`research-657380fce7eaccc9.research.json.pre-same-event-20260806.json`.

Legal review consumes the verified representative, same-event, follow-up, and
law material. It produces a video decision (`allow`, `conditional`, or `block`),
a compact source-grounded `factBrief`, and the approved script policy. Generic
Stage 03 receives only that brief, policy, decision, candidate narrative, and an
explicit style profile—never source arrays, article dumps, laws, or URLs.
Internal bindings still make research changes stale and reject mismatched saves;
the post-generation validator rejects prohibited language, missing required
qualifications, and incident/timeline claims outside the approved `factBrief`.
