"""Synthetic unit checks of the design reference, not tests of any upstream app."""
import unittest
import json
from copy import deepcopy
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from validate_design import validate, apply_selection_patch, ContractError

BASE=json.loads((ROOT/'examples/scene-plan.json').read_text(encoding='utf-8'))
def ready_record():
    p=deepcopy(BASE)
    p['script']['spokenApproval']='approved'
    for s in p['scenes']:s['approval']='approved'
    p['compiledTimeline']={'audioTakeId':'audio_test','audioSha256':'0'*64,
      'sourceSpokenSha256':p['script']['spokenSha256'],'status':'reviewed','totalFrames':405,
      'clips':[{'sceneId':'scene_1','startFrame':0,'durationFrames':135},
        {'sceneId':'scene_2','startFrame':135,'durationFrames':150},
        {'sceneId':'scene_3','startFrame':285,'durationFrames':120}]}
    return p
class ContractTests(unittest.TestCase):
    def setUp(self):self.p=deepcopy(BASE)
    def reject(self,p=None,publish=False):
        with self.assertRaises(ContractError):validate(self.p if p is None else p,publish=publish)
    def test_valid_draft(self):validate(self.p)
    def test_unique_ids(self):self.p['scenes'][1]['id']='scene_1';self.reject()
    def test_raw_hash(self):self.p['script']['rawText']+='X';self.reject()
    def test_spoken_hash(self):self.p['script']['spokenText']+='X';self.reject()
    def test_exact_span(self):self.p['script']['segments'][0]['text']='바뀐 대본';self.reject()
    def test_source_coverage(self):self.p['beats'][1]['segmentIds']=['seg_1'];self.reject()
    def test_selected_candidate(self):self.p['scenes'][0]['selectedCandidateId']='invented';self.reject()
    def test_unknown_template(self):self.p['scenes'][0]['candidates'][0]['layers'][0]['templateId']='invented';self.reject()
    def test_arbitrary_code_props(self):self.p['scenes'][0]['candidates'][0]['layers'][0]['props']['javascript']='alert(1)';self.reject()
    def test_invalid_motion_anchor(self):self.p['scenes'][0]['candidates'][0]['cues'][0]['phrase']='없는 문구';self.reject()
    def test_unknown_asset(self):self.p['requirements'][0]['assetId']='invented';self.reject()
    def test_supported_claim_needs_evidence(self):
        self.p['claims']=[{'id':'claim_test','text':'합성 테스트 주장','kind':'factual','status':'supported','evidenceIds':[]}];self.reject()
    def test_draft_cannot_publish(self):self.reject(publish=True)
    def test_synthetic_ready_records(self):validate(ready_record(),publish=True)
    def test_factual_claim_blocks_publish(self):
        p=ready_record();p['claims']=[{'id':'claim_test','text':'합성 테스트 주장','kind':'factual','status':'unverified','evidenceIds':[]}];self.reject(p,True)
    def test_unresolved_selected_asset_blocks_publish(self):
        p=ready_record();p['scenes'][0]['selectedCandidateId']='option_1_stock';self.reject(p,True)
    def test_unknown_rights_blocks_publish(self):
        p=ready_record();p['scenes'][0]['selectedCandidateId']='option_1_stock';p['requirements'][0]['assetId']='test_asset'
        p['assets']=[{'id':'test_asset','mediaType':'video','acquisition':'upload','sourceUri':None,
          'localPath':'synthetic-fixture-no-real-file.mp4','contentSha256':'0'*64,'availability':'available',
          'rights':{'status':'unknown','decisionId':None,'basis':None,'licenseUri':None,'checkedAt':None,'creditText':'','allowCloudAnalysis':False}}]
        self.reject(p,True)
    def test_frame_gap(self):
        p=ready_record();p['compiledTimeline']['clips'][1]['startFrame']+=1;self.reject(p)
    def test_stale_audio_alignment(self):
        p=ready_record();p['compiledTimeline']['sourceSpokenSha256']='1'*64;self.reject(p)
    def test_stale_patch(self):
        with self.assertRaises(ContractError):apply_selection_patch(self.p,base_revision=2,scene_id='scene_1',candidate_id='option_1_stock')
    def test_locked_patch(self):
        self.p['scenes'][0]['lockedFields']=['selectedCandidateId']
        with self.assertRaises(ContractError):apply_selection_patch(self.p,base_revision=1,scene_id='scene_1',candidate_id='option_1_stock')
    def test_valid_patch_preserves_narration(self):
        updated=apply_selection_patch(self.p,base_revision=1,scene_id='scene_1',candidate_id='option_1_stock')
        self.assertEqual(updated['script'],self.p['script'])
        self.assertEqual(updated['revision'],2)
        self.assertEqual(self.p['scenes'][0]['selectedCandidateId'],'option_1_cards')
    def test_selection_invalidates_approval(self):
        updated=apply_selection_patch(ready_record(),base_revision=1,scene_id='scene_1',candidate_id='option_1_stock')
        self.assertEqual(updated['scenes'][0]['approval'],'draft')
        self.assertEqual(updated['compiledTimeline']['status'],'aligned')
if __name__=='__main__':unittest.main()
