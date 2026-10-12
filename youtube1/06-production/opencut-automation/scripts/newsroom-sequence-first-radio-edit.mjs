/** Sequence-first newsroom visual assembly contract.
 *
 * The radio edit (locked owner narration + sealed semantic cut plan) is the
 * authority. Semantic units, visual blocks and reusable source assets are
 * deliberately separate records so visual planning cannot rewrite narration.
 */
export const VISUAL_ROLES = Object.freeze({
  EVIDENCE: 'evidence',
  CONTEXT: 'context',
  EXPLANATION: 'explanation',
  RHYTHM: 'rhythm',
});

export const AUTHORED_TREATMENTS = Object.freeze(['full', 'crop', 'pan', 'zoom', 'annotation']);

const CUT_ID = /^cut-\d{3}$/u;

export function authoredScreenTimeCoverage(cuts = [], blocks = []) {
  const covered = new Set(
    blocks.filter((block) => block.status !== 'blocked' && block.sourceAssetIds?.length)
      .flatMap((block) => (block.cutIds || []).map((cutId) => `${block.storyId || ''}:${cutId}`)),
  );
  const total = cuts.reduce((sum, cut) => sum + Number(cut.durationSeconds || 0), 0);
  const coveredSeconds = cuts.filter((cut) => covered.has(`${cut.storyId || ''}:${cut.cutId}`))
    .reduce((sum, cut) => sum + Number(cut.durationSeconds || 0), 0);
  return {coveredSeconds, totalSeconds: total, ratio: total ? coveredSeconds / total : 0};
}

export function validateVisualBlock(block) {
  const errors = [];
  if (!block || typeof block !== 'object') return ['block-required'];
  if (!block.blockId) errors.push('block-id');
  if (!Object.values(VISUAL_ROLES).includes(block.visualRole)) errors.push('visual-role');
  if (!Array.isArray(block.semanticUnitIds) || !block.semanticUnitIds.length) errors.push('semantic-units');
  if (!Array.isArray(block.cutIds) || !block.cutIds.length || block.cutIds.some((id) => !CUT_ID.test(id))) errors.push('cut-ids');
  if (!Array.isArray(block.sourceAssetIds)) errors.push('source-assets');
  if (!block.status) errors.push('status');
  if (block.status === 'blocked' && block.sourceAssetIds?.length) errors.push('blocked-has-source');
  if (block.visualRole === VISUAL_ROLES.CONTEXT && block.status !== 'blocked' && block.disclosure !== '자료사진 · 사건과 무관') errors.push('context-disclosure');
  if (block.visualRole === VISUAL_ROLES.EVIDENCE && block.claimBinding !== 'actual-case-evidence') errors.push('evidence-claim-binding');
  if (block.evidenceOverlayRequirement) {
    if (block.evidenceOverlayRequirement.required !== true) errors.push('evidence-overlay-required');
    if (block.evidenceOverlayRequirement.status !== 'unresolved') errors.push('evidence-overlay-status');
  }
  const treatments = block.treatments || {};
  for (const cutId of block.cutIds || []) {
    if (!AUTHORED_TREATMENTS.includes(treatments[cutId])) errors.push(`treatment:${cutId}`);
  }
  if (block.status !== 'blocked') {
    if (!block.continuityRationale && block.cutIds?.length > 1) errors.push('continuity-rationale');
    if (block.yppTransformation?.staticSlideshow || block.yppTransformation?.minimalEdit) errors.push('ypp-static-or-minimal');
    if (!block.yppTransformation?.substantialNarration || !block.yppTransformation?.authoredMotion || !block.yppTransformation?.annotation) errors.push('ypp-transformation');
    if (block.providerInputStatus !== 'denied' || block.editScope !== 'local-only') errors.push('provider-local-only');
  }
  return errors;
}

