# 고정 캐릭터 시트 v1 — CHAR_BOB_01

## 파일과 기준 우선순위
- 사용자 선택 원본: ../youtube-research-bob-v4-model-makeup.png. 얼굴 판정의 최상위 기준은 원본 왼쪽 확대 사진.
- front-reference.png: 영상 입력용 단독 정면. 원본에서 파생한 정면이며 원본을 대체하는 새 인물이 아님.
- face-angles.png: 위 행 정면 / 화면 왼쪽 45도 / 화면 왼쪽 측면. 아래 행 화면 오른쪽 45도 / 화면 오른쪽 측면 / 정면 작은 미소. 각도는 근사값.
- body-turnaround.png: 왼쪽부터 정면 / 45도 / 측면 / 후면. 비율 검사 목적. 실제 신체 치수 자료가 아니므로 키·몸무게 수치 추정 금지.

## 웹 근거 (2026-09-15 확인)
[Google Flow 이미지/참조 공식 도움말](https://support.google.com/flow/answer/16729550?hl=en): 프로젝트 이미지 Add to Prompt, 캐릭터 이름 참조, 버전 저장 지원.
[Flow Android 참조 도움말](https://support.google.com/flow/answer/16729550?co=GENIE.Platform%3DAndroid&hl=en): 같은 이미지를 반복 사용하고 단순/분리된 배경의 인물·제품 참조 권장.
[Google Flow 공식 제작 팁](https://blog.google/innovation-and-ai/products/flow-video-tips/): Ingredients를 지속적인 시각 참조로 사용.
아래 제작 규칙은 이 근거를 프로젝트에 적용한 작업 제안이다. 시트가 얼굴을 수학적으로 고정하거나 완전한 일관성을 보장하지 않는다.

## 고정 조건
- 동일한 성인 여성 얼굴: 눈 간격·눈꺼풀·콧대·코끝·입술 두께·턱·광대 유지.
- 다크 브라운 턱 길이 단발, 같은 가르마와 비대칭. 정면 기준 화면 오른쪽 귀가 드러나는 원본 우선. 좌우반전 금지.
- 브라운 아이라인/타우프 음영/로즈 브라운 립/절제된 볼 음영. 민낯·과한 스모키로 변경 금지.
- 피부 본래 색과 모공 유지. 밝기 보정으로 피부를 희게 만들지 않기.
- 목 길이·어깨너비·머리 대 몸 비율·팔/다리 비율 유지.
- 기본 포즈와 표정은 중립. 작은 미소·눈 깜박임·시선 이동·작은 끄덕임부터 시작.
- 의상은 상품별 교체 가능. 참조 티셔츠/팬츠는 체형 확인용이며 판매 상품이 아님.

## Flow 적용 순서
1. 선택 원본과 단독 정면을 프로젝트에 저장하고 버전을 고정한다. 캐릭터 기능을 사용할 수 있으면 CHAR_BOB_01 같은 이름을 일관되게 사용한다.
2. 얼굴 참조와 상품 참조의 역할을 명시한다. 전신/측면이 필요하면 시트에서 해당 컷을 Flow Crop으로 개별 저장한다. 여러 컷 시트 전체를 시작 프레임으로 넣지 않는다.
3. 먼저 실제 사용할 9:16 착장 정지 이미지를 만든다. 얼굴/체형/상품 디테일이 맞는 이미지에만 영상 동작을 추가한다.
4. 단독 정면은 얼굴 ingredient 용도다. 전신 영상의 시작 프레임은 별도 착장 전신 정지 이미지를 사용한다.
5. 카메라·배경·광원·색감은 한 영상 묶음 안에서 고정하고 한 컷에 작은 동작 하나를 요청한다.
6. 각 새 클립은 고정 원본을 다시 참조한다. 직전 생성 결과만 연달아 편집하여 원본에서 멀어지지 않도록 한다.
7. 생성 영상 처음/중간/끝에서 얼굴, 가르마, 메이크업, 체형, 손, 상품 색/봉제선 확인. 회전/손 접촉 순간도 확인한다.
8. 얼굴 또는 상품이 바뀌면 해당 컷은 사용하지 않고 고정 참조에서 재생성. 기존 프로젝트 규칙에 맞춰 초기 생성 이후 최대 2회 재시도 후 정지 이미지 방식으로 대체.

## 재사용 프롬프트
Use the supplied CHAR_BOB_01 portrait as the identity and makeup reference, and the supplied garment image only as the clothing reference. Show one adult woman. Preserve her facial anatomy, eye spacing, nose, lip shape, jaw, skin tone, dark chin-length bob and its original part/tuck orientation, refined brown eye makeup and rose-brown lips. Preserve natural body proportions and realistic skin texture. Keep the approved outfit, lighting, camera position and color response unchanged. [ONE SMALL ACTION]. No dialogue. No face reshaping, mirrored hairstyle, beauty-filter smoothing, body proportion changes, garment redesign or color shift.

첫 시험: 단독 정면으로 고정 카메라, 자연스러운 눈 깜박임 1회, 작은 미소. 두 번째 시험: 승인한 전신 착장에서 시선 이동 후 작은 끄덕임. 실제 Flow 영상 생성·검증은 아직 수행하지 않음.

## 검수와 한계
정면, 양쪽 회전, 옷 통일, 메이크업, 전신 손/신발, 큰 비율 일관성을 육안으로 점검했다. 새 측면·후면은 원본에 없던 정보를 추정한 것이다. 턱/코의 깊이와 머리 귀 뒤 넘김은 각도 간 완벽하지 않을 수 있으므로 측면은 보조 자료로 사용하고 원본과 정면을 우선한다. 픽셀 단위 동일성이나 실제 영상 일관성 검증 결과는 아님.

## 생성 도구와 정확한 프롬프트
Built-in image_gen 사용. 모든 생성은 선택 원본 v4에서 직접 파생.

### 얼굴 시트
Create a photorealistic identity reference sheet derived from the supplied approved fictional adult woman. Her LEFT CLOSEUP is the authoritative facial identity and makeup reference. Preserve exact face anatomy, eyes spacing/shape, nose, lips, jaw, skin tone, age, dark chin-length bob with SAME off-center part and same tucked ear, and refined rose-brown model makeup. Do not beautify or redesign. One landscape 3 columns x 2 rows contact sheet, large equal-size head-and-shoulder photos against identical plain light gray background. Top row: front-facing neutral; head turned 45 degrees toward image left neutral; true profile nose pointing image left neutral. Bottom row: head turned 45 degrees toward image right neutral; true profile nose pointing image right neutral; front-facing very subtle closed-mouth smile. Keep crown and chin fully inside each frame; equal head scale and eye line, no jewelry, same plain charcoal crewneck T-shirt. Neutral soft daylight lighting and white balance identical to original with slightly simplified background; natural pores, realistic restrained saturation, no plastic skin. Actual turn in three-dimensional head geometry, NOT mirroring a photo: preserve real part and tuck side across views. Small white gutters, no text or graphic annotations. Single same woman in every panel, absolutely no identity variations. These newly inferred side profiles must harmonize with authoritative face.

### 전신 시트
Make a photographic full-body turnaround reference sheet of EXACT SAME approved fictional adult woman in supplied board, authoritative identity is left closeup. Keep exact face, refined rose-brown makeup, dark chin-length off-center-part bob, adult age and natural body proportions. ONE landscape row of FOUR head-to-shoes photos: front, front three-quarter with nose pointing image left, true side profile nose pointing image left, back. Same scale, head heights and floor line precisely aligned, full hair and shoes visible with margins. Same simple reference outfit throughout: plain charcoal crewneck short sleeve T-shirt, straight regular-fit medium-gray trousers (not wide/oversized, not tight leggings), simple black flat sneakers. No accessories. Relaxed neutral standing, arms slightly separated from torso, hands open relaxed, no hands in pockets. This reference outfit is for reading anatomy, preserve the original body's natural shoulder width, torso and leg proportions without slimming, height exaggeration or reshaping. Plain light gray background, neutral soft diffuse daylight, natural skin texture, same exposure and white balance. Consistent head size/neck length/shoulder/hip/knee alignment across views. The unseen back and side are inferred harmoniously. No text, logos, grids, dramatic studio lighting, beauty filter or collage of different women.

### 단독 정면
Create ONE SINGLE photorealistic head-and-shoulders frontal portrait of the exact same fictional adult woman in the supplied approved reference's LEFT CLOSEUP. No collage or panels. This is the canonical video identity reference. Preserve exact eyes, brows, nose, lip shape, jaw, adult age, skin tone, bob hair part and asymmetry, existing refined model makeup including fine brown eyeliner and rose-brown satin lips. Change only viewpoint to straight-on level frontal gaze, head upright without tilt, neutral relaxed closed mouth; plain neutral light gray background. Full hair crown and both shoulders visible, charcoal crewneck T-shirt, no accessories. Natural pores and subtle imperfections, same neutral photographic color response and soft daylight; no face reshaping, skin whitening, glamour lighting or beauty filter. Single centered person, high-resolution portrait orientation, clear unoccluded face. Match source identity exactly rather than inventing another attractive woman.

