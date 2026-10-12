# 국회 회의록 수집 경로

국회 회의록 수집은 열린국회정보의 회의 목록 메타데이터와 국회 회의록 뷰어의 실제 발언 HTML을 결합한다. 목록 API만으로는 발언 본문을 얻을 수 없다. [구현 및 실호출 기록](../../raw/sources/assembly-minutes-implementation-2026-08-23.md#확인한-데이터-계약)

## 확보된 범위

- 제22대 본회의와 위원회 최근 회의를 공식 API에서 찾는다.
- summary의 실제 안건 ID를 따라 view의 `span.spk_sub` 발언을 수집한다.
- 2026-08-23 격리 실호출에서 본회의 20개, 위원회 10개 발언을 정상 저장했다. [본회의 검증](../../raw/sources/assembly-minutes-implementation-2026-08-23.md#본회의) [위원회 검증](../../raw/sources/assembly-minutes-implementation-2026-08-23.md#위원회)
- 원문과 해시를 evidence로 보존하며 사람 연결은 확정이 아닌 `POSSIBLY_SPOKEN_BY` 상태다. [저장과 검증 규칙](../../raw/sources/assembly-minutes-implementation-2026-08-23.md#저장과-검증-규칙)

## 영상 소재로 쓰는 방법

회의명과 날짜를 먼저 제시하고, 짧은 발언을 앞뒤 문맥과 함께 보여준 뒤 공식 회의록 URL을 출처 카드에 표시한다. 이름만 같은 인물은 자동 동일인으로 간주하지 않으며, 공개 전에 인물·문맥·인용 범위를 사람이 승인한다. [권리 및 공개 제한](../../raw/sources/assembly-minutes-implementation-2026-08-23.md#권리-및-공개-제한)

## 남은 범위

현재 수집기는 PDF와 VOD를 내려받지 않으며, 과거 대수 전체 수집이나 발언-의안 자동 연결도 하지 않는다. 화면 구조가 바뀔 수 있으므로 fixture와 정기 실호출 검사가 필요하다. [저장과 검증 규칙](../../raw/sources/assembly-minutes-implementation-2026-08-23.md#저장과-검증-규칙)

