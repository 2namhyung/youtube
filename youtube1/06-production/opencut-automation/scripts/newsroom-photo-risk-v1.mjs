export const PHOTO_RISK = Object.freeze({
  SAFE: 'SAFE',
  CONDITIONAL: 'CONDITIONAL_EDITORIAL_ILLUSTRATIVE',
  DENY: 'HIGH_RISK_DENY',
});

export const CONDITIONAL_DISCLOSURE = '자료사진 · 사건과 무관';
export const DENIED_LEGACY_CLASSES = Object.freeze([
  'film-camera',
  'optical-disc-drive',
  'feature-phone',
  'crt-display',
  'old-document',
  'pre-2020-current-device',
]);

export function validatePhotoAssignment(row) {
  const errors = [];
  if (!row || typeof row !== 'object') return ['row-required'];
  if (!/^[^:]+:cut-\d{3}$/u.test(row.assignmentKey || '')) errors.push('composite-assignment-key');
  if (!Object.values(PHOTO_RISK).includes(row.riskTier)) errors.push('risk-tier');
  for (const key of ['copyrightUseStatus', 'editorialContextStatus', 'youtubeOriginalityStatus', 'claimRisk']) {
    if (typeof row[key] !== 'string' || !row[key]) errors.push(key);
  }
  if (row.riskTier === PHOTO_RISK.DENY && row.coverageEligible) errors.push('deny-cannot-cover');
  if (row.riskTier === PHOTO_RISK.CONDITIONAL) {
    if (row.disclosure !== CONDITIONAL_DISCLOSURE) errors.push('conditional-disclosure');
    if (!row.narrationConceptMatch) errors.push('conditional-concept-match');
    if (row.actualEvidenceClaim || row.actualLocationClaim || row.actualPartyClaim) errors.push('conditional-claim-boundary');
    if (row.identifiesPrivatePerson || row.identifiesMinor || row.identifiesVictim || row.identifiesSuspect) errors.push('conditional-person-boundary');
    if (row.providerInputStatus !== 'denied' || row.editScope !== 'local-only') errors.push('conditional-local-only');
    if (!row.sourceUrl || !row.licenseCode || !row.claimRationale) errors.push('conditional-evidence');
    if (row.visualClass && DENIED_LEGACY_CLASSES.includes(row.visualClass)) errors.push('conditional-legacy-visual');
  }
  if (row.coverageEligible) {
    if (!['cleared', 'cleared-with-attribution'].includes(row.copyrightUseStatus)) errors.push('copyright-not-cleared');
    if (!row.yppTransformation?.substantialNarration || !row.yppTransformation?.authoredMotion || !row.yppTransformation?.annotation || !/(?:pan|zoom)/iu.test(row.yppTransformation?.motionPlan || '')) errors.push('ypp-transformation');
    if (row.yppTransformation?.staticSlideshow || row.yppTransformation?.minimalEdit) errors.push('ypp-static-or-minimal');
    if (!row.displaySha256 || !row.sourceSha256 || !row.pHash) errors.push('media-hashes');
  }
  return errors;
}

export function validateStoryReuse(rows, totalDurationSeconds) {
  const errors = [];
  const bySource = new Map();
  for (const row of rows.filter(item => item.coverageEligible)) {
    const bucket = bySource.get(row.sourceSha256) || [];
    bucket.push(row);
    bySource.set(row.sourceSha256, bucket);
  }
  for (const [sourceSha256, bucket] of bySource) {
    bucket.sort((a, b) => a.order - b.order);
    if (bucket.length > 2) errors.push(`source-reuse-count:${sourceSha256}`);
    if (bucket.length === 2) {
      if (bucket[1].order !== bucket[0].order + 1) errors.push(`source-reuse-noncontiguous:${sourceSha256}`);
      if (!bucket.every(item => item.continuityRationale && item.authoredFramingId)) errors.push(`source-reuse-attestation:${sourceSha256}`);
      if (bucket[0].authoredFramingId === bucket[1].authoredFramingId) errors.push(`source-reuse-framing:${sourceSha256}`);
    }
    const duration = bucket.reduce((sum, item) => sum + item.durationSeconds, 0);
    if (duration / totalDurationSeconds > 0.15 + 1e-9) errors.push(`source-duration-cap:${sourceSha256}`);
    if (new Set(bucket.map(item => item.sourceSha256)).size !== 1) errors.push(`derivative-primary:${sourceSha256}`);
  }
  return errors;
}
