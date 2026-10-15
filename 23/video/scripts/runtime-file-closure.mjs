// The approval bundle covers both the scene implementation and its transition renderer.
export const SCENE_RUNTIME_FILES = Object.freeze([
  'video/src/cut-manifest.ts',
  'video/src/motion.tsx',
  'video/src/vox/scene/ManifestScene.tsx',
  'video/src/vox/scene/PresentationScene.tsx',
  'video/src/vox/scene/presentation-runtime.ts',
  'video/src/vox/scene/asset-sheet.ts',
  'video/src/vox/scene/model.ts',
  'video/src/vox/scene/source-video.ts',
  'video/src/vox/motion/operator-registry.ts',
  'video/src/vox/motion/presets.ts',
  'video/src/vox/collage/index.tsx',
  'video/src/vox/charts/index.tsx',
  'video/src/vox/charts/model.ts',
]);

export const TRANSITION_RUNTIME_FILES = Object.freeze([
  'video/src/vox/scene/TransitionPair.tsx',
  'video/src/vox/scene/EpisodeTimeline.tsx',
]);

export const APPROVAL_RUNTIME_FILES = Object.freeze([...new Set([...SCENE_RUNTIME_FILES, ...TRANSITION_RUNTIME_FILES, 'video/src/production-index.tsx'])].sort());
