import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {ChartInternalDrawProbe, NumericRevealCountProbe} from './motion-reverse-engineering-pilot-v01';

const Root: React.FC = () => <>
  <Composition id="MotionReversePilot02-Provisional" component={NumericRevealCountProbe} width={1920} height={1080} fps={30} durationInFrames={300} />
  <Composition id="MotionReversePilot03-Provisional" component={ChartInternalDrawProbe} width={1920} height={1080} fps={30} durationInFrames={300} />
</>;

registerRoot(Root);
