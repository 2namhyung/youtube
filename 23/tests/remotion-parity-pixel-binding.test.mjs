import assert from 'node:assert/strict';
import test from 'node:test';

import {compareArtifactOnTargetMask, compareFullFrameRgba, targetContributionStats} from '../video/scripts/remotion-parity-proof.mjs';

const width = 8;
const height = 8;
const makePixels = ({targetLeft = 2, targetTop = 2, includeTarget = true, targetShift = 0, targetDelta = 0} = {}) => {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = (y * width + x) * 4;
    const target = includeTarget && x >= targetLeft + targetShift && x < targetLeft + targetShift + 4 && y >= targetTop && y < targetTop + 4;
    pixels[index] = target ? 220 + targetDelta : 20;
    pixels[index + 1] = target ? 100 + targetDelta : 30;
    pixels[index + 2] = target ? 50 + targetDelta : 40;
    pixels[index + 3] = 255;
  }
  return pixels;
};
const makeFlatPixels = (frameWidth = 640, frameHeight = 360) => {
  const pixels = Buffer.alloc(frameWidth * frameHeight * 4);
  for (let pixel = 0; pixel < frameWidth * frameHeight; pixel += 1) {
    const offset = pixel * 4;
    pixels[offset] = 20;
    pixels[offset + 1] = 30;
    pixels[offset + 2] = 40;
    pixels[offset + 3] = 255;
  }
  return {pixels, frameWidth, frameHeight};
};
const replaceRect = (pixels, frameWidth, left, top, rectWidth, rectHeight, replacement = [240, 240, 240]) => {
  const replaced = Buffer.from(pixels);
  for (let y = top; y < top + rectHeight; y += 1) for (let x = left; x < left + rectWidth; x += 1) {
    const offset = (y * frameWidth + x) * 4;
    replaced[offset] = replacement[0];
    replaced[offset + 1] = replacement[1];
    replaced[offset + 2] = replacement[2];
  }
  return replaced;
};

test('normal minus validator-hidden render derives the actual target contribution', () => {
  const normal = makePixels();
  const hidden = makePixels({includeTarget: false});
  const result = targetContributionStats(normal, hidden, width, height);
  assert.equal(result.count, 16);
  assert.equal(result.coreCount, 16);
  assert.deepEqual(result.bbox, {left: 2, top: 2, right: 6, bottom: 6});
  assert.equal(result.centroidX, 3.5);
  assert.equal(result.centroidY, 3.5);
});

test('codec-tolerant artifact comparison passes on the validator-derived target mask', () => {
  const normal = makePixels();
  const hidden = makePixels({includeTarget: false});
  const artifact = makePixels({targetDelta: 5});
  const contribution = targetContributionStats(normal, hidden, width, height);
  const result = compareArtifactOnTargetMask(normal, artifact, contribution.coreMask, {minMaskPixels: 8});
  assert.equal(result.passes, true);
  assert.equal(result.matchFraction, 1);
  assert.equal(result.meanRgbDelta, 5);
});

test('submitted artifact missing the focal target fails masked full-resolution binding', () => {
  const normal = makePixels();
  const hidden = makePixels({includeTarget: false});
  const contribution = targetContributionStats(normal, hidden, width, height);
  const result = compareArtifactOnTargetMask(normal, hidden, contribution.coreMask, {minMaskPixels: 8});
  assert.equal(result.passes, false);
  assert.ok(result.matchFraction < 0.8);
  assert.ok(result.meanRgbDelta > 18);
});

test('same-sized decoy at another location cannot substitute for the reviewed target', () => {
  const normal = makePixels();
  const hidden = makePixels({includeTarget: false});
  const decoyArtifact = makePixels({targetShift: -2});
  const contribution = targetContributionStats(normal, hidden, width, height);
  const result = compareArtifactOnTargetMask(normal, decoyArtifact, contribution.coreMask, {minMaskPixels: 8});
  assert.equal(result.passes, false);
});

test('full-resolution identity tolerates codec-sized deltas across the complete frame', () => {
  const normal = makePixels();
  const encoded = makePixels({targetDelta: 5});
  const result = compareFullFrameRgba(normal, encoded, width, height, {maxMatchedPixelRgbDelta: 8, minMatchFraction: 0.7, maxMeanRgbDelta: 8, maxP95RgbDelta: 8});
  assert.equal(result.passes, true);
  assert.equal(result.pixelCount, width * height);
  assert.ok(result.matchFraction >= 0.7);
  assert.ok(result.meanRgbDelta <= 8);
  assert.ok(result.p95RgbDelta <= 8);
});

