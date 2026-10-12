import json
import math
import struct
import wave
import zipfile
from pathlib import Path
import pytest
from apps.api.store import Gate
from tests.helpers import Studio
from workers.media.engine import Media


def run_smoke(root):
    s = Studio(root)
    try:
        s.create(name='전체 8단계 · 합성 검증'); s.evidence()
        from tests.test_contracts import snapshots
        discovery = snapshots()
        for row in discovery['snapshots']:
            row['receipt_id'] = s.receipt
        discovery['attestation'] = s.att
        s.stage('discovery', discovery)
        s.product()
        s.stage('queries', {'queries': {lang: [f'BOX-TEST-01 {term}'] for lang, term in [('ko','접기'),('en','folding'),('zh','折叠'),('ja','折りたたみ')]}, 'attestation': s.att})
        media = Media(s.store)
        work = root / 'work' / 'smoke-sources'; work.mkdir(exist_ok=True)
        shot_ids = []
        for i in range(2):
            source = work / f'source-{i}.mp4'
            media.run([media.ffmpeg, '-v','error','-y','-f','lavfi','-i',f'testsrc2=size=640x360:rate=30:duration=2',
                       '-vf',f'hue=h={i*90}', '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',source], work)
            result = s.stage('ingest', {'blob_id':s.upload(source), 'rights':{'license':'OWNED','license_url':'fixture://generated',
                'author':'integration-test','source_url':'fixture://lavfi','statement':'Generated synthetic pattern, test-only',
                'acquisition_basis':'Local FFmpeg test source','receipt_ids':[s.receipt],'provider_input_allowed':False}})
            shot_id = result['output']['shot_ids'][0]; shot_ids.append(shot_id)
            shot = s.store.get(shot_id)['data']
            observation = {'shot_id':shot_id,'description':'합성 색상 테스트 패턴','action':'테스트 도형의 움직임','usage_role':'EXACT_PRODUCT',
                'product_model':'BOX-TEST-01','product_variant':'white-10L','product_match':'same_model_same_variant','clear':True,'uncertain':False,
                'start_frame':10,'end_frame':35,'frame_ids':[f['blob_id'] for f in shot['frames']], 'attestation':s.att}
            if i == 0:
                bad = {**observation,'product_model':'LOOKALIKE'}
                assert s.stage('observe',bad,'FAILED')['error']['code']=='PRODUCT_MISMATCH'
                bad = {**observation,'frame_ids':['missing']*3}
                assert s.stage('observe',bad,'FAILED')['error']['code']=='FRAME_BINDING'
            s.stage('observe',observation)
        product = s.store.project(s.pid)['state']['product_id']
        script = {'title':'수납함 이야기 · 합성 검증','reference_based':False,'reference_receipt_ids':[],
                  'beats':[{'id':f'beat{i+1}','spoken_text':text,'caption_text':text,'role':'hook' if i==0 else 'use',
                            'claim_ids':['folds'],'shot_ids':[shot_ids[i]],'usage_role':'EXACT_PRODUCT','estimated_frames':45}
                           for i,text in enumerate(['작은 공간을 다시 살펴봐요.','접는 장면을 확인해 보세요.'])], 'attestation':s.att}
        s.stage('script',script)
        sid = s.store.project(s.pid)['state']['script_id']
        s.stage('timeline',{'lock':False,'layouts':{}})
        assert s.stage('render',{},'FAILED')['error']['code']=='TIMELINE_NOT_LOCKED'
        s.review(sid)
        segments=[]
        for i in range(2):
            audio = work / f'voice-{i}.wav'
            with wave.open(str(audio),'wb') as wav:
                wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(48000)
                wav.writeframes(b''.join(struct.pack('<h',int(3500*math.sin(2*math.pi*(440+i*100)*n/48000))) for n in range(72000)))
            segments.append({'beat_id':f'beat{i+1}','blob_id':s.upload(audio)})
        voice = {'profile':'synthetic-tone-not-a-human-voice','script_id':sid,'segments':segments,'pronunciation_checked':True,'attestation':s.att}
        assert s.stage('voice',{**voice,'script_id':'stale'},'FAILED')['error']['code']=='STALE_SCRIPT'
        s.stage('voice',voice)
        sfx = work / 'effect.wav'
        with wave.open(str(sfx), 'wb') as wav:
            wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(48000)
            wav.writeframes(b''.join(struct.pack('<h',int(1000*math.sin(2*math.pi*880*n/48000))) for n in range(12000)))
        sound = s.stage('sound', {'blob_id':s.upload(sfx),'name':'합성 강조음','tags':['test'],
            'rights':{'license':'OWNED','license_url':'fixture://generated','author':'integration-test','source_url':'fixture://sine',
                      'statement':'Generated sine test sound','acquisition_basis':'Local synthetic waveform','receipt_ids':[s.receipt]}})['output']['id']
        assert s.stage('timeline',{'lock':True,'layouts':{'beat1':{'mode':'crop','x':600,'y':0,'width':300,'height':360}}},'FAILED')['error']['code']=='CROP_BOUNDS'
        assert s.stage('timeline',{'lock':True,'layouts':{},'sfx':[{'sound_id':sound,'beat_id':'beat2','offset_samples':70000}]},'FAILED')['error']['code']=='SFX_RANGE'
        s.stage('timeline',{'lock':True,'layouts':{'beat2':{'mode':'crop','x':218,'y':0,'width':202,'height':360,'background':'#141A19'}},
                            'sfx':[{'sound_id':sound,'beat_id':'beat2','offset_samples':8000,'gain_db':-12,'fade_in_samples':240,'fade_out_samples':480}]})
        render = s.stage('render',{})
        rid = s.store.project(s.pid)['state']['render_id']
        assert render['output']['data']['technical_pass'] is True
        assert 'export_id' not in s.store.project(s.pid)['state']
        s.review(rid)
        p=s.store.project(s.pid)
        exp=s.store.get(p['state']['export_id'])
        file=s.store.blob(exp['data']['blob_id'])
        with zipfile.ZipFile(file) as archive:
            assert set(archive.namelist())=={'final.mp4','captions.srt','script.json','timeline.json','source_manifest.json','credits.txt','qa_report.json','SHA256SUMS.json'}
            qa=json.loads(archive.read('qa_report.json'))
            assert qa['evidence_level']=='synthetic-integration-test'
        response=s.client.get(f"/v1/files/{exp['data']['blob_id']}?download=true")
        assert response.status_code==200
        timeline=s.store.get(p['state']['timeline_id'])['data']
        assert timeline['total_frames']==90 and timeline['total_samples']==144000
        assert [c['layout']['mode'] for c in timeline['clips']]==['fit','crop']
        assert len(timeline['audio_tracks']) == 2 and timeline['audio_tracks'][1]['timeline_start_sample'] == 80000
        result={'project_id':s.pid,'render_id':rid,'export_id':exp['id'],'export_blob_id':exp['data']['blob_id'],
                'video_blob_id':render['output']['data']['video_blob_id'],'frames':90,'dimensions':[1080,1920],'fps':30,
                'audio_sample_rate':48000,'layouts':['fit','crop'],'sfx_mixed':True,'stages_completed':8,'publication_authorized':False,
                'evidence_level':'synthetic-only','real_luna_or_jev_called':False,'sha256':s.store.get(render['output']['data']['video_blob_id'])['data']['sha256']}
        # Test revocation against a separate receipt to leave the demo inspectable.
        with s.store.transaction() as db:
            db.execute("INSERT INTO revocations VALUES('revoke-test',?,?,?)",(s.receipt,'test withdrawal','2026-09-22'))
        assert s.client.get(f"/v1/files/{exp['data']['blob_id']}").status_code==422
        with s.store.transaction() as db:
            db.execute("DELETE FROM revocations WHERE id='revoke-test'")
        return result
    finally:
        s.store.close()


