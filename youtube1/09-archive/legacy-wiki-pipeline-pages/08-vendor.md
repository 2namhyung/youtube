# 08 Vendor 운영 런북

## 목적·역할

제3자 의존성·라이선스 문서·vendor 트리를 보존하는 지원 단계다. first-party pipeline 구현이나 게시 산출물로 취급하지 않는다([Vendor README](../../08-vendor/README.md), [vendor tree](../../08-vendor/vendor)).

## 시작 조건과 담당자

개발/컴플라이언스 담당자가 의존성 추가·업데이트·릴리스 전에 수동 감사한다. 현재 라이선스/버전 검사를 파이프라인에 연결한 실행 명령은 없다(**미확인**, [단계 README](../../08-vendor/README.md)).

## 입력·전제·비밀

입력은 vendor 하위의 제3자 소스·README·LICENSE와 도입 버전/커밋 정보다([Codex LLM Wiki vendor](../../08-vendor/vendor/codex-llm-wiki)). 비밀값·`api.txt`를 vendor 문서에 복사하지 않는다([AGENTS](../../AGENTS.md)).

## 정상 절차(수동 계약)

실행 가능한 표준 명령은 없다. 담당자는 각 vendor 디렉터리의 README와 LICENSE를 읽고, 버전/커밋/라이선스/변경일/checksum을 감사표에 기록한다. 업데이트 시 기존 트리를 보존한 채 새 버전을 별도 경로에서 검토하고 Production 빌드에 실제 사용되는지 확인한다(**수동 계약**, [Vendor README](../../08-vendor/README.md)).

## 내부 처리·산출물·인계

산출물은 보존된 vendor 트리와 감사표다. Production은 필요한 third-party 명령·모델의 버전과 라이선스가 승인된 경우에만 참조한다([Production 의존성](../../04-production/opencut-automation/package.json), [automation README](../../04-production/opencut-automation/README.md)). 인계에는 라이선스 호환성, 고정 버전/커밋, checksum, 승인자와 롤백 위치를 포함한다(**운영 계약**).

## 검증 체크리스트

- 각 `LICENSE`와 README의 버전·출처 링크를 확인한다([LICENSE](../../08-vendor/vendor/codex-llm-wiki/LICENSE), [README](../../08-vendor/vendor/codex-llm-wiki/README.md)).
- 파일 무결성은 `Get-FileHash <vendor-file> -Algorithm SHA256`로 읽기 검사한다(**수동**).
- Production 스크립트 구문 검사는 변경된 명령에 한해 실행한다:

```powershell
cd C:\Users\User\Desktop\app\youtube\04-production\opencut-automation
node --check scripts/produce-short.mjs
```

## 장애·복구·롤백

라이선스 불명·버전 drift·checksum 불일치면 해당 vendor를 사용 중지하고 기존 승인 버전을 보존한다. 새 버전이 문제를 일으키면 참조를 이전 고정 버전으로 되돌리고 vendor 파일은 삭제하지 않는다(**수동 롤백**, [Vendor README](../../08-vendor/README.md), [AGENTS](../../AGENTS.md)).

## 완전성·공백·다음 마일스톤

| 입력 | 구현 | 설정·의존성 | 검증 | 산출물·운영 | 합계 | 상태 |
|---:|---:|---:|---:|---:|---:|---|
| 17 | 3 | 10 | 3 | 15 | **48/100** | 지원·비활성 |

라이선스·버전 감사 결과가 Production gate에 연결되지 않은 것이 공백이다([Vendor README](../../08-vendor/README.md)). 다음 마일스톤은 vendor별 감사표와 빌드 전 자동 버전/라이선스 체크를 추가하는 것이다(**계획**).

## 근거 링크

[08 Vendor README](../../08-vendor/README.md) · [vendor tree](../../08-vendor/vendor) · [Codex LLM Wiki README/LICENSE](../../08-vendor/vendor/codex-llm-wiki/README.md) · [Production package](../../04-production/opencut-automation/package.json)
