import {mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import sharp from 'sharp';

const normalizeFrame = async (file) => sharp(file).resize(320, 180, {fit: 'fill'}).removeAlpha().raw().toBuffer();
const meanAbsoluteDelta = (left, right) => {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]);
  return total / left.length;
};
const readRgba = async (file) => sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject: true});

/** Derive one DOM target's contribution from normal and validator-hidden lossless renders. */
export const targetContributionStats = (normalRgba, hiddenRgba, width, height, {
  visibleDeltaThreshold = 8,
  coreDeltaThreshold = 24,
} = {}) => {
  const pixelCount = width * height;
  if (!normalRgba || !hiddenRgba || normalRgba.length !== hiddenRgba.length || normalRgba.length !== pixelCount * 4) {
    return {count: 0, coreCount: 0, centroidX: NaN, centroidY: NaN, bbox: null, mask: new Uint8Array(0), coreMask: new Uint8Array(0)};
  }
  const mask = new Uint8Array(pixelCount);
  const coreMask = new Uint8Array(pixelCount);
  let count = 0; let coreCount = 0; let weightedX = 0; let weightedY = 0;
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const delta = Math.max(
      Math.abs(normalRgba[offset] - hiddenRgba[offset]),
      Math.abs(normalRgba[offset + 1] - hiddenRgba[offset + 1]),
      Math.abs(normalRgba[offset + 2] - hiddenRgba[offset + 2]),
      Math.abs(normalRgba[offset + 3] - hiddenRgba[offset + 3]),
    );
    if (delta < visibleDeltaThreshold) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    mask[pixel] = 1;
    count += 1; weightedX += x; weightedY += y;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    if (delta >= coreDeltaThreshold) { coreMask[pixel] = 1; coreCount += 1; }
  }
  return {
    count,
    coreCount,
    centroidX: count ? weightedX / count : NaN,
    centroidY: count ? weightedY / count : NaN,
    bbox: count ? {left: minX, top: minY, right: maxX + 1, bottom: maxY + 1} : null,
    mask,
    coreMask,
  };
};

/** Compare the submitted artifact only on the validator-derived target mask. */
export const compareArtifactOnTargetMask = (normalRgba, artifactRgba, mask, {
  minMaskPixels = 100,
  maxMatchedPixelRgbDelta = 32,
  minMatchFraction = 0.8,
  maxMeanRgbDelta = 18,
} = {}) => {
  if (!normalRgba || !artifactRgba || normalRgba.length !== artifactRgba.length || normalRgba.length % 4 !== 0 || mask.length !== normalRgba.length / 4) {
    return {passes: false, maskPixels: 0, matchFraction: 0, meanRgbDelta: Number.POSITIVE_INFINITY};
  }
  let maskPixels = 0; let matchedPixels = 0; let totalRgbDelta = 0;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (!mask[pixel]) continue;
    const offset = pixel * 4;
    const delta = (
      Math.abs(normalRgba[offset] - artifactRgba[offset])
      + Math.abs(normalRgba[offset + 1] - artifactRgba[offset + 1])
      + Math.abs(normalRgba[offset + 2] - artifactRgba[offset + 2])
    ) / 3;
    maskPixels += 1; totalRgbDelta += delta;
    if (delta <= maxMatchedPixelRgbDelta) matchedPixels += 1;
  }
  const matchFraction = maskPixels ? matchedPixels / maskPixels : 0;
  const meanRgbDelta = maskPixels ? totalRgbDelta / maskPixels : Number.POSITIVE_INFINITY;
  return {
    passes: maskPixels >= minMaskPixels && matchFraction >= minMatchFraction && meanRgbDelta <= maxMeanRgbDelta,
    maskPixels,
    matchFraction,
    meanRgbDelta,
  };
};

/**
 * Compare a submitted artifact against the complete lossless Remotion frame.
 * The target-mask check below proves the focal asset; this separate whole-frame
 * check protects the supporting layers and scene composition from being
 * silently replaced while preserving codec tolerance.
 */
