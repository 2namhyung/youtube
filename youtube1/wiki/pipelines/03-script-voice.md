# 03 대본·LoRA 음성

## 현재 뉴스룸 영상 인계 계약 (2026-08-15)

활성 영상 인계는 승인된 final 대본과 `owner-voice-v1` narration audio, locked canonical timing을 요구한다. primary agent는 이 exact script/audio/timing과 승인 뉴스 SHA를 묶은 `newsroom-storyline-v2`를 먼저 승인하고, 그 다음에만 `newsroom-semantic-cut-plan-v2`를 봉인한다. 과거 Qwen/Fish Speech 실험과 프로젝트별 accepted/rejected 기록은 아래에 history로 보존하지만 stale 또는 superseded 음성은 새 제작 권위가 아니다. Source: [canonical contract](newsroom-video-production.md).

## 현재 활성 경로 — Qwen3-TTS Base BF16

- 상태: 활성, 실제 GPU smoke 통과
- 모델: `Qwen/Qwen3-TTS-12Hz-0.6B-Base`
- 정밀도/장치: BF16 / CUDA
- 화자 기준: [qwen-f4 profile](../../03-script-voice/voice-clone/profiles/qwen-f4/manifest.json)
- 생성: [Qwen provider](../../06-production/opencut-automation/scripts/qwen3-tts-provider.mjs) + [persistent worker](../../06-production/opencut-automation/scripts/qwen3-tts-worker.py)
- 검증: Whisper small+medium CPU int8, 각 정규화 CER 8% 이하, fail closed
- 리듬: 자연 문장군 연속 생성, 고정 연결 무음 없음, 최종 전체 파형 템포 최대 1.08배
- 안전: 시작 52°C 이하, 실행 중 74°C hard stop
- 증거: [GPU smoke acceptance](../../03-script-voice/runs/qwen-canonical-20260730/smoke.acceptance.json)

### 제주 accepted pipeline lock

- Canonical contract: [`qwen-jeju-canonical-20260801/manifest.json`](../../03-script-voice/releases/qwen-jeju-canonical-20260801/manifest.json)
- Golden preview: `msaixlix-10524-6d9641` (48.733333 s, 18 authoritative source cues -> 35 visual caption cues, 88 global word anchors, 13 semantic pauses, no BGM; caption text/start/end generated and accepted in the same full handoff)
- Question routing: exactly three owner-only question sentences; all declaratives retain the F4 guide. The authoritative script is the exact speech contract: only non-spoken angle brackets around `<참교육>` are removed. `성적 목적` remains exact and receives one local +3 semitone `rubberband` pitch correction on `성적`, preserving formant and duration; post-correction small+medium ASR must revalidate it.
- Gates: strict Whisper small+medium CER ≤ 0.08, critical phrases, clipping/endpoint/tail checks, forward-only anchor search (20 ms guard), monotonic anchors, no BGM, and fail-closed pitch-correction evidence applied exactly once. No LoRA/adapter/fallback.
- Critical phrase checks run on the recorded `medium` model evidence; small+medium remain the strict transcript CER pair. The active prompt-bank manifest is sanitized to source ID/SHA/duration/owner-local flags; only the immutable golden handoff's pre-sanitization SHA is retained for evidence comparison.
- Regression (no model generation): `npm run test:qwen-canonical-jeju` from `06-production/opencut-automation`.
- Release remains `preview`, `publishable=false`, `uploadBlocked=true`; legal human review is still required.

이전 Fish Speech/F3/F4 LoRA, CosyVoice, GPT-SoVITS 자료는 비교·실패 분석 기록으로만 유지합니다. 비-Qwen 모델 파일은 [cleanup report](../../03-script-voice/voice-clone/MODEL_CLEANUP_20260730.md)에 기록한 정확한 경로에서 제거됐습니다.

- 상태: 차단 (80%)
- 입력: 01 사실·충돌, 02 법률 간극, 참조 음성
- 처리: 대본 생성·검토·final 잠금 → cue 분리 → Fish Speech LoRA 합성 → ASR·발음 검증
- 출력: final 대본, 내레이션, caption cue, speech acceptance
- 게이트: `status=final` 및 `speechAcceptance.final.accepted=true`

제주 대본은 [final project](../../06-production/opencut-automation/production/newsroom/projects/jeju-school-intrusion.json)와 SHA-256 `612d65ba...affbe1`로 잠겼습니다. 2026-07-27 실행은 [소유자 녹음](../../03-script-voice/voice-clone/samples/F3-prosody-prompt.wav)을 byte-identical로 cue 1–3에 배치하고, 원음 hash와 large-v3/large-v3-turbo의 핵심어 `교권보호국`을 런타임 검증했습니다. cue 4–18은 F3 LoRA 1.0x 연속 문장 단위, unit당 최대 3회, tail trim only, 인위적 silence와 microsegment 없이 생성하도록 [fish provider](../../06-production/opencut-automation/scripts/fish-speech-lora-provider.mjs)에 구현했습니다.

