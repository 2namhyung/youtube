import hashlib
import json
from pathlib import Path

import numpy as np
import onnxruntime
import torchaudio

HERE = Path(__file__).resolve().parent
PILOT = HERE.parent
MODEL = PILOT / ".." / ".." / "validators" / "campplus.onnx"
MODEL = MODEL.resolve()
SESSION = onnxruntime.InferenceSession(str(MODEL), providers=["CPUExecutionProvider"])


def emb(path: Path) -> np.ndarray:
    audio, sr = torchaudio.load(str(path), backend="soundfile")
    audio = audio.mean(0, keepdim=True)
    if sr != 16000:
        audio = torchaudio.functional.resample(audio, sr, 16000)
    feat = torchaudio.compliance.kaldi.fbank(audio, num_mel_bins=80, dither=0, sample_frequency=16000)
    feat = feat - feat.mean(0, keepdim=True)
    return SESSION.run(None, {SESSION.get_inputs()[0].name: feat.unsqueeze(0).numpy()})[0].flatten()


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


def main() -> None:
    ref = emb(PILOT / "f4_ref_gyogwon.wav")
    outputs = {}
    for name in ("critical", "heldout"):
        path = HERE / f"gpt_ft_{name}.wav"
        outputs[f"gpt_ft_{name}"] = {"cosine_to_f4_ref": cosine(ref, emb(path))}
    result = {"method": "CAMPPlus ONNX", "model_sha256": hashlib.sha256(MODEL.read_bytes()).hexdigest().upper(), "reference": "f4_ref_gyogwon.wav", "outputs": outputs}
    (HERE / "finetuned-campplus-similarity.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
