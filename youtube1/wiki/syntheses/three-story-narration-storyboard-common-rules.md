# 경찰관·제주·간호조무사 3편 공통 내레이션·스토리보드 규칙

- 작성일: 2026-08-15
- 상태: design guidance; production authority 아님
- 상위 계약: [뉴스룸 영상 제작 canonical contract](../pipelines/newsroom-video-production.md)
- 편집 근거: [짧주 분석 기반 스토리보드 개선](short-form-storyboard-upgrades-from-shortju.md)
- 모션 근거: [뉴스룸 2–3초 컷 모션 패턴](newsroom-cut-motion-pattern-catalog.md)

## 먼저 지켜야 할 권위 경계

이 문서는 세 대본을 다시 쓰거나 cut plan을 봉인하지 않는다. 현재 승인 대본·내레이션에 없는 사실을 음성으로 추가하려면 새 script/title/narration 승인과 locked timing이 먼저다. 화면으로만 보충하는 사실도 `newsroom-storyline-v2`의 evidence subspan과 출처를 가져야 한다.

- 경찰관 사건: [승인 대본 텍스트](../../03-script-voice/runs/research-6b1a8af9b4143acb-narration-20260811/approved-empathy-owner-voice-v1.txt), [owner narration 승인](../../06-production/opencut-automation/production/newsroom/narration-approvals/research-6b1a8af9b4143acb.json), [최신 reconciliation](../../06-production/opencut-automation/production/newsroom/reconciliations/research-6b1a8af9b4143acb/reconciliation-38a660c4c1e120d426c26026.json).
- 제주 사건: [final script](../../06-production/video_project/final_script.txt), [승인 narration handoff](../../03-script-voice/releases/qwen-jeju-canonical-20260801/approved-narration/handoff.json). 기존 v10–v17 storyboard와 과거 생성 영상은 새 canonical cut plan이 아니다.
- 간호조무사 사건: [명시적 script binding](../../06-production/opencut-automation/production/newsroom/projects/research-657380fce7eaccc9.script-binding.json), [bound final script](../../06-production/opencut-automation/production/projects/coffee-pesticide-hospital-short-v1/script.final.json), [quality record](../../06-production/opencut-automation/production/newsroom/projects/research-657380fce7eaccc9.quality.json), [script QA](../../06-production/opencut-automation/production/newsroom/projects/research-657380fce7eaccc9.script-qa.json). 대체 project script는 binding authority가 아니다.

## 공통 7단 이야기 뼈대

세 영상 모두 아래 순서를 사용한다. 한 단계가 여러 문장이라면 locked narration timing을 따라 2–3초 컷 여러 개로 나누며 고정 cut 수를 만들지 않는다.

| 단계 | 대본 기능 | 기본 이미지 역할 | 우선 source class |
|---|---|---|---|
| 1. 훅 | 평범한 상황과 비정상 결과를 한 문장에 충돌 | `consequence` 또는 `direct-evidence` | `actual-case-evidence`, 없으면 명확히 표시한 `institutional-context` |
| 2. 대상·장소 | 누구·어디·무엇인지 고정 | `identity`, `context` | `institutional-context`, 권리 확인된 실제 장소 |
| 3. 사건 행위 | 시간 순서와 핵심 행위를 설명 | `context`, `direct-evidence` | 실제 증거가 없으면 `grok-generated`로 비식별 재현 |
| 4. 직접 증거 | 휴대전화·CCTV·커피·문서·영장처럼 사건을 지탱하는 물증 | `direct-evidence` | `actual-case-evidence` 우선; screenshot 권리 별도 심사 |
| 5. 수사·재판 | 입건·영장·기소·판결을 구분 | `comparison`, `direct-evidence` | 법원·경찰 등 `institutional-context`와 권리 허용 문서 재구성 |
| 6. 남은 간극 | 처벌 공백·보호 공백·피해 지속을 설명 | `comparison`, `consequence` | 수치·법 조항·기관 대응, 필요하면 비식별 `grok-generated` |
| 7. 결론 | 피해자 관점의 질문 또는 제도적 질문 | `consequence`, `reaction` | 실제 장소로 돌아가거나 절제된 생성 컷; 밈 금지 |

## 모든 컷에 필요한 공통 필드

