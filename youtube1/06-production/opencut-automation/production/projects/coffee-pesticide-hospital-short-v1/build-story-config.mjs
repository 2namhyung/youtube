import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const capturedAt = "2026-08-07T08:00:00.000Z";
const styleReference = "assets/images/scene01-ordinary-coffee.png";
const finalScript = JSON.parse(fs.readFileSync(path.join(root, "script.final.json"), "utf8"));
const thumbnailContract = JSON.parse(fs.readFileSync(path.join(root, "thumbnail-reference-v3-v1.manifest.json"), "utf8"));
if (thumbnailContract.headline?.line1 !== "동료의 커피에" || thumbnailContract.headline?.line2 !== "살충제를 넣었다") throw new Error("Thumbnail headline does not match the locked story title.");
if (thumbnailContract.aiDisclosure?.text !== "사건 내용 기반 AI 재구성" || thumbnailContract.spokenCaptions !== false) throw new Error("Thumbnail disclosure/caption policy drift.");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileRecord = (file) => {
  const bytes = fs.readFileSync(file);
  return { path: file, bytes: bytes.length, sha256: sha256(bytes) };
};
const scriptSections = finalScript.draft
  .replace(/\r\n/g, "\n")
  .split(/\n\s*\n+/)
  .map((section) => section.replace(/\s+/g, " ").trim());

