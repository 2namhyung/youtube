import {createSignal} from '@motion-canvas/core';

window.MotionCanvasAuthored = {
  seek(frame, totalFrames) {
    const progress = createSignal(0);
    progress(frame / Math.max(1, totalFrames - 1));
    return progress();
  },
};
