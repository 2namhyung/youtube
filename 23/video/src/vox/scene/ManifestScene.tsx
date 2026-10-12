import React from 'react';
import {AbsoluteFill, Freeze, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Video} from '@remotion/media';

import type {AnyCutManifest, CutAsset, CutEffect, CutManifest, CutManifestV2, CutManifestV3, VisualComponent} from '../../cut-manifest';
import {isCutManifestV2, isCutManifestV3} from '../../cut-manifest';
import {AIReconstructionLabel, SourceFooter} from '../../motion';
import {ManifestChart} from '../charts';
import {CollageBoard, Cutout, DocumentPlate, HalftoneWash, Layer, PaperBackground, SourcePhoto} from '../collage';
import {frameProgress, lifecycleProgress, resolveMotionState} from '../motion/presets';
import {resolveOperatorState} from '../motion/operator-registry';
import {cutAssetPath, roleLayout, videoFreezeFrame} from './model';
import {PresentationScene} from './PresentationScene';
import type {CutAssetSheet} from './asset-sheet';
import {SequencedSourceVideo} from './source-video';

export type ManifestSceneProps = {manifest: AnyCutManifest; cutBasePath: string; assetSheet?: CutAssetSheet; frameOverride?: number; excludeComponentIds?: readonly string[]; debugVisualization?: 'depth-occlusion'; treatmentMode?: 'enabled' | 'disabled'; treatmentProtectionIsolation?: boolean};

const assetAlt = (asset: CutAsset) => `${asset.role} ${asset.asset_id}`;

function AssetMedia({asset, src, fps, activationFrame, activeEndFrame, frameOverride, freezeFrame}: {asset: CutAsset; src: string; fps: number; activationFrame: number; activeEndFrame: number; frameOverride?: number; freezeFrame?: number}) {
  if (asset.media_type.startsWith('video/')) {
    return <SequencedSourceVideo asset={asset} src={src} fps={fps} activationFrame={activationFrame} activeEndFrame={activeEndFrame} frameOverride={frameOverride} style={{width: '100%', height: '100%', objectFit: asset.role === 'document' ? 'contain' : 'cover'}} />;
  }
  if (asset.role === 'document' || asset.role === 'evidence') return <DocumentPlate src={src} alt={assetAlt(asset)} />;
  if (asset.role === 'plate') return <SourcePhoto src={src} alt={assetAlt(asset)} />;
  if (asset.role === 'character' || asset.role === 'architecture' || asset.role === 'foreground' || asset.role === 'accent') return <Cutout src={src} alt={assetAlt(asset)} />;
  return <Img src={src} alt={assetAlt(asset)} style={{width: '100%', height: '100%', objectFit: 'contain'}} />;
}

function EffectMedia({effect, src}: {effect: CutEffect; src: string}) {
  const style: React.CSSProperties = {width: '100%', height: '100%', objectFit: 'cover', mixBlendMode: effect.blend_mode};
  return effect.kind === 'sfx' ? null : effect.file.match(/\.(?:mp4|webm|mov)$/iu) ? <Video src={src} muted loop={effect.loop} style={style} /> : <Img src={src} style={style} />;
}

