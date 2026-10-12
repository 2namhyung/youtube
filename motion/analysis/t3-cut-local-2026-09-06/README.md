# T3 cut-local Seoul→Tokyo 1.80× candidate

This is a provisional 4-second integration candidate using the existing 10-second Seoul and Tokyo outfit takes. Each source is sampled at 1.80× from cut-local anchors (Seoul 2.5s, Tokyo 5.2s), independently inside its 10-second duration. The local timeline is Seoul 0.0–1.5s, the unchanged v2 card transition 1.5–2.0s, and Tokyo 2.0–4.0s.

Both actors read the same nominal source-time map during the 0.5-second overlap (source 5.2–6.1s), which is a phase-alignment design anchor, not exact foot-contact proof. Independent outfit edits mean exact phase remains unmeasured.

- [T3 candidate, normal speed](t3-seoul-tokyo-local-1.80x-4s.mp4)
- [T3 candidate, half speed](t3-seoul-tokyo-local-1.80x-4s-half-speed.mp4)
- [Existing v2 same section](existing-v2-seoul-tokyo-5-9s.mp4)
- [Normal-speed side-by-side](t3-local-vs-existing-v2-5-9s.mp4)
- [Visual contact sheet](t3-local-vs-existing-v2-contact.jpg)
- [Metadata](metadata.json)
- [Render script](render_t3_cut_local.py)

The normal candidate and extracted baseline are 720×1280, 24fps, 96 frames / 4.0s; the half-speed candidate is 720×1280, 12fps, 96 frames / about 8.0s; the side-by-side is 1440×1280, 24fps, 96 frames / 4.0s. All MP4 outputs were ffmpeg-decoded. No Flow submission, new generation, upload, publish, production overwrite, or canonical diagnostic was performed.

Visual check of the contact sheet confirms the unchanged bottom-up card wipe begins at local 1.5s and is settled by 2.0s; the candidate's walk is visibly more progressed than the v2 baseline while the card layout remains aligned. No exact foot-contact phase or identity equivalence is claimed. This is a provisional first-pair T3 candidate, not a full T3 PASS or final approval.