| 필드 | 규칙 |
|---|---|
| `narrationSubspan` | locked narration의 정확한 시작·끝. 문장 전체가 아니라 의미 절 단위 |
| `visualRole` | `identity`, `context`, `direct-evidence`, `comparison`, `consequence`, `reaction` 중 하나 |
| `sourceClass` | canonical enum인 `actual-case-evidence`, `institutional-context`, `generic-stock`, `grok-generated` 중 하나 |
| `imageContribution` | `adds-identity`, `adds-place`, `adds-proof`, `adds-comparison`, `adds-consequence`; `repeats-narration`만이면 재설계 |
| `claimDelta` | 대본에는 없지만 화면이 추가하는 검증된 사실 한 개. 없으면 `none` |
| `evidenceAuthority` | claim ID, origin URL, source span, rights/admission ID. agent 설명만으로 생성 금지 |
| `reuseState` | `first-use`, `return-wide`, `return-crop`, `return-with-overlay` |
| `motionIntent` | 실제 사진은 `hard-cut`, `slow-push`, `crop-shift`, `source-highlight`; 행동은 `natural-action` |
| `sensitivity` | minor, victim, suspect, privacy, trademark, geographic mismatch, case-party implication |
| `durationIntent` | 원칙 2–3초. 필수 문장 경계만 근거와 함께 1.5–3.5초 |

## 대본에 없는 뉴스 자료를 넣는 규칙

1. 화면이 추가하는 사실은 한 컷에 하나만 둔다.
2. 추가 사실은 sealed storyline의 evidence subspan에 먼저 들어가야 한다.
3. 숫자·날짜·법적 이유는 짧은 source chip과 함께 최소 0.7초 안정적으로 보인다.
4. 내레이션과 충돌하거나 결론을 바꾸는 정보는 visual delta로 숨기지 않고 대본을 새로 승인한다.
5. 커뮤니티·SNS 주장, 출처 없는 screenshot, 뉴스사 워터마크 사진은 direct evidence로 승격하지 않는다.
6. 법령·판결문은 원문 screenshot을 그대로 복제하기보다 허용된 범위에서 조항·결론을 재구성하고 authority를 metadata에 묶는다.

## 3편별 적용

### 1. 경찰관 부친·휴대전화 사건

| 대본 구간 | 이미지 설계 | 화면이 추가할 수 있는 검증 정보 | 전환 |
|---|---|---|---|
| 교사가 고소했지만 경찰관 아버지가 휴대전화를 파손 | 부서진 휴대전화의 비식별 재현 + 사건 제목 | 휴대전화가 핵심 증거였다는 점 | hard cut |
| 전주 파출소 A 경감·고등학생 아들 | 전주 지역 경찰시설 자료사진, 신분은 익명 label | 직급·관할·사건 위치 | location match cut |
| 아들 송치, 뒤늦은 전수조사에서 발견 | 송치 문서 역할 카드 → 조사 grid | 전수조사 117건·송치 44건은 authoritative source가 storyline에 승인될 때만 시각화 | document hard cut |
| 동료 비판과 직무 모순 | 경찰 배지/증거 보전 표식의 split comparison | 비판 발언의 정확한 출처 | split wipe |
| 입건·자택 압수수색·개입 의혹 확인 | 경찰→주거지→수사선 3단 timeline | 각 절차의 날짜·현재 상태 | directional hard cuts |
| 친족 특례의 처벌 간극 | 형법 제155조 구조를 ‘입건 가능/처벌 간극’ 두 칸으로 재구성 | 친족 특례가 적용된다는 경찰 설명과 조문 | comparison split |
| 수사 신뢰 질문 | 처음의 경찰시설로 돌아가 evidence marker만 남김 | `none`; 새로운 단정 금지 | return match cut |

주의: 실제 아버지·아들·교사 사진은 찾거나 생성해 실인물처럼 제시하지 않는다. 현재 cross-source verification과 반론·Context/Legal handoff, storyline-v2/cut-plan-v2가 봉인되기 전에는 위 표는 제안이다.

### 2. 제주 초등학교 교실 침입 사건

