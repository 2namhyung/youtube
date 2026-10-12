import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {validateContractObject, validateExclusionObject, validateManifestObject, validateManifestRecord, validatePackage, validateProbeMedia} from '../video/scripts/validate-frame-accurate-motion-contract-v02.mjs';

const root = path.resolve('video/qa/reference-study/frame-accurate-motion-contract-v02');
const read = (id) => JSON.parse(fs.readFileSync(path.join(root,id,'contract.json')));

test('corrected v02 package closes 01-09 motion candidates and excludes sample10', async () => {
  assert.deepEqual(await validatePackage(), []);
});

test('sample02 rejects fixed tanker and card-step substitution', () => {
  const contract = read('sample-02-numeric-step-progression');
  contract.action_contract = contract.action_contract.filter((row) => row.id !== 'tanker-slow-translate');
  contract.forbidden_substitutes = contract.forbidden_substitutes.filter((value) => value !== 'pre-rendered number cards');
  const errors = validateContractObject(contract).join('\n');
  assert.match(errors,/tanker-slow-translate/);
  assert.match(errors,/known numeric substitutes not forbidden/);
});

test('sample03 rejects whole-chart wipe and missing shell/plot phase split', () => {
  const contract = read('sample-03-chart-reveal');
  contract.action_contract.find((row) => row.id === 'series-progress').candidate_operator = 'whole-chart image wipe';
  contract.forbidden_substitutes = [];
  const errors = validateContractObject(contract).join('\n');
  assert.match(errors,/shell\/plot phase split missing/);
  assert.match(errors,/whole-chart wipe not forbidden/);
});

test('sample08 rejects presenter/person action leakage', () => {
  const contract = read('sample-08-speaker-supporting-overlay-entry-corrected');
  contract.action_contract[0].target_ids = ['reserved-presenter-region'];
  const errors = validateContractObject(contract).join('\n');
  assert.match(errors,/person target leaked/);
});

test('sample09 rejects a fabricated phone entry and post-cut montage inclusion', () => {
  const contract = read('sample-09-device-light-focal-motion-corrected');
  contract.action_contract.push({...contract.action_contract[0],id:'phone-entry'});
  contract.forbidden_substitutes = contract.forbidden_substitutes.filter((value) => value !== 'source F156+ montage');
  const errors = validateContractObject(contract).join('\n');
  assert.match(errors,/false device\/person entry claim/);
  assert.match(errors,/post-cut montage exclusion missing/);
});

test('sample10 rejects any Remotion probe or grammar binding', () => {
  const contract = read('sample-10-source-video-selection-exclusion');
  contract.remotion_probe = {path:'invented.mp4'};
  contract.active_grammar_bindings = ['invented-grammar'];
  assert.match(validateExclusionObject(contract).join('\n'),/Remotion action\/probe\/grammar must be empty/);
});

test('all active contracts reject a missing readiness dimension or premature PASS', () => {
  for (const id of fs.readdirSync(root).filter((name) => /^sample-0[1-9]/u.test(name))) {
    const contract = read(id);
    delete contract.reference_readiness_matrix.depth;
    contract.human_reference_calibration_pass = true;
    const errors = validateContractObject(contract).join('\n');
    assert.match(errors,/nine-dimension readiness matrix incomplete/);
    assert.match(errors,/approval\/authority flags must stay false/);
  }
});

test('immutable identity rejects sample number 11 and an ID mutation', () => {
  const contract = read('sample-01-shared-background-accumulation');
  contract.sample_number = 11;
  contract.sample_id = 'sample-11-rebound';
  assert.match(validateContractObject(contract).join('\n'),/sample_number must be one of 1-9/);
});

test('manifest record rejects a canonical ID routed through a noncanonical path', () => {
  const errors=validateManifestRecord({sample_number:1,sample_id:'sample-01-shared-background-accumulation',path:'video/qa/reference-study/elsewhere/contract.json'}).join('\n');
  assert.match(errors,/canonical number\/id\/path allowlist/);
});

test('canonical semantics reject hash-rebound operator and evidence mutations', () => {
  const contract = read('sample-04-map-route-reframe');
  contract.action_contract.find((row) => row.id === 'continuous-map-reframe').candidate_operator = 'hard-cut';
  contract.evidence_binding.probe.sha256 = 'a'.repeat(64);
  const errors = validateContractObject(contract).join('\n');
  assert.match(errors,/canonical action\/operator\/evidence semantics mismatch/);
  assert.match(errors,/canonical evidence path\/hash mismatch/);
});

test('sample08 rejects renamed avatar structure and late action with capped evidence', () => {
  const contract = read('sample-08-speaker-supporting-overlay-entry-corrected');
  contract.component_contract.push({id:'subject-x',role:'supporting',lifecycle:'stable',operator:'avatar-reconstruction',independently_addressable:true});
  contract.action_contract.push({id:'late-overlay',target_ids:['left-tombstone-overlay'],candidate_operator:'target-local-scale/opacity',source_frame_range:{start:200,end:220},evidence_frames:[200,211],observable_only:true,hidden_authoring_claim:false});
  const errors = validateContractObject(contract).join('\n');
  assert.match(errors,/canonical component semantics mismatch/);
  assert.match(errors,/corrected scope must end at F211 with no late action\/evidence/);
});

