import argparse
import json
import sys
from pathlib import Path

sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False), flush=True)


parser = argparse.ArgumentParser()
parser.add_argument("--fish-root", required=True)
parser.add_argument("--checkpoint-path", required=True)
parser.add_argument("--vq-checkpoint", required=True)
parser.add_argument("--reference-audio", required=True)
parser.add_argument("--prompt-tokens-output", required=True)
parser.add_argument("--prompt-text", required=True)
parser.add_argument("--device", default="cuda")
args = parser.parse_args()

fish_root = Path(args.fish_root).resolve()
sys.path.insert(0, str(fish_root))

import numpy as np
import soundfile as sf
import torch
import torchaudio
from fish_speech.models.text2semantic.inference import generate_long, load_model as load_semantic_model
from fish_speech.models.vqgan.inference import load_model as load_vq_model

precision = torch.half if args.device == "cuda" else torch.bfloat16
semantic_model, decode_one_token = load_semantic_model(Path(args.checkpoint_path), args.device, precision, compile=False)
with torch.device(args.device):
    semantic_model.setup_caches(
        max_batch_size=1,
        max_seq_len=semantic_model.config.max_seq_len,
        dtype=next(semantic_model.parameters()).dtype,
    )

vq_model = load_vq_model("firefly_gan_vq", args.vq_checkpoint, device=args.device)
reference_audio, sample_rate = torchaudio.load(args.reference_audio)
if reference_audio.shape[0] > 1:
    reference_audio = reference_audio.mean(0, keepdim=True)
reference_audio = torchaudio.functional.resample(reference_audio, sample_rate, vq_model.spec_transform.sample_rate)
reference_batch = reference_audio[None].to(args.device)
reference_lengths = torch.tensor([reference_batch.shape[2]], device=args.device, dtype=torch.long)
with torch.inference_mode():
    prompt_tokens = vq_model.encode(reference_batch, reference_lengths)[0][0]
np.save(args.prompt_tokens_output, prompt_tokens.cpu().numpy())
prompt_tokens = prompt_tokens.to(args.device)
emit({"ready": True, "sampleRate": int(vq_model.spec_transform.sample_rate)})

for line in sys.stdin:
    request = None
    try:
        request = json.loads(line)
        request_id = str(request["id"])
        text = str(request["text"])
        seed = int(request["seed"])
        output = Path(request["output"]).resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed(seed)
        # A malformed seed can otherwise run to the model context limit and
        # occupy the worker for many minutes. Fish semantic tokens are about
        # 21 Hz; this budget still allows substantially more speech than a
        # normal Korean cue of the same character count.
        max_semantic_tokens = max(128, min(512, len(text) * 8 + 96))
        generator = generate_long(
            model=semantic_model,
            device=args.device,
            decode_one_token=decode_one_token,
            text=text,
            num_samples=1,
            max_new_tokens=max_semantic_tokens,
            top_p=0.7,
            repetition_penalty=1.2,
            temperature=0.7,
            compile=False,
            iterative_prompt=True,
            chunk_length=max(40, min(100, len(text))),
            prompt_text=[args.prompt_text],
            prompt_tokens=[prompt_tokens],
        )
        code_chunks = []
        for response in generator:
            if response.action == "sample":
                code_chunks.append(response.codes)
            elif response.action == "next":
                break
        if not code_chunks:
            raise RuntimeError("Fish generated no semantic codes")
        codes = torch.cat(code_chunks, dim=1)
        if codes.shape[1] >= max_semantic_tokens - 2:
            raise RuntimeError(f"Fish generation hit semantic-token cap ({max_semantic_tokens})")
        feature_lengths = torch.tensor([codes.shape[1]], device=args.device)
        with torch.inference_mode():
            audio, _ = vq_model.decode(indices=codes[None], feature_lengths=feature_lengths)
        samples = audio[0, 0].float().cpu().numpy()
        speech_duration = len(samples) / vq_model.spec_transform.sample_rate
        minimum_samples = round(0.6 * vq_model.spec_transform.sample_rate)
        if len(samples) < minimum_samples:
            samples = np.pad(samples, (0, minimum_samples - len(samples)))
        sf.write(output, samples, vq_model.spec_transform.sample_rate)
        emit({"id": request_id, "ok": True, "output": str(output), "speechDuration": speech_duration, "duration": len(samples) / vq_model.spec_transform.sample_rate})
    except Exception as error:
        emit({"id": request.get("id") if isinstance(request, dict) else None, "ok": False, "error": str(error)})
