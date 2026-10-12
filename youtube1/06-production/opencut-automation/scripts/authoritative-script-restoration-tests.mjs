import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { restoreAuthoritativeDraft } from './authoritative-script-restoration.mjs';

const original = '검찰은 살인미수를 주장했지만 법원이 인정한 건 특수상해였습니다.';
const normalized = '검찰은 사람을 죽이려 한 행동을 주장했지만 법원이 인정한 건 위험한 물질로 동료를 다치게 한 책임이었습니다.';
const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const script = {
  status: 'final',
  draft: normalized,
  normalization: {
    spokenOnlyOverride: false,
    inputDraftSha256: sha256(original),
    outputDraftSha256: sha256(normalized),
    applications: [
      { ruleId: 'attempt', source: '살인미수', sourceSuffix: '를', target: '사람을 죽이려 한 행동', targetSuffix: '을', sourceIndex: 4 },
      { ruleId: 'injury', source: '특수상해', sourceSuffix: '였습니다.', target: '위험한 물질로 동료를 다치게 한 책임', targetSuffix: '이었습니다.', sourceIndex: 34 },
    ],
  },
};
const restored = restoreAuthoritativeDraft(script);
assert.equal(restored.draft, original);
assert.equal(restored.restoration.restoredDraftSha256, sha256(original));
assert.deepEqual(restored.restoration.removedRuleIds, ['attempt', 'injury']);
assert.equal(restored.restoration.exactCharacterRestoration, true);
assert.equal('normalization' in restored, false);
assert.throws(() => restoreAuthoritativeDraft({ ...script, draft: `${normalized}!` }), /Normalized authoritative draft SHA-256 mismatch/);
assert.throws(() => restoreAuthoritativeDraft({ ...script, normalization: { ...script.normalization, inputDraftSha256: '0'.repeat(64) } }), /Restored authoritative draft SHA-256 mismatch/);
console.log('authoritative script restoration tests passed');
