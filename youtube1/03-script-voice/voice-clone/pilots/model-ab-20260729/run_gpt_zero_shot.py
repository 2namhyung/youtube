import json, os, subprocess, threading, time, wave, sys, traceback
from pathlib import Path
OUT=Path(__file__).parent; ROOT=Path(r'C:\Users\User\tools\GPT-SoVITS-official\extracted\GPT-SoVITS-v3lora-20250228')
REF=OUT/'gpt_ref_trim.wav'; REF_TEXT='교권보호국은 교권을 보호하는 가상의 기관입니다.'
texts={'critical':(OUT/'gpt_critical.txt').read_text(encoding='utf8'),'heldout':(OUT/'gpt_heldout.txt').read_text(encoding='utf8')}
def gpu():
 try:
  t,m=subprocess.check_output(['nvidia-smi','--query-gpu=temperature.gpu,memory.used','--format=csv,noheader,nounits'],text=True).strip().split(',')[:2]; return {'temperature_c':float(t),'vram_used_mb':float(m)}
 except Exception as e:return {'error':str(e)}
gate=gpu(); events=[]; stop=threading.Event()
def mon():
 while not stop.is_set():
  e={'unix_time':time.time(),**gpu()}; events.append(e)
  if e.get('temperature_c',0)>=74:
   (OUT/'gpt-hard-stop.json').write_text(json.dumps({'event':e,'reason':'GPU temperature >=74C'},indent=2),encoding='utf8'); os._exit(74)
  time.sleep(.5)
result={'engine':'GPT-SoVITS V2','version':'v2','tempo':1.0,'gate':gate,'ref_audio':str(REF),'ref_text':REF_TEXT,'texts':texts}
if gate.get('temperature_c',999)>52: result['status']='blocked_gpu_gate'
else:
 th=threading.Thread(target=mon,daemon=True); th.start()
 try:
  os.chdir(ROOT); sys.path.insert(0,str(ROOT)); sys.path.insert(0,str(ROOT/'GPT_SoVITS')); os.environ['language']='en_US'; os.environ['version']='v2'; os.environ['is_half']='True'; os.environ['gpt_path']=str(ROOT/'GPT_SoVITS'/'pretrained_models'/'gsv-v2final-pretrained'/'s1bert25hz-5kh-longer-epoch=12-step=369668.ckpt'); os.environ['sovits_path']=str(ROOT/'GPT_SoVITS'/'pretrained_models'/'gsv-v2final-pretrained'/'s2G2333k.pth'); import soundfile as sf
  from GPT_SoVITS.inference_webui import change_gpt_weights,change_sovits_weights,get_tts_wav
  change_gpt_weights(gpt_path=os.environ['gpt_path']); change_sovits_weights(sovits_path=os.environ['sovits_path'])
  for name,text in texts.items():
   chunks=list(get_tts_wav(ref_wav_path=str(REF),prompt_text=REF_TEXT,prompt_language='Korean',text=text,text_language='Korean',top_p=1,temperature=1,speed=1.0,pause_second=0.3))
   if not chunks: raise RuntimeError('get_tts_wav returned no chunks')
   sr,data=chunks[-1]; path=OUT/f'gpt_{name}.wav'; sf.write(path,data,sr)
   with wave.open(str(path)) as w: dur=w.getnframes()/w.getframerate()
   result.setdefault('outputs',{})[name]={'path':str(path),'sample_rate':sr,'duration_seconds':dur}
  result['status']='completed'
 except Exception as e: result['status']='error'; result['error']=repr(e); result['traceback']=traceback.format_exc()
 finally:
  stop.set(); th.join(timeout=1); result['gpu_events']=events; result['peak_temperature_c']=max([x.get('temperature_c',0) for x in events] or [gate.get('temperature_c',0)]); result['peak_vram_used_mb']=max([x.get('vram_used_mb',0) for x in events] or [gate.get('vram_used_mb',0)]); (OUT/'gpt-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
