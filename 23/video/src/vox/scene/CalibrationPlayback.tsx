import React from 'react';
import type {AnyCutManifest} from '../../cut-manifest';
import {ManifestScene} from './ManifestScene';

export type CalibrationPlaybackProps = {
  manifest: AnyCutManifest;
  cutBasePath: string;
  previewFrame?: number;
};

/**
 * Review-only playback component. It deliberately does not supply a frame
 * override, so Remotion Studio drives the manifest's reveal and final hold
 * from the real current frame.
 */
export function CalibrationPlayback({manifest, cutBasePath}: CalibrationPlaybackProps) {
  return <ManifestScene manifest={manifest} cutBasePath={cutBasePath} />;
}

export function MobileCalibrationPlayback({manifest, cutBasePath, previewFrame}: CalibrationPlaybackProps) {
  return <div style={{position: 'absolute', width: 1920, height: 1080, transform: 'scale(0.1875)', transformOrigin: 'top left'}}>
    <ManifestScene manifest={manifest} cutBasePath={cutBasePath} frameOverride={previewFrame} />
  </div>;
}
