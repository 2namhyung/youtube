import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceFirstProgressionStatus,validateV3RealMediaProgression,validateV3FictionDeclaration,requiresV3FictionalNotice} from '../video/scripts/source-first-progression-policy.mjs';

const approved = () => ({requirement_id:'source',kind:'source-original',asset_id:'photo',source_id:'SOURCE-A',status:'approved',approved_media_asset_id:7,materialization_record_path:'video/episodes/episode-001/ledger.json',approved_source:{original_url:'https://example.org/source',license:'CC0',sha256:'a'.repeat(64)}});
const cut = (requirements) => ({shot_id:'SH001',production_mode:'source-photo',source_ids:['SOURCE-A'],requirements});

test('v3 blocked candidate requires an explicit blocked search gap',()=>{
  assert.match(validateV3RealMediaProgression(cut([]),'candidate-plan-blocked')[0],/blocked source gap/u);
  assert.deepEqual(validateV3RealMediaProgression(cut([{kind:'source-original',source_id:'SOURCE-SEARCH-SH001',status:'blocked',blocker:'source missing'}]),'candidate-plan-blocked'),[]);
  assert.notDeepEqual(validateV3RealMediaProgression(cut([{source_id:'SOURCE-SEARCH-SH001',status:'approved'}]),'candidate-plan-blocked'),[]);
});
test('v3 selected real media requires material approval, provenance and a ledger, with no unresolved requirement',()=>{
  assert.notDeepEqual(validateV3RealMediaProgression(cut([]),'source-selected-editorial-plan'),[]);
  assert.notDeepEqual(validateV3RealMediaProgression(cut([approved(),{status:'blocked',blocker:'later'}]),'source-selected-editorial-plan'),[]);
  assert.notDeepEqual(validateV3RealMediaProgression(cut([{...approved(),materialization_record_path:null}]),'source-selected-editorial-plan'),[]);
  assert.notDeepEqual(validateV3RealMediaProgression(cut([{...approved(),approved_source:null}]),'source-selected-editorial-plan'),[]);
  assert.notDeepEqual(validateV3RealMediaProgression(cut([{...approved(),source_id:'OTHER'}]),'source-selected-editorial-plan'),[]);
  assert.deepEqual(validateV3RealMediaProgression(cut([approved()]),'source-selected-editorial-plan'),[]);
});
test('v2 and v3 progressed statuses are distinct and blocked phases never activate',()=>{
  assert.equal(sourceFirstProgressionStatus('ep001-narrative-source-first-v3','source-selected-editorial-plan','approved-script-narrative-source-first-plan'),true);
  assert.equal(sourceFirstProgressionStatus('ep001-narrative-source-first-v3','source-selected-editorial-plan','approved-script-source-first-semantic-plan'),false);
  assert.equal(sourceFirstProgressionStatus('ep001-source-first-semantic-v2','source-selected-editorial-plan','approved-script-source-first-semantic-plan'),true);
  assert.equal(sourceFirstProgressionStatus('ep001-source-first-semantic-v2','source-selected-editorial-plan','approved-script-narrative-source-first-plan'),false);
  assert.equal(sourceFirstProgressionStatus('ep001-narrative-source-first-v3','candidate-plan-blocked','approved-script-narrative-source-first-plan'),false);
});
test('no-fiction v3 has no opening notice; phantom or mismatched fiction declaration fails while Omni remains declared',()=>{
  assert.deepEqual(validateV3FictionDeclaration([cut([approved()])],[]),[]);
  assert.equal(requiresV3FictionalNotice([cut([approved()])],[]),false);
  assert.notDeepEqual(validateV3FictionDeclaration([cut([approved()])],['SH001']),[]);
  assert.equal(requiresV3FictionalNotice([cut([approved()])],['SH001']),true);
  assert.notDeepEqual(validateV3FictionDeclaration([{...cut([approved()]),source_need_taxonomy:'fictional-continuity'}],[]),[]);
  assert.notDeepEqual(validateV3FictionDeclaration([{shot_id:'SH004',production_mode:'omni',source_need_taxonomy:'fictional-continuity'}],[]),[]);
  assert.deepEqual(validateV3FictionDeclaration([{shot_id:'SH004',production_mode:'omni',source_need_taxonomy:'fictional-continuity'}],['SH004']),[]);
  assert.equal(requiresV3FictionalNotice([{shot_id:'SH004',production_mode:'omni'}],['SH004']),true);
});
