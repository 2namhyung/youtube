# 04 영상 자산

## 현재 뉴스룸 영상 자산 계약 (2026-08-15)

신규 영상 자산 권위는 `paper-cut-grok-storyboard-v2`다. semantic cut plan이 먼저 봉인된 뒤 컷별 grayscale rough 하나와 고유 recurring character master 0–3개로 컬러 스토리보드 하나를 만들고 `newsroom-color-storyboard-admission-v2`에 exact bytes/hash와 provenance를 기록한다. board는 `assets/storyboards`, rough는 `assets/roughs`, master는 `assets/masters`에 contained physical nonsymlink 파일로 존재해야 한다. Grok reference는 승인 color board 정확히 한 장뿐이다. 아래 제주 자산과 motion-tool 내용은 프로젝트/history이며 현재 generic provider input authority가 아니다. Source: [canonical contract](newsroom-video-production.md).

- 상태: 부분 운영 (82%)
- 입력: final 대본과 장면 요구
- 처리: AI 이미지 생성 또는 재사용 허가 영상 탐색 → 권리 검토 → 구간 추출·크롭·무음 → 체크섬
- 출력: 장면 자산, provenance, rights restrictions
- 게이트: 출처·생성 방식·라이선스·확인 시각·구간·체크섬

제주 사건은 [project assets](../../06-production/opencut-automation/production/projects/school-case-production/assets)의 AI 재연 이미지와 KCTV 클립을 사용합니다. [검증 결과](../../04-visual-assets/runs/jeju-school-intrusion-20260727T204000+0900.assets.json)는 AI 재연 이미지 12종의 생성 고지·checksum과 KCTV 승인 클립 4개의 3초 구간·무음·checksum·권리 기록을 통과시켰습니다. [project.json](../../06-production/opencut-automation/production/projects/school-case-production/project.json)의 `media`가 원본과 변환 조건을 고정합니다. YouTube CC 표시는 제3자 초상·개인정보 등 모든 권리를 자동 보증하지 않으므로 공개 전 사람 검토는 남습니다.

다음: [05 BGM 생성](05-bgm-generation.md)

## 2026-08-12 모션그래픽 학습·도구 기준

- 레퍼런스 판별 전에 [모션그래픽 판별과 제작 기초](../concepts/motion-graphics-foundations.md)를 적용합니다. 원본 영상, 단순 컷 편집, 카메라 이동, 정지 그래픽을 모션그래픽으로 세지 않습니다.
- 도구 선정과 GitHub 조사 결과는 [2026 모션그래픽 도구·GitHub 레포 조사](../syntheses/motion-graphics-toolchain-2026.md)에 기록했습니다.
- 현재 권장 조합은 `Remotion + SVG/D3 + FFmpeg/ffprobe`이며, HyperFrames는 같은 3개 장면의 비교 PoC 전에는 production renderer로 승격하지 않습니다.
- 지도는 위치·관할·이동이 주장 이해에 필수일 때만 사용합니다. 세 사건 공통 기본 모듈은 관계망, 증거 상태, 문서 강조, 시간축입니다.
