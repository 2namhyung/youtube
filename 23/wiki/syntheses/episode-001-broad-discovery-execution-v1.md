# EP001 36컷 외부 소재 검색 실행 기록 v1

- 상태: `metadata-discovery-only / non-production`
- 기준: [현재 36컷 편집 명세](../../video/episodes/episode-001/episode-spec.json), [현재 검색 계획](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-16T00-53-55-771Z.json)
- 결속: 17개 실행 원장은 이전 v3 명세 SHA-256 `58c6cbab3b8abc28eb1401f50e2189503d99ca22c07ca6130847f04ef04fe938`에 결속된다. 도입 고지와 Omni 승인 문구를 고친 현재 명세의 SHA-256은 `c5947f537d8d700483210883da0e957dd34e0bf1038d9139e3ce1331aebbe9b3`이지만, 이전 실행과 현재 계획의 공급처·질의·매체·브리프/경로를 포함한 작업 집합 SHA-256은 모두 `38d4804a9ceb969d32b417994f109a187db49e139ab620d10faf5537ea72fd10`으로 같다. 693개 질의 선언을 중복 제거한 402개 작업은 이전 실행에서 오프셋 0–401까지 순회됐고, 자동 공급처 메타데이터 조회 310개·공식 항목 수동 탐색 계획 89개·자동 경로 미해결 3개로 분리된다. 현재 명세의 계획은 다시 생성했으며 이전 실행 원장은 비제작용 조사 자료로만 재사용한다.

검색은 대본의 대상·행동·장소·다른 화각과 부족한 증거를 바탕으로 Commons, Pexels, KOGL에 자동 메타데이터 조회를 보냈다. 한국 공식 자료 경로는 항목을 자동 조회한 결과가 아니라 사람에게 필요한 정확한 기관·자료 탐색 경로를 기록했다. 첫 전 구간 순회에서 자동 질의 50개는 후보 링크를 반환했고, 259개는 비었으며, 89개는 공식 항목별 수동 탐색을 요구했고, 3개는 공식 경로를 자동 해결하지 못했다. Commons 질의 1개는 HTTP 429로 실패했으나 같은 질의의 단독 재시도는 오류 없이 빈 결과로 끝났다. 따라서 최종 상태는 자동 조회 성공 50·빈 결과 260·공식 항목 수동 탐색 대기 89·자동 경로 미해결 3·남은 실행 오류 0이다. 첫 17개 창의 후보 372행은 공급처와 원본 항목 URL을 합치면 296건이다. 그중 Commons 사진 25·영상 3, Pexels 사진 195·영상 73건이다. 이 수치는 원본 SHA-256이나 의미상 장면 다양성 수가 아니다.

다운로드 0건, 원본 바이트 검증 0건, 화면 적합성·권리 승인 0건이다. 이전 원장의 명세 바이트 해시는 현재 명세와 다르므로 이 원장으로 현재 컷의 자료 승인이나 제작 권한을 주장할 수 없다. [자료 수집 큐](../../video/episodes/episode-001/generated/acquisition-queue.json)의 95개 요건 중 후보 미확보 45개·등록 후보 심사 대기 50개라는 상태는 그대로다. URL 또는 검색어 일치만으로 후보를 컷에 배정하지 않는다. 실제 사진·영상은 원본 다운로드와 SHA-256, 필요한 한국 기관·장소 메타데이터, 대상·행동·시점 확인, 권리 및 사용자 검토가 필요하다.

| 작업 오프셋 | 질의 수 | 후보 행 | 오류 | 실행 원장 |
| ---: | ---: | ---: | ---: | --- |
| 0 | 24 | 32 | 0 | [0–23](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-15T23-20-12-174Z.json) |
| 24 | 24 | 46 | 0 | [24–47](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-15T23-21-11-776Z.json) |
| 48 | 24 | 43 | 0 | [48–71](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-15T23-22-07-301Z.json) |
| 72 | 24 | 48 | 0 | [72–95](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-15T23-23-40-521Z.json) |
| 96 | 24 | 55 | 0 | [96–119](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-15T23-25-01-694Z.json) |
| 120 | 24 | 32 | 0 | [120–143](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-15T23-26-15-311Z.json) |
| 144 | 24 | 24 | 0 | [144–167](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-15T23-27-30-712Z.json) |
| 168 | 24 | 24 | 0 | [168–191](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-15T23-28-45-369Z.json) |
| 192 | 24 | 0 | 0 | [192–215](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-15T23-29-52-013Z.json) |
| 216 | 24 | 8 | 0 | [216–239](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-15T23-30-57-981Z.json) |
| 240 | 24 | 20 | 0 | [240–263](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-15T23-32-14-217Z.json) |
| 264 | 24 | 8 | 0 | [264–287](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-15T23-33-20-990Z.json) |
| 288 | 24 | 8 | 0 | [288–311](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-15T23-34-40-162Z.json) |
| 312 | 24 | 8 | 0 | [312–335](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-15T23-36-14-640Z.json) |
| 336 | 24 | 9 | 0 | [336–359](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-15T23-38-07-377Z.json) |
| 360 | 24 | 7 | 0 | [360–383](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-15T23-40-12-279Z.json) |
| 384 | 18 | 0 | 1 | [384–401](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-15T23-41-49-437Z.json) |

첫 실행의 오류는 절대 오프셋 389, `SH009-visual`의 한국 경찰·검찰 기관 사진을 Commons에서 찾는 질의였다. 두 번 재시도 후 HTTP 429가 기록됐다. [동일 질의 단독 재시도 원장](../../video/source-intake/episode-001/broad-discovery-v01/broad-discovery-2026-09-15T23-44-46-574Z.json)은 같은 episode-spec·작업 집합 해시에 결속되며 `empty / errors=0`으로 끝났다. 원장 오류는 역사 기록으로 남지만 실행상 미해결 오류는 0이다. 그 기관의 실제 사진이나 한국 메타데이터를 일반 스톡 사진으로 대체하지 않는다.
