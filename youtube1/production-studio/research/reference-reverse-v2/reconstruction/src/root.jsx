import React from 'react';
import {Composition} from 'remotion';
import {ReconstructionStudy} from './scene';

export const Root = () => (
  <Composition
    id="VQazcEu9XwReconstruction"
    component={ReconstructionStudy}
    durationInFrames={263}
    fps={30000 / 1001}
    width={540}
    height={960}
    defaultProps={{showLabel: true}}
  />
);
