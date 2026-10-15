import { createHash, randomUUID } from 'node:crypto';
import type {
  Asset,
  AIAnalysisAdoption,
  Beat,
  BeatRole,
  Candidate,
  CandidateMode,
  Command,
  Effort,
  Layer,
  NarrationTake,
  NarrationTiming,
  NarrationTimingSegment,
  Plan,
  PlanDecision,
  Requirement,
  RequirementMediaType,
  Scene,
  Segment,
  SegmentKind,
  SourceReview,
} from './model.ts';
import { PLAN_SCHEMA_VERSION } from './model.ts';
import {appendReview, reconcileReviews, REVIEW_DIMENSIONS, reviewStates} from './source-review.ts';
export {reviewStates} from './source-review.ts';

type Status = 400 | 409 | 423;

export class ContractError extends Error {
  readonly status: Status;

  constructor(message: string, status: Status = 400) {
    super(message);
    this.name = 'ContractError';
    this.status = status;
  }
}

const MAX_TEXT = 100_000;
const MAX_ITEMS = 2_000;
const HASH = /^[a-f0-9]{64}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T/u;
export const KOREAN_COMPACT_CHARS_PER_SECOND = 4.965;

function fail(message: string, status: Status = 400): never {
  throw new ContractError(message, status);
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('plan must be an object');
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail('plan object must be plain');
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, max = 20_000): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) fail(`${field} must be a bounded non-empty string`);
  return value;
}

function optionalText(value: unknown, field: string, max = 20_000): string {
  if (typeof value !== 'string' || value.length > max) fail(`${field} must be a bounded string`);
  return value;
}

function arr(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) fail(`${field} must be a bounded array`);
  return value;
}

function oneOf<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) fail(`${field} has an invalid value`);
  return value as T;
}

function id(value: unknown, field: string): string {
  return text(value, field, 200);
}

function sha(value: unknown, field: string): string {
  if (typeof value !== 'string' || !HASH.test(value)) fail(`${field} must be a lowercase SHA-256`);
  return value;
}

function finiteNumber(value: unknown, field: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) fail(`${field} must be a finite number`);
  return value;
}

function nullableNumber(value: unknown, field: string, minimum = 0): number | null {
  if (value === null) return null;
  return finiteNumber(value, field, minimum);
}

function assertUnique(values: string[], field: string): void {
  if (new Set(values).size !== values.length) fail(`${field} contains duplicate IDs`);
}

function hashText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function codePoints(value: string): string[] {
  return Array.from(value);
}

export function estimateNarrationSeconds(narrationText: string): number {
  const compactLength = codePoints(narrationText.replace(/\s+/gu, '')).length;
  return Math.max(2, compactLength / KOREAN_COMPACT_CHARS_PER_SECOND);
}

function sourceIndex(textValue: string, codePointOffset: number): number {
  return Array.from(textValue).slice(0, codePointOffset).join('').length;
}

function classify(line: string): SegmentKind {
  if (/^\s*(?:\[\s*(?:note|director(?:['’]s)?\s*note|연출|메모)\s*\]|(?:note|director(?:['’]s)?\s*note|연출|메모)\s*[:：-])/iu.test(line)) return 'note';
  if (/^\s*(?:\[\s*(?:reference|ref|참고|출처)\s*\]|(?:reference|ref|참고|출처)\s*[:：-])/iu.test(line) || /^\s*https?:\/\/\S+\s*$/iu.test(line)) return 'reference';
  return 'narration';
}

function parseSegments(rawText: string, old?: Segment[]): Segment[] {
  const result: Segment[] = [];
  const oldByKey = new Map<string, Segment[]>();
  const oldAtIndex = old ?? [];
  const newLines: Array<{ original: string; trimmed: string; matchIndex: number }> = [];
  const lines = /[^\r\n]+/gu;
  let lineMatch: RegExpExecArray | null;
  while ((lineMatch = lines.exec(rawText)) !== null) {
    const trimmed = lineMatch[0].trim();
    if (trimmed) newLines.push({ original: lineMatch[0], trimmed, matchIndex: lineMatch.index });
  }
  const newKeys = new Set(newLines.map((line) => `${classify(line.trimmed)}\u0000${line.trimmed}`));
  const usedIds = new Set<string>();
  const reservedOldIds = new Set(oldAtIndex.map((previous) => previous.id));
  for (const previous of oldAtIndex) {
    const key = `${previous.kind}\u0000${previous.text}`;
    const list = oldByKey.get(key) ?? [];
    list.push(previous);
    oldByKey.set(key, list);
  }
  let index = 0;
  for (const line of newLines) {
    const original = line.original;
    const trimmed = original.trim();
    const leading = original.indexOf(trimmed);
    const startCodePoint = Array.from(rawText.slice(0, line.matchIndex + leading)).length;
    const endCodePoint = startCodePoint + Array.from(trimmed).length;
    const kind = classify(trimmed);
    const key = `${kind}\u0000${trimmed}`;
    const matchingOld = oldByKey.get(key);
    const reusableIndex = matchingOld?.findIndex((previous) => !usedIds.has(previous.id)) ?? -1;
    const reused = reusableIndex >= 0 ? matchingOld?.splice(reusableIndex, 1)[0] : undefined;
    const positional = oldAtIndex[index];
    let segmentId = reused?.id;
    if (segmentId === undefined && positional && positional.kind === kind && !newKeys.has(`${kind}\u0000${positional.text}`) && !usedIds.has(positional.id)) segmentId = positional.id;
    if (segmentId === undefined) {
      let serial = index + 1;
      segmentId = `segment-${serial}`;
      while (usedIds.has(segmentId) || reservedOldIds.has(segmentId)) { serial += 1; segmentId = `segment-${serial}`; }
    }
    usedIds.add(segmentId);
    result.push({ id: segmentId, start: startCodePoint, end: endCodePoint, text: trimmed, kind });
    index += 1;
  }
  return result;
}

function inferRole(value: string): BeatRole {
  if (/\b(?:fiction(?:al)?|omni)\b|상상(?:의)?\s*(?:장면|사례)|가상(?:의)?\s*(?:사례|장면)|허구|카툰|애니메이션/iu.test(value)) return 'fiction';
  if (/비교|대비|전후|차이|보다|각각|서로|vs\.?|법.{0,12}(?:기간|년|개월|일)|(?:기간|년|개월|일).{0,12}법/iu.test(value)) return 'comparison';
  if (/먼저|다음|이후|과정|단계|절차|진행|순서|그리고/iu.test(value)) return 'process';
  if (/법|판결|조항|근거|자료|통계|수치|\d[\d,.]*\s*(?:%|년|개월|일|원|명|건)?/iu.test(value)) return 'evidence';
  if (/걷|달리|쓰|말하|움직|만들|방문|잡|확인|누르|열|엽|닫|이동|촬영/iu.test(value)) return 'action';
  return 'context';
}

function inferMode(value: string, role: BeatRole): CandidateMode {
  if (role === 'fiction') return 'omni';
  if (role === 'comparison') return 'remotion';
  if (role === 'process') return /걷|달리|쓰|말하|움직|만들|방문|잡|확인|누르|열|엽|닫|이동|촬영|모으|수집|정리/iu.test(value) ? 'source-video' : 'remotion';
  if (role === 'action') return 'source-video';
  return 'source-photo';
}

function queryFor(value: string, mode: CandidateMode, language: 'ko' | 'en'): string {
  const compact = value.replace(/^\s*(?:\[?[^\]]+\]?\s*[:：-])\s*/u, '').trim();
  if (language === 'en') return '';
  if (language === 'ko') {
    const suffix = mode === 'source-video' ? ' 실제 행동 장면' : mode === 'remotion' ? ' 조건 비교 자료' : mode === 'omni' ? ' 비인물 장면 참고' : ' 대상과 맥락';
    return `${compact}${suffix}`.slice(0, 500);
  }
  const suffix = mode === 'source-video' ? ' real action footage' : mode === 'remotion' ? ' exact comparison data' : mode === 'omni' ? ' non-person scene reference' : ' subject and context';
  return `${compact}${suffix}`.slice(0, 500);
}

function requirementFor(sceneId: string, candidateNumber: number, value: string, mode: CandidateMode, role: BeatRole, suffix = ''): Requirement[] {
  const visual: Requirement = { id: `${sceneId}-requirement-${candidateNumber}-visual${suffix}`, description: mode === 'source-video' ? `내레이션의 실제 행동을 보여 주는 영상: ${value}` : mode === 'omni' ? `허구적 연속성을 위한 비인물 장면 재구성의 근거: ${value}` : `내레이션의 대상과 맥락을 보여 주는 이미지: ${value}`, mediaType: mode === 'source-video' ? 'video' : 'image', acquisition: mode === 'omni' ? 'generated-keyframe' : 'external', epistemicRole: mode === 'omni' ? 'illustration' : 'context', queryKo: queryFor(value, mode, 'ko'), queryEn: queryFor(value, mode, 'en'), sourceConstraint: mode === 'omni' ? '실명 인물이나 읽을 수 있는 문구를 포함하지 않는 비인물 재구성' : mode === 'source-video' ? '설명한 행동·대상·장소가 실제로 확인되는 원본' : '설명한 대상과 맥락이 확인되는 원본', assetId: null };
  if (mode !== 'remotion') return [visual];
  const evidence: Requirement = { id: `${sceneId}-requirement-${candidateNumber}-evidence${suffix}`, description: `내레이션의 정확한 조건·관계를 확인할 공식 자료: ${value}`, mediaType: 'data', acquisition: 'official', epistemicRole: 'evidence', queryKo: queryFor(value, mode, 'ko'), queryEn: '', sourceConstraint: '수치·기간·법률 조건은 원문과 대조 가능한 공식 출처가 필요하며 화면 밖에서 확인함', assetId: null };
  return [visual, evidence];
}

