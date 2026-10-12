"""Generate fixed-condition F4 target probes with a 78 C hard stop."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import threading
import time
from pathlib import Path

import soundfile as sf


ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parents[3]
FISH_ROOT = Path(r"C:\Users\User\tools\fish-speech")
PYTHON = FISH_ROOT / "venv" / "Scripts" / "python.exe"
WORKER = WORKSPACE / "06-production" / "opencut-automation" / "scripts" / "fish-cue-worker.py"
REFERENCE = WORKSPACE / "03-script-voice" / "voice-clone" / "samples" / "F3-prosody-prompt.wav"
PROMPT = "넷플릭스 시리즈 참교육 속 교권보호국, 현실에도 진짜 필요한 거 아니에요?"
VQ = FISH_ROOT / "checkpoints" / "fish-speech-1.5" / "firefly-gan-vq-fsq-8x1024-21hz-generator.pth"
RUN_ROOT = WORKSPACE / "03-script-voice" / "runs" / "F4-target-20260729" / "probes"
START_LIMIT = 55
HARD_LIMIT = 78
POLL_INTERVAL = 1.0

REQUESTS = [
    {
        "id": "critical", "seed": 20260729,
        "text": "교권보호국은 제주에서 제조한 텀블러를 봤습니다. 상자를 받았습니다. 경고선을 밟았습니다. 안내판 위치를 바꿨습니다. 경찰은 건조물침입과 재물손괴 가능성을 기록하고 휴대전화 포렌식 자료를 확인했습니다.",
    },
    {
        "id": "heldout", "seed": 20260730,
        "text": "검찰은 건조물침입과 재물손괴 혐의를 따로 검토했고, 디지털 포렌식 결과도 함께 살폈습니다. 지난 6월 제주 한 학교에서 비슷한 신고가 접수됐습니다. 반복을 막으려면 어떤 보호 장치가 필요할까요?",
    },
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def gpu_temperature() -> int:
    result = subprocess.run(
        ["nvidia-smi", "--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"],
        check=True, capture_output=True, text=True,
    )
    return int(result.stdout.strip().splitlines()[0])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    args = parser.parse_args()
    if gpu_temperature() > START_LIMIT:
        raise SystemExit(f"GPU must cool to <={START_LIMIT} C before a probe")
    output = RUN_ROOT / args.profile
    audio_dir = output / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    prompt_tokens = output / "prompt.npy"
    stderr_path = output / "worker.stderr.log"
    lines = []
    for request in REQUESTS:
        lines.append(json.dumps({
            **request, "output": str(audio_dir / f"{request['id']}.wav")
        }, ensure_ascii=False))
    stop = threading.Event()
    state = {"max_temperature_c": gpu_temperature(), "safety_stopped": False}
    with stderr_path.open("w", encoding="utf-8") as stderr:
        process = subprocess.Popen([
            str(PYTHON), str(WORKER), "--fish-root", str(FISH_ROOT),
            "--checkpoint-path", str(args.checkpoint), "--vq-checkpoint", str(VQ),
            "--reference-audio", str(REFERENCE), "--prompt-tokens-output", str(prompt_tokens),
            "--prompt-text", PROMPT, "--device", "cuda",
        ], cwd=FISH_ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=stderr,
           text=True, encoding="utf-8")

        def monitor() -> None:
            while not stop.wait(POLL_INTERVAL):
                try:
                    temperature = gpu_temperature()
                    state["max_temperature_c"] = max(state["max_temperature_c"], temperature)
                    if temperature > HARD_LIMIT:
                        state["safety_stopped"] = True
                        process.kill()
                        return
                except Exception:
                    continue

        thread = threading.Thread(target=monitor, daemon=True)
        thread.start()
        stdout, _ = process.communicate("\n".join(lines) + "\n", timeout=360)
        stop.set()
        thread.join(timeout=2)
    records = []
    for line in stdout.splitlines():
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if "ready" in payload or "id" in payload:
            records.append(payload)
    result = {
        "profile": args.profile, "checkpoint": str(args.checkpoint),
        "checkpoint_model_sha256": sha256(args.checkpoint / "model.pth"),
        "reference_audio_sha256": sha256(REFERENCE), "prompt_text": PROMPT,
        "tempo": 1.0, "requests": REQUESTS, "worker_records": records,
        **state, "exit_code": process.returncode,
    }
    for request in REQUESTS:
        audio = audio_dir / f"{request['id']}.wav"
        if audio.exists():
            info = sf.info(audio)
            request["audio"] = str(audio)
            request["audio_sha256"] = sha256(audio)
            request["duration_seconds"] = round(info.duration, 6)
    (output / "generation.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    if state["safety_stopped"] or process.returncode:
        raise SystemExit(f"Probe failed or safety-stopped: {result}")
    print(json.dumps({
        "profile": args.profile, "max_temperature_c": state["max_temperature_c"],
        "audio": [{key: req.get(key) for key in ("id", "duration_seconds", "audio_sha256")} for req in REQUESTS],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
