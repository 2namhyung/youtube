# AI 모델 연결 준비

현재 실행 경로는 [Codex CLI 분석 연결](AI-CLI-TASK.md)이다. API 키 대신 로컬 CLI를 사용하며 연결 조회는 `visualmaker-ai-connection-v2`로 변경됐다. 아래 Gateway v1 설명과 실행 결과는 전환 전 역사 기록이며 현재 설정 안내나 새 CLI의 실행 검증 근거가 아니다.

## 과거 Gateway v1 구현 기록

모델 환경이 없는 사용자가 Studio에서 필요한 서버 설정과 현재 준비 상태를 확인하는 기능이다. Vercel AI Gateway adapter를 유지하며, 외부 모델 호출·키 입력 또는 저장·새 로컬 모델 adapter는 포함하지 않는다.

## 계약과 소유권

프런트 담당자는 연결 client와 panel 및 client 테스트, 백엔드 담당자는 순수 설정 검사와 GET route 및 테스트를 순차 작성했다. 총괄은 Studio 통합·검사 등록·문서, 독립 실행 검증자와 검수자는 실행 근거와 실제 변경을 확인한다. 원본 자료, 실제 데이터, episode spec/state, 생성 production 파일, 승인 marker와 기존 관련 없는 변경은 수정하지 않는다.

인증된 `GET /api/studio/ai-connection`은 조회 옵션을 거부하며 `no-store`와 `nosniff`를 반환한다. 응답은 `visualmaker-ai-connection-v1`, provider, 활성화·키 설정·모델 형식 검사 불리언과 세 조건의 conjunction인 `ready`만 허용한다. `providerVerified=false`, `productionAuthority=false`, `externalCalls=0`은 고정이다. 키·모델 환경 값, 키 길이·해시, 내부 경로는 응답하지 않는다. DB·Plan·작업을 변경하거나 제공자를 호출하지 않는다.

클라이언트는 정확한 필드 목록과 일관성을 검사하고 JSON을 1KiB로 제한한다. token 변경·화면 해제 시 abort하고 오래된 응답을 폐기한다. 화면은 프로젝트 없이도 노출하고, 준비 상태와 실제 연결 검증을 구분한다. 분석 작업의 기존 전송·과금 동의는 유지한다.

## 과거 Gateway 서버 설정

당시 서버가 읽던 이름은 `VISUALMAKER_AI_ENABLED`, `AI_GATEWAY_API_KEY`, `VISUALMAKER_AI_MODEL`이었다. 비활성화 상태에서는 키와 모델이 없어도 로컬 기획 기능을 사용할 수 있었다. Gateway 설정은 별도 서버 환경의 키와 정확한 `provider/model` 식별자를 요구했다. 현재 CLI 설정에는 이 API 키가 필요하지 않다. 단독 Node worker는 환경 파일을 자동으로 읽는다고 가정하지 않으며 Studio 실행 경로가 설정을 자식 프로세스에 전달한다.

키를 채팅, `NEXT_PUBLIC_` 변수, Plan, ZIP, 로그나 브라우저 저장소에 넣지 않는다. 이 화면은 비밀 저장소가 아니며 키 입력란이 없다. 키 유효성·인증·모델 가용성·응답 품질·실제 비용은 형식 검사로 증명되지 않는다. 실제 연결 확인은 모델 환경과 별도 호출 동의가 준비된 뒤 수행한다. 로컬/OpenAI 호환 endpoint adapter는 현재 미지원이다.

근거: [설정 검사](core/ai-connection.ts), [GET route](../src/app/api/studio/ai-connection/route.ts), [화면](../src/components/studio/ai-connection-panel.tsx), [기존 작업 설정](core/ai-analysis-job.ts), [worker 전달](core/dispatch.ts), [공식 설정](https://vercel.com/docs/ai-gateway/getting-started), [공식 모델 목록](https://ai-gateway.vercel.sh/v1/models).

## 검증

등록된 집중 검사: `pnpm run visualmaker:check-ai-connection`. 설정 누락·비활성화·공백·한도·잘못된 모델 형식과 기존 job 준비 상태의 일치, 인증·옵션 거부, 응답 allowlist·크기·오류 비공개를 검사한다. 실제 브라우저 및 제공자 접속 여부는 별도 근거로 기록한다. 이 slice는 연결 준비이며 전체 도구 완성을 뜻하지 않는다.

독립 실행에서 타입 검사와 연결 준비 19/19, 백업 48/48 테스트가 통과했다(실패·건너뜀 없음). 백업 검사에는 fixture 준비 테스트 네 개를 추가 등록했다. 전체 `visualmaker:check`나 저장소 정식 `check`를 다시 실행한 결과는 아니다. 코드·문서 검수에서 확정 P1/P2는 없으며, 기존 설정 검증식과의 향후 drift는 일치 테스트로 추적한다.

키·모델이 없는 격리 서버의 실제 브라우저에서 세 설정 필요 항목과 ‘연결 미검증’, 상태 새로고침을 확인했고 콘솔 오류·경고는 없었다. 독립 HTTP 검사는 인증 GET 200의 정확한 DTO, 무인증 403, 옵션 포함 400과 응답 헤더를 확인했다. 원본/별도 프로젝트는 두 개, revision 행은 열세 개, 작업·AI 호출 시도는 0개로 유지됐으며 자료/영수증 바이트와 실제 EP001 spec/state 해시는 바뀌지 않았다. 모든 API POST는 0건이다. 이 검사로 실제 모델 인증이나 품질을 검증한 것은 아니다.

시험 탭을 닫고 소유 서버의 정확한 run을 종료했다. Next dev가 갱신한 Temp `next-env.d.ts` 한 파일은 시작 전 inventory와 다르며 나머지 111개 파일은 검사 시 일치했다. 자동 생성 파일의 변경을 사용자 원본 변경으로 해석하지 않는다. 자동 검사 근거: `C:/Users/every/AppData/Local/Temp/vm-ai-connection-verify-51b8a88d214f4466bdc4301d11cb9083`. HTTP/DB 근거: `C:/Users/every/AppData/Local/Temp/vm-ai-connection-http-90f6047c15ca4b1bacf589eaa215de12`. 화면: `C:/Users/every/AppData/Local/Temp/vm-backup-browser-rgnE25/browser-run-8a91f8d7-49e2-4895-8730-1ef0d12dc397/ai-connection-unconfigured.png`.
