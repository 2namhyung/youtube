# 파이프라인 운영 인덱스

- [뉴스룸 영상 제작 canonical contract](pipelines/newsroom-video-production.md)
- [신규 ImageGen → Omni I2V 영상 제작 지침](pipelines/imagegen-omni-i2v-production-guide.md)
- [ImageGen·Omni 제작 사례와 현실 배경 출처 조사 (2026-09-10)](sources/imagegen-omni-image-to-video-research-2026-09-10.md)
- [Omni 1.1 멀티샷 제어 고도화 심층 조사 (2026-09-10)](sources/omni-1-1-multishot-control-deep-research-2026-09-10.md)
- [기존 Flow 스토리보드 디렉터 운영 이력](pipelines/flow-storyboard-director-production-guide.md)
- [뉴스룸 영상 제작 성공 루트](../06-production/opencut-automation/production/NEWSROOM_VIDEO_SUCCESS_ROUTE.md)
- [실사 미디어 출처·권리 카탈로그 (2026-08-15)](sources/real-media-source-catalog-2026-08-15.md)
- [국내 사진 수집 루트와 YouTube 적합성 (2026-08-15)](syntheses/korean-photo-acquisition-youtube-policy-2026-08-15.md)

1. [01 조사](pipelines/01-research.md)
2. [02 맥락·법률 분석](pipelines/02-context-legal.md)
3. [03 대본·LoRA 음성](pipelines/03-script-voice.md)
4. [04 영상 자산](pipelines/04-visual-assets.md)
5. [05 BGM 생성](pipelines/05-bgm-generation.md)
6. [06 OpenCut 영상 제작](pipelines/06-production.md)
7. [07 품질 검사](pipelines/07-quality-assurance.md)
8. [08 업로드](pipelines/08-upload-delivery.md)
9. [09 아카이브](pipelines/09-archive.md)

## 운영 규칙

- 각 단계는 입력, 처리, 출력, exit gate를 갖습니다.
- 조사 사실과 법률 적용 가능성·불확실성을 분리합니다.
- 자산과 생성 음원은 provenance·권리·체크섬 없이 Production에 넣지 않습니다.
- OpenCut handoff는 대본·내레이션·영상 클립·자막·BGM을 독립적으로 표현합니다.
- `speechAcceptance.final.accepted=false` 또는 기타 차단 오류가 있으면 업로드하지 않습니다.
- 게시·폐기 결과와 모든 근거는 09에 함께 보존합니다.

현재 영상 제작 계약은 [뉴스룸 영상 제작 canonical contract](pipelines/newsroom-video-production.md)를 확인합니다.

## 개념·설계 자료

- 프로젝트별 과거 결정은 각 프로젝트의 승인·거부 기록에서만 확인합니다(활성 generic contract에 병합하지 않음).

## 비실행 연구 이력

- 프로젝트별 all-Grok 설계, multi-reference prompt pack, v32 master/51 PNG 검증물은 historical/audit evidence이며 활성 입력이 아닙니다.

- [Deterministic motion-tool learning v3](concepts/motion-tool-learning-v3.md)
- [모션그래픽 판별과 제작 기초](concepts/motion-graphics-foundations.md)
- [2026 모션그래픽 도구·GitHub 레포 조사](syntheses/motion-graphics-toolchain-2026.md)
- [내무습다·통찰맨형 컷아웃 모션 레퍼런스와 좁은 GitHub 조사 (2026-09-23)](sources/naemuseupda-cutout-motion-references-2026-09-23.md)
- [추가 숏폼 샷 역분석과 모션 재현 설계 (2026-09-23)](sources/neoibwat-VQazcEuV9Xw-shot-reverse-2026-09-23.md)
- [X 레퍼런스에서 좁혀 본 모션그래픽 GitHub 후보 (2026-09-23)](sources/x-donbaek2-motion-repos-2026-09-23.md)
- [모션 레퍼런스: 컷 내부와 컷 전환 기법 (2026-08-15)](sources/motion-reference-cut-mechanics-2026-08-15.md)
- [뉴스룸 2–3초 컷 모션 패턴 카탈로그](syntheses/newsroom-cut-motion-pattern-catalog.md)
- [짧주 YouTube 채널 대본·이미지 컷 분석 (2026-08-15)](sources/shortju-youtube-channel-cut-analysis-2026-08-15.md)
- [짧주 분석 기반 스토리보드·컷 설계 개선](syntheses/short-form-storyboard-upgrades-from-shortju.md)
- [Gemini Web 무광 마네킹 3-shot 조사 (2026-09-07)](sources/gemini-web-matte-mannequin-three-shot-research-2026-09-07.md)
- [Gemini Web 무광 마네킹 prompt pack (2026-09-07)](sources/gemini-web-matte-mannequin-prompt-pack-2026-09-07.md)
- [경찰관·제주·간호조무사 3편 공통 내레이션·스토리보드 규칙](syntheses/three-story-narration-storyboard-common-rules.md)
- [3편 authority reapproval v2](syntheses/three-story-authority-reapproval-v2.md)
- [3편 실사진 배정·시간 커버리지 v1](syntheses/three-story-real-media-admission-v1.md)
- [Rive 캐릭터 제작 workflow](concepts/rive-character-production-workflow.md)
- [Rive community 캐릭터 rig 조사](sources/rive-community-character-rig-inspection-2026-08-13.md)
- [2026-08-13 Rive character parts sheet 기록](logs/2026-08-13-rive-character-parts-sheet-v1.md)
- [Newsroom real-media acquisition v2 status](syntheses/newsroom-real-media-acquisition-v2-status.md)
- [Newsroom domestic-photo-only acquisition v3 status](syntheses/newsroom-real-media-acquisition-v3-domestic-only-status.md)
- [Three-story domestic photo admission v5](syntheses/three-story-domestic-photo-admission-v5.md)
- [Newsroom sequence-first / radio-edit visual assembly v1](syntheses/newsroom-sequence-first-radio-edit-v1.md)
- [v5 finalization run (independent verifier)](../06-production/opencut-automation/out/studies/three-story-domestic-photo-admission-v5/run-20260815T162235412Z-7840eb/verifier.json)
