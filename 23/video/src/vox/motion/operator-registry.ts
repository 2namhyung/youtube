import {interpolate, spring} from 'remotion';

import type {CanonicalOperatorId, MotionActionV2, SharedElementTransition, TransitionCameraState, TransitionRect, VisualComponent} from '../../cut-manifest';

export type OperatorCapability =
  | 'layer-entry'
  | 'layer-transform'
  | 'opacity-change'
  | 'mask-reveal'
  | 'relationship-path'
  | 'document-emphasis'
  | 'chart-reveal'
  | 'camera-reframe'
  | 'surface-treatment'
  | 'shared-element-continuity';

export const OPERATOR_CAPABILITIES: Record<CanonicalOperatorId, readonly OperatorCapability[]> = {
  'transform.spring@1': ['layer-entry', 'layer-transform'],
  'transform.tween@1': ['layer-transform'],
  'opacity.tween@1': ['opacity-change'],
  'mask.inset@1': ['mask-reveal'],
  'svg.stroke-draw@1': ['relationship-path'],
  'document.highlight@1': ['document-emphasis'],
  'chart.reveal@1': ['chart-reveal'],
  'camera.transform@1': ['camera-reframe'],
  'grain.overlay@1': ['surface-treatment'],
  'scene.shared-element@1': ['shared-element-continuity'],
};

export const GRAIN_OVERLAY_LIMITS = {
  maximumOpacity: 0.045,
  minimumTileSizePx: 24,
  maximumTileSizePx: 160,
} as const;

const xorshift32 = (value: number) => {
  let state = value | 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
};

