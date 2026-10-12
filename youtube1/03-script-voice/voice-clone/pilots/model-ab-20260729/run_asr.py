import json, hashlib
from pathlib import Path
from faster_whisper import WhisperModel
OUT=Path(__file__).parent
texts={"critical":"교권보호국은 제주에서 제조한 텀블러를 봤습니다. 상자를 받았습니다. 경고선을 밟았습니다. 안내판 위치를 바꿨습니다. 경찰은 건조물침입과 재물손괴 가능성을 기록하고 휴대전화 포렌식 자료를 확인했습니다.","heldout":"검찰은 건조물침입과 재물손괴 혐의를 따로 검토했고, 디지털 포렌식 결과도 함께 살폈습니다. 지난 6월 제주 한 학교에서 비슷한 신고가 접수됐습니다. 반복을 막으려면 어떤 보호 장치가 필요할까요?"}
models={"primary":r"C:\Users\User\Desktop\app\youtube\03-script-voice\voice-clone\training\F\asr\model-cache\models--Systran--faster-whisper-large-v3\snapshots\edaa852ec7e145841d8ffdb056a99866b5f0a478","turbo":r"C:\Users\User\Desktop\app\youtube\03-script-voice\voice-clone\training\F\asr-turbo\model-cache\models--mobiuslabsgmbh--faster-whisper-large-v3-turbo\snapshots\0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf"}
res={}
def norm(s): return ''.join(s.split()).replace('。','').replace('.','')
for mn,mp in models.items():
  try:
    m=WhisperModel(mp,device='cpu',compute_type='int8')
    res[mn]={}
    for prefix,root,stem in [('qwen',OUT,'qwen'),('gpt',OUT,'gpt'),('gpt_ft',OUT/'gpt-v2-finetune','gpt_ft')]:
     res[mn].setdefault(prefix,{})
     for name,exp in texts.items():
      wav=root/f'{stem}_{name}.wav'
      if not wav.exists(): continue
      segs,info=m.transcribe(str(wav),language='ko',beam_size=5,temperature=0)
      segs=list(segs); tr=' '.join(s.text.strip() for s in segs).strip()
      res[mn][prefix][name]={"transcript":tr,"expected":exp,"exact_normalized":norm(tr)==norm(exp),"segments":[{"start":s.start,"end":s.end,"text":s.text,"avg_logprob":s.avg_logprob} for s in segs]}
  except Exception as e: res[mn]={"error":repr(e)}
(OUT/'asr-result.json').write_text(json.dumps(res,ensure_ascii=False,indent=2),encoding='utf-8')
