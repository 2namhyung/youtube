# VisualMaker 다른 컴퓨터에서 이어서 개발하기

프로그램 정본은 GitHub `2namhyung/youtube`의 `main` 브랜치 아래 `23/`이다. `youtube1/`과 `motion/`은 별도 기존 프로그램이므로 VisualMaker 변경을 이유로 덮어쓰거나 삭제하지 않는다. 최신 커밋은 `git log -1`로 확인한다. 이 문서와 함께 배포하는 변경은 WISE 읽기 전용 환경 진단 CLI·테스트·설치 계획이며, WISE 설치나 모델 다운로드는 포함하지 않는다.

## 코드 받기와 기본 실행

이번 로컬 검증 환경은 Windows, Node.js 24.14.1, pnpm 9.15.0이다. 다른 OS에서 전체 기능이 검증된 것은 아니다. 기본 앱은 Next.js와 Node 내장 SQLite를 사용한다. 의존성은 아래 잠금 파일로 새로 설치하며, 기존 PC의 `node_modules` 링크를 복사하지 않는다.

```powershell
git clone https://github.com/2namhyung/youtube.git
Set-Location youtube/23
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run visualmaker:check-wise-doctor
pnpm run visualmaker:dev
# http://127.0.0.1:3017/studio
```

기존 clone에서는 먼저 로컬 변경을 확인한 뒤 `git pull --ff-only origin main`을 사용한다. 기본 실행은 `23/data/visualmaker`에 새 로컬 프로젝트 저장소를 만든다. 기존 프로젝트가 자동 복원되는 실행이 아니다. 앱을 인터넷에 공개하지 않는다.

의존성 설치 자체는 새 컴퓨터에서 네트워크 다운로드가 필요하다. 전체 `visualmaker:check`에는 Remotion/FFmpeg 합성 렌더가 포함되므로 아래 실행 도구를 준비한 뒤 수행한다. 저장소 전체 정본 진단은 `pnpm run check`이며, 원본·제작 계약이 빠진 코드 전용 clone에서 통과를 보장하지 않는다.

## 코드와 별도로 준비할 실행 도구

| 기능 | 준비 사항과 현재 제한 |
| --- | --- |
| 기본 대본·장면 편집 | Node.js·pnpm 의존성. 새 DB로 시작 가능 |
| 영상·음성 검증과 조립 | `ffmpeg`, `ffprobe`가 서버 프로세스 PATH에 있어야 함 |
| Remotion 진단·임시 렌더 | 고정 의존성 외에 호환 headless browser 필요. 앱이 브라우저를 자동 설치하지 않음 |
| AI 분석 | 서버 PC에서 Codex CLI 설치·사용자 로그인 및 명시적 활성화. [기존 CLI 연결 계약](AI-CLI-TASK.md) 참조. 로그인·키를 Git으로 옮기지 않으며, 실제 호출에는 전송·사용량 동의 필요 |
| YouTube 후보·선택 취득 | 현재 탐색기는 Windows `%LOCALAPPDATA%/Programs/Python/PythonNNN/Scripts/yt-dlp.exe` 설치를 사용. PATH에만 설치된 실행 파일이나 다른 OS의 실행 파일 탐색은 지원하지 않음 |
| 기존 WISE 자료실 검색 | 위 Windows Python 설치 경로에서 Python을 찾거나 `WISE_PYTHON` 절대 경로 지정. 기존 Production Studio DB·원본·실행 중인 WISE 및 신뢰 환경 설정이 별도로 필요 |

이 표는 실행 도구의 준비 항목이며 자동 설치 스크립트가 아니다. `pnpm run visualmaker:wise-doctor`는 경로·loopback TCP 전제만 확인하고 누락 시 종료 코드 1을 반환한다. 포트 접속 성공도 실제 WISE·모델·의미 검색 성공을 뜻하지 않는다.

## 기존 프로젝트를 이어서 사용할 때

GitHub에는 코드·테스트·문서만 올린다. `raw/`, 실제 미디어, `data/`, SQLite와 WAL/SHM, `.env.local`·로그인 정보·키, `node_modules`, 렌더 출력·캐시·WISE 모델·색인은 이번 커밋의 백업 대상이 아니다. 과거 커밋에 있던 파일을 소급 제거하는 작업도 아니다.

