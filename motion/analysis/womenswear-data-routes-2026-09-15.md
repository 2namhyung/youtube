# 여성복 데이터 수신 루트 조사

확인일: 2026-09-15. 범위: 무신사·네이버 쇼핑의 경로 발굴. 계정 신청, 제휴 문의 발송, 인증 API 호출, 계약 체결은 수행하지 않았다. 공개 문서에서 확인된 기능과 제안하는 운영 방식을 구분한다.

## 무신사

- 공식 큐레이터: https://www.musinsa.com/curator/intro/pro
  - 확인: 큐레이션 샵과 개별 상품 링크를 SNS에 공유하는 공식 수익화 경로.
  - 미확인: 상품 목록 대량 조회 API/CSV, 옵션·재고 피드, 상품 이미지의 AI 변형·외부 생성 서비스 업로드 허용 범위.
  - 결론: 구매 연결 경로 후보. 데이터 수신 API 확보로 간주하지 않는다.
- 광고/제휴 문의: https://www.musinsa.com/app/company/partner?type=5
  - 확인: 공식 사업 제휴 문의 접점.
  - 제안: 여성복 상품 피드(API 또는 CSV), 정면·후면·디테일 원본, 외부 AI 생성 도구 이용 범위, 큐레이터 링크 연계 제공 가능 여부를 문의한다.
  - 데이터 피드 제공 자체는 답변 전까지 미확정이다.
- 파트너 포털: https://partner.musinsa.com/entry/login
  - 입점 판매자를 위한 경로. 일반 외부 제작자가 전체 타사 상품을 조회할 수 있는 API는 이번 공개 조사에서 확인하지 못했다.
  - 검색되는 29CM 외부연동 문서는 무신사 전체 상품 조회 API의 근거가 아니다.
- 브랜드 직접 공급(운영 제안): 무신사 입점 브랜드와 협의해 SKU/옵션/원본 이미지/가격·품절 갱신 정보를 CSV 또는 승인된 피드로 공급받고 무신사 판매 링크에 매핑한다. 계약·공급 가능 여부는 미확정.

## 네이버 쇼핑

### 종료된 경로: 기존 쇼핑 검색 API

- 공식 종료 공지: https://developers.naver.com/notice/article/32564
- 이관 제외 및 대체 API 없음: https://developers.naver.com/notice/article/32530
- 공식 공지상 2026-07-31 종료, 기존 키도 호출 불가. 과거 shopping.json 연동 예제는 신규 수신 경로로 채택하지 않는다. 인증 실호출은 수행하지 않았다.

### 경로 1: 쇼핑 커넥트

- 상품 탐색 안내: https://help.naver.com/service/30027/contents/24103
- 크리에이터 권한 안내: https://help.naver.com/service/30027/contents/24101
- 링크 발급 안내: https://help.naver.com/service/30027/contents/24104
- 시작점: https://brandconnect.naver.com/
- 공식 안내 기준 브랜드커넥트 크리에이터 공간과 관련 약관 동의가 필요하다. 판매자가 쇼핑 커넥트에 등록한 상품을 탐색하고 링크를 발급받는 웹 경로이며 전체 네이버 쇼핑 상품 피드가 아니다.
- 제안: 여성복 참여 상품을 소수 선별하고, 판매자에게 원본·AI 편집·외부 게시 범위를 확인한 뒤 상품과 링크를 제작 관리표에 등록한다.
- 공개 대량 상품 조회 API 및 Flow 이미지 이용 포괄 허가는 확인하지 못했다. 채널별 활동 조건도 실제 운영 매체 기준으로 확인한다.

### 경로 2: 협력 판매자의 커머스API

- 공식 문서: https://apicenter.commerce.naver.com/docs/commerce-api/current
- 상품 검색: https://apicenter.commerce.naver.com/docs/commerce-api/current/search-product
- 원상품 조회: https://apicenter.commerce.naver.com/docs/commerce-api/current/read-origin-product-product
- 채널상품 조회: https://apicenter.commerce.naver.com/docs/commerce-api/current/read-channel-product-1-product
- 판매자 또는 솔루션 연동 권한을 확보한 스토어의 상품 데이터를 조회하는 경로. 임의의 타 판매자 전체 카탈로그 조회 API가 아니다.
- 주요 데이터: 상품명, 상품 이미지 URL, 상세 콘텐츠, 옵션, 가격, 재고·판매상태 등. 필드 존재 및 응답 범위는 해당 상품/권한별 실제 수신으로 확인해야 한다.
- 작업: 협력 스토어 확보 → 적합한 판매자/솔루션 인증 설정 → 상품 목록 조회 → 원상품/채널상품 상세 조회 → 여성복 카테고리 선별 → 옵션·이미지·판매 링크 매핑 → 갱신 정책 적용.
- 상품 조회는 POST /v1/products/search, 상세는 GET /v2/products/origin-products/{originProductNo} 및 GET /v2/products/channel-products/{channelProductNo}. 데이터 수신과 이미지 제작 이용 허락을 별도로 기록한다.

