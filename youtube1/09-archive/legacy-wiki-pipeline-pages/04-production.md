# 04 Production 운영 런북

## 목적·역할

승인된 뉴스룸 리서치·스크립트와 음성·권리 확인 미디어를 OpenCut 프로젝트로 조립하고 렌더·QA·handoff·registry를 만드는 핵심 단계다([Production README](../../04-production/README.md), [automation README](../../04-production/opencut-automation/README.md)).

## 시작 조건과 담당자

뉴스룸 편집자가 Research 후보를 사실 확인하고 스크립트 `status=final`로 승인한 뒤 프로듀서가 실행한다. `produce-short.mjs`는 `scriptSource`가 있으면 `status: final`과 `finalizedAt`을 강제한다([produce-short](../../04-production/opencut-automation/scripts/produce-short.mjs)).

## 입력·구성·의존성

- 작업 디렉터리: `C:\Users\User\Desktop\app\youtube\04-production\opencut-automation`.
- 활성 프로젝트 예시는 [`production/projects/school-case-production/project.json`](../../04-production/opencut-automation/production/projects/school-case-production/project.json)이다. 이 manifest가 프로젝트 내부 `assets/images-v2` 재구성 이미지, `assets/media` KCTV 클립, 장면 순서와 `sceneReplacements`를 지정한다([프로젝트](../../04-production/opencut-automation/production/projects/school-case-production/project.json)). 별도 [`video_project`](../../04-production/video_project)는 현재 등록 OpenCut 렌더의 직접 입력으로 확인되지 않으므로 독립 레거시 제작 경로로 취급한다.
- `package.json` 스크립트와 Playwright/Chromium, ffmpeg·ffprobe, Python 폰트/ASR 도구가 필요하다([package](../../04-production/opencut-automation/package.json), [automation README](../../04-production/opencut-automation/README.md)).
- local-clone은 sibling `03-voice/voice-clone`; Fish는 `narration.fishRoot` 로컬 트리에서 실행한다([automation README](../../04-production/opencut-automation/README.md), [Fish provider](../../04-production/opencut-automation/scripts/fish-speech-lora-provider.mjs)).
- API 키·`api.txt`를 읽지 않으며, 역사 메타데이터의 이전 절대 경로는 현재 설정으로 수정하지 않는다([AGENTS](../../AGENTS.md), [latest render](../../04-production/opencut-automation/out/latest-render.json)).

## 정상 절차

의존성 설치와 로컬 서버 시작은 automation README의 명령을 따른다([설치/서버](../../04-production/opencut-automation/README.md)). 프로젝트를 렌더하려면:

```powershell
cd C:\Users\User\Desktop\app\youtube\04-production\opencut-automation
npm run short:produce -- --project production/projects/school-case-production/project.json
```

`--no-register`는 private 출력만 만들 때 사용하고, 기본 실행은 `out/`에 MP4·thumbnail·handoff를 등록한다([produce-short 인자](../../04-production/opencut-automation/scripts/produce-short.mjs)). OpenCut UI/스모크 import가 필요할 때만 `npm run dev:automation` 및 `npm run import -- --manifest ...`를 사용한다([automation README](../../04-production/opencut-automation/README.md)).

## 내부 처리 순서

manifest 검증 → authoritative script/hash 계산 → narration provider 실행 및 SRT/cue 생성 → 침묵·tempo 보정 → ASS 캡션 calibration → 장면/권리 미디어 검증 → ffmpeg 렌더 → thumbnail·handoff·registry 기록 순이다([produce-short](../../04-production/opencut-automation/scripts/produce-short.mjs), [production-lib](../../04-production/opencut-automation/scripts/production-lib.mjs)). Newsroom은 후보 수집·점수화→draft/법무·권리 확인→프로젝트 config 생성을 담당한다([newsroom-lib](../../04-production/opencut-automation/scripts/newsroom-lib.mjs), [newsroom tests](../../04-production/opencut-automation/scripts/newsroom-tests.mjs)).

## 산출물·현재 상태

모듈 소유 `out/`에 MP4, PNG thumbnail, `registry/`와 handoff JSON이 생성된다([out](../../04-production/opencut-automation/out), [registry](../../04-production/opencut-automation/out/registry)). 현재 [`latest-render.json`](../../04-production/opencut-automation/out/latest-render.json)은 1080×1920·30fps·59.966667초 렌더를 가리킨다. 메타데이터의 `speechAcceptance.final.accepted=false`(cue 7·11·15 오류)이므로 게시 가능 또는 Delivery 승인으로 표시하지 않는다([latest-render](../../04-production/opencut-automation/out/latest-render.json)).

## 인계 게이트

다음 단계로 넘기려면 script/project SHA-256, 권리 attestation·미디어 checksum, 렌더 파일 존재, handoff/registry 일치, QA 테스트 통과, 그리고 `speechAcceptance.final.accepted=true`가 모두 필요하다([render-handoff tests](../../04-production/opencut-automation/scripts/render-handoff-tests.mjs), [project config](../../04-production/opencut-automation/production/projects/school-case-production/project.json)). 하나라도 실패하면 release를 차단한다(**운영 게이트**, 현재 미통과).

## 검증 체크리스트

네트워크·렌더를 유발하지 않는 집중 검증:

```powershell
cd C:\Users\User\Desktop\app\youtube\04-production\opencut-automation
node --check scripts/produce-short.mjs
node scripts/production-tests.mjs
node scripts/render-handoff-tests.mjs
node scripts/research-pipeline-tests.mjs
node scripts/newsroom-tests.mjs
```

`--render-smoke`, `--live`, 실제 `short:produce`는 별도 승인 후 실행한다([테스트 옵션](../../04-production/opencut-automation/scripts/newsroom-tests.mjs)).

## 장애·복구·롤백

manifest·권리·음성 acceptance 오류는 입력을 수정해 새 run으로 재시도한다. `.runs`와 `.private`를 먼저 보존하고 registry를 수동 편집하거나 기존 MP4를 삭제하지 않는다([produce-short 출력 구조](../../04-production/opencut-automation/scripts/produce-short.mjs)). 렌더 후 handoff 불일치면 해당 버전을 Delivery에 넘기지 말고 이전 검증된 버전과 checksum을 비교한다(**복구 절차는 운영 권고**).

## 완전성·공백·다음 마일스톤

| 입력 | 구현 | 설정·의존성 | 검증 | 산출물·운영 | 합계 | 상태 |
|---:|---:|---:|---:|---:|---:|---|
| 18 | 19 | 18 | 12 | 16 | **83/100** | 부분 운영 |

최종 음성 QA gate가 nested final 판정을 차단하지 못한 것이 핵심 공백이다([latest-render](../../04-production/opencut-automation/out/latest-render.json)). 다음 마일스톤은 final=false이면 registry 승격과 05 인계를 실패시키는 gate를 코드·테스트로 고정하는 것이다(**계획**).

## 근거 링크

[Production README](../../04-production/README.md) · [automation README](../../04-production/opencut-automation/README.md) · [package scripts](../../04-production/opencut-automation/package.json) · [produce-short](../../04-production/opencut-automation/scripts/produce-short.mjs) · [newsroom/production tests](../../04-production/opencut-automation/scripts/newsroom-tests.mjs) · [latest render](../../04-production/opencut-automation/out/latest-render.json)
