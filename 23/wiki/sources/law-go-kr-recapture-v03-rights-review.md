# 국가법령정보센터 재캡처 v03 권리 경계 검토

상태: **사람 검토 대기 / 법률·권리 승인 아님**  
확인일: 2026-09-06

## 공식 근거

- [저작권법 제7조](https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1029423769)는 헌법·법률·조약·명령·조례·규칙 등을 보호받지 못하는 저작물로 열거한다. 이 근거는 법률 문언의 이용 범위를 판단하는 출발점일 뿐, 국가법령정보센터 화면 전체의 디자인·로고·아이콘을 자동으로 허용하지 않는다.
- [법제처 저작권정책](https://www.moleg.go.kr/menu.es?mid=a10205040000)은 법제처가 저작재산권 전부를 보유한 공공저작물의 이용 가능성과, 제3자 권리 또는 공공누리 표시가 확인되지 않은 자료에 별도 허락·확인이 필요할 수 있음을 구분한다. 이 정책만으로 이번 `law.go.kr` 캡처의 UI 사용권은 확정되지 않는다.
- [법제처 기관문양 안내](https://www.moleg.go.kr/board.es?act=view&bid=0012&list_no=78066&mid=a10701030000)는 화면에 보이는 기관 상징을 식별하는 근거다. 내려받기 안내가 있다는 사실을 영상 내 재사용 허락으로 확대 해석하지 않는다.

## 이번 패키지의 판단 경계

[recapture-v03 manifest](../../video/source-intake/episode-001/official/recapture-v03/manifest.json)의 LAW-195·LAW-196·LAW-1972는 exact URL, DOM locator, viewport, capture tool, PNG MIME와 byte hash를 가진 **미등록 source candidate**다. [사람 검토 manifest](../../video/qa/source-review/episode-001-official-recapture-v03/manifest.json)는 다음을 분리한다.

- 법률 텍스트: 정확한 source identity·locator·content scope를 사람이 확인한 뒤 crop/retype 입력 후보로 검토한다.
- 사이트 UI·파란 header·로고·아이콘·페이지 layout: 법률 문언과 별도 권리 영역이며 현재 사용 승인되지 않았다.
- 전체 screenshot: 출처 인증·overview 후보일 뿐, 제작 화면 사용 승인이 아니다.

세 항목 모두 `source_identity`, `content_scope`, `locator`, `visual_readability`, `rights`, `use_of_ui`가 `pending/false`다. 자동 검증은 바이트·표시 범위·메타데이터 일치만 확인하며 법률 자문이나 권리 승인을 대신하지 않는다.