function makeCandidate(sceneId: string, value: string, role: BeatRole, number: number, simplify = false, suffix = '', forcedMode?: CandidateMode): { candidate: Candidate; requirements: Requirement[] } {
  const mode = forcedMode ?? inferMode(value, role);
  const requirements = requirementFor(sceneId, number, value, mode, role, suffix);
  const focalRequirement = requirements[0];
  const labels = mode === 'source-video' ? ['행동 원본', '행동 맥락'] : mode === 'remotion' ? ['조건 도식', '조건 흐름'] : mode === 'omni' ? ['연속성 장면', '비인물 비유'] : ['대상 원본', '맥락 원본'];
  const label = labels[number - 1] ?? labels[0];
  const candidate: Candidate = {
    id: `${sceneId}-candidate-${number}${simplify ? '-simple' : ''}${suffix}`,
    label,
    mode,
    reason: number === 1 ? `핵심 의미를 ${mode === 'remotion' ? '정확한 관계와 조건' : '관찰 가능한 화면'}으로 전달한다.` : `같은 의미를 ${mode === 'remotion' ? '다른 읽기 순서' : '다른 시점'}로 보여 주어 비교할 수 있다.`,
    rejectedModes: mode === 'omni' ? ['source-photo: 실명 인물·실제 사건의 대체가 될 수 없음', 'source-video: 허구적 연속성을 보장하지 않음', 'remotion: 장면의 허구적 관계를 직접 보여주지 않음'] : [`omni: 명시적 허구 연속성 표지가 없음`],
    startState: number === 1 ? `화면에 ${value}의 대상이 나타나지 않은 상태` : `핵심 대상만 먼저 보이고 관계는 아직 닫힌 상태: ${value}`,
    change: mode === 'remotion' ? (number === 1 ? '관련 조건과 관계를 순서대로 드러낸다.' : '관계의 결과를 먼저 보여 준 뒤 근거 조건을 연결한다.') : mode === 'source-video' ? (number === 1 ? '설명한 행동이 실제로 시작된다.' : '행동의 결과와 주변 맥락을 이어 보여 준다.') : mode === 'omni' ? (number === 1 ? '비인물 장면의 핵심 관계가 이어진다.' : '비인물 장면의 원인과 결과를 순차적으로 연결한다.') : (number === 1 ? '설명한 대상과 맥락을 함께 드러낸다.' : '대상을 먼저 고정한 뒤 맥락을 덧붙인다.'),
    endState: number === 1 ? '내레이션의 핵심 의미가 읽히고 다음 장면으로 넘길 수 있는 상태' : '핵심 관계를 확인한 뒤 다음 설명으로 넘어갈 수 있는 상태',
    requirementIds: requirements.map((requirement) => requirement.id),
    layers: [
      { id: `${sceneId}-candidate-${number}-focal${suffix}`, role: 'focal', description: focalRequirement.description, requirementId: focalRequirement.id },
    ],
    effort: mode === 'omni' || mode === 'remotion' ? 'high' : mode === 'source-video' ? 'medium' : 'low',
    effortBasis: mode === 'source-video' ? '행동이 맞는 원본을 찾고 구간을 확인해야 함' : mode === 'remotion' ? '공식 자료의 조건을 대조하고 설명 화면을 구성해야 함' : mode === 'omni' ? '근거에 맞는 비인물 재구성과 의미 검토가 필요함' : '대상을 확인할 원본과 이용 조건을 검토해야 함',
    reuseFromSceneId: null,
    reuseReason: '',
    provider: 'local-rules',
    grammarStatus: 'unverified',
  };
  return { candidate, requirements };
}

function makeBeatAndScene(segment: Segment, index: number, simplify = false): { beat: Beat; scene: Scene; requirements: Requirement[] } {
  const role = inferRole(segment.text);
  const beat: Beat = { id: `beat-${index + 1}`, segmentIds: [segment.id], intent: `시청자가 기억할 핵심: ${segment.text}`, role, claimReview: role === 'evidence' || role === 'comparison' ? 'pending' : 'not-applicable' };
  const sceneId = `scene-${index + 1}`;
  const first = makeCandidate(sceneId, segment.text, role, 1, simplify);
  const second = makeCandidate(sceneId, segment.text, role, 2, simplify);
  const scene: Scene = { id: sceneId, beatIds: [beat.id], candidates: [first.candidate, second.candidate], selectedCandidateId: null, locked: false, estimatedSeconds: estimateNarrationSeconds(segment.text), timingStatus: 'estimated', reviewStatus: 'draft' };
  return { beat, scene, requirements: [...first.requirements, ...second.requirements] };
}

function makeDraftScene(sceneId: string, beatIds: string[], meaning: string, role: BeatRole, suffix = '', forcedMode?: CandidateMode, narrationText = meaning): { scene: Scene; requirements: Requirement[] } {
  const first = makeCandidate(sceneId, meaning, role, 1, false, suffix, forcedMode);
  const second = makeCandidate(sceneId, meaning, role, 2, false, suffix, forcedMode);
  return {
    scene: { id: sceneId, beatIds, candidates: [first.candidate, second.candidate], selectedCandidateId: null, locked: false, estimatedSeconds: estimateNarrationSeconds(narrationText), timingStatus: 'estimated', reviewStatus: 'draft' },
    requirements: [...first.requirements, ...second.requirements],
  };
}

function now(): string {
  return new Date().toISOString();
}

export function createPlan(title: string, rawText: string): Plan {
  if (typeof title !== 'string' || !title.trim() || title.length > 200) fail('title must be a bounded non-empty string');
  if (typeof rawText !== 'string' || !rawText.trim() || rawText.length > MAX_TEXT) fail('text must be a bounded non-empty string');
  const segments = parseSegments(rawText);
  const beats: Beat[] = [];
  const scenes: Scene[] = [];
  const requirements: Requirement[] = [];
  let narrationIndex = 0;
  for (const segment of segments) {
    if (segment.kind !== 'narration') continue;
    const made = makeBeatAndScene(segment, narrationIndex);
    narrationIndex += 1;
    beats.push(made.beat);
    scenes.push(made.scene);
    requirements.push(...made.requirements);
  }
  if (!segments.length || !beats.length) fail('text must contain at least one narration paragraph');
  const timestamp = now();
  const plan: Plan = {
    schemaVersion: PLAN_SCHEMA_VERSION,
    id: `plan-${randomUUID()}`,
    title: title.trim(),
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    productionAuthority: false,
    script: { id: `script-${randomUUID()}`, rawText, rawSha256: hashText(rawText), segments, history: [] },
    beats,
    scenes,
    requirements,
    assets: [],
    decisions: [],
  };
  return validatePlan(plan);
}

function forbiddenApprovalKeys(value: unknown, path = 'plan'): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) forbiddenApprovalKeys(item, `${path}[${index}]`);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/^(?:approval|approved|productionReady|sourceReady|renderAuthority|readyFor|published|finalized)$/iu.test(key)) fail(`${path}.${key} is not part of the draft contract`);
    forbiddenApprovalKeys(item, `${path}.${key}`);
  }
}

function validateSegment(value: unknown, index: number, rawText: string): Segment {
  const row = object(value);
  const result: Segment = { id: id(row.id, `segments[${index}].id`), start: finiteNumber(row.start, `segments[${index}].start`), end: finiteNumber(row.end, `segments[${index}].end`), text: text(row.text, `segments[${index}].text`), kind: oneOf(row.kind, ['narration', 'note', 'reference'] as const, `segments[${index}].kind`) };
  if (!Number.isInteger(result.start) || !Number.isInteger(result.end) || result.end <= result.start) fail(`segments[${index}] has an invalid span`);
  const cps = codePoints(rawText);
  if (result.end > cps.length || cps.slice(result.start, result.end).join('') !== result.text) fail(`segments[${index}] text does not match its Unicode span`);
  if (!/\S/u.test(result.text)) fail(`segments[${index}] cannot be whitespace`);
  return result;
}

function validateHistory(value: unknown, index: number): { id: string; rawText: string; rawSha256: string } {
  const row = object(value);
  const rawText = optionalText(row.rawText, `script.history[${index}].rawText`, MAX_TEXT);
  if (!rawText) fail(`script.history[${index}].rawText must not be empty`);
  const result = { id: id(row.id, `script.history[${index}].id`), rawText, rawSha256: sha(row.rawSha256, `script.history[${index}].rawSha256`) };
  if (hashText(result.rawText) !== result.rawSha256) fail(`script.history[${index}] hash mismatch`);
  return result;
}

function validateAsset(value: unknown, index: number): Asset {
  const row = object(value);
  const result: Asset = {
    id: id(row.id, `assets[${index}].id`), originalName: text(row.originalName, `assets[${index}].originalName`, 500), mediaType: oneOf(row.mediaType, ['image', 'video', 'data'] as const, `assets[${index}].mediaType`), path: text(row.path, `assets[${index}].path`, 4_000), sha256: sha(row.sha256, `assets[${index}].sha256`), mimeType: text(row.mimeType, `assets[${index}].mimeType`, 200), width: nullableNumber(row.width, `assets[${index}].width`), height: nullableNumber(row.height, `assets[${index}].height`), durationSeconds: nullableNumber(row.durationSeconds, `assets[${index}].durationSeconds`), sourceUrl: optionalText(row.sourceUrl, `assets[${index}].sourceUrl`, 4_000), creator: optionalText(row.creator, `assets[${index}].creator`, 500), rightsNote: optionalText(row.rightsNote, `assets[${index}].rightsNote`, 10_000), semanticNote: optionalText(row.semanticNote, `assets[${index}].semanticNote`, 10_000), status: oneOf(row.status, ['pending-review'] as const, `assets[${index}].status`), evidenceOnly: row.evidenceOnly as boolean,
  };
  if (typeof row.evidenceOnly !== 'boolean') fail(`assets[${index}].evidenceOnly must be boolean`);
  return result;
}

