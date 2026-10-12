import {interpolate, spring} from 'remotion';

import type {AnimationAction} from '../../cut-manifest';

export type MotionState = {
  opacity: number;
  x: number;
  y: number;
  scale: number;
  rotate: number;
  clip: number;
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export const frameProgress = (frame: number, startFrame: number, endFrame: number) => {
  if (endFrame <= startFrame) return frame >= endFrame ? 1 : 0;
  return clamp((frame - startFrame) / (endFrame - startFrame));
};

const easing = (progress: number, name?: string) => {
  if (name === 'linear') return progress;
  if (name === 'ease-in') return progress * progress;
  if (name === 'ease-out') return 1 - (1 - progress) ** 3;
  return progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
};

const valueAt = (from: Record<string, number> | undefined, to: Record<string, number> | undefined, key: string, fallbackFrom: number, fallbackTo: number, progress: number) => {
  const start = Number.isFinite(from?.[key]) ? Number(from?.[key]) : fallbackFrom;
  const end = Number.isFinite(to?.[key]) ? Number(to?.[key]) : fallbackTo;
  return interpolate(progress, [0, 1], [start, end]);
};

export const actionProgress = (action: AnimationAction, frame: number, fps: number) => {
  if (action.type === 'spring-enter' || action.type === 'place' || action.type === 'slap') {
    if (frame < action.start_frame) return 0;
    const span = Math.max(1, action.end_frame - action.start_frame);
    const raw = spring({
      frame: frame - action.start_frame,
      fps,
      durationInFrames: span,
      config: {damping: 18, stiffness: 110, mass: 0.75},
    });
    return clamp(raw);
  }
  return easing(frameProgress(frame, action.start_frame, action.end_frame), action.easing);
};

/** Combines manifest actions without adding an independent timing source. */
export const resolveMotionState = ({
  actions,
  frame,
  fps,
  fallbackReveal,
}: {
  actions: AnimationAction[];
  frame: number;
  fps: number;
  fallbackReveal: number;
}): MotionState => {
  let state: MotionState = {opacity: fallbackReveal, x: 0, y: 0, scale: 1, rotate: 0, clip: fallbackReveal};
  for (const action of actions) {
    const progress = actionProgress(action, frame, fps);
    if (action.type === 'spring-enter' || action.type === 'place' || action.type === 'slap') {
      const slap = action.type === 'slap';
      state = {
        ...state,
        opacity: Math.min(state.opacity, valueAt(action.from, action.to, 'opacity', 0, 1, progress)),
        y: state.y + valueAt(action.from, action.to, 'y', slap ? -36 : 54, 0, progress),
        scale: state.scale * valueAt(action.from, action.to, 'scale', slap ? 1.18 : 0.86, 1, progress),
        rotate: state.rotate + valueAt(action.from, action.to, 'rotate', slap ? -4.5 : -2.4, 0, progress),
      };
    } else if (action.type === 'ease-move' || action.type === 'rise' || action.type === 'camera') {
      state.x += valueAt(action.from, action.to, 'x', 0, 0, progress);
      state.y += valueAt(action.from, action.to, 'y', action.type === 'rise' ? 72 : 0, 0, progress);
      state.rotate += valueAt(action.from, action.to, 'rotate', 0, 0, progress);
      state.scale *= valueAt(action.from, action.to, 'scale', 1, 1, progress);
    } else if (action.type === 'scale') {
      state.scale *= valueAt(action.from, action.to, 'scale', 1, 1, progress);
    } else if (action.type === 'opacity') {
      state.opacity = Math.min(state.opacity, valueAt(action.from, action.to, 'opacity', 0, 1, progress));
    } else if (action.type === 'mask-reveal' || action.type === 'draw-path' || action.type === 'chart-draw' || action.type === 'wipe' || action.type === 'highlight') {
      state.clip = Math.min(state.clip, progress);
    }
  }
  return state;
};

export const lifecycleProgress = (frame: number, reveal: {start_frame: number; end_frame: number} | null | undefined) => {
  if (!reveal) return 0;
  return frameProgress(frame, reveal.start_frame, reveal.end_frame);
};
