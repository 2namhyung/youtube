# EP001 대본·화면 명세 전면 리팩터링 후보 v2

- 상태: `proposed-editorial-candidate / non-production`
- 작성일: 2026-09-16 (Asia/Seoul)
- 목적: 사용자가 선호한 사건 도입을 고정하고, 같은 법률 사실을 시청자가 따라가기 쉬운 행동·질문·답변의 순서로 다시 쓴다. 각 `SH`는 하나의 의미 단위이며, 아래 JSON을 `draft_narration`의 연속 원문으로 사용할 수 있다.
- 기존 문서: [실사 중심 승인 대본 v1](episode-001-live-action-script-draft-v1.md)은 역사 기록으로 보존한다. 이 대본은 [episode-spec](../../video/episodes/episode-001/episode-spec.json)의 새 36컷 편집 후보에 반영되었고 production authority는 false다.
- 시나리오 고지: 중고거래는 실제 사건·실제 피해자·실제 수사기록이 아닌 설명을 위한 가상 사례다. 택배 상자, 계좌, CCTV, 신고 행동은 가상 사례의 흐름을 보여주는 화면으로만 사용한다.
- 시행일 표현: 법률 제21857호의 주요 개정은 `[시행 2026. 10. 2.]`로 확인된 미래 시행 개정문을 기준으로 쓴다. 시행 뒤 처리 속도, 재수사 결과, 피해 회복은 이 대본에서 예측하지 않는다.
- 낭독 원문 문자 수: 아래 `draft_narration` 36개를 공백 하나로 이어 붙인 결과를 기준으로 산출한다. 제목·JSON 키·출처 표기는 제외한다.

## 1. 사건으로 질문 열기 — SH001–SH007

이 영상은 제도 이름을 먼저 외우게 하지 않는다. 상자를 열었을 때 무엇이 빠졌고, 그다음 어느 기관이 어떤 방식으로 확인을 요구하는지를 따라간다. SH001–SH005는 사용자가 지정한 문단을 한 글자도 바꾸지 않고 이어 붙인다. SH001–SH003의 Imagegen 가상 장면에는 화면 이미지 바이트와 분리된 native `screen-chrome` 레일에서 첫 프레임부터 ‘가상 사례 · AI 재구성’을 표시하도록 명세를 묶었다. 이 화면 고지는 아직 구현·승인된 프리뷰가 아니며, SH006에서 음성으로도 가상 사례임을 밝힌다.

## 2. 용어와 현재 흐름 — SH008–SH011

보완수사와 송치를 짧게 분리한다. 경찰에 신고한 순간 검사 수사가 자동으로 시작된다고 말하지 않고, 기록의 위치와 넘어온 자료를 먼저 확인한다.

## 3. 삭제되는 조문과 남는 직무 — SH012–SH016

현재 제196조 제1항의 문구와 법률 제21857호의 삭제 문구를 정확히 대조한다. 결론은 제196조의 명시적 수사 조항 삭제와 새 제195조 제2항에 남는 보완수사요구·재수사요구 직무의 대비에 한정한다.

## 4. 요구서가 하는 일 — SH017–SH020

“다시 알아보세요”라는 추상어를 쓰지 않고, 판매자의 다른 계좌·특정 시간대 CCTV·배송 기록처럼 확인 대상과 이유가 적힌 요구로 바꿔 보여준다. 요구 내용, 서류·증거 송부, 관리 기록의 관계를 설명한다.

## 5. 기간과 기관 지정 — SH021–SH024

원칙적 한 달을 사건 종결이나 피해 회복 기한으로 오해하지 않게 한다. 별도 기간·법이 정한 연장 가능성과, 적절한 보완이 어렵다는 조건 아래 상급 또는 다른 수사기관을 지정할 수 있다는 점을 함께 말한다.

## 6. 이름이 비슷한 별도 절차 — SH025–SH028

불송치 뒤 이의신청, 재수사요구, 공소 제기·유지를 위한 사실관계 확인을 한 절차로 섞지 않는다. 의견·자료를 받을 수 있는 경우와 그 자료가 재판상 증거가 될 수 없는 경우를 구분한다.