function validateRequirement(value: unknown, index: number): Requirement {
  const row = object(value);
  return { id: id(row.id, `requirements[${index}].id`), description: text(row.description, `requirements[${index}].description`), mediaType: oneOf(row.mediaType, ['image', 'video', 'data'] as const, `requirements[${index}].mediaType`), acquisition: oneOf(row.acquisition, ['external', 'official', 'generated-keyframe'] as const, `requirements[${index}].acquisition`), epistemicRole: oneOf(row.epistemicRole, ['evidence', 'context', 'illustration'] as const, `requirements[${index}].epistemicRole`), queryKo: optionalText(row.queryKo, `requirements[${index}].queryKo`, 500), queryEn: optionalText(row.queryEn, `requirements[${index}].queryEn`, 500), sourceConstraint: text(row.sourceConstraint, `requirements[${index}].sourceConstraint`, 2_000), assetId: row.assetId === null ? null : id(row.assetId, `requirements[${index}].assetId`) };
}

function validateCandidate(value: unknown, sceneId: string, index: number): Candidate {
  const row = object(value);
  const layers = arr(row.layers, `scenes[].candidates[${index}].layers`).map((layer, layerIndex) => {
    const item = object(layer);
    return { id: id(item.id, `layers[${layerIndex}].id`), role: oneOf(item.role, ['focal', 'supporting', 'chrome'] as const, `layers[${layerIndex}].role`), description: text(item.description, `layers[${layerIndex}].description`), requirementId: item.requirementId === null ? null : id(item.requirementId, `layers[${layerIndex}].requirementId`) } satisfies Layer;
  });
  assertUnique(layers.map((item) => item.id), `candidate ${String(row.id)} layers`);
  if (layers.filter((item) => item.role === 'focal').length !== 1) fail(`candidate ${String(row.id)} must have exactly one focal layer`);
  const candidate: Candidate = { id: id(row.id, `${sceneId}.candidates[${index}].id`), label: text(row.label, `${sceneId}.candidates[${index}].label`, 500), mode: oneOf(row.mode, ['source-photo', 'source-video', 'remotion', 'omni'] as const, `${sceneId}.candidates[${index}].mode`), reason: text(row.reason, `${sceneId}.candidates[${index}].reason`), rejectedModes: arr(row.rejectedModes, `${sceneId}.candidates[${index}].rejectedModes`).map((item, i) => text(item, `rejectedModes[${i}]`, 200)), startState: text(row.startState, `${sceneId}.candidates[${index}].startState`), change: text(row.change, `${sceneId}.candidates[${index}].change`), endState: text(row.endState, `${sceneId}.candidates[${index}].endState`), requirementIds: arr(row.requirementIds, `${sceneId}.candidates[${index}].requirementIds`).map((item, i) => id(item, `requirementIds[${i}]`)), layers, effort: oneOf(row.effort, ['low', 'medium', 'high'] as const, `${sceneId}.candidates[${index}].effort`), effortBasis: text(row.effortBasis, `${sceneId}.candidates[${index}].effortBasis`), reuseFromSceneId: row.reuseFromSceneId === null ? null : id(row.reuseFromSceneId, `${sceneId}.candidates[${index}].reuseFromSceneId`), reuseReason: optionalText(row.reuseReason, `${sceneId}.candidates[${index}].reuseReason`), provider: oneOf(row.provider, ['local-rules', 'episode-import', 'user'] as const, `${sceneId}.candidates[${index}].provider`), grammarStatus: oneOf(row.grammarStatus, ['unverified'] as const, `${sceneId}.candidates[${index}].grammarStatus`) };
  assertUnique(candidate.requirementIds, `${candidate.id} requirements`);
  if (candidate.rejectedModes.includes(candidate.mode)) fail(`${candidate.id} rejects its own mode`);
  for (const layer of candidate.layers) if (layer.requirementId !== null && !candidate.requirementIds.includes(layer.requirementId)) fail(`${candidate.id} layer references an unlisted requirement`);
  return candidate;
}

