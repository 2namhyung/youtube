import crypto from 'node:crypto';

export const sha256Text = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');

export function applyAuthoritativeRevision(script, revision) {
  if (!script || script.status !== 'final' || typeof script.draft !== 'string') throw new Error('Authoritative revision requires a finalized script.');
  if (!revision || revision.newsroomSlug !== script.slug || typeof revision.revisionId !== 'string') throw new Error('Revision identity does not match the authoritative script.');
  const currentSha256 = sha256Text(script.draft);
  if (script.revision?.revisionId === revision.revisionId && script.revision?.draftSha256 === currentSha256) return script;
  if (currentSha256 !== revision.expectedDraftSha256) throw new Error(`Authoritative draft precondition failed: ${currentSha256}`);
  if (typeof revision.findText !== 'string' || typeof revision.replacementText !== 'string' || !revision.findText || !revision.replacementText) throw new Error('Revision requires exact find and replacement text.');
  const first = script.draft.indexOf(revision.findText);
  if (first < 0 || first !== script.draft.lastIndexOf(revision.findText)) throw new Error('Revision target must occur exactly once.');
  const draft = `${script.draft.slice(0, first)}${revision.replacementText}${script.draft.slice(first + revision.findText.length)}`;
  for (const phrase of revision.protectedExactPhrases ?? []) {
    if (typeof phrase !== 'string' || !script.draft.includes(phrase) || !draft.includes(phrase)) throw new Error(`Protected fact or tone phrase changed: ${phrase}`);
  }
  const draftSha256 = sha256Text(draft);
  const previousRevision = script.revision ?? null;
  return {
    ...script,
    draft,
    finalizedAt: revision.appliedAt,
    revision: {
      schemaVersion: 'authoritative-script-revision-v1',
      revisionId: revision.revisionId,
      previousDraftSha256: currentSha256,
      draftSha256,
      appliedAt: revision.appliedAt,
      requestedBy: revision.requestedBy,
      reason: revision.reason,
      scope: 'exact-editorial-replacement; facts-and-victim-impact-ending-preserved',
      protectedExactPhrases: revision.protectedExactPhrases ?? [],
      creator: 'scripts/revise-authoritative-script.mjs',
      verifier: 'scripts/authoritative-script-revision-lib.mjs',
      sourceRestoration: script.restoration ?? null,
      previousRevision,
    },
  };
}
