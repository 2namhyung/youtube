import React from 'react';
import {Freeze, Sequence} from 'remotion';
import {Video} from '@remotion/media';
import type {CutAsset} from '../../cut-manifest';

export function sourceVideoTrimRange(asset: CutAsset, fps: number) {
  if (!asset.media_type.startsWith('video/') || !asset.source_timecode) return {};
  return {
    trimBefore: Math.round(asset.source_timecode.start_seconds * fps),
    trimAfter: Math.round(asset.source_timecode.end_seconds * fps),
  };
}

export function sourceVideoPlaybackWindow({asset, fps, activationFrame, activeEndFrame}: {asset: CutAsset; fps: number; activationFrame: number; activeEndFrame: number}) {
  const trim = sourceVideoTrimRange(asset, fps);
  if (trim.trimBefore === undefined || trim.trimAfter === undefined) return null;
  return {
    ...trim,
    from: activationFrame,
    durationInFrames: Math.max(0, Math.min(activeEndFrame - activationFrame, trim.trimAfter - trim.trimBefore)),
  };
}

export function SourceVideoMedia({asset, src, fps, style}: {asset: CutAsset; src: string; fps: number; style: React.CSSProperties}) {
  return React.createElement(Video, {src, muted: true, ...sourceVideoTrimRange(asset, fps), style});
}

export function SequencedSourceVideo({asset, src, fps, activationFrame, activeEndFrame, frameOverride, style}: {asset: CutAsset; src: string; fps: number; activationFrame: number; activeEndFrame: number; frameOverride?: number; style: React.CSSProperties}) {
  const window = sourceVideoPlaybackWindow({asset, fps, activationFrame, activeEndFrame});
  if (!window || window.durationInFrames <= 0) return null;
  const media = React.createElement(SourceVideoMedia, {asset, src, fps, style});
  if (frameOverride !== undefined) {
    const localFrame = frameOverride - activationFrame;
    if (localFrame < 0 || localFrame >= window.durationInFrames) return null;
    return React.createElement(Freeze, {frame: localFrame, children: media});
  }
  return React.createElement(Sequence, {from: window.from, durationInFrames: window.durationInFrames, layout: 'none'}, media);
}
