import assert from 'node:assert/strict';
import {CONDITIONAL_DISCLOSURE, PHOTO_RISK, validatePhotoAssignment, validateStoryReuse} from './newsroom-photo-risk-v1.mjs';

const valid = {assignmentKey: 'story:cut-001', riskTier: PHOTO_RISK.CONDITIONAL, copyrightUseStatus: 'cleared-with-attribution', editorialContextStatus: 'illustrative-only', youtubeOriginalityStatus: 'transform-required', claimRisk: 'low-with-disclosure', coverageEligible: true, disclosure: CONDITIONAL_DISCLOSURE, narrationConceptMatch: true, actualEvidenceClaim: false, actualLocationClaim: false, actualPartyClaim: false, identifiesPrivatePerson: false, identifiesMinor: false, identifiesVictim: false, identifiesSuspect: false, providerInputStatus: 'denied', editScope: 'local-only', sourceUrl: 'https://example.invalid/item', licenseCode: 'CC-BY-4.0', claimRationale: 'generic object matches narration concept', yppTransformation: {substantialNarration: true, authoredMotion: true, motionPlan: 'wide-pan-left-plus-3-percent-zoom', annotation: true, staticSlideshow: false, minimalEdit: false}, displaySha256: 'a', sourceSha256: 'b', pHash: 'c', order: 1, durationSeconds: 3, continuityRationale: 'same beat', authoredFramingId: 'wide'};
assert.deepEqual(validatePhotoAssignment(valid), []);
assert(validatePhotoAssignment({...valid, disclosure: ''}).includes('conditional-disclosure'));
assert(validatePhotoAssignment({...valid, actualPartyClaim: true}).includes('conditional-claim-boundary'));
assert(validatePhotoAssignment({...valid, identifiesMinor: true}).includes('conditional-person-boundary'));
assert(validatePhotoAssignment({...valid, yppTransformation: {...valid.yppTransformation, minimalEdit: true}}).includes('ypp-static-or-minimal'));
assert(validatePhotoAssignment({...valid, visualClass: 'film-camera'}).includes('conditional-legacy-visual'));
assert(validatePhotoAssignment({...valid, yppTransformation: {...valid.yppTransformation, substantialNarration: false}}).includes('ypp-transformation'));
assert(validatePhotoAssignment({...valid, yppTransformation: {...valid.yppTransformation, motionPlan: 'static-frame'}}).includes('ypp-transformation'));
assert(validatePhotoAssignment({...valid, providerInputStatus: 'allowed'}).includes('conditional-local-only'));
assert(validatePhotoAssignment({...valid, riskTier: PHOTO_RISK.DENY}).includes('deny-cannot-cover'));
assert(validateStoryReuse([valid, {...valid, assignmentKey: 'story:cut-003', order: 3, authoredFramingId: 'close'}], 30).some(error => error.startsWith('source-reuse-noncontiguous')));
assert(validateStoryReuse([valid, {...valid, assignmentKey: 'story:cut-002', order: 2}], 30).some(error => error.startsWith('source-reuse-framing')));
assert(validateStoryReuse([valid, {...valid, assignmentKey: 'story:cut-002', order: 2, authoredFramingId: 'close'}, {...valid, assignmentKey: 'story:cut-003', order: 3, authoredFramingId: 'detail'}], 60).some(error => error.startsWith('source-reuse-count')));
console.log('newsroom-photo-risk-v1-tests passed (12 negative gates)');
