export type ProductionMode = 'remotion' | 'omni' | 'source-photo' | 'source-video';
export type LayerRole = 'plate' | 'midground' | 'foreground' | 'document' | 'accent' | 'evidence' | 'character' | 'architecture';
export type AnimationType =
  | 'spring-enter'
  | 'place'
  | 'slap'
  | 'rise'
  | 'wipe'
  | 'highlight'
  | 'camera'
  | 'ease-move'
  | 'scale'
  | 'opacity'
  | 'mask-reveal'
  | 'draw-path'
  | 'chart-draw'
  | 'hold';
export type EffectKind = 'texture' | 'overlay' | 'transition-matte' | 'visual-vfx' | 'sfx';

export type FrameRange = {
  start_frame: number;
  end_frame: number;
};

export type WordCue = {
  word: string;
  frame: number;
};

export type CutAsset = {
  asset_id: string;
  file: string;
  media_type: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml' | 'video/mp4' | 'video/webm' | 'video/quicktime' | 'video/x-m4v' | 'video/mpeg';
  role: LayerRole;
  z_index: number;
  source_id: string | null;
  /** Required on new/current manifests that opt into asset_origin_policy v1. */
  asset_class?: AssetClass;
  origin?: 'imagegen-person' | 'real-source' | 'official-source' | 'source-derived' | 'source-backed' | 'deterministic-editorial';
  source_kind?: AssetSourceKind;
  original_url?: string;
  license?: string;
  sha256?: string;
  source_duration_seconds?: number;
  source_timecode?: SourceVideoTimecode;
  /** True only when the file is already the authorized normalized crop. */
  source_crop_applied?: boolean;
  layout?: {left: number; top: number; width: number; height: number};
};

export type AssetClass =
  | 'person'
  | 'building'
  | 'interior'
  | 'object'
  | 'prop'
  | 'document'
  | 'photo'
  | 'background'
  | 'context'
  | 'architecture'
  | 'deterministic-overlay'
  | 'chart'
  | 'path'
  | 'effect'
  | 'mask'
  | 'text-surface';

export type AssetSourceKind =
  | 'real-photo'
  | 'official-photo'
  | 'official-document'
  | 'official-video'
  | 'source-photo'
  | 'source-video'
  | 'source-original';

export type AssetOriginPolicy = {
  version: 1;
  person_imagegen_allowed: true;
  non_person_source_required: true;
};

export type SourceVideoTimecode = {
  start: string;
  end: string;
  start_seconds: number;
  end_seconds: number;
  speaker: string;
  context: string;
  locator: string;
  locator_basis: string;
};

export type SourceAssetLayerDerivative = {
  asset_id: string;
  layer_name: string;
  subject_kind: 'person' | 'building' | 'object' | 'interior';
  file: `assets/${string}.png`;
  sha256: string;
  width: number;
  height: number;
  alpha: {transparent_pixels: number; visible_pixels: number};
  derivation_input: {
    type: 'alpha-mask' | 'transparent-png';
    file: string;
    sha256: string;
    method: 'manual-mask' | 'external-segmentation';
    provider: string | null;
    note: string;
  };
};

/**
 * Provenance chain from an approved graph media_assets row to a cut-local,
 * byte-identical source copy and optional transparent Remotion layers.
 * A cutout is explanatory artwork; documentary evidence remains the source file.
 */
export type SourceAssetMaterialization = {
  media_asset_id: number;
  source_id: string;
  route: 'source' | 'transparent-layers' | 'scoped-document-derivatives';
  usage: 'documentary-evidence' | 'context' | 'explanation';
  review_state: 'approved' | 'scoped-approved';
  source: {
    file: `source-photo/${string}` | `source-video/${string}` | `assets/${string}`;
    original_url: string;
    license: string;
    attribution: string;
    media_type: 'photo' | 'video';
    mime_type: string;
    sha256: string;
    bytes: number;
    duration_seconds?: number;
    video_codec?: string;
    width?: number;
    height?: number;
    timecode?: SourceVideoTimecode;
  };
  derivatives: SourceAssetLayerDerivative[];
  scoped_authorization?: {
    authorization_id: string;
    parent_source_sha256: string;
    approval_marker_path: string;
    approval_marker_sha256: string;
    outputs: Array<{output_id: string; file: `assets/${string}` | `source-photo/${string}`; sha256: string; bytes: number; asset_id: string}>;
  };
  state: 'source-ready' | 'asset-ready-presentation-pending' | 'scoped-derivatives-ready';
};