/** A deterministic, frame-independent SVG tile used by the registered grain operator. */
export const grainOverlayDataUri = ({seed, tileSizePx, dotSizePx, color}: {seed: number; tileSizePx: number; dotSizePx: number; color: string}) => {
  const tile = Math.max(GRAIN_OVERLAY_LIMITS.minimumTileSizePx, Math.min(GRAIN_OVERLAY_LIMITS.maximumTileSizePx, Math.round(tileSizePx)));
  const dot = Math.max(0.35, Math.min(2.5, dotSizePx));
  let state = seed >>> 0;
  const circles = Array.from({length: Math.max(18, Math.round(tile * tile / 180))}, (_, index) => {
    state = xorshift32(state + index + 1);
    const x = (state % 10000) / 10000 * tile;
    state = xorshift32(state + 0x9e3779b9);
    const y = (state % 10000) / 10000 * tile;
    state = xorshift32(state + 0x85ebca6b);
    const alpha = 0.28 + ((state % 6200) / 10000);
    return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${dot.toFixed(2)}" fill="${color}" fill-opacity="${alpha.toFixed(3)}"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}" viewBox="0 0 ${tile} ${tile}">${circles}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const cubicEaseInOut = (progress: number) => progress < 0.5
  ? 4 * progress * progress * progress
  : 1 - Math.pow(-2 * progress + 2, 3) / 2;

const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;
const mixRect = (from: TransitionRect, to: TransitionRect, progress: number): TransitionRect => ({
  left: mix(from.left, to.left, progress),
  top: mix(from.top, to.top, progress),
  width: mix(from.width, to.width, progress),
  height: mix(from.height, to.height, progress),
});
const mixCamera = (from: TransitionCameraState, to: TransitionCameraState, progress: number): TransitionCameraState => ({
  x: mix(from.x, to.x, progress),
  y: mix(from.y, to.y, progress),
  scale: mix(from.scale, to.scale, progress),
  rotate: mix(from.rotate, to.rotate, progress),
});

export type SharedElementFrameState = {
  progress: number;
  rect: TransitionRect;
  camera: TransitionCameraState;
  outgoingOpacity: number;
  incomingOpacity: number;
};

/** Observable state for the transition-owned overlay. Scene content never enters this operator. */
export const resolveSharedElementFrameState = (mapping: SharedElementTransition, frame: number, durationFrames: number): SharedElementFrameState => {
  const linear = clamp(frame / Math.max(1, durationFrames - 1));
  const progress = cubicEaseInOut(linear);
  return {
    progress,
    rect: mixRect(mapping.outgoing.rect, mapping.incoming.rect, progress),
    camera: mixCamera(mapping.outgoing.camera, mapping.incoming.camera, progress),
    outgoingOpacity: 1 - progress,
    incomingOpacity: progress,
  };
};

export type OperatorState = {
  opacity: number;
  x: number;
  y: number;
  scale: number;
  rotate: number;
  insetRight: number;
  strokeProgress: number;
  highlightProgress: number;
  chartProgress: number;
};

export const initialOperatorState = (): OperatorState => ({
  opacity: 1,
  x: 0,
  y: 0,
  scale: 1,
  rotate: 0,
  insetRight: 0,
  strokeProgress: 1,
  highlightProgress: 0,
  chartProgress: 0,
});

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const numeric = (params: MotionActionV2['params'], key: string, fallback: number) => typeof params[key] === 'number' ? Number(params[key]) : fallback;
const tween = (frame: number, action: MotionActionV2) => clamp((frame - action.start_frame) / Math.max(1, action.end_frame - action.start_frame));
const value = (progress: number, from: number, to: number) => interpolate(progress, [0, 1], [from, to]);

export const operatorProgress = (action: MotionActionV2, frame: number, fps: number) => {
  if (action.operator_id !== 'transform.spring@1') return tween(frame, action);
  if (frame < action.start_frame) return 0;
  return clamp(spring({
    frame: frame - action.start_frame,
    fps,
    durationInFrames: Math.max(1, action.end_frame - action.start_frame),
    config: {
      damping: numeric(action.params, 'damping', 18),
      stiffness: numeric(action.params, 'stiffness', 110),
      mass: numeric(action.params, 'mass', 0.75),
    },
  }));
};

export const resolveOperatorState = ({actions, frame, fps}: {actions: MotionActionV2[]; frame: number; fps: number}) => {
  let state = initialOperatorState();
  for (const action of actions) {
    const progress = operatorProgress(action, frame, fps);
    const p = action.params;
    if (action.operator_id === 'transform.spring@1' || action.operator_id === 'transform.tween@1' || action.operator_id === 'camera.transform@1') {
      state = {
        ...state,
        x: state.x + value(progress, numeric(p, 'from_x', 0), numeric(p, 'to_x', 0)),
        y: state.y + value(progress, numeric(p, 'from_y', 0), numeric(p, 'to_y', 0)),
        scale: state.scale * value(progress, numeric(p, 'from_scale', 1), numeric(p, 'to_scale', 1)),
        rotate: state.rotate + value(progress, numeric(p, 'from_rotate', 0), numeric(p, 'to_rotate', 0)),
        opacity: Math.min(state.opacity, value(progress, numeric(p, 'from_opacity', 1), numeric(p, 'to_opacity', 1))),
      };
    } else if (action.operator_id === 'opacity.tween@1') {
      state.opacity = Math.min(state.opacity, value(progress, numeric(p, 'from_opacity', 0), numeric(p, 'to_opacity', 1)));
    } else if (action.operator_id === 'mask.inset@1') {
      state.insetRight = value(progress, numeric(p, 'from_right_percent', 100), numeric(p, 'to_right_percent', 0));
    } else if (action.operator_id === 'svg.stroke-draw@1') {
      state.strokeProgress = value(progress, numeric(p, 'from_progress', 0), numeric(p, 'to_progress', 1));
    } else if (action.operator_id === 'document.highlight@1') {
      state.highlightProgress = value(progress, numeric(p, 'from_progress', 0), numeric(p, 'to_progress', 1));
    } else if (action.operator_id === 'chart.reveal@1') {
      state.chartProgress = value(progress, numeric(p, 'from_progress', 0), numeric(p, 'to_progress', 1));
    }
  }
  return state;
};

export const componentSupportsOperator = (component: VisualComponent, operatorId: CanonicalOperatorId) => {
  if (operatorId === 'scene.shared-element@1') return component.render_kind === 'asset';
  if (operatorId === 'camera.transform@1') return component.render_kind === 'camera';
  if (operatorId === 'svg.stroke-draw@1') return component.render_kind === 'svg-path';
  if (operatorId === 'document.highlight@1') return component.render_kind === 'document-highlight';
  if (operatorId === 'chart.reveal@1') return component.render_kind === 'chart';
  if (operatorId === 'grain.overlay@1') return component.render_kind === 'asset';
  return component.render_kind === 'asset';
};
