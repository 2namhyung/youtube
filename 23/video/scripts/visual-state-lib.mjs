export function previewFrames(manifest) {
  const reveal = manifest.lifecycle?.reveal;
  const finalHold = manifest.lifecycle?.final_hold;
  return {
    background: 0,
    reveal: reveal ? Math.floor((reveal.start_frame + Math.max(reveal.start_frame, reveal.end_frame - 1)) / 2) : 0,
    final: finalHold ? Math.max(finalHold.start_frame, finalHold.end_frame - 1) : Math.max(0, manifest.duration_frames - 1),
  };
}

export function validateVisualStateManifest(manifest) {
  const failures = [];
  const lifecycle = manifest.lifecycle;
  if (!lifecycle) return manifest.production_mode === 'remotion' ? [`${manifest.shot_id}: Remotion visual QA requires lifecycle`] : failures;
  const background = lifecycle.background_only;
  const reveal = lifecycle.reveal;
  const finalHold = lifecycle.final_hold;
  if (background?.start_frame !== 0) failures.push(`${manifest.shot_id}: background_only must start at frame 0`);
  if (!(background?.end_frame <= reveal?.start_frame)) failures.push(`${manifest.shot_id}: background_only must finish before reveal`);
  if (!(reveal?.start_frame < reveal?.end_frame)) failures.push(`${manifest.shot_id}: reveal must have positive duration`);
  if (!(reveal?.end_frame <= finalHold?.start_frame)) failures.push(`${manifest.shot_id}: reveal must finish before final_hold`);
  if (finalHold?.end_frame !== manifest.duration_frames || !(finalHold?.start_frame < finalHold?.end_frame)) failures.push(`${manifest.shot_id}: final_hold must be positive and end at duration_frames`);
  if ((background?.visible_asset_ids ?? []).length || (background?.visible_effect_ids ?? []).length) failures.push(`${manifest.shot_id}: background_only cannot declare visible assets/effects`);

  const assetIds = (manifest.assets ?? []).map((asset) => asset.asset_id).sort();
  const finalAssetIds = [...(lifecycle.final_visible_asset_ids ?? [])].sort();
  if (manifest.production_mode === 'remotion' && assetIds.join('|') !== finalAssetIds.join('|')) failures.push(`${manifest.shot_id}: final_hold must contain every declared asset exactly once`);
  const finalEffectIds = (manifest.effects ?? []).filter((effect) => effect.persists_to_final).map((effect) => effect.effect_id).sort();
  const declaredFinalEffects = [...(lifecycle.final_visible_effect_ids ?? [])].sort();
  if (finalEffectIds.join('|') !== declaredFinalEffects.join('|')) failures.push(`${manifest.shot_id}: final_hold effect IDs must match persists_to_final effects`);

  const visualActions = (manifest.animations ?? []).filter((action) => action.type !== 'hold');
  for (const action of manifest.animations ?? []) if (!allowedAnimationTypes.has(action.type)) failures.push(`${manifest.shot_id}: unsupported animation type ${action.type}`);
  const stableTargets = new Set([...assetIds, 'camera', ...(manifest.effects ?? []).map((effect) => effect.effect_id)]);
  for (const action of visualActions) {
    if (stableTargets.has(action.target_id) && action.end_frame > finalHold.start_frame) failures.push(`${manifest.shot_id}: ${action.animation_id} must end before final_hold starts`);
  }
  const hasRevealAction = visualActions.some((action) => action.start_frame < reveal.end_frame && action.end_frame > reveal.start_frame);
  if (manifest.production_mode === 'remotion' && (assetIds.length > 0 || (manifest.effects ?? []).length > 0 || manifest.chart) && !hasRevealAction && !manifest.chart) failures.push(`${manifest.shot_id}: reveal requires an overlapping visual animation`);
  if (manifest.chart && !allowedChartTypes.has(manifest.chart.type)) failures.push(`${manifest.shot_id}: unsupported chart type ${manifest.chart.type}`);
  if (manifest.chart && !(manifest.chart.reveal.start_frame >= reveal.start_frame && manifest.chart.reveal.end_frame <= finalHold.start_frame)) failures.push(`${manifest.shot_id}: chart reveal must remain inside lifecycle reveal`);
  for (const cue of manifest.text_cues ?? []) {
    if ((cue.start_frame >= finalHold.start_frame && cue.start_frame < finalHold.end_frame) || (cue.end_frame > finalHold.start_frame && cue.end_frame < finalHold.end_frame)) failures.push(`${manifest.shot_id}: text cue ${cue.cue_id} cannot start or end inside final_hold`);
  }
  for (const effect of manifest.effects ?? []) {
    const extension = path.extname(effect.file ?? '').toLowerCase();
    const startsInside = effect.start_frame >= finalHold.start_frame && effect.start_frame < finalHold.end_frame;
    const endsInside = effect.end_frame > finalHold.start_frame && effect.end_frame < finalHold.end_frame;
    const overlaps = effect.start_frame < finalHold.end_frame && effect.end_frame > finalHold.start_frame;
    if (startsInside || endsInside) failures.push(`${manifest.shot_id}: effect ${effect.effect_id} cannot start or end inside final_hold`);
    if (overlaps && (effect.loop || videoEffectExtensions.has(extension) || !effect.persists_to_final || !staticImageEffectExtensions.has(extension))) failures.push(`${manifest.shot_id}: final_hold permits only a non-looping persistent static image effect`);
  }
  return failures;
}

export function validateManifestTimingAuthority({manifests, plan, measuredReport = null, finalVoice = false}) {
  const failures = [];
  const planByShot = new Map((plan?.cuts ?? []).map((cut) => [cut.shot_id, cut]));
  const measuredByShot = new Map((measuredReport?.cuts ?? []).map((cut) => [cut.shot_id, cut]));
  for (const manifest of manifests) {
    const cut = planByShot.get(manifest.shot_id);
    if (!cut) { failures.push(`${manifest.shot_id}: missing narration-plan cut`); continue; }
    if (manifest.production_mode !== cut.production_mode) failures.push(`${manifest.shot_id}: production_mode drift; expected ${cut.production_mode}, got ${manifest.production_mode}`);
    if (finalVoice) {
      const measured = measuredByShot.get(manifest.shot_id);
      if (!Number.isInteger(measured?.duration_frames)) failures.push(`${manifest.shot_id}: strict narration report has no measured duration_frames`);
      else if (manifest.duration_frames !== measured.duration_frames) failures.push(`${manifest.shot_id}: final duration drift; expected ${measured.duration_frames}, got ${manifest.duration_frames}`);
    } else {
      const expected = provisionalCutTiming(cut, plan).durationFrames;
      if (manifest.duration_frames !== expected) failures.push(`${manifest.shot_id}: provisional duration drift; expected ${expected}, got ${manifest.duration_frames}`);
    }
  }
  return failures;
}
import path from 'node:path';

import {provisionalCutTiming} from './narration-timing-lib.mjs';

const allowedAnimationTypes = new Set(['spring-enter', 'place', 'slap', 'rise', 'wipe', 'highlight', 'camera', 'ease-move', 'scale', 'opacity', 'mask-reveal', 'draw-path', 'chart-draw', 'hold']);
const allowedChartTypes = new Set(['bar', 'line', 'counter', 'dot-plot', 'timeline', 'process']);
const videoEffectExtensions = new Set(['.mp4', '.webm', '.mov', '.m4v', '.mpeg']);
const staticImageEffectExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