def test_real_decode_and_two_layouts(tmp_path):
    result=run_smoke(tmp_path/'studio')
    assert result['frames']==90


def test_vfr_sar_normalization_mapping_and_hdr_gate(tmp_path):
    s=Studio(tmp_path/'normalized')
    try:
        media=Media(s.store)
        work=s.store.root/'work'/'vfr';work.mkdir()
        source=work/'vfr.mp4'
        media.run([media.ffmpeg,'-v','error','-y','-f','lavfi','-i','testsrc2=size=320x240:rate=24:duration=2',
                   '-vf',"select='not(mod(n,3))',setsar=4/3",'-fps_mode','vfr','-c:v','libx264','-preset','ultrafast',source],work)
        result=media.ingest(s.upload(source),work)
        assert result['width']==426 and result['height']==240
        assert result['master_probe']['streams'][0]['sample_aspect_ratio']=='1:1'
        mapping=json.loads(s.store.blob(result['time_map_blob_id']).read_text())
        frames=mapping['master_frame_to_source_frame']
        assert len(frames)==result['frame_count'] and frames==sorted(frames)
        assert max(frames)<len(mapping['source_pts_ticks'])
        hdr=work/'hdr.mp4'
        media.run([media.ffmpeg,'-v','error','-y','-i',source,'-vf','setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc',
                   '-c:v','libx264','-color_primaries','bt2020','-colorspace','bt2020nc','-color_trc','smpte2084','-preset','ultrafast',hdr],work)
        assert media.probe(hdr,work)['streams'][0]['color_transfer']=='smpte2084'
        with pytest.raises(Gate) as caught:
            media.ingest(s.upload(hdr),work)
        assert caught.value.code=='HDR_PROFILE_REQUIRED'
    finally:
        s.store.close()


if __name__=='__main__':
    import sys
    root=Path(sys.argv[1]).absolute() if len(sys.argv)>1 else Path(__file__).parents[1]/'data'
    result=run_smoke(root)
    path=root/'SMOKE_RESULT.json';path.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))