### 경로 3: 협력 판매자의 원본 EP(DB URL)

- 공식 설명: https://ads.naver.com/help/faq/1263 (최종 수정 2026-03-29)
- EP는 CPC 입점 판매자가 상품명/가격/배송비/제조사 등을 정해진 형식으로 네이버에 공급하는 파일이다.
- 운영 제안: 협력 판매자에게 해당 원본 EP 또는 별도 카탈로그를 직접 제공받는 계약을 협의한다. 이는 네이버 전체 상품 다운로드 API가 아니다. 옵션별 재고와 제작용 고해상도 원본이 포함되는지는 샘플로 확인한다.

### 쇼핑 커넥트 정보 이용 추가 확인

- 공식 약관: https://brandconnect.naver.com/service/term/affiliate/creator
- 조사자가 확인한 검색 노출 약관 제8조에는 사전 승낙 없는 취득 정보의 복제/출판/방송/제3자 제공 제한이 있다. 본문 직접 열기는 robots 제한으로 실패했으므로 가입 시 적용되는 현행 전문을 다시 확인해야 한다.
- 운영 제안: 커넥트에서 얻은 데이터의 외부 사용 승낙과, 권리자가 직접 제공한 원본의 제작 이용 허락을 구분한다. 판매자 허락이 플랫폼 약관상의 별도 요건까지 자동 충족한다고 보지 않는다.

### 보조 경로: 쇼핑 인사이트

- https://guide.ncloud-docs.com/docs/apihub-overview
- 키워드/카테고리 수요 분석용. 개별 여성복 SKU, 옵션, 이미지, 재고를 받는 피드로 대체할 수 없다.

## 권장 실행 순서

1. 무신사: 큐레이터 계정 이용 가능 여부 확인 + 공식 광고/제휴 창구에 피드·자산 제공 조건 문의. 동시에 소수 입점 브랜드에 직접 자산 공급 제안.
2. 네이버: 쇼핑 커넥트 이용 가능 여부 확인 + 참여 여성복 상품 선별. 반복 자동 수신이 필요하면 협력 스마트스토어의 커머스API 권한 확보.
3. 최초 5개 상품에 대해 원본/옵션/권리/링크/갱신 담당자가 채워진 샘플 레코드를 확보. CSV 수신으로 시작해도 된다.
4. 수신 및 제작 이용 조건이 확인된 상품만 캐릭터 고정·Flow 제작 단계로 이동.

현재 상태: 루트 조사 및 문의 초안 준비 완료. 로그인 후 이용 자격, 제휴 승인, API 자격증명, 샘플 수신, 영상 자산 이용 범위는 아직 미확보.

## 플랫폼·브랜드 문의 초안 — 미발송

제목: 여성복 상품 데이터 및 AI 코디 숏폼 제작 자산 제휴 문의

여성복 상품을 고정 AI 캐릭터의 코디 영상으로 소개하고 실제 판매 페이지로 연결하는 서비스를 준비하고 있습니다. 초기에는 소수 상품으로 검수 후 확대할 계획입니다.

1. 여성복 상품 ID, 브랜드, 상품명, 판매 URL, 옵션, 가격, 판매상태를 제공하는 API 또는 CSV 피드가 있습니까? 신청 자격·비용·갱신 주기·저장 및 재표시 조건을 부탁드립니다.
2. 정면·후면·디테일·옵션별 원본 이미지를 제공받을 수 있습니까?
3. 제공 이미지를 Google Flow 등 외부 생성 서비스에 업로드해 가상 착장 이미지·영상을 만들고, 편집하여 SNS 및 광고에 게시할 수 있습니까? 허용 매체·기간·가공 범위와 별도 브랜드 승인이 필요한지 확인 부탁드립니다.
4. 큐레이터/제휴 링크 생성, 영상별 추적, 가격·품절 갱신을 지원합니까?
5. AI 가상인물 콘텐츠 운영 조건과 게시 전 검수 절차가 있습니까?

## 우리 쪽에서 요청할 최소 상품 레코드 — 제안

platform, platform_product_id, seller_id, brand, title, category_path, product_url, affiliate_url, variant_id, color, size, price, availability, observed_at, source_front, source_back, source_detail, rights_evidence, ai_edit_permission, publication_permission

알 수 없는 재고·권한은 null/미확인으로 유지한다. 상품 검색 결과의 이미지 URL을 영상 제작 승인 자산으로 자동 승격하지 않는다. 같은 상품의 플랫폼별 ID와 브랜드 SKU는 검증 후 매핑한다.

## 루트 확보 완료 기준 — 제안

- 실제 샘플 상품 데이터 수신 성공
- 상품·옵션·판매 URL 대응 확인
- 필요한 원본과 Flow 업로드/AI 편집/게시 이용 범위 확인
- 가격·품절 갱신 방법 및 담당 접점 확인
- 수익화가 목적이면 제휴 링크와 정산 조건 확인

위 조건을 충족한 상품만 후속 캐릭터 착장 및 Flow 제작 단계로 전달한다.
