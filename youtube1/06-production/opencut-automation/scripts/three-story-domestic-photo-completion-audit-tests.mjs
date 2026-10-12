import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const auditRoot = path.join(root, 'out', 'studies', 'three-story-domestic-photo-completion-audit-v1');
const run = fs.readdirSync(auditRoot, {withFileTypes: true}).filter(entry => entry.isDirectory() && entry.name.startsWith('run-')).sort((a, b) => b.name.localeCompare(a.name))[0];
const audit = JSON.parse(fs.readFileSync(path.join(auditRoot, run.name, 'completion-audit.json')));

function policyErrors(candidate) {
  const errors = [];
  if (new Set(candidate.matrix.map(item => item.assignmentKey)).size !== candidate.matrix.length) errors.push('duplicate-assignment-key');
  for (const asset of candidate.assets) {
    if (asset.captureYear < 2020) errors.push('pre-2020');
    if (asset.domesticOrigin.originCountry !== 'KR' || asset.domesticOrigin.captureCountry !== 'KR' || asset.domesticOrigin.rightsholderCountry !== 'KR') errors.push('non-domestic');
    if (!/^nurse-pesticide-coffee:cut-(001|011)$/u.test(asset.assignmentKey)) errors.push('semantic-cross-bind');
  }
  if (candidate.completion.complete && candidate.counts.blockedRealPhotoCuts > 0) errors.push('false-completion');
  return errors;
}

assert.deepEqual(policyErrors(audit), []);
const foreign = structuredClone(audit); foreign.assets[0].domesticOrigin.captureCountry = 'US'; assert(policyErrors(foreign).includes('non-domestic'));
const old = structuredClone(audit); old.assets[0].captureYear = 2019; assert(policyErrors(old).includes('pre-2020'));
const duplicate = structuredClone(audit); duplicate.matrix[1].assignmentKey = duplicate.matrix[0].assignmentKey; assert(policyErrors(duplicate).includes('duplicate-assignment-key'));
const cross = structuredClone(audit); cross.assets[0].assignmentKey = 'police-father:cut-001'; assert(policyErrors(cross).includes('semantic-cross-bind'));
const falseComplete = structuredClone(audit); falseComplete.completion.complete = true; assert(policyErrors(falseComplete).includes('false-completion'));
console.log('three-story-domestic-photo-completion-audit-tests passed (5 negative cases)');
