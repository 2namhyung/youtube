# Codex CLI 분석 연결

AI 분석 작업의 기본 실행 경로는 Gateway API 호출 대신 로컬 Codex CLI다. 별도 API 키를 설정하지 않으며, 서버 컴퓨터의 CLI 로그인 상태를 사용한다. CLI 실행도 대본을 외부 모델 서비스로 전송하고 계정 사용량이나 비용을 발생시킬 수 있으므로 기존 전송·비용 동의를 유지한다. 실제 모델 응답과 한국어 분석 품질은 아직 검증하지 않았다.

## 설정

서버 실행 환경에서 `VISUALMAKER_AI_ENABLED=1`로 활성화한다. CLI가 PATH에 없으면 `VISUALMAKER_CODEX_CLI_PATH`에 실행 파일의 절대 경로를 지정한다. `VISUALMAKER_AI_MODEL`을 생략하면 `codex/default`로 기록하고 CLI 내장 기본 모델을 사용한다. 특정 모델은 `codex/모델이름`으로 지정한다. 사용자 config를 무시하므로 사용자의 CLI 기본 모델 설정을 따른다는 뜻은 아니다. 설정 후 서버를 재시작한다.

로그인은 사용자가 서버 컴퓨터의 터미널에서 `codex login`으로 수행한다. 도구는 인증 파일을 읽어 복사하거나 채팅·브라우저·Plan·ZIP·로그에 보관하지 않는다. 연결 준비 화면의 `ready`는 활성화, 실행 파일 발견, 모델 형식 검사의 결합일 뿐 로그인·모델 접근·사용 가능 잔량을 증명하지 않는다. API 키는 CLI 자식 환경에 전달하지 않는다. [설정 검사](core/ai-connection.ts) · [실행 파일 탐색](core/ai-codex-cli.ts) · [화면](../src/components/studio/ai-connection-panel.tsx)

## 실행 계약

범위는 AI 분석 코어, 작업·worker·dispatch, 인증된 분석·연결 조회 경로, Studio 화면과 집중 테스트다. 원본 자료, 실제 프로젝트, episode spec/state, 제작 파일과 승인 marker는 변경하지 않는다. 구현자는 단독 writer이며 실행 검증자와 읽기 전용 검수자를 분리한다.

