import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {resolveV3PresentationRuntime, v3CameraTransform, v3ComponentClipPath, v3DocumentHighlightWidth, v3TextCueTransform} from '../video/src/vox/scene/presentation-runtime.ts';

const fixture = {
  visual_components: [
    {component_id: 'camera', render_kind: 'camera'},
    {component_id: 'overview', render_kind: 'asset'},
    {component_id: 'crop', render_kind: 'asset'},
    {component_id: 'highlight', render_kind: 'document-highlight'},
    {component_id: 'chart', render_kind: 'chart'},
  ],
  motion_actions: [
    {operator_id: 'camera.transform@1', target_component_id: 'camera', start_frame: 0, end_frame: 6, params: {from_scale: 1, to_scale: 1.32}},
    {operator_id: 'mask.inset@1', target_component_id: 'crop', start_frame: 66, end_frame: 72, params: {from_right_percent: 100, to_right_percent: 0}},
    {operator_id: 'document.highlight@1', target_component_id: 'highlight', start_frame: 132, end_frame: 138, params: {from_progress: 0, to_progress: 1}},
    {operator_id: 'chart.reveal@1', target_component_id: 'chart', start_frame: 200, end_frame: 220, params: {from_progress: 0, to_progress: 1}},
  ],
};

test('V3 camera adapter changes the evidence group then remains static during hold', () => {
  const start = resolveV3PresentationRuntime({manifest: fixture, frame: 0, fps: 30});
  const moving = resolveV3PresentationRuntime({manifest: fixture, frame: 3, fps: 30});
  const holdA = resolveV3PresentationRuntime({manifest: fixture, frame: 6, fps: 30});
  const holdB = resolveV3PresentationRuntime({manifest: fixture, frame: 60, fps: 30});
  assert.equal(start.camera.scale, 1);
  assert.ok(moving.camera.scale > 1 && moving.camera.scale < 1.32);
  assert.equal(holdA.camera.scale, 1.32);
  assert.equal(holdB.camera.scale, holdA.camera.scale);
});

test('V3 chart adapter exposes progressive chart state and PresentationScene consumes it', async () => {
  const start = resolveV3PresentationRuntime({manifest: fixture, frame: 200, fps: 30}).components.get('chart');
  const middle = resolveV3PresentationRuntime({manifest: fixture, frame: 210, fps: 30}).components.get('chart');
  const end = resolveV3PresentationRuntime({manifest: fixture, frame: 220, fps: 30}).components.get('chart');
  assert.equal(start.chartProgress, 0);
  assert.equal(middle.chartProgress, 0.5);
  assert.equal(end.chartProgress, 1);
  const source = await readFile('video/src/vox/scene/PresentationScene.tsx', 'utf8');
  assert.match(source, /data-v3-chart-progress/u);
  assert.match(source, /chartProgress=\{operatorState\.chartProgress\}/u);
});

test('V3 mask and document highlight adapters produce observable renderer styles and stable holds', () => {
  const cropStart = resolveV3PresentationRuntime({manifest: fixture, frame: 66, fps: 30}).components.get('crop');
  const cropEnd = resolveV3PresentationRuntime({manifest: fixture, frame: 72, fps: 30}).components.get('crop');
  const cropHold = resolveV3PresentationRuntime({manifest: fixture, frame: 120, fps: 30}).components.get('crop');
  assert.equal(v3ComponentClipPath(cropStart, true), 'inset(0 100% 0 0)');
  assert.equal(v3ComponentClipPath(cropEnd, true), 'inset(0 0% 0 0)');
  assert.equal(v3ComponentClipPath(cropHold, true), v3ComponentClipPath(cropEnd, true));

  const highlightStart = resolveV3PresentationRuntime({manifest: fixture, frame: 132, fps: 30}).components.get('highlight');
  const highlightEnd = resolveV3PresentationRuntime({manifest: fixture, frame: 138, fps: 30}).components.get('highlight');
  const highlightHold = resolveV3PresentationRuntime({manifest: fixture, frame: 190, fps: 30}).components.get('highlight');
  assert.equal(v3DocumentHighlightWidth(highlightStart), '0%');
  assert.equal(v3DocumentHighlightWidth(highlightEnd), '100%');
  assert.equal(v3DocumentHighlightWidth(highlightHold), v3DocumentHighlightWidth(highlightEnd));
});

