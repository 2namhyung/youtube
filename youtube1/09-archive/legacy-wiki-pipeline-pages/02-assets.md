# 02 Assets 운영 런북

## 목적·역할

Production에서 재사용할 분리 미디어 자산을 보관하는 예약 단계다. 현재 기준에 맞는 자산 폴더와 실행 코드가 없고 제3자 자료는 08 Vendor에 남아 있다([단계 README](../../02-assets/README.md), [Vendor](../../08-vendor/vendor)).

## 시작 조건과 담당자

프로듀서가 Research 승인 후보에 사용할 별도 이미지·영상이 생겼을 때 수동으로 자산 등록을 시작한다. 자동 수집·변환 명령은 존재하지 않는다(확인된 스크립트 없음; [단계 파일 목록](../../02-assets/README.md)).

## 입력·전제

입력은 승인된 로컬 미디어 파일과 원문 URL/라이선스·취득 시각·SHA-256 같은 provenance 기록이다. 현재 실제 입력 경로는 미확인이다(**미확인**, [README](../../02-assets/README.md)). `api.txt`를 포함한 비밀값은 복사하지 않는다([루트 운영 지침](../../AGENTS.md)).

## 정상 절차(수동 계약)

실행 가능한 명령은 없다. 담당자는 `02-assets/` 아래에 자산별 하위 폴더를 만들고 원본 파일을 복사한 뒤, 출처·권리 승인·체크섬·사용 범위를 README 또는 manifest로 기록한다. 파일을 04 Production 프로젝트의 `assets` 경로로 참조하기 전에 편집자 권리 승인을 받는다(**수동 계약**, [Production 미디어 계약](../../04-production/README.md)).

## 내부 처리·산출물

자동 처리 함수·테스트·정식 산출물은 없다. 등록된 파일과 provenance 문서가 Assets 모듈 소유 산출물이며, 미등록 파일은 다음 단계 입력으로 취급하지 않는다([단계 README](../../02-assets/README.md)).

## 인계 게이트

인계 패키지에는 자산 경로, 원문 URL, 라이선스/권리 확인자, SHA-256, 허용 구간이 있어야 한다. Production의 `media.clips`는 `rightsAttested`와 bounded start/end를 요구하므로 해당 필드가 없는 자산은 거부한다([뉴스룸 미디어 검증](../../04-production/opencut-automation/scripts/newsroom-tests.mjs), [Production README](../../04-production/README.md)).

## 검증 체크리스트

- `02-assets`에 등록 파일·manifest와 체크섬이 함께 있는지 확인한다(**수동**).
- Production 테스트에서 승인 미디어 계약을 읽기 검증할 수 있다(렌더 없이 실행):

```powershell
cd C:\Users\User\Desktop\app\youtube\04-production\opencut-automation
node scripts/newsroom-tests.mjs
```

이 명령은 fixture를 사용하며 네트워크·다운로드 없이 권리 플래그와 경로 계약을 검사한다([테스트](../../04-production/opencut-automation/scripts/newsroom-tests.mjs)).

## 장애·복구·롤백

권리 증빙이나 체크섬이 없으면 파일을 삭제하지 말고 `quarantine` 같은 별도 하위 폴더에 보류 표시를 남긴다(**수동 권고**). 잘못 등록한 파일은 원본 보존 후 manifest 참조만 제거하고, 삭제·덮어쓰기는 승인받는다([불변/비파괴 원칙](../../AGENTS.md)).

## 완전성·공백·다음 마일스톤

| 입력 | 구현 | 설정·의존성 | 검증 | 산출물·운영 | 합계 | 상태 |
|---:|---:|---:|---:|---:|---:|---|
| 2 | 2 | 1 | 1 | 1 | **7/100** | 지원·비활성 |

현재 분리 자산과 자동화·승격 로그가 없다([README](../../02-assets/README.md)). 다음 마일스톤은 첫 자산 manifest와 권리 승인 템플릿을 추가하고 04 인계 테스트에 연결하는 것이다(**계획/미구현**).

## 근거 링크

[02 Assets README](../../02-assets/README.md) · [Production README](../../04-production/README.md) · [뉴스룸 테스트](../../04-production/opencut-automation/scripts/newsroom-tests.mjs) · [Vendor tree](../../08-vendor/vendor)
