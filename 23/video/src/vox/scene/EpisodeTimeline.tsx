import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';

import type {AnyCutManifest} from '../../cut-manifest';
import type {TimelineTransitionContract} from './TransitionPair';
import type {CutAssetSheet} from './asset-sheet';
import {ManifestScene} from './ManifestScene';
import {TransitionPair} from './TransitionPair';

export type TimelineCut = {
  shotId: string;
  manifest: AnyCutManifest;
  cutBasePath: string;
  assetSheet: CutAssetSheet;
  startFrame: number;
  durationFrames: number;
};

export type TimelineBoundary = {
  boundaryId: string;
  outgoingShotId: string;
  incomingShotId: string;
  startFrame: number;
  durationFrames: number;
  transition: TimelineTransitionContract;
};

export type EpisodeTimelineProps = {
  cuts: TimelineCut[];
  boundaries: TimelineBoundary[];
  windowStartFrame?: number;
  debugVisualization?: 'depth-occlusion';
  treatmentMode?: 'enabled' | 'disabled';
  treatmentProtectionIsolation?: boolean;
  suppressBoundaries?: boolean;
};

export function EpisodeTimeline({cuts, boundaries, windowStartFrame = 0, debugVisualization, treatmentMode = 'enabled', treatmentProtectionIsolation = false, suppressBoundaries = false}: EpisodeTimelineProps) {
  const frame = useCurrentFrame() + windowStartFrame;
  const cutMap = new Map(cuts.map((cut) => [cut.shotId, cut]));
  const boundary = suppressBoundaries ? undefined : boundaries.find((candidate) => frame >= candidate.startFrame && frame < candidate.startFrame + candidate.durationFrames);

  if (boundary) {
    const outgoing = cutMap.get(boundary.outgoingShotId);
    const incoming = cutMap.get(boundary.incomingShotId);
    if (!outgoing || !incoming) return <AbsoluteFill />;
    return <TransitionPair outgoing={outgoing.manifest} incoming={incoming.manifest} outgoingBasePath={outgoing.cutBasePath} incomingBasePath={incoming.cutBasePath} outgoingAssetSheet={outgoing.assetSheet} incomingAssetSheet={incoming.assetSheet} transition={boundary.transition} frameOverride={frame - boundary.startFrame} debugVisualization={debugVisualization} treatmentMode={treatmentMode} />;
  }

  const cut = [...cuts].reverse().find((candidate) => frame >= candidate.startFrame && frame < candidate.startFrame + candidate.durationFrames);
  if (!cut) return <AbsoluteFill />;
  return <ManifestScene manifest={cut.manifest} cutBasePath={cut.cutBasePath} assetSheet={cut.assetSheet} frameOverride={frame - cut.startFrame} debugVisualization={debugVisualization} treatmentMode={treatmentMode} treatmentProtectionIsolation={treatmentProtectionIsolation} />;
}
