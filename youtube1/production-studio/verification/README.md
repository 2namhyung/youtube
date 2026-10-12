# 검증 기록 — 2026-09-23

운영 주소: https://production-studio-rnrwn1123.vercel.app

Vercel 계정 `rnrwn1123-1967`, 프로젝트 `production-studio-rnrwn1123`, 운영 배포 `dpl_4yxGVE8yYfWxRMFuTMTegQ52ydFD`가 READY 상태다. `web/`의 정적 화면만 배포했다.

## 실제 실행으로 확인한 항목

- 운영 HTTPS 화면에서 로컬 API 연결, 프로젝트 조회 및 합성 생성 요청 성공. 브라우저 콘솔 오류 없음.
- 소유 권리가 확인된 진단용 배경 PNG와 투명 캐릭터 PNG를 브라우저로 등록하고 실제 FFmpeg MP4 합성·재생 확인.
- 샷 소재 연결, 대본 표현 수정, 개정 증가, 재분석 및 미연결 샷 안내 확인.
- `ui-handoff-smoke.zip`: 실제 API 출력. 프로젝트·현재 handoff·출처 문서·바이트 해시를 포함하며 handoff에 합성 artifact가 연결됨.
- `wise-live-smoke.json`: 공식 WISE의 실제 모델 추출·색인·HTTP 검색.
- `wise-library-integration.json`: 영상/이미지 검색, 원본 ID/해시 매핑, 구간 보정, 재색인 검증.
- `wise-same-port-reindex.json`: 동일 9670 포트에서 2개 소재 색인을 1개 소재 색인으로 교체한 뒤 새 소재만 검색되는지 확인.
- 최종 로컬 연결: newsroom READY(기존 프로젝트 14개), shopping READY, 공통 API 정상.

## 테스트

- 공통 API: 21 passed, 1 skipped. Windows symlink 권한 조건에 따른 skip.
- 쇼핑쇼츠 기존 테스트: 93 passed.
- 뉴스룸 `test:editorial-cartoon-template`, `test:generic-pipeline`: 통과.
- TypeScript 검사 및 Vite 운영 빌드: 통과.

## 정리와 현재 제한

진단 프로젝트 1개와 진단 소재 2개는 `ui-smoke-data-20260923-095521/`에 보관했다. 운영 공통 라이브러리는 비어 있으며, 기존 뉴스룸·쇼핑쇼츠의 데이터는 이동하지 않았다. 사용 중인 기존 엔진의 로그는 원래 로그 폴더에 유지했다. 진단용 WISE 서버는 종료했으며, 실제 소재 등록 후 화면에서 색인하면 검색 서버가 시작된다.

YouTube API는 실제 요청에서 `rateLimitExceeded`를 반환했다. 화면에 제한 상태와 수동 CC 후보 탐색/등록 경로를 제공한다. 검색 결과나 권리 확인을 임의로 성공 처리하지 않는다.

위 진단 자료는 실제 사건·상품의 근거가 아니며 제작·게시 승인을 뜻하지 않는다.
