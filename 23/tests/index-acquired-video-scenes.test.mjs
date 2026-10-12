import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildSceneIndex,
  collectVideoCandidates,
  makeNonOverlappingWindows,
  validateSceneIndex,
} from '../video/scripts/index-acquired-video-scenes.mjs';

test('scene windows are contiguous, exact, and non-overlapping', () => {
  const windows = makeNonOverlappingWindows(13.2, 6);
  assert.deepEqual(windows, [
    {start_seconds: 0, end_seconds: 6, overlap_seconds: 0},
    {start_seconds: 6, end_seconds: 12, overlap_seconds: 0},
    {start_seconds: 12, end_seconds: 13.2, overlap_seconds: 0},
  ]);
});

test('candidate discovery indexes every local video once by SHA-256', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-index-'));
  try {
    const video = path.join(temp, 'a.mp4');
    const duplicate = path.join(temp, 'same-name-different-path.mp4');
    fs.writeFileSync(video, 'same bytes');
    fs.writeFileSync(duplicate, 'same bytes');
    const manifest = {
      candidates: [
        {candidate_id: 'A', media_type: 'video', original_path: video},
        {candidate_id: 'B', media_type: 'video', original_path: duplicate},
      ],
    };
    const result = collectVideoCandidates(manifest, {
      root: temp,
      probe: () => ({durationSeconds: 2, stream: {codec: 'h264', width: 16, height: 16}}),
      decode: () => true,
    });
    assert.equal(result.videos.length, 1);
    assert.deepEqual(result.videos[0].candidates.map((candidate) => candidate.candidate_id), ['A', 'B']);
  } finally {
    fs.rmSync(temp, {recursive: true, force: true});
  }
});

test('built index keeps semantic and rights review pending while binding frame hashes', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-index-'));
  try {
    const video = path.join(temp, 'source.mp4');
    fs.writeFileSync(video, 'video bytes');
    const index = buildSceneIndex({
      root: temp,
      manifestPath: {candidates: [{candidate_id: 'A', media_type: 'video', original_path: video}]},
      outputPath: null,
      framesRoot: path.join(temp, 'frames'),
      sceneSeconds: 2,
      frameCount: 2,
      probe: () => ({durationSeconds: 4.2, stream: {codec: 'h264', width: 16, height: 16}}),
      decode: () => true,
      extractFrameFn: (_source, target) => {
        fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.writeFileSync(target, 'frame bytes');
      },
    });
    assert.equal(index.coverage.manifest_video_candidates, 1);
    assert.equal(index.sources.length, 1);
    assert.equal(index.sources[0].scenes.length, 2);
    assert.equal(index.sources[0].scenes[0].perception.observed_subject, null);
    assert.deepEqual(index.sources[0].scenes[0].perception.pending_fields, ['subject', 'action', 'place', 'viewpoint']);
    assert.equal(index.sources[0].rights.approval, false);
    assert.equal(validateSceneIndex(index, {root: temp}).ok, true);
  } finally {
    fs.rmSync(temp, {recursive: true, force: true});
  }
});