기존 PC의 프로젝트는 `project/23jung/data/visualmaker`에 남겨 두며 삭제하지 않는다. 같은 프로젝트가 필요하면 서버와 worker를 정지한 뒤 이 데이터 폴더 전체를 안전한 개인 저장 장치로 별도 복사한다. SQLite 파일만 또는 계획 JSON만 복사하지 않는다. `assets/`, `receipts/`, 작업 산출물과 리비전 기록을 함께 보존해야 기존 연결을 검증할 수 있다. 복사본을 새 컴퓨터의 실제 데이터 경로에 둔 뒤 다음처럼 실행한다.

```powershell
# youtube/23에서 실행. 아래 값은 실제로 옮긴 기존 폴더로 교체한다.
$env:VISUALMAKER_DATA_DIR = 'C:\VisualMakerData\visualmaker'
pnpm run visualmaker:dev
```

`VISUALMAKER_DATA_DIR`가 없으면 새 저장소가 만들어질 수 있으므로 원래 프로젝트인지 먼저 확인한다. 기존 데이터용 [실행 도우미](scripts/start-local.ps1)는 존재하는 실제 폴더를 요구하며 `-CheckOnly`로 DB를 열지 않고 경로·의존성을 확인할 수 있다. 아카이브도 필요하면 `archive.sqlite`와 해당 원본 폴더를 따로 옮기고 `ARCHIVE_DB_PATH`, `ARCHIVE_RAW_ROOT`를 지정한다. 불변 `raw/` 원자료는 자동으로 이동·삭제하거나 GitHub로 올리지 않는다.

기존 WISE 자료실은 VisualMaker 데이터 폴더와 별개다. `STUDIO_DATA_DIR`·선택적 `STUDIO_DB_PATH`, 원본 파일 및 WISE 실행 환경을 별도로 준비한다. `WISE_STUDIO_ROOT`를 생략하면 clone 안 `youtube1/production-studio` 코드를 사용한다. `WISE_URL`은 loopback WISE 서버, `WISE_PROJECT_NAME` 또는 `WISE_SEARCH_PATH`는 실제 색인 프로젝트와 맞아야 한다. 인증정보는 새 PC에서 직접 설정하고 채팅이나 GitHub에 올리지 않는다.

## 다음 개발 작업

1. [WISE 신규 설치 계획](WISE-INSTALL-PLAN.md)에 따라 디스크 여유와 설치 위치를 확정한다. 계획 작성 당시 기존 PC는 C: 약 41GiB 여유, RAM 약 15.2GiB, Ubuntu·WISE 서비스 없음이었다. 새 PC는 다시 측정한다.
2. CPU 기반 WSL2 Ubuntu WISE를 별도 설치하고 합성 이미지·짧은 영상으로 특징 추출·색인·실제 검색을 검증한다. 대용량 모델·서비스 설치를 코드 clone만으로 완료했다고 간주하지 않는다.
3. YouTube 취득 원본을 기존 Production Studio의 정식 등록 경로에 연결하고, 서버가 발급한 원본 ID·SHA 매핑을 보존한다. DB에 직접 행을 만들거나 임의 ID를 정본으로 취급하지 않는다.
4. 등록과 별개의 명시적 색인 작업·진행 상태·실패 복구를 연결한 뒤 WISE 검색 결과의 원본·구간을 VisualMaker에서 확인한다. 현재는 YouTube 후보 검색과 WISE 기존 자료실 검색이 별도 기능이며, YouTube 취득물의 자동 색인은 미구현이다.

실제 YouTube 링크를 이용한 재현·고도화는 기본 툴과 연결 검증을 마친 다음 단계다. 코드·자동 검사 통과는 출처·권리·스타일·컷의 사람 승인이나 제작 PASS가 아니다. 현재 계획·진단·가져오기 경로는 `productionAuthority=false`를 유지한다.

## 이번 배포의 검증 범위

WISE 진단 테스트 9개, 기존 WISE 연결 Node 테스트 8개와 Python 테스트 5개 및 TypeScript 검사가 통과했다. 실제 기존 PC 진단은 자료실 DB·원본 폴더와 WISE 주소 미설정으로 `blocked`였고 연결 시도는 없었다. 새 PC에서 의존성을 새로 설치하는 전체 실행은 별도 확인해야 한다. 실제 WISE·YouTube 제공자 호출이나 프로젝트 승인 상태를 이 검사로 증명하지 않는다.