## 7. 시행일과 아직 모르는 결과 — SH029–SH032

10월 2일은 예정된 시행일이며 공포일과 절차가 실제로 바뀌는 날은 구분한다. 부칙의 제한된 90일 경과조치를 모든 사건의 연장으로 확대하지 않고, 실제 속도와 결과는 시행 뒤 자료로 확인할 질문으로 남긴다.

## 8. 상자와 빠진 확인으로 돌아오기 — SH033–SH036

처음 가상 사건에 법률 흐름을 다시 넣는다. 마지막 문장은 계좌와 CCTV가 실제로 확인됐는지로 돌아가며, 제도 명칭보다 확인의 실행과 결과를 보자는 결론으로 닫는다.

## 36행 `draft_narration` 매핑

아래 JSON 배열은 `SH001`부터 `SH036`까지 빠짐없이 이어진다. 각 문장을 배열 순서대로 공백 하나로 연결하면 전체 낭독 원문이 된다. `source_ids`는 해당 행의 사실·법률 근거이며 `FICTIONAL-SCENARIO`는 사실 주장이 아닌 편집상 가상 사례 표시다.

```json
[
  {"shot_id":"SH001","section":"1","draft_narration":"중고 노트북을 샀는데 택배 상자에는 다른 물건이 들어 있었습니다.","source_ids":["FICTIONAL-SCENARIO"]},
  {"shot_id":"SH002","section":"1","draft_narration":"경찰에 신고했고, 사건 기록은 검사에게 넘어갔습니다.","source_ids":["FICTIONAL-SCENARIO"]},
  {"shot_id":"SH003","section":"1","draft_narration":"그런데 판매자의 다른 계좌와 택배 접수 장소의 CCTV는 확인되지 않았습니다.","source_ids":["FICTIONAL-SCENARIO"]},
  {"shot_id":"SH004","section":"1","draft_narration":"이제 검사가 직접 확인할까요, 아니면 무엇이 빠졌는지 적어 경찰에 다시 확인을 요구할까요?","source_ids":["FICTIONAL-SCENARIO","LAW-195","LAW-196","LAW-1972"]},
  {"shot_id":"SH005","section":"1","draft_narration":"10월 2일 시행 예정인 개정에서 바뀌는 지점이 바로 이것입니다.","source_ids":["LAW-TRANS"]},
  {"shot_id":"SH006","section":"1","draft_narration":"이 사례는 실제 사건이 아니라, 달라지는 절차를 따라가기 위한 가상의 이야기입니다. 오늘 확인할 것은 검사가 무엇을 할 수 있느냐를 한마디로 단정하는 일이 아닙니다. 개정문에 적힌 역할과 아직 알 수 없는 결과를 나누어 보겠습니다.","source_ids":["FICTIONAL-SCENARIO"]},
  {"shot_id":"SH007","section":"1","draft_narration":"빠진 확인을 발견했을 때 누가 무엇을 요구하고, 그 결과를 어떻게 돌려받는지입니다.","source_ids":["LAW-1972","LAW-1973"]},
  {"shot_id":"SH008","section":"2","draft_narration":"먼저 보완수사라는 말을 정리해 보겠습니다. 보완수사는 처음 수사에서 빠진 사실이나 증거를 더 확인하는 절차를 가리킵니다.","source_ids":["LAW-1972"]},
  {"shot_id":"SH009","section":"2","draft_narration":"송치는 경찰이 수사한 사건 기록과 증거를 검사에게 넘기는 단계입니다. 따라서 경찰에 신고한 순간 검사에게 보완수사를 요구하는 절차가 바로 시작된다고 볼 수는 없습니다.","source_ids":["LAW-195","LAW-1972","LAW-TRANS"]},
  {"shot_id":"SH010","section":"2","draft_narration":"사건이 어느 기관에 있고 어떤 자료가 넘어갔는지를 먼저 봐야 합니다. 그래야 누가 빈칸을 채울지 말할 수 있습니다. 가상의 사건 기록에는 결제 내역과 메시지는 있지만, 다른 계좌와 CCTV 확인 결과가 비어 있습니다.","source_ids":["LAW-1972","FICTIONAL-SCENARIO"]},
  {"shot_id":"SH011","section":"2","draft_narration":"그 빈칸을 채우는 방식이 개정 전후를 가르는 출발점입니다. 이름보다 실제 경로를 먼저 보겠습니다. 이제 기록을 읽는 검사와 확인을 수행하는 수사기관의 역할을 나누어 보겠습니다.","source_ids":["LAW-196","LAW-195","LAW-1972"]},
  {"shot_id":"SH012","section":"3","draft_narration":"현재 시행 중인 형사소송법 제196조 제1항은 검사가 범인, 범죄사실과 증거를 수사한다고 정합니다.","source_ids":["LAW-196"]},
  {"shot_id":"SH013","section":"3","draft_narration":"개정문에는 짧고 분명한 문장이 들어 있습니다. ‘제196조를 삭제한다’는 문장입니다.","source_ids":["LAW-196"]},
  {"shot_id":"SH014","section":"3","draft_narration":"그렇다고 검사의 모든 법적 역할이 사라진다고 말하면 범위를 넘어섭니다. 같은 개정문은 새 제195조 제2항에 검사의 직무를 따로 적어 둡니다.","source_ids":["LAW-195","LAW-196"]},
  {"shot_id":"SH015","section":"3","draft_narration":"그 직무에는 사법경찰관의 수사에 관한 영장의 청구가 포함됩니다. 그리고 보완수사요구와 재수사요구도 포함됩니다.","source_ids":["LAW-195"]},
  {"shot_id":"SH016","section":"3","draft_narration":"그러니 확인되는 변화는 제196조의 명시적 수사 조항은 삭제되고, 수사기관에 요구하는 직무는 남는다는 대비입니다. 여기서 모든 검사 기능의 소멸을 읽어내면 안 됩니다.","source_ids":["LAW-195","LAW-196"]},
  {"shot_id":"SH017","section":"4","draft_narration":"가상의 기록으로 돌아가 보겠습니다. 검사가 판매자의 다른 계좌와 택배 접수 장소의 특정 시간대 CCTV가 빠졌다는 점을 발견합니다.","source_ids":["FICTIONAL-SCENARIO"]},
  {"shot_id":"SH018","section":"4","draft_narration":"개정 뒤 기본 흐름은 검사가 그 계좌와 CCTV를 직접 확인하는 장면으로 설명되지 않습니다. 대신 무엇이 빠졌는지, 무엇을 확인해야 하는지, 왜 필요한지를 적어 수사기관에 보완수사를 요구합니다.","source_ids":["LAW-195","LAW-196","LAW-1972"]},
  {"shot_id":"SH019","section":"4","draft_narration":"요구서는 ‘다시 알아보세요’라는 한마디로 끝나는 문서가 아닙니다. 확인할 대상과 요구하는 이유가 드러나야 합니다. 무엇을 찾는지 모호하면 이행 여부도 확인하기 어렵습니다.","source_ids":["LAW-1972"]},
  {"shot_id":"SH020","section":"4","draft_narration":"예를 들면 판매자의 다른 계좌를 확인하라는 내용과, 택배 접수 장소의 해당 시간대 CCTV를 확인하라는 내용입니다. 관련 서류와 증거물을 함께 보내는 것이 원칙이고, 조문에는 그 송부 방식의 예외도 적혀 있습니다.","source_ids":["LAW-1972","FICTIONAL-SCENARIO"]},
  {"shot_id":"SH021","section":"5","draft_narration":"요구가 전달되면 누가 언제 무엇을 요구했는지 관리 기록에 남습니다. 수사기관이 무엇을 확인했고 어떤 결과를 보냈는지도 이어서 기록됩니다.","source_ids":["LAW-1972"]},
  {"shot_id":"SH022","section":"5","draft_narration":"그렇다면 이 확인은 언제까지 해야 할까요? 개정문이 제시하는 원칙적인 이행 기준은 요구를 받은 날부터 한 달입니다.","source_ids":["LAW-1972"]},
  {"shot_id":"SH023","section":"5","draft_narration":"여기서 한 달은 보완수사를 이행하고 그 결과를 통보하는 기준입니다. 신고부터 판결까지 한 달에 끝난다거나, 피해자가 한 달 안에 돈을 돌려받는다는 뜻은 아닙니다. 시작점은 요구를 받은 날입니다.","source_ids":["LAW-1972","UNKNOWN-OUTCOME"]},
  {"shot_id":"SH024","section":"5","draft_narration":"검사가 별도 기간을 정할 수 있고, 상당한 이유가 있으면 법이 정한 범위에서 기간을 연장할 수 있습니다. 적절한 보완을 기대하기 어렵다는 조건에서는 상급 수사관서나 다른 수사기관을 지정해 요구할 수도 있습니다. 이 역시 모든 사건을 자동으로 옮긴다는 뜻은 아닙니다.","source_ids":["LAW-1972"]},
  {"shot_id":"SH025","section":"6","draft_narration":"이제 이름이 비슷하지만 출발점이 다른 절차를 구분하겠습니다. 불송치 통지를 받은 고소인이나 피해자가 결과에 이의를 제기하는 절차가 있습니다.","source_ids":["LAW-2457","LAW-2458"]},
  {"shot_id":"SH026","section":"6","draft_narration":"검사가 사법경찰관에게 재수사를 요구하는 절차도 따로 있습니다. 보완수사요구와 불송치 뒤 이의신청을 하나의 절차처럼 말하면 안 됩니다. 하나는 수사기록의 보완을 요구하는 흐름이고, 다른 하나는 통지받은 결과에 대한 이의 제기입니다.","source_ids":["LAW-1972","LAW-2457","LAW-2458"]},
  {"shot_id":"SH027","section":"6","draft_narration":"검사는 공소 제기나 재수사요구, 공소 유지를 위해 의견을 듣거나 자료를 받을 수 있는 경우도 있습니다. 하지만 제245조의13에 따른 사실관계 확인과 면담으로 얻은 진술·자료는 재판에서 증거로 사용할 수 없습니다.","source_ids":["LAW-24513"]},
  {"shot_id":"SH028","section":"6","draft_narration":"확인할 수 있는 권한과 재판에서 증거로 쓸 수 있는 권한은 같은 말이 아닙니다. 화면에서 자료를 받는 장면만으로 증거능력을 단정할 수 없습니다. 절차의 이름이 비슷할수록 시작점과 결과를 따로 적어야 합니다.","source_ids":["LAW-24513","LAW-1972","LAW-2457","LAW-2458"]},
  {"shot_id":"SH029","section":"7","draft_narration":"시행일도 함께 봐야 합니다. 법률 제21857호는 2026년 8월 4일 공포됐고, 주요 개정은 2026년 10월 2일부터 시행될 예정입니다.","source_ids":["LAW-TRANS","BILL-2220257"]},
  {"shot_id":"SH030","section":"7","draft_narration":"공포된 날과 실제 절차가 바뀌는 날은 같지 않을 수 있으므로 조항별 시행일을 확인해야 합니다. 날짜 하나만 보고 모든 사건의 적용을 단정할 수 없습니다. 시행 당시 이미 검사가 맡고 있던 사건에는 별도의 적용례와 부칙이 붙습니다.","source_ids":["LAW-TRANS"]},
  {"shot_id":"SH031","section":"7","draft_narration":"종전 규정으로 검사가 수사 중인 사건 가운데 공소시효가 임박했거나 사건 성질상 불가피한 경우에는 시행일부터 최대 90일의 경과조치가 있습니다. 이 90일은 모든 사건에 열려 있는 일반적인 연장이 아닙니다.","source_ids":["LAW-TRANS-APPLICATION"]},
  {"shot_id":"SH032","section":"7","draft_narration":"그리고 시행 전인 지금은 실제 처리 속도나 피해 회복 결과를 말할 자료가 없습니다. 법 조문만으로 현장의 속도를 미리 계산할 수도 없습니다. 그 결과는 시행 뒤 사건 처리 자료로 확인해야 할 질문으로 남습니다.","source_ids":["LAW-TRANS","UNKNOWN-OUTCOME"]},
  {"shot_id":"SH033","section":"8","draft_narration":"다시 처음의 중고 노트북 사건에 이 흐름을 넣어 보겠습니다. 경찰이 사건을 수사해 기록을 검사에게 보냈지만, 판매자의 다른 계좌와 CCTV 확인이 빠져 있습니다.","source_ids":["FICTIONAL-SCENARIO"]},
  {"shot_id":"SH034","section":"8","draft_narration":"개정 뒤 이 장면의 핵심은 검사가 그 계좌와 CCTV를 직접 수사한다는 일반적인 설명이 아닙니다. 빠진 항목과 확인 이유를 특정해 수사기관에 보완수사를 요구하는 경로입니다.","source_ids":["LAW-195","LAW-196","LAW-1972"]},
  {"shot_id":"SH035","section":"8","draft_narration":"수사기관은 요구받은 계좌와 CCTV, 배송 기록을 확인하고 그 결과를 보냅니다. 원칙적인 기준은 한 달이지만, 별도 기간과 법이 정한 연장 가능성을 함께 봐야 합니다.","source_ids":["FICTIONAL-SCENARIO","LAW-1972"]},
  {"shot_id":"SH036","section":"8","draft_narration":"결국 중요한 것은 서류가 몇 번 오갔는지가 아니라, 빠진 확인을 누가 요구했고 실제로 수행했는지입니다. 그 이행 결과가 다음 판단의 근거가 됩니다. 처음의 상자로 돌아가면 답은 하나의 약속이 아니라, 판매자의 다른 계좌와 택배 접수 장소의 CCTV가 실제로 확인됐는지에서 드러납니다. 그 질문을 끝까지 확인하는 것이 이 개정의 실제 의미를 판단하는 출발점입니다.","source_ids":["FICTIONAL-SCENARIO","LAW-1972","UNKNOWN-OUTCOME"]}
]
```