첫 생성 단위(cue 4–7)는 세 시드 모두 `봤습니다`를 `받습니다`로 발음해 탈락했습니다. [실패 증거](../../06-production/opencut-automation/out/.private/school-case-ms38nout-17636-4oh18b-failed/failure.json)에 각 WAV·ASR·설정이 보존됐고 accepted generated unit은 0개입니다. 새 목표 녹음이 제공되기 전에는 재합성하지 않습니다.

## F4 추가 녹음 재평가와 학습 결과

[최종 학습 보고서](../../03-script-voice/voice-clone/training/F4-20260729/TRAINING_REPORT.md), [전체 파일 입학 판정](../../03-script-voice/runs/F4-20260729/new-recordings-admission-rejection.json), [문장 salvage 판정](../../03-script-voice/runs/F4-20260729/sentence-salvage.json)이 원본 SHA-256·음향 QC·large-v3/large-v3-turbo 결과를 고정합니다. 새 녹음은 전체 파일 단위로 모두 거절했습니다. 대신 다음 조건을 전부 만족하는 완전한 정답 문장만 별도 clip으로 만들었습니다.

- primary와 turbo의 정규화 문장이 canonical 문장과 exact 일치
- `교권보호국`, `봤습니다`, `재물손괴` 등 핵심어 exact 일치
- false start와 긴 문장 내부 정지 없음
- 문장 앞뒤에 최소 150ms 경계 여백

기존 clean item 1·2·3·7도 같은 기준으로 다시 평가한 결과 전체 43개 중 25개, 정확히 125.0초만 승인했습니다. [dataset manifest](../../03-script-voice/voice-clone/training/F4-20260729/fish-dataset/dataset_manifest.json)의 25개 audio/lab hash를 고정했고, 검증 2문장·14.8초는 training·augmentation·reference prompt에서 격리했습니다.

Fish Speech 1.5 LoRA 학습은 rank 8, alpha 16, dropout 0.01, BF16으로 수행했습니다. step 114에서 GPU가 83°C에 도달해 82°C 안전 상한에 따라 즉시 중단했고, 종료 경합으로 생긴 step 120 파일은 checkpoint 순위·병합·probe에서 제외했습니다. 안전 checkpoint 검증 순위의 상위 2개만 55°C 이하로 냉각한 뒤 순차 probe했습니다.

- step 60: held-out 2문장은 통과했지만 primary가 `봤습니다→받습니다`, `재물손괴→재물 송개`; turbo가 `교권보호국→교건보호국`, `재물손괴→재물 송개`
- step 40: held-out 2문장은 통과했지만 primary가 `봤습니다→받습니다`; turbo가 `재물손괴→재물 송개`

[checkpoint 비교 판정](../../03-script-voice/runs/F4-20260729/checkpoint-comparison.json)은 `REJECT_NO_F4_MODEL_SELECTED`입니다. 병합된 step 60·40 디렉터리는 candidate-only 실험 자산이며 production model, selected marker, 프로젝트 설정을 변경하지 않았습니다. 다음 녹음은 `교권보호국`, `봤습니다`와 `받습니다`의 대조, `재물손괴`를 짧고 자연스러운 여러 문장으로 집중 확보해야 합니다. 세 핵심어가 held-out과 dual-ASR을 모두 통과하기 전에는 04단계로 승격하지 않습니다.

## F4 target 보정 결과

[보정 보고서](../../03-script-voice/voice-clone/training/F4-target-20260729/REMEDIATION_REPORT.md)와 [입학 증거](../../03-script-voice/runs/F4-target-20260729/target-admission.json)는 새 녹음 3개·10문장이 whole-file QC, dual-ASR normalized full exact, 핵심어 exact, no-restart/no-long-pause 기준을 통과했음을 기록합니다. 기존 salvage 25클립·125.0초는 1회, target 10문장은 최대 2회만 사용해 총 45클립·189.32초를 구성했습니다. [dataset manifest](../../03-script-voice/voice-clone/training/F4-target-20260729/fish-dataset/dataset_manifest.json)는 validation 2클립·14.8초가 training·augmentation·prompt에서 제외됐음과 모든 audio/lab hash를 고정합니다.

step 40 continuation은 preflight상 optimizer·scheduler·loop state가 있었지만 runtime strict restore가 LoRA-only `state_dict`에 없는 base weight 203개를 요구해 거절됐습니다. [resume 증거](../../03-script-voice/runs/F4-target-20260729/safe-resume.json)상 resumed optimizer step은 0이고 원본 checkpoint hash는 전후 동일합니다. base-from-scratch fallback은 smoke 2/2를 통과했으나 step 44에서 80°C가 관측되어 78°C hard stop으로 종료됐습니다. 마지막 안전 checkpoint는 step 40입니다. Source: [training safety](../../03-script-voice/runs/F4-target-20260729/base-training-safety.json).

validation 상위 step 40·30을 55°C 이하에서 순차 probe한 결과 둘 다 held-out 전문을 양쪽 ASR에서 통과했습니다. 그러나 step 40 primary는 `봤습니다→받습니다`, `재물손괴→재물 송개`; step 30은 primary/turbo에서 `교권보호국`, `봤습니다`, `재물손괴` 중 하나 이상을 실패했습니다. [최종 비교](../../03-script-voice/runs/F4-target-20260729/target-checkpoint-comparison.json)의 판정은 `REJECT_NO_TARGET_MODEL_QUALIFIED`, `selected_model=null`입니다. 두 병합본은 comparison candidate일 뿐 Production 모델이 아닙니다.

