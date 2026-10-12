# VisualMaker — 로컬 장면 설계 작업대

## 실행

저장소 루트에서 실행합니다.

```powershell
pnpm run visualmaker:dev
# http://127.0.0.1:3017/studio
pnpm run visualmaker:check
```

기존 Next.js 15 / React / Node SQLite 기반입니다. 별도 포크·API 키·Python 설치 없이 현재 PC에서 사용할 수 있습니다. 기본 바인딩은 127.0.0.1이며 외부 배포용 인증/다중 사용자 서비스가 아닙니다.

## 사용할 수 있는 기능

- 한국어 대본 입력, 문단 단위 초벌 Beat와 두 표현 대안. `[메모]` 줄과 단독 URL은 발화에서 분리합니다.
- 대본/장면/표현을 함께 선택하고 목표·설명 직접 수정, 장면 합치기, 같은 원본 재사용 이유 기록.
- 장면 방향 선택/잠금과 원문 리비전, 변경 전후·영향 장면 확인. 오래된 창의 저장은 409로 거부합니다.
- 현재 EP001 36컷을 명세 해시에 결속한 작업 사본으로 가져오기. production 파일을 변경하지 않습니다.
- PNG/JPG/WebP, MP4/WebM, TXT/JSON 원본 등록과 decode/hash/출처 기록. 의미·권리 검토는 pending입니다. 영상 검증은 시스템 ffprobe를 사용합니다.
- JSON 저장/새 사본 불러오기, CSV, 자료 요구 목록, 비생산 파이프라인 전달안.

제안기는 **로컬 규칙 기반 초안**입니다. AI 제공자·자동 검색·음성·영상 렌더는 아직 연결하지 않았습니다. ‘같은 의미’와 ‘쉬운 제작’은 사람 검토 전 가설입니다. 장면 방향 잠금은 자료·스타일·컷 PASS가 아닙니다.

## 보관과 복원

`data/visualmaker/studio.sqlite`에 프로젝트와 변경 리비전을 저장하고 `assets/`에 원본을 SHA-256 파일명으로, `receipts/`에 파일별 검증 기록을 보관합니다. `VISUALMAKER_DATA_DIR`로 별도 테스트/저장 위치를 설정할 수 있습니다. 서버를 정지한 뒤 **data/visualmaker 폴더 전체**를 복사해 백업하세요. JSON 내보내기는 미디어 파일과 검증 기록을 포함하지 않으며, 자료가 있는 계획을 복원하려면 해당 원본과 검증 기록이 모두 같은 자료 폴더에 있어야 합니다. 누락/변조 파일은 조회·import·export 검증에서 거부합니다.

브라우저는 저장 원장이 아닙니다. 새로고침 후 서버 저장본을 다시 읽습니다. 서버가 재시작되어 연결 토큰이 달라지면 작업 화면을 새로고침하세요.

[현재 구현/설계 차이](IMPLEMENTATION.md) · [원 설계](DESIGN.md) · [백로그](BACKLOG.md) · [제작 운영 정본](../wiki/syntheses/remotion-vox-production-playbook-v0.1.md)

---

## 아래는 원본 설계 패키지 설명 (역사 기록)

# Visual Director v0.2 설계 패키지

한국어 내레이션 기반 실사·자료·카툰·모션그래픽 혼합 영상의 **장면 설계/검토 웹앱**을 위한 연구·설계 자료다. 사용자 GitHub에 포크를 생성하거나 저장소를 수정하지 않았다.

## 읽는 순서

`DESIGN.md`는 제품/UX/데이터/운영 설계, `RESEARCH.md`는 실제 검토 파일과 공식 문서, `BACKLOG.md`는 구현할 PR 단위 작업과 완료 조건이다.

`contracts/scene-plan.schema.json`은 제안 규격이다. `contracts/template-registry.json`은 허용 템플릿과 props 정의이며 실제 렌더 컴포넌트가 아니다. `examples/scene-plan.json`은 3장면 가상 예시로, 실제 스톡 결과·영상·음성·가격·근거 수치를 포함하지 않는다.

