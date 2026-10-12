import json, numpy as np, soundfile as sf, librosa
from pathlib import Path
OUT=Path(__file__).parent; result={}
for p in sorted(list(OUT.glob('qwen_*.wav')) + list(OUT.glob('gpt_*.wav')) + list((OUT/'gpt-v2-finetune').glob('gpt_ft_*.wav'))):
 y,sr=sf.read(p); y=np.asarray(y,dtype=float); peak=float(np.max(np.abs(y))); db=20*np.log10(np.maximum(np.abs(y),1e-9)); sil=y[np.abs(y)<10**(-42/20)]
 intervals=[]; active=np.abs(y)>=10**(-42/20); d=np.diff(np.r_[False,active,False].astype(int)); starts=np.where(d==1)[0]; ends=np.where(d==-1)[0]
 for a,b in zip(ends[:-1],starts[1:]):
  if (b-a)/sr>=0.05: intervals.append({"start":float(a/sr),"end":float(b/sr),"duration":float((b-a)/sr)})
 f0=librosa.yin(y,fmin=70,fmax=350,sr=sr,frame_length=2048,hop_length=256); valid=f0[np.isfinite(f0)]; jumps=np.abs(np.diff(valid));
 last_active = len(y) - 1 - int(np.argmax(active[::-1])) if active.any() else None
 result[p.stem]={"duration_seconds":float(len(y)/sr),"sample_rate":sr,"peak_dbfs":float(20*np.log10(max(peak,1e-12))),"silence_intervals_ge_50ms":intervals,"max_silence_seconds":max((x['duration'] for x in intervals),default=0),"pitch_median_hz":float(np.median(valid)) if len(valid) else None,"pitch_jump_count_gt_80hz":int(np.sum(jumps>80)),"pitch_max_jump_hz":float(np.max(jumps)) if len(jumps) else None,"boundary_leading_silence_seconds":float(np.argmax(active)/sr) if active.any() else None,"boundary_trailing_silence_seconds":float((len(y)-1-last_active)/sr) if active.any() else None}
(OUT/'audio-metrics.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
