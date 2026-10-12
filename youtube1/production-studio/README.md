# 공통 제작실

내무습다와 쇼핑쇼츠의 소재 등록, 권리 기록, 샷 검색, 배경/캐릭터 합성, 대본 표현 수정과 인계 패킷을 한곳에서 관리한다. 기존 사건·상품 검수와 최종 음성/렌더 승인 엔진은 그대로 사용한다.

- 웹: https://production-studio-rnrwn1123.vercel.app
- 로컬 제작실/API: http://127.0.0.1:8766
- 기존 내무습다: http://127.0.0.1:3002/newsroom
- 기존 쇼핑쇼츠: http://127.0.0.1:8765

## 시작

프로젝트 루트의 `Start-ProductionStudio.cmd`를 실행한다. 또는:

```powershell
npm start
```

이 PC에서 공통 API와 두 기존 엔진을 실행한다. 이미 실행 중인 엔진은 재사용한다. Vercel 페이지는 이 PC의 공통 API에 연결하며, 브라우저가 로컬 네트워크 접근을 물으면 허용해야 한다. 다른 PC나 휴대폰에서 원본 파일을 원격으로 처리하는 서비스는 아니다. 원본과 제작 상태는 Vercel에 업로드되지 않는다. 인터넷 연결 없이 같은 PC의 로컬 주소로도 사용할 수 있다.

최초 의존성 설치와 UI 빌드:

```powershell
./shopping-shorts/setup.ps1
npm --prefix production-studio/web install
npm run build:studio
```

공통 서버만 콘솔에서 실행하려면 `production-studio/start.ps1 -Foreground -SkipNative -NoOpen`을 사용한다. 실행 로그는 `production-studio/data/logs/`에 기록한다. 기존 내무습다만 실행하는 명령은 `npm run dev:newsroom`, 기존 쇼핑만 실행하는 명령은 `npm run dev:shopping`이다.

## 제작 순서

1. 채널과 프로젝트를 선택하고 초안 대본을 입력한다. 문장 단위로 나눈 샷과 검색어는 수정 가능한 제안이다.
2. 공통 라이브러리, YouTube CC 후보, WISE로 필요한 소재를 찾는다. 이미 가진 소재를 먼저 재사용한다.
3. 사용할 원본과 작성자·출처·라이선스·권리 확인 근거를 등록한다. 편집, 변형, ImageGen 입력, Omni 입력 허용은 각각 기록한다.
4. 샷에 원본의 연속 구간을 연결한다. 실제 배경과 투명 PNG 캐릭터로 합성 미리보기를 만든다. 합성은 장면 계획용이며 실제 사건 증거가 아니다.
5. 확보한 화면에 맞게 연결어·중복·표현을 수정하고 전후 대본을 비교한다. 사실·순서·수치·상품 효능을 변경해서 화면에 맞추지 않는다.
6. 출처/귀속/해시/미해결 조건이 포함된 인계 패킷을 내보내고 해당 채널의 기존 제작 화면에서 제목·음성·최종 렌더 검수를 진행한다. 계획 패킷은 기존 승인 권위를 만들지 않는다.

## 실행 위치와 연결

`web/`만 Vercel에 배포한다. `backend/`는 쇼핑 앱의 기존 Python 가상환경을 공유하되 데이터를 `production-studio/data/`에 독립 보존한다. 각 프로필이 같은 공통 라이브러리를 사용한다. 기존 저장소·원자료·승인 이력을 이동하거나 합치지 않는다.

허용된 웹 출처는 고정된 운영 URL과 로컬 개발 주소다. API는 loopback에만 바인딩하고 변이 요청에 세션 토큰과 중복 방지 키를 요구한다. 임의 외부 출처를 허용하지 않는다. 배포 도메인을 변경하면 `STUDIO_ALLOWED_ORIGINS`를 정확한 새 origin으로 설정하고 서버를 재시작한다.

YouTube API 키는 기존 사용자 환경 변수 `YOUTUBE_API_KEY`를 사용한다. 인증 오류에 한해서 설정된 `YOUTUBE_API_KEY_2`를 시도하며, 할당량 제한을 우회하려고 키를 바꾸지 않는다. 키가 없거나 호출 제한에 걸리면 화면에 원인을 표시한다. 이때 YouTube에서 직접 찾은 CC 후보의 주소와 확보한 원본을 등록할 수 있다. `api.txt`, `pixel.txt`를 읽거나 배포하지 않는다.

WISE 설치·인덱스·검증 결과와 배포 검증 기록은 이 폴더의 운영 문서와 `verification/`에서 확인한다. WISE 검색 위치는 자동으로 검수 완료된 편집 구간이 되지 않는다. 두 레퍼런스에 맞춘 컷아웃·미세 흔들림·모션그래픽 후보와 초기 테스트값은 [내무습다·통찰맨형 레퍼런스 가이드](../wiki/sources/naemuseupda-cutout-motion-references-2026-09-23.md)에서 확인한다.

## 검증

```powershell
npm run test:studio
npm run build:studio
npm run test:shopping
npm --prefix 06-production/opencut-automation run test:editorial-cartoon-template
npm --prefix 06-production/opencut-automation run test:generic-pipeline
```

스키마·API: [계약](contracts/api.md). 전체 제작 권위: [canonical contract](../wiki/pipelines/newsroom-video-production.md).