test('full-resolution identity rejects a compact supporting-layer replacement under default thresholds', () => {
  const {pixels: normal, frameWidth, frameHeight} = makeFlatPixels();
  const replaced = replaceRect(normal, frameWidth, 0, 0, 64, 64);
  const result = compareFullFrameRgba(normal, replaced, frameWidth, frameHeight);
  assert.equal(result.passes, false);
  assert.ok(result.matchFraction > 0.97);
  assert.ok(result.meanRgbDelta < 10);
  assert.ok(result.p95RgbDelta <= 24);
  assert.ok(result.maxTileMismatchFraction > 0.25 || result.maxTileMeanRgbDelta > 18);
});

test('connected-component guard rejects a thin high-contrast connector deletion', () => {
  const {pixels: normal, frameWidth, frameHeight} = makeFlatPixels();
  const replaced = replaceRect(normal, frameWidth, 200, 100, 4, 64);
  const result = compareFullFrameRgba(normal, replaced, frameWidth, frameHeight);
  assert.equal(result.passes, false);
  assert.ok(result.matchFraction > 0.97);
  assert.ok(result.meanRgbDelta < 10);
  assert.ok(result.p95RgbDelta <= 24);
  assert.ok(result.largestSevereComponentPixels >= 256);
});

test('connected-component guard rejects a thin moderate-contrast connector deletion', () => {
  const {pixels: normal, frameWidth, frameHeight} = makeFlatPixels();
  const replaced = replaceRect(normal, frameWidth, 200, 100, 4, 64, [90, 100, 110]);
  const result = compareFullFrameRgba(normal, replaced, frameWidth, frameHeight);
  assert.equal(result.passes, false);
  assert.ok(result.matchFraction > 0.97);
  assert.ok(result.meanRgbDelta < 10);
  assert.ok(result.p95RgbDelta <= 24);
  assert.ok(result.largestSevereComponentPixels >= 256);
  assert.ok(result.largestSevereComponentMeanRgbDelta >= 48);
});

test('connected-component guard rejects a small high-contrast icon deletion', () => {
  const {pixels: normal, frameWidth, frameHeight} = makeFlatPixels();
  const replaced = replaceRect(normal, frameWidth, 400, 200, 16, 16);
  const result = compareFullFrameRgba(normal, replaced, frameWidth, frameHeight);
  assert.equal(result.passes, false);
  assert.ok(result.matchFraction > 0.97);
  assert.ok(result.meanRgbDelta < 10);
  assert.ok(result.p95RgbDelta <= 24);
  assert.equal(result.largestSevereComponentPixels, 256);
});

test('connected-component guard rejects a small moderate-contrast icon deletion', () => {
  const {pixels: normal, frameWidth, frameHeight} = makeFlatPixels();
  const replaced = replaceRect(normal, frameWidth, 400, 200, 16, 16, [90, 100, 110]);
  const result = compareFullFrameRgba(normal, replaced, frameWidth, frameHeight);
  assert.equal(result.passes, false);
  assert.ok(result.matchFraction > 0.97);
  assert.ok(result.meanRgbDelta < 10);
  assert.ok(result.p95RgbDelta <= 24);
  assert.equal(result.largestSevereComponentPixels, 256);
  assert.ok(result.largestSevereComponentMeanRgbDelta >= 48);
});

test('connected-component guard tolerates sparse codec-sized severe noise', () => {
  const {pixels: normal, frameWidth, frameHeight} = makeFlatPixels();
  const replaced = Buffer.from(normal);
  for (let index = 0; index < 10; index += 1) {
    const offset = ((40 + index * 7) * frameWidth + (40 + index * 11)) * 4;
    replaced[offset] = 240;
    replaced[offset + 1] = 240;
    replaced[offset + 2] = 240;
  }
  const result = compareFullFrameRgba(normal, replaced, frameWidth, frameHeight);
  assert.equal(result.passes, true);
  assert.equal(result.largestSevereComponentPixels, 1);
});

test('connected-component guard evaluates size and mean on the same component', () => {
  const {pixels: normal, frameWidth, frameHeight} = makeFlatPixels();
  const lowMeanComponent = replaceRect(normal, frameWidth, 100, 100, 10, 10, [60, 70, 80]);
  const lowMeanPlusSpeck = replaceRect(lowMeanComponent, frameWidth, 400, 200, 1, 1, [240, 240, 240]);
  const result = compareFullFrameRgba(normal, lowMeanPlusSpeck, frameWidth, frameHeight);
  assert.equal(result.passes, true);
  assert.equal(result.hasLargeModerateMismatchComponent, false);
  assert.equal(result.largestSevereComponentPixels, 100);
  assert.ok(result.largestSevereComponentMeanRgbDelta >= 200);
});
