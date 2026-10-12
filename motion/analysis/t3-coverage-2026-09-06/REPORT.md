# T3 global 1.8x source coverage

> **Superseded as a production blocker, 2026-09-06:** 아래 계산은 기존 renderer의 global source clock을 그대로 유지할 경우에만 적용된다. 사용자 교정에 따라 현재 실행은 각 10초 take에서 컷별 source window를 선택하고 1.80×로 압축하며 전환 보행 위상을 검증하는 방식이다. 각 도시의 소비 길이는 전환 겹침 포함 nominal 6.3/5.4/4.5/3.6초로 10초 안에 들어간다. 긴 영상 연장은 필수가 아니다. 길이 충족과 실제 보행 일치는 별도 검사한다. Source: [현재 로드맵 v0.5](../../../23jung/wiki/syntheses/taoagou-ticket-journey-flow-imagegen-pipeline-v0.1.md), 현재 대화 사용자 교정.

조사일: 2026-09-06

목적: 사용자가 T1에서 선택한 `1.80x`를 현재 13초 v2 렌더러의 전역 카드 시계에 적용할 때 도시별 source window와 0.5초 전환 겹침을 계산한다. 진단만 수행했으며 media, renderer, Flow project, production manifest는 수정하지 않았다.

## 결론

현재 10초 outfit source를 그대로 두면 global `1.80x` mapping은 Tokyo부터 source 끝을 넘고, Shanghai와 Hanoi는 더 크게 부족하다. `1.80x`는 **현재 Tokyo source에서 사용자가 고른 T1 결과**로만 기록할 수 있으며, 모든 의상이나 레퍼런스의 측정 계수로 승격할 수 없다. T2는 새 source가 실패할 때만 조건부로 재개한다.

v1/v2 renderer는 `master_index = round((t - 3.5) * 24)`를 사용한다. v2는 이 renderer를 상속하므로 도시 경계에서 source frame 0으로 reset하지 않고 같은 card-clock phase를 샘플한다. 전역 phase를 `g = output_time - 3.5s`, source time을 `1.8 * g`로 계산했다. 아래 endpoint는 24fps frame rounding을 반영하지 않은 **nominal continuous-time endpoints**이며, 실제 frame request는 renderer의 `round` 결과로 한 프레임 안팎 달라질 수 있다. Source: [v1 renderer](../../production/ticket-travel/final-sequence-v1/render_final_sequence.py), [v2 renderer](../../production/ticket-travel/final-sequence-v2/render_final_sequence.py).

## Exact coverage

전환 중 새 도시 source는 시작 0.5초 동안 들어오고, 다음 도시 전환 중 이전 도시 source는 끝 0.5초 동안 다시 사용된다. 따라서 첫 Seoul은 `g=0.0–3.5` (첫 진입+본 구간+Tokyo 전환 overlap), Tokyo는 `3.0–6.0`, Shanghai는 `5.5–8.0`, Hanoi는 `7.5–9.5`가 필요하다. Hanoi 뒤에는 다음 전환이 없어 마지막 0.5초를 추가하지 않았다.

| 도시 / 실제 v2 local source | output branch | global phase incl. 0.5s overlap | required source window @1.80x | source available | 판정 |
|---|---:|---:|---:|---:|---|
| Seoul — [`canonical-hanbok-10s.mp4`](../../production/ticket-travel/performance-v2/canonical-hanbok-10s.mp4) | 3.0s | `0.0–3.5s` | `0.0–6.3s` | 10.0s / 240 frames | PASS, 3.7s headroom |
| Tokyo — [`tokyo-parasol-10s.mp4`](../../production/ticket-travel/performance-v2/tokyo-parasol-10s.mp4) | 2.5s | `3.0–6.0s` | `5.4–10.8s` | 10.0s / 240 frames | FAIL, 0.8s short |
| Shanghai — [`shanghai-fan-10s.mp4`](../../production/ticket-travel/performance-v2/shanghai-fan-10s.mp4) | 2.0s | `5.5–8.0s` | `9.9–14.4s` | 10.0s / 240 frames | FAIL, 4.4s short |
| Hanoi — [`hanoi-hat-green-10s.mp4`](../../production/ticket-travel/performance-v2/hanoi-hat-green-10s.mp4) | 2.0s | `7.5–9.5s` | `13.5–17.1s` | 10.0s / 240 frames | FAIL, 7.1s short |

The card section is 9.5s, so its terminal global source time is `9.5 × 1.8 = 17.1s`. This is not a claim that every clip needs 17.1s: the endpoint differs by city because branch windows differ. The 4.0s intro source is sufficient for the 3.5s intro plus its first 0.5s transition.

Metadata evidence: all four outfit inputs probe at 720×1280, 24fps, 240 frames / 10.0s; `intro-casual.mp4` probes at 96 frames / 4.0s. Source file identity and probe metadata are recorded in the linked production READMEs and the T1 metadata; no manually transcribed hash is required for this coverage arithmetic.

## Feasible next operation

- Keep `1.80x` scoped to the current Tokyo T1 source and its 2.0s probe. Do not apply it to all outfits or call it reference-measured.
- Under this unchanged global map, fresh continuous source coverage must reach at least 10.8s for Tokyo, 14.4s for Shanghai, and 17.1s for Hanoi. Preserve uninterrupted walk, direction, apparent scale, and phase anchor; looping, freeze/padding, silent stretch, or city-boundary reset would not satisfy T3.
- If no longer sources can be obtained, the highest common factor fitting all current 10s clips is `10 / 9.5 ≈ 1.05x` (Hanoi-limited). At `1.80x`, source acquisition is the minimal blocker; a lower factor or timeline redesign requires a new user decision.
- The coordinating UI check observed the selected Flow project's `연장(Veo 3.1 - Lite)` menu disabled for the 10s history source; no extension or generation was submitted. Safest next Flow operation is a read-only capability confirmation or a longer-source submission path using the existing source/identity, not a blind extension click. This does not establish that Flow universally lacks extension.

## Evidence and limits

- [v1 timeline/source checks](../../production/ticket-travel/final-sequence-v1/README.md) specify 13.000s/312 frames, 0.5s transitions, and no loop/stretch/retime. [v2 README](../../production/ticket-travel/final-sequence-v2/README.md) specifies the green Hanoi source and inherited timing/renderer.
- [performance-v2 README](../../production/ticket-travel/performance-v2/README.md) and [10-second prompts](../../production/ticket-travel/performance-v2/long-variant-prompts.md) identify these as independent 10s outfit edits, not proven extensions of one another.
- This is source-availability arithmetic, not proof that a longer Flow take preserves exact joint-level foot contacts. Existing phase review is broad/qualitative; exact gait correspondence remains unmeasured.