// One scene per stable visual idea. This finalized 18-sentence script contains
// five sentences with two distinct visual ideas, yielding 23 narration-aligned cuts.
const scenes = [
  ["scene01-ordinary-coffee", "방금까지는 평범한 커피였습니다.", "final script hook", "clinic-break-desk", "an ordinary fictional Korean clinic staff desk", "one untouched plain paper coffee cup beside a closed notebook and an empty teal chair", "close-up", "slightly above desk level", "cup centered low; empty chair behind", "desk edge", "cup and notebook", "empty chair and plain partition"],
  ["scene02-unattended-cup", "잠깐 자리를 비운 사이,", "claim-dab432c2f2c8", "clinic-break-desk", "the same clinic desk with its chair pulled away", "the unattended plain coffee cup and a vacant teal chair", "medium close-up", "from the side of the desk", "cup in lower-left; vacant chair centered", "cup rim", "desk and vacant chair", "frosted clinic partition"],
  ["scene03-hidden-risk", "누군가 살충제를 넣기 전까지는", "claim-dab432c2f2c8 + claim-b749b59d879f", "clinic-break-desk", "the same unattended clinic desk", "the plain coffee cup in focus with a small unlabeled amber utility bottle isolated at the far desk edge", "close-up", "desk-height three-quarter view", "cup in left third; bottle far right with clear separation", "desk scratches", "cup and bottle", "vacant chair"],
  ["scene04-clinic-establishing", "경기도 구리시 한 병원.", "claim-e6f5fae4060c; script uses broader hospital wording", "fictional-guri-clinic", "a non-identifiable Korean neighborhood medical clinic reception and corridor", "two anonymous adult clinic workers seen from behind", "medium-wide", "from the waiting area", "workers small at center; counter low", "waiting-chair edge", "reception counter and workers", "plain corridor doors"],
  ["scene05-workplace-reprimand", "간호조무사 A씨는 업무로", "claim-67d53cfe1b17", "clinic-staff-room", "a small fictional clinic staff room with plain supply shelves", "worker B in navy scrubs giving restrained work guidance to worker A in a burgundy cardigan over gray scrubs", "medium", "from the end of the worktable", "A left; B right; clear distance", "table corner", "two workers", "neutral shelves"],
  ["scene06-held-grievance", "핀잔을 주던 B씨에게 불만이 있었습니다.", "claim-67d53cfe1b17", "clinic-staff-room", "the same clinic staff room", "worker A alone at the worktable with tense lowered eyes; worker B is only a soft distant figure", "medium close-up", "across the worktable", "A foreground right; B distant left", "closed notebook", "worker A", "distant worker B and shelves"],
  ["scene07-previous-argument", "다툰 다음 날,", "claim-88cfb6a5c046", "clinic-staff-room", "the same clinic worktable", "worker A and worker B facing each other with restrained angry posture and no physical contact", "medium-wide", "eye-level at table end", "A and B on opposite thirds", "empty table edge", "two workers", "closed door and shelves"],
  ["scene08-vacant-seat", "B씨가 자리를 뜨자", "claim-dab432c2f2c8", "clinic-break-desk", "the same clinic desk with a navy jacket on the vacant chair", "worker A standing beside the unattended cup while the doorway remains empty", "medium", "from across the desk", "cup low center; A left; empty doorway right", "cup", "worker A and vacant chair", "empty doorway"],
  ["scene09-pesticide-insertion", "커피에 살충제를 넣었습니다.", "claim-dab432c2f2c8 + claim-b749b59d879f", "clinic-break-desk", "the same unattended desk", "worker A beside the cup with one restrained hand near a small unlabeled amber utility bottle; no visible liquid", "medium close-up", "desk-height three-quarter view", "cup and bottle low center; A cropped above nose", "cup", "bottle and restrained hand", "vacant chair"],
  ["scene10-first-sip", "B씨는 한 모금 뒤", "claim-2635dd573b3a", "clinic-break-desk", "the same clinic desk", "worker B in navy scrubs holding the plain cup near her face with a guarded neutral expression; no other person visible", "medium close-up", "eye-level across desk", "B right; cup centered", "desk edge", "worker B and cup", "plain partition"],
  ["scene11-abnormal-taste", "이상한 맛에 멈췄지만", "claim-2635dd573b3a", "clinic-break-desk", "the same clinic desk", "worker B with the upright cup resting on the desk and one hand near her mouth, showing restrained concern", "medium close-up", "eye-level across desk", "B right; cup isolated left", "cup", "worker B", "plain partition"],
  ["scene12-health-impact", "위장장애와 불안장애를 겪었습니다.", "claim-1044e6a16af1", "clinic-consultation-room", "a plain fictional medical consultation room", "worker B seated alone with folded tense posture, one hand lightly over her abdomen; no other person visible", "medium", "from the doorway", "B centered low with open space above", "visitor-chair edge", "worker B", "plain wall and cabinet"],
  ["scene13-dangerous-substance", "사람이 먹으면 안 되는 살충제잖아요.", "claim-7f53cbc5b3ba", "symbolic-evidence-table", "a sober anonymous evidence table", "a sealed plain coffee cup and small unlabeled amber pesticide bottle separated by a warning-like empty gap", "close-up", "table height", "cup left; bottle right; empty center", "table edge", "cup and bottle", "charcoal wall"],
  ["scene14-prosecution-theory", "검찰은 살인미수를 주장했지만", "claim-8157343e251a", "fictional-legal-office", "an anonymous Korean legal office with no emblems", "a closed case folder, sealed cup, unlabeled bottle, and an indistinct prosecutor silhouette; no clinic worker, medical scrubs, or water bottle visible", "medium-wide", "from across evidence table", "evidence low; silhouette high center", "table edge", "folder cup and bottle", "prosecutor silhouette"],
  ["scene15-special-injury-finding", "법원이 인정한 건 특수상해였습니다.", "claim-f153168990f6", "fictional-courtroom", "a plain fictional Korean courtroom without insignia", "an anonymous judge silhouette and one closed case folder on the lower table", "medium-wide", "from the gallery", "judge high center; folder low center", "gallery rail", "closed folder", "plain judge bench"],
  ["scene16-first-sentence", "1심 징역 2년.", "claim-fc54d3811ea6", "symbolic-court-desk", "a restrained court desk still life", "one dark sealed judgment folder beside a balanced scale", "close-up", "slightly above table level", "folder lower left; scale upper right", "wood grain", "dark folder", "balanced scale"],
  ["scene17-appeal-suspended", "항소심에선 징역 1년 6개월에 집행유예 3년으로", "claim-9cfeb9654123", "symbolic-appeal-desk", "a second restrained court desk still life", "two sealed judgment folders with the upper folder lighter in tone beside a balanced scale", "close-up", "slightly above table level", "stacked folders left; scale right", "wood grain", "two folders", "soft courthouse wall"],
  ["scene18-sentence-reduced", "형이 줄었습니다.", "claim-9cfeb9654123 + claim-c1884fab54ee", "fictional-courtroom", "the same plain fictional courtroom", "an empty defendant chair beneath a broad pale rectangle of courthouse light", "medium-wide", "from the gallery", "empty chair centered low; bench distant", "gallery rail", "empty chair", "plain judge bench"],
  ["scene19-fear-remains", "하지만 피해자의 커피잔에 남은 공포도 줄었을까요?", "appeal result contrasted with victim impact; claim-9cfeb9654123 + claim-1044e6a16af1", "symbolic-clinic-desk", "the same plain clinic desk under restrained charcoal shadow", "a solitary coffee cup casting a long cage-like geometric shadow", "close-up", "slightly above desk level", "small cup centered low; shadow fills upper half", "cup rim", "solitary cup", "geometric shadow and empty chair"],
  ["scene20-victim-future", "형은 언젠가 끝나지만,", "editorial victim-impact inference permitted by scriptWritingReview", "clinic-corridor", "a quiet fictional clinic corridor", "worker B in navy scrubs standing alone beside a closed staff-room door", "medium-wide", "from the far corridor", "B small in lower center; long corridor around her", "dark floor edge", "worker B", "closed door and empty corridor"],
  ["scene21-everyday-distrust", "피해자는 그 이후를 살아가야 합니다.", "editorial inference grounded in claim-1044e6a16af1 anxiety disorder", "clinic-break-desk", "the same clinic staff desk", "worker B seated before an open cup while a distant anonymous coworker holds out a second plain cup", "medium", "eye-level across desk", "open cup foreground; B center; offered cup distant", "open cup", "worker B", "soft coworker silhouette"],
  ["scene22-unsafe-workplace", "안심하고 일할 수 없다면", "victim-safety and recurrence-prevention editorial conclusion", "clinic-staff-room", "the same familiar staff room with an empty place at the table", "worker B seated far from an untouched cup, hands held together", "medium-wide", "from the doorway", "cup foreground left; B distant right", "untouched cup", "empty table space", "worker B and closed door"],
  ["scene23-closing-question", "직장 책상에 두고 온 커피.", "final script viewer-directed question", "ordinary-office-desk", "an anonymous ordinary Korean workplace desk", "one plain coffee cup beside a pulled-back chair, with no person visible", "close-up", "slightly above desk level", "cup centered low; empty chair behind; open negative space", "desk edge", "plain cup", "empty chair and muted office partition"],
].map(([id, anchor, evidence, location, backdrop, subject, shot, viewpoint, placement, foreground, midground, background]) => ({ id, anchor, evidence, location, backdrop, subject, shot, viewpoint, placement, foreground, midground, background }));

