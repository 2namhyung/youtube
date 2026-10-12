# Third-party notices

The implementation in `video/src/vox/` is original project code informed by the public patterns listed below. No code was copied from repositories that did not expose a reusable license at the pinned revision.

## MIT-licensed references

### hassancs91/claude-faceless-shorts-creator

- Source: https://github.com/hassancs91/claude-faceless-shorts-creator
- Pinned revision: `773054bebbe460de0f31dcfda5315970b1c8b4f2`
- License: MIT, https://github.com/hassancs91/claude-faceless-shorts-creator/blob/773054bebbe460de0f31dcfda5315970b1c8b4f2/LICENSE
- Pattern studied: frame-driven collage board, layered cut-outs, paper/photo/document presentation, restrained camera motion.
- Local adaptation: independently implemented against the existing 23jung `CutManifest`; removed synthetic voice, automatic media generation, short-form assumptions, and remote runtime inputs.

### AleBrito124356/remotion-video-templates

- Source: https://github.com/AleBrito124356/remotion-video-templates
- Pinned revision: `90149464d51a43fcb90e15491bf0d681c1b0fa49`
- License: MIT, https://github.com/AleBrito124356/remotion-video-templates/blob/90149464d51a43fcb90e15491bf0d681c1b0fa49/LICENSE
- Pattern studied: deterministic frame interpolation, chart path reveal, safe-area layout, shared timing math.
- Local adaptation: independently implemented manifest-driven bar, line, counter, and process views. Manifest and measured user voice remain the only duration authority; Zod and template metadata timing were not imported.

### Cele-san/vox-style-animation

- Source: https://github.com/Cele-san/vox-style-animation
- Pinned revision: `598760469edb55686208310652767a61d09f9793`
- License: MIT, https://github.com/Cele-san/vox-style-animation/blob/598760469edb55686208310652767a61d09f9793/LICENSE
- Pattern studied: paper slap-in, halftone restraint, highlighter/annotation vocabulary, subtle camera drift.
- Local adaptation: visual principles were reimplemented with Remotion; the HyperFrames/GSAP runtime and repository assets were not imported.

## Idea-only references with no verified reusable license

No source code or assets were copied from the following pinned revisions:

- `Cliff007007/paper-collage-video@5ab17fe4977d59c1f7af249981f4f64a9d1594e2`: contact-sheet, preflight, and first/final-state QA concepts only.
- `Anil-matcha/vox-ai-motion-graphics-generator@df40292c52fb142430047406661dbee2bc6397ef`: keyframe/clip separation concept only.
- `remotion-dev/mapbox-example@2421261addfbdf5b4255100f6df80eea901180ae`: route-progress concept only; no Mapbox code, token, tiles, or render-time network dependency was added.