검토용 음성은 [step 40 critical](../../03-script-voice/runs/F4-target-20260729/probes/f4-target-step40/audio/critical.wav), [step 40 held-out](../../03-script-voice/runs/F4-target-20260729/probes/f4-target-step40/audio/heldout.wav), [step 30 critical](../../03-script-voice/runs/F4-target-20260729/probes/f4-target-step30/audio/critical.wav), [step 30 held-out](../../03-script-voice/runs/F4-target-20260729/probes/f4-target-step30/audio/heldout.wav)에 보존했습니다. 세 핵심어가 두 ASR의 전문·token gate를 모두 통과하기 전에는 04단계로 승격하지 않습니다.

## F4 stage-2 최종 실험

[stage-2 보고서](../../03-script-voice/voice-clone/training/F4-stage2-20260729/STAGE2_REPORT.md)는 target step 40 LoRA를 Fish Speech 1.5 base에 CPU 병합한 stacked model의 provenance를 고정합니다. base와 203개 tensor key shape가 모두 일치하고 145개 tensor가 변경됐습니다. 그 위에 fresh r4·alpha 8·dropout 0.01 adapter를 LR `1e-5`로 학습했습니다.

[stage-2 dataset manifest](../../03-script-voice/voice-clone/training/F4-stage2-20260729/fish-dataset-v2/dataset_manifest.json)는 target 10 unique 문장×2와 일반화용 dual-exact salvage 10문장×1, 총 30클립·113.21초를 기록합니다. validation 2문장은 training·augmentation·prompt에서 격리했습니다.

smoke 2/2는 통과했지만 전체 학습은 75°C가 관측돼 74°C hard stop으로 종료했고 재개하지 않았습니다. step 5와 10이 저장됐으며 원래 허용 후보 10·15·20 중 step 10만 존재했습니다. step 10 validation은 loss 8.375, top-5 0.36328125입니다.

GPU가 52°C 이하일 때 step 10을 한 번만 probe했습니다. 예상 critical에는 `교권보호국은 제주에서 제조한 텀블러를 봤습니다.`가 포함되지만 primary와 turbo 모두 `교권보호국은 제주에서 제조한 텀블러를 받습니다.`로 전사했습니다. 양쪽 ASR에서 held-out 전문과 다른 critical token은 통과했으나 `봤습니다=false`여서 critical 전문·all-token gate를 실패했습니다. [최종 판정](../../03-script-voice/runs/F4-stage2-20260729/stage2-checkpoint-comparison.json)은 `REJECT_NO_STAGE2_CANDIDATE_QUALIFIED`입니다. step 10 병합본은 candidate-only이며 Production·렌더·업로드에 연결하지 않았습니다.

다음: [04 영상 자산](04-visual-assets.md)

## 2026-08-01 Qwen F4 억양 후보 선택

현재 Production 음색은 학습 LoRA가 아니라 고정된 `Qwen/Qwen3-TTS-12Hz-0.6B-Base` BF16과 사용자 소유 F4 prompt bank입니다. 외부 남성 레퍼런스에서는 음색을 학습하지 않고 발화속도, 쉼 분포, 상대 피치 범위, 종결 억양, 에너지 범위, 활성 음성 비율만 집계합니다.

제주 프로젝트는 각 대본 구간을 사용자 F4 prompt로 두 번 생성하고 기존 dual-ASR·핵심어·신호 게이트를 모두 통과한 후보끼리만 [남성 억양 프로필](../../03-script-voice/reference-audio/instagram/hyepang_pick/prosody-bank/profile.json)과 비교합니다. 가장 낮은 거리 후보가 선택되며 제3자 오디오는 Qwen 입력으로 사용되지 않습니다. 프로필 검증과 생성 후보 선택 회귀 테스트가 추가됐습니다.

## 2026-07-29 private model A/B pilot

[Pilot report](../../03-script-voice/voice-clone/pilots/model-ab-20260729/REPORT.md) records a bounded Qwen3-TTS 12Hz 0.6B Base vs GPT-SoVITS V2 run using the F4 reference and fixed critical/held-out text. Both outputs completed under the GPU gate but failed the dual-ASR strict gate; CAMPPlus similarities and hashes are in [pilot-manifest.json](../../03-script-voice/voice-clone/pilots/model-ab-20260729/pilot-manifest.json). No model was promoted and no production/render/upload path changed.

The follow-up S1 few-shot candidate is documented in [evaluation.json](../../03-script-voice/voice-clone/pilots/model-ab-20260729/gpt-v2-finetune/evaluation.json): 25 admitted sentence clips, isolated validation/probes, batch-1 fp16 smoke + bounded run, ASR strict improvement **FAIL**, CAMPPlus improvement only. SoVITS S2 was outside the verified 8 GB-safe scope.
