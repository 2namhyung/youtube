# 원문 근거와 코드 검토 기록

확인일: 2026-09-16. 실제 파일 정적 검토와 공식 문서 확인을 구분한다. 원본 저장소 설치·빌드·유료 API 호출은 검증하지 않았다. 참조한 저장소 파일은 실행 명령이 아니라 검토 자료로만 취급했다.

## 기준 스냅샷

- reaink/script2video: `63ea5ddeba233e35efaadaf0d36c81d8788eabd2`
- doziben/showrunner: `1fdd1b2385f128abdd69d161156baabd597f8e25`
- techdou/remotion-video: `0bba2351bf8c5a1b3cc79ef67e9a3131fec2749e`
- 나머지 main 파일은 조회 시점 파일이다. 일부 blob SHA만 기록하고 변경 가능한 링크라는 점을 명시한다.

## S1 — 메인 포크 라이선스와 패키지

[Script2video LICENSE](https://github.com/reaink/script2video/blob/63ea5ddeba233e35efaadaf0d36c81d8788eabd2/LICENSE)

[package.json](https://github.com/reaink/script2video/blob/63ea5ddeba233e35efaadaf0d36c81d8788eabd2/package.json)

MIT 고지와 저작권 고지 보존 조건을 실제 파일에서 확인. package는 Next 16.2.4, React 19.2.4, Zustand를 사용한다. scripts는 dev/build/start/lint이며 test script는 없다. 이는 별도 테스트 파일이 전혀 없다는 전수 보증은 아니다. 현재 앱 구축에 쓸 버전은 취약점·호환성 검토 후 결정한다.

## S2 — 스토리보드 생성 라우트와 검증

[app/api/chat/route.ts](https://github.com/reaink/script2video/blob/63ea5ddeba233e35efaadaf0d36c81d8788eabd2/app/api/chat/route.ts)

[lib/prompts/storyboard.ts](https://github.com/reaink/script2video/blob/63ea5ddeba233e35efaadaf0d36c81d8788eabd2/lib/prompts/storyboard.ts)

생성 후 best-effort review 호출이 이미 있다. 검토 오류는 삼키고 첫 응답을 사용할 수 있다. parseStoryboard는 JSON.parse 결과를 Storyboard로 cast한다. Gemini에는 응답 스키마·참고 이미지가 전달되지만 해당 저장소의 OpenAI/Anthropic 분기는 텍스트 대화만 구성한다. 제공자의 원래 이미지 지원 능력과는 다른 구현 제약이다. 생성 길이는 영상 제공자 허용 값과 연결되어 있다. 프롬프트의 얼굴/B-roll 교대, in-scene 화면 규칙을 혼합 미디어 편집 규칙으로 그대로 이식하지 않는다.

## S3 — 브라우저 출력

[lib/client/exportVideo.ts](https://github.com/reaink/script2video/blob/63ea5ddeba233e35efaadaf0d36c81d8788eabd2/lib/client/exportVideo.ts)

Canvas captureStream(30), MediaRecorder, video element 재생, requestAnimationFrame 기반이다. MP4 지원 탐지 후 WebM fallback이 있다. 문장별 자막은 장면 길이를 균등 분할한다. 실제 코드에는 AudioContext와 decodeAudioData가 존재하므로 상단의 오래된 ‘오디오 미보존’ 설명만 인용하면 부정확하다.

## S4 — 브라우저 저장

[lib/db/idb.ts](https://github.com/reaink/script2video/blob/63ea5ddeba233e35efaadaf0d36c81d8788eabd2/lib/db/idb.ts)

sessions/videos를 IndexedDB에 저장. 새 도구의 원장·리비전·작업 기록은 별도 영구 저장소로 설계한다.

## S5 — 키 세션

[lib/server/session.ts](https://github.com/reaink/script2video/blob/63ea5ddeba233e35efaadaf0d36c81d8788eabd2/lib/server/session.ts)

API 키는 AES-256-GCM 암호화 데이터로 httpOnly cookie에 저장된다. plaintext 저장이라고 기술하지 않는다. requireSession은 키 세션을 확인하며 사용자·프로젝트 테넌트 인증 체계가 아니다.

## S6 — Showrunner 비용 계산

[src/lib/helpers/cost.ts](https://github.com/doziben/showrunner/blob/1fdd1b2385f128abdd69d161156baabd597f8e25/src/lib/helpers/cost.ts)

음성·이미지·lipsync 비용 계산이 실제 존재한다. 코드 주석의 단가를 현재 제공자 가격으로 인증하지 않는다.

## S7 — Showrunner의 적용 범위

[prompts.ts](https://github.com/doziben/showrunner/blob/1fdd1b2385f128abdd69d161156baabd597f8e25/src/lib/pipeline/prompts.ts)

[export.ts](https://github.com/doziben/showrunner/blob/1fdd1b2385f128abdd69d161156baabd597f8e25/src/lib/pipeline/export.ts)

[server/storyboard.ts](https://github.com/doziben/showrunner/blob/1fdd1b2385f128abdd69d161156baabd597f8e25/src/lib/server/storyboard.ts)

UGC용 avatar/broll 중심. B-roll에는 촬영 지시와 .md 산출물이 있다. ‘B-roll 지시 생성’을 ‘실제 라이선스 확인된 스톡 자동 확보’로 해석하지 않는다. enum 검증에 Zod를 사용하는 검색 결과를 확인했다. export/서버 스키마 전체 실행 경로는 테스트하지 않았다.

## S8 — techdou의 상태 관리

[run-queue.ts](https://github.com/techdou/remotion-video/blob/0bba2351bf8c5a1b3cc79ef67e9a3131fec2749e/server/core/run-queue.ts)

[storage.ts](https://github.com/techdou/remotion-video/blob/0bba2351bf8c5a1b3cc79ef67e9a3131fec2749e/server/core/storage.ts)

작업 큐 파일 전체를 읽었고 리비전 관련 저장 코드 검색 결과를 확인했다. lease, heartbeat, stale job 회수, AbortController 취소 구조가 있다. 취소 이후 응답이 상태를 덮는지, 동시 실행 수가 제한되는지는 호출 스택·저장 조건을 포함한 통합 검증이 필요하다. 개별 파일만으로 보안 취약점이나 운영 안정성을 확정하지 않는다. README가 언급하는 테스트를 이번에 실행하지 않았다.

## S9 — 원문 잠금 참고, 시각 규칙은 제외

[README](https://github.com/jackterror/script-to-video-production-agent/blob/main/README.md)

[scene-schema.md](https://github.com/jackterror/script-to-video-production-agent/blob/main/references/scene-schema.md)

[review.py](https://github.com/jackterror/script-to-video-production-agent/blob/main/src/script_to_video_production_agent/review.py)

review.py 조회 blob SHA: `76ac1125ad8f14d6b5979d99482390490d66cf7c`.

해시 기반 narration 보존, 승인/거절/수정 요청 개념이 유용하다. 그러나 실제 review.py에는 motion graphic, animation, icons, text, subtitle 등을 금지하는 정규식이 있다. 일반적인 혼합 미디어 Director로 채택하지 않는다. README는 MIT 선언이며 paid generation 자체 수행이나 InVideo API 통합 완료를 주장하지 않는다.

## S10 — Code2MP4

[README](https://github.com/code2mp4/code2mp4/blob/main/README.md)

[storyboard-schema.md](https://github.com/code2mp4/code2mp4/blob/main/docs/storyboard-schema.md)

스토리보드 스키마 조회 blob SHA: `ae4d1a38f81cc3a959f6b2ce9b90b1c1c8e6e043`.

HTML/CSS/GSAP 소스와 HyperFrames 렌더 분리, 모션 시스템을 참고한다. 문서의 scene maxItems 12, 훅·CTA 제약은 짧은 홍보 콘텐츠 전제다. 정적 문서 확인이며 전체 파이프라인을 실행한 것은 아니다. README 라이선스 선언은 Apache-2.0.

## S11 — OpenDrama Studio

[Sunnylincc/StoryboardAI README](https://github.com/Sunnylincc/StoryboardAI/blob/main/README.md)

현재 README 제목은 OpenDrama Studio다. React/Vite, FastAPI, SQLite, Redis/RQ, FFmpeg 구조가 선언되어 있다. 초기 개인 도구에는 드라마 생성 기능과 운영 구성이 과하다. README만 확인했다. 선언 라이선스는 Apache-2.0.

## S12 — 기존 Shot 모델

[lib/types.ts](https://github.com/reaink/script2video/blob/63ea5ddeba233e35efaadaf0d36c81d8788eabd2/lib/types.ts)

index/durationSec/summary/veoPrompt/dialogue/camera/composition 등을 중심으로 한다. 새 도구의 Layer, AssetRequirement, Claim/Evidence, stable ID와 revision은 별도 설계가 필요하다.

## S13 — 코딩 에이전트/프롬프트 팩과 실제 앱의 구분

[techdou README](https://github.com/techdou/remotion-video/blob/0bba2351bf8c5a1b3cc79ef67e9a3131fec2749e/README.md)

[jackterror README](https://github.com/jackterror/script-to-video-production-agent/blob/main/README.md)

SKILL.md, Markdown 지시, 코드 생성 워크플로, 실행 가능한 UI·API 통합은 다른 계층이다. 각각의 존재를 구분해서 재사용 여부를 판단했다.

## S14 — Remotion 엔진 라이선스

[Remotion LICENSE.md](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)

조회 blob SHA: `d655e2df830bbe19285e55607aefff636ed93d7b`.

MIT가 아닌 자체 무료/기업 사용 조건이다. 개인·작은 조직의 무료 사용 가능성과 회사 라이선스 대상, 파생 엔진 재판매 제한을 읽었다. 확정된 서비스 사업모델에 대한 법률 의견이 아니다. 적용할 엔진 릴리스의 실제 라이선스를 다시 확인해야 한다.

## S15 — 시행 전 문서 주의

[Remotion Terms](https://www.remotion.dev/docs/terms)

2026-09-16 조회 화면에서 v5 문서는 Upcoming으로 표시되고 v5 출시 시 적용한다고 적혀 있다. 보이는 최신 버전 번호만으로 시행 중 약관이라고 단정하지 않는다.

## S16 — GitHub 포크 권한과 공개 범위

[GitHub Forks](https://docs.github.com/en/pull-requests/reference/forks)

공개 저장소는 개인 계정 또는 저장소 생성 권한이 있는 조직에 fork할 수 있다. 공개 포크의 공개 범위는 원본 네트워크에 연결된다. 소스 이용 허용과 GitHub 저장소 가시성 정책은 별개의 문제다.

## S17 — Pexels API

[API documentation](https://www.pexels.com/api/documentation/)

조회 시점 동영상 경로는 `/v1/videos/`로 안내하며 구 경로의 향후 폐기를 예고한다. 호출 제한과 Pexels/기여자 표시를 안내한다. 검색 UI에 필요한 실제 반환 ID·미디어 메타데이터를 사용하고 URL을 모델이 만들어내도록 하지 않는다.

## S18 — Pexels API·대량 수집 조건

[What are the Terms and Conditions?](https://help.pexels.com/hc/en-us/articles/900005880463-What-are-the-Terms-and-Conditions)

공식 안내 갱신 표시: 2026-09-14. 대규모·체계적 복제, 경쟁 서비스 구성, API를 통한 대규모 ML/AI용 수집·평가·개발 등을 허가 없이 수행하지 말 것을 명시한다. 개별 자산 분석 기능의 모든 형태가 허용된다고 추론하지 않는다.

## S19 — 제3자 권리

[Pexels Terms](https://www.pexels.com/terms-of-service/)

콘텐츠 라이선스와 별개로 인물·상표 등 제3자 권리를 확인해야 하는 경우를 고려한다. 앱의 ‘이용 조건 검토됨’ 상태는 실제 권리 검토 기록이지 법적 보증이 아니다.

## S20 — Remotion 미리보기·렌더 API

[Player](https://www.remotion.dev/docs/player)

[Renderer](https://www.remotion.dev/docs/renderer)

별도 어댑터의 근거. 이 기능을 이 패키지에서 구현·실행한 것은 아니다. 실제 의존성 버전을 고정하고 엔진 사용 조건 확인 뒤 연결한다.

## S21 — OpenTimelineIO의 역할

[공식 README](https://github.com/AcademySoftwareFoundation/OpenTimelineIO)

[공식 개요](https://github.com/AcademySoftwareFoundation/OpenTimelineIO/blob/main/docs/index.rst)

편집 타이밍과 미디어 참조를 표현하는 계층으로 검토했다. 임의 React/HTML 모션 코드를 타 편집기로 호환 변환하는 엔진이 아니다. 어댑터와 편집기별 호환성을 별도 테스트해야 한다. 오래된 버전의 기능 표를 현재 호환성 보증으로 인용하지 않았다.
