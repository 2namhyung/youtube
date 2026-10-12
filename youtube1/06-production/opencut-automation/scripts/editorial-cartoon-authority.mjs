import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_PATHS = Object.freeze({
  'paper-cut-keyframe-v1': path.join(ROOT, 'production', 'templates', 'paper-cut-keyframe-v1.json'),
  'paper-cut-grok-storyboard-v2': path.join(ROOT, 'production', 'templates', 'paper-cut-grok-storyboard-v2.json'),
});
const SHA256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

export function loadVisualAuthority(templateId = 'paper-cut-grok-storyboard-v2') {
  const templatePath = TEMPLATE_PATHS[templateId];
  if (!templatePath) throw new Error(`Unsupported visual authority ${templateId}`);
  const bytes = fs.readFileSync(templatePath);
  const template = JSON.parse(bytes.toString('utf8'));
  const planning = template.visualPlanning;
  const expected = templateId === 'paper-cut-grok-storyboard-v2'
    ? { format: 'layered-paper-cutout-color-storyboard', schema: 'paper-cut-grok-storyboard-visual-planning-v2' }
    : { format: 'layered-paper-cutout-keyframe', schema: 'paper-cut-keyframe-visual-planning-v1' };
  if (template.templateId !== templateId || template.format !== expected.format) throw new Error('Visual template identity is invalid');
  if (planning?.schema !== expected.schema) throw new Error('Visual planning authority is missing');
  const density = planning.cutDensity; const durationPolicy = planning.cutDurationPolicy; const style = planning.style; const continuity = planning.continuity;
  const integers = ['targetNonWhitespaceCharactersPerCut', 'shortsFloorCharacters', 'shortsMinCuts', 'shortsTargetMinCuts', 'shortsTargetMaxCuts', 'shortsMaxCuts'];
  if (!density || integers.some((key) => !Number.isInteger(density[key]) || density[key] < 1) || density.shortsMinCuts > density.shortsTargetMinCuts || density.shortsTargetMinCuts > density.shortsTargetMaxCuts || density.shortsTargetMaxCuts > density.shortsMaxCuts) throw new Error('Editorial-cartoon cut-density authority is invalid');
  if (!durationPolicy || durationPolicy.targetMinSeconds !== 2 || durationPolicy.targetMaxSeconds !== 3 || durationPolicy.exceptionMinSeconds !== 1.5 || durationPolicy.exceptionMaxSeconds !== 3.5 || !Array.isArray(durationPolicy.exceptionReasons) || !durationPolicy.exceptionReasons.includes('final-required-sentence') || !durationPolicy.exceptionReasons.includes('required-sentence-boundary')) throw new Error('Editorial-cartoon cut-duration authority is invalid');
  if (!style || style.useCase !== 'illustration-story' || ['description', 'occupationalLegibility', 'verifiedRoleFidelity', 'lighting', 'color', 'materialTexture'].some((key) => typeof style[key] !== 'string' || !style[key].trim()) || !Array.isArray(style.avoid) || !style.avoid.length) throw new Error('Editorial-cartoon style authority is invalid');
  if (continuity?.sameStoryWorld !== true || continuity?.preserveLocationsPropsWardrobe !== true || (templateId === 'paper-cut-grok-storyboard-v2' ? continuity?.firstGeneratedFrameIsStyleSeed !== false : continuity?.firstGeneratedFrameIsStyleSeed !== true)) throw new Error('Editorial-cartoon continuity authority is invalid');
  if (templateId === 'paper-cut-keyframe-v1' && (template.animation?.schema !== 'paper-cut-keyframe-authority-v1' || template.animation.generator !== 'ffmpeg-deterministic-keyframes' || template.animation.imageGenEveryCut !== true || template.animation.generativeVideoAllowed !== false || template.animation.requireStoryProp !== true || template.animation.requireActiveBlocking !== true)) throw new Error('Paper-cut keyframe authority is invalid');
  if (templateId === 'paper-cut-grok-storyboard-v2' && (template.animation?.schema !== 'paper-cut-grok-storyboard-authority-v2' || template.animation.generator !== 'grok-color-storyboard-i2v' || template.animation.imageGenEveryCut !== true || template.animation.generativeVideoAllowed !== true || template.animation.providerInput !== 'exactly-one-approved-color-storyboard' || template.animation.separateReferenceUploadsAllowed !== false || template.animation.providerExecution !== 'deferred-explicit-gate')) throw new Error('Grok color-storyboard authority is invalid');
  return Object.freeze({ schema: planning.schema, templateId: template.templateId, templateSha256: SHA256(bytes), format: template.format, cutDensity: structuredClone(density), cutDurationPolicy: structuredClone(durationPolicy), style: structuredClone(style), continuity: structuredClone(continuity), ...(template.animation ? { animation: structuredClone(template.animation) } : {}) });
}

export function loadEditorialCartoonAuthority() { return loadVisualAuthority(); }

export function editorialCutBudget(authority, scriptText, narrationDurationSeconds = null) {
  const characters = String(scriptText || '').replace(/\s/gu, '').length;
  const density = authority.cutDensity;
  const durationPolicy = authority.cutDurationPolicy;
  const narrationSeconds = Number(narrationDurationSeconds);
  if (Number.isFinite(narrationSeconds) && narrationSeconds > 0) {
    const targetMin = durationPolicy.targetMinSeconds;
    const targetMax = durationPolicy.targetMaxSeconds;
    const minCuts = Math.max(1, Math.ceil(narrationSeconds / targetMax));
    const maxCuts = Math.max(minCuts, Math.floor(narrationSeconds / targetMin));
    const targetCuts = Math.max(minCuts, Math.min(maxCuts, Math.round(narrationSeconds / ((targetMin + targetMax) / 2))));
    return { minCuts, targetCuts, maxCuts, nonWhitespaceCharacters: characters, narrationDurationSeconds: narrationSeconds, durationPolicy: structuredClone(durationPolicy), countBasis: 'locked-narration-duration-and-semantic-boundaries' };
  }
  // A duration-less authority probe is retained for non-production tooling only.
  // It never supplies the active newsroom planner with a fixed 17–19 range.
  const targetCuts = Math.max(1, Math.ceil(characters / density.targetNonWhitespaceCharactersPerCut));
  return { minCuts: Math.max(1, targetCuts - 1), targetCuts, maxCuts: targetCuts + 2, nonWhitespaceCharacters: characters, durationPolicy: structuredClone(durationPolicy), countBasis: 'text-density-fallback-non-production' };
}
