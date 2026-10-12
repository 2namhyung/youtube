---
title: Three-story domestic photo admission v5
status: verified-incomplete
updated: 2026-08-16
---

# Three-story domestic photo admission v5

`newsroom-photo-risk-v1`로 봉인된 53컷을 재심사했다. 공식 국내 공유마당/공공누리 항목별 권리 증거가 있는 원본만 사용했고 필름카메라·CD 노트북·구식 교실·해외형 복도·1970년대 실험실은 시대 또는 상표/맥락 위험으로 제외했다.

검증 결과 실사진 필요 46컷 중 24컷이 조건부 배정되었다. 경찰편 10/16컷·52.6301%, 제주편 6/15컷·35.2943%, 간호조무사편 8/15컷·47.0591%다. 세 편 모두 0.80 기준 미달이므로 전체 admission과 provider/render/upload/publication/Stage 07은 승인되지 않았다.

근거: `out/studies/three-story-domestic-photo-admission-v5/run-20260815T161250879Z-0dc945/admission-with-contact-sheets.json` (SHA-256 `84b72722df69c9ffe29238b0d75f42253fa48a3fc02e5638474408798a73c129`), 같은 폴더 `verifier.json` (`verified=true`).

Sources: [canonical pipeline](../pipelines/newsroom-video-production.md), [official KOGL license guide](https://www.kogl.or.kr/info/license.do), captured 2026-08-15.

## Finalization rerun

Append-only run `../../06-production/opencut-automation/out/studies/three-story-domestic-photo-admission-v5/run-20260815T162235412Z-7840eb/` is independently verified (`verifierMode=independent-policy-reimplementation`). Admission-with-contact-sheets SHA-256: `83f0e7f16a331b3e957f34b88a88831236064191b6a1b1749ee19247162508f1`; verifier SHA-256: `81c1aae0667574addf3b53f04889153f6fcd8b2e9cae77d5574db3b4868bde19`.

Exact authored-duration coverage remains police-father `28.955/55.016 = 0.526301` (6 remaining), jeju-school-intrusion `17.920/50.773 = 0.352943` (9 remaining), and nurse-pesticide-coffee `22.962/48.794 = 0.470591` (7 remaining). No story reaches 0.80, so no admission/provider/render/upload/publication/Stage 07 authorization is granted. Legacy film-camera/old-document/optical-disc/feature-phone/CRT/current-device classes are explicit deny-only policy values.
