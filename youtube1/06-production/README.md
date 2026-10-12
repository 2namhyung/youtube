# 06 OpenCut 영상 제작

확정 대본, LoRA 내레이션, 영상 자산, BGM, 자막을 결합해 세로 영상을 렌더하고 OpenCut 편집 handoff를 만듭니다.

- 통합 엔진: [`opencut-automation`](opencut-automation)
- 현재 프로젝트: [`school-case-production/project.json`](opencut-automation/production/projects/school-case-production/project.json)
- 렌더러: [`produce-short.mjs`](opencut-automation/scripts/produce-short.mjs)
- 게이트: 대본·자산·음성·BGM 계약과 체크섬, 1080×1920/30fps, editable handoff

새 handoff는 대본 JSON, 내레이션 오디오, 장면별 클립, 자막 cue, BGM 오디오 또는 `pending` 계약을 분리합니다. OpenCut 앱과 중첩 `.git`, 모듈 소유 `out`은 이 폴더 안에서 그대로 보존합니다.

제주 프로젝트는 법률 QA blocker를 `releaseGate`로 metadata와 handoff에 전달하며 `publishable=false`, `uploadBlocked=true`인 preview만 허용합니다. 2026-07-27 하이브리드 실행은 음성 게이트에서 종료되어 새 preview를 렌더하거나 등록하지 않았고, [`out/.private/.../failure.json`](opencut-automation/out/.private/school-case-ms38nout-17636-4oh18b-failed/failure.json)에 실패 증거만 보존했습니다.

다음 단계: [`../07-quality-assurance`](../07-quality-assurance)
