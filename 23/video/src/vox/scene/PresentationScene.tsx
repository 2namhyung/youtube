import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

import type {ChartSpec, CutAsset, CutManifestV3, PresentationComponent, PresentationLayoutTemplate, PresentationSlot, PresentationState, SelectiveTreatment} from '../../cut-manifest';
import {SourceFooter} from '../../motion';
import {PaperBackground} from '../collage';
import {ManifestChart} from '../charts';
import {GRAIN_OVERLAY_LIMITS, grainOverlayDataUri, resolveOperatorState} from '../motion/operator-registry';
import {componentDepth, componentLayer, systemDepth, type CutAssetSheet} from './asset-sheet';
import {cutAssetPath} from './model';
import {resolveV3PresentationRuntime, v3CameraTransform, v3ComponentClipPath, v3DocumentHighlightWidth, v3TextCueTransform} from './presentation-runtime';
import {SequencedSourceVideo} from './source-video';

type Rect = {left: number; top: number; width: number; height: number};

const TEMPLATES: Record<PresentationLayoutTemplate, Partial<Record<PresentationSlot, Rect>>> = {
  'experience-hero': {
    hero: {left: 110, top: 250, width: 720, height: 720},
    'echo-1': {left: 940, top: 120, width: 690, height: 300},
    'echo-2': {left: 1110, top: 390, width: 650, height: 300},
    'echo-3': {left: 880, top: 670, width: 690, height: 270},
    support: {left: 1400, top: 760, width: 330, height: 210},
  },
  'document-focus': {
    overview: {left: 240, top: 100, width: 1440, height: 800},
    crop: {left: 180, top: 100, width: 1560, height: 650},
    quote: {left: 210, top: 270, width: 1500, height: 390},
    provenance: {left: 1420, top: 750, width: 340, height: 220},
    support: {left: 70, top: 700, width: 430, height: 290},
    hero: {left: 120, top: 220, width: 650, height: 740},
  },
  'process-flow': {
    'actor-left': {left: 80, top: 390, width: 340, height: 540},
    'actor-right': {left: 1500, top: 390, width: 340, height: 540},
    request: {left: 585, top: 385, width: 260, height: 340},
    result: {left: 1080, top: 610, width: 280, height: 220},
    'route-primary': {left: 0, top: 0, width: 1920, height: 1080},
    'route-return': {left: 0, top: 0, width: 1920, height: 1080},
    quote: {left: 420, top: 120, width: 1080, height: 280},
    provenance: {left: 1460, top: 80, width: 300, height: 190},
    support: {left: 770, top: 710, width: 380, height: 250},
  },
  'before-after': {
    'comparison-left': {left: 90, top: 170, width: 800, height: 700},
    'comparison-right': {left: 1030, top: 170, width: 800, height: 700},
    quote: {left: 250, top: 330, width: 1420, height: 330},
    provenance: {left: 1450, top: 770, width: 310, height: 190},
  },
};

const presentationState = (component: PresentationComponent, frame: number): PresentationState =>
  component.visibility_timeline.find((interval) => frame >= interval.start_frame && frame < interval.end_frame)?.state ?? 'hidden';

const phaseOpacity = (state: PresentationState) => {
  if (state === 'hidden') return 0;
  if (state === 'supporting' || state === 'final-summary') return 0.3;
  if (state === 'exiting') return 0.18;
  return 1;
};

function CroppedEvidence({asset, cutBasePath, crop}: {asset: CutAsset; cutBasePath: string; crop: {x: number; y: number; width: number; height: number}}) {
  return <div style={{width: '100%', height: '100%', overflow: 'hidden', background: '#fff', boxShadow: '0 18px 45px rgba(44,34,25,.22)'}}>
    <Img src={staticFile(cutAssetPath(cutBasePath, asset.file))} style={{position: 'absolute', width: `${100 / crop.width}%`, height: `${100 / crop.height}%`, left: `${-100 * crop.x / crop.width}%`, top: `${-100 * crop.y / crop.height}%`, objectFit: 'fill'}} />
  </div>;
}

