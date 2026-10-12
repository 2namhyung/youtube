# 2026 모션그래픽 도구·GitHub 레포 조사

## 결론

현재 파이프라인의 주 제작 도구는 다음 조합이 가장 적합하다.

> **Penpot 또는 코드 스케치로 styleframe → Remotion 4 렌더 코어 → SVG/D3 정보 그래픽 → 선택적 Lottie/R3F → FFmpeg·ffprobe 출력/QC**

Remotion을 고른 이유는 “자동으로 멋진 영상을 만들어서”가 아니다. 프레임 단위 상태를 React 코드로 재현하고, 현재 Node/Windows·내레이션 cue·증거 manifest·FFmpeg 검증과 가장 적은 경계로 결합할 수 있기 때문이다. 디자인 품질은 styleframe, 컴포넌트, motion token, 애니매틱 승인에서 만들어야 한다.

## 선정 기준

- 2026년 현재 공식 저장소의 활동성과 공개 문서
- Windows·Node 기반 현재 제작 환경과의 통합 비용
- 프레임 주소 지정, deterministic render, 음성 cue 동기화
- 9:16 세로 화면, 한글 타이포그래피, SVG·문서·도표 표현
- 라이선스와 개인 사용 가능성
- 기존 evidence lineage·asset hash·QA 계약을 보존할 수 있는가

GitHub 수치와 release 상태는 2026-08-12 조회 스냅샷이며 변동될 수 있다. GitHub의 자동 라이선스 표기가 `NOASSERTION`인 경우 공식 라이선스 문서를 우선했다.

## 레포 비교

