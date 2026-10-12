# comparison-v1

This append-only comparison presents each tool's ten verified mechanics in order. The left panel is an independently rendered semantic reference visualization derived from the hash-bound mechanic specification. It is explicitly **not an original official example** because no official example media artifact was preserved or admitted. The right panel is the exact hash-verified `motion-tool-learning-v3-full-d` learned output.

The creator performs no network, provider, upload, or source-example download. The verifier rehashes all 60 learned sources, checks the ten reference-board artifacts and seven MP4 outputs, validates ffprobe properties, and independently decodes both panels to reject static or blank segments.

```powershell
node studies/motion-tool-learning-v3/comparison-v1/create-comparison-v1.mjs
node studies/motion-tool-learning-v3/comparison-v1/verify-comparison-v1.mjs
```
