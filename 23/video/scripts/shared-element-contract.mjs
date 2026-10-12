const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const finiteRect = (rect) => rect && ['left', 'top', 'width', 'height'].every((key) => Number.isFinite(rect[key])) && rect.width > 0 && rect.height > 0;
const finiteCamera = (camera) => camera && ['x', 'y', 'scale', 'rotate'].every((key) => Number.isFinite(camera[key])) && camera.scale > 0;
const cubicEaseInOut = (progress) => progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
const mix = (from, to, progress) => from + (to - from) * progress;
const mixObject = (from, to, keys, progress) => Object.fromEntries(keys.map((key) => [key, mix(from[key], to[key], progress)]));

export function validateSharedElementTransition({boundaryId = 'boundary', transition, outgoingManifest, incomingManifest}) {
  const messages = [];
  if (transition?.operator_id === 'scene.crossfade@1') {
    if (transition.type !== 'scene-to-scene') messages.push(`${boundaryId}: whole-scene crossfade must declare scene-to-scene`);
    if (transition.shared_element != null) messages.push(`${boundaryId}: whole-scene crossfade must not claim a shared-element mapping`);
    if (transition.continuity?.relation !== 'spatial-state' || !transition.continuity.outgoing_state || !transition.continuity.incoming_state) messages.push(`${boundaryId}: whole-scene crossfade requires explicit outgoing and incoming spatial states`);
    if (transition.fallback != null) messages.push(`${boundaryId}: whole-scene crossfade is already the fallback and must not declare another fallback`);
    return messages;
  }
  if (transition?.operator_id !== 'scene.shared-element@1') return [`${boundaryId}: Remotion boundary must consume a registered scene transition operator`];
  const mapping = transition.shared_element;
  if (!mapping) return [`${boundaryId}: transition name alone is insufficient; shared_element mapping is required`];
  const plan = transition.continuity;
  if (!plan || !same(plan.outgoing_component_ids, [mapping.outgoing.component_id]) || !same(plan.incoming_component_ids, [mapping.incoming.component_id]) || !same(plan.outgoing_asset_ids, [mapping.outgoing.asset_id]) || !same(plan.incoming_asset_ids, [mapping.incoming.asset_id])) messages.push(`${boundaryId}: runtime mapping differs from the episode continuity plan`);
  if (plan?.layout_binding !== 'manifest-component-layout' || plan?.camera_inheritance !== 'inherit-without-delta-claim' || plan?.presentation_state_inheritance !== 'manifest-component-state') messages.push(`${boundaryId}: continuity inheritance plan is invalid`);
  const endpoints = [[mapping.outgoing, outgoingManifest, 'outgoing'], [mapping.incoming, incomingManifest, 'incoming']];
  for (const [endpoint, manifest, direction] of endpoints) {
    const component = manifest?.visual_components?.find((candidate) => candidate.component_id === endpoint?.component_id);
    const asset = manifest?.assets?.find((candidate) => candidate.asset_id === endpoint?.asset_id);
    if (!component || component.render_kind !== 'asset') messages.push(`${boundaryId}/${direction}: component ID is missing or is not an asset component`);
    else {
      if (component.asset_id !== endpoint.asset_id || !asset) messages.push(`${boundaryId}/${direction}: component/asset binding is invalid`);
      if (!same(component.layout, endpoint.rect)) messages.push(`${boundaryId}/${direction}: shared rect must equal the bound component layout`);
    }
    if (!finiteRect(endpoint?.rect)) messages.push(`${boundaryId}/${direction}: rect must have positive finite dimensions`);
    if (!finiteCamera(endpoint?.camera)) messages.push(`${boundaryId}/${direction}: camera state must be finite with positive scale`);
  }
  if (!same(mapping.inheritance, {rect: true, camera: true, presentation_state: true})) messages.push(`${boundaryId}: rect/camera/presentation state inheritance is required`);
  if (mapping.visual_blend !== 'cross-dissolve' || mapping.easing !== 'ease-in-out-cubic') messages.push(`${boundaryId}: observable blend/easing contract is invalid`);
  if (!same(transition.fallback, {operator_id: 'scene.crossfade@1', mode: 'whole-scene', allowed_on: 'invalid-mapping'})) messages.push(`${boundaryId}: fallback may only be whole-scene crossfade on invalid mapping`);
  const observable = mapping.outgoing?.asset_id !== mapping.incoming?.asset_id
    || !same(mapping.outgoing?.rect, mapping.incoming?.rect)
    || !same(mapping.outgoing?.camera, mapping.incoming?.camera)
    || mapping.outgoing?.state !== mapping.incoming?.state;
  if (!observable) messages.push(`${boundaryId}: shared-element mapping has zero observable delta`);
  return messages;
}

export function sharedElementTrajectory(transition, durationFrames) {
  const mapping = transition.shared_element;
  if (!mapping) throw new Error('shared_element mapping is required');
  const frames = [...new Set([0, Math.floor((durationFrames - 1) / 2), durationFrames - 1])];
  return frames.map((frame) => {
    const linear = frame / Math.max(1, durationFrames - 1);
    const progress = cubicEaseInOut(linear);
    return {
      frame,
      linear_progress: linear,
      eased_progress: progress,
      rect: mixObject(mapping.outgoing.rect, mapping.incoming.rect, ['left', 'top', 'width', 'height'], progress),
      camera: mixObject(mapping.outgoing.camera, mapping.incoming.camera, ['x', 'y', 'scale', 'rotate'], progress),
      asset_blend: {outgoing_opacity: 1 - progress, incoming_opacity: progress},
      presentation_state: progress < 0.5 ? mapping.outgoing.state : mapping.incoming.state,
    };
  });
}