export const compareFullFrameRgba = (normalRgba, artifactRgba, width, height, {
  maxMatchedPixelRgbDelta = 32,
  minMatchFraction = 0.97,
  maxMeanRgbDelta = 10,
  maxP95RgbDelta = 24,
  tileSize = 64,
  maxTileMismatchFraction: maxTileMismatchFractionLimit = 0.25,
  maxTileMeanRgbDelta: maxTileMeanRgbDeltaLimit = 18,
  componentDeltaThreshold = null,
  minSevereComponentMeanRgbDelta = 48,
  maxSevereComponentPixels = 64,
} = {}) => {
  const pixelCount = width * height;
  if (!normalRgba || !artifactRgba || normalRgba.length !== artifactRgba.length || normalRgba.length !== pixelCount * 4) {
    return {passes: false, pixelCount: 0, matchFraction: 0, meanRgbDelta: Number.POSITIVE_INFINITY, p95RgbDelta: Number.POSITIVE_INFINITY, maxTileMismatchFraction: Number.POSITIVE_INFINITY, maxTileMeanRgbDelta: Number.POSITIVE_INFINITY, worstTile: null, severeComponentCount: 0, largestSevereComponentPixels: Number.POSITIVE_INFINITY, largestSevereComponentMeanRgbDelta: Number.POSITIVE_INFINITY, hasLargeModerateMismatchComponent: true};
  }
  const histogram = new Uint32Array(256);
  const connectedDeltaThreshold = componentDeltaThreshold ?? maxMatchedPixelRgbDelta;
  const mismatchMask = new Uint8Array(pixelCount);
  const mismatchDeltas = new Uint8Array(pixelCount);
  const tilesX = Math.ceil(width / tileSize);
  const tilesY = Math.ceil(height / tileSize);
  const tilePixels = new Uint32Array(tilesX * tilesY);
  const tileMismatches = new Uint32Array(tilesX * tilesY);
  const tileDeltaTotals = new Float64Array(tilesX * tilesY);
  let matchedPixels = 0;
  let totalRgbDelta = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const tile = Math.floor(y / tileSize) * tilesX + Math.floor(x / tileSize);
    const offset = pixel * 4;
    const delta = (
      Math.abs(normalRgba[offset] - artifactRgba[offset])
      + Math.abs(normalRgba[offset + 1] - artifactRgba[offset + 1])
      + Math.abs(normalRgba[offset + 2] - artifactRgba[offset + 2])
    ) / 3;
    const bucket = Math.min(255, Math.max(0, Math.round(delta)));
    histogram[bucket] += 1;
    totalRgbDelta += delta;
    tilePixels[tile] += 1;
    tileDeltaTotals[tile] += delta;
    if (delta > maxMatchedPixelRgbDelta) tileMismatches[tile] += 1;
    if (delta > connectedDeltaThreshold) {
      mismatchMask[pixel] = 1;
      mismatchDeltas[pixel] = bucket;
    }
    if (delta <= maxMatchedPixelRgbDelta) matchedPixels += 1;
  }
  const p95Rank = Math.max(0, Math.ceil(pixelCount * 0.95) - 1);
  let cumulative = 0;
  let p95RgbDelta = 255;
  for (let bucket = 0; bucket < histogram.length; bucket += 1) {
    cumulative += histogram[bucket];
    if (cumulative > p95Rank) { p95RgbDelta = bucket; break; }
  }
  const matchFraction = matchedPixels / pixelCount;
  const meanRgbDelta = totalRgbDelta / pixelCount;
  let maxTileMismatchFraction = 0;
  let maxTileMeanRgbDelta = 0;
  let worstTile = null;
  for (let tile = 0; tile < tilePixels.length; tile += 1) {
    const mismatchFraction = tilePixels[tile] ? tileMismatches[tile] / tilePixels[tile] : 0;
    const meanDelta = tilePixels[tile] ? tileDeltaTotals[tile] / tilePixels[tile] : 0;
    if (mismatchFraction > maxTileMismatchFraction || meanDelta > maxTileMeanRgbDelta) {
      maxTileMismatchFraction = Math.max(maxTileMismatchFraction, mismatchFraction);
      maxTileMeanRgbDelta = Math.max(maxTileMeanRgbDelta, meanDelta);
      worstTile = {left: (tile % tilesX) * tileSize, top: Math.floor(tile / tilesX) * tileSize, width: Math.min(tileSize, width - (tile % tilesX) * tileSize), height: Math.min(tileSize, height - Math.floor(tile / tilesX) * tileSize)};
    }
  }
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let severeComponentCount = 0;
  let largestSevereComponentPixels = 0;
  let largestSevereComponentMeanRgbDelta = 0;
  let hasLargeModerateMismatchComponent = false;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (!mismatchMask[pixel] || visited[pixel]) continue;
    severeComponentCount += 1;
    let head = 0;
    let tail = 0;
    let componentPixels = 0;
    let componentDeltaTotal = 0;
    queue[tail++] = pixel;
    visited[pixel] = 1;
    while (head < tail) {
      const current = queue[head++];
      componentPixels += 1;
      componentDeltaTotal += mismatchDeltas[current];
      const currentX = current % width;
      const currentY = Math.floor(current / width);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const neighborX = currentX + dx;
        const neighborY = currentY + dy;
        if (neighborX < 0 || neighborX >= width || neighborY < 0 || neighborY >= height) continue;
        const neighbor = neighborY * width + neighborX;
        if (mismatchMask[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }
    largestSevereComponentPixels = Math.max(largestSevereComponentPixels, componentPixels);
    const componentMeanRgbDelta = componentPixels ? componentDeltaTotal / componentPixels : 0;
    largestSevereComponentMeanRgbDelta = Math.max(largestSevereComponentMeanRgbDelta, componentMeanRgbDelta);
    if (componentPixels > maxSevereComponentPixels && componentMeanRgbDelta >= minSevereComponentMeanRgbDelta) hasLargeModerateMismatchComponent = true;
  }
  return {
    passes: matchFraction >= minMatchFraction && meanRgbDelta <= maxMeanRgbDelta && p95RgbDelta <= maxP95RgbDelta && maxTileMismatchFraction <= maxTileMismatchFractionLimit && maxTileMeanRgbDelta <= maxTileMeanRgbDeltaLimit && !hasLargeModerateMismatchComponent,
    pixelCount,
    matchFraction,
    meanRgbDelta,
    p95RgbDelta,
    maxTileMismatchFraction,
    maxTileMeanRgbDelta,
    worstTile,
    severeComponentCount,
    largestSevereComponentPixels,
    largestSevereComponentMeanRgbDelta,
    hasLargeModerateMismatchComponent,
  };
};

