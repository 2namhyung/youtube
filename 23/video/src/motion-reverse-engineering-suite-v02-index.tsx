import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {CorrectedSample08, CorrectedSample09} from './motion-reverse-engineering-suite-v02';

const Root: React.FC = () => <>
  <Composition id="MotionReverseSuite08-Corrected-Provisional" component={CorrectedSample08} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="MotionReverseSuite09-Corrected-Provisional" component={CorrectedSample09} durationInFrames={300} fps={30} width={1920} height={1080} />
</>;

registerRoot(Root);
