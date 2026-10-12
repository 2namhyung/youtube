# 06 Archive 운영 런북

## 목적·역할

슈퍼세디드 스크립트·SRT·TTS 오디오와 zip 스냅샷을 장기 보관하는 비운영 단계다. 보관 파일은 승격 provenance 없이는 활성 입력으로 사용하지 않는다([Archive README](../../06-archive/README.md)).

## 시작 조건과 담당자

프로듀서/보존 담당자가 새 버전이 승인되어 이전 산출물을 교체할 때 수동 보관한다. 예약 작업·자동 압축 스크립트는 확인되지 않았으며, 현재 `scripts.zip`, `shorts.zip` 등은 이미 보관된 파일이다([Archive 목록](../../06-archive)).

## 입력·전제

입력은 Production/Voice에서 더 이상 활성으로 쓰지 않는 파일, 원래 경로·버전·승인자·SHA-256 메타데이터다([Archive README](../../06-archive/README.md)). 원본 감사 자료와 `api.txt`는 이 단계로 복사하지 않고 각각 불변/비밀 규칙을 따른다([AGENTS](../../AGENTS.md)).

## 정상 절차(수동)

실행 가능한 명령은 없다. 파일을 `06-archive/`의 날짜/프로젝트 하위 폴더에 복사하고 `manifest.json` 또는 로그에 원본 상대 경로, checksum, 보관 이유, 승격 금지 상태를 기록한다. zip을 열어 복원할 때는 임시 디렉터리에서 읽기 검사 후 승인된 새 단계로 복사한다(**수동 계약**, [README](../../06-archive/README.md)).

## 내부 처리·산출물·복원/승격

산출물은 보관 파일과 provenance 목록이며 Archive가 소유한다. 복원은 원본 보존→압축 무결성 확인→별도 작업 디렉터리 추출→편집자 검토→01–05 중 해당 단계로 새 버전 승격 순이다(**운영 절차, 자동화 미확인**). 보관 파일을 직접 Production 경로에 덮어쓰지 않는다.

## 검증 체크리스트

- zip 목록과 checksum을 읽기 검사한다(예: `Get-FileHash 06-archive\scripts.zip -Algorithm SHA256`; **수동**).
- 복원 전 파일을 임시 폴더에서 열고 SRT/오디오가 예상 프로젝트와 일치하는지 확인한다([보관 샘플](../../06-archive)).
- 실제 파이프라인 테스트는 이 단계에 없으므로 Production 테스트로 승격 후 계약을 검증한다([Production tests](../../04-production/opencut-automation/scripts/production-tests.mjs)).

## 장애·복구·롤백

압축 손상 시 다른 보관 복사본이나 원래 모듈 소유 출력을 찾고, 손상 파일은 삭제하지 말고 `corrupt` 표시를 남긴다. 잘못 승격한 파일은 새 버전의 참조를 되돌리되 Archive 원본은 보존한다(**수동/비파괴 원칙**, [AGENTS](../../AGENTS.md)).

## 완전성·공백·다음 마일스톤

| 입력 | 구현 | 설정·의존성 | 검증 | 산출물·운영 | 합계 | 상태 |
|---:|---:|---:|---:|---:|---:|---|
| 15 | 2 | 2 | 2 | 15 | **36/100** | 지원·비활성 |

보관 manifest·복원 테스트·자동 보존 정책이 없다([README](../../06-archive/README.md)). 다음 마일스톤은 날짜/프로젝트 manifest와 checksum 기반 복원 점검표를 추가하는 것이다(**계획**).

## 근거 링크

[06 Archive README](../../06-archive/README.md) · [archive files](../../06-archive) · [Production tests](../../04-production/opencut-automation/scripts/production-tests.mjs)
