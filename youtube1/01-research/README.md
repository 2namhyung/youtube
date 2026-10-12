# 01 조사

발행사 RSS 전체 풀을 보존하고 중복을 제거한 뒤, 일상형 비상식 공포에 해당하는 사건을 의미 기반으로 묶습니다. 소재 승인은 사람이 합니다.

- 실행 코드: [`news_radar/collect.py`](news_radar/collect.py)
- 전체 기사 풀: `news_radar/data/latest_article_pool.json`
- 게이트: 원문 링크, 날짜, 공통 사실, 보도 충돌, 사람의 소재 승인
- 다음 단계: [`../02-context-legal`](../02-context-legal)

제주 사건의 프로젝트별 조사 스냅샷은 통합 엔진의 [`jeju-school-intrusion.research.json`](../06-production/opencut-automation/production/newsroom/projects/jeju-school-intrusion.research.json)에 남아 있습니다. 이는 호환 위치이며 논리적 소유 단계는 01입니다.

## Event dossier contract (2026-08-06)

Stage 01 now emits `eventDossier` schema version 1 from content-verified original-publisher pages only. Canonical URLs are deduplicated internally; aggregator links are resolved and the original publisher page is fetched again. The dossier preserves attributed claims, chronology, later rulings, conflicts, unknowns, and per-claim source agreement. Zero representative sources blocks Stage 02; one independent publisher is explicitly marked single-source. Source IDs and URLs remain internal to the research snapshot and are not forwarded to script generation.

Implementation and regression coverage: [`../06-production/opencut-automation/scripts/event-dossier.mjs`](../06-production/opencut-automation/scripts/event-dossier.mjs), [`../06-production/opencut-automation/scripts/research-pipeline.mjs`](../06-production/opencut-automation/scripts/research-pipeline.mjs), and [`../06-production/opencut-automation/scripts/event-dossier-tests.mjs`](../06-production/opencut-automation/scripts/event-dossier-tests.mjs).
