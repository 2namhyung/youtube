# 23jung video workspace

현재 YouTube 제작 진입점은 [운영 플레이북](../wiki/syntheses/remotion-vox-production-playbook-v0.1.md)과 `episode-spec.json`이다. `pnpm run media:search-episode -- --plan`으로 실사·모션그래픽의 외부 검색 명세를 확인하고 `--execute`로 후보를 찾는다. `pnpm run video:validate-editorial-routing -- --check`는 모드 선택과 반복을 진단한다. 과거 QA 빌더를 현재 제작 경로로 사용하지 않는다.

이 디렉터리는 스토리라인이 잠긴 뒤 제작되는 보완수사법 본편의 Remotion 조립 공간이다. 현재는 **기획·자료 수급 단계**이며, 테스트 영상·테스트 음성·파일럿용 composition은 보관하지 않는다.

## 현재 상태

- 주제: 형사소송법 일부개정법률(법률 제21857호)
- 핵심 프레임: 검사의 일반적 직접수사 근거는 삭제되지만, 경찰 등 수사기관에 하는 보완수사요구는 남고 절차가 구체화된다.
- 주요 시행 예정일: 2026-10-02
- 현재 단계: `timing-draft`. 공식 자료와 스토리라인이 잠긴 뒤 임시 대본과 사용자 실측 발화속도로 실제 자산이 채워진 컷 프리뷰를 만든다. Omni 컷은 imagegen 키프레임까지만 만들고, 사용자가 episode-spec의 전체 planned cuts을 모두 PASS한 뒤에만 MP4를 생성한다. 전체 provisional 영상까지 별도로 승인한 뒤 최종 대본과 녹음을 확정한다. 기존 컷과 raw는 보존한다.
- 현재 비활성 스타일 캘리브레이션 후보는 `episode-001-v06`이다. SH002·SH005·SH047은 Manifest v3 Remotion playback, SH008은 별도 Omni keyframe gallery로 검수한다. QA는 1920×1080 contact sheet와 360×203 mobile evidence를 만들지만 production PASS·active root·Omni MP4를 만들거나 승인하지 않는다.
- 본편 길이 기준: 8–10분(480–600초). 보완수사권 1편은 전체 계획 컷 로컬 내레이션 단위로 구성하며, 임의로 내용을 늘리지 않고 실제 사용자 음성 측정으로 최종 길이를 확정한다.
- 원본 기획: [`wiki/syntheses/supplementary-investigation-first-video-v0.1.md`](../wiki/syntheses/supplementary-investigation-first-video-v0.1.md)

## 제작 원칙

각 컷은 PPT 한 장처럼 설계한다. 자료와 스토리라인이 정해지면 컷별 임시 대본을 만들고 사용자의 실측 발화속도로 provisional 프레임을 계산한다. Remotion과 실제 자료 컷은 실제 로컬 시각 자산을 먼저 배치하고, Omni 컷은 imagegen PNG 키프레임까지만 준비한다. 사용자가 전체 계획 컷 모두를 개별 PASS하면 Omni MP4 생성을 허용하고 전체 provisional 영상을 조립한다. 사용자가 이 전체 영상까지 승인한 뒤 사실 표현과 최종 대본을 잠그고 final 음성을 녹음한다. 측정된 final 음성은 승인된 컷의 reveal·hold·전환을 재타이밍하는 기준이다. scratch 음성은 선택 사항이다. 실제 인물·실제 사건·실제 발언은 승인된 공식 사진·영상·문서로 보여주며, 명시적인 가상 생활 사례만 Omni를 사용한다. 법률 조문·절차·날짜·수치는 Remotion에서 데이터와 PNG를 조립한다.

Remotion 컷은 항상 다음 순서를 따른다.

```text
고정 background.png만 표시
  → PNG·문서·차트·효과 등장
  → 모든 구성요소가 보이는 final hold
```

Remotion 컷이 Remotion 컷으로 이어지는 경계에는 `morph` 또는 `scene-to-scene`만 사용한다. 실제 사진·영상·Omni와 맞닿는 경계는 해당 자료의 성격에 맞춰 설계한다.

## 폴더와 명령

```text
video/public/assets/<episode>/cuts/SH###/
  background.png   # 고정 1920×1080 체크 배경
  manifest.json
  assets/          # Remotion 컷의 실제 PNG·SVG·문서·차트 입력; 빈 폴더 불가
  remotion/        # 컷 코드와 데이터
  omni/            # PASS 전 imagegen PNG·프롬프트만; 전체 planned-cut PASS 뒤 output.mp4
  source-photo/    # 실제 사진과 권리 기록
  source-video/    # 실제 영상과 in/out 타임코드
  derivation-inputs/ # 투명 레이어에 사용한 승인 마스크; 파생이 있을 때만 생성
  effects/         # effects_required=true일 때만 만들고 실제 효과 파일 저장
  audio/           # 해당 컷의 final VO·SFX; final VO는 시각 승인 뒤 확정
  preview/
```

