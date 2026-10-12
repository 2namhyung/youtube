# VQazcEuV9Xw reverse-analysis v2

This folder is a standalone, analysis-only study of the single supplied reference:
[AI를 너무 맹신하면 안되는 이유](https://youtube.com/shorts/VQazcEuV9Xw?si=ItY8QKfQsT2nwNzT).
It uses the preserved v1 source copy and does not admit any source frame, audio,
caption, or inferred event claim to production.

## Contents

- `build-analysis.py` — creator-authored shot table and deterministic JSON builder.
- `shot-analysis.json` — generated 22-row contiguous grouped visual-beat map.
- `REPORT.md` — observation, inference, uncertainty, material needs, and proposed recipes.
- `measurements/manifest.json` — v2 evidence and hash manifest.
- `evidence/full-sample-01.png` … `full-sample-05.png` — 0.5-second whole-video samples.
- `evidence/candidates/` — before/after evidence around 20 detector candidates.
- `evidence/pose-detail-01.png` … `pose-detail-05.png` — 44–48.5 second 0.1-second detail samples.
- `reconstruction/output/comparison.mp4` — left-side excerpt of the source beside a right-side own SVG study render; reconstruction-only output uses own SVG only, and this is a local comparison artifact, not a recreated source video.

## Rebuild and checks

Run from the repository root:

```powershell
python production-studio/research/reference-reverse-v2/build-analysis.py
python -c "import json; d=json.load(open('production-studio/research/reference-reverse-v2/shot-analysis.json',encoding='utf-8')); assert d['shots'][0]['startFrame']==0 and d['shots'][-1]['endFrame']==1464; assert all(a['endFrame']==b['startFrame'] for a,b in zip(d['shots'],d['shots'][1:])); print('shot-map-ok')"
```

Frame intervals are half-open `[startFrame, endFrame)` and use `frame * 1001 / 30000` seconds. The decoded frame domain is `0..1463`, so the exclusive endpoint is frame `1464` and `48.8488` seconds. The container probe separately reports `48.854` seconds; the frame-domain value is used in the shot map.

The detector produced 20 candidate times, but those candidates are not 20 hard cuts. The authored map preserves intra-event pose/prop changes and two observed transition windows. Every row is a grouped visual beat with explicit confidence and uncertainty.

## Local review

현재 로컬 검토 화면: http://127.0.0.1:8793/reference-reverse-v2/viewer/ (production 배포가 아니다).
서버 재시작: `python -m http.server 8793 --bind 127.0.0.1 --directory production-studio/research`
샷을 선택한 뒤 프레임 전후 이동, 0.5x 재생, 반복 재생, comparison 영상 비교 순서로 확인한다.

## Boundary and rights limits

`narrationSummary` paraphrases visible burned-caption meaning. It is not a transcript, voice transcription, or source script. `observed` records pixels or sample-level changes; `layers` and `recipe` are editable-layer inferences or proposed reproduction methods. The own SVG study illustrates motion structure, not the source photo or character appearance. The video is not treated as a verified real event, agricultural advice, or evidence. Source reuse rights are unverified; this local comparison has no public or production approval. No provider, voice, production, upload, publication, or Stage 07 action is authorized.

The canonical newsroom contract and its approval/rejection history remain higher authority. This study does not alter them, the v1 evidence, or the existing Remotion rejection records.