export type AnimationAction = FrameRange & {
  animation_id: string;
  target_id: string;
  type: AnimationType;
  from?: Record<string, number>;
  to?: Record<string, number>;
  easing?: string;
};

export type TextCue = FrameRange & {
  cue_id: string;
  text: string;
  kind: 'keyword' | 'number' | 'quote-fragment';
  target_asset_id?: string;
  /** Presentation contract v2 binds explanatory text to a visible component. */
  target_component_id?: string;
  placement?: 'below-center' | 'on-surface';
  font_size_px?: number;
  max_width_px?: number;
  max_lines?: number;
  /** Target-position-level keeps detached labels level; inherit-target-surface is reserved for PNG overlays. */
  transform_binding?: 'inherit-target-surface' | 'target-position-level' | 'screen-space-level';
  surface_anchor?: 'target-below-center' | 'on-surface' | 'screen-space';
  surface_rotation_deg?: number;
};

export type CutEffect = FrameRange & {
  effect_id: string;
  file: `effects/${string}`;
  kind: EffectKind;
  blend_mode: 'normal' | 'screen' | 'multiply' | 'overlay';
  opacity: number;
  loop: boolean;
  source_id: string;
  original_url?: string;
  rights_status?: string;
  approval_status?: 'approved' | 'pending' | 'rejected';
  rights_review_state: 'approved' | 'review-required' | 'permission-required';
  sha256: string;
  persists_to_final: boolean;
};

export type CutLifecycle = {
  background_only: FrameRange & {
    start_frame: 0;
    visible_asset_ids: [];
    visible_effect_ids: [];
  };
  reveal: FrameRange;
  final_hold: FrameRange;
  final_visible_asset_ids: string[];
  final_visible_effect_ids: string[];
};

export type ChartSpec = {
  chart_id: string;
  type: 'bar' | 'line' | 'counter' | 'dot-plot' | 'timeline' | 'process';
  source_id: string;
  unit: string;
  data: Array<Record<string, string | number>>;
  reveal: FrameRange;
};

export type TransitionRect = {left: number; top: number; width: number; height: number};
export type TransitionCameraState = {x: number; y: number; scale: number; rotate: number};
export type SharedElementEndpoint = {
  component_id: string;
  asset_id: string;
  rect: TransitionRect;
  camera: TransitionCameraState;
  state: 'focused' | 'supporting' | 'final-summary';
};
export type SharedElementTransition = {
  outgoing: SharedElementEndpoint;
  incoming: SharedElementEndpoint;
  inheritance: {
    rect: true;
    camera: true;
    presentation_state: true;
  };
  visual_blend: 'cross-dissolve';
  easing: 'ease-in-out-cubic';
};
export type SharedElementFallback = {
  operator_id: 'scene.crossfade@1';
  mode: 'whole-scene';
  allowed_on: 'invalid-mapping';
};

export type CutManifest = {
  schema_version: 1;
  episode_id: `episode-${string}`;
  shot_id: `SH${string}`;
  fps: 30;
  duration_frames: number;
  claim_id: string | null;
  visual_subject: string | null;
  background: 'background.png';
  asset_directory: 'assets';
  production_mode: ProductionMode | null;
  effects_required?: boolean;
  omni?: {
    keyframes: Array<{file: string; keyframe_id?: string; prompt_id?: string | null; sha256?: string}>;
    video_status: 'blocked_until_all_cuts_passed' | 'generation_allowed' | 'generated' | 'not_applicable';
    output: string | null;
  };
  source_materials?: Array<{source_id: string; original_url: string; rights_status: string; approval_status: 'approved' | 'pending' | 'rejected'}>;
  source_asset_materializations?: SourceAssetMaterialization[];
  missing_sources?: string[];
  provisional_placeholder?: boolean;
  final_qc?: {status: 'pending' | 'approved' | 'rejected'; marker: string | null};
  voiceover: {
    audio: string | null;
    text: string | null;
    status?: 'draft' | 'final-measured';
    start_frame: 0;
    end_frame: number | null;
    word_cues: WordCue[];
  };
  assets: CutAsset[];
  animations: AnimationAction[];
  lifecycle: CutLifecycle | null;
  text_cues: TextCue[];
  chart: ChartSpec | null;
  effects: CutEffect[];
  transition: {
    type: 'hard-cut' | 'match' | 'mask' | 'whip' | 'morph' | 'scene-to-scene';
    intent?: string;
    operator_id?: 'scene.crossfade@1' | 'scene.scale-crossfade@1' | 'scene.shared-element@1';
    start_frame: number | null;
    duration_frames: number;
  continuity_asset_id?: string | null;
    next_shot_id: `SH${string}` | null;
    continuity: {
      relation: 'asset-morph' | 'camera-state' | 'spatial-state';
      outgoing_asset_ids: string[];
      incoming_asset_ids: string[];
      outgoing_component_ids?: string[];
      incoming_component_ids?: string[];
      layout_binding?: 'manifest-component-layout';
      camera_inheritance?: 'inherit-without-delta-claim';
      presentation_state_inheritance?: 'manifest-component-state';
      outgoing_state?: Record<string, number | string> | null;
      incoming_state?: Record<string, number | string> | null;
    } | null;
    fallback?: SharedElementFallback | null;
    shared_element?: SharedElementTransition | null;
  };
  source_ids: string[];
  /** Concise on-screen attribution; full identifiers remain in source_ids/metadata. */
  source_line?: string;
  /** Optional candidate-local opacity for supporting presentation layers. */
  supporting_opacity?: number;
  ai_disclosure: {
    tool: string;
    generated_at: string;
    label: string;
    prompt: string;
    provider?: string;
  } | null;
  review_state: 'draft' | 'storyline-locked' | 'asset-locked' | 'picture-locked' | 'audio-locked' | 'approved';
  review?: {
    status: 'pending' | 'passed' | 'rejected';
    user_pass: boolean;
    approval_marker: string | null;
    notes: string | null;
  };
};