const maskShapeDelta = (before, after) => {
  if (before.length !== after.length || before.length === 0) return 0;
  let union = 0; let xor = 0;
  for (let index = 0; index < before.length; index += 1) {
    if (before[index] || after[index]) union += 1;
    if (before[index] !== after[index]) xor += 1;
  }
  return union ? xor / union : 0;
};
const bboxInsideMeasurement = (bbox, measurement) => bbox && measurement
  && bbox.left >= measurement.left - 2 && bbox.top >= measurement.top - 2
  && bbox.right <= measurement.left + measurement.width + 2
  && bbox.bottom <= measurement.top + measurement.height + 2;
const rectInsideMeasurement = (rect, measurement) => rect && measurement
  && rect.left >= measurement.left - 2 && rect.top >= measurement.top - 2
  && rect.right <= measurement.left + measurement.width + 2
  && rect.bottom <= measurement.top + measurement.height + 2;
const rectConvergesToReviewed = (rect, reviewed, tolerance = 32) => rect && reviewed
  && Math.abs(rect.left - reviewed.left) <= tolerance
  && Math.abs(rect.top - reviewed.top) <= tolerance
  && Math.abs(rect.width - reviewed.width) <= tolerance
  && Math.abs(rect.height - reviewed.height) <= tolerance;
