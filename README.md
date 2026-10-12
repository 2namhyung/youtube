# youtube

## youtube1 업로드본

이 저장소는 `youtube` 작업 폴더에서 설계, 구상, 문서, 소스 코드, 설정, 테스트와 스크립트를 선별해 담은 검토용 사본입니다. 저장소 안의 프로젝트 경로는 `youtube1/` 아래에 유지합니다.

원본 `C:\Users\User\Desktop\app\youtube`은 읽기만 했으며 변경하지 않았습니다. 이 사본을 만드는 과정에서도 원본 파일을 이동하거나 삭제하지 않았습니다.

## 포함 및 제외 정책

- 문서, 소스 코드, 프로젝트 설정, 테스트, 스크립트 등 텍스트 기반 작업 파일을 포함합니다.
- `api.txt`, 비밀 가능성이 있는 `.env` 파일(예제 파일 제외), 모든 `.git`, 심볼릭 링크와 reparse point는 포함하지 않습니다.
- `.codex-temp`, `.pytest_cache`, `tmp`, `node_modules`, `__pycache__`, `.venv`, 캐시, 빌드 및 명백한 생성·실행 출력 디렉터리를 제외합니다.
- `01-research/data/news-media-audit`와 `06-production/opencut-automation/knowledge/raw`의 불변 원자료는 열거나 복사하지 않습니다.
- 50 MiB 초과 파일, 데이터베이스/WAL/SHM, 미디어 생성물, 모델 weights/checkpoints, vendor 복제본을 제외합니다.

세부 범위와 제외 기준은 [SOURCE_INVENTORY.md](youtube1/SOURCE_INVENTORY.md)를 참고하세요.
