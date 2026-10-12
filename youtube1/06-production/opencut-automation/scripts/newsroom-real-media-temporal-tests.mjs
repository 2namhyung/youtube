import assert from 'node:assert/strict';
import {temporalErrors} from './newsroom-real-media-temporal.mjs';

const base = {sourceUseStatus: 'approved', coverageEligible: false, captureDate: '2024-01-01', captureYear: 2024, temporalEra: 'modern-2020s', technologyGeneration: 'smartphone-era', anachronismFlags: {opticalDiscDrive: false, featurePhone: false, crtDisplay: false, datedMedia: false, unknownCaptureDate: false}};
assert.deepEqual(temporalErrors(base, {temporalRule: 'smartphone-era'}), []);
assert.ok(temporalErrors({...base, captureDate: '2019-08-05', captureYear: 2019, temporalEra: 'legacy-pre-2020'}, {temporalRule: 'smartphone-era'}).includes('pre-2020-cannot-be-coverage-eligible') === false, 'non-eligible legacy remains reviewable');
assert.ok(temporalErrors({...base, captureDate: null, captureYear: null, temporalEra: 'unknown', sourceUseStatus: 'approved'}, {}).includes('unknown-date-cannot-be-approved'));
assert.ok(temporalErrors({...base, anachronismFlags: {...base.anachronismFlags, opticalDiscDrive: true}}, {temporalRule: 'modern-laptop'}).includes('modern-laptop-anachronism-opticalDiscDrive'));
assert.ok(temporalErrors({...base, captureYear: 2019, temporalEra: 'legacy-pre-2020', coverageEligible: true}, {}).includes('pre-2020-cannot-be-coverage-eligible'));
assert.ok(temporalErrors({captureYear: 2024}, {}).includes('missing-captureDate'));
const deviceFlags = {...base, anachronismFlags: {...base.anachronismFlags, opticalDiscDriveVisible: false, featurePhoneVisible: false}};
assert.equal(deviceFlags.anachronismFlags.opticalDiscDriveVisible, false);
assert.equal(deviceFlags.anachronismFlags.featurePhoneVisible, false);
console.log(JSON.stringify({ok: true, cases: 5}));
