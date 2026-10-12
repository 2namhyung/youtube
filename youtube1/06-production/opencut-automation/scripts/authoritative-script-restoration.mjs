import crypto from 'node:crypto';

const sha256Text = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');

export function restoreAuthoritativeDraft(script) {
  if (!script || script.status !== 'final' || typeof script.draft !== 'string') throw new Error('Authoritative restoration requires a finalized script');
  const normalization = script.normalization;
  if (!normalization || normalization.spokenOnlyOverride !== false || !Array.isArray(normalization.applications) || !normalization.applications.length) throw new Error('Authoritative restoration requires normalization provenance');
  if (sha256Text(script.draft) !== normalization.outputDraftSha256) throw new Error('Normalized authoritative draft SHA-256 mismatch');
  let restoredDraft = script.draft;
  for (const application of [...normalization.applications].reverse()) {
    const sourceIndex = Number(application.sourceIndex);
    const normalizedText = `${String(application.target || '')}${String(application.targetSuffix || '')}`;
    const originalText = `${String(application.source || '')}${String(application.sourceSuffix || '')}`;
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || !normalizedText || !originalText || restoredDraft.slice(sourceIndex, sourceIndex + normalizedText.length) !== normalizedText) throw new Error(`Cannot reverse normalization application: ${application.ruleId || 'unknown'}`);
    restoredDraft = `${restoredDraft.slice(0, sourceIndex)}${originalText}${restoredDraft.slice(sourceIndex + normalizedText.length)}`;
  }
  const restoredDraftSha256 = sha256Text(restoredDraft);
  if (restoredDraftSha256 !== normalization.inputDraftSha256) throw new Error('Restored authoritative draft SHA-256 mismatch');
  const normalizationEvidenceSha256 = sha256Text(JSON.stringify(normalization));
  const { normalization: _removed, restoration: _previous, ...base } = script;
  return {
    ...base,
    draft: restoredDraft,
    restoration: {
      schema: 'authoritative-script-restoration-v1',
      mode: 'restore-pre-normalization-authoritative-draft',
      normalizedDraftSha256: normalization.outputDraftSha256,
      restoredDraftSha256,
      normalizationEvidenceSha256,
      removedRuleIds: normalization.applications.map(({ ruleId }) => ruleId),
      exactCharacterRestoration: true,
      spokenOnlyOverride: false,
      creator: 'scripts/restore-authoritative-script.mjs',
    },
  };
}