export type ReviewProfile =
  | 'omni-keyframe-input'
  | 'omni-generated-motion'
  | 'remotion-motion'
  | 'source-photo-treatment'
  | 'source-video-selection';

export type CanonicalOperatorId =
  | 'transform.spring@1'
  | 'transform.tween@1'
  | 'opacity.tween@1'
  | 'mask.inset@1'
  | 'svg.stroke-draw@1'
  | 'document.highlight@1'
  | 'chart.reveal@1'
  | 'camera.transform@1'
  | 'grain.overlay@1'
  | 'scene.shared-element@1';

export type SelectiveTreatment = FrameRange & {
  treatment_id: string;
  operator_id: 'grain.overlay@1';
  editorial_intent: string;
  target: {kind: 'background'} | {kind: 'component'; component_id: string};
  params: {
    seed: number;
    opacity: number;
    tile_size_px: number;
    dot_size_px: number;
    color: string;
  };
  implementation_status: 'planned-not-implemented' | 'implemented';
};

export type VisualComponent = {
  component_id: string;
  asset_id: string | null;
  semantic_role: 'primary' | 'supporting' | 'evidence' | 'relationship' | 'emphasis' | 'camera' | 'chart';
  render_kind: 'asset' | 'svg-path' | 'document-highlight' | 'chart' | 'camera';
  compositing: 'independent-layer' | 'procedural-layer';
  motion_expectation: 'independent' | 'static' | 'procedural';
  atomicity: 'single-editable-object' | 'procedural';
  layout?: {left: number; top: number; width: number; height: number};
  svg_path?: string;
  target_component_id?: string;
};

export type VisualBeat = FrameRange & {
  beat_id: string;
  purpose: string;
  component_ids: string[];
  required_capabilities: Array<
    | 'layer-entry'
    | 'layer-transform'
    | 'opacity-change'
    | 'mask-reveal'
    | 'relationship-path'
    | 'document-emphasis'
    | 'chart-reveal'
    | 'camera-reframe'
  >;
};

export type MotionActionV2 = FrameRange & {
  action_id: string;
  editorial_intent: string;
  operator_id: CanonicalOperatorId;
  target_component_id: string;
  params: Record<string, number | string>;
  implementation_status?: 'planned-not-implemented' | 'implemented';
};

export type RuntimeContract = {
  operator_registry: 'video/src/vox/motion/operator-registry.ts';
  scene_renderer: 'video/src/vox/scene/ManifestScene.tsx';
  transition_renderer: 'video/src/vox/scene/TransitionPair.tsx' | null;
  runtime_sha256: string | null;
};

export type ReviewRequirements = {
  generation_input_required: boolean;
  playable_cut_required: boolean;
  full_duration_preview_required: boolean;
  transition_pair_required: boolean;
  review_artifact: string | null;
  review_artifact_sha256: string | null;
};

export type ApprovalRecord = {
  status: 'pending' | 'passed' | 'rejected';
  user_pass: boolean;
  approval_marker: string | null;
  approved_bundle_sha256: string | null;
};

