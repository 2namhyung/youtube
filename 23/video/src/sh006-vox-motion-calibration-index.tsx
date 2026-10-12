import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {Sh006VoxMotionCalibrationV01} from './sh006-vox-motion-calibration-v01';

export const RemotionRoot = () => <>
  <Composition id="SH006-VoxMotion-B03-B05-Provisional" component={Sh006VoxMotionCalibrationV01} width={1920} height={1080} fps={30} durationInFrames={450} />
</>;

registerRoot(RemotionRoot);