test('sample09 rejects presenter target and all post-F155 ranges', () => {
  const contract = read('sample-09-device-light-focal-motion-corrected');
  contract.action_contract.push({id:'late-presenter-effect',target_ids:['reserved-presenter-context'],candidate_operator:'silhouette',source_frame_range:{start:150,end:160},evidence_frames:[150,155],observable_only:true,hidden_authoring_claim:false});
  const errors = validateContractObject(contract).join('\n');
  assert.match(errors,/false device\/person entry claim/);
  assert.match(errors,/post-F155 action\/evidence is forbidden/);
});

test('null media dimensions and exit-as-entrance fail closed', () => {
  const contract = read('sample-06-directional-exit-hard-cut-pair');
  contract.source_binding.width = null;
  contract.reference_readiness_matrix.entrance = {observed:true,action_ids:['whole-scene-exit-left'],note:'incorrectly classified exit'};
  const errors = validateContractObject(contract).join('\n');
  assert.match(errors,/canonical source identity\/spec mismatch/);
  assert.match(errors,/entrance must be a nonempty declaration/);
  assert.match(errors,/cannot be classified as entrance/);
});

test('actual static 1920x1080 30fps 300f media is rejected as a motion probe', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'motion-contract-static-')), file=path.join(dir,'static.mp4');
  try {
    const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=black:s=1920x1080:r=30','-frames:v','300','-c:v','libx264','-pix_fmt','yuv420p',file],{windowsHide:true});
    assert.equal(result.status,0);
    assert.match((await validateProbeMedia(file,60)).join('\n'),/static\/replaced probe has no observable pre-hold change/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('sample08 and sample09 reject operator-hypothesis semantic mutation despite hash rebinding', () => {
  for (const id of ['sample-08-speaker-supporting-overlay-entry-corrected','sample-09-device-light-focal-motion-corrected']) {
    const contract = read(id);
    contract.operator_hypotheses[0].candidate_operator = 'plausible-but-unobserved-operator';
    contract.operator_hypotheses[0].alternatives = ['rebound-alternative'];
    contract.evidence_binding.primary_analysis.sha256 = 'b'.repeat(64);
    assert.match(validateContractObject(contract).join('\n'),/validator-owned canonical semantic digest mismatch/);
  }
});

test('all five previously weak readiness semantics are validator-owned for 01-10', () => {
  const mutations = {
    stage:'plausible substituted stage',
    depth:['plausible substituted depth'],
    internal_change:['plausible substituted internal change'],
    transition:['plausible substituted transition'],
    exclusions:['plausible substituted exclusion'],
  };
  for (const id of fs.readdirSync(root).filter((name) => /^sample-(?:0[1-9]|10)/u.test(name))) {
    for (const [dimension,value] of Object.entries(mutations)) {
      const contract = read(id);
      contract.reference_readiness_matrix[dimension] = value;
      const errors = contract.sample_number === 10 ? validateExclusionObject(contract) : validateContractObject(contract);
      assert.match(errors.join('\n'),/validator-owned canonical semantic digest mismatch/,`${id}/${dimension}`);
    }
  }
});

test('sample10 rejects root aliases and nested unknown fields', () => {
  for (const [name,value] of [['remotion_actions',[]],['motion_probe',null]]) {
    const contract = read('sample-10-source-video-selection-exclusion');
    contract[name] = value;
    assert.match(validateExclusionObject(contract).join('\n'),/sample10\/root: unexpected or missing keys/);
  }
  const nested = read('sample-10-source-video-selection-exclusion');
  nested.source_binding.audited_window.motion_probe = null;
  assert.match(validateExclusionObject(nested).join('\n'),/sample10\/source_binding\/audited_window: unexpected or missing keys/);
});

test('manifest rejects unknown root and nested record keys plus semantic rebinding', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
  manifest.alternate_route = true;
  manifest.contracts[0].rebound_hash = 'c'.repeat(64);
  const errors = validateManifestObject(manifest).join('\n');
  assert.match(errors,/manifest\/root: unexpected or missing keys/);
  assert.match(errors,/manifest-record: unexpected or missing keys/);
  assert.match(errors,/validator-owned canonical semantic digest mismatch/);
});

test('frame contract dependency graph is acyclic and cannot point at review or supersession', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
  assert.deepEqual(Object.keys(manifest.upstream),['corrected_suite']);
  assert.doesNotMatch(JSON.stringify(manifest.upstream),/motion-reverse-engineering-review-v02|supersession/u);
  const forged = structuredClone(manifest);
  forged.upstream.corrected_supersession = {path:'video/qa/reference-study/motion-reverse-engineering-review-v02/reference-calibration-supersession.json',sha256:'a'.repeat(64),bytes:1};
  assert.match(validateManifestObject(forged).join('\n'),/manifest\/upstream: unexpected or missing keys/);
});
