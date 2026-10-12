# 05 Delivery 운영 런북

## 목적·역할

승인된 Production MP4와 handoff 메타데이터를 목적지별 패키지로 승격하는 계약 단계다. 현재 패키징 구현·전달 로그·업로드 명령은 없으며 Production `out`을 Delivery 산출물로 간주하지 않는다([Delivery README](../../05-delivery/README.md), [Production out](../../04-production/opencut-automation/out)).

## 시작 조건과 담당자

배포 담당자가 Production release gate와 편집자 승인을 받은 뒤 수동으로 시작한다. 자동 트리거·업로드 클라이언트는 확인되지 않았다(**미확인**, [단계 README](../../05-delivery/README.md)).

## 입력·전제·비밀

입력은 Production의 MP4, thumbnail, handoff JSON, script/project hash, 미디어 권리 기록이다([Production handoff 테스트](../../04-production/opencut-automation/scripts/render-handoff-tests.mjs)). `speechAcceptance.final.accepted=true`, 목적지, SHA-256, 승인자·시각이 모두 있어야 한다. 토큰·API 키는 환경의 비밀 저장소에서만 주입하고 `api.txt`는 읽지 않는다([AGENTS](../../AGENTS.md)).

## 정상 절차(수동 계약)

실행 가능한 명령은 없다. 담당자는 승인된 파일을 별도 Delivery 패키지(파일·checksum manifest·handoff·provenance)로 복사하고 목적지/버전/승인자를 기록한 뒤 외부 업로드는 조직 승인 절차로 수행한다(**수동 계약**, [README](../../05-delivery/README.md)). 현재 렌더의 nested final이 false이므로 이 절차를 시작하지 않는다([latest-render](../../04-production/opencut-automation/out/latest-render.json)).

## 내부 처리·산출물·인계

자동 처리 함수와 소유 출력 디렉터리는 없다. 완성된 패키지와 전달 로그를 Delivery 소유로 만들고, 게시 시스템에는 checksum과 handoff를 함께 전달한다(**계약 정의**, 구현 미확인). 게시 완료 증거(목적지 응답/URL)는 다시 위키 로그에 남긴다(**운영 권고**).

## 검증 체크리스트

- Production handoff JSON의 파일 존재·SHA-256·`speechAcceptance.final.accepted`를 읽기 검사한다([latest-render](../../04-production/opencut-automation/out/latest-render.json)).
- Production 계약 테스트(렌더·네트워크 없이 fixture):

```powershell
cd C:\Users\User\Desktop\app\youtube\04-production\opencut-automation
node scripts/render-handoff-tests.mjs
```

- 패키지 생성 전 `Get-FileHash <file> -Algorithm SHA256`를 실행하고 manifest 값과 대조한다(**수동 검사**).

## 장애·복구·롤백

checksum 불일치·승인 누락·final=false이면 업로드하지 말고 원본 Production 버전을 보존한 채 새 패키지 버전을 만든다. 이미 전달한 파일은 목적지의 공식 롤백 절차를 따르고 로컬 파일을 삭제하지 않는다(**수동/미구현**; [비파괴 원칙](../../AGENTS.md)).

## 완전성·공백·다음 마일스톤

| 입력 | 구현 | 설정·의존성 | 검증 | 산출물·운영 | 합계 | 상태 |
|---:|---:|---:|---:|---:|---:|---|
| 4 | 3 | 2 | 2 | 2 | **13/100** | 지원·비활성 |

패키저·목적지 어댑터·전달 로그가 없다는 것이 현재 공백이다([README](../../05-delivery/README.md)). 다음 마일스톤은 checksum manifest 형식, 승인자 필드, 목적지별 dry-run/rollback 계약을 추가하는 것이다(**계획**).

## 근거 링크

[05 Delivery README](../../05-delivery/README.md) · [Production output](../../04-production/opencut-automation/out) · [handoff tests](../../04-production/opencut-automation/scripts/render-handoff-tests.mjs) · [latest render](../../04-production/opencut-automation/out/latest-render.json)
