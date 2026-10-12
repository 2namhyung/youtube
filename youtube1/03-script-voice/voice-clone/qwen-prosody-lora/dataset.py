"""Small, sequence-capped adapter for the official Qwen3-TTS JSONL contract."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import librosa
import numpy as np
import torch
from torch.utils.data import Dataset


class PilotDataset(Dataset):
    def __init__(self, jsonl: Path, processor: Any, model_config: Any, max_sequence_length: int):
        self.rows = [json.loads(line) for line in jsonl.read_text(encoding="utf-8").splitlines() if line.strip()]
        if not self.rows:
            raise ValueError(f"empty training JSONL: {jsonl}")
        self.processor = processor
        self.config = model_config
        self.max_sequence_length = max_sequence_length

    def __len__(self) -> int:
        return len(self.rows)

    @staticmethod
    def _mels(audio_path: str) -> torch.Tensor:
        from qwen_tts.core.models.modeling_qwen3_tts import mel_spectrogram

        audio, sr = librosa.load(audio_path, sr=None, mono=True)
        if int(sr) != 24000:
            raise ValueError(f"reference audio must be 24 kHz, got {sr}: {audio_path}")
        mel = mel_spectrogram(
            torch.from_numpy(np.asarray(audio, dtype=np.float32)).unsqueeze(0),
            n_fft=1024,
            num_mels=128,
            sampling_rate=24000,
            hop_size=256,
            win_size=1024,
            fmin=0,
            fmax=12000,
        )
        return mel.transpose(1, 2)

    def __getitem__(self, index: int) -> dict[str, torch.Tensor]:
        row = self.rows[index]
        if "audio_codes" not in row:
            raise ValueError("prepared row lacks audio_codes; run prepare_dataset.py first")
        codes = np.asarray(row["audio_codes"])
        if codes.ndim != 2 or codes.shape[1] != 16:
            raise ValueError(f"audio_codes must have shape [T,16], got {codes.shape}")
        if codes.size and (codes.min() < 0 or codes.max() > 2047):
            raise ValueError("audio_codes values must be in [0, 2047]")
        text = f"<|im_start|>assistant\n{row['text']}<|im_end|>\n<|im_start|>assistant\n"
        text_ids = self.processor(text=text, return_tensors="pt", padding=True)["input_ids"]
        if text_ids.ndim == 1:
            text_ids = text_ids.unsqueeze(0)
        return {
            "text_ids": text_ids[:, :-5],
            "audio_codes": torch.tensor(codes, dtype=torch.long),
            "ref_mel": self._mels(row["ref_audio"]),
        }

    def collate_fn(self, batch: list[dict[str, torch.Tensor]]) -> dict[str, torch.Tensor]:
        lengths = [item["text_ids"].shape[1] + item["audio_codes"].shape[0] + 8 for item in batch]
        max_len = max(lengths)
        if max_len > self.max_sequence_length:
            raise ValueError(f"sequence length {max_len} exceeds cap {self.max_sequence_length}")
        size = len(batch)
        input_ids = torch.zeros((size, max_len, 2), dtype=torch.long)
        codec_ids = torch.zeros((size, max_len, 16), dtype=torch.long)
        text_mask = torch.zeros((size, max_len), dtype=torch.bool)
        codec_embedding_mask = torch.zeros((size, max_len), dtype=torch.bool)
        codec_mask = torch.zeros((size, max_len), dtype=torch.bool)
        attention_mask = torch.zeros((size, max_len), dtype=torch.long)
        labels = torch.full((size, max_len), -100, dtype=torch.long)
        cfg = self.config
        for i, item in enumerate(batch):
            text_ids, codes = item["text_ids"], item["audio_codes"]
            text_len, code_len = text_ids.shape[1], codes.shape[0]
            input_ids[i, :3, 0] = text_ids[0, :3]
            input_ids[i, 3:7, 0] = cfg.tts_pad_token_id
            input_ids[i, 7, 0] = cfg.tts_bos_token_id
            input_ids[i, 8 : 8 + text_len - 3, 0] = text_ids[0, 3:]
            input_ids[i, 8 + text_len - 3, 0] = cfg.tts_eos_token_id
            input_ids[i, 8 + text_len - 2 : 8 + text_len + code_len, 0] = cfg.tts_pad_token_id
            text_mask[i, : 8 + text_len + code_len] = True

            tc = cfg.talker_config
            input_ids[i, 3:8, 1] = torch.tensor(
                [tc.codec_nothink_id, tc.codec_think_bos_id, tc.codec_think_eos_id, 0, tc.codec_pad_id]
            )
            input_ids[i, 8 : 8 + text_len, 1] = tc.codec_pad_id
            input_ids[i, 8 + text_len - 1 : 8 + text_len - 1 + code_len, 1] = codes[:, 0]
            input_ids[i, 8 + text_len - 1 + code_len, 1] = tc.codec_eos_token_id
            labels[i, 8 + text_len - 1 : 8 + text_len - 1 + code_len] = codes[:, 0]
            labels[i, 8 + text_len - 1 + code_len] = tc.codec_eos_token_id
            codec_ids[i, 8 + text_len - 1 : 8 + text_len - 1 + code_len] = codes
            codec_embedding_mask[i, 3 : 8 + text_len + code_len] = True
            codec_embedding_mask[i, 6] = False
            codec_mask[i, 8 + text_len - 1 : 8 + text_len - 1 + code_len] = True
            attention_mask[i, : 8 + text_len + code_len] = True
        return {
            "input_ids": input_ids,
            "codec_ids": codec_ids,
            "ref_mels": torch.cat([item["ref_mel"] for item in batch], dim=0),
            "text_embedding_mask": text_mask.unsqueeze(-1),
            "codec_embedding_mask": codec_embedding_mask.unsqueeze(-1),
            "codec_mask": codec_mask,
            "attention_mask": attention_mask,
            "codec_0_labels": labels,
        }