export function validatePlan(value: unknown): Plan {
  forbiddenApprovalKeys(value);
  const row = object(value);
  if (row.schemaVersion !== PLAN_SCHEMA_VERSION) fail('unsupported plan schema');
  if (row.productionAuthority !== false) fail('production authority must remain false');
  const scriptRow = object(row.script);
  const rawText = optionalText(scriptRow.rawText, 'script.rawText', MAX_TEXT);
  if (!rawText) fail('script.rawText must not be empty');
  const segments = arr(scriptRow.segments, 'script.segments').map((item, index) => validateSegment(item, index, rawText));
  assertUnique(segments.map((item) => item.id), 'segments');
  for (let i = 1; i < segments.length; i += 1) if (segments[i - 1].start >= segments[i].start) fail('segments must be ordered and non-overlapping');
  const covered = new Set<number>();
  const rawCodePoints = codePoints(rawText);
  for (const segment of segments) for (let point = segment.start; point < segment.end; point += 1) if (/\S/u.test(rawCodePoints[point])) {
    if (covered.has(point)) fail('segment spans overlap on non-whitespace text');
    covered.add(point);
  }
  for (let point = 0; point < rawCodePoints.length; point += 1) if (/\S/u.test(rawCodePoints[point]) && !covered.has(point)) fail('segments do not provide exact non-whitespace coverage');
  const history = arr(scriptRow.history, 'script.history').map(validateHistory);
  assertUnique(history.map((item) => item.id), 'script.history');
  const script = { id: id(scriptRow.id, 'script.id'), rawText, rawSha256: sha(scriptRow.rawSha256, 'script.rawSha256'), segments, history };
  if (hashText(rawText) !== script.rawSha256) fail('script hash mismatch');
  const beats = arr(row.beats, 'beats').map((item, index) => {
    const beatRow = object(item);
    const beat: Beat = { id: id(beatRow.id, `beats[${index}].id`), segmentIds: arr(beatRow.segmentIds, `beats[${index}].segmentIds`).map((ref, i) => id(ref, `beats[${index}].segmentIds[${i}]`)), intent: text(beatRow.intent, `beats[${index}].intent`), role: oneOf(beatRow.role, ['context', 'action', 'comparison', 'process', 'evidence', 'fiction'] as const, `beats[${index}].role`), claimReview: oneOf(beatRow.claimReview, ['pending', 'not-applicable'] as const, `beats[${index}].claimReview`) };
    if (!beat.segmentIds.length) fail(`${beat.id} must reference a segment`);
    return beat;
  });
  assertUnique(beats.map((item) => item.id), 'beats');
  const segmentIds = new Set(segments.map((item) => item.id));
  const beatSegmentRefs = beats.flatMap((item) => item.segmentIds);
  for (const ref of beatSegmentRefs) if (!segmentIds.has(ref)) fail(`beat references unknown segment ${ref}`, 409);
  assertUnique(beatSegmentRefs, 'beat segment references');
  const requirements = arr(row.requirements, 'requirements').map(validateRequirement);
  assertUnique(requirements.map((item) => item.id), 'requirements');
  const assets = arr(row.assets, 'assets').map(validateAsset);
  assertUnique(assets.map((item) => item.id), 'assets');
  if (new Set(assets.map((item) => item.sha256)).size !== assets.length || new Set(assets.map((item) => item.path)).size !== assets.length) fail('assets contain duplicate file identity');
  const assetsById = new Map(assets.map((item) => [item.id, item]));
  for (const requirement of requirements) if (requirement.assetId !== null) {
    const asset = assetsById.get(requirement.assetId);
    if (!asset) fail(`requirement references unknown asset ${requirement.assetId}`, 409);
    if (asset.mediaType !== requirement.mediaType) fail(`requirement ${requirement.id} and asset ${asset.id} media types differ`, 409);
  }
  const scenes = arr(row.scenes, 'scenes').map((item, index) => {
    const sceneRow = object(item);
    const candidates = arr(sceneRow.candidates, `scenes[${index}].candidates`).map((candidate, candidateIndex) => validateCandidate(candidate, String(sceneRow.id), candidateIndex));
    if (!candidates.length) fail(`scenes[${index}] must have a candidate`);
    const originCutIds = sceneRow.originCutIds === undefined ? undefined : arr(sceneRow.originCutIds, `scenes[${index}].originCutIds`).map((ref, originIndex) => id(ref, `scenes[${index}].originCutIds[${originIndex}]`));
    if (originCutIds) assertUnique(originCutIds, `scenes[${index}].originCutIds`);
    const scene: Scene = { id: id(sceneRow.id, `scenes[${index}].id`), beatIds: arr(sceneRow.beatIds, `scenes[${index}].beatIds`).map((ref, i) => id(ref, `scenes[${index}].beatIds[${i}]`)), ...(originCutIds ? { originCutIds } : {}), candidates, selectedCandidateId: sceneRow.selectedCandidateId === null ? null : id(sceneRow.selectedCandidateId, `scenes[${index}].selectedCandidateId`), locked: sceneRow.locked as boolean, estimatedSeconds: finiteNumber(sceneRow.estimatedSeconds, `scenes[${index}].estimatedSeconds`, 0.01), timingStatus: oneOf(sceneRow.timingStatus, ['estimated'] as const, `scenes[${index}].timingStatus`), reviewStatus: oneOf(sceneRow.reviewStatus, ['draft', 'direction-selected'] as const, `scenes[${index}].reviewStatus`) };
    if (typeof sceneRow.locked !== 'boolean') fail(`scenes[${index}].locked must be boolean`);
    if (!scene.beatIds.length) fail(`${scene.id} must reference a beat`);
    if (scene.selectedCandidateId !== null && !candidates.some((candidate) => candidate.id === scene.selectedCandidateId)) fail(`${scene.id} selects an unknown candidate`, 409);
    if ((scene.selectedCandidateId === null) !== (scene.reviewStatus === 'draft')) fail(`${scene.id} review status disagrees with selection`);
    return scene;
  });
  assertUnique(scenes.map((item) => item.id), 'scenes');
  const beatIds = new Set(beats.map((item) => item.id));
  const sceneBeatRefs = scenes.flatMap((item) => item.beatIds);
  for (const ref of sceneBeatRefs) if (!beatIds.has(ref)) fail(`scene references unknown beat ${ref}`, 409);
  assertUnique(sceneBeatRefs, 'scene beat references');
  if (sceneBeatRefs.length !== beats.length) fail('every beat must belong to exactly one scene');
  const candidateIds: string[] = [];
  const layerIds: string[] = [];
  for (const scene of scenes) for (const candidate of scene.candidates) {
    candidateIds.push(candidate.id);
    layerIds.push(...candidate.layers.map((item) => item.id));
    for (const ref of candidate.requirementIds) if (!requirements.some((item) => item.id === ref)) fail(`candidate ${candidate.id} references unknown requirement ${ref}`, 409);
  }
  const focalRequirementIds = new Set(scenes.flatMap((scene) => scene.candidates.flatMap((candidate) => candidate.layers.filter((layer) => layer.role === 'focal' && layer.requirementId !== null).map((layer) => layer.requirementId as string))));
  for (const requirement of requirements) if (requirement.assetId !== null && focalRequirementIds.has(requirement.id) && assetsById.get(requirement.assetId)?.evidenceOnly) fail(`evidence-only asset cannot fulfill focal requirement ${requirement.id}`, 409);
  assertUnique(candidateIds, 'candidates');
  assertUnique(layerIds, 'layers');
  const decisions = arr(row.decisions, 'decisions').map((item, index) => {
    const decision = object(item);
    return { id: id(decision.id, `decisions[${index}].id`), kind: text(decision.kind, `decisions[${index}].kind`, 200), value: text(decision.value, `decisions[${index}].value`), rationale: text(decision.rationale, `decisions[${index}].rationale`) } satisfies PlanDecision;
  });
  assertUnique(decisions.map((item) => item.id), 'decisions');
  const plan: Plan = { schemaVersion: PLAN_SCHEMA_VERSION, id: id(row.id, 'id'), title: text(row.title, 'title', 200), revision: finiteNumber(row.revision, 'revision', 1), createdAt: text(row.createdAt, 'createdAt', 100), updatedAt: text(row.updatedAt, 'updatedAt', 100), productionAuthority: false, script, beats, scenes, requirements, assets, decisions };
  if (row.sourceReviews !== undefined) {
    plan.sourceReviews = arr(row.sourceReviews, 'sourceReviews').map((value, index): SourceReview => {
      const item = object(value);
      const review: SourceReview = {id: id(item.id, `sourceReviews[${index}].id`), requirementId: id(item.requirementId, `sourceReviews[${index}].requirementId`),
        assetId: id(item.assetId, `sourceReviews[${index}].assetId`), assetSha256: sha(item.assetSha256, `sourceReviews[${index}].assetSha256`),
        contextSha256: sha(item.contextSha256, `sourceReviews[${index}].contextSha256`),
        dimension: oneOf(item.dimension, REVIEW_DIMENSIONS, `sourceReviews[${index}].dimension`),
        decision: oneOf(item.decision, ['pending', 'acceptable', 'rejected'] as const, `sourceReviews[${index}].decision`),
        rationale: text(item.rationale, `sourceReviews[${index}].rationale`, 2_000).trim(),
        recordedAt: text(item.recordedAt, `sourceReviews[${index}].recordedAt`, 100),
        recordedBy: oneOf(item.recordedBy, ['local-session','provider-license-policy'] as const, `sourceReviews[${index}].recordedBy`), productionAuthority: false};
      if (!review.rationale || item.productionAuthority !== false || !ISO.test(review.recordedAt) || Number.isNaN(Date.parse(review.recordedAt))) fail(`sourceReviews[${index}] has invalid review evidence`);
      if(review.recordedBy==='provider-license-policy'&&(review.dimension!=='rights'||review.decision!=='acceptable'))fail(`sourceReviews[${index}] has invalid automated policy observation`);
      return review;
    });
    assertUnique(plan.sourceReviews.map(item => item.id), 'sourceReviews');
  }
  if (row.narrationTakes !== undefined) {
    plan.narrationTakes = arr(row.narrationTakes, 'narrationTakes').map((value, index): NarrationTake => {
      const item = object(value);
      const prefix = `narrationTakes[${index}]`;
      const fields = new Set(['id', 'projectId', 'originalName', 'format', 'mimeType', 'byteCount', 'sha256', 'path',
        'durationSeconds', 'sampleRate', 'channels', 'createdAt', 'capturedRevision', 'scriptSha256',
        'measurement', 'alignmentStatus', 'productionAuthority']);
      for (const key of Object.keys(item)) if (!fields.has(key)) fail(`${prefix}.${key} is not part of the recording contract`);
      for (const key of fields) if (!Object.hasOwn(item, key)) fail(`${prefix}.${key} is required`);
      const format = oneOf(item.format, ['wav', 'mp3', 'm4a'] as const, `${prefix}.format`);
      const mimeType = oneOf(item.mimeType, ['audio/wav', 'audio/mpeg', 'audio/mp4'] as const, `${prefix}.mimeType`);
      if (mimeType !== {wav:'audio/wav', mp3:'audio/mpeg', m4a:'audio/mp4'}[format]) fail(`${prefix} format and MIME disagree`);
      const take: NarrationTake = {
        id: id(item.id, `${prefix}.id`), projectId: id(item.projectId, `${prefix}.projectId`),
        originalName: text(item.originalName, `${prefix}.originalName`, 500), format, mimeType,
        byteCount: finiteNumber(item.byteCount, `${prefix}.byteCount`, 1), sha256: sha(item.sha256, `${prefix}.sha256`),
        path: text(item.path, `${prefix}.path`, 200), durationSeconds: finiteNumber(item.durationSeconds, `${prefix}.durationSeconds`, 0.001),
        sampleRate: nullableNumber(item.sampleRate, `${prefix}.sampleRate`), channels: nullableNumber(item.channels, `${prefix}.channels`),
        createdAt: text(item.createdAt, `${prefix}.createdAt`, 100), capturedRevision: finiteNumber(item.capturedRevision, `${prefix}.capturedRevision`, 1),
        scriptSha256: sha(item.scriptSha256, `${prefix}.scriptSha256`), measurement: 'ffprobe', alignmentStatus: 'unavailable', productionAuthority: false,
      };
      if (item.measurement !== 'ffprobe' || item.alignmentStatus !== 'unavailable' || item.productionAuthority !== false ||
          take.projectId !== row.id || take.path !== `narration/${take.sha256}.${take.format}` ||
          !Number.isInteger(take.byteCount) || take.byteCount > 40_000_000 || !Number.isInteger(take.capturedRevision) ||
          take.capturedRevision > Number(row.revision) || !ISO.test(take.createdAt) || Number.isNaN(Date.parse(take.createdAt)) ||
          (take.sampleRate !== null && (!Number.isInteger(take.sampleRate) || take.sampleRate <= 0)) ||
          (take.channels !== null && (!Number.isInteger(take.channels) || take.channels <= 0))) fail(`${prefix} has invalid measurement evidence`);
      return take;
    });
    assertUnique(plan.narrationTakes.map(item => item.id), 'narrationTakes');
  }
  if (row.narrationTimings !== undefined) {
    const takesById = new Map((plan.narrationTakes ?? []).map(item => [item.id, item]));
    const scriptsByHash = new Map([[script.rawSha256, script.rawText], ...history.map(item => [item.rawSha256, item.rawText] as const)]);
    plan.narrationTimings = arr(row.narrationTimings, 'narrationTimings').map((value, index): NarrationTiming => {
      const item = object(value); const prefix = `narrationTimings[${index}]`;
      const fields = new Set(['id', 'projectId', 'capturedRevision', 'takeId', 'audioSha256', 'scriptSha256',
        'createdAt', 'method', 'reviewStatus', 'manualReviewConfirmed', 'manualReviewConfirmedAt', 'productionAuthority', 'segments']);
      for (const key of Object.keys(item)) if (!fields.has(key)) fail(`${prefix}.${key} is not part of the timing contract`);
      for (const key of fields) if (key !== 'manualReviewConfirmed' && key !== 'manualReviewConfirmedAt' && !Object.hasOwn(item, key)) fail(`${prefix}.${key} is required`);
      const hasConfirmation=Object.hasOwn(item,'manualReviewConfirmed');
      if(hasConfirmation!==Object.hasOwn(item,'manualReviewConfirmedAt') ||
        (hasConfirmation && (item.manualReviewConfirmed!==true || typeof item.manualReviewConfirmedAt!=='string' ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(item.manualReviewConfirmedAt) ||
          Number.isNaN(Date.parse(item.manualReviewConfirmedAt)) ||
          new Date(item.manualReviewConfirmedAt).toISOString()!==item.manualReviewConfirmedAt)))
        fail(`${prefix} has invalid manual draft confirmation`);
      const snapshot = arr(item.segments, `${prefix}.segments`).map((value, segmentIndex): NarrationTimingSegment => {
        const segment = object(value); const field = `${prefix}.segments[${segmentIndex}]`;
        const keys = new Set(['segmentId', 'start', 'end', 'text', 'startSeconds', 'endSeconds']);
        for (const key of Object.keys(segment)) if (!keys.has(key)) fail(`${field}.${key} is not part of the timing segment contract`);
        for (const key of keys) if (!Object.hasOwn(segment, key)) fail(`${field}.${key} is required`);
        return {segmentId:id(segment.segmentId, `${field}.segmentId`), start:finiteNumber(segment.start, `${field}.start`),
          end:finiteNumber(segment.end, `${field}.end`), text:text(segment.text, `${field}.text`, MAX_TEXT),
          startSeconds:finiteNumber(segment.startSeconds, `${field}.startSeconds`), endSeconds:finiteNumber(segment.endSeconds, `${field}.endSeconds`)};
      });
      const timing: NarrationTiming = {
        id:id(item.id, `${prefix}.id`), projectId:id(item.projectId, `${prefix}.projectId`),
        capturedRevision:finiteNumber(item.capturedRevision, `${prefix}.capturedRevision`, 1),
        takeId:id(item.takeId, `${prefix}.takeId`), audioSha256:sha(item.audioSha256, `${prefix}.audioSha256`),
        scriptSha256:sha(item.scriptSha256, `${prefix}.scriptSha256`), createdAt:text(item.createdAt, `${prefix}.createdAt`, 100),
        method:oneOf(item.method, ['manual-timing-draft'] as const, `${prefix}.method`),
        reviewStatus:oneOf(item.reviewStatus, ['draft'] as const, `${prefix}.reviewStatus`),
        ...(hasConfirmation ? {manualReviewConfirmed:true as const,manualReviewConfirmedAt:item.manualReviewConfirmedAt as string} : {}),
        productionAuthority:false, segments:snapshot,
      };
      const take = takesById.get(timing.takeId);
      const sourceText = scriptsByHash.get(timing.scriptSha256);
      if (!/^timing_[a-f0-9-]{36}$/.test(timing.id) || timing.projectId !== row.id || item.productionAuthority !== false ||
          !Number.isInteger(timing.capturedRevision) || timing.capturedRevision > Number(row.revision) ||
          !ISO.test(timing.createdAt) || Number.isNaN(Date.parse(timing.createdAt)) ||
          !take || timing.capturedRevision <= take.capturedRevision || timing.audioSha256 !== take.sha256 ||
          timing.scriptSha256 !== take.scriptSha256 || !sourceText || !snapshot.length) fail(`${prefix} has invalid binding`);
      assertUnique(snapshot.map(segment => segment.segmentId), `${prefix}.segments`);
      const sourcePoints = codePoints(sourceText);
      let previousOffset = -1; let previousEndSeconds = 0;
      for (const segment of snapshot) {
        if (!Number.isInteger(segment.start) || !Number.isInteger(segment.end) || segment.start <= previousOffset ||
            segment.end <= segment.start || segment.end > sourcePoints.length ||
            sourcePoints.slice(segment.start, segment.end).join('') !== segment.text ||
            segment.startSeconds < previousEndSeconds || segment.endSeconds <= segment.startSeconds ||
            segment.endSeconds > take.durationSeconds) fail(`${prefix} has invalid segment ranges`);
        previousOffset = segment.start; previousEndSeconds = segment.endSeconds;
      }
      if (timing.scriptSha256 === script.rawSha256 && timing.capturedRevision === Number(row.revision) - 1) {
        const currentNarration = segments.filter(segment => segment.kind === 'narration');
        if (snapshot.length !== currentNarration.length || snapshot.some((item, i) =>
          item.segmentId !== currentNarration[i].id || item.start !== currentNarration[i].start ||
          item.end !== currentNarration[i].end || item.text !== currentNarration[i].text)) fail(`${prefix} does not cover the current narration`);
      }
      return timing;
    });
    assertUnique(plan.narrationTimings.map(item => item.id), 'narrationTimings');
  }
  if (!Number.isInteger(plan.revision) || !ISO.test(plan.createdAt) || !ISO.test(plan.updatedAt) || Number.isNaN(Date.parse(plan.createdAt)) || Number.isNaN(Date.parse(plan.updatedAt))) fail('plan dates or revision are invalid');
  if (row.origin !== undefined) {
    const origin = object(row.origin);
    if (origin.kind !== 'episode-spec') fail('origin.kind must be episode-spec');
    plan.origin = { kind: 'episode-spec', path: text(origin.path, 'origin.path', 4_000), sha256: sha(origin.sha256, 'origin.sha256') };
  }
  if (row.aiAnalysisAdoption !== undefined) {
    const field='aiAnalysisAdoption',item=object(row.aiAnalysisAdoption);
    const exact=(value:Record<string,unknown>,fields:string[],label:string)=>{
      if(Object.keys(value).sort().join('|')!==fields.sort().join('|'))fail(`${label} has invalid fields`);
    };
    exact(item,['schemaVersion','id','createdAt','jobId','artifactSha256','scope','model','beforeRevision','afterRevision','scriptSha256','productionAuthority','requiresHumanReview','records'],field);
    const scope=object(item.scope),model=object(item.model);
    exact(scope,['projectId','revision','scriptSha256','snapshotSha256'],`${field}.scope`);
    exact(model,['adapter','requestedModelId','responseModelId'],`${field}.model`);
    const beforeRevision=finiteNumber(item.beforeRevision,`${field}.beforeRevision`,1),afterRevision=finiteNumber(item.afterRevision,`${field}.afterRevision`,2);
    const receipt:AIAnalysisAdoption={
      schemaVersion:'visualmaker-ai-analysis-adoption-v1',id:id(item.id,`${field}.id`),createdAt:text(item.createdAt,`${field}.createdAt`,100),
      jobId:id(item.jobId,`${field}.jobId`),artifactSha256:sha(item.artifactSha256,`${field}.artifactSha256`),
      scope:{projectId:id(scope.projectId,`${field}.scope.projectId`),revision:finiteNumber(scope.revision,`${field}.scope.revision`,1),
        scriptSha256:sha(scope.scriptSha256,`${field}.scope.scriptSha256`),snapshotSha256:sha(scope.snapshotSha256,`${field}.scope.snapshotSha256`)},
      model:{adapter:oneOf(model.adapter,['gateway-api-key','sdk-test','codex-cli'] as const,`${field}.model.adapter`),
        requestedModelId:text(model.requestedModelId,`${field}.model.requestedModelId`,160),
        responseModelId:model.responseModelId===null?null:text(model.responseModelId,`${field}.model.responseModelId`,160)},
      beforeRevision,afterRevision,scriptSha256:sha(item.scriptSha256,`${field}.scriptSha256`),productionAuthority:false,requiresHumanReview:true,
      records:arr(item.records,`${field}.records`).map((value,index)=>{
        const entry=object(value),prefix=`${field}.records[${index}]`;
        exact(entry,['segmentId','beatId','sceneId','source','mainMessage','uncertainty','visualMeaningBrief','searchBriefKo','searchBriefEn','beforeIntent','appliedIntent'],prefix);
        const source=object(entry.source);exact(source,['start','end','text','kind'],`${prefix}.source`);
        const bounded=(name:string)=>{const value=text(entry[name],`${prefix}.${name}`,600);if(value.trim()!==value)fail(`${prefix}.${name} has invalid whitespace`);return value;};
        return {segmentId:id(entry.segmentId,`${prefix}.segmentId`),beatId:id(entry.beatId,`${prefix}.beatId`),sceneId:id(entry.sceneId,`${prefix}.sceneId`),
          source:{start:finiteNumber(source.start,`${prefix}.source.start`),end:finiteNumber(source.end,`${prefix}.source.end`),
            text:text(source.text,`${prefix}.source.text`,MAX_TEXT),kind:oneOf(source.kind,['narration','note','reference'] as const,`${prefix}.source.kind`)},
          mainMessage:bounded('mainMessage'),uncertainty:bounded('uncertainty'),visualMeaningBrief:bounded('visualMeaningBrief'),
          searchBriefKo:bounded('searchBriefKo'),searchBriefEn:bounded('searchBriefEn'),
          beforeIntent:text(entry.beforeIntent,`${prefix}.beforeIntent`),appliedIntent:bounded('appliedIntent')};
      }),
    };
    if(item.schemaVersion!==receipt.schemaVersion||!/^adopt_[a-f0-9-]{36}$/u.test(receipt.id)||!/^job_[a-f0-9-]{36}$/u.test(receipt.jobId)||
        item.productionAuthority!==false||item.requiresHumanReview!==true||receipt.scope.projectId!==plan.id||
        receipt.scope.revision!==receipt.beforeRevision||receipt.afterRevision!==receipt.beforeRevision+1||receipt.afterRevision>plan.revision||
        !Number.isSafeInteger(receipt.beforeRevision)||!Number.isSafeInteger(receipt.afterRevision)||receipt.scriptSha256!==receipt.scope.scriptSha256||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(receipt.createdAt)||Number.isNaN(Date.parse(receipt.createdAt))||
        new Date(receipt.createdAt).toISOString()!==receipt.createdAt||receipt.records.length<1||receipt.records.length>40||
        Buffer.byteLength(JSON.stringify(item),'utf8')>200_000)fail(`${field} has invalid provenance`);
    const originalText=([[script.rawSha256,script.rawText],...history.map(entry=>[entry.rawSha256,entry.rawText])].find(([hash])=>hash===receipt.scriptSha256)??[])[1];
    if(typeof originalText!=='string')fail(`${field} script history is missing`);
    const points=codePoints(originalText),seenSegments=new Set<string>(),seenBeats=new Set<string>(),seenScenes=new Set<string>();let previousStart=-1;
    for(const entry of receipt.records){
      if(seenSegments.has(entry.segmentId)||seenBeats.has(entry.beatId)||seenScenes.has(entry.sceneId)||
          !Number.isSafeInteger(entry.source.start)||!Number.isSafeInteger(entry.source.end)||entry.source.start<=previousStart||
          entry.source.end<=entry.source.start||entry.source.end>points.length||points.slice(entry.source.start,entry.source.end).join('')!==entry.source.text||
          entry.appliedIntent!==entry.mainMessage)fail(`${field} has invalid selected records`);
      seenSegments.add(entry.segmentId);seenBeats.add(entry.beatId);seenScenes.add(entry.sceneId);previousStart=entry.source.start;
    }
    plan.aiAnalysisAdoption=receipt;
  }
  return plan;
}