export function PresentationComponentMedia({component, asset, chart, cutBasePath, progress, highlightProgress = 0, chartProgress = 0}: {component: PresentationComponent; asset?: CutAsset; chart?: ChartSpec | null; cutBasePath: string; progress: number; highlightProgress?: number; chartProgress?: number}) {
  const evidence = component.document_evidence;
  if (asset && evidence?.phase === 'quote' && asset.source_crop_applied) return <div style={{position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#fff', boxShadow: '0 18px 45px rgba(44,34,25,.22)'}}>
    <Img data-native-document-framing src={staticFile(cutAssetPath(cutBasePath, asset.file))} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain'}} />
  </div>;
  if (evidence?.phase === 'quote') return <div style={{position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', color: '#2b2722'}}>
    <div data-document-highlight-band style={{position: 'absolute', left: 0, top: '43%', width: `${Math.max(0, Math.min(1, highlightProgress)) * 100}%`, height: '29%', background: 'rgba(241,190,64,.44)', borderRadius: 12, transformOrigin: 'left center'}} />
    <div style={{position: 'relative', zIndex: 1, fontSize: evidence.quote_font_px, lineHeight: 1.22, fontWeight: 900, letterSpacing: -2.2, wordBreak: 'keep-all', whiteSpace: 'pre-line', textAlign: 'center', textWrap: 'balance'}}>{evidence.exact_quote}</div>
    <div style={{position: 'relative', zIndex: 1, marginTop: 30, fontSize: 36, fontWeight: 800, color: '#7a2f26', textAlign: 'right'}}>{evidence.source_label}</div>
  </div>;
  if (asset && evidence?.phase === 'crop' && evidence.crop_normalized && !asset.source_crop_applied) return <CroppedEvidence asset={asset} cutBasePath={cutBasePath} crop={evidence.crop_normalized} />;
  if (asset && evidence?.phase === 'crop' && asset.source_crop_applied) return <div style={{position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#fff', boxShadow: '0 18px 45px rgba(44,34,25,.22)'}}>
    <Img data-native-document-framing src={staticFile(cutAssetPath(cutBasePath, asset.file))} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain'}} />
  </div>;
  if (asset && evidence?.phase === 'provenance') return <div style={{width: '100%', height: '100%', padding: 10, background: '#fffdf8', boxShadow: '0 10px 25px rgba(44,34,25,.18)', transform: 'rotate(1deg)'}}>
    <Img src={staticFile(cutAssetPath(cutBasePath, asset.file))} style={{width: '100%', height: '78%', objectFit: 'cover', objectPosition: 'top'}} />
    <div style={{fontSize: 20, fontWeight: 800, marginTop: 6}}>{evidence.source_label}</div>
  </div>;
  if (asset) return <Img src={staticFile(cutAssetPath(cutBasePath, asset.file))} style={{width: '100%', height: '100%', objectFit: asset.role === 'document' ? 'contain' : 'contain', filter: evidence?.phase === 'overview' ? 'drop-shadow(0 18px 30px rgba(44,34,25,.2))' : undefined}} />;
  if (component.render_kind === 'svg-path' && component.svg_path) {
    const dash = 1900;
    const returnPath = component.presentation_slot === 'route-return';
    return <svg viewBox="0 0 1920 1080" width="100%" height="100%" style={{overflow: 'visible'}}>
      <defs><marker id={`arrow-${component.component_id}`} markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 z" fill={returnPath ? '#365f78' : '#a84034'} /></marker></defs>
      <path d={component.svg_path} fill="none" stroke={returnPath ? '#365f78' : '#a84034'} strokeWidth="14" strokeLinecap="round" strokeDasharray={dash} strokeDashoffset={dash * (1 - progress)} markerEnd={`url(#arrow-${component.component_id})`} />
    </svg>;
  }
  if (component.render_kind === 'document-highlight') return <div data-document-highlight-band style={{width: `${Math.max(0, Math.min(1, highlightProgress)) * 100}%`, height: '100%', borderRadius: 12, background: 'rgba(241,190,64,.44)', transformOrigin: 'left center'}} />;
  if (component.render_kind === 'chart' && chart) return <div data-v3-chart-progress={Math.max(0, Math.min(1, chartProgress))} style={{width: '100%', height: '100%'}}><ManifestChart chart={chart} progress={Math.max(0, Math.min(1, chartProgress))} /></div>;
  return null;
}

export type PresentationSceneProps = {
  manifest: CutManifestV3;
  cutBasePath: string;
  assetSheet?: CutAssetSheet;
  frameOverride?: number;
  excludeComponentIds?: readonly string[];
  debugVisualization?: 'depth-occlusion';
  treatmentMode?: 'enabled' | 'disabled';
  treatmentProtectionIsolation?: boolean;
};

const DEBUG_COLORS: Record<string, string> = {structure: '#6f7d91', midground: '#4f8f84', subject: '#bd6b43', foreground: '#9b4d78', overlay: '#5c4f9d'};

const activeGrain = (treatment: SelectiveTreatment | undefined, frame: number, treatmentMode: 'enabled' | 'disabled') => treatmentMode === 'enabled'
  && treatment?.operator_id === 'grain.overlay@1'
  && treatment.implementation_status === 'implemented'
  && frame >= treatment.start_frame
  && frame < treatment.end_frame;

function GrainOverlay({treatment, maskSrc}: {treatment: SelectiveTreatment; maskSrc?: string}) {
  const opacity = Math.min(GRAIN_OVERLAY_LIMITS.maximumOpacity, Math.max(0, treatment.params.opacity));
  const mask = maskSrc ? `url("${maskSrc}")` : undefined;
  return <div
    data-treatment-id={treatment.treatment_id}
    data-treatment-operator={treatment.operator_id}
    data-treatment-seed={treatment.params.seed}
    style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      opacity,
      backgroundImage: `url("${grainOverlayDataUri({seed: treatment.params.seed, tileSizePx: treatment.params.tile_size_px, dotSizePx: treatment.params.dot_size_px, color: treatment.params.color})}")`,
      backgroundRepeat: 'repeat',
      mixBlendMode: 'multiply',
      maskImage: mask,
      WebkitMaskImage: mask,
      maskRepeat: mask ? 'no-repeat' : undefined,
      WebkitMaskRepeat: mask ? 'no-repeat' : undefined,
      maskPosition: mask ? 'center' : undefined,
      WebkitMaskPosition: mask ? 'center' : undefined,
      maskSize: mask ? 'contain' : undefined,
      WebkitMaskSize: mask ? 'contain' : undefined,
    }}
  />;
}

export function PresentationScene({manifest, cutBasePath, assetSheet, frameOverride, excludeComponentIds = [], debugVisualization, treatmentMode = 'enabled', treatmentProtectionIsolation = false}: PresentationSceneProps) {
  const currentFrame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const frame = frameOverride ?? currentFrame;
  const beat = manifest.visual_beats.find((candidate) => frame >= candidate.start_frame && frame < candidate.end_frame) ?? manifest.visual_beats.at(-1);
  const template = beat?.layout_template ?? 'experience-hero';
  const assetMap = new Map(manifest.assets.map((asset) => [asset.asset_id, asset]));
  const excluded = new Set(excludeComponentIds);
  const activeComponentIds = new Set(manifest.visual_components.filter((component) => {
    const state = presentationState(component, frame);
    return !excluded.has(component.component_id) && component.render_kind !== 'camera' && state !== 'hidden' && !beat?.hidden_component_ids.includes(component.component_id);
  }).map((component) => component.component_id));
  const sourceText = manifest.source_line ?? manifest.source_ids.filter(Boolean).join(' · ');
  const backgroundTreatment = manifest.treatments?.find((treatment) => treatment.target.kind === 'background');
  const runtime = resolveV3PresentationRuntime({manifest, frame, fps});
  return <AbsoluteFill style={{background: '#f2ead8', color: '#302a24', fontFamily: 'Arial, "Noto Sans KR", sans-serif', overflow: 'hidden'}}>
    {!treatmentProtectionIsolation ? <PaperBackground src={staticFile(cutAssetPath(cutBasePath, manifest.background))} /> : null}
    {!treatmentProtectionIsolation && activeGrain(backgroundTreatment, frame, treatmentMode) ? <GrainOverlay treatment={backgroundTreatment!} /> : null}
    <div data-v3-camera-group data-camera-transform-active={runtime.cameraActive ? 'true' : 'false'} style={{position: 'absolute', inset: 0, transform: v3CameraTransform(runtime.camera, runtime.cameraActive), transformOrigin: 'center'}}>
    {manifest.visual_components.map((component) => {
      if (excluded.has(component.component_id)) return null;
      if (component.render_kind === 'camera') return null;
      const state = presentationState(component, frame);
      if (state === 'hidden' || beat?.hidden_component_ids.includes(component.component_id)) return null;
      const rect = component.layout ?? TEMPLATES[template][component.presentation_slot];
      if (!rect) return null;
      const operatorState = runtime.components.get(component.component_id) ?? resolveOperatorState({actions: [], frame, fps});
      const operatorIds = runtime.componentOperatorIds.get(component.component_id) ?? new Set<string>();
      const focal = beat?.focal_component_id === component.component_id;
      const supporting = beat?.supporting_component_ids.includes(component.component_id);
      const supportOpacity = Math.max(0.35, Math.min(0.9, manifest.supporting_opacity ?? 0.35));
      const opacity = focal ? 1 : supporting ? (state === 'supporting' ? supportOpacity : Math.min(supportOpacity, phaseOpacity(state) || supportOpacity)) : phaseOpacity(state);
      const asset = component.asset_id ? assetMap.get(component.asset_id) : undefined;
      const spatial = componentLayer(assetSheet, component.component_id);
      if (treatmentProtectionIsolation && spatial?.treatment.mode !== 'protected-alpha-core') return null;
      const depth = componentDepth(assetSheet, component.component_id);
      const componentTreatment = manifest.treatments?.find((treatment) => treatment.target.kind === 'component' && treatment.target.component_id === component.component_id);
      const treatmentMaskSrc = asset ? staticFile(cutAssetPath(cutBasePath, asset.file)) : undefined;
      const content = asset?.media_type.startsWith('video/')
        ? <SequencedSourceVideo asset={asset} src={staticFile(cutAssetPath(cutBasePath, asset.file))} fps={fps} activationFrame={Math.min(...component.visibility_timeline.map((interval) => interval.start_frame))} activeEndFrame={Math.max(...component.visibility_timeline.map((interval) => interval.end_frame))} frameOverride={frameOverride} style={{width: '100%', height: '100%', objectFit: asset.role === 'document' ? 'contain' : 'cover'}} />
        : <PresentationComponentMedia component={component} asset={asset} chart={manifest.chart} cutBasePath={cutBasePath} progress={operatorState.strokeProgress} highlightProgress={operatorState.highlightProgress} chartProgress={operatorState.chartProgress} />;
      return <div key={component.component_id} data-component-id={component.component_id} data-presentation-state={state} data-focal={focal ? 'true' : 'false'} data-spatial-depth={depth} data-layer-role={spatial?.layer_role} data-mask-inset-right={operatorIds.has('mask.inset@1') ? operatorState.insetRight : undefined} data-document-highlight-width={operatorIds.has('document.highlight@1') ? v3DocumentHighlightWidth(operatorState) : undefined} style={{position: 'absolute', ...rect, zIndex: depth, opacity: opacity * operatorState.opacity, transform: `translate3d(${operatorState.x}px,${operatorState.y}px,0) scale(${operatorState.scale}) rotate(${operatorState.rotate}deg)`, transformOrigin: 'center', clipPath: v3ComponentClipPath(operatorState, operatorIds.has('mask.inset@1')), outline: debugVisualization ? `7px solid ${DEBUG_COLORS[spatial?.layer_role ?? 'midground']}` : undefined, background: debugVisualization ? `${DEBUG_COLORS[spatial?.layer_role ?? 'midground']}18` : undefined}}>
        {content}
        {activeGrain(componentTreatment, frame, treatmentMode) && treatmentMaskSrc ? <GrainOverlay treatment={componentTreatment!} maskSrc={treatmentMaskSrc} /> : null}
        {debugVisualization ? <div style={{position: 'absolute', left: 8, top: 8, padding: '6px 10px', borderRadius: 6, background: '#211f1de8', color: '#fff', fontSize: 25, lineHeight: 1, fontWeight: 900}}>{component.component_id} · z{depth}</div> : null}
      </div>;
    })}
    </div>
    {manifest.text_cues.map((cue, index) => {
      if (frame < cue.start_frame || frame >= cue.end_frame) return null;
      const target = cue.target_component_id
        ? manifest.visual_components.find((component) => component.component_id === cue.target_component_id)
        : cue.target_asset_id
          ? manifest.visual_components.find((component) => component.asset_id === cue.target_asset_id)
          : undefined;
      if (target && excluded.has(target.component_id)) return null;
      if (treatmentProtectionIsolation && target && componentLayer(assetSheet, target.component_id)?.treatment.mode !== 'protected-alpha-core') return null;
      const cueRect = target ? target.layout ?? TEMPLATES[template][target.presentation_slot] : undefined;
      const targetOperatorState = target
        ? resolveOperatorState({actions: manifest.motion_actions.filter((action) => action.target_component_id === target.component_id && action.start_frame <= frame), frame, fps})
        : null;
      const belowCenter = cue.placement === 'below-center' && cueRect;
      const onSurface = cue.placement === 'on-surface' && cueRect;
      const left = belowCenter || onSurface ? cueRect.left + cueRect.width / 2 : [1060, 1280, 1000][index % 3];
      const top = belowCenter ? cueRect.top + cueRect.height + 24 : onSurface ? cueRect.top + cueRect.height / 2 : [200, 500, 790][index % 3];
      const textCueTransform = v3TextCueTransform({
        cue,
        targetState: targetOperatorState,
        belowCenter: Boolean(belowCenter),
        onSurface: Boolean(onSurface),
        legacyFallbackRotationDeg: [-2, 1, -1][index % 3],
      });
      return <div key={cue.cue_id} data-system-layer="target-labels" style={{position: 'absolute', left, top, zIndex: systemDepth(assetSheet, 'target-labels', 900), maxWidth: cue.max_width_px, maxHeight: cue.max_lines ? `${cue.max_lines * (cue.font_size_px ?? (cue.kind === 'number' ? 48 : 54)) * 1.2}px` : undefined, fontSize: cue.font_size_px ?? (cue.kind === 'number' ? 48 : 54), lineHeight: 1.2, fontWeight: 950, letterSpacing: -2, textAlign: belowCenter ? 'center' : undefined, wordBreak: 'keep-all', color: ['#9d382f', '#345f78', '#2f2b26'][index % 3], transform: textCueTransform, transformOrigin: 'center', textShadow: '3px 3px 0 #fffaf0'}}>{cue.text}</div>;
    })}
    {debugVisualization && assetSheet ? <>
      <div data-debug-safe-area="essential" style={{position: 'absolute', left: assetSheet.safe_areas.essential.left, top: assetSheet.safe_areas.essential.top, right: assetSheet.safe_areas.essential.right, bottom: assetSheet.safe_areas.essential.bottom, zIndex: systemDepth(assetSheet, 'target-labels', 900) + 20, border: '5px dashed #d65b38', pointerEvents: 'none'}} />
      <svg viewBox="0 0 1920 1080" style={{position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: systemDepth(assetSheet, 'target-labels', 900) + 10, pointerEvents: 'none'}}>
        <defs><marker id={`occlusion-arrow-${manifest.shot_id}`} markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 z" fill="#d65b38" /></marker></defs>
        {assetSheet.layers.flatMap((upper) => upper.occludes.filter((lowerId) => activeComponentIds.has(upper.component_id) && activeComponentIds.has(lowerId)).map((lowerId) => {
          const upperRect = manifest.visual_components.find((component) => component.component_id === upper.component_id)?.layout;
          const lowerRect = manifest.visual_components.find((component) => component.component_id === lowerId)?.layout;
          if (!upperRect || !lowerRect) return null;
          return <line key={`${upper.component_id}-${lowerId}`} x1={upperRect.left + upperRect.width / 2} y1={upperRect.top + upperRect.height / 2} x2={lowerRect.left + lowerRect.width / 2} y2={lowerRect.top + lowerRect.height / 2} stroke="#d65b38" strokeWidth="6" strokeDasharray="12 10" markerEnd={`url(#occlusion-arrow-${manifest.shot_id})`} />;
        }))}
      </svg>
    </> : null}
    {sourceText && frame >= (manifest.lifecycle?.background_only?.end_frame ?? 0) ? <div data-system-layer="source-chrome" style={{position: 'absolute', inset: 0, zIndex: systemDepth(assetSheet, 'source-chrome', 1000), pointerEvents: 'none'}}>{manifest.source_line ? <div style={{position:'absolute',left:70,bottom:42,padding:'8px 18px',fontSize:34,fontWeight:900,letterSpacing:-1,color:'#51483f',background:'rgba(255,250,240,.86)',borderRadius:8}}>{sourceText}</div> : <SourceFooter text={sourceText} />}</div> : null}
    {manifest.presentation_contract_version !== 2 ? <div style={{position: 'absolute', left: 48, top: 42, fontSize: 32, fontWeight: 800, color: '#6f655a'}}>{beat?.message}</div> : null}
  </AbsoluteFill>;
}