export type CutManifestV2 = Omit<CutManifest, 'schema_version' | 'animations' | 'review' | 'transition'> & {
  schema_version: 2;
  review_profile: ReviewProfile;
  visual_components: VisualComponent[];
  visual_beats: VisualBeat[];
  motion_actions: MotionActionV2[];
  runtime_contract: RuntimeContract;
  review_requirements: ReviewRequirements;
  approvals: {
    generation_input: ApprovalRecord;
    playable_cut: ApprovalRecord;
  };
  asset_origin_policy?: AssetOriginPolicy;
  animations?: [];
  missing_assets?: string[];
  asset_provenance?: Array<{
    asset_id: string;
    derivation: string;
    source_path: string | null;
    generated_at: string | null;
    note: string;
    origin?: 'imagegen-person' | 'real-source' | 'official-source' | 'source-derived' | 'source-backed' | 'deterministic-editorial';
    source_kind?: AssetSourceKind;
    source_id?: string;
    original_url?: string;
    license?: string;
    deterministic?: boolean;
    ai_disclosure?: boolean;
    identity_scope?: 'fictional-generic' | 'named-real-person';
    explanatory_overlay?: boolean;
  }>;
  transition: CutManifest['transition'] & {
    /** @deprecated Render evidence belongs in the authority review ledger. */
    pair_renderer?: 'video/src/vox/scene/TransitionPair.tsx' | null;
    /** @deprecated Render evidence belongs in the authority review ledger. */
    pair_artifact?: string | null;
    /** @deprecated Render evidence belongs in the authority review ledger. */
    pair_artifact_sha256?: string | null;
  };
};

export type PresentationLayoutTemplate = 'experience-hero' | 'document-focus' | 'process-flow' | 'before-after';
export type PresentationState = 'hidden' | 'entering' | 'focused' | 'supporting' | 'exiting' | 'final-summary';
export type PresentationSlot =
  | 'hero'
  | 'echo-1'
  | 'echo-2'
  | 'echo-3'
  | 'overview'
  | 'crop'
  | 'quote'
  | 'provenance'
  | 'support'
  | 'actor-left'
  | 'actor-right'
  | 'request'
  | 'result'
  | 'route-primary'
  | 'route-return'
  | 'comparison-left'
  | 'comparison-right';

export type ComponentVisibilityInterval = FrameRange & {state: Exclude<PresentationState, 'hidden'>};

export type DocumentEvidenceView = {
  evidence_id: string;
  phase: 'overview' | 'crop' | 'quote' | 'provenance';
  source_asset_id: string;
  source_id: string;
  source_label: string;
  verification_status: 'blocked-source-materialization' | 'verified-scoped-derivative' | 'transcription_pending' | 'verified';
  crop_normalized?: {x: number; y: number; width: number; height: number} | null;
  exact_quote?: string | null;
  quote_font_px?: number;
  max_lines?: 1 | 2;
  source_locator?: string | null;
  reviewer?: string | null;
  review_sha256?: string | null;
};

export type PresentationComponent = VisualComponent & {
  asset_requirement_id?: string | null;
  presentation_slot: PresentationSlot;
  visibility_timeline: ComponentVisibilityInterval[];
  document_evidence?: DocumentEvidenceView;
};

export type PresentationBeat = VisualBeat & {
  message: string;
  focal_component_id: string;
  supporting_component_ids: string[];
  hidden_component_ids: string[];
  layout_template: PresentationLayoutTemplate;
  narration_window: FrameRange;
  reading_hold: FrameRange & {minimum_seconds: number};
  document_phase?: 'overview' | 'normalized-crop' | 'exact-retypeset-quote' | null;
  preview_status?: 'blocked-assets-pending' | 'blocked-transcription-pending' | 'ready';
};

