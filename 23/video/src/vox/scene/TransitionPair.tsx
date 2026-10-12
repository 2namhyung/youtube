import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

import type {AnyCutManifest, CutAsset, CutManifest, CutManifestV3, PresentationComponent, SharedElementFallback, SharedElementTransition} from '../../cut-manifest';
import {resolveSharedElementFrameState} from '../motion/operator-registry';
import {ManifestScene} from './ManifestScene';
import {PresentationComponentMedia} from './PresentationScene';
import {componentDepth, type CutAssetSheet} from './asset-sheet';

export type TimelineTransitionContract = {
  type: 'scene-to-scene' | 'morph';
  operator_id: 'scene.crossfade@1' | 'scene.scale-crossfade@1' | 'scene.shared-element@1';
  duration_frames: number;
  continuity: CutManifest['transition']['continuity'];
  fallback?: SharedElementFallback | null;
  shared_element?: SharedElementTransition | null;
};

export type TransitionPairProps = {
  outgoing: AnyCutManifest;
  incoming: AnyCutManifest;
  outgoingBasePath: string;
  incomingBasePath: string;
  outgoingAssetSheet: CutAssetSheet;
  incomingAssetSheet: CutAssetSheet;
  transition: TimelineTransitionContract;
  frameOverride?: number;
  debugVisualization?: 'depth-occlusion';
  treatmentMode?: 'enabled' | 'disabled';
};

type EndpointBinding = {
  component: PresentationComponent;
  asset: CutAsset;
  basePath: string;
};

type SharedBinding = {
  mapping: SharedElementTransition;
  outgoing: EndpointBinding;
  incoming: EndpointBinding;
};

const isPresentationManifest = (manifest: AnyCutManifest): manifest is CutManifestV3 => manifest.schema_version === 3
  && Array.isArray((manifest as CutManifestV3).visual_components);

const endpointBinding = (manifest: CutManifestV3, componentId: string, assetId: string, basePath: string): EndpointBinding | null => {
  const component = manifest.visual_components.find((candidate) => candidate.component_id === componentId);
  const asset = manifest.assets.find((candidate) => candidate.asset_id === assetId);
  if (!component || component.render_kind !== 'asset' || component.asset_id !== assetId || !asset) return null;
  return {component, asset, basePath};
};

export const resolveSharedElementBinding = ({outgoing, incoming, outgoingBasePath, incomingBasePath, transition}: Pick<TransitionPairProps, 'outgoing' | 'incoming' | 'outgoingBasePath' | 'incomingBasePath' | 'transition'>): SharedBinding | null => {
  const mapping = transition.shared_element;
  if (transition.operator_id !== 'scene.shared-element@1' || !mapping || !isPresentationManifest(outgoing) || !isPresentationManifest(incoming)) return null;
  const outgoingBinding = endpointBinding(outgoing, mapping.outgoing.component_id, mapping.outgoing.asset_id, outgoingBasePath);
  const incomingBinding = endpointBinding(incoming, mapping.incoming.component_id, mapping.incoming.asset_id, incomingBasePath);
  if (!outgoingBinding || !incomingBinding) return null;
  return {mapping, outgoing: outgoingBinding, incoming: incomingBinding};
};

function FallbackCrossfade({outgoing, incoming, outgoingBasePath, incomingBasePath, outgoingAssetSheet, incomingAssetSheet, duration, frame, debugVisualization, treatmentMode}: Omit<TransitionPairProps, 'transition' | 'frameOverride'> & {duration: number; frame: number}) {
  const progress = Math.max(0, Math.min(1, frame / Math.max(1, duration - 1)));
  const outgoingFrame = Math.max(0, outgoing.duration_frames - duration + frame);
  const incomingFrame = Math.min(incoming.duration_frames - 1, frame);
  return <AbsoluteFill data-transition-fallback="invalid-mapping">
    <AbsoluteFill style={{opacity: interpolate(progress, [0, 1], [1, 0])}}>
      <ManifestScene manifest={outgoing} cutBasePath={outgoingBasePath} assetSheet={outgoingAssetSheet} frameOverride={outgoingFrame} debugVisualization={debugVisualization} treatmentMode={treatmentMode} />
    </AbsoluteFill>
    <AbsoluteFill style={{opacity: interpolate(progress, [0, 1], [0, 1])}}>
      <ManifestScene manifest={incoming} cutBasePath={incomingBasePath} assetSheet={incomingAssetSheet} frameOverride={incomingFrame} debugVisualization={debugVisualization} treatmentMode={treatmentMode} />
    </AbsoluteFill>
  </AbsoluteFill>;
}