## 화면 리팩터링 원칙

- SH001–SH007은 가상 사건을 직접 촬영한 실제 피해 자료처럼 보이게 만들지 않는다. 상자·휴대전화·기록은 가상 사례의 행동을 설명하는 독립 화면이고, 가상 사건 고지를 함께 둔다.
- SH012–SH016은 국가법령정보센터 원문을 출처 증거로 보존하고, 화면에 읽히는 법률 문구는 원문과 대조한 별도 native text surface로 재조판한다. 법률 원문과 사이트 UI 캡처를 같은 생산 자산으로 취급하지 않는다.
- SH017–SH021은 ‘계좌·CCTV·배송 기록’이라는 대상과 ‘발견·요구·기록’이라는 행동을 각각 화면 명세로 만든다. 서류를 읽는 손이나 경찰청 외관만으로 확인이 끝났다고 표시하지 않는다.
- SH022–SH024는 달력·요구서·기관 경로를 기간과 조건의 설명으로만 사용한다. 달력 화면이 실제 처리 결과를 증명한다고 말하지 않는다.
- SH025–SH032는 이의신청·재수사요구·증거 사용 제한·시행일·경과조치를 서로 다른 표면과 행동으로 분리한다.
- SH033–SH036은 처음 사례로 돌아와 ‘요구가 실제로 이행됐는가’를 focal로 둔다. 시행 전에는 미래 처리 결과를 보여주는 영상을 만들거나 사실처럼 단정하지 않는다.

