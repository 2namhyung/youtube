# Media acquisition pipeline

- 운영 결정 갱신: 2026-09-13. 제작 방식과 수급 순서는 다르다.
- 정본: [[../syntheses/remotion-vox-production-playbook-v0.1]]. 컷별 편집 권한은 [episode-spec](../../video/episodes/episode-001/episode-spec.json)의 `production_decision`이다.
- 아래는 이번 사용자 요청에 따른 제작 정책이다. 공급처의 기존 조사 근거: [미디어 라이브러리](../../raw/sources/reusable-media-libraries-2026-08-22.md), [원본 영상 수집](../../raw/sources/keyless-video-implementation-2026-08-22.md), [KOGL·LOC 검증](../../raw/sources/kogl-and-loc-live-verification-2026-08-23.md). 과거 접속 성공을 현재 이용 가능성이나 파일 사용 승인으로 읽지 않는다.

## 대본에서 세 가지 방식 선택

실제 수집 현황(2026-09-14 추가 수급 반영): [48컷 원본 후보 검토판](../../video/qa/source-review/episode-001-source-selection-v02/review.html)과 [53개 원본 원장](../../video/qa/source-review/episode-001-source-selection-v02/manifest.json)을 사용한다. 이번에 사진 5·영상 3개를 추가해 새 수급 누적 32개(사진 24·영상 8), 기존 재검증 21개를 기록했다. 총 사진 39·영상 14개에는 제외 후보도 포함된다. 89개 화면용 명세는 대상 후보 25·부분 36·미확보 28이며 source-ready는 0이다. 현재 spec/state/생성 계약과 검토판 생성 코드는 수정하지 않았다. [파일·연결 검증](../../video/qa/source-review/episode-001-source-selection-v02/verification/integrity.json).

이번 수집에서는 Commons·Pexels 외에 Mixkit·Coverr의 개별 공개 항목과 다운로드 표현을 확인했다. Mixkit의 카테고리 목록과 개별 Free/Restricted 항목은 구분하며, 공급처 설명만으로 실제 행동을 판정하지 않는다. 예를 들어 메모장을 집어 드는 영상은 필기 영상으로 쓰지 않는다. 조사한 기관 경로·제외 항목·실패는 [discovery notes](../../video/source-intake/episode-001/source-selection-v02/discovery-notes.json)에 남겼다. 공급처에 관한 기존 조사 근거는 [재사용 미디어 라이브러리](../../raw/sources/reusable-media-libraries-2026-08-22.md)를 유지하고 현재 항목별 조건은 intake의 원문 기록으로 별도 확인한다.

추가 수급에서는 경주시 공식 첨부 사진과 Australian War Memorial의 항목도 확인했다. 공식 사진 캡션이 본회의 발언을 설명해도 픽셀은 별도 회의실이면 본회의 컷에서 제외한다. 공개 배포 영상이라도 고정 타임코드·옛 해외 업무 맥락이 맞지 않으면 현재 컷에 넣지 않는다. 한 장을 같이 읽는 영상도 두 문서를 대조하는 동작으로 분류하지 않는다. [추가 검색·제외 기록](../../video/source-intake/episode-001/source-selection-v02/supplemental-v03/discovery-notes.json), [전체 프레임 관찰 원장](../../video/source-intake/episode-001/source-selection-v02/supplemental-v03/workflow-videos/candidates.json).

| 대사가 요구하는 화면 | 주 제작 방식 | 선택 기준 | 외부 수급물 |
|---|---|---|---|
| 실제 인물·발언·사건·기관·현장 또는 일반 업무 맥락 | 실사: `source-video` / `source-photo` | 실제 모습과 행동이 내용을 받친다. 행동·발언은 영상, 정지 정보·인물·장소는 사진. 줌을 추가해도 실사다. | 원본 영상의 정확 구간, 원본 사진. 직접 증거와 일반 맥락을 구분한다. |
| 전후 차이·관계·순서·조건·시간·수치·정확 문구 비교 | 모션그래픽: `remotion` | 요소의 관계나 내용 변화가 이해에 필요하다. 법률이라는 단어만으로 배정하지 않는다. | 실제 사람·기관·사물의 독립 사진 자산, 원본 데이터, 화면 밖 법률 근거. 외부 소스를 먼저 찾는다. |
| 명시적 가상 사건의 동일 인물·소품·연속 행동 | `omni` | 구매→배송→오배송→신고처럼 같은 사건을 경험하게 한다. 없는 실제 사건 자료의 대체가 아니다. | continuity와 행동 전후 상태를 설계한다. 모든 컷 PASS 전에는 Imagegen PNG 입력만 허용한다. |

