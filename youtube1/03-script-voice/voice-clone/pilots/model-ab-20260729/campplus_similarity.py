import json, numpy as np, onnxruntime, torchaudio
from pathlib import Path
OUT=Path(__file__).parent
model=Path(r'C:\Users\User\Desktop\app\youtube\03-script-voice\voice-clone\validators\campplus.onnx')
sess=onnxruntime.InferenceSession(str(model),providers=['CPUExecutionProvider'])
def emb(p):
 x,sr=torchaudio.load(str(p),backend='soundfile'); x=x.mean(0,keepdim=True)
 if sr!=16000:x=torchaudio.functional.resample(x,sr,16000)
 f=torchaudio.compliance.kaldi.fbank(x,num_mel_bins=80,dither=0,sample_frequency=16000); f=f-f.mean(0,keepdim=True)
 return sess.run(None,{sess.get_inputs()[0].name:f.unsqueeze(0).numpy()})[0].flatten()
def cos(a,b):return float(np.dot(a,b)/(np.linalg.norm(a)*np.linalg.norm(b)))
ref=emb(OUT/'f4_ref_gyogwon.wav'); out={}
for p in sorted(list(OUT.glob('qwen_*.wav'))+list(OUT.glob('gpt_*.wav'))): out[p.stem]={'cosine_to_f4_ref':cos(ref,emb(p))}
import hashlib
model_hash=hashlib.sha256(model.read_bytes()).hexdigest().upper()
json.dump({'method':'CAMPPlus ONNX','model_sha256':model_hash,'reference':'f4_ref_gyogwon.wav','outputs':out},open(OUT/'campplus-similarity.json','w',encoding='utf8'),ensure_ascii=False,indent=2)