export function prepareImportedCopy(value: unknown): Plan {
  const row = object(value);
  const {aiAnalysisAdoption:_discard,...copy}=row;
  return validatePlan({...copy, sourceReviews: [], narrationTakes: [], narrationTimings: []});
}

function cloned(plan: Plan): Plan {
  return structuredClone(plan);
}

function sceneForBeat(plan: Plan, beatId: string): Scene | undefined {
  return plan.scenes.find((scene) => scene.beatIds.includes(beatId));
}

function narrationForScene(plan: Plan, scene: Scene): string {
  const segmentById = new Map(plan.script.segments.map((segment) => [segment.id, segment]));
  return scene.beatIds.flatMap((beatId) => plan.beats.find((beat) => beat.id === beatId)?.segmentIds ?? []).map((segmentId) => segmentById.get(segmentId)?.text ?? '').filter(Boolean).join(' ');
}

function requireScene(plan: Plan, sceneId: string): Scene {
  const scene = plan.scenes.find((item) => item.id === sceneId);
  if (!scene) fail(`unknown scene ${sceneId}`, 409);
  return scene;
}

function requireBeat(plan: Plan, beatId: string): Beat {
  const beat = plan.beats.find((item) => item.id === beatId);
  if (!beat) fail(`unknown beat ${beatId}`, 409);
  return beat;
}