`validate_design.py`와 `tests/test_contract.py`는 규격 검증의 참조 구현이다. 실제 웹앱, API, DB 트랜잭션, 미디어 렌더링은 구현하지 않았다. 테스트가 통과해도 소스 이용 권한과 사실 주장이 실제로 확인된 것은 아니다.

## 참조 검증 실행

Python 3.10 이상에서 실행한다.

```bash
python -m venv .venv
# 가상환경을 활성화한 뒤:
python -m pip install -r requirements.txt
python validate_design.py
python -m unittest discover -s tests -v
```

기본 예시는 미확정 초안이다. `python validate_design.py --publish`는 **실패해야 정상**이다. 발화 대본 승인과 실제/검토된 음성 정렬이 없기 때문이다. 이 옵션은 발행 동작이 아니라 데이터 상태 검사다.

테스트 fixture의 `audio_test`, 0으로 구성된 SHA, 가상 파일 경로 등은 검증 분기를 확인하는 합성 데이터다. 실제 파일을 생성·확보했다는 뜻이 아니다. 참조 검증기는 파일 존재 여부·다운로드·음성·템플릿 화면 구현을 검사하지 않는다.

## 범위와 확인 결과

원본 프로젝트는 GitHub 연결 도구를 통해 정적 검토했다. 컨테이너의 clone 시도가 DNS 오류로 실패했으므로 원본의 설치/빌드/실행 검증은 하지 않았다. 직접 작성한 규격/예시/참조 검증기의 합성 테스트 **23개**는 이 패키지 생성 환경에서 실행해 통과했다. 결과는 `test-results.txt`다.

상태/리비전 검사 샘플은 메모리 안에서만 작동한다. 실제 API는 검증과 변경을 원자적인 DB 트랜잭션으로 구현해야 한다. 사용자 동시 편집, 유료 과금, 작업 취소, 렌더러 격리 등 운영 테스트는 BACKLOG에 남아 있다.

프롬프트와 규격에 쓰인 새 폴더/기능/템플릿 이름은 제안이며, 원본 저장소에 이미 존재한다고 주장하지 않는다. 본 패키지에 원본 저장소 코드 복사본이나 유료 미디어·폰트 파일은 포함하지 않았다.
# 로컬 실행 작업 (visualmaker-job-v1)

Studio의 “현재 리비전 패키지 만들기”는 SQLite에 검증된 계획 스냅샷과 SHA-256을 저장합니다. 대기 작업을 실행하면 `data/visualmaker/jobs/` 아래에 계획 JSON, 장면 CSV, 자료 요구 JSON, 패키지 명세를 기록합니다. 완료 상태의 파일만 API에서 해시를 다시 확인해 내려받을 수 있습니다. 대본이나 장면을 고쳐도 이전 작업의 스냅샷은 바뀌지 않으며 화면에 리비전 차이가 표시됩니다.

작업 상태는 `queued → running → succeeded/failed/cancelled`이며, 실패·취소 작업은 같은 스냅샷으로 재시도합니다. 실행 중인 작업은 5분 임대가 만료된 후에만 명시적으로 중단 복구할 수 있습니다. 같은 요청 키와 입력은 이후 프로젝트가 수정되어도 기존 작업을 돌려줍니다. 이 첫 어댑터는 짧은 계획 패키지를 요청 중 동기 실행하며 별도 백그라운드 worker는 없습니다. 서버가 종료되면 진행 중 작업은 임대 만료 후 복구·재시도가 필요합니다.

`render-preview` 요청은 `blocked`로 저장됩니다. Remotion/FFmpeg 렌더 연결, 컷 미리보기, 자료·권리 승인, 생산 권한 승격은 구현되지 않았습니다. 패키지의 `productionAuthority`는 항상 `false`이고 업로드 자료는 `pending-review`입니다.