서버가 해석한 실행 파일을 `shell:false`로 실행한다. 대본은 argv 대신 stdin으로 전달한다. 작업용 임시 폴더를 cwd로 사용하고 사용자 설정·규칙·공유 daemon을 사용하지 않으며, ephemeral·read-only와 도구 비활성화 옵션을 지정한다. 이 제한은 완전한 OS 격리나 오프라인 실행을 뜻하지 않는다. 출력 스트림은 합계 1MiB, 결과 JSON은 512KiB로 제한하며 정상 파일만 파싱한다. 취소·시간 초과 시 자식 종료를 기다리고 소유 임시 폴더를 정리한다. Windows에서는 절대 경로의 taskkill 트리 종료 완료를 먼저 기다린다. taskkill 실패·2초 초과 시 직접 자식 종료로 대체하며, 이 예외 경로의 모든 자손 종료까지 보장하지는 않는다. [CLI runner](core/ai-codex-cli.ts) · [공식 비대화형 실행](https://developers.openai.com/codex/noninteractive)

CLI의 schema 출력 뒤에도 기존 검증기로 구간 수·ID·순서·필드와 원문 범위를 검사한다. 결과의 adapter는 `codex-cli`, 실제 응답 모델과 토큰 사용량은 확인하지 못했으므로 `null`, 비용은 `unknown`이다. CLI에는 기존 SDK의 출력 토큰 상한을 보장하지 않으며 화면의 해당 입력도 제거했다. 출력 바이트 한도는 금액 상한이 아니다. 과거 `gateway-api-key`·`sdk-test` 결과는 계속 읽을 수 있다. [분석 계약](core/ai-analysis.ts) · [제안 검증](core/director.ts) · [화면 검증](../src/components/studio/ai-analysis-client.ts)

외부 호출 시작 체크포인트 이후의 불확실한 실패는 `needs-review`로 남는다. 앱은 같은 작업을 자동 재실행하거나 재시도하지 않는다. 이는 CLI 내부 네트워크 재시도까지 0회로 보장한다는 뜻은 아니다. 대본·리비전·스냅샷 해시 결속과 사용자 선택 반영을 유지하며 `productionAuthority=false`, `requiresHumanReview=true`다. [작업 계약](core/ai-analysis-job.ts) · [worker 전달](core/dispatch.ts)

연결 조회 DTO는 `visualmaker-ai-connection-v2`, provider는 `codex-cli`다. 정확한 필드만 반환하고 경로·모델 설정값·인증정보는 반환하지 않는다. `providerVerified=false`, `productionAuthority=false`, `externalCalls=0`을 유지한다. [인증된 조회](../src/app/api/studio/ai-connection/route.ts) · [client 검증](../src/components/studio/ai-connection-client.ts)

## 검증 범위

집중 명령은 `pnpm run visualmaker:check-ai`, `pnpm run visualmaker:check-ai-connection`이다. 합성 실행 파일을 실제 자식 프로세스로 실행해 stdin·인자·환경, 정상·긴 한국어 출력, 잘못된 JSON·비정상 종료·출력 초과, 취소·시간 초과와 임시 폴더 정리를 검사한다. 기존 분석·채택·작업 체크포인트와 연결 client도 회귀 검사한다. 실제 제공자 호출과 브라우저 CLI 실행 흐름은 별도 검증 항목이다. [프로세스 테스트](../tests/visualmaker-ai-codex-cli.test.mjs)

독립 실행 결과는 AI 검사 59개 통과·1개 Windows 심볼릭 링크 권한으로 건너뜀, 연결 검사 23개 통과, 백업 회귀 검사 48개 통과다. 타입 검사를 포함하며 실패는 없었다. 설치된 CLI에 실제 실행 인자와 `--help`를 전달하는 구문 검사도 모델 호출 없이 통과했다. 실제 EP001 spec/state 해시는 유지됐다. 각 검사에 중복 테스트가 있으므로 통과 수를 고유 테스트 총수로 합산하지 않는다. 저장소 전체 `check` 통과나 실제 모델·브라우저 분석 성공을 의미하지 않는다.

## 전체 구현율

핵심 기능 10개를 같은 비중으로 두고 코드 흐름 구현 1점, 주요 하위 기능이 남은 부분 구현 0.5점, 미구현 0점으로 평가한 추정치는 **6/10, 약 60%**다. 작업량·시장 품질의 정밀 측정이나 현재 에피소드 제작 준비율이 아니다. [현재 구현과 남은 범위](IMPLEMENTATION.md) · [설계](DESIGN.md) · [백업 검증 한계](BACKUP-TASK.md)

| 기능 | 점수 |
|---|---:|
| 대본·장면 편집과 리비전 | 1 |
| AI 분석·선택 반영 | 0.5 |
| 자료 탐색·수집 | 0.5 |
| 권리·근거 검토 흐름 | 0.5 |
| 타임라인·렌더·미리보기 | 0.5 |
| 음성·타이밍·TTS | 0.5 |
| 모션·참조 재현·Omni | 0.5 |
| 조건부 오디오 조립·최종 출력 | 1 |
| 백업·복원 | 0.5 |
| 큐·운영·예산·인증 | 0.5 |

조건부 출력 점수는 입력과 승인을 갖춘 처리 경로를 평가한 것이며 현재 EP001의 실제 제작 성공을 의미하지 않는다. CLI 연결을 추가해도 실제 모델 품질 검증이 남아 AI 영역 점수를 올리지 않았다. TTS·자동 음성 정렬, 대본 전체 자료 탐색, 실제 Omni 생성, 예산 원장, 현재 에피소드의 승인된 렌더 성공과 실제 브라우저 복원 확인이 남아 있다. 사용자가 거절한 ZIP 브라우저 업로드는 재시도하지 않는다.
