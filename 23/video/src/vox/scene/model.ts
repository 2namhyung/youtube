import type {CutAsset, CutManifest} from '../../cut-manifest';

export const assertLocalPublicPath = (value: string, label = 'path') => {
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//u, '').replace(/^\/+|\/+$/gu, '');
  if (!normalized || normalized.split('/').includes('..') || /^(?:[a-z]+:)?\/\//iu.test(value) || /^[a-z]:/iu.test(value)) {
    throw new Error(`${label} must be a local public-relative path`);
  }
  return normalized;
};

export const cutAssetPath = (cutBasePath: string, file: string) => `${assertLocalPublicPath(cutBasePath, 'cutBasePath')}/${assertLocalPublicPath(file, 'asset file')}`;

export const roleLayout = (asset: CutAsset, index: number, total: number) => {
  const declared = (asset as CutAsset & {layout?: {left?: number; top?: number; width?: number; height?: number}}).layout;
  if (declared && [declared.left, declared.top, declared.width, declared.height].every((value) => Number.isFinite(value))) {
    return {left: declared.left, top: declared.top, width: declared.width, height: declared.height};
  }
  const spread = total <= 1 ? 0 : (index / (total - 1) - 0.5) * 560;
  if (asset.role === 'plate' || asset.role === 'evidence' || asset.role === 'document') return {left: 340 + spread * 0.25, top: 125, width: 1240, height: 780};
  if (asset.role === 'character') return {left: 180 + spread * 0.3, top: 185, width: 590, height: 760};
  if (asset.role === 'architecture') return {left: 1010 + spread * 0.22, top: 220, width: 690, height: 650};
  if (asset.role === 'foreground') return {left: 990 + spread * 0.45, top: 470, width: 620, height: 470};
  if (asset.role === 'accent') return {left: 500 + spread, top: 210 + (index % 2) * 330, width: 410, height: 310};
  return {left: 340 + spread, top: 250 + (index % 2) * 180, width: 620, height: 500};
};

export const previewFrames = (manifest: Pick<CutManifest, 'duration_frames' | 'lifecycle'>) => {
  const reveal = manifest.lifecycle?.reveal;
  const finalHold = manifest.lifecycle?.final_hold;
  return {
    background: 0,
    reveal: reveal ? Math.floor((reveal.start_frame + Math.max(reveal.start_frame, reveal.end_frame - 1)) / 2) : 0,
    final: finalHold ? Math.max(finalHold.start_frame, finalHold.end_frame - 1) : Math.max(0, manifest.duration_frames - 1),
  };
};

/** Undefined preserves normal playback; a number freezes video for QA overrides or final_hold. */
export const videoFreezeFrame = ({
  currentFrame,
  frameOverride,
  finalHoldStart,
}: {
  currentFrame: number;
  frameOverride?: number;
  finalHoldStart?: number;
}) => {
  const effectiveFrame = frameOverride ?? currentFrame;
  if (Number.isInteger(finalHoldStart) && effectiveFrame >= Number(finalHoldStart)) return Math.max(0, Number(finalHoldStart) - 1);
  return frameOverride === undefined ? undefined : Math.max(0, frameOverride);
};