function ensureUnlocked(scene: Scene): void {
  if (scene.locked) fail(`scene ${scene.id} is locked`, 423);
}

function revisionSegments(plan: Plan, rawText: string): { segments: Segment[]; changedIds: Set<string>; removedIds: Set<string> } {
  const segments = parseSegments(rawText, plan.script.segments);
  const oldById = new Map(plan.script.segments.map((item) => [item.id, item]));
  const newIds = new Set(segments.map((item) => item.id));
  const changedIds = new Set<string>();
  for (const segment of segments) {
    const previous = oldById.get(segment.id);
    if (!previous || previous.text !== segment.text || previous.kind !== segment.kind) changedIds.add(segment.id);
  }
  const removedIds = new Set(plan.script.segments.filter((item) => !newIds.has(item.id)).map((item) => item.id));
  return { segments, changedIds, removedIds };
}

function impactForRevision(plan: Plan, rawText: string): { changedSceneIds: string[]; changedIds: Set<string>; removedIds: Set<string> } {
  const mapping = revisionSegments(plan, rawText);
  const changed = new Set<string>();
  for (const beat of plan.beats) if (beat.segmentIds.some((segmentId) => mapping.changedIds.has(segmentId) || mapping.removedIds.has(segmentId))) {
    const scene = sceneForBeat(plan, beat.id);
    if (scene) changed.add(scene.id);
  }
  return { changedSceneIds: [...changed], changedIds: mapping.changedIds, removedIds: mapping.removedIds };
}

function scriptRisks(before: string, after: string, impacted: string[], locked: string[]): string[] {
  if (before === after) return [];
  const risks = [`${impacted.length}개 장면의 내레이션 연결과 선택 방향을 다시 검토해야 합니다.`];
  const numbers = (value: string) => value.match(/\d[\d,.]*(?:\s*[%％]|\s*(?:년|개월|일|시간|원|명|건|배))?/gu) ?? [];
  if (numbers(before).join('|') !== numbers(after).join('|')) risks.push('수치·기간·단위가 바뀌어 근거 검토가 필요합니다.');
  const negation = (value: string) => /(?:안|못|없|아니|않|제외|not|unless)/iu.test(value);
  if (negation(before) !== negation(after)) risks.push('부정 또는 예외 조건이 바뀌었습니다.');
  if (locked.length) risks.push(`잠긴 장면을 수정하려고 합니다: ${locked.join(', ')}.`);
  risks.push('영향 장면의 음성·타이밍·선택 소스가 오래된 상태가 될 수 있습니다.');
  return risks;
}

export function scriptDiff(plan: Plan, rawText: string): { changedSceneIds: string[]; risks: string[]; before: string; after: string } {
  const validated = validatePlan(plan);
  if (typeof rawText !== 'string' || !rawText.trim() || rawText.length > MAX_TEXT) fail('text must be a bounded non-empty string');
  const impact = impactForRevision(validated, rawText);
  const locked = impact.changedSceneIds.filter((sceneId) => requireScene(validated, sceneId).locked);
  return { changedSceneIds: impact.changedSceneIds, risks: scriptRisks(validated.script.rawText, rawText, impact.changedSceneIds, locked), before: validated.script.rawText, after: rawText };
}

function applyScriptRevision(plan: Plan, rawText: string): Plan {
  const impact = impactForRevision(plan, rawText);
  for (const sceneId of impact.changedSceneIds) if (requireScene(plan, sceneId).locked) fail(`scene ${sceneId} is locked`, 423);
  const mapping = revisionSegments(plan, rawText);
  const oldBeatBySegment = new Map<string, Beat>();
  for (const beat of plan.beats) for (const segmentId of beat.segmentIds) oldBeatBySegment.set(segmentId, beat);
  const newBeats: Beat[] = [];
  const newSceneGroups = new Map<string, string[]>();
  let newBeatNumber = 1;
  for (const segment of mapping.segments) {
    if (segment.kind !== 'narration') continue;
    const oldBeat = oldBeatBySegment.get(segment.id);
    const oldScene = oldBeat ? sceneForBeat(plan, oldBeat.id) : undefined;
    const importedAuthority = Boolean(oldScene?.originCutIds?.length);
    const revisedRole = importedAuthority ? oldBeat?.role ?? inferRole(segment.text) : inferRole(segment.text);
    const madeBeat = makeBeatAndScene(segment, newBeatNumber).beat;
    const beat = oldBeat ? { ...oldBeat, segmentIds: [segment.id], intent: impact.changedIds.has(segment.id) ? `시청자가 기억할 핵심: ${segment.text}` : oldBeat.intent, role: impact.changedIds.has(segment.id) ? revisedRole : oldBeat.role, claimReview: impact.changedIds.has(segment.id) ? (revisedRole === 'evidence' || revisedRole === 'comparison' ? 'pending' : 'not-applicable') : oldBeat.claimReview } : { ...madeBeat, id: `beat-new-${randomUUID()}` };
    newBeatNumber += 1;
    newBeats.push(beat);
    const groupId = oldScene?.id ?? `new-group-${randomUUID()}`;
    const group = newSceneGroups.get(groupId) ?? [];
    group.push(beat.id);
    newSceneGroups.set(groupId, group);
  }
  const newRequirements: Requirement[] = [];
  const newScenes: Scene[] = [];
  for (const [groupId, beatIds] of newSceneGroups) {
    const oldScene = plan.scenes.find((scene) => scene.id === groupId);
    const sceneChanged = beatIds.some((beatId) => {
      const beat = newBeats.find((item) => item.id === beatId);
      return beat?.segmentIds.some((segmentId) => impact.changedIds.has(segmentId)) ?? false;
    }) || (oldScene?.beatIds.some((beatId) => plan.beats.find((beat) => beat.id === beatId)?.segmentIds.some((segmentId) => impact.removedIds.has(segmentId)) ?? false) ?? false);
    if (oldScene) {
      if (sceneChanged) {
        const meaning = beatIds.map((beatId) => newBeats.find((beat) => beat.id === beatId)?.intent ?? '').filter(Boolean).join(' / ');
        const role = oldScene.originCutIds?.length ? (newBeats.find((beat) => beat.id === beatIds[0])?.role ?? inferRole(meaning)) : inferRole(meaning);
        const authoritativeMode = oldScene.originCutIds?.length ? oldScene.candidates[0]?.mode : undefined;
        const narrationText = beatIds.flatMap((beatId) => newBeats.find((beat) => beat.id === beatId)?.segmentIds ?? []).map((segmentId) => mapping.segments.find((segment) => segment.id === segmentId)?.text ?? '').filter(Boolean).join(' ');
        const rebuilt = makeDraftScene(oldScene.id, beatIds, meaning, role, `-r${plan.revision + 1}`, authoritativeMode, narrationText);
        rebuilt.scene.originCutIds = oldScene.originCutIds ? [...oldScene.originCutIds] : undefined;
        newScenes.push(rebuilt.scene);
        newRequirements.push(...rebuilt.requirements);
      } else {
        const scene = structuredClone(oldScene);
        scene.beatIds = beatIds;
        newScenes.push(scene);
      }
      continue;
    }
    const segment = mapping.segments.find((item) => item.kind === 'narration' && item.id === newBeats.find((beat) => beat.id === beatIds[0])?.segmentIds[0]);
    if (!segment) fail(`cannot build scene ${groupId}`);
    const usedSceneIds = new Set([...plan.scenes.map((scene) => scene.id), ...newScenes.map((scene) => scene.id)]);
    let serial = newScenes.length + 1;
    let newSceneId = `scene-new-${serial}`;
    while (usedSceneIds.has(newSceneId)) { serial += 1; newSceneId = `scene-new-${serial}`; }
    const beat = newBeats.find((item) => item.id === beatIds[0]);
    const made = makeDraftScene(newSceneId, beatIds, beat?.intent ?? segment.text, beat?.role ?? inferRole(segment.text), '', undefined, segment.text);
    newScenes.push(made.scene);
    newRequirements.push(...made.requirements);
  }
  const retainedRequirementIds = new Set(newScenes.flatMap((scene) => scene.candidates.flatMap((candidate) => candidate.requirementIds)));
  const requirements = [...plan.requirements.filter((item) => retainedRequirementIds.has(item.id)), ...newRequirements];
  const oldScript = { id: plan.script.id, rawText: plan.script.rawText, rawSha256: plan.script.rawSha256 };
  const revised: Plan = { ...cloned(plan), revision: plan.revision + 1, updatedAt: now(), script: { id: `script-${randomUUID()}`, rawText, rawSha256: hashText(rawText), segments: mapping.segments, history: [...plan.script.history, oldScript] }, beats: newBeats, scenes: newScenes, requirements, assets: plan.assets };
  reconcileReviews(plan, revised);
  return validatePlan(revised);
}

