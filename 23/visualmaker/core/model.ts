/** Client-safe VisualMaker domain contract. Keep runtime implementation in director.ts. */

export type SegmentKind = 'narration' | 'note' | 'reference';
export type BeatRole = 'context' | 'action' | 'comparison' | 'process' | 'evidence' | 'fiction';
export type ClaimReview = 'pending' | 'not-applicable';
export type CandidateMode = 'source-photo' | 'source-video' | 'remotion' | 'omni';
export type LayerRole = 'focal' | 'supporting' | 'chrome';
export type Effort = 'low' | 'medium' | 'high';
export type RequirementMediaType = 'image' | 'video' | 'data';
export type RequirementAcquisition = 'external' | 'official' | 'generated-keyframe';
export type EpistemicRole = 'evidence' | 'context' | 'illustration';
export type ReviewStatus = 'draft' | 'direction-selected';

export type ScriptHistoryEntry = {
  id: string;
  rawText: string;
  rawSha256: string;
};

export type Segment = {
  id: string;
  /** Unicode code point offsets into script.rawText, half-open. */
  start: number;
  end: number;
  text: string;
  kind: SegmentKind;
};

export type Script = {
  id: string;
  rawText: string;
  rawSha256: string;
  segments: Segment[];
  history: ScriptHistoryEntry[];
};

export type Beat = {
  id: string;
  segmentIds: string[];
  intent: string;
  role: BeatRole;
  claimReview: ClaimReview;
};

export type Layer = {
  id: string;
  role: LayerRole;
  description: string;
  requirementId: string | null;
};

export type Candidate = {
  id: string;
  label: string;
  mode: CandidateMode;
  reason: string;
  rejectedModes: string[];
  startState: string;
  change: string;
  endState: string;
  requirementIds: string[];
  layers: Layer[];
  effort: Effort;
  effortBasis: string;
  reuseFromSceneId: string | null;
  reuseReason: string;
  provider: 'local-rules' | 'episode-import' | 'user';
  grammarStatus: 'unverified';
};

export type Requirement = {
  id: string;
  description: string;
  mediaType: RequirementMediaType;
  acquisition: RequirementAcquisition;
  epistemicRole: EpistemicRole;
  queryKo: string;
  queryEn: string;
  sourceConstraint: string;
  assetId: string | null;
};

export type Asset = {
  id: string;
  originalName: string;
  mediaType: RequirementMediaType;
  path: string;
  sha256: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  sourceUrl: string;
  creator: string;
  rightsNote: string;
  semanticNote: string;
  status: 'pending-review';
  evidenceOnly: boolean;
};

export type Scene = {
  id: string;
  beatIds: string[];
  originCutIds?: string[];
  candidates: Candidate[];
  selectedCandidateId: string | null;
  locked: boolean;
  estimatedSeconds: number;
  timingStatus: 'estimated';
  reviewStatus: ReviewStatus;
};

export type PlanOrigin = {
  kind: 'episode-spec';
  path: string;
  sha256: string;
};

export type PlanDecision = {
  id: string;
  kind: string;
  value: string;
  rationale: string;
};

export type Decision = PlanDecision;

export type Plan = {
  schemaVersion: 'visualmaker-plan-v1';
  id: string;
  title: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  productionAuthority: false;
  script: Script;
  beats: Beat[];
  scenes: Scene[];
  requirements: Requirement[];
  assets: Asset[];
  decisions: PlanDecision[];
  origin?: PlanOrigin;
};

export type Command =
  | { type: 'select'; sceneId: string; candidateId: string }
  | { type: 'lock'; sceneId: string; locked: boolean }
  | { type: 'edit-candidate'; sceneId: string; candidateId: string; changes: Partial<Pick<Candidate, 'label' | 'reason' | 'startState' | 'change' | 'endState'>> }
  | { type: 'edit-beat'; beatId: string; intent: string; role: BeatRole }
  | { type: 'regenerate'; sceneId: string; simplify?: boolean }
  | { type: 'reuse'; sceneId: string; fromSceneId: string; reason: string }
  | { type: 'revise-script'; text: string }
  | { type: 'merge-next'; sceneId: string }
  | { type: 'attach-asset'; requirementId: string; asset: Asset };

/** Stable UI labels. They are deliberately descriptive rather than template names. */
export const labels = {
  segmentKind: { narration: '내레이션', note: '연출 메모', reference: '참고' },
  beatRole: { context: '맥락', action: '행동', comparison: '비교', process: '과정', evidence: '근거', fiction: '허구적 연속성' },
  mode: { 'source-photo': '실사 사진', 'source-video': '실사 영상', remotion: '설명 그래픽', omni: '허구 연속성' },
  status: { 'pending-review': '검토 대기', draft: '초안', 'direction-selected': '방향 선택' },
} as const;

export const segmentKindLabels = labels.segmentKind;
export const roleLabels = labels.beatRole;
export const modeLabels = labels.mode;
export const LABELS = labels;

export const PLAN_SCHEMA_VERSION = 'visualmaker-plan-v1' as const;