| 대본 구간 | 이미지 설계 | 화면이 추가할 수 있는 검증 정보 | 전환 |
|---|---|---|---|
| 가상 ‘교권보호국’ 질문 | 실제 학교 복도 자료사진 + `가상 조직` label | 실제 기관으로 오인하지 않도록 허구임을 명시 | hard cut |
| 4월 교실 침입·텀블러 오염 | 빈 교실 전체 → generic tumbler 세부 | 4월 28일 등 exact date는 source가 승인될 때 timeline label | position match cut |
| 감식 결과와 교사의 충격·병가 | 감식 봉투/기관 자료 → 비어 있는 교사 자리 | 피해자의 병가·보호 요청 출처 | foreground occluder |
| 6월 두 번째 침입·의자 오염 | 같은 교실 구도를 재사용하되 chair crop으로 변경 | 두 사건 사이 간격과 반복성 | return-crop hard cut |
| CCTV로 특정 | CCTV 카메라→route→비식별 인물 marker | CCTV 설치 시점과 식별 과정 | source-highlight |
| 16세 학생 인정·성적 목적 부인 | 얼굴 없는 익명 profile, 주장과 확인 사실을 분리 | 미성년자, 혐의·주장 구분 | split comparison |
| 공개 혐의·포렌식 요청·영장 기각 | 건조물 침입/재물손괴 label → 휴대전화→기각 stamp | 교사노조가 밝힌 영장 기각이라는 출처 한계 | document hard cuts |
| 피해자의 불안과 보호 시스템 | 빈 교실·잠긴 문·출입통제 reader 순서 | 교실 이동·보호 조치 등은 승인된 출처가 있을 때만 | directional push |
| 현실의 교권보호 질문 | 출입통제·수사 안내·피해자 통지를 3개 node로 정리 | 제안과 현행 제도를 명확히 구분 | constellation reveal |

주의: 텀블러·의자·학생·교사의 실제 사건 사진은 권리와 프라이버시가 해결되지 않으면 사용하지 않는다. 기존 v10–v17 visual은 역사적 증거일 뿐 새 storyboard authority가 아니다.

### 3. 간호조무사·커피 살충제 사건

| 대본 구간 | 이미지 설계 | 화면이 추가할 수 있는 검증 정보 | 전환 |
|---|---|---|---|
| 평범한 커피→살충제 | 권리 허용 coffee 사진 전체 → 자리 비움 → 비식별 재현 | `none`; 브랜드·제품을 실제 살충제로 단정 금지 | object match cut |
| 구리 병원·직장 갈등 | generic 병원 복도와 빈 책상 | 사건 장소·날짜는 법원/기사 source가 승인될 때 label | hard cut |
| 커피에 투입·한 모금·건강 피해 | 컵, 손의 접근은 생성 재현, 이후 멈춘 컵과 진료 기록 역할 카드 | 위장장애·불안장애의 판결상 인정 범위 | cut-on-action → hard cut |
| 살인미수 주장 vs 특수상해 인정 | 두 법적 결론을 좌우 비교 | 살인미수 불인정 이유는 정확한 판결 근거가 있을 때만 추가 | split wipe |
| 1심 2년→항소심 1년 6개월·집행유예 3년 | sentence rail 하나가 두 상태로 변화 | 법원·선고일·사건번호는 authority가 있을 때 source chip | timeline state change |
| 피해자의 지속되는 불안 | 열린 컵→건네받은 음료→빈 자리의 실제 generic 사진 3개 | 피해 영향이 판결/보도에 기록된 범위를 넘는 단정 금지 | hard-cut sequence |
| 안전하게 일할 수 있는가 | 병원 복도로 돌아가 컵만 남긴 정지 컷 | `none`; 제도적 질문으로 마감 | return match cut |

주의: 특정 농약 용기 사진은 실제 사용 물질처럼 보이면 안 된다. Roundup 등 상표 사진은 blur/crop과 `사건과 무관한 자료사진` 표시가 있어도 conditional이다. 현재 binding conflict와 QA 기록 간 상태 차이를 먼저 reconciliation해야 한다.

## 공통 실사 80% 계획

- 비율은 사진 개수나 컷 개수가 아니라 admitted real-media cut의 authored duration 합계로 계산한다.
- 세 영상 모두 장소·기관·물건·절차·결과 컷을 실사로 채우고, 실제 사건 행동·미성년자·피해자·민감 증거만 `grok-generated`로 남긴다.
- 동일 asset 재사용은 허용하되 cut마다 exact asset ID/SHA/rights와 `reuseState`를 묶는다.
- screenshot과 문서는 실제 화면이어도 재사용 권리가 없거나 source admission이 없으면 실사 coverage에 산입하지 않는다.
- locked narration과 sealed cut plan이 없으면 80% 수치는 provisional이며 승인할 수 없다.

## 공통 승인 gate

1. 각 영상의 현재 script/title/narration authority와 실제 bytes·SHA를 재확인한다.
2. stale preview, superseded voice, conflict authority를 reconciliation한다.
3. storyline-v2에서 narration fact와 visual-only claim delta를 모두 승인한다.
4. semantic-cut-plan-v2에서 2–3초 subspan을 봉인한다.
5. real-media needs와 acquisition admission을 만든다.
6. authored-duration 80%를 독립 검증한다.
7. 그 뒤에만 local real-media edit와 필요한 `grok-generated` storyboard를 진행한다.

