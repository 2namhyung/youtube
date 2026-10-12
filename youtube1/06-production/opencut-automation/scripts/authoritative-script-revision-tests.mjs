import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyAuthoritativeRevision, sha256Text } from './authoritative-script-revision-lib.mjs';

const before = '사실 A.\n형이 줄었습니다.\n형량은 줄었습니다.\n피해자는 어떻게 살아갈까요?\n사실 B.';
const revision = {
  revisionId: 'fixture-v1', newsroomSlug: 'fixture-story', productionProjectId: 'fixture-project', expectedDraftSha256: sha256Text(before), appliedAt: '2026-08-08T00:00:00.000Z', requestedBy: 'user-editorial-action', reason: 'remove repetition',
  findText: '형이 줄었습니다.\n형량은 줄었습니다.\n피해자는 어떻게 살아갈까요?', replacementText: '감형됐습니다.\n피해자는 그 이후를 어떻게 살아갈까요?', protectedExactPhrases: ['사실 A.', '사실 B.'],
};
const result = applyAuthoritativeRevision({ slug: 'fixture-story', status: 'final', draft: before, finalizedAt: 'old', restoration: { restoredDraftSha256: sha256Text(before) } }, revision);
assert.equal(result.draft, '사실 A.\n감형됐습니다.\n피해자는 그 이후를 어떻게 살아갈까요?\n사실 B.');
assert.equal(result.revision.previousDraftSha256, sha256Text(before));
assert.equal(result.revision.draftSha256, sha256Text(result.draft));
assert.equal(result.revision.creator, 'scripts/revise-authoritative-script.mjs');
assert.deepEqual(applyAuthoritativeRevision(result, revision), result, 'revision must be idempotent');
assert.throws(() => applyAuthoritativeRevision({ slug: 'fixture-story', status: 'final', draft: `${before}!` }, revision), /precondition failed/);
assert.throws(() => applyAuthoritativeRevision({ slug: 'fixture-story', status: 'final', draft: before }, { ...revision, protectedExactPhrases: ['missing fact'] }), /Protected fact/);

const liveScript = JSON.parse(fs.readFileSync(new URL('../production/projects/coffee-pesticide-hospital-short-v1/script.final.json', import.meta.url)));
const liveConfig = JSON.parse(fs.readFileSync(new URL('../production/newsroom/script-revisions.json', import.meta.url)));
JSON.parse(fs.readFileSync(new URL('../production/authoritative-script-revision.schema.json', import.meta.url)));
JSON.parse(fs.readFileSync(new URL('../production/newsroom/authoritative-script-revisions.schema.json', import.meta.url)));
assert.equal(liveConfig.revisions.length, 1);
assert.equal(liveScript.revision.revisionId, 'coffee-suspense-transition-v2');
assert.equal(liveScript.revision.draftSha256, sha256Text(liveScript.draft));
assert.equal(liveScript.revision.sourceRestoration.restoredDraftSha256, '740d18db54134f4bee1db672bebaa50c3a8ce7396ffb19b1fcb8ab6acc317a8d');
assert.deepEqual(applyAuthoritativeRevision(liveScript, liveConfig.revisions[0]), liveScript, 'the live creator input must remain idempotent');
console.log('authoritative script revision tests passed');
