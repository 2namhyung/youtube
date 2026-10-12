# Rive 캐릭터 제작 워크플로

- 상태: `researched / design-sheet-poc / production-unapproved`
- 확인일: 2026-08-13
- 목표 품질 레퍼런스: [Character rigged - using meshes + bones](https://rive.app/community/files/27389-51748-character-rigged-using-meshes-bones/) (CC BY, 2026-04-22)
- 기존 디자인 기준: [master-approved-v1.png](../../06-production/opencut-automation/production/motion-assets/generic-character-poc-v1/master-approved-v1.png), SHA-256 `4f7717edcdda6eab8abcd6314056f98176b68e360a45a585cb83b25d7e859a56`.

## 결정

- 반복 캐릭터의 관절 연기는 Rive의 bone, mesh, weight, constraint, Solo를 사용한다.
- ImageGen은 완성 영상을 만들지 않고 규격화된 캐릭터 원화와 교체 파츠를 만든다.
- 정면·측면·후면은 각각 별도 리그로 제작해 Solo 또는 Enum으로 전환한다. Source: [Rive Solos](https://rive.app/docs/editor/manipulating-shapes/solos), 확인일 2026-08-13.

## 자연형 mesh 디자인 결정

화면에 상완/전완, 허벅지/종아리 절단선을 노출하는 방식은 최종 디자인으로 사용하지 않는다. 우선 후보는 팔 하나를 어깨부터 손목까지 연속된 이미지 mesh로 만들고 shoulder/elbow/wrist bones를 함께 bind/weight하는 방식이다. 다리도 hip부터 shoe까지 하나의 연속 mesh로 만들고 hip/knee bones에 weight한다. 손과 표정만 attachment로 교체한다. 이는 Rive가 이미지에 custom mesh를 만들고 여러 bone weight를 혼합하는 공식 기능을 사용한 설계 추론이다. Source: [Rive Meshes](https://rive.app/docs/editor/manipulating-shapes/meshes), [Rive Bones](https://rive.app/docs/editor/manipulating-shapes/bones), 확인일 2026-08-13.

구현 후보와 검수 결과는 [organic mesh study](../../06-production/opencut-automation/studies/rive-character-organic-mesh-sheet-v1/README.md)에 있다. 현재 `private-review-candidate`이며 정적 디자인 승인 뒤에만 Rive artboard와 weight 작업으로 진행한다.

몸통 attachment에는 팔이나 긴 소매 실루엣을 포함하지 않는다. 목에서 허리까지의 몸판과 깨끗한 armhole만 포함하고, 좌우 팔은 각각 하나의 별도 연속 mesh attachment로 둔다. 몸통과 별도 팔을 동시에 그릴 때 한쪽에 두 팔이 보이면 기계적 해시·크기 검증 통과 여부와 무관하게 시각 QA 실패다. 2026-08-13 최초 organic torso는 양쪽 소매가 baked-in된 채 별도 팔도 렌더되어 이 규칙을 위반했고 폐기했다. 수정본은 몸통 셀만 다시 생성했으며 원본 시트는 불변으로 보존한다.
- 캐릭터 외 모션그래픽은 HyperFrames/D3, 실제 영상이 필요한 컷은 권리 확인된 외부 소스 또는 별도 제작 영상, 최종 합성은 FFmpeg가 담당한다.
- 기존 Godot 캐릭터 리그 실패물은 Rive 권위나 파츠 원본으로 재사용하지 않는다.

## Rive 제작 순서

1. 동일 캔버스와 피벗을 가진 PNG/SVG 파츠 또는 레이어 PSD를 준비한다. PSD import는 레이어 위치·순서·이름을 보존한다. Source: [Intro to meshes](https://rive.app/blog/intro-to-meshes), [Preparing illustrations](https://rive.app/blog/prepping-illustrations-before-animating-in-rive), 확인일 2026-08-13.
2. Hierarchy와 draw order를 먼저 확정한다. Child는 parent transform을 상속하며 hierarchy 상위 항목이 앞에 그려진다. Source: [Rive hierarchy](https://rive.app/docs/editor/interface-overview/hierarchy), 확인일 2026-08-13.
3. `hips -> spine -> neck -> head`, `shoulder -> upper_arm -> forearm -> hand` 본 계층을 만든다. 첫 bone만 전체 체인의 X/Y를 가지며 나머지는 parent 대비 length와 rotation을 가진다. Source: [Rive bones](https://rive.app/docs/editor/manipulating-shapes/bones), 확인일 2026-08-13.
4. 머리·손·신발처럼 휘지 않는 파츠는 bone child로 연결한다. 몸통·소매처럼 휘어야 하는 파츠만 mesh contour, interior vertices, forced edges, bone binding, weight painting을 적용한다. Weight 합은 100%이며 관절 정점은 인접한 두 bone의 영향을 섞는다. Source: [Rive meshes](https://rive.app/docs/editor/manipulating-shapes/meshes), [Intro to meshes](https://rive.app/blog/intro-to-meshes), 확인일 2026-08-13.
5. 포인팅에는 제한된 팔 IK를 사용하고 머리·눈에는 joystick/constraint를 선택적으로 사용한다. 같은 property를 여러 joystick timeline이 동시에 소유하지 않는다. Source: [IK constraint](https://rive.app/docs/editor/constraints/ik-constraint), [Joysticks](https://rive.app/docs/editor/manipulating-shapes/joysticks), 확인일 2026-08-13.
6. 손·표정·리깅된 의상은 Solo, 독립적인 큰 캐릭터/구성은 Component와 Artboard/Image data binding으로 교체한다. Source: [Rive Solos](https://rive.app/docs/editor/manipulating-shapes/solos), [Components](https://rive.app/docs/editor/fundamentals/components), [Data binding property types](https://rive.app/docs/editor/data-binding/property-types), 확인일 2026-08-13.
7. `base`, `gesture`, `face`, `skin`, `view` state-machine layer를 분리해 동작이 서로의 property를 덮어쓰지 않게 한다. Source: [State machines](https://rive.app/docs/editor/state-machine/state-machine), [Animation mixing](https://rive.app/blog/create-rich-interactions-with-animation-mixing), 확인일 2026-08-13.
8. Editor preview를 통과한 뒤에만 유료 Render Preset으로 PNG sequence/H.264/WebM을 출력하거나 `.riv` runtime export를 사용한다. 공식 Windows/Node turnkey headless video CLI는 확인되지 않았다. Source: [Video/static export](https://rive.app/docs/editor/exporting/exporting-for-video-and-static-design), [Runtime export](https://rive.app/docs/editor/exporting/exporting-for-runtime), 확인일 2026-08-13.

## ImageGen 한 페이지 파츠 시트 규격

첫 시트는 정면 Rive PoC 검토용이며 다음 요소를 한 페이지에 서로 겹치지 않게 배치한다.

- `head_base`, `hair_back`, `hair_front`
- `torso_jacket`, `pelvis`
- `upper_arm_L/R`, `forearm_L/R`
- `hand_relaxed_L/R`, `hand_open_L/R`, `hand_point_R`
- `thigh_L/R`, `shin_L/R`, `foot_L/R`
- `eyes_neutral`, `eyes_blink`, `mouth_neutral`, `mouth_concerned`

모든 파츠는 완전 정면, 동일한 4.5-head 신체 비율, 동일한 굵기의 검은 외곽선, 승인 캐릭터의 남색 외투·아이보리 셔츠·차콜 바지 팔레트를 유지한다. 관절 끝에는 몸 안쪽으로 숨길 불투명한 연장부를 포함한다. 배경·그림자·문자·로고·워터마크·원근 단축·모션 블러는 금지한다. 시트 결과는 디자인 검토 후보이며, Rive에 넣기 전에 슬롯별 분리, 알파, 피벗, visible bounds, underlap, 손가락과 좌우 방향 QA가 필요하다.

## 최소 PoC와 중단 조건

- 1080×1080 정면 상체, 몸통/양팔/손, 팔 FK와 한 손 IK, 표정 2종, 손 2종, 외투 A/B, 6초 `idle -> explain -> point`.
- 200% 확대에서 관절 틈·찢김·검은 fringe가 없어야 한다.
- 의상·손·표정 교체 시 위치·크기·피벗이 튀거나 이전 파츠 잔상이 생기면 실패한다.
- Rive Editor preview를 통과하기 전에는 영상 자동화나 사건 캐릭터 양산으로 확장하지 않는다.
- `.riv` 및 영상 출력은 공식 문서상 paid plan 기능이다. 2026-08-13 가격 페이지 기준 Cadet은 `$9/seat/month`로 표시되지만 결제 직전 재확인한다. Source: [Rive pricing](https://www.rive.app/pricing), 확인일 2026-08-13.

## 미확정 사항

- ImageGen 한 페이지 시트가 모든 파츠의 동일 굵기·좌우·피벗을 충분히 보존할지는 아직 검증되지 않았다.
- Rive Cloud 출력과 향후 로컬 browser capture의 프레임 일치 허용오차는 PoC 후 정한다.
- 새 시트는 기존 승인 master를 대체하지 않으며 사용자 시각 승인 전 production authority가 아니다.

## 2026-08-13 reference-derived attachment contract

Direct inspection of four public CC BY Rive preview files confirms that current reusable rigs keep torso/shirt artwork distinct from arm/sleeve and hand elements. The 2026 Bob file exposes separate `Torso`, `Shirt`, jacket arm, arm, forearm, hand and hand-Solo elements; the 2026 Mascot file exposes separate shirt, bilateral arms/shoulder bones, pants, pant legs and shoes. The newer organic-mesh reference confirms mesh plus bone binding but its embedded names alone do not expose exact mesh weights. Detailed provenance and limitations are recorded in [the inspection note](../sources/rive-community-character-rig-inspection-2026-08-13.md).

The enforced front-PoC structure is `arm-free torso + one arm/sleeve attachment per side + one rigid hand attachment per side`. Draw order is arms behind torso and hands in front. A visible second sleeve in the torso is a visual-QA failure even when hashes and dimensions pass. Continuous-arm mesh versus upper-arm/forearm split remains unresolved until an actual Rive extreme-pose test.
