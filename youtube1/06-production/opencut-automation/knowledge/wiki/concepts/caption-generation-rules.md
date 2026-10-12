# Caption generation rules

- Reference: [[../sources/reference-video-K2MWaSrkP4I]]
- Operator decisions: [locked decisions](../../raw/inbox/operator-caption-decisions.md#locked-decisions)
- Status: production

## Machine-readable contract

The producer reads this block on every render. Do not duplicate it elsewhere.

<!-- caption-contract:start -->
```json
{
  "id": "newsroom-semantic-2line-v3",
  "boundaryEngine": "korean-subtitle-splitter-js-port-v2",
  "upstreamRepository": "https://github.com/Leedogin/korean-subtitle-splitter",
  "upstreamCommit": "9bc9720eccd9cf5452924f681b12ec85738f9ce8",
  "upstreamLicense": "MIT",
  "semanticMaxWords": 8,
  "semanticMaxGraphemes": 45,
  "targetGraphemesPerLine": 16,
  "minGraphemesPerCue": 4,
  "maxLines": 2,
  "targetDurationSeconds": 2.4,
  "minDurationSeconds": 0.6,
  "maxDurationSeconds": 3.6,
  "preserveSourceCueBoundaries": true,
  "preserveWordOrder": true
}
```
<!-- caption-contract:end -->

## Editorial rules

1. One editable cue may render on at most two physical lines; embedded source newlines are forbidden.
2. Split at spaces, punctuation, or semantic clause boundaries before using a grapheme boundary.
3. Keep particles, names, numbers, and short compounds with the word they qualify when possible.
4. Do not paraphrase, omit, reorder, or duplicate narration text while splitting.
5. Allocate the original cue time proportionally to the readable length of each child cue.
6. Avoid an orphan final fragment shorter than four graphemes when it can fit in the preceding cue.
7. Keep the approved visual style: centered white Noto Sans KR ExtraBold, 5 px black outline, no shadow, opaque black background.

The machine contract follows the word-first boundary selection in
[`Leedogin/korean-subtitle-splitter`](https://github.com/Leedogin/korean-subtitle-splitter/tree/9bc9720eccd9cf5452924f681b12ec85738f9ce8)
at commit `9bc9720eccd9cf5452924f681b12ec85738f9ce8` (MIT). The 16-grapheme value is a
readability target for each rendered line, not a hard limit for the whole semantic cue. A semantic cue may use two physical lines; if it cannot fit, the producer creates another timed cue only at an allowed Korean boundary.
The matching fail-closed schema is `production/caption-rules.schema.json`.

Rules 1 and 7 come from the operator decisions. Source: [operator decisions](../../raw/inbox/operator-caption-decisions.md#locked-decisions). Rules 2–6 adapt the reference's semantic cadence to the narrower vertical canvas. Source: [reference summary](../sources/reference-video-K2MWaSrkP4I.md#summary).