const extractArtifactFrame = (artifact, frame, output) => spawnSync('ffmpeg', [
  '-y', '-v', 'error', '-i', artifact, '-vf', `select=eq(n\\,${frame})`, '-vsync', '0', '-frames:v', '1', output,
], {encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024});

const renderStillWithValidatorHiddenTarget = async ({browser, serveUrl, composition, frame, output, targetId, inputSha256, expectedPublicPath}) => {
  if (!browser || typeof browser.newPage !== 'function') throw new Error('HeadlessBrowser.newPage hook is unavailable');
  const originalNewPage = browser.newPage;
  let screenshotHookCalls = 0;
  let targetRect = null;
  browser.newPage = async function patchedNewPage(options) {
    const page = await originalNewPage.call(this, options);
    const queue = page?.screenshotTaskQueue;
    if (!queue || typeof queue.postTask !== 'function' || typeof page.evaluate !== 'function') throw new Error('Remotion Page screenshot hook is unavailable');
    const originalPostTask = queue.postTask.bind(queue);
    queue.postTask = (task) => originalPostTask(async () => {
      screenshotHookCalls += 1;
      if (screenshotHookCalls !== 1) throw new Error('target suppression screenshot hook ran more than once');
      targetRect = await page.evaluate((expectedTargetId, expectedInputSha256, expectedSourcePath) => {
        const matches = [...document.querySelectorAll('[data-parity-target]')]
          .filter((node) => node.getAttribute('data-parity-target') === expectedTargetId);
        if (matches.length !== 1) throw new Error(`expected exactly one data-parity-target=${expectedTargetId}; found ${matches.length}`);
        const target = matches[0];
        if (target.getAttribute('data-parity-input-sha256') !== expectedInputSha256) throw new Error('data-parity-input-sha256 does not match the reviewed focal input');
        if (!(target instanceof HTMLImageElement)) throw new Error('parity target must be an actual HTMLImageElement');
        if (!target.complete || target.naturalWidth <= 0 || target.naturalHeight <= 0 || !target.currentSrc) throw new Error('parity target image is not decoded');
        const sourceUrl = new URL(target.currentSrc, window.location.href);
        const resolvedSourcePath = decodeURIComponent(sourceUrl.pathname);
        if (resolvedSourcePath !== expectedSourcePath) throw new Error(`parity target currentSrc must resolve to ${expectedSourcePath}; got ${resolvedSourcePath}`);
        const rect = target.getBoundingClientRect();
        const computed = window.getComputedStyle(target);
        if (!(rect.width > 0 && rect.height > 0) || computed.display === 'none' || computed.visibility === 'hidden' || Number(computed.opacity) <= 0) throw new Error('reviewed target is not visibly rendered');
        target.style.setProperty('visibility', 'hidden', 'important');
        return {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height};
      }, targetId, inputSha256, expectedPublicPath);
      return task();
    });
    return page;
  };
  try {
    await renderStill({serveUrl, composition, frame, output, imageFormat: 'png', puppeteerInstance: browser, overwrite: true, logLevel: 'error'});
  } finally {
    browser.newPage = originalNewPage;
  }
  if (screenshotHookCalls !== 1 || !targetRect) throw new Error('validator-owned target suppression did not run exactly once');
  return targetRect;
};