test('document adapters do not add neutral transforms or clips to unrelated SH003 components', async () => {
  const manifest = JSON.parse(await readFile('video/public/assets/episode-001-work-v01/cuts/SH003/manifest.json', 'utf8'));
  const runtime = resolveV3PresentationRuntime({manifest, frame: 250, fps: 30});
  assert.equal(runtime.cameraActive, false);
  assert.equal(v3CameraTransform(runtime.camera, runtime.cameraActive), undefined);
  for (const component of manifest.visual_components.filter((candidate) => candidate.render_kind !== 'camera')) {
    const operatorIds = runtime.componentOperatorIds.get(component.component_id);
    assert.equal(operatorIds.has('mask.inset@1'), false, component.component_id);
    assert.equal(operatorIds.has('document.highlight@1'), false, component.component_id);
    assert.equal(v3ComponentClipPath(runtime.components.get(component.component_id), operatorIds.has('mask.inset@1')), undefined, component.component_id);
  }
});

test('PresentationScene consumes V3 adapters while labels and source chrome remain outside camera group', async () => {
  const source = await readFile('video/src/vox/scene/PresentationScene.tsx', 'utf8');
  assert.match(source, /data-v3-camera-group/u);
  assert.match(source, /clipPath: v3ComponentClipPath/u);
  assert.match(source, /data-document-highlight-band/u);
  assert.ok(source.indexOf('</div>\n    {manifest.text_cues.map') > source.indexOf('data-v3-camera-group'));
});

test('surface-bound text adds its reviewed resting angle while screen chrome stays level', () => {
  const targetState = {
    x: 12,
    y: -4,
    scale: 0.96,
    rotate: 3,
    opacity: 1,
    insetRight: 0,
    clip: 1,
    chartProgress: 1,
    strokeProgress: 1,
    highlightProgress: 1,
  };
  assert.equal(v3TextCueTransform({
    cue: {transform_binding: 'inherit-target-surface', surface_rotation_deg: -10.5},
    targetState,
    belowCenter: true,
  }), 'translate3d(12px,-4px,0) translateX(-50%) scale(0.96) rotate(-7.5deg)');
  assert.equal(v3TextCueTransform({
    cue: {transform_binding: 'screen-space-level', surface_rotation_deg: 0},
    targetState,
    belowCenter: true,
  }), 'translateX(-50%) rotate(0deg)');
});

test('target-position labels follow target position and scale without inheriting rotation', () => {
  const targetState = {
    x: 12,
    y: -4,
    scale: 0.96,
    rotate: 18,
    opacity: 1,
    insetRight: 0,
    clip: 1,
    chartProgress: 1,
    strokeProgress: 1,
    highlightProgress: 1,
  };
  assert.equal(v3TextCueTransform({
    cue: {transform_binding: 'target-position-level', surface_rotation_deg: 0},
    targetState,
    belowCenter: true,
  }), 'translate3d(12px,-4px,0) translateX(-50%) scale(0.96) rotate(0deg)');
  assert.equal(v3TextCueTransform({
    cue: {transform_binding: 'screen-space-level', surface_rotation_deg: 0},
    targetState,
    belowCenter: false,
  }), 'rotate(0deg)');
});

test('on-surface labels use their PNG surface anchor when inheriting its angle', () => {
  const targetState = {x: 12, y: -4, scale: 0.96, rotate: 3, opacity: 1, insetRight: 0, clip: 1, chartProgress: 1, strokeProgress: 1, highlightProgress: 1};
  assert.equal(v3TextCueTransform({
    cue: {transform_binding: 'inherit-target-surface', surface_rotation_deg: -10.5},
    targetState,
    belowCenter: false,
    onSurface: true,
  }), 'translate3d(12px,-4px,0) translate(-50%,-50%) scale(0.96) rotate(-7.5deg)');
});
