# 한국 정책·시사 영상 실사 소스 수급과 권리 판정 v1

- 작성일: 2026-09-10
- 범위: EP001 보완수사권 및 향후 한국 정책·시사 영상
- 적용 원칙: 누구에게도 연락·허가 요청·계약·구매·직접 촬영하지 않고, 공개 페이지 또는 파일 자체에 상업 이용과 편집 허용이 명시된 self-service 소스만 운영한다.
- 권위: 운영 기준 문서. `episode-spec.json`, generated manifest, active cut manifest, production state를 변경하지 않는다.
- 기존 기준: [route registry](../../video/source-intake/episode-001/korean-routes-v01/route-registry.json), [manual template](../../video/source-intake/episode-001/korean-routes-v01/manual-intake-template.json), [rights inventory](../../video/source-intake/episode-001/full-script-usable-v01/rights-inventory.json)

## 2026-09-13 현재 제작 루트 적용

현재 컷 수·모드는 [episode-spec](../../video/episodes/episode-001/episode-spec.json)의 64컷(실사 23·모션그래픽 25·Omni 16) 계획을 따른다. 아래 기존 registry 수·48컷 검토 기록은 역사적 원장이며 현재 선택·승인 상태가 아니다. 검색·원본 확보와 사람의 권리/의미 검토는 별도다.

한국 기관·장소의 정체성은 한국 원본으로 확인한다. 반면 파일철·봉투·CCTV 기기·달력 등 장소 중립인 독립 사물은 의미와 이용 조건이 맞는 공개 원본까지 검색한다. 이 예외는 외국 기관을 한국 기관처럼 쓰거나, 실제 인물·사건을 생성하는 허가가 아니다. 새 검색 route `commons-object`는 그러한 사물 원본의 비생산 후보 발견 경로다. 기존 self-service의 연락·계약·구매·직접 촬영 제외는 유지한다. 구체적인 실행·선택 조건은 [현재 수급 파이프라인](../concepts/media-acquisition-pipeline.md)을 따른다.

## 운영 상태를 읽는 법

기존 19개 registry의 기술 상태는 `live-operational` 6, `implemented-awaiting-key` 2, `manual-intake-ready` 8, `rights-contract-required` 3이다. 이 숫자는 과거 수집 경로의 준비 상태이고 권리 허가가 아니다.

이 문서의 더 엄격한 self-service overlay는 다음과 같다.

- **기존 registry ID 운영 allowlist 4개**: `kogl-photo`, `kogl-video`, `wikimedia-korea-fallback`, `loc-korea-fallback`. 단, item-level 공개 라이선스와 상업 이용·편집 허용이 확인된 파일만 통과한다.
- **기존 registry ID 제한 fallback 1개**: `pexels-generic-last`. Pexels 라이선스와 정치 맥락 제한을 만족하는 object-only 파일만 사용한다. 사람·손·식별 가능한 신체가 있으면 제외한다.
- **기존 registry ID operational excluded 14개**: 공개 라이선스가 명시되지 않은 국회·국가기관·KTV·정책브리핑·e-브리핑·YNA/YTN·유료 스톡·YouTube Standard·직접 촬영 등. 문의·허가·계약·구매로 상태를 바꾸지 않는다.
- **registry 밖 self-service allowlist class 4개**: 미 연방정부가 직접 만든 Public Domain, 실제 YouTube CC BY, 공식기관 첨부 중 게시물 자체에 공개 라이선스가 표시된 항목, 기관 공개 다운로드 중 동일 조건을 충족하는 항목.

따라서 “live-operational”이나 API key가 있다는 말은 수집 endpoint가 응답한다는 뜻일 뿐이다. 실제 제작 허용은 이 문서와 item-level license·semantic·technical 검수를 모두 통과해야 한다. 권리 표시가 없거나 범위가 모호하면 `excluded-unverified`로 즉시 기록한다. 연락·문의·계약·구매를 다음 행동으로 남기지 않는다.

EP001은 한국 공식·공공 자료를 먼저 찾되, 의미가 맞지 않는 한국 행사 사진을 억지로 사용하지 않는다. 한국 공식 자료가 없을 때는 한국 위치 metadata가 명시된 Commons/LOC를 fallback으로 쓰고, Pexels는 마지막 object-only fallback으로만 사용한다. 가상 사건은 Omni로만 만들며 실제 사건 자료처럼 보이게 하지 않는다. 직접 촬영은 사용자 지시로 제외한다.