function recipe(scene, index) {
  const hasReference = index > 0;
  return {
    schema: "imagegen-prompt-recipe-v1",
    recipe_id: `coffee-pesticide-editorial-${String(index + 1).padStart(2, "0")}`,
    version: 1,
    family: "mature-editorial-2d-cartoon",
    template: {
      use_case: "illustration-story",
      asset_type: "static_frame",
      continuity_group: "{{continuity_group}}",
      location_id: "{{location}}",
      wardrobe_ids: ["wardrobe-a-burgundy-gray", "wardrobe-b-navy-scrubs"],
      prop_ids: ["prop-plain-paper-coffee-cup", "prop-unlabeled-amber-utility-bottle"],
      reference_ids: hasReference ? ["ref-coffee-style-v1"] : [],
      scene: { backdrop: "{{backdrop}}", environment: "quiet static editorial scene" },
      subjects: [{ id: "{{scene_subject}}", description: "{{subject}}", invariants: [
        "fictional anonymous Korean adults only",
        "worker A keeps a muted burgundy cardigan over gray scrubs and short dark hair",
        "worker B keeps navy scrubs and a low ponytail",
        "faces simplified and non-identifiable",
        "mature Korean editorial 2D cartoon with restrained ink outlines, flat gouache texture and realistic proportions",
      ] }],
      shot: { type: "{{shot}}", viewpoint: "{{viewpoint}}", camera_height: "eye-level" },
      composition: { aspect_ratio: "9:16", spatial_placement: "{{placement}}", negative_space: "clean upper third and lower caption-safe band", depth_layers: { foreground: "{{foreground}}", midground: "{{midground}}", background: "{{background}}" } },
      lighting: { description: "soft overcast daylight mixed with ordinary fluorescent light", color: "restrained charcoal, dusty cream, muted teal and burgundy with faint cold cyan", material_texture: "subtle paper grain, honest desk scratches, matte fabric and dry gouache shading" },
      references: hasReference ? [{ id: "ref-coffee-style-v1", role: "style-continuity", path: styleReference }] : [],
      exact_text_policy: { mode: "none", allowed: [] },
      avoid: [
        "readable text, captions, labels, logos, trademarks or watermarks",
        "real identifiable people, celebrity likenesses, sensational gore or explicit poisoning imagery",
        "photorealism, glossy 3D rendering, anime styling or childish caricature",
        "temporal motion, camera movement, split screens, multiple time periods or motion blur",
      ],
    },
    variables: { location: scene.location, backdrop: scene.backdrop, scene_subject: scene.id, subject: scene.subject, shot: scene.shot, viewpoint: scene.viewpoint, placement: scene.placement, foreground: scene.foreground, midground: scene.midground, background: scene.background },
    defaults: { continuity_group: "coffee-pesticide-clinic-v2" },
    prompt_meta: { source_title: "research-657380fce7eaccc9 finalized suspense script and event dossier v3", author: "OpenCut newsroom editorial pipeline", original_language: "ko", captured_at: capturedAt },
    reference_role_requirements: hasReference ? [{ role: "style-continuity", required: true }] : [],
    qa_policy: { protected_content_mode: "block", approved_protected_terms: [] },
  };
}

