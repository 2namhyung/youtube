import {createHash, randomUUID} from 'node:crypto';
import type {Asset, Plan, Requirement, SourceReview, SourceReviewDimension, SourceReviewState} from './model.ts';

export const REVIEW_DIMENSIONS: SourceReviewDimension[] = ['source', 'rights', 'semantic'];

export function reviewContext(plan: Plan, requirement: Requirement): string {
  const sharing = plan.scenes.filter(scene => scene.candidates.some(candidate => candidate.requirementIds.includes(requirement.id)));
  const meaning = sharing.map(scene => ({
    sceneId: scene.id,
    narration: scene.beatIds.flatMap(beatId => plan.beats.find(beat => beat.id === beatId)?.segmentIds ?? [])
      .map(segmentId => plan.script.segments.find(segment => segment.id === segmentId)?.text ?? ''),
    beats: scene.beatIds.map(beatId => {
      const beat = plan.beats.find(item => item.id === beatId);
      return beat ? {id: beat.id, intent: beat.intent, role: beat.role} : null;
    }),
    selectedCandidateId: scene.selectedCandidateId,
    candidates: scene.candidates.filter(candidate => candidate.requirementIds.includes(requirement.id)).map(candidate => ({
      id: candidate.id, mode: candidate.mode, label: candidate.label, reason: candidate.reason,
      startState: candidate.startState, change: candidate.change, endState: candidate.endState,
      layers: candidate.layers.filter(layer => layer.requirementId === requirement.id).map(layer => ({role: layer.role, description: layer.description})),
    })),
  }));
  const value = {requirement: {id: requirement.id, description: requirement.description, mediaType: requirement.mediaType,
    acquisition: requirement.acquisition, epistemicRole: requirement.epistemicRole, sourceConstraint: requirement.sourceConstraint}, meaning};
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function appendReview(plan: Plan, requirement: Requirement, asset: Asset, dimension: SourceReviewDimension,
  decision: SourceReview['decision'], rationale: string): void {
  const row: SourceReview = {id: `review_${randomUUID()}`, requirementId: requirement.id, assetId: asset.id,
    assetSha256: asset.sha256, contextSha256: reviewContext(plan, requirement), dimension, decision, rationale,
    recordedAt: new Date().toISOString(), recordedBy: 'local-session', productionAuthority: false};
  (plan.sourceReviews ??= []).push(row);
}

export function reconcileReviews(before: Plan, after: Plan): void {
  for (const requirement of after.requirements) {
    if (!requirement.assetId) continue;
    const asset = after.assets.find(item => item.id === requirement.assetId);
    if (!asset) continue;
    const previous = before.requirements.find(item => item.id === requirement.id);
    if (previous?.assetId === requirement.assetId && reviewContext(before, previous) === reviewContext(after, requirement)) continue;
    for (const dimension of REVIEW_DIMENSIONS) appendReview(after, requirement, asset, dimension, 'pending',
      previous?.assetId !== requirement.assetId ? '자료 배정이 변경되어 다시 검토해야 합니다.' : '장면 또는 자료 요구의 의미가 변경되어 다시 검토해야 합니다.');
  }
}

export function reviewStates(plan: Plan): SourceReviewState[] {
  return plan.requirements.map(requirement => {
    const asset = plan.assets.find(item => item.id === requirement.assetId);
    const contextSha256 = reviewContext(plan, requirement);
    const current = Object.fromEntries(REVIEW_DIMENSIONS.map(dimension => {
      const latest = [...(plan.sourceReviews ?? [])].reverse().find(row => row.requirementId === requirement.id &&
        row.assetId === asset?.id && row.assetSha256 === asset?.sha256 && row.contextSha256 === contextSha256 && row.dimension === dimension);
      return [dimension, latest ?? null];
    })) as Record<SourceReviewDimension, SourceReview | null>;
    return {requirementId: requirement.id, assetId: asset?.id ?? null, contextSha256, current,
      history: (plan.sourceReviews ?? []).filter(row => row.requirementId === requirement.id), productionAuthority: false as const};
  });
}