## 근거·불확실성

| ID | 근거 | 이 대본에서의 범위 |
|---|---|---|
| `LAW-195` | [형사소송법 개정문 및 새 제195조 제2항](../../raw/sources/episode-001-sh006-viewer-first-law-sources-2026-08-29.md#2-law-no-21857-amendment-text) | 보완수사요구·재수사요구 등이 남는다는 조문 대비 |
| `LAW-196` | [현행 제196조 제1항 및 제196조 삭제 문구](../../raw/sources/episode-001-sh006-viewer-first-law-sources-2026-08-29.md#1-article-196-before-law-no-21857-takes-effect) | 시행 전 원문과 개정문 삭제 문구 |
| `LAW-1972` | [국가법령정보센터 제197조의2 확인 링크](https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=02&joNo=0197&lsiSeq=288579&urlMode=lsScJoRltInfoR) 및 [EP001 근거 상태표](supplementary-investigation-first-video-v0.1.md#2-근거-상태표) | 요구 이유·내용·서류·증거·관리·원칙적 1개월·기간 연장·기관 지정 |
| `LAW-1973` | [EP001 근거 상태표의 제197조의3 기록](supplementary-investigation-first-video-v0.1.md#2-근거-상태표) | 신청 안내와 일정한 진행 상황 통지. 이번 낭독에서는 직접적인 세부 기간을 확장하지 않음 |
| `LAW-2457` | [국가법령정보센터 개정문](https://www.law.go.kr/LSW/lsRvsDocListP.do?chrClsCd=010202&lsId=001671&lsRvsGubun=all) 및 [EP001 근거 상태표](supplementary-investigation-first-video-v0.1.md#2-근거-상태표) | 불송치 뒤 이의신청은 보완수사요구와 별도라는 구분 |
| `LAW-2458` | [국가법령정보센터 개정문](https://www.law.go.kr/LSW/lsRvsDocListP.do?chrClsCd=010202&lsId=001671&lsRvsGubun=all) 및 [EP001 근거 상태표](supplementary-investigation-first-video-v0.1.md#2-근거-상태표) | 재수사요구가 별도 절차라는 구분 |
| `LAW-24513` | [국가법령정보센터 제245조의13 개정문](https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=13&joNo=0245&lsiSeq=288579&urlMode=lsScJoRltInfoR) | 의견·자료 확인 가능성과 재판상 증거 사용 제한 |
| `LAW-TRANS` | [법률 제21857호 개정문·부칙](https://www.law.go.kr/LSW/lsRvsDocListP.do?chrClsCd=010202&lsId=001671&lsRvsGubun=all) 및 [EP001 근거 상태표](supplementary-investigation-first-video-v0.1.md#2-근거-상태표) | 2026-10-02 예정 시행일·조항별 시행일·적용례 |
| `LAW-TRANS-APPLICATION` | [부칙 제12조 경과조치 기록](supplementary-investigation-first-video-v0.1.md#2-근거-상태표) | 조건부 최대 90일 경과조치. 모든 사건의 일반 연장으로 확대하지 않음 |
| `BILL-2220257` | [국회 의안정보](https://likms.assembly.go.kr/bill/billDetail.do?billId=PRC_N2W6S0L7W2J9D1I8A1B1I5I1G6H8F5) | 법률 공포일 확인 |
| `UNKNOWN-OUTCOME` | [EP001 근거 상태표의 시행 전 불확실성](supplementary-investigation-first-video-v0.1.md#2-근거-상태표) | 처리기간·연장 빈도·재요구·처분·피해 회복은 시행 전 미확정 |
| `FICTIONAL-SCENARIO` | [기존 v1의 가상 중고거래 고지](episode-001-live-action-script-draft-v1.md) | 실제 사건·피해자·수사기록으로 오인하지 않을 편집상 전제 |

## 편집 검토 메모

이 리팩터링은 소재를 찾기 쉽도록 법률 주장을 바꾼 것이 아니다. 먼저 시청자가 이해할 질문과 법률상 변화의 순서를 정한 뒤, 각 행의 대상·행동에 맞는 화면을 수급하도록 요구사항을 다시 쪼갠 것이다. 적합한 원본이 없으면 다른 사건을 실제 사건처럼 대체하지 않고 해당 화면을 미확보로 남긴다. `source_contract`, `visual_treatment`, `motion_contract`, 권리 검토와 사용자 승인은 별도 단계다.

## 검토 명령

```powershell
git diff -- wiki/syntheses/episode-001-script-refactor-v2.md
```
