import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {SuiteSample01, SuiteSample04, SuiteSample05, SuiteSample06, SuiteSample07, SuiteSample08, SuiteSample09, SuiteSample10} from './motion-reverse-engineering-suite-v01';

const SuiteRoot: React.FC = () => <>
  <Composition id="MotionReverseSuite01-Provisional" component={SuiteSample01} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="MotionReverseSuite04-Provisional" component={SuiteSample04} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="MotionReverseSuite05-Provisional" component={SuiteSample05} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="MotionReverseSuite06-Provisional" component={SuiteSample06} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="MotionReverseSuite07-Provisional" component={SuiteSample07} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="MotionReverseSuite08-Provisional" component={SuiteSample08} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="MotionReverseSuite09-Provisional" component={SuiteSample09} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="MotionReverseSuite10-Provisional" component={SuiteSample10} durationInFrames={300} fps={30} width={1920} height={1080} />
</>;

registerRoot(SuiteRoot);