function regeneratedCandidate(scene: Scene, simplify: boolean, revision: number): Candidate {
  const source = scene.candidates[0];
  if (!source) fail(`scene ${scene.id} has no candidate`, 409);
  const serial = `${scene.id}-regenerated-${revision}`;
  const candidate: Candidate = structuredClone(source);
  candidate.id = serial;
  candidate.label = simplify ? `${source.label} · 간소화` : `${source.label} · 재제안`;
  candidate.reason = simplify ? `${source.reason} 필요한 요소를 줄여 제작 부담을 낮춘 검토안.` : `${source.reason} 같은 자료 요구를 유지한 새 검토안.`;
  candidate.layers = candidate.layers.map((layer, index) => ({ ...layer, id: `${serial}-${index + 1}-${layer.role}` }));
  candidate.reuseFromSceneId = null;
  candidate.reuseReason = '';
  return candidate;
}

function commandObject(value: unknown): Record<string, unknown> {
  const row = object(value);
  text(row.type, 'command.type', 100);
  return row;
}

export function applyCommand(inputPlan: Plan, command: Command): Plan {
  const plan = validatePlan(inputPlan);
  const row = commandObject(command);
  const typeValue = row.type;
  if (typeValue === 'revise-script') return applyScriptRevision(plan, text(row.text, 'command.text', MAX_TEXT));
  const next = cloned(plan);
  if (typeValue === 'select') {
    const scene = requireScene(next, id(row.sceneId, 'command.sceneId'));
    const candidateId = id(row.candidateId, 'command.candidateId');
    if (scene.locked && scene.selectedCandidateId !== candidateId) fail(`scene ${scene.id} is locked`, 423);
    if (!scene.candidates.some((candidate) => candidate.id === candidateId)) fail(`unknown candidate ${candidateId}`, 409);
    scene.selectedCandidateId = candidateId; scene.reviewStatus = 'direction-selected';
  } else if (typeValue === 'lock') {
    const scene = requireScene(next, id(row.sceneId, 'command.sceneId'));
    if (typeof row.locked !== 'boolean') fail('command.locked must be boolean');
    if (row.locked && scene.selectedCandidateId === null) fail('a scene needs a selected candidate before locking', 409);
    if (scene.locked && row.locked === false) scene.locked = false; else if (!scene.locked || row.locked) scene.locked = row.locked;
  } else if (typeValue === 'edit-candidate') {
    const scene = requireScene(next, id(row.sceneId, 'command.sceneId')); ensureUnlocked(scene);
    const candidate = scene.candidates.find((item) => item.id === id(row.candidateId, 'command.candidateId'));
    if (!candidate) fail('unknown candidate', 409);
    const changes = object(row.changes);
    const allowed = new Set(['label', 'reason', 'startState', 'change', 'endState']);
    for (const key of Object.keys(changes)) if (!allowed.has(key)) fail(`cannot edit candidate field ${key}`);
    for (const key of allowed) if (changes[key] !== undefined) {
      const value = text(changes[key], `changes.${key}`);
      if (key === 'label') candidate.label = value;
      else if (key === 'reason') candidate.reason = value;
      else if (key === 'startState') candidate.startState = value;
      else if (key === 'change') candidate.change = value;
      else if (key === 'endState') candidate.endState = value;
    }
  } else if (typeValue === 'edit-beat') {
    const beat = requireBeat(next, id(row.beatId, 'command.beatId'));
    const scene = sceneForBeat(next, beat.id); if (scene) ensureUnlocked(scene);
    const intent = text(row.intent, 'command.intent');
    const role = oneOf(row.role, ['context', 'action', 'comparison', 'process', 'evidence', 'fiction'] as const, 'command.role');
    if (scene && (intent !== beat.intent || role !== beat.role)) {
      const priorEstimate = scene.estimatedSeconds;
      const rebuilt = makeDraftScene(scene.id, scene.beatIds, intent, role, `-r${next.revision + 1}`);
      scene.candidates = rebuilt.scene.candidates;
      scene.originCutIds = scene.originCutIds ? [...scene.originCutIds] : undefined;
      scene.estimatedSeconds = priorEstimate;
      next.requirements.push(...rebuilt.requirements);
      scene.selectedCandidateId = null;
      scene.reviewStatus = 'draft';
      const referenced = new Set(next.scenes.flatMap((item) => item.candidates.flatMap((candidate) => candidate.requirementIds)));
      next.requirements = next.requirements.filter((requirement) => referenced.has(requirement.id));
    }
    beat.intent = intent; beat.role = role;
    if (beat.role === 'evidence' || beat.role === 'comparison') beat.claimReview = 'pending';
  } else if (typeValue === 'regenerate') {
    const scene = requireScene(next, id(row.sceneId, 'command.sceneId')); ensureUnlocked(scene);
    if (row.simplify !== undefined && typeof row.simplify !== 'boolean') fail('command.simplify must be boolean');
    const beat = requireBeat(next, scene.beatIds[0]);
    const regenerated = regeneratedCandidate(scene, row.simplify === true, next.revision);
    scene.candidates = [regenerated, ...scene.candidates.map((candidate) => ({ ...candidate, id: `${candidate.id}-prior-${next.revision}` }))];
    scene.selectedCandidateId = null; scene.reviewStatus = 'draft';
  } else if (typeValue === 'reuse') {
    const scene = requireScene(next, id(row.sceneId, 'command.sceneId')); ensureUnlocked(scene);
    const from = requireScene(next, id(row.fromSceneId, 'command.fromSceneId'));
    const reason = text(row.reason, 'command.reason');
    if (from.id === scene.id) fail('a scene cannot reuse itself');
    const source = from.candidates.find((candidate) => candidate.id === from.selectedCandidateId) ?? from.candidates[0];
    const target = scene.candidates.find((candidate) => candidate.id === scene.selectedCandidateId) ?? scene.candidates[0];
    const targetRequirements = new Set(target.requirementIds);
    const targetRequirementRows = new Set(target.requirementIds.map((requirementId) => next.requirements.find((item) => item.id === requirementId)).filter(Boolean).map((item) => `${item!.mediaType}:${item!.acquisition}`));
    const compatibleSharedRequirements = source.requirementIds.filter((requirementId) => {
      const requirement = next.requirements.find((item) => item.id === requirementId);
      return requirement !== undefined && target.mode === source.mode && targetRequirementRows.has(`${requirement.mediaType}:${requirement.acquisition}`);
    });
    if (compatibleSharedRequirements.length === 0) fail('reuse requires a compatible source requirement', 409);
    for (const requirementId of compatibleSharedRequirements) targetRequirements.add(requirementId);
    const reuseId = `${scene.id}-reuse-${next.revision}`;
    const reused: Candidate = { ...structuredClone(target), id: reuseId, label: `${target.label} · ${source.label} 재사용`, requirementIds: [...targetRequirements], layers: target.layers.map((layer, index) => ({ ...layer, id: `${reuseId}-${index + 1}-${layer.role}` })), reuseFromSceneId: from.id, reuseReason: reason };
    const sourceFocal = source.layers.find((layer) => layer.role === 'focal' && layer.requirementId !== null && reused.requirementIds.includes(layer.requirementId));
    if (sourceFocal && !reused.layers.some((layer) => layer.role === 'supporting' && layer.requirementId === sourceFocal.requirementId)) reused.layers.push({ id: `${reuseId}-${reused.layers.length + 1}-supporting`, role: 'supporting', description: `재사용: ${sourceFocal.description}`, requirementId: sourceFocal.requirementId });
    scene.candidates = [reused, ...scene.candidates]; scene.selectedCandidateId = null; scene.reviewStatus = 'draft';
  } else if (typeValue === 'merge-next') {
    const sceneIndex = next.scenes.findIndex((item) => item.id === id(row.sceneId, 'command.sceneId'));
    if (sceneIndex < 0) fail('unknown scene', 409);
    const scene = next.scenes[sceneIndex]; const following = next.scenes[sceneIndex + 1];
    if (!following) fail('scene has no following scene', 409);
    ensureUnlocked(scene); ensureUnlocked(following);
    const leftModes = new Set(scene.candidates.map((candidate) => candidate.mode));
    const rightModes = new Set(following.candidates.map((candidate) => candidate.mode));
    if (leftModes.size !== rightModes.size || [...leftModes].some((mode) => !rightModes.has(mode))) fail('scenes have incompatible candidate modes', 409);
    const mergedCandidates = scene.candidates.map((candidate, index) => {
      const compatibleFollowing = following.candidates.filter((item) => item.mode === candidate.mode);
      const companion = compatibleFollowing[index] ?? compatibleFollowing[0];
      if (!companion || companion.mode !== candidate.mode) fail('scenes have incompatible candidate modes', 409);
      const mergedId = `${scene.id}-merged-${next.revision}-${index + 1}`;
      const requirementIds = [...new Set([...candidate.requirementIds, ...companion.requirementIds])];
      const layers = candidate.layers.map((layer, layerIndex) => ({ ...layer, id: `${mergedId}-${layerIndex + 1}-${layer.role}` }));
      const companionFocal = companion.layers.find((layer) => layer.role === 'focal' && layer.requirementId !== null);
      const focal = layers.find((layer) => layer.role === 'focal');
      if (focal) focal.description = `${focal.description} · 이어서 ${companionFocal?.description ?? companion.label}`;
      if (companionFocal && !layers.some((layer) => layer.role === 'supporting')) layers.push({ id: `${mergedId}-${layers.length + 1}-supporting`, role: 'supporting', description: `병합된 다음 의미: ${companionFocal.description}`, requirementId: companionFocal.requirementId });
      return { ...structuredClone(candidate), id: mergedId, reason: `${candidate.reason} 이어서 ${companion.reason}`, startState: `${candidate.startState} / ${companion.startState}`, change: `${candidate.change} 이어서 ${companion.change}`, endState: `${candidate.endState} / ${companion.endState}`, requirementIds, layers, reuseFromSceneId: null, reuseReason: '' };
    });
    const mergedBeatIds = [...scene.beatIds, ...following.beatIds];
    const mergedNarration = [narrationForScene(next, scene), narrationForScene(next, following)].filter(Boolean).join(' ');
    scene.beatIds = mergedBeatIds; scene.candidates = mergedCandidates; scene.estimatedSeconds = estimateNarrationSeconds(mergedNarration); scene.selectedCandidateId = null; scene.reviewStatus = 'draft';
    scene.originCutIds = [...new Set([...(scene.originCutIds ?? []), ...(following.originCutIds ?? [])])];
    next.scenes.splice(sceneIndex + 1, 1);
  } else if (typeValue === 'attach-asset') {
    const requirementId = id(row.requirementId, 'command.requirementId');
    const requirement = next.requirements.find((item) => item.id === requirementId);
    if (!requirement) fail(`unknown requirement ${requirementId}`, 409);
    if (requirement.assetId !== null) fail(`requirement ${requirementId} already has an asset`, 409);
    const sharingScenes = next.scenes.filter((scene) => scene.candidates.some((candidate) => candidate.requirementIds.includes(requirementId)));
    if (sharingScenes.some((scene) => scene.locked)) fail(`requirement ${requirementId} is used by a locked scene`, 423);
    const asset = validateAsset(row.asset, 0);
    if (next.assets.some((item) => item.id === asset.id || item.sha256 === asset.sha256)) fail('asset ID or hash already exists', 409);
    if (asset.mediaType !== requirement.mediaType) fail('asset media type does not match requirement', 409);
    if (asset.evidenceOnly && next.scenes.some((scene) => scene.candidates.some((candidate) => candidate.layers.some((layer) => layer.role === 'focal' && layer.requirementId === requirementId)))) fail('evidence-only assets cannot fulfill a focal layer', 409);
    next.assets.push(asset); requirement.assetId = asset.id;
  } else if (typeValue === 'assign-asset' || typeValue === 'detach-asset' || typeValue === 'review-source') {
    const requirementId = id(row.requirementId, 'command.requirementId');
    const requirement = next.requirements.find(item => item.id === requirementId);
    if (!requirement) fail(`unknown requirement ${requirementId}`, 409);
    const sharingScenes = next.scenes.filter(scene => scene.candidates.some(candidate => candidate.requirementIds.includes(requirementId)));
    if (sharingScenes.some(scene => scene.locked)) fail(`requirement ${requirementId} is used by a locked scene`, 423);
    if (typeValue === 'detach-asset') {
      if (requirement.assetId === null) fail('requirement has no assigned asset', 409);
      requirement.assetId = null;
    } else if (typeValue === 'assign-asset') {
      const asset = next.assets.find(item => item.id === id(row.assetId, 'command.assetId'));
      if (!asset) fail('unknown registered asset', 409);
      if (requirement.assetId !== null) fail('detach the currently assigned asset first', 409);
      if (asset.mediaType !== requirement.mediaType) fail('asset media type does not match requirement', 409);
      if (requirement.acquisition === 'generated-keyframe' && asset.mimeType !== 'image/png') fail('Omni input requires a PNG keyframe', 409);
      if (asset.evidenceOnly && sharingScenes.some(scene => scene.candidates.some(candidate => candidate.layers.some(layer => layer.role === 'focal' && layer.requirementId === requirementId)))) fail('evidence-only assets cannot fulfill a focal layer', 409);
      requirement.assetId = asset.id;
    } else {
      if (!requirement.assetId) fail('assign an asset before recording observations', 409);
      const asset = next.assets.find(item => item.id === requirement.assetId);
      if (!asset) fail('assigned asset is missing', 409);
      const dimension = oneOf(row.dimension, REVIEW_DIMENSIONS, 'command.dimension');
      const decision = oneOf(row.decision, ['pending', 'acceptable', 'rejected'] as const, 'command.decision');
      const rationale = text(row.rationale, 'command.rationale', 2_000).trim();
      if (!rationale) fail('review rationale must not be blank');
      appendReview(next, requirement, asset, dimension, decision, rationale);
    }
  } else {
    fail(`unknown command type ${String(typeValue)}`);
  }
  reconcileReviews(plan, next);
  next.revision = plan.revision + 1;
  next.updatedAt = now();
  return validatePlan(next);
}