/** Prove submitted MP4s contain the reviewed target rendered by the bound Remotion composition. */
export async function verifyRemotionParity({root, runtimePath, familyPlayables}) {
  const failures = [];
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), '23jung-remotion-parity-'));
  let browser = null;
  try {
    const serveUrl = await bundle({entryPoint: runtimePath, publicDir: path.resolve(root, 'video/public'), onProgress: () => undefined});
    browser = await openBrowser('chrome', {chromeMode: 'headless-shell', logLevel: 'error'});
    for (const family of familyPlayables) {
      let composition;
      try {
        composition = await selectComposition({serveUrl, id: family.composition_id, puppeteerInstance: browser, logLevel: 'error'});
      } catch (error) {
        failures.push(`${family.family_id}: bound runtime does not register composition ${family.composition_id}: ${error.message}`);
        continue;
      }
      if (composition.width !== 1920 || composition.height !== 1080 || composition.fps !== 30) {
        failures.push(`${family.family_id}: Remotion composition must be 1920x1080 30fps`);
        continue;
      }
      const hold = family.stable_reading_hold;
      const actionFrames = (family.observable_actions ?? []).flatMap((action) => [action.start_frame, action.end_frame]);
      const proofFrames = [...new Set([...actionFrames, hold?.start_frame, hold && Math.floor((hold.start_frame + hold.end_frame) / 2), hold?.end_frame].filter(Number.isInteger))].sort((a, b) => a - b);
      if (proofFrames.some((frame) => frame < 0 || frame >= composition.durationInFrames)) {
        failures.push(`${family.family_id}: proof frame lies outside the registered Remotion composition`);
        continue;
      }
      const normalFrameFiles = new Map();
      const artifactFrameFiles = new Map();
      for (const frame of proofFrames) {
        const prefix = `${family.family_id}-${frame}`.replaceAll(/[^a-z0-9-]/giu, '-');
        const remotionFrame = path.join(temporaryRoot, `${prefix}-remotion.png`);
        const artifactFrame = path.join(temporaryRoot, `${prefix}-artifact.png`);
        await renderStill({serveUrl, composition, frame, output: remotionFrame, imageFormat: 'png', puppeteerInstance: browser, overwrite: true, logLevel: 'error'});
        normalFrameFiles.set(frame, remotionFrame);
        const extraction = extractArtifactFrame(path.resolve(root, family.artifact.path), frame, artifactFrame);
        if (extraction.status !== 0) { failures.push(`${family.family_id}: cannot decode submitted artifact frame ${frame}`); continue; }
        artifactFrameFiles.set(frame, artifactFrame);
        const [expected, actual] = await Promise.all([normalizeFrame(remotionFrame), normalizeFrame(artifactFrame)]);
        const delta = meanAbsoluteDelta(expected, actual);
        if (!(delta <= 10)) failures.push(`${family.family_id}: artifact frame ${frame} differs from the actual Remotion composition (mean delta ${delta.toFixed(3)})`);
        const [expectedRgba, actualRgba] = await Promise.all([readRgba(remotionFrame), readRgba(artifactFrame)]);
        const wholeFrameBinding = compareFullFrameRgba(expectedRgba.data, actualRgba.data, 1920, 1080);
        if (!wholeFrameBinding.passes) failures.push(`${family.family_id}: artifact frame ${frame} fails full-resolution whole-frame identity (match ${wholeFrameBinding.matchFraction.toFixed(3)}, mean RGB delta ${wholeFrameBinding.meanRgbDelta.toFixed(3)}, p95 RGB delta ${wholeFrameBinding.p95RgbDelta.toFixed(3)})`);
      }
      for (const [actionIndex, action] of (family.observable_actions ?? []).entries()) {
        const reviewed = action._validatorReviewedTarget;
        if (!reviewed || reviewed.asset_id !== action.target_id || reviewed.input_sha256 !== action.target_input_sha256) {
          failures.push(`${family.family_id}/${action.target_id}: validator-reviewed target binding is missing`);
          continue;
        }
        const endpoints = [];
        let endpointFailed = false;
        for (const [endpoint, frame] of [['start', action.start_frame], ['end', action.end_frame]]) {
          const normalFile = normalFrameFiles.get(frame);
          const artifactFile = artifactFrameFiles.get(frame);
          if (!normalFile || !artifactFile) { endpointFailed = true; failures.push(`${family.family_id}/${action.target_id}: ${endpoint} proof frame is missing`); continue; }
          const hiddenFile = path.join(temporaryRoot, `${family.family_id}-action-${actionIndex}-${endpoint}-validator-hidden.png`);
          let domRect;
          try {
            domRect = await renderStillWithValidatorHiddenTarget({browser, serveUrl, composition, frame, output: hiddenFile, targetId: action.target_id, inputSha256: reviewed.input_sha256, expectedPublicPath: reviewed.render_source_public_url});
          } catch (error) {
            endpointFailed = true;
            failures.push(`${family.family_id}/${action.target_id}: validator-owned target suppression failed at ${endpoint}: ${error.message}`);
            continue;
          }
          const [normal, hidden, artifact] = await Promise.all([readRgba(normalFile), readRgba(hiddenFile), readRgba(artifactFile)]);
          if ([normal, hidden, artifact].some((item) => item.info.width !== 1920 || item.info.height !== 1080)) {
            endpointFailed = true; failures.push(`${family.family_id}/${action.target_id}: full-resolution target proof frames must be 1920x1080`); continue;
          }
          const stats = targetContributionStats(normal.data, hidden.data, 1920, 1080);
          if (stats.count < 100 || stats.coreCount < 100) {
            endpointFailed = true; failures.push(`${family.family_id}/${action.target_id}: target contribution must be visibly present at ${endpoint}`); continue;
          }
          if (!bboxInsideMeasurement(stats.bbox, action.measurement_box) || !rectInsideMeasurement(domRect, action.measurement_box)) {
            endpointFailed = true; failures.push(`${family.family_id}/${action.target_id}: target contribution leaves the declared measurement_box at ${endpoint}`); continue;
          }
          const artifactBinding = compareArtifactOnTargetMask(normal.data, artifact.data, stats.coreMask);
          if (!artifactBinding.passes) {
            endpointFailed = true;
            failures.push(`${family.family_id}/${action.target_id}: submitted artifact does not preserve the full-resolution target at ${endpoint} (match ${artifactBinding.matchFraction.toFixed(3)}, RGB delta ${artifactBinding.meanRgbDelta.toFixed(3)})`);
            continue;
          }
          endpoints.push({stats, domRect});
        }
        if (endpointFailed || endpoints.length !== 2) continue;
        const [before, after] = endpoints;
        if (!rectConvergesToReviewed(after.domRect, reviewed.bbox)) failures.push(`${family.family_id}/${action.target_id}: action end target geometry does not converge to the reviewed focal bbox`);
        const deltaX = after.stats.centroidX - before.stats.centroidX;
        const deltaY = after.stats.centroidY - before.stats.centroidY;
        if (action.property === 'translate-x' && (Math.abs(deltaX) < 12 || Math.abs(deltaX) <= Math.abs(deltaY))) failures.push(`${family.family_id}/${action.target_id}: reviewed target lacks horizontal displacement`);
        else if (action.property === 'translate-y' && (Math.abs(deltaY) < 12 || Math.abs(deltaY) <= Math.abs(deltaX))) failures.push(`${family.family_id}/${action.target_id}: reviewed target lacks vertical displacement`);
        else if (!['translate-x', 'translate-y'].includes(action.property) && maskShapeDelta(before.stats.mask, after.stats.mask) < 0.08) failures.push(`${family.family_id}/${action.target_id}: reviewed target lacks shape/content-state change`);
      }
    }
  } catch (error) {
    failures.push(`bound runtime could not be executed as a Remotion entrypoint: ${error.message}`);
  } finally {
    if (browser) await browser.close({silent: true});
    await rm(temporaryRoot, {recursive: true, force: true});
  }
  return failures;
}
