# 원본 구조와 업로드 범위

이 인벤토리는 파일 내용을 복제하지 않고 원본의 최상위 구조와 선별 기준만 기록합니다. 원본 `C:\Users\User\Desktop\app\youtube`은 읽기 전용으로 다뤘고 변경하지 않았습니다.

## 원본 최상위 구조

- `01-research`, `02-context-legal`, `03-script-voice`
- `04-visual-assets`, `05-bgm-generation`, `06-production`
- `07-quality-assurance`, `08-upload-delivery`, `09-archive`, `09-channel-brand`
- `production-studio`, `shopping-shorts`, `wiki`
- 루트의 문서와 실행 스크립트

## 제외 기준

- 비밀: `api.txt`, 예제가 아닌 `.env` 파일
- 불변 원자료: `01-research/data/news-media-audit`, `06-production/opencut-automation/knowledge/raw` (열기·복사 모두 하지 않음)
- 저장소/임시/의존성: 모든 `.git`, `.codex-temp`, `.pytest_cache`, `tmp`, `node_modules`, `__pycache__`, `.venv`, vendor 복제본
- 캐시, 실행·생성 데이터, 빌드 산출물, 미디어 결과, 모델 weights/checkpoints, SQLite와 WAL/SHM
- 50 MiB 초과 파일, 심볼릭 링크와 reparse point
- 위 기준에 속하거나 설계·문서·소스·설정·테스트·스크립트 중심 사본의 범위에 맞지 않는 바이너리 및 기타 출력 파일

현재 업로드본은 경로 구조를 보존하며 텍스트 기반의 설계·구상·문서·소스·설정·테스트·스크립트를 선별해 담습니다. 이는 원본을 이동하거나 삭제하지 않은 별도 사본입니다.