/** Generic adjacent-scene bridge driven only by the supplied manifest mapping. */
export function TransitionPair(props: TransitionPairProps) {
  const {outgoing, incoming, outgoingBasePath, incomingBasePath, outgoingAssetSheet, incomingAssetSheet, transition, frameOverride, debugVisualization, treatmentMode} = props;
  const currentFrame = useCurrentFrame();
  const frame = frameOverride ?? currentFrame;
  const duration = Math.max(1, transition.duration_frames);
  const binding = resolveSharedElementBinding({outgoing, incoming, outgoingBasePath, incomingBasePath, transition});
  if (!binding) return <FallbackCrossfade outgoing={outgoing} incoming={incoming} outgoingBasePath={outgoingBasePath} incomingBasePath={incomingBasePath} outgoingAssetSheet={outgoingAssetSheet} incomingAssetSheet={incomingAssetSheet} duration={duration} frame={frame} debugVisualization={debugVisualization} treatmentMode={treatmentMode} />;

  const state = resolveSharedElementFrameState(binding.mapping, frame, duration);
  const outgoingFrame = Math.max(0, outgoing.duration_frames - duration + frame);
  const incomingFrame = Math.min(incoming.duration_frames - 1, frame);
  const rect = state.rect;
  const sharedDepth = Math.round(interpolate(state.progress, [0, 1], [
    componentDepth(outgoingAssetSheet, binding.outgoing.component.component_id),
    componentDepth(incomingAssetSheet, binding.incoming.component.component_id),
  ]));
  const sharedStyle: React.CSSProperties = {
    position: 'absolute',
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    transform: `translate3d(${state.camera.x}px,${state.camera.y}px,0) scale(${state.camera.scale}) rotate(${state.camera.rotate}deg)`,
    transformOrigin: 'center',
  };

  return <AbsoluteFill data-transition-operator={transition.operator_id} data-transition-progress={state.progress}>
    <AbsoluteFill style={{opacity: 1 - state.progress}}>
      <ManifestScene manifest={outgoing} cutBasePath={outgoingBasePath} assetSheet={outgoingAssetSheet} frameOverride={outgoingFrame} excludeComponentIds={[binding.mapping.outgoing.component_id]} debugVisualization={debugVisualization} treatmentMode={treatmentMode} />
    </AbsoluteFill>
    <AbsoluteFill style={{opacity: state.progress}}>
      <ManifestScene manifest={incoming} cutBasePath={incomingBasePath} assetSheet={incomingAssetSheet} frameOverride={incomingFrame} excludeComponentIds={[binding.mapping.incoming.component_id]} debugVisualization={debugVisualization} treatmentMode={treatmentMode} />
    </AbsoluteFill>
    <div style={{...sharedStyle, zIndex: sharedDepth}} data-shared-element-depth={sharedDepth}>
      <div style={{position: 'absolute', inset: 0, opacity: state.outgoingOpacity}} data-shared-element-phase="outgoing" data-presentation-state={binding.mapping.outgoing.state}>
        <PresentationComponentMedia component={binding.outgoing.component} asset={binding.outgoing.asset} cutBasePath={binding.outgoing.basePath} progress={1} />
      </div>
      <div style={{position: 'absolute', inset: 0, opacity: state.incomingOpacity}} data-shared-element-phase="incoming" data-presentation-state={binding.mapping.incoming.state}>
        <PresentationComponentMedia component={binding.incoming.component} asset={binding.incoming.asset} cutBasePath={binding.incoming.basePath} progress={1} />
      </div>
    </div>
  </AbsoluteFill>;
}