const transitionContract = {
  mode: "media-only",
  frameAccounting: "preserve-scene-sum",
  boundaries: Array.from({ length: scenes.length - 1 }, (_, index) => {
    const from = index + 1;
    const semanticSectionEnd = new Set([3, 12, 18, 22]).has(from);
    const type = !semanticSectionEnd ? "hard-cut" : from === 12 ? "slide-left" : "dip-to-black";
    return {
      from,
      to: from + 1,
      type,
      frames: semanticSectionEnd ? 12 : 0,
      ...(semanticSectionEnd ? { notes: "12-frame media-only semantic transition; title, captions, and disclosure remain fixed" } : {}),
    };
  }),
};

const authorityDraftSha256 = sha256(Buffer.from(finalScript.draft, "utf8"));
const wanPrompt = "One continuous restrained Korean editorial cartoon shot. Preserve the exact fictional clinic office, desk, plain paper coffee cup, teal chair, partitions, lighting, fixed camera and composition from the supplied first and last frames. The one anonymous adult already facing the doorway walks calmly forward and exits fully through that doorway exactly once, ending on the supplied empty-room last frame. The adult never turns, never returns, and never approaches or touches the cup. The cup, chair, desk and all office objects remain completely still. Locked camera, no zoom, no pan, no shake, no reframing, no new person, no hand close-up, no bottle, no pesticide, no pouring, no readable text.";
const wanNegative = "camera movement, zoom, pan, shake, drift, reframing, returning person, reverse walking, person entering, extra person, duplicate person, person approaching cup, hand near cup, touching cup, moving cup, moving chair, bottle, pesticide, liquid, pouring, morphing, warped anatomy, changed furniture, changed lighting, labels, text, watermark, photorealism, anime, 3D, gore";
const keyframeStartPrompt = "1080x1920 mature Korean editorial 2D cartoon, restrained ink outlines, flat gouache paper texture, exact same fictional clinic staff desk, plain white paper coffee cup foreground-left, teal rolling chair centered-right, frosted partitions and muted cream/teal palette matching refs. One anonymous adult clinic staff member seen only from behind stands beside the teal chair, torso turned toward the doorway at far upper-right, clearly about to leave. Fixed eye-level composition, realistic adult proportions, simplified non-identifiable face, no hand near cup, no bottle, no pesticide, no labels/readable text, no camera motion.";
const keyframeEndPrompt = "Use START as composition reference. Pixel-consistent same fixed 9:16 clinic desk/cup/chair/partitions/light; the adult has fully exited through far upper-right doorway, leaving only the untouched coffee cup and empty teal chair. No person anywhere, no changed or moved object, no bottle/pesticide/hands/text. Mature restrained editorial 2D cartoon, same gouache/ink style.";
const acceptedWanSource = { ...fileRecord(path.join(root, "assets", "images", "wan-scene02-start-v1.png")), path: "assets/images/wan-scene02-start-v1.png" };
const acceptedWanEnd = { ...fileRecord(path.join(root, "assets", "images", "wan-scene02-end-v1.png")), path: "assets/images/wan-scene02-end-v1.png" };
const keyframeReferenceScene01 = { ...fileRecord(path.join(root, "assets", "images", "scene01-ordinary-coffee.png")), path: "assets/images/scene01-ordinary-coffee.png" };
const keyframeReferenceScene02 = { ...fileRecord(path.join(root, "assets", "images", "scene02-unattended-cup.png")), path: "assets/images/scene02-unattended-cup.png" };
const rejectedWanAsset = { ...fileRecord(path.resolve(root, "../../../../comfyui-video/rejected/coffee-pesticide-hospital-short-v1/scene09-cap-measure-rejected.mp4")), path: "06-production/comfyui-video/rejected/coffee-pesticide-hospital-short-v1/scene09-cap-measure-rejected.mp4" };
const rejectedWanExitV1 = { ...fileRecord(path.resolve(root, "../../../../comfyui-video/rejected/coffee-pesticide-hospital-short-v1/scene02-single-i2v-v1-reentry-rejected.mp4")), path: "06-production/comfyui-video/rejected/coffee-pesticide-hospital-short-v1/scene02-single-i2v-v1-reentry-rejected.mp4" };
const rejectedWanExitV2 = { ...fileRecord(path.resolve(root, "../../../../comfyui-video/rejected/coffee-pesticide-hospital-short-v1/scene02-single-i2v-v2-reentry-rejected.mp4")), path: "06-production/comfyui-video/rejected/coffee-pesticide-hospital-short-v1/scene02-single-i2v-v2-reentry-rejected.mp4" };
const rejectedWanExitFlf = { ...fileRecord(path.resolve(root, "../../../../comfyui-video/rejected/coffee-pesticide-hospital-short-v1/scene02-flf-style-semantic-failure-rejected.mp4")), path: "06-production/comfyui-video/rejected/coffee-pesticide-hospital-short-v1/scene02-flf-style-semantic-failure-rejected.mp4" };
const assetPlan = {
  schema: "editorial-asset-plan-v1",
  generationPolicy: "plan-required-before-generation",
  scriptSha256: authorityDraftSha256,
  scenes: scenes.map((scene, index) => ({
    scene: index + 1,
    evidenceBasis: scene.evidence,
    classification: index === 1 ? "static-no-motion" : "imagegen-reuse",
    rationale: index === 1
      ? "Wan information-delta was planned and attempted with exact local models, then failed style/semantic admission after bounded retries; the verified original unattended-cup still is the fail-closed fallback."
      : "Existing project-owned ImageGen still is reused only after its structured recipe, evidence basis, style continuity, file hash, and meaning remain contract-bound.",
  })),
};
const motionEvidence = {
  schema: "editorial-motion-evidence-v1",
  camera: { mode: "none", intensity: 0, zoom: 1, panX: 0.5, panY: 0.5 },
  ffmpeg: { mode: "transition-only", overlayLock: true, boundaries: transitionContract.boundaries },
  wan: {
    status: "blocked",
    selectedScenes: [],
    runtime: { engine: "ComfyUI", version: "0.18.1", python: "3.12.9", pytorch: "2.6.0+cu124", device: "NVIDIA GeForce RTX 3060 Ti 8GB", launch: "--lowvram --listen 127.0.0.1 --port 8188", workflow: "06-production/comfyui-video/scripts/generate_wan22_flf.py", node: "WanFirstLastFrameToVideo", width: 480, height: 832, frames: 49, fps: 24, steps: 20, cfg: 5, seed: 2026080823 },
    models: [
      { id: "Wan2.2-TI2V-5B-Q5_0.gguf", role: "diffusion-model", path: "C:/Users/User/tools/ComfyUI/models/unet/Wan2.2-TI2V-5B-Q5_0.gguf", bytes: 3642503520, sha256: "ce3fe1bcc8e2298d68101a0278d268c0fb27c8a29e55d4caf58ff0e3d83223b9" },
      { id: "umt5_xxl_fp8_e4m3fn_scaled.safetensors", role: "text-encoder", path: "C:/Users/User/tools/ComfyUI/models/text_encoders/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors", bytes: 6735906897, sha256: "c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68" },
      { id: "wan2.2_vae.safetensors", role: "vae", path: "C:/Users/User/tools/ComfyUI/models/vae/split_files/vae/wan2.2_vae.safetensors", bytes: 1409400960, sha256: "e40321bd36b9709991dae2530eb4ac303dd168276980d3e9bc4b6e2b75fed156" },
    ],
    assets: [],
    rejectedCandidates: [
      { scene: 9, output: rejectedWanAsset, reason: "Rejected before project admission: it visualized a disputed quantity claim and unnecessary hand action around a hazardous substance." },
      { scene: 2, output: rejectedWanExitV1, reason: "Rejected before project admission: single-image I2V made the person re-enter from the opposite side after leaving." },
      { scene: 2, output: rejectedWanExitV2, reason: "Rejected before project admission: bounded shorter single-image I2V still enlarged/reintroduced the person instead of completing the exit." },
      { scene: 2, sourceImage: acceptedWanSource, endImage: acceptedWanEnd, output: rejectedWanExitFlf, prompt: wanPrompt, promptSha256: sha256(Buffer.from(wanPrompt, "utf8")), negativePrompt: wanNegative, negativePromptSha256: sha256(Buffer.from(wanNegative, "utf8")), keyframeProvenance: { provider: "built-in-image_gen", references: [keyframeReferenceScene01, keyframeReferenceScene02], startPrompt: keyframeStartPrompt, startPromptSha256: sha256(Buffer.from(keyframeStartPrompt, "utf8")), endPrompt: keyframeEndPrompt, endPromptSha256: sha256(Buffer.from(keyframeEndPrompt, "utf8")), styleMeaningLint: "pass: fixed composition, same cup/chair/desk, safe exit states" }, reason: "Rejected before project admission: first/last-frame Wan output omitted the adult from frame zero and materially flattened/changed the approved gouache office composition, so no exit information delta survived." },
    ],
    blocker: "No Wan candidate passed semantic/style continuity after bounded exact-model attempts; scene 2 uses its verified project-owned static unattended-cup fallback.",
  },
};

