import type {CutManifestV3, TextCue} from '../../cut-manifest';
import {initialOperatorState, resolveOperatorState, type OperatorState} from '../motion/operator-registry.ts';

export type V3PresentationRuntimeState = {
  camera: OperatorState;
  cameraActive: boolean;
  components: Map<string, OperatorState>;
  componentOperatorIds: Map<string, Set<string>>;
};

/** Pure V3 adapter state. PresentationScene consumes this exact result when rendering. */
export const resolveV3PresentationRuntime = ({manifest, frame, fps}: {manifest: Pick<CutManifestV3, 'visual_components' | 'motion_actions'>; frame: number; fps: number}): V3PresentationRuntimeState => {
  const cameraComponentIds = new Set(manifest.visual_components.filter((component) => component.render_kind === 'camera').map((component) => component.component_id));
  const cameraActions = manifest.motion_actions.filter((action) => cameraComponentIds.has(action.target_component_id) && action.start_frame <= frame);
  const nonCameraComponents = manifest.visual_components.filter((component) => component.render_kind !== 'camera');
  const actionsByComponent = new Map(nonCameraComponents.map((component) => [component.component_id, manifest.motion_actions.filter((action) => action.target_component_id === component.component_id && action.start_frame <= frame)]));
  const components = new Map(nonCameraComponents.map((component) => [component.component_id, resolveOperatorState({actions: actionsByComponent.get(component.component_id) ?? [], frame, fps})]));
  return {
    camera: cameraActions.length ? resolveOperatorState({actions: cameraActions, frame, fps}) : initialOperatorState(),
    cameraActive: cameraActions.some((action) => action.operator_id === 'camera.transform@1'),
    components,
    componentOperatorIds: new Map(nonCameraComponents.map((component) => [component.component_id, new Set((actionsByComponent.get(component.component_id) ?? []).map((action) => action.operator_id))])),
  };
};

export const v3CameraTransform = (state: OperatorState, active: boolean) => active ? `translate3d(${state.x}px,${state.y}px,0) scale(${state.scale}) rotate(${state.rotate}deg)` : undefined;
export const v3ComponentClipPath = (state: OperatorState, active: boolean) => active ? `inset(0 ${state.insetRight}% 0 0)` : undefined;
export const v3DocumentHighlightWidth = (state: OperatorState) => `${Math.max(0, Math.min(1, state.highlightProgress)) * 100}%`;

export const v3TextCueTransform = ({
  cue,
  targetState,
  belowCenter,
  onSurface = false,
  legacyFallbackRotationDeg = 0,
}: {
  cue: Pick<TextCue, 'transform_binding' | 'surface_rotation_deg'>;
  targetState: OperatorState | null;
  belowCenter: boolean;
  onSurface?: boolean;
  legacyFallbackRotationDeg?: number;
}) => {
  if (cue.transform_binding === 'screen-space-level') return belowCenter ? 'translateX(-50%) rotate(0deg)' : 'rotate(0deg)';
  if (cue.transform_binding === 'target-position-level') {
    const anchor = onSurface ? 'translate(-50%,-50%)' : 'translateX(-50%)';
    if (targetState) return `translate3d(${targetState.x}px,${targetState.y}px,0) ${anchor} scale(${targetState.scale}) rotate(0deg)`;
    return `${anchor} rotate(0deg)`;
  }
  const restingRotation = cue.transform_binding === 'inherit-target-surface' && Number.isFinite(cue.surface_rotation_deg)
    ? cue.surface_rotation_deg ?? 0
    : 0;
  const anchor = onSurface ? 'translate(-50%,-50%)' : 'translateX(-50%)';
  if (targetState) return `translate3d(${targetState.x}px,${targetState.y}px,0) ${anchor} scale(${targetState.scale}) rotate(${targetState.rotate + restingRotation}deg)`;
  if (belowCenter || onSurface) return `${anchor} rotate(${restingRotation}deg)`;
  return `rotate(${legacyFallbackRotationDeg}deg)`;
};
