import json, os, subprocess, threading, time, hashlib, wave
from pathlib import Path

OUT = Path(__file__).parent
REF = OUT / "f4_ref_gyogwon.wav"
CRITICAL = "교권보호국은 제주에서 제조한 텀블러를 봤습니다. 상자를 받았습니다. 경고선을 밟았습니다. 안내판 위치를 바꿨습니다. 경찰은 건조물침입과 재물손괴 가능성을 기록하고 휴대전화 포렌식 자료를 확인했습니다."
HELDOUT = "검찰은 건조물침입과 재물손괴 혐의를 따로 검토했고, 디지털 포렌식 결과도 함께 살폈습니다. 지난 6월 제주 한 학교에서 비슷한 신고가 접수됐습니다. 반복을 막으려면 어떤 보호 장치가 필요할까요?"
REF_TEXT = "교권보호국은 교권을 보호하는 가상의 기관입니다. 현실의 교권 보호 제도는 제대로 작동하고 있을까요? 교권과 권한은 서로 다른 의미를 가집니다."

def gpu():
    try:
        s = subprocess.check_output(["nvidia-smi", "--query-gpu=temperature.gpu,memory.used", "--format=csv,noheader,nounits"], text=True).strip()
        t, m = [x.strip() for x in s.split(",")[:2]]
        return {"temperature_c": float(t), "vram_used_mb": float(m)}
    except Exception as e:
        return {"error": str(e)}

events = []
stop = threading.Event()
def monitor():
    while not stop.is_set():
        e = {"unix_time": time.time(), **gpu()}
        events.append(e)
        if e.get("temperature_c", 0) >= 74:
            (OUT / "hard-stop.json").write_text(json.dumps({"reason":"GPU temperature >=74C", "event":e}, ensure_ascii=False, indent=2), encoding="utf-8")
            os._exit(74)
        time.sleep(0.5)

gate = gpu()
if gate.get("temperature_c", 999) > 52:
    (OUT / "qwen-result.json").write_text(json.dumps({"status":"blocked_gpu_gate", "gate":gate}, ensure_ascii=False, indent=2), encoding="utf-8")
    raise SystemExit(2)

th = threading.Thread(target=monitor, daemon=True); th.start()
result = {"model":"Qwen/Qwen3-TTS-12Hz-0.6B-Base", "tempo":1.0, "language":"Korean", "ref_audio":str(REF), "ref_text":REF_TEXT, "texts":{"critical":CRITICAL,"heldout":HELDOUT}, "gate":gate}
try:
    from qwen_tts import Qwen3TTSModel
    import torch, soundfile as sf
    model = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-0.6B-Base", device_map="cuda:0", dtype=torch.bfloat16)
    for name, text in (("critical", CRITICAL), ("heldout", HELDOUT)):
        wavs, sr = model.generate_voice_clone(text=text, language="Korean", ref_audio=str(REF), ref_text=REF_TEXT, x_vector_only_mode=False, non_streaming_mode=True, speed=1.0)
        path = OUT / f"qwen_{name}.wav"; sf.write(path, wavs[0], sr)
        with wave.open(str(path)) as w: dur = w.getnframes()/w.getframerate()
        result.setdefault("outputs", {})[name] = {"path":str(path), "sha256":hashlib.sha256(path.read_bytes()).hexdigest().upper(), "sample_rate":sr, "duration_seconds":dur}
    result["status"] = "completed"
except Exception as e:
    result["status"] = "error"; result["error"] = repr(e)
finally:
    stop.set(); th.join(timeout=1); result["gpu_events"] = events; result["peak_temperature_c"] = max((e.get("temperature_c",0) for e in events), default=gate.get("temperature_c")); result["peak_vram_used_mb"] = max((e.get("vram_used_mb",0) for e in events), default=gate.get("vram_used_mb"));
    (OUT / "qwen-result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