function LegacyManifestScene({manifest, cutBasePath, frameOverride}: {manifest: CutManifest; cutBasePath: string; frameOverride?: number}) {
  const currentFrame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const frame = frameOverride ?? currentFrame;
  const reveal = lifecycleProgress(frame, manifest.lifecycle?.reveal);
  const revealStart = manifest.lifecycle?.reveal.start_frame ?? Number.POSITIVE_INFINITY;
  const isBackgroundOnly = frame < revealStart;
  const finalHold = manifest.lifecycle ? frame >= manifest.lifecycle.final_hold.start_frame : false;
  const frozenVideoFrame = videoFreezeFrame({currentFrame, frameOverride, finalHoldStart: manifest.lifecycle?.final_hold.start_frame});
  const cameraActions = manifest.animations.filter((action) => action.target_id === 'camera');
  const cameraMotion = resolveMotionState({actions: cameraActions, frame, fps, fallbackReveal: 1});
  const sourceText = manifest.source_ids.filter(Boolean).join(' · ');

  return <AbsoluteFill style={{background: '#f2ead8', color: '#302a24', fontFamily: 'Arial, "Noto Sans KR", sans-serif', overflow: 'hidden'}}>
    <PaperBackground src={staticFile(cutAssetPath(cutBasePath, manifest.background))} />
    <CollageBoard camera={{x: cameraMotion.x, y: cameraMotion.y, scale: cameraMotion.scale, rotate: cameraMotion.rotate}}>
      {manifest.assets.map((asset, index) => {
        const actions = manifest.animations.filter((action) => action.target_id === asset.asset_id);
        const motion = resolveMotionState({actions, frame, fps, fallbackReveal: finalHold ? 1 : reveal});
        const layout = roleLayout(asset, index, manifest.assets.length);
        return <Layer key={asset.asset_id} zIndex={asset.z_index} style={{...layout, opacity: finalHold ? 1 : motion.opacity, transform: `translate3d(${motion.x}px, ${motion.y}px, ${asset.z_index * 2}px) scale(${motion.scale}) rotate(${motion.rotate}deg)`, clipPath: `inset(0 ${100 - motion.clip * 100}% 0 0)`}}>
          <AssetMedia asset={asset} src={staticFile(cutAssetPath(cutBasePath, asset.file))} fps={fps} activationFrame={manifest.lifecycle?.reveal.start_frame ?? 0} activeEndFrame={manifest.duration_frames} frameOverride={frameOverride} freezeFrame={frozenVideoFrame} />
        </Layer>;
      })}
      {!isBackgroundOnly && manifest.chart && <Layer zIndex={80} style={{left: 270, top: 160, width: 1380, height: 690, opacity: finalHold ? 1 : frameProgress(frame, manifest.chart.reveal.start_frame, manifest.chart.reveal.end_frame)}}>
        <ManifestChart chart={manifest.chart} progress={finalHold ? 1 : frameProgress(frame, manifest.chart.reveal.start_frame, manifest.chart.reveal.end_frame)} />
      </Layer>}
      {manifest.effects.map((effect) => {
        const progress = frameProgress(frame, effect.start_frame, effect.end_frame);
        const effectActions = manifest.animations.filter((action) => action.target_id === effect.effect_id);
        const motion = resolveMotionState({actions: effectActions, frame, fps, fallbackReveal: finalHold ? 1 : reveal});
        if (isBackgroundOnly || frame < effect.start_frame || (!effect.loop && frame >= effect.end_frame && !effect.persists_to_final)) return null;
        const envelope = effect.persists_to_final && finalHold ? 1 : interpolate(progress, [0, 0.15, 0.85, 1], [0, 1, 1, effect.loop ? 1 : 0]);
        return <AbsoluteFill key={effect.effect_id} style={{zIndex: 200, opacity: effect.opacity * envelope * motion.opacity, transform: `translate3d(${motion.x}px, ${motion.y}px, 0) scale(${motion.scale}) rotate(${motion.rotate}deg)`, clipPath: `inset(0 ${100 - motion.clip * 100}% 0 0)`}}>
          <EffectMedia effect={effect} src={staticFile(cutAssetPath(cutBasePath, effect.file))} />
        </AbsoluteFill>;
      })}
      {manifest.text_cues.map((cue) => {
        if (isBackgroundOnly || frame < cue.start_frame || frame >= cue.end_frame) return null;
        return <div key={cue.cue_id} style={{position: 'absolute', zIndex: 240, left: 100 + (cue.cue_id.length * 47) % 1180, top: 90 + (cue.cue_id.length * 29) % 690, fontSize: cue.kind === 'number' ? 72 : 43, fontWeight: 900, color: '#302a24', transform: 'rotate(-1deg)', textShadow: '3px 3px 0 #fffaf0'}}>{cue.text}</div>;
      })}
    </CollageBoard>
    {!isBackgroundOnly && <HalftoneWash opacity={0.035} />}
    {!isBackgroundOnly && sourceText && <SourceFooter text={sourceText} />}
    {!isBackgroundOnly && manifest.ai_disclosure && <AIReconstructionLabel text={manifest.ai_disclosure.label} />}
  </AbsoluteFill>;
}

const componentLayout = (component: VisualComponent, fallback: ReturnType<typeof roleLayout>) => component.layout ?? fallback;