export function validateRadioEditPlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object') return ['plan-required'];
  if (plan.schema !== 'newsroom-sequence-first-radio-edit-v1') errors.push('schema');
  if (plan.sequenceAuthority?.source !== 'locked-owner-narration') errors.push('radio-edit-authority');
  if (!plan.sequenceAuthority?.narrationAudioSha256 || !plan.sequenceAuthority?.semanticCutPlanSha256) errors.push('authority-hashes');
  const cuts = plan.cuts || [];
  const cutKey = (storyId, cutId) => `${storyId || ''}:${cutId}`;
  const ids = cuts.map((cut) => cutKey(cut.storyId, cut.cutId));
  if (!cuts.length || cuts.some((cut) => !CUT_ID.test(cut.cutId)) || new Set(ids).size !== ids.length) errors.push('cuts');
  for (const storyId of new Set(cuts.map((cut) => cut.storyId || ''))) {
    const storyCuts = cuts.filter((cut) => (cut.storyId || '') === storyId).sort((a, b) => a.order - b.order);
    if (storyCuts.some((cut, index) => cut.order !== index + 1)) errors.push(`cut-order:${storyId}`);
  }
  const units = plan.semanticUnits || [];
  const unitIds = new Set(units.map((unit) => unit.unitId));
  if (!units.length || units.some((unit) => !unit.unitId || !unit.narrationSpanId)) errors.push('semantic-units');
  const assets = plan.sourceAssets || [];
  const assetIds = new Set(assets.map((asset) => asset.assetId));
  for (const block of plan.visualBlocks || []) {
    errors.push(...validateVisualBlock(block).map((error) => `${block.blockId || 'block'}:${error}`));
    if ((block.cutIds || []).some((id) => !ids.includes(cutKey(block.storyId, id)))) errors.push(`${block.blockId}:unknown-cut`);
    if ((block.semanticUnitIds || []).some((id) => !unitIds.has(id))) errors.push(`${block.blockId}:unknown-semantic-unit`);
    if ((block.sourceAssetIds || []).some((id) => !assetIds.has(id))) errors.push(`${block.blockId}:unknown-source-asset`);
  }
  const coveredCuts = new Set();
  for (const block of plan.visualBlocks || []) for (const cutId of block.cutIds || []) {
    const key = cutKey(block.storyId, cutId);
    if (coveredCuts.has(key)) errors.push(`duplicate-cut-block:${key}`);
    coveredCuts.add(key);
  }
  if (coveredCuts.size !== cuts.length) errors.push('cut-coverage');
  // Reuse is allowed only for contiguous cuts with distinct authored treatments.
  const byAsset = new Map();
  for (const block of plan.visualBlocks || []) for (const assetId of block.sourceAssetIds || []) {
    const rows = byAsset.get(assetId) || [];
    for (const cutId of block.cutIds || []) rows.push({cutId, storyId: block.storyId, order: cuts.find((cut) => cut.storyId === block.storyId && cut.cutId === cutId)?.order, treatment: block.treatments?.[cutId], rationale: block.continuityRationale, allowNoncontiguous: block.allowNoncontiguousReuse === true});
    byAsset.set(assetId, rows);
  }
  for (const [assetId, rows] of byAsset) {
    rows.sort((a, b) => a.order - b.order);
    for (let index = 1; index < rows.length; index += 1) {
      if (rows[index].storyId !== rows[index - 1].storyId || rows[index].order !== rows[index - 1].order + 1) {
        if (!rows[index].allowNoncontiguous || !rows[index - 1].allowNoncontiguous) errors.push(`noncontiguous-reuse:${assetId}`);
      }
      if (rows[index].treatment === rows[index - 1].treatment) errors.push(`same-treatment-reuse:${assetId}`);
      if (!rows[index].rationale || !rows[index - 1].rationale) errors.push(`reuse-rationale:${assetId}`);
    }
  }
  for (const asset of assets) {
    if (asset.providerInputStatus !== 'denied' || asset.editScope !== 'local-only') errors.push(`asset-provider:${asset.assetId}`);
    if (!asset.rightsEvidence || !asset.privacyReview) errors.push(`asset-gates:${asset.assetId}`);
  }
  return errors;
}
