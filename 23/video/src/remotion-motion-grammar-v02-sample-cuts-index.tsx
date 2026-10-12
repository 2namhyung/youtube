import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {RemotionMotionGrammarV02SampleCuts, type SampleId} from './remotion-motion-grammar-v02-sample-cuts';

const samples: SampleId[] = ['sample-01-shared-background-accumulation', 'sample-02-numeric-step-progression', 'sample-03-chart-reveal', 'sample-04-map-route-reframe', 'sample-05-object-preserving-layout-reframe', 'sample-06-directional-exit-hard-cut-pair', 'sample-07-hook-reel-collage-montage', 'sample-08-speaker-supporting-overlay-entry', 'sample-09-device-light-focal-motion', 'sample-10-narrative-scale-translation'];
export const RemotionRoot = () => <>{samples.map((sampleId, index) => <Composition key={sampleId} id={`RemotionGrammarV02SampleCut${String(index + 1).padStart(2, '0')}`} component={() => <RemotionMotionGrammarV02SampleCuts sampleId={sampleId} />} width={1920} height={1080} fps={30} durationInFrames={300} />)}</>;
registerRoot(RemotionRoot);