const config = {
  projectId: "coffee-pesticide-hospital-short-v1",
  title: { line1: "동료의 커피에", line2: "살충제를 넣었다" },
  scriptSource: "script.final.json",
  assetsRoot: "assets",
  thumbnail: { image: thumbnailContract.output.image, sha256: thumbnailContract.output.sha256, source: "deterministic reference-v3 composition of the event-specific scene01 ImageGen asset", provenance: "headline + event media + AI disclosure; spoken-caption layer omitted; exact source/tokens/renderer hashes in thumbnailContract" },
  thumbnailContract,
  scenes: scenes.map((scene) => ({ asset: `assets/images/${scene.id}.png`, captionAnchor: scene.anchor })),
  sceneRecipes: scenes.map(recipe),
  evidenceBasis: scenes.map((scene) => scene.evidence),
  wanMotionScenes: [],
  assetPlan,
  motionEvidence,
  aiDisclosureLabel: "사건 내용 기반 AI 재구성",
  transitionContract,
  captionProtectedTerms: ["살충제", "살인미수", "특수상해", "징역 1년 6개월", "집행유예 3년", "형이 줄었습니다"],
  captionPreset: { id: "information-delta-v14-white-on-black-2line", fontFamily: "Noto Sans KR", fontWeight: 800, fontSize: 88, scaleX: 94, safeWidth: 920, maxLines: 2, lineHeight: 1.08, x: 540, y: 1400, color: "#FFFFFF", outlineColor: "#000000", outlineWidth: 5, background: "black" },
  narration: {
    mode: "qwen3-tts",
    style: "auto",
    promptBank: "../../../../../03-script-voice/voice-clone/profiles/owner-voice-v1/prompt-bank/manifest.json",
    device: "cuda",
    seed: 20260807,
    maxAttempts: 4,
    temperature: 0.55,
    finalTempo: 1,
    maxSegmentChars: 220,
    criticalPhrases: ["살충제", "살인미수", "특수상해", "징역 1년 6개월", "집행유예 3년", "형이 줄었습니다", "안심하고 일할 수 없다면"],
    criticalPhraseIsolation: false,
    criticalPhraseModels: ["small", "medium"],
    criticalPhraseAgreement: "at-least-one-model",
    pronunciationHints: [
      { source: "살인미수", spoken: "살인 미수" },
      { source: "특수상해", spoken: "특수 상해" },
      { source: "집행유예", spoken: "집행 유예" },
    ],
    questionSentences: ["여러분은 아무렇지 않게 다시 마실 수 있나요?"],
    questionStyle: "viewer_question",
    stylePlan: ["hook", "news_exposition", "news_exposition", "tension", "legal_explanation", "closing", "closing"]
      .map((style, segmentIndex) => ({
        segmentIndex,
        textSha256: crypto.createHash("sha256").update(scriptSections[segmentIndex], "utf8").digest("hex"),
        style,
      })),
    removeSilence: false,
    sentencePauseSeconds: 0,
    semanticPauseSeconds: 0,
    joinSafetySeconds: 0,
  },
  bgm: {
    provider: "ace-step-1.5",
    engineContract: "../../../../../05-bgm-generation/engines/ace-step-1.5-official-local-v1/manifest.json",
    prompt: "restrained psychological investigative documentary instrumental for an everyday workplace coffee contamination case, dark low drone, sparse felt piano pulses, muted bass, subtle dry ticking texture, slow 66 BPM, minor mode, uneasy but unobtrusive, gradual tension, no vocals, no lead melody, no bright resolution, leave space for Korean spoken narration",
    seed: 657380,
    audio: "../../../../../05-bgm-generation/runs/research-657380fce7eaccc9-ace-step-v1/event-bgm.wav",
    output: "../../../../../05-bgm-generation/runs/research-657380fce7eaccc9-ace-step-v1/event-bgm.wav",
    model: "acestep-v15-turbo + acestep-5Hz-lm-0.6B",
    version: "ACE-Step 1.5.0 official local, commit 6d467e4b5081ccb0abf1ec1bf4fdf9051a2d34b0",
    license: "MIT (ACE-Step code and official model repository metadata)",
    sha256: "dcb7fb93fe0651b348c4e97e032b0d5687f8a2efcad5c1eadf278973bf2eb68b",
    provenance: "../../../../../05-bgm-generation/runs/research-657380fce7eaccc9-ace-step-v1/manifest.json",
    volumeDb: -16,
    duckUnderNarration: true,
    fadeSeconds: 1.2,
    required: true,
  },
  releaseGate: { publishable: false, releaseStatus: "preview", uploadBlocked: true, blockers: [{ id: "human-playback-review-required", stage: "07-quality-assurance", severity: "block", claim: "커피 살충제 사건 비공개 완성본", reason: "정확한 렌더 파일에 대한 사람의 전체 재생 검토와 최종 승인이 필요합니다.", authority: { case: "local-editorial-approval", url: "https://example.invalid/local-editorial-approval" } }] },
  output: { width: 1080, height: 1920, fps: 30 },
};

fs.mkdirSync(path.join(root, "assets", "images"), { recursive: true });
fs.mkdirSync(path.join(root, "assets", "audio"), { recursive: true });
fs.mkdirSync(path.join(root, "assets", "video"), { recursive: true });
fs.writeFileSync(path.join(root, "story.config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: "written", projectId: config.projectId, scenes: config.scenes.length, output: path.join(root, "story.config.json") }, null, 2));