| 레포 | 역할·강점 | 라이선스·활동 스냅샷 | 판단 |
|---|---|---|---|
| [Remotion](https://github.com/remotion-dev/remotion) | React 컴포지션, 프레임 기반 애니메이션, captions·Lottie·Three·paths·shapes·transitions 생태계 | 개인과 직원 3명 이하 영리 조직은 무료. v4.0.508, 약 56.1k stars, 2026-08-12 push. [라이선스](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md) | **주 렌더러 채택** |
| [HyperFrames](https://github.com/heygen-com/hyperframes) | HTML/CSS, seek 가능한 GSAP/Lottie/Three 타임라인, CLI·headless Chrome·FFmpeg | Apache-2.0. v0.7.107, 약 40.7k stars, 2026-08-12 push | **비교 PoC**. 새 도구라 운영 성숙도 검증 후 판단 |
| [Motion Canvas](https://github.com/motion-canvas/motion-canvas) | TypeScript generator, 실시간 편집기, time event, 정밀 설명 애니메이션 | MIT. v3.17.2, 약 18.9k stars, 2026-07-02 push | 복잡한 특수 도식 후보. 두 번째 전체 렌더러로는 보류 |
| [Revideo](https://github.com/redotvideo/revideo) | Motion Canvas fork, API·동적 입력·병렬 렌더 지향 | MIT. 약 4.0k stars, 2026-07-15 push, tagged release 없음 | 영상 API 서비스가 필요할 때 재평가 |
| [D3](https://github.com/d3/d3) | SVG·Canvas·HTML 기반 데이터·관계·시간 그래픽 | ISC. 약 113k stars. [라이선스](https://github.com/d3/d3/blob/main/LICENSE) | **그래픽 생성 라이브러리 채택**. 렌더러는 아님 |
| [Lottie-web](https://github.com/airbnb/lottie-web) | Bodymovin JSON을 SVG·Canvas·HTML로 재생 | MIT. 약 32.0k stars, 2025-09-01 push | 검증된 아이콘·미세 애니메이션만 사용. 개별 asset 권리 별도 |
| [React Three Fiber](https://github.com/pmndrs/react-three-fiber) | React 방식 Three.js 3D 레이어 | MIT. v9.7.0, 약 31.7k stars, 2026-08-11 push | 추상 3D 도식에만 선택 사용. 사건 재연 기본값 아님 |
| [Theatre.js](https://github.com/theatre-js/theatre) | HTML·SVG·Three의 시각적 키프레임 편집 | core Apache-2.0. 공개 repo push 2024-08-14, 1.0 개발 공개성 불확실 | 제작 코어 보류 |
| [Manim](https://github.com/ManimCommunity/manim) | 수학·기하·정밀 설명 애니메이션 | MIT. v0.21.0, 약 40.1k stars, 2026-08-11 push | 수학·특수 도식 worker만 |
| [Blender](https://github.com/blender/blender) | 3D·Grease Pencil·Python/CLI 렌더 | GPL. 약 19.7k stars, 2026-08-12 push | 무거운 3D가 꼭 필요한 장면만 별도 artifact로 |
| [OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO) | 편집 timeline·track·clip·metadata 교환 | Apache-2.0. 약 2.0k stars, 2026-08-07 push | NLE 교환이 필요해질 때 도입. 렌더러 아님 |
| [Penpot](https://github.com/penpot/penpot) | SVG/CSS/HTML 기반 styleframe·component·design token, self-host 가능 | MPL-2.0. 약 48.5k stars, 2026 release 지속 | 무료 styleframe·디자인 시스템 후보. 영상 렌더러 아님 |

## 주 스택의 역할 분리

### 1. 디자인 단계

- Penpot 또는 정적 HTML/SVG 보드에서 9:16 styleframe을 만든다.
- 글꼴 크기, 행간, safe area, 색, 테두리, 그림자, 간격을 token으로 고정한다.
- 한 사건에서 최소 3종의 핵심 frame을 먼저 승인한다: 관계망, 증거 상태, 문서 포렌식.
- styleframe이 승인되기 전에는 full render를 하지 않는다.

### 2. Remotion 렌더 코어

- `useCurrentFrame()`으로 현재 프레임을 읽고 `interpolate()`·`spring()`·easing으로 상태를 계산한다. 출처: [Remotion Fundamentals](https://www.remotion.dev/docs/the-fundamentals), [useCurrentFrame](https://www.remotion.dev/docs/use-current-frame), [interpolate](https://www.remotion.dev/docs/interpolate).
- 내레이션의 승인 cue와 그래픽 도착 프레임을 직접 결합한다.
- 모든 장면은 같은 frame 입력에서 같은 결과를 내도록 임의 시간·네트워크 호출을 금지한다.
- 기존 creator/verifier가 asset hash, evidence span, 프레임 수, 해상도, 오디오를 계속 검증한다.

### 3. SVG·D3 그래픽

- SVG: 텍스트, path, mask, stroke reveal, node, connector, highlight를 직접 제어한다.
- D3: 데이터 변환, scale, path, layout 계산을 맡긴다. D3 자체를 영상 렌더러로 취급하지 않는다.
- 현재 사건 공통 컴포넌트는 `RelationshipGraph`, `EvidenceState`, `DocumentHighlight`, `CaseTimeline`, `ClaimQualifier`, `KineticQuestion`으로 제한한다.

### 4. 선택적 레이어

- Lottie: 로컬에 반입되고 license·hash가 확인된 짧은 아이콘 애니메이션.
- React Three Fiber: 휴대전화 구조나 추상 공간처럼 2D로 설명하기 어려운 경우만. 실제 사건 공간·행동을 근거 없이 재현하지 않는다.
- HyperFrames: 동일한 3개 테스트 장면을 Remotion과 각각 구현해 제작 시간·타이밍 편집성·렌더 안정성을 비교한다.

### 5. 출력

- FFmpeg는 영상·내레이션·BGM·자막 mux와 인코딩을 담당한다.
- ffprobe와 기존 verifier는 프레임 수, FPS, 해상도, duration, stream을 검사한다.
- Renderer가 editorial authority가 되지 않으며, evidence·script·narration 권위는 기존 계약을 유지한다.

## HyperFrames 비교 PoC 통과 조건

다음 세 장면만 같은 1080×1920, 24fps, 동일 narration cue로 비교한다.

1. 휴대전화 사건 관계·책임망 6초
2. 간호조무사 사건 문서 강조 6초
3. 제주 사건 증거 상태 시간축 6초

평가 항목은 첫 시안 제작 시간, cue 수정 시간, easing 품질, 한글 렌더, headless 재현성, 프레임 hash 안정성, 외부 dependency 제거 가능성이다. HyperFrames가 명확히 우수할 때만 renderer adapter를 추가한다.

## 지금 도입하지 않는 것

- 여러 full renderer를 동시에 운영하지 않는다. 테스트·asset adapter·font·timing 계약이 분산된다.
- After Effects·MOGRT marketplace를 자동 파이프라인 핵심으로 두지 않는다. GUI·호스트·개별 template 권리·parameter 자동화 경계가 크다.
- Blender·Three.js의 사실적인 재연을 품질 향상으로 착각하지 않는다. 확인되지 않은 행동·공간을 사실처럼 보이게 할 위험이 있다.
- GitHub stars를 디자인 품질의 증거로 사용하지 않는다. 활동성·생태계 참고값일 뿐이다.

## 다음 구현 순서

1. 세 사건 공통 styleframe 3종과 motion token을 먼저 만든다.
2. Remotion으로 18초짜리 component reel을 제작한다.
3. 동일 장면을 HyperFrames로 비교 PoC 한다.
4. 사용자가 두 결과를 보고 renderer를 확정한다.
5. 확정된 컴포넌트만 기존 design-first planner의 허용 vocabulary로 승격한다.

## 관련 자료

- [모션그래픽 판별과 제작 기초](../concepts/motion-graphics-foundations.md)
- [Remotion 공식 리소스·예제](https://github.com/remotion-dev/remotion/blob/main/packages/docs/docs/resources.mdx)
- [HyperFrames 소개](https://hyperframes.heygen.com/introduction)
- [Motion Canvas Rendering](https://motioncanvas.io/docs/rendering/)
- [OpenTimelineIO 포맷](https://opentimelineio.readthedocs.io/en/v0.15/tutorials/otio-file-format-specification.html)

## 2026-09-23 — 내무습다 레퍼런스에 필요한 좁은 적용 범위

통찰맨 채널과 추가 숏폼 레퍼런스에서 확인한 사진 배경·평면 캐릭터·표정 교체·짧은 자막 강조의 적용 순서와 초기 테스트값은 [내무습다·통찰맨형 컷아웃 모션 레퍼런스](../sources/naemuseupda-cutout-motion-references-2026-09-23.md)에 기록했다. 이 addendum은 기존의 넓은 도구 비교를 대체하지 않으며, Remotion을 첫 PoC 후보로 두고 GSAP과 Motion Canvas는 필요한 컷에서만 비교한다. 구현 추가나 신규 제작 권위 승격은 이번 기록에 포함하지 않는다. Source: [focused reference](../sources/naemuseupda-cutout-motion-references-2026-09-23.md).
