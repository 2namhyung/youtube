# VQazcEuV9Xw 샷·모션 역설계 v2 보고서

- Source: [YouTube reference](https://youtube.com/shorts/VQazcEuV9Xw?si=ItY8QKfQsT2nwNzT)
- Evidence: [v2 manifest](measurements/manifest.json), [whole-video samples](evidence/), [candidate before/after frames](evidence/candidates/), [pose detail](evidence/pose-detail-01.png)
- Generated map: [shot-analysis.json](shot-analysis.json)
- Status: analysis-only; comparison includes a left-side excerpt of the source and a right-side own SVG study; no production admission, provider call, voice, upload, or publication

## 조사 결과

대본 의미 구조와 0.5초 전체 샘플, 20개 detector 후보, 44–48.5초 0.1초 상세 샘플을 결합해 22개의 연속 grouped visual beat를 작성했다. 20개 후보를 그대로 hard cut으로 확정하지 않고, 같은 배경 안에서의 pose·prop 변화와 실제 장면 전환 후보를 분리했다. 모든 row는 `[startFrame, endFrame)`으로 `0..1464`를 빈틈없이 덮으며, `startSeconds`·`endSeconds`는 `frame × 1001 / 30000`으로 계산했다.

컨테이너 duration은 48.854초로 보이지만 마지막 decoded frame의 exclusive endpoint는 1464이고 frame-domain 시간은 48.8488초다. 이 연구에서는 후자를 샷 계산에 사용한다. Source: [manifest](measurements/manifest.json).

## 전체 grouped visual beat 표

`narrationSummary`는 화면에 탄 자막이 전달하는 의미를 짧게 바꿔 쓴 것이며 원문 대본·음성 전사가 아니다. `observed`는 직접 확인한 화면이고, `layers`·`techniques`·`recipe`는 추론 또는 제안이다.

| ID | 프레임 / 초 | 의미 요약 | 관찰된 화면 | 레이어·기법 |
|---|---|---|---|---|
| 001 | 0–63 / 0.000–2.102 | AI 과신 경고 도입 | 제목 띠·회색 중앙 | title/hold |
| 002 | 63–176 / 2.102–5.873 | 농부 소개 | 논·산 배경과 농부 | body/face/prop overlay |
| 003 | 176–244 / 5.873–8.141 | AI와 첫 접촉 | 전화와 로봇 등장 | prop reveal/entry |
| 004 | 244–280 / 8.141–9.343 | 로봇과 기대는 농부 | 실내 흐림 배경·로봇·농부 | intra-event composite/hold |
| 005 | 280–367 / 9.343–12.246 | 농사 관련 자신 있는 답 | 색 공 그래픽 추가 | overlay/caption pop |
| 006 | 367–433 / 12.246–14.448 | 농부가 AI에 질문 | 등진 농부·말풍선 | speech bubble/pose |
| 007 | 433–473 / 14.448–15.782 | 신뢰 형성 | 전화기를 든 농부 | pose/prop transform |
| 008 | 473–503 / 15.782–16.783 | 시간 전환 | 흐림·전환 문구 | blur transition |
| 009 | 503–575 / 16.783–19.186 | 해충 문제 | 작물 밭·벌레 그래픽 | background/graphic |
| 010 | 575–678 / 19.186–22.623 | 혼합물 질문 | 드론과 함께 상승하는 농부 | parent transform/anchor |
| 011 | 678–776 / 22.623–25.893 | 혼합물 제안 | 관자놀이를 짚는 로봇·병 | pose/prop appearance |
| 012 | 776–811 / 25.893–27.060 | 자신 있는 추천 | 병은 유지되고 pose 변화 | pose/expression swap |
| 013 | 811–866 / 27.060–28.896 | 혼합물 준비 | 농부가 그릇을 젓음 | hand pose/prop motion |
| 014 | 866–910 / 28.896–30.364 | 밭에 적용 | 드론·분사 흔적 | transform/overlay 후보 |
| 015 | 910–941 / 30.364–31.398 | 다음 시점 | 문간의 농부 | background swap/hold |
| 016 | 941–1008 / 31.398–33.634 | 밭 상태 변화 | 푸른 밭에서 갈색 밭 | background swap/wipe 후보 |
| 017 | 1008–1066 / 33.634–35.569 | 결과를 발견 | 놀란 농부·병 | face swap/punch-in |
| 018 | 1066–1169 / 35.569–39.006 | 병 클로즈업·작물 손상 강조 | 병·마른 밭·병 하단 퇴장 | closeup/foreground exit |
| 019 | 1169–1203 / 39.006–40.140 | 머리를 감싸는 반응 | 농부 단독·양손 머리 | pose swap/expression |
| 020 | 1203–1304 / 40.140–43.510 | 농부·로봇 대면 | 로봇 등·화난 농부 | two-character composite |
| 021 | 1304–1430 / 43.510–47.714 | 로봇 응답·검지 | 정면 로봇·44.4초 흐림·검지 | pose swap/blur |
| 022 | 1430–1464 / 47.714–48.849 | 마지막 punchline | 긴 손잡이가 있는 금속성 소품 후보·RGB glitch | prop/glitch/end hold |

## 관찰·추론·미확인

직접 관찰한 것은 농부·로봇·드론·밭·전화·병·그릇·말풍선·색 공·벌레 그래픽·검지 pose·마지막 소품과 자막 변화다. 19.5–22.5초에서는 드론이 올라가고 농부가 양손으로 매달린 상태로 함께 움직이며 손의 상대 위치가 유지되는 것을 상세 샘플에서 확인했다. 27.5–28.5초에는 손과 막대가 좌우로 반복 이동하고, 29–30초에는 드론이 오른쪽에서 왼쪽으로 이동하며 분사 흔적이 연결된다. 30.5초에는 목재 문이 농부를 가렸다가 양쪽으로 열리는 듯한 reveal이 보이고, 32.5–33초에는 하늘을 유지한 채 작물 영역이 바뀐다. 35.5초 이후에는 병 close-up과 마른 밭이 이어지며 37.5초 무렵 병이 하단으로 빠진다. 44.4–44.7초에는 머리·몸 변화와 흐림이 보이고, 44.8초 무렵 검지 pose가 나타난다. 47.7초에는 왼쪽 화면 밖 긴 손잡이와 연결된 금속성 소품 후보가 들어오고 47.8초 이후 자막의 RGB/glitch 변화가 보인다. Source: [full sample 03](evidence/full-sample-03.png), [full sample 04](evidence/full-sample-04.png), [full sample 05](evidence/full-sample-05.png), [v1 drone detail](../reference-reverse-v1/analysis/detail-drone-rise-19p5-23p0.png), [robot pose detail 01](evidence/pose-detail-01.png), [robot pose detail 02](evidence/pose-detail-02.png), [robot pose detail 04](evidence/pose-detail-04.png), [robot pose detail 05](evidence/pose-detail-05.png).

추론한 것은 사진·생성 배경 위 투명 캐릭터 overlay, pose replacement, parent-group transform, graphic overlay, short blur transition이다. 이것은 자체 자산으로 재현하기 위한 편집 분류이지 원본 제작자의 실제 레이어·파일·소프트웨어를 발견했다는 뜻이 아니다. 6.0–8.0초 후보는 배경이 유지된 채 전화 정면에서 로봇 close-up과 농부가 추가되는 intra-event로 보일 수 있고, 25.9초 후보의 pose 변화도 hard cut으로 확정하지 않는다. 27.5–28.5초 손·막대의 좌우 반복은 제한 애니메이션 후보로 기록했다. 29–30초에는 드론이 오른쪽에서 왼쪽으로 이동하고 분사 흔적이 연결되지만, 배경이 정지 사진처럼 보여 cutout transform + spray layer 가설을 우선하며 source video라고 부르지 않는다. 30.5초 문간은 목재 문 패널이 농부를 가렸다가 양쪽으로 열리는 듯한 reveal 후보이고, 32.5–33초는 하늘을 유지한 채 작물 영역이 바뀌는 후보이다. 37.5초 병 이탈은 별도 장면 cut보다 foreground exit 후보로 남긴다.

미확인인 것은 원본의 사진·캐릭터·제품·소품 출처, CC·재사용 권리, 실제 사건 여부, 정확한 easing·회전각·픽셀 이동량, 중간 프레임의 보간 여부, 밭 상태 변화의 원인, 농약 제품의 사실성이다. 이 영상이 설명하는 의미 beat는 사건 사실로 승격하지 않는다.

## 필요한 자체 자산과 구현 recipe

| 그룹 | 필요한 자체 자산 | 제안 기법 |
|---|---|---|
| 농부 | 중립·전화 등짐·전화 들기·젓기·놀람·머리 감싸기·화난 pose, 얼굴 표정 세트 | 동일 anchor의 PNG pose 교체; 연속 관절 보간은 별도 검증 |
| 로봇 | 정면 중립·관자놀이·미소·검지 pose, 표정 세트 | 병 prop anchor를 유지한 pose/expression swap |
| 소품 | 전화·말풍선·색 공·병·그릇과 막대·드론·분사 그래픽·긴 손잡이 금속성 소품 후보 | PNG/SVG overlay, opacity/scale/clip; 원본 정체를 복제하지 않음 |
| 배경 | 중립 회색·논·실내·디지털 공간·문간·푸른 밭·갈색 밭 | 권리 확인 또는 자체 생성 배경을 named slot으로 교체 |
| 전환 | 흐림, wipe 후보, caption RGB/glitch | 짧은 opacity/blur/clip-path; 정확한 원본 curve는 미확정 |

대표 재현 recipe는 두 가지다. 드론 장면은 드론·농부·얼굴을 부모 그룹으로 묶고 양손 anchor를 연결한 뒤 `translateY`와 작은 회전을 frame/fps로 계산한다. 로봇 장면은 정면 hold에서 미소·검지 pose로 교체하고, 44.4–44.7초의 흐림 window와 47.7초 이후 소품·glitch를 독립 레이어로 둔다. 두 recipe의 수치와 easing은 제안값이며 원본 측정값이 아니다. [comparison.mp4](reconstruction/output/comparison.mp4)는 왼쪽 원본 발췌와 오른쪽 자체 SVG 연구 렌더를 나란히 보여준다. reconstruction-only 산출물은 자체 SVG만 사용하며, SVG는 사진·캐릭터 외형 복제가 아니라 동작 구조 예시다. Source: [comparison manifest](reconstruction/output/manifest.json), [motion parameters](reconstruction/config/motion-parameters.json).

## 권위와 재사용 경계

이 보고서와 JSON은 단일 레퍼런스의 독립 연구 deliverable이다. v1 원본·evidence는 보존하며, 원본 재사용 권리는 확인하지 않았다. 비교 MP4는 왼쪽 원본 발췌와 오른쪽 자체 SVG 구조 예시를 포함한 로컬 분석물이고, reconstruction-only 산출물은 자체 SVG만 포함한다. 공개·제작용 승인이나 사건 증거 승격은 없다. canonical contract의 ImageGen/Flow/I2V, owner voice, factual/legal review, provider, render, upload, publication, Stage 07 gate를 변경하거나 열지 않는다. Remotion·GSAP·Motion Canvas 조사와 관련 거절 이력은 설계 참고일 뿐 이 레퍼런스의 원본 제작도구 증거가 아니다.