function ManifestSceneV2({manifest, cutBasePath, frameOverride}: {manifest: CutManifestV2; cutBasePath: string; frameOverride?: number}) {
  const currentFrame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const frame = frameOverride ?? currentFrame;
  const isBackgroundOnly = frame < (manifest.lifecycle?.reveal.start_frame ?? Number.POSITIVE_INFINITY);
  const finalHold = manifest.lifecycle ? frame >= manifest.lifecycle.final_hold.start_frame : false;
  const frozenVideoFrame = videoFreezeFrame({currentFrame, frameOverride, finalHoldStart: manifest.lifecycle?.final_hold.start_frame});
  const componentMap = new Map(manifest.visual_components.map((component) => [component.component_id, component]));
  const assetMap = new Map(manifest.assets.map((asset) => [asset.asset_id, asset]));
  const camera = manifest.visual_components.find((component) => component.render_kind === 'camera');
  const cameraState = camera ? resolveOperatorState({actions: manifest.motion_actions.filter((action) => action.target_component_id === camera.component_id), frame, fps}) : resolveOperatorState({actions: [], frame, fps});
  const sourceText = manifest.source_ids.filter(Boolean).join(' · ');

  return <AbsoluteFill style={{background: '#f2ead8', color: '#302a24', fontFamily: 'Arial, "Noto Sans KR", sans-serif', overflow: 'hidden'}}>
    <PaperBackground src={staticFile(cutAssetPath(cutBasePath, manifest.background))} />
    <CollageBoard camera={{x: cameraState.x, y: cameraState.y, scale: cameraState.scale, rotate: cameraState.rotate}}>
      {manifest.visual_components.map((component, index) => {
        if (component.render_kind === 'camera') return null;
        if (isBackgroundOnly) return null;
        const state = resolveOperatorState({actions: manifest.motion_actions.filter((action) => action.target_component_id === component.component_id), frame, fps});
        if (component.render_kind === 'asset' && component.asset_id) {
          const asset = assetMap.get(component.asset_id);
          if (!asset) return null;
          const layout = componentLayout(component, roleLayout(asset, index, manifest.assets.length));
          return <Layer key={component.component_id} zIndex={asset.z_index} style={{...layout, opacity: finalHold ? 1 : state.opacity, transform: `translate3d(${state.x}px, ${state.y}px, ${asset.z_index * 2}px) scale(${state.scale}) rotate(${state.rotate}deg)`, clipPath: `inset(0 ${state.insetRight}% 0 0)`}}>
            <AssetMedia asset={asset} src={staticFile(cutAssetPath(cutBasePath, asset.file))} fps={fps} activationFrame={manifest.lifecycle?.reveal.start_frame ?? 0} activeEndFrame={manifest.duration_frames} frameOverride={frameOverride} freezeFrame={frozenVideoFrame} />
          </Layer>;
        }
        if (component.render_kind === 'svg-path' && component.svg_path) {
          const layout = component.layout ?? {left: 0, top: 0, width: 1920, height: 1080};
          const dash = 1800;
          return <Layer key={component.component_id} zIndex={95} style={layout}>
            <svg viewBox="0 0 1920 1080" width="100%" height="100%" style={{overflow: 'visible'}}>
              <path d={component.svg_path} fill="none" stroke="#b54436" strokeWidth="14" strokeLinecap="round" strokeDasharray={dash} strokeDashoffset={dash * (1 - state.strokeProgress)} />
            </svg>
          </Layer>;
        }
        if (component.render_kind === 'document-highlight') {
          const layout = component.layout ?? {left: 620, top: 480, width: 600, height: 42};
          return <Layer key={component.component_id} zIndex={110} style={{...layout, background: 'rgba(240,186,54,.48)', transformOrigin: 'left center', transform: `scaleX(${state.highlightProgress})`, opacity: state.highlightProgress}}><></></Layer>;
        }
        if (component.render_kind === 'chart' && manifest.chart) {
          return <Layer key={component.component_id} zIndex={80} style={component.layout ?? {left: 270, top: 160, width: 1380, height: 690}}>
            <ManifestChart chart={manifest.chart} progress={finalHold ? 1 : state.chartProgress} />
          </Layer>;
        }
        return null;
      })}
      {manifest.effects.map((effect) => <EffectMedia key={effect.effect_id} effect={effect} src={staticFile(cutAssetPath(cutBasePath, effect.file))} />)}
      {manifest.text_cues.map((cue) => frame >= cue.start_frame && frame < cue.end_frame ? <div key={cue.cue_id} style={{position: 'absolute', zIndex: 240, left: 140, top: 100, fontSize: cue.kind === 'number' ? 72 : 43, fontWeight: 900}}>{cue.text}</div> : null)}
    </CollageBoard>
    {!isBackgroundOnly && <HalftoneWash opacity={0.035} />}
    {!isBackgroundOnly && sourceText && <SourceFooter text={sourceText} />}
    {!isBackgroundOnly && manifest.ai_disclosure && <AIReconstructionLabel text={manifest.ai_disclosure.label} />}
  </AbsoluteFill>;
}

export function ManifestScene({manifest, cutBasePath, assetSheet, frameOverride, excludeComponentIds, debugVisualization, treatmentMode, treatmentProtectionIsolation}: ManifestSceneProps) {
  if (isCutManifestV3(manifest)) return <PresentationScene manifest={manifest} cutBasePath={cutBasePath} assetSheet={assetSheet} frameOverride={frameOverride} excludeComponentIds={excludeComponentIds} debugVisualization={debugVisualization} treatmentMode={treatmentMode} treatmentProtectionIsolation={treatmentProtectionIsolation} />;
  if (manifest.schema_version === 3) return <PresentationScene manifest={manifest as CutManifestV3} cutBasePath={cutBasePath} assetSheet={assetSheet} frameOverride={frameOverride} excludeComponentIds={excludeComponentIds} debugVisualization={debugVisualization} treatmentMode={treatmentMode} treatmentProtectionIsolation={treatmentProtectionIsolation} />;
  return isCutManifestV2(manifest)
    ? <ManifestSceneV2 manifest={manifest} cutBasePath={cutBasePath} frameOverride={frameOverride} />
    : <LegacyManifestScene manifest={manifest} cutBasePath={cutBasePath} frameOverride={frameOverride} />;
}