활성 컷은 `background.png`와 manifest만으로 통과하지 않는다. mode별 실제 로컬 시각 입력이 최소 하나 있어야 하며, 빈 폴더·README·JSON·`.gitkeep`·placeholder와 고정 배경의 복제본은 자산으로 세지 않는다. 이미지 signature·크기 또는 영상의 positive-duration stream을 확인하므로 확장자만 바꾼 파일도 실패한다. `effects_required: false`이면 빈 `effects/` 폴더를 만들지 않고, `true`이면 manifest record·출처·checksum과 실제 파일이 모두 필요하다. 컷별 PASS는 검수한 asset·imagegen 키프레임·effect의 SHA-256과 전체 계획 컷 전체의 `cut_review.approved_inputs_sha256` 집계값에 묶이고, 파일이 바뀌면 해당 PASS가 무효화된다. 컷별 PASS 전에는 파일명을 불문하고 Omni 동영상이 존재·참조되거나 생성 완료 상태로 기록되면 실패한다. 전체 provisional 영상 승인도 artifact SHA-256에 묶이며, 같은 경로에서 파일이 바뀌면 최종 대본 잠금이 해제된다.

EP001 계획의 유일한 수동 편집 권한은 [episode-spec](episodes/episode-001/episode-spec.json)이다. `narration-plan.json`, `cut-plan.json`, `cut-source-design.json`은 `pnpm run video:generate-plans`가 만드는 호환 출력이며 직접 수정하지 않는다. `pnpm run video:validate-episode-spec`은 spec 구조·SHA-256 marker·출력 drift를 검사한다. episode-spec의 전체 planned cuts 시간은 최종 음성 측정 전까지 provisional이며, 녹음 파일은 [narration intake](source-intake/episode-001/narration/README.md)의 규칙을 따른다.

```powershell
pnpm video:validate-narration
pnpm video:validate-narration -- --audio-dir video/source-intake/episode-001/narration/scratch
pnpm video:measure-narration
```

`video:validate-narration`은 음성 없이도 episode-spec의 전체 planned cuts 계획, compact 임시 대본, 사용자 제공 4.965자/초 발화속도와 480–600초 provisional 영상을 검증한다. `video:measure-narration`은 시각 승인과 최종 대본 잠금 뒤 `final/`의 모든 SH### 녹음이 있어야 통과하며, `ffprobe`로 WAV·MP3·M4A·WEBM 길이를 읽어 30fps 컷 프레임과 전체 점유 시간을 계산한다. 합성 음성은 만들지 않는다.

Omni·Remotion·실제 소스의 provisional 제작은 임시 대본과 발화속도 계산 뒤 시작한다. final 음성 전에는 렌더와 composition 이름에 `provisional` 또는 `animatic`을 쓰며 `master`, `final`, `picture-locked`를 쓰지 않는다. 소스가 승인된 뒤에는 다음 명령을 사용한다.

```powershell
pnpm video:new-cut -- episode-001 SH001
pnpm video:validate-cuts
pnpm video:validate-cuts --require-cuts
pnpm video:validate-production-stage
pnpm video:production-qa
pnpm video:style-calibration-qa
pnpm video:style-calibration-studio
```

기본 컷 검증은 active cut root가 없는 `timing-draft`에서 성공하되 반려된 모든 폴더를 별도로 보고한다. `--require-cuts`는 provisional 제작 이후 게이트로, [production state](episodes/episode-001/production-state.json)에 지정된 active root의 episode-spec의 전체 planned cuts 전체가 없으면 실패한다. 단계·승인·출력명 잠금은 `video:validate-production-stage`가 검사한다.

### 수집 자료를 컷 자산으로 가져오기

`media_assets` 후보는 `review_queue`에서 `entity_type=media_asset`, `state=approved`가 된 뒤에만 컷으로 가져올 수 있다. [요청 예시](materialize-media.request.example.json)를 복사해 실제 media ID, 아직 PASS되지 않은 컷 폴더, 마스크나 외부 분리 PNG 경로를 적고 먼저 dry-run한다.

```powershell
pnpm video:materialize-media -- --request video/materialize-media.request.json --dry-run
pnpm video:materialize-media -- --request video/materialize-media.request.json
```