주 모드는 화면이 전달할 의미로 선택한다. 실사에 출처 표시를 붙였다고 Remotion이 되지 않는다. 모션그래픽에서 실제 사진을 사용해도 관계 변화가 핵심이면 Remotion이다. Omni를 Remotion으로 조립해도 주 모드는 Omni다.

`자료 없음 → 모션그래픽 → Omni` 자동 전환은 폐기한다. 동일 의미의 검색을 넓히고 gap을 기록한다. 목적을 바꿀 때만 spec의 선택 이유·소스 요구·계약을 함께 다시 작성한다. 미래의 성과를 보여주는 대사와 앞으로 무엇을 확인할지 묻는 대사를 구분한다. 후자는 질문을 시각화하며 허구의 결과나 아직 존재하지 않는 미래 영상을 요구하지 않는다.

## 컷별 자료 명세

각 컷의 `production_decision.asset_search_briefs`에 보일 대상·행동, `full-frame / independent-layer / off-canvas-evidence` 역할, 한국 기관/장소의 정확성 여부, 한국어·영어 검색어, provider route, 제외할 장면을 기록한다. 특정 한국 법률 원문에는 영어 검색을 강제하지 않는다.

국회·경찰·검찰 외관에서 멈추지 않는다. 사건기록 인계, CCTV·저장장치, 은행·통장 실물, 택배 분류, 등기 봉투, 기록 보관, 법전, 달력, 법원, 자료 접수·상담을 대사에 맞춰 검색한다. 소재 목록은 컷에서 파생하며 의무 할당량이 아니다.

기관·장소의 한국성은 원문 메타데이터로 확인한다. 독립 CCTV 장치·봉투·파일철 같은 장소 중립 사물까지 한국 촬영만 요구하지 않는다. 외국 법원·경찰서를 한국 기관으로 대신 쓰거나, 행사 서명을 수사 업무의 증거로 쓰지 않는다.

## 발견 → 후보 원본 → 선택 → 제작 자산

1. **넓은 발견:** 여러 자료 명세와 공급처를 검색한다. 검색어·페이지·결과·빈 결과·실패를 기록한다. 한 공급처의 첫 결과를 전체 수급 완료로 보지 않는다.
2. **후보 원본 확보:** 공개 항목의 이용 조건과 원본 URL을 확인하고 허용 범위 안에서 intake에 저장한다. 원본 경로·SHA-256·이미지 크기 또는 영상 duration/fps를 기록한다. 다운로드 성공은 source 승인이 아니다.
3. **의미 선택:** 실제로 무엇을 보여주는지, 어느 대사·beat에 쓸지, 앞뒤 맥락과 exact timecode/hold를 대조한다. 다른 원본·행동·장소·구도가 필요한 부분을 고른다.
4. **반복 검토:** 원본 해시별 노출 프레임, 연속 노출, 같은 사진의 크롭, 사물·행동 의미군의 집중도를 함께 본다. 다른 파일명·asset ID·크롭·인접 시간구간은 다른 원본이 아니다. 결론의 회수는 `reuse_reason`을 남긴다.
5. **사람 source 검토와 materialization:** source·권리·의미 판단을 결속한다. 실사는 정확 구간/사진, 모션그래픽은 독립 레이어를 만든다. 캡처는 화면 밖 근거로 유지한다.
6. **source-ready 스타일·컷:** 승인 grammar의 적용 여부를 beat별로 판단하고 대표 프레임, 모션, 전체 컷을 검토한다. 검색 건수·schema/hash 검사는 사용자 PASS가 아니다.

실사와 모션그래픽은 같은 원본 원장을 공유한다. 독립적으로 움직일 인물·기관·소품은 각각 asset ID와 render target을 갖는다. Cutout을 선택할 때만 alpha가 필요하다. 법률 문구는 사진 위에 타이핑하지 않고 별도의 래스터 없는 DOM/vector text surface에서 읽힌다.