## route matrix

`허용`은 공개 라이선스에 상업 이용과 편집 허용이 명시되고, 원본을 self-service로 받을 수 있으며, 의미·기술 검수를 통과한 경우뿐이다. 권리 표시가 없거나 범위가 모호하면 연락·문의·계약으로 보완하지 않고 즉시 제외한다.

|route/provider|매체·한국성·용도|접근·현재 상태|self-service 권리 조건|위험|운영 판정|
|---|---|---|---|---|---|
|국회 의원사진|사진. 국회·의정 활동 일반 맥락|국회 Open API, `ASSEMBLY_API_KEY` 설정. `assembly-member-photos`, legacy live-operational|API 응답 자체에 상업 이용·편집 허용 license가 명시된 경우만|초상, 로고, 문서, 특정 회의·발언 오인|excluded by default|
|국회 이미지자료실·보도자료 첨부|사진/영상. 본회의·위원회·국회 건물|공식 URL 발견. `assembly-image-attachments`, legacy manual-intake-ready|게시물 자체에 CC/KOGL/PD 등 공개 상업·편집 license가 표시된 항목만 generic prelicensed class|참석자 초상, 행사 의미, 음원|excluded by default; explicit public license만 allowlist|
|KOGL 사진·영상|사진/영상. 한국 기관·업무·생활|data.go CSV/KOGL catalog. `kogl-photo`, `kogl-video`, legacy live-operational|각 item에 적합한 KOGL 유형과 상업 이용·편집 허용, 출처표시, 원본 URL, 제공기관, 제3자 권리가 명시되어야 함. [KOGL license](https://www.kogl.or.kr/info/licenseType1.do)|유형별 표시·변경 조건, 인물·상표·음원, CSV/원본 불일치|allowlist: item license verified|
|디지털문화자원|메타데이터·썸네일·원본 후보. 한국 문화·기관 발견|`B553457` API, `DATA_GO_KR_SERVICE_KEY` 설정. legacy live-operational; metadata stage|API metadata는 발견용. API 또는 원본 item 자체에 공개 상업·편집 license가 없으면 materialize하지 않음|제3자 소장물, 썸네일/원본 권리 차이|production excluded; 별도 공개 license item만 재검토|
|국가기록원 사진·문화영화|사진/영상. 한국 역사·공공기관|전용 key 미설정. `national-archives-api`, legacy implemented-awaiting-key|기록물 페이지에 공개 상업·편집 license 또는 PD가 명시된 item만 허용|역사 인물·유족·음원·제3자 기록물|excluded by default; explicit public license/PD만 allowlist|
|경찰청 공식 첨부|사진/영상. 경찰서·상담·문서 일반 맥락|police.go.kr 발견. `national-police-official`, legacy manual-intake-ready|게시물 자체에 상업·편집 공개 license가 명시된 항목만. 표시가 없으면 제외|피해자·피의자·경찰관, 개인정보, 엠블럼·음원|excluded; explicit prelicensed item만 예외|
|검찰청 공식 첨부|사진/영상. 검찰기관·문서 일반 맥락|spo.go.kr 발견. `prosecution-official`, legacy manual-intake-ready|게시물 자체의 공개 상업·편집 license가 없는 자료는 제외|사건 관계인, 수사기록, 로고, 제3자 자료|excluded; explicit prelicensed item만 예외|
|법무부 공식 첨부|사진/영상. 법무행정·문서 일반 맥락|moj.go.kr 발견. `moj-official`, legacy manual-intake-ready|페이지 자체에 공개 상업·편집 license가 표시된 경우만. 의미가 맞지 않으면 제외|행사 사진의 정책 절차 오인, 인물·로고·음원|excluded; explicit prelicensed item만 예외|
|정책브리핑 Korea.kr|사진/영상/기사. 정부 브리핑|korea.kr 발견. `policy-briefing-official`, legacy manual-intake-ready|텍스트 KOGL 표시를 사진·영상에 확장하지 않음. 미디어 자체 공개 license가 없으면 제외|제3자 사진·방송물·음원|excluded; 기존 audit에서도 media rights 미확인|
|KTV|방송 영상·사진. 한국 공공기관·현장|ktv.go.kr 발견. `ktv-official`, legacy manual-intake-ready|`무단전재 및 재배포 금지` 표시는 허용 목록이 아님. 공개 상업·편집 license가 없으면 제외|방송 음원, 출연자, 제3자 취재물, 워터마크|excluded|
|e-브리핑|브리핑 영상. 한국 정부 발표|ebriefing.go.kr 발견. `e-briefing-official`, legacy manual-intake-ready|페이지 자체에 공개 상업·편집 license가 없으면 제외|발표자 초상·음성, 기자 화면, 음원·로고|excluded|
|data.go.kr 일반 API|메타데이터·파일 URL. 한국 공공 원본 발견|서비스별 endpoint 발견|API 이용 가능과 원본 저작권은 분리. 공개 license 없는 원본은 제외|응답 복제와 원본 배포 권리 혼동|production excluded unless item public license|
|국가기록원 외 일반 공공기관|사진/영상/문서. 한국 업무 일반 맥락|기관 공개 페이지 발견|파일/게시물 자체에 CC/KOGL/PD 등 상업·편집 조건이 명시된 공개 다운로드만 허용|기관 로고·개인정보·행사 참석자·제3자|excluded by default; explicit public-license download만 allowlist|
|Wikimedia Commons|사진/영상. 한국 위치·기관 metadata fallback|Commons API/파일 페이지·upload URL. `wikimedia-korea-fallback`, legacy live-operational|파일 페이지에 CC BY/CC BY-SA/CC0/PD가 명시되고 저작자·원문 URL·한국 위치 metadata가 확인되어야 함. SA 조건과 변경사항 기록|출처표시, SA, 인물·상표·음원, 파일 불일치|allowlist: public license + semantic/technical pass|
|미 의회도서관 LOC|사진/영상. Seoul/Korea metadata 역사·장소 fallback|loc.gov item·Rights and Access. `loc-korea-fallback`, legacy live-operational|item Rights and Access가 상업·편집 이용을 명시한 경우만. 모든 LOC가 PD는 아님|역사 인물·제3자 소장물·위치 오인|allowlist only when item rights explicit|
|미 연방정부 Public Domain|사진/영상/문서. 미국 연방기관 직접 제작물|공식 원문·공개 다운로드 self-service|연방기관 직접 제작·PD 근거와 원본 URL 확인. 제3자 계약물·로고·인물·음원은 별도 제외|제3자 삽입물·상표·인물·음원|allowlist: PD + component review|
|Pexels|사진/영상. object-only 일반 B-roll 최후 fallback|API key 미설정. `pexels-generic-last`, legacy implemented-awaiting-key|[Pexels License](https://www.pexels.com/license/) 및 [정치 맥락 안내](https://help.pexels.com/hc/en-us/articles/360043229813-Can-I-use-photos-and-videos-from-Pexels-in-a-political-campaign) 확인. 사람·손·식별 가능한 신체·정치적 인물 묘사가 없는 object-only만|정책 맥락 인물, 상표·로고, model release·음원|restricted fallback: object-only only|
|연합뉴스/YNA|뉴스 사진/영상. 한국 사건·현장 직접 증거|`yna-licensed`, legacy rights-contract-required|계약·허가·문의 route는 운영하지 않음. item 자체 공개 CC/PD 예외만 generic class|뉴스 인물·피해자, 음원·그래픽·워터마크|excluded|
|YTN|뉴스 영상. 한국 정책·사건 취재|`ytn-licensed`, legacy rights-contract-required|YouTube 게시·공개 재생은 재사용 권리가 아님. item 자체 공개 CC/PD 없으면 제외|워터마크·하단 자막·앵커 음성·음원|excluded|
|유료 스톡 Artgrid/Storyblocks|사진/영상. 한국 위치·일반 맥락|`paid-stock`, legacy rights-contract-required|구매·구독·다운로드가 필요한 route는 운영하지 않음|기간·seat·프로젝트 제한, 모델·상표·음원|excluded|
|YouTube Standard|영상. 레퍼런스 분석·링크·임베드|공개 URL 분석. 파일 다운로드·편집·재업로드 금지|Standard는 기본 업로드 라이선스이며 재사용 허가가 아님. [YouTube license types](https://support.google.com/youtube/answer/2797468?hl=en), [Terms](https://www.youtube.com/t/terms)|Content ID·방송물·음원·워터마크|analysis/embed only; production excluded|
|YouTube 실제 CC BY|영상. 상세 페이지의 실제 CC BY|페이지 license label·원 게시자·설명·원 URL self-service 확인|실제 CC BY, 제목·저자·URL·license·변경 표시 및 영상 내 음원·인물·상표의 공개 권리를 모두 확인|attribution 누락, 잘못 붙은 CC, 제3자 구성요소|allowlist only after component review|
|별도 허가 YouTube|영상. 제작자 허가가 필요한 파일|허가·연락 route|self-service 정책에서 허가 요청·계약하지 않음|허가 범위·음원·출연자 불명|excluded|
|로컬/기관 제공 파일|사진/영상. 한국 현장·기관 자료|파일·게시물 자체에 공개 CC/KOGL/PD와 상업·편집 조건이 표시된 공개 다운로드만 검토. 메일·메신저·비공개 전달 제외|공개 license와 원본 URL 없으면 제외|파일명·기관 공개·제공자 말만으로는 부족|excluded by default; explicit public-license download만 allowlist|
|직접 촬영|사진/영상. 한국 생활 속 가상 사례 후보|사용자 지시로 운영하지 않음|촬영·동의·음원 확보를 하지 않음|직접 촬영 전제 금지|excluded|

## 권리 해석

- 공개 URL, API 응답, 기관 사이트, YouTube 임베드는 파일을 편집본에 복제할 권리와 다르다. YouTube Standard 영상은 레퍼런스 분석·링크·허용된 임베드만 한다.
- CC BY는 저작자·제목·원 URL·license·변경사항을 기록한다. CC BY-SA는 파생물 배포 조건을 검토한다. CC0와 PD도 사진 속 인물·상표·음원·제3자 삽입물까지 자동 해결하지 않는다.
- 공정이용·인용, 크레딧, 면책문구, 짧은 분량은 self-service 운영 근거로 사용하지 않는다. 이 정책에서는 권리 표시가 명확한 공개 라이선스만 사용한다.
- 수익화는 필수 필드다. 공개 라이선스가 있어도 상업 이용·편집이 명시되지 않거나 구성요소 권리가 불명확하면 즉시 제외한다.

## intake 단계

1. **Query** — 대본의 기관·행위·장소·문서·사건·가상 명사를 분리하고 한국 우선 route를 검색한다.
2. **Candidate** — URL, provider, media type, source kind, 한국 위치 근거, 화면 역할을 기록한다. 권리 미표시 후보는 `excluded-unverified`로만 기록한다.
3. **Rights gate** — 파일/게시물 자체의 공개 license URL, license name, commercial use, editing, monetization, attribution, SA, third-party, person, trademark, audio를 확인한다. 문의·허가·계약·구매 단계는 없다.
4. **Semantic gate** — `specific-event-evidence`, `general-context`, `fictional-reconstruction` 중 하나를 선택한다. 건물·문서·업무 화면은 직접 사건 증거라고 말하지 않는다.
5. **Technical gate** — 디코드 가능한 이미지 dimension 또는 양수 duration video, MIME·fps·audio·워터마크·SHA-256을 확인한다. 확장자·HTML·JSON만으로 통과시키지 않는다.
6. **Editorial window** — cut ID, approved-script excerpt, exact timecode/photo hold, source audio 처리, 반복 금지를 기록한다.
7. **Provenance** — 원본 URL·item page·license URL·retrieved date·local path·source SHA·derived SHA·attribution을 묶는다.
8. **Human review** — source mapping, rights, semantic, technical, full-cut contact sheet를 사람이 확인한다. 자동 검사는 사람의 권리·의미 승인을 대신하지 않는다.
9. **Materialization** — allowlist 통과 자산만 source-intake에 복사한다. `production_authority=false`인 후보를 production asset으로 승격하지 않는다.

필수 item 필드는 `route_id`, `provider`, `source_url`, `item_url`, `original_file_url`, `creator_or_shooter`, `publisher_or_owner`, `retrieved_at`, `rights_status`, `license_name`, `license_url`, `commercial_use`, `editing_allowed`, `monetization_allowed`, `attribution_text`, `share_alike_required`, `third_party_clearance`, `person_release_status`, `trademark_status`, `music_audio_status`, `semantic_role`, `specific_event_evidence`, `fictional_reconstruction`, `semantic_summary`, `location_or_institution_metadata`, `editorial_limits`, `local_original_path`, `sha256`, `mime_type`, `duration_seconds_or_dimensions`, `fps`, `audio_stream`, `watermark_status`, `source_timecode_or_photo_hold`다. 계약 ID·허가 메일·구매 영수증은 이 self-service 정책의 통과 필드가 아니다.

## 분류·reject codes

- `specific-event-evidence`: 원문이 해당 사건·회의·발언·절차를 실제로 보여주고 URL/timecode가 주장과 일치한다.
- `general-context`: 한국 기관·장소·업무라는 사실만 지지한다. 특정 보완수사권 사건의 기록으로 말하지 않는다.
- `fictional-reconstruction`: 대본의 가상 사건·인과만 Omni로 표현하며 `evidence=false`다. 실명 인물·실제 사건 증거를 생성하지 않는다.

표준 코드: `rights-unknown-immediate-exclusion`, `rights-provider-page-only`, `commercial-use-not-stated`, `editing-not-stated`, `monetization-not-stated`, `permission-or-contract-required-excluded`, `purchase-required-excluded`, `attribution-missing`, `share-alike-unresolved`, `third-party-rights-unresolved`, `person-release-unresolved`, `trademark-or-logo-unresolved`, `music-or-audio-unresolved`, `event-semantic-mismatch`, `general-context-misrepresented-as-evidence`, `fictional-content-presented-as-evidence`, `source-url-not-allowlisted`, `download-not-self-service`, `watermark-or-burned-caption`, `ui-or-web-capture`, `invalid-or-zero-duration`, `decode-failed`, `hash-mismatch`, `resolution-below-target`, `duplicate-source-over-cap`, `repeated-window`, `source-timecode-missing`, `direct-shoot-excluded`, `pexels-person-in-policy-context`.

권리 미확인은 pending으로 남기지 않고 즉시 `excluded-unverified` 또는 위 reject code로 기록한다. 후보 ledger에는 사유만 보존하고 연락·재허가·구매를 후속 행동으로 생성하지 않는다.

## 기술·편집 기준

- 영상은 양수 duration·디코드 가능한 stream, 이미지는 실제 dimension이 필수다. 1920×1080 target에 맞지 않으면 crop/contain과 정보 손실을 기록한다.
- 법률 원문·웹페이지 캡처는 provenance용이다. 읽혀야 할 정확한 문구는 raster capture 위에 재조판하지 않고 native DOM/vector text surface로 만든다.
- source audio는 별도 권리 필드다. 공개 license가 음원까지 포함한다고 명시하지 않으면 사용하지 않는다. 음소거는 영상 권리 문제를 해결하지 않는다.
- 사람은 초상·피해자·증인·공직자와 문맥을 점검한다. imagegen은 실명 인물·실제 사건 증거에 쓰지 않는다. 로고·상표·차량번호·개인정보·워터마크는 crop/blur/제외를 기록한다.
- 기본 연속 구간은 2~4초, 발언·문서 읽기는 4~8초다. 같은 원본 반복으로 빈 시간을 채우지 않는다.
- EP001 기존 감사의 참고값은 단일 원본 최대 약 14.3%, 평균 연속 구간 약 3.226초다. 의무 quota가 아니라 중복 위험 참고값이다. [coverage matrix](../../video/source-intake/episode-001/full-script-usable-v01/coverage-matrix.json)

## 운영 checklist

[korean-media-intake-checklist-v01.json](../../video/source-intake/episode-001/korean-routes-v01/korean-media-intake-checklist-v01.json)은 이 문서의 self-service 검사 순서를 JSON으로 고정한다. `production_authority=false`이며 episode spec, generated contracts, active cut root, production state를 대체하지 않는다.

현재 EP001은 권리·해시·decode가 기록된 27개 실사 source-selection provisional slate, 7개 Remotion, 14개 Omni 구조를 유지한다. source/cut PASS·user PASS·production authority는 별도 gate다. 기존 감사의 KTV 재배포 금지, Korea.kr 미디어 권리 미확인, 디지털문화 API `service_error_200`, LOC HTTP 403, Pexels API key 부재, 의미 불일치 Commons/KOGL, 직접 촬영 제외 상태를 모두 `excluded` 또는 historical evidence로 읽는다. [route audit](../../video/source-intake/episode-001/full-script-usable-v01/metadata/korean-workflow-route-audit-v03.json), [rejected ledger](../../video/source-intake/episode-001/full-script-usable-v01/rejected-pending-ledger.json)