`route=source`는 공식 사진·영상 원본을 `source-photo/` 또는 `source-video/`로 byte-identical 복사하고 source 컷의 렌더 자산으로 등록한다. `route=transparent-layers`는 원본 전체를 `source-photo/`에 보존한 채 `person/building/object/interior`를 각각 `assets/*.png` 독립 레이어로 등록한다. 자동 분할기는 내장하지 않는다. 동일 크기의 사람이 확인한 `alpha-mask`, 또는 provider·검수 note가 있는 외부 `transparent-png`만 받는다. 원본 URL·license·attribution·source ID와 원본·분리 입력·파생 파일 SHA-256 및 alpha 통계를 `source_asset_materializations`에 기록한다. 투명 레이어 상태는 `asset-ready-presentation-pending`이므로 이후 presentation contract·semantic layout·motion을 설계하고 검수해야 한다. Cutout은 설명용 파생 표현이며 `documentary-evidence`로 지정하면 실패한다. Source: [materializer](../src/lib/video-asset-materializer.ts), [manifest schema](src/cut-manifest.ts), [cut validator](scripts/validate-cut-assets.mjs).

## 최종 후반 순서

자료·스토리라인 → 임시 대본 → 사용자 실측 발화속도 기반 컷 설계 → 실제 자산·Remotion·source 컷 + Omni imagegen 키프레임 → episode-spec의 전체 planned cuts 개별 PASS → Omni MP4 생성 → 전체 provisional 조립·사용자 승인 → 최종 대본·사실 잠금 → 사용자 final VO → 실측 음성 기반 컷 재타이밍·조립 → picture lock → 음성 믹스·자막·SFX·썸네일 순서다. final VO는 승인된 전체 영상의 최종 시간축이며, 음성이 길다고 새 주장을 추가하지 않는다.

## 확인 명령

```powershell
pnpm typecheck
pnpm video:validate-cuts
pnpm video:validate-production-stage
```

Remotion registry에는 현재 반려된 이전 구현을 확인하기 위한 `RejectedProvisional` composition만 남긴다. 활성 제작본이나 master로 취급하지 않으며, 새 provisional composition은 active cut root와 전체 계획 컷 검증을 통과한 뒤에만 등록한다.

`video:production-qa`는 유일하게 지원되는 QA 렌더 진입점이다. 제작 단계 검증, 컷 manifest의 `background-only → reveal → final-hold` 검증, 3상태 contact sheet, 360px final-hold 휴대전화 프리뷰를 한 번에 실행한다. 현재처럼 `timing-draft`이고 active cut root가 없으면 검증만 통과하고 렌더는 생략하며 컷이나 자산을 만들지 않는다. active root가 생기면 결과는 `video/qa/<episode-id>/contact-sheets/`와 `phone-previews/`에 생성된다. 이 결과는 사용자 컷 PASS를 돕지만 PASS를 자동 생성하거나 대신하지 않는다. 내부 contact/phone 렌더 스크립트를 직접 호출해도 동일한 cut-assets·production-stage·visual-state 게이트를 먼저 다시 실행하므로 우회할 수 없다.

`video:style-calibration-qa`는 production QA와 분리된 네 컷 캘리브레이션 진입점이다. Manifest v3는 하나의 focal target, semantic layout, component visibility state, 법률 overview→crop→exact quote, 최소 2초 reading hold와 360×203 mobile artifact를 검증한다. Omni SH008은 imagegen PNG keyframe만 허용하며 자동 PASS는 기록하지 않는다.

`video:style-calibration-studio`는 QA를 먼저 실행한 뒤 `Calibration-SH002`, `Calibration-SH005`, `Calibration-SH047`과 각 `CalibrationMobile-SH###` composition을 연다. SH008은 motion composition이 아니다. 기본 실행, `--port`, `--no-open` 규칙과 PASS·activation·Omni 금지는 유지한다.

manifest 기반 공통 렌더러는 `video/src/vox/`에 있다. 렌더 중에는 API, 원격 URL, TTS, 이미지·영상 생성 또는 자산 다운로드를 호출하지 않고 `video/public` 아래의 manifest 등록 로컬 파일만 읽는다. 컷 길이는 여전히 manifest의 `duration_frames`이며, 최종 단계에서는 사용자 녹음의 ffprobe 측정값으로 갱신된 프레임만 사용한다.

일반 Remotion registry는 `video/src/index.tsx`, QA 전용 Still registry는 `video/src/qa-index.tsx`, 캘리브레이션 Studio registry는 `video/src/style-calibration-index.tsx`로 분리한다. 제작 registry에는 반려된 기존 provisional composition만 남고, 캘리브레이션 registry는 실행 직전에 생성하는 `video/src/generated/style-calibration-catalog.ts`의 네 후보 컷만 읽는다. QA와 Studio 스크립트는 로컬 `node_modules/@remotion/cli/remotion-cli.js`를 현재 Node 실행 파일로 직접 호출한다.

검색 연속 실행: 동일 spec/provider에 대해 ledger의 `next_query_offset`을 `--query-offset`으로 전달한다. 한 batch는 전체 검색이 아니다. 지원 범위·실패·수동 경로·통합 선택은 [수급 파이프라인](../wiki/concepts/media-acquisition-pipeline.md)을 따른다.