## 실행과 완료 기준

```powershell
pnpm run media:search-episode -- --plan
pnpm run media:search-episode -- --execute --provider commons --max-queries 24 --max-results 8 --download-candidates 8
pnpm run media:search-episode -- --execute --provider kogl-photo,kogl-video --max-queries 24 --max-results 8
# 다음 batch는 ledger의 next_query_offset 값을 사용한다. spec이 바뀌면 새 계획의 offset 0부터 시작한다.
pnpm run media:search-episode -- --execute --provider commons --query-offset 24 --max-queries 24 --max-results 8
pnpm run video:validate-editorial-routing -- --check --output video/qa/pipeline-audit/2026-09-13/routing-audit.json
pnpm run video:generate-plans
pnpm run video:prepare-acquisition -- --report-only
pnpm run check
```

검색 CLI의 현재 자동 연동 범위는 **Commons와 공공누리(KOGL)**다. `korean-official-open-item`, `pexels-generic-last`, `official-law-evidence`는 자동 실행된 것처럼 세지 않고 `unsupported_routes`에 남긴다. 이 경로는 [route 구현/수동 intake](../../src/lib/ep001-korean-routes.ts)의 항목별 공개 원문·라이선스 확인을 사용한다. 뉴스·국회 특정 발언 원문은 대사/발언자/날짜의 정확 일치가 필요하므로 범용 이미지 검색으로 대체하지 않는다.

한 번의 실행은 최대 24개 검색/검색당 8개 결과로 제한한다. `selected_queries`는 전수 조사 수가 아니다. 동일 spec 바이트와 provider 설정에서 `next_query_offset`으로 이어가고 `remaining_queries=0`이 될 때까지 ledger를 누적한다. 통합 선택은 모든 ledger의 원본 URL과 파일 SHA-256을 기준으로 중복을 제거한다. 실패/미지원/저해상도/불일치는 별도 미해결 상태이며, 검색을 다 돌았어도 의미·권리 선택 완료가 아니다. 2026-09-13 계획은 114개 명세(화면용 89·화면 밖 법률 근거 25), 46개의 서로 다른 화면용 행동/구도 검색 묶음이다. 특히 반복되던 사건기록 25컷은 각각 다른 행동/시점 검색으로 분리했고 원본 선택은 pending이다.

실제 외부 검색은 [검색 CLI](../../video/scripts/search-episode-media.mjs)가 담당한다. `video:prepare-acquisition`은 기존 [등록 원장](../../src/lib/episode-official-acquisition.ts)의 연결·상태 보고이며 외부 전체 검색이 아니다. [모드·반복 검사](../../video/scripts/editorial-route-contract.mjs)는 결과를 진단하며 source·cut PASS를 부여하지 않는다. 기존 수집 구현 기록: [정적 이미지 수집](../../raw/sources/keyless-media-implementation-2026-08-22.md).

완료 기준은 검색 개수가 아니라 필요한 의미의 원본·독립 자산·읽기 근거가 준비됐고 사람이 선택했는지다. 조회 실패·권리 미확인·낮은 해상도·장면 불일치·없는 원본을 분리한다. 미해결 컷을 기존 사진으로 채워 완료율을 높이지 않는다.

[기존 self-service 정책](../syntheses/korean-policy-media-intake-and-rights-v1.md)의 연락·계약·구매·직접 촬영 제외는 유지한다. 개별 조건이 명확한 공개 원본만 제작 후보로 검토한다. 실제 인물·실제 사건은 생성하지 않는다. source 캡처·목록·README·JSON은 production visual input이 아니다.

Related: [[../syntheses/media-source-strategy-v0.1]], [[../syntheses/supplementary-investigation-first-video-v0.1]].

다음 단계는 source 선택 후 spec의 editorial phase를 `source-selected-editorial-plan`로 기록하고 생성 계약을 재생성하는 것이다. 실제 자산 materialization과 사용자 승인 marker가 없는 상태 변경은 stage 검증에서 거부한다. 과거 `video:approve-sh006-source`는 현재 SH006(Omni) 승인이 아니므로 현재 command에서 제거했다. 필요한 승인·원본·cut binding은 해당 source/asset ID와 현재 spec 바이트를 기준으로 다시 기록한다.