export type ProductionAuthoringContractDeclaration = {
  version: 1;
  contract_path: 'video/contracts/production-authoring-contract-v1.json';
  route: 'episode-spec -> generated-manifest-contracts -> active-cut-manifests -> render-catalog -> EpisodeTimeline';
  episode_spec_path: 'video/episodes/episode-001/episode-spec.json';
  episode_spec_sha256: string;
  generated_manifest_contracts_path: 'video/episodes/episode-001/generated/manifest-contracts.json';
  generated_manifest_contracts_sha256: string;
  render_catalog_path: 'video/episodes/episode-001/generated/render-catalog.json';
  cut_contract: {
    shot_id: string;
    source_spec_sha256: string;
    source_cut_sha256: string;
    manifest_contract_sha256: string;
  };
  visual_treatment: {
    surface: string;
    palette: string;
    typography: string;
    texture: string;
    prohibited_treatments: string[];
  };
  motion_contract: {
    target_asset_id: string;
    operator_id: string;
    start_frame: number;
    end_frame: number;
    state_delta: string;
    reading_hold: FrameRange & {minimum_seconds: number};
  };
  source_contract: {
    source_id: string;
    source_kind: string;
    locator: string;
    rights_status: string;
    materialization_status: 'pending' | 'materialized' | 'blocked';
    sha256: string | null;
  };
  coverage_matrix: Record<string, {status: 'planned' | 'implemented' | 'blocked' | 'not-applicable'; evidence: string[]}>;
  production_authority: false;
};

export type ReferenceGrammarTransferBinding = {
  category: 'motion_operator';
  grammar_id: string;
  beat_id: string;
  target_component_id: string;
  action_id: string;
  runtime_operator_id: CanonicalOperatorId;
  episode_source_ids: string[];
  episode_input_bindings: Array<{
    target_component_id: string;
    input_path: string;
    input_sha256: string;
  }>;
  action_frame_range: FrameRange;
  reading_hold: FrameRange & {minimum_frames: 60};
  observable_delta: string;
  status: 'blocked-source-materialization' | 'pending-playable-parity' | 'passed-playable-parity';
};

export type ReferenceGrammarTransfer = {
  version: 1;
  contract_path: 'video/episodes/episode-001/reference-grammar-contract.json';
  contract_sha256: string;
  bindings: ReferenceGrammarTransferBinding[];
  unmapped_visual_grammar: [];
  novel_visual_grammar: [];
  production_authority: false;
};

export type CutManifestV3 = Omit<CutManifestV2, 'schema_version' | 'visual_components' | 'visual_beats'> & {
  schema_version: 3;
  /** v1 is retained for historical manifests; v2 binds explanatory cues to components. */
  presentation_contract_version: 1 | 2;
  source_spec_sha256: string;
  source_cut_sha256: string;
  manifest_contract_sha256: string;
  implementation_status: 'planned-not-implemented' | 'implemented';
  /** New or revised cuts opt into explicit target/screen-space typography transform binding. */
  typography_surface_contract_version?: 1 | 2;
  visual_components: PresentationComponent[];
  visual_beats: PresentationBeat[];
  /** Procedural surface treatments are runtime instructions, not external effect files. */
  treatments?: SelectiveTreatment[];
  mobile_review: {
    width: 360;
    height: 203;
    minimum_quote_font_px_at_1080p: number;
    maximum_quote_lines: 2;
    requires_human_review: true;
  };
  /** Optional for historical manifests; mandatory when a new candidate opts into the sole authoring route. */
  production_authoring_contract?: ProductionAuthoringContractDeclaration;
  /** Optional until a beat selects an approved reference grammar; declarations are fail-closed by the V3 validator. */
  reference_grammar_transfer?: ReferenceGrammarTransfer;
};

// Inactive v06 style-calibration manifests predate the episode-spec hash binding.
// They remain readable as historical review inputs, but production validators never
// accept this compatibility shape as an active CutManifestV3.
export type HistoricalCutManifestV3 = Omit<CutManifestV3,
  'source_spec_sha256' | 'source_cut_sha256' | 'manifest_contract_sha256' | 'implementation_status' | 'visual_components'> & {
  source_spec_sha256?: string;
  source_cut_sha256?: string;
  manifest_contract_sha256?: string;
  implementation_status?: 'planned-not-implemented' | 'implemented';
  visual_components: Array<Omit<PresentationComponent, 'document_evidence'> & {
    document_evidence?: Omit<DocumentEvidenceView, 'verification_status'> & {verification_status?: DocumentEvidenceView['verification_status']};
  }>;
};

export type AnyCutManifest = CutManifest | CutManifestV2 | CutManifestV3 | HistoricalCutManifestV3;

export const isCutManifestV2 = (manifest: AnyCutManifest): manifest is CutManifestV2 => manifest.schema_version === 2;
export const isCutManifestV3 = (manifest: AnyCutManifest): manifest is CutManifestV3 => manifest.schema_version === 3
  && typeof manifest.source_spec_sha256 === 'string'
  && typeof manifest.source_cut_sha256 === 'string'
  && typeof manifest.manifest_contract_sha256 === 'string'
  && typeof manifest.implementation_status === 'string';