/** Dedicated adoption path, deliberately not part of the public Command union. */
export function applyAIAnalysisIntentBatch(inputPlan:Plan,changes:readonly {beatId:string;intent:string}[]):Plan{
  const plan=validatePlan(inputPlan);
  if(!Array.isArray(changes)||changes.length<1||changes.length>40)fail('AI adoption selection is invalid');
  const seenBeats=new Set<string>(),seenScenes=new Set<string>();
  const resolved=changes.map((change,index)=>{
    const beat=requireBeat(plan,id(change.beatId,`adoption[${index}].beatId`));
    const intent=text(change.intent,`adoption[${index}].intent`,600);
    const owners=plan.scenes.filter(scene=>scene.beatIds.includes(beat.id));
    if(owners.length!==1)fail('AI adoption scene mapping is ambiguous',409);
    const scene=owners[0];ensureUnlocked(scene);
    if(seenBeats.has(beat.id)||seenScenes.has(scene.id))fail('AI adoption scene selection is ambiguous',409);
    seenBeats.add(beat.id);seenScenes.add(scene.id);
    return {beatId:beat.id,sceneId:scene.id,intent};
  });
  const next=cloned(plan);
  for(const change of resolved){
    const beat=requireBeat(next,change.beatId),scene=requireScene(next,change.sceneId);
    if(change.intent!==beat.intent){
      const priorEstimate=scene.estimatedSeconds;
      const rebuilt=makeDraftScene(scene.id,scene.beatIds,change.intent,beat.role,`-r${plan.revision+1}`);
      scene.candidates=rebuilt.scene.candidates;
      scene.originCutIds=scene.originCutIds?[...scene.originCutIds]:undefined;
      scene.estimatedSeconds=priorEstimate;
      next.requirements.push(...rebuilt.requirements);
      scene.selectedCandidateId=null;scene.reviewStatus='draft';
    }
    beat.intent=change.intent;
    if(beat.role==='evidence'||beat.role==='comparison')beat.claimReview='pending';
  }
  const referenced=new Set(next.scenes.flatMap(scene=>scene.candidates.flatMap(candidate=>candidate.requirementIds)));
  next.requirements=next.requirements.filter(requirement=>referenced.has(requirement.id));
  reconcileReviews(plan,next);
  next.revision=plan.revision+1;next.updatedAt=now();
  return validatePlan(next);
}

function csvCell(value: unknown): string {
  let result = String(value ?? '');
  if (/^[=+\-@]/u.test(result)) result = `'${result}`;
  return `"${result.replaceAll('"', '""')}"`;
}

export function planCsv(inputPlan: Plan): string {
  const plan = validatePlan(inputPlan);
  const beatById = new Map(plan.beats.map((beat) => [beat.id, beat]));
  const sceneByBeat = new Map<string, Scene>();
  for (const scene of plan.scenes) for (const beatId of scene.beatIds) sceneByBeat.set(beatId, scene);
  const rows: unknown[][] = [['scene_id', 'segment_id', 'start', 'end', 'text', 'intent', 'selected_candidate_id', 'timing_status', 'review_status', 'locked']];
  for (const segment of plan.script.segments) {
    const beat = plan.beats.find((item) => item.segmentIds.includes(segment.id));
    const scene = beat ? sceneByBeat.get(beat.id) : undefined;
    rows.push([scene?.id ?? '', segment.id, segment.start, segment.end, segment.text, beatById.get(beat?.id ?? '')?.intent ?? '', scene?.selectedCandidateId ?? '', scene?.timingStatus ?? '', scene?.reviewStatus ?? '', scene?.locked ?? '']);
  }
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

export function requirementsExport(inputPlan: Plan) {
  const plan = validatePlan(inputPlan);
  const assets = new Map(plan.assets.map((asset) => [asset.id, asset]));
  const states = new Map(reviewStates(plan).map(state => [state.requirementId, state]));
  return { schemaVersion: 'visualmaker-requirements-v1' as const, planId: plan.id, revision: plan.revision, productionAuthority: false as const,
    requirements: plan.requirements.map((requirement) => ({ ...requirement, status: requirement.assetId === null ? 'unresolved' as const : 'pending-review' as const,
      asset: requirement.assetId === null ? null : assets.get(requirement.assetId) ?? null, review: states.get(requirement.id) })) };
}
