import crypto from 'node:crypto';
import { normalizeImageGenPrompt, renderStaticFramePrompt } from './imagegen-static-frame.mjs';

export const IMAGEGEN_PROMPT_RECIPE_SCHEMA = 'imagegen-prompt-recipe-v1';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const clone = (value) => structuredClone(value);
function deepFreeze(value) {
  if (isObject(value) || Array.isArray(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function canonicalRecipeJson(value) { return canonical(value); }
export function hashRecipe(value) { return crypto.createHash('sha256').update(canonical(value), 'utf8').digest('hex'); }

function templateStrings(value, visit) {
  if (typeof value === 'string') return visit(value);
  if (Array.isArray(value)) return value.map((item) => templateStrings(item, visit));
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, templateStrings(item, visit)]));
  return value;
}

const TOKEN = /\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}/g;

function collectTokens(value, result = new Set()) {
  templateStrings(value, (text) => {
    let match;
    while ((match = TOKEN.exec(text))) result.add(match[1]);
    TOKEN.lastIndex = 0;
    return text;
  });
  return result;
}

function substitute(value, values) {
  return templateStrings(value, (text) => text.replace(TOKEN, (_match, name) => String(values[name])));
}

function fail(index, message) { throw new Error(`prompt recipe ${index + 1} ${message}`); }

export function lintStaticFrameSpec(spec, recipe = {}, index = 0) {
  const errors = [];
  const warnings = [];
  const fields = [];
  const visit = (value, key = '') => {
    if (typeof value === 'string') fields.push(value);
    else if (Array.isArray(value)) value.forEach((item) => visit(item, key));
    else if (isObject(value)) Object.entries(value).forEach(([childKey, item]) => {
      if (childKey === 'avoid' || childKey === 'use_case' || childKey === 'asset_type' || (key === 'exact_text_policy' && childKey === 'allowed')) return;
      visit(item, childKey);
    });
  };
  visit(spec);
  const text = fields.join(' ');
  const protectedText = `${text} ${(spec.exact_text_policy?.allowed || []).join(' ')}`;
  const temporal = /(?:\b(?:camera\s+(?:pans?|tilts?|doll(?:y|ies)|push(?:es|ing)?|pull(?:s|ing)?|zooms?|orbits?|tracks?|moves?)|(?:slow|fast|gentle|rapid)\s+(?:pan|tilt|dolly|zoom|orbit|tracking|crane)|(?:panning|tilting|zooming|orbiting|tracking|craning)|tracking\s+shot|crane\s+shot|rack\s+focus|speed\s+ramp|slow\s+motion|time[- ]lapse|over\s+\d+(?:\.\d+)?\s+seconds?|\bthen\b)|카메라(?:가|는|를)\s*(?:(?:왼쪽|오른쪽|위|아래|앞|뒤|주변)\s*(?:으로|로)?\s*)?(?:팬|패닝|틸트|줌(?:인|아웃)?|확대|축소|추적|이동|회전)(?:\s*이동)?(?:하고|하며|하는|한다|한)|카메라(?:가|는|를)\s*뒤로\s*빠진다|(?:인물|사람|대상|피사체)(?:이|가|을|를|은|는)[^.!?]{0,24}(?:천천히|빠르게)?\s*(?:확대|축소|줌(?:인|아웃)?|추적|이동|회전|팬|패닝|틸트)(?:하고|하며|하는|한다|한)|먼저.{0,80}(?:그다음|이어서)|(?:하고|하며)\s*이어서|고\s*나서)/i;
  if (temporal.test(text)) errors.push({ code: 'temporal-or-camera-motion', message: 'Static recipe fields contain temporal or camera-motion instructions; move motion to the deterministic animation contract.' });
  if (/\b(?:as soon as|then|followed by|changes into|transitions? to)\b/i.test(text) || /\b(?:before|after)\b[^.]{0,100}\band\b[^.]{0,20}\b(?:before|after)\b/i.test(text)) errors.push({ code: 'multi-beat', message: 'Static recipe describes multiple beats; use one visible frame.' });
  const timeTerms = text.match(/\b(?:morning|noon|afternoon|evening|night|midnight|sunrise|sunset)\b/gi) || [];
  const timeClusters = new Set(timeTerms.map((term) => {
    const normalized = term.toLowerCase();
    if (normalized === 'morning' || normalized === 'sunrise') return 'morning';
    if (normalized === 'evening' || normalized === 'sunset') return 'evening';
    if (normalized === 'night' || normalized === 'midnight') return 'night';
    return normalized;
  }));
  if (timeClusters.size > 1) errors.push({ code: 'multiple-times', message: 'Static recipe combines multiple times.' });
  if (/\b(?:at|in|on)\s+(?:the\s+)?[A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*)?\b[^.]{0,80}\b(?:at|in|on)\s+(?:the\s+)?[A-Za-z]/i.test(text)) warnings.push({ code: 'multiple-locations-review', message: 'Possible multiple locations; confirm the frame has one location.' });
  if (/\b(?:cinematic|epic|stunning|beautiful|vibrant|dynamic|dramatic|masterpiece|award[- ]winning|highly detailed)\b/i.test(text)) warnings.push({ code: 'decorative-buzzword', message: 'Decorative style buzzwords are not a substitute for visible composition.' });
  if (/\b(?:readable\s+text|headline|paragraph|multiple\s+lines|dense\s+text|label|sign|logo|watermark)\b/i.test(text) && !(spec.exact_text_policy?.mode === 'exact')) warnings.push({ code: 'text-density', message: 'Text-like content is present without an exact-text allowlist.' });
  const roles = Array.isArray(spec.references) ? spec.references.map((reference) => reference?.role).filter(nonEmpty) : [];
  const roleCounts = new Map();
  roles.forEach((role) => roleCounts.set(role, (roleCounts.get(role) || 0) + 1));
  for (const [role, count] of roleCounts) if (count > 1) errors.push({ code: 'duplicate-reference-role', role, message: `Reference role ${role} is duplicated.` });
  const requirements = recipe.reference_role_requirements || recipe.reference_requirements || recipe.reference_roles || [];
  for (const requirement of Array.isArray(requirements) ? requirements : []) {
    const role = typeof requirement === 'string' ? requirement : requirement?.role;
    const required = typeof requirement === 'string' || requirement?.required !== false;
    if (required && nonEmpty(role) && !roles.includes(role)) errors.push({ code: 'missing-reference-role', role, message: `Required reference role ${role} is missing.` });
  }
  const policy = isObject(recipe.qa_policy) ? recipe.qa_policy : {};
  const approved = new Set(Array.isArray(policy.approved_protected_terms) ? policy.approved_protected_terms.map((term) => String(term).toLowerCase()) : []);
  const protectedIndicators = [...protectedText.matchAll(/\b(?:logo|celebrity|famous actor|trademark|copyrighted character|disney|marvel|nike|coca-cola)\b/gi)].map((match) => match[0].toLowerCase()).filter((term) => !approved.has(term));
  if (protectedIndicators.length) {
    const unique = [...new Set(protectedIndicators)];
    if (policy.protected_content_mode === 'block') errors.push({ code: 'protected-content-block', indicators: unique, message: 'Recipe includes protected-content indicators not present in approved_protected_terms.' });
    else warnings.push({ code: 'protected-content-review', indicators: unique, message: 'Protected-content indicators require human review; detection is not exhaustive.' });
  }
  return { version: 1, status: errors.length ? 'error' : 'pass', errors, warnings, policy: clone(recipe.qa_policy || {}) };
}

export function resolvePromptRecipe(recipe, index = 0) {
  if (!isObject(recipe)) fail(index, 'must be an object');
  if (recipe.schema !== IMAGEGEN_PROMPT_RECIPE_SCHEMA && recipe.recipe_schema !== IMAGEGEN_PROMPT_RECIPE_SCHEMA && recipe.kind !== IMAGEGEN_PROMPT_RECIPE_SCHEMA) fail(index, `schema must be ${IMAGEGEN_PROMPT_RECIPE_SCHEMA}`);
  if (!nonEmpty(recipe.recipe_id)) fail(index, 'requires recipe_id');
  if (!(recipe.version === 1 || recipe.version === '1')) fail(index, 'version must be 1');
  if (!nonEmpty(recipe.family)) fail(index, 'requires family');
  const template = recipe.template ?? recipe.template_spec;
  if (template === undefined) fail(index, 'requires template');
  if (!isObject(recipe.prompt_meta)) fail(index, 'requires prompt_meta provenance object');
  for (const key of ['source_url', 'source_title', 'title', 'author', 'original_language', 'captured_at']) if (recipe.prompt_meta[key] !== undefined && !nonEmpty(recipe.prompt_meta[key])) fail(index, `prompt_meta.${key} must be non-empty when present`);
  const referenceRequirements = recipe.reference_role_requirements || recipe.reference_requirements || recipe.reference_roles || [];
  if (!Array.isArray(referenceRequirements)) fail(index, 'reference role requirements must be an array');
  for (const requirement of referenceRequirements) {
    if (typeof requirement === 'string') { if (!nonEmpty(requirement)) fail(index, 'reference role requirements entries must be non-empty'); }
    else if (!isObject(requirement) || !nonEmpty(requirement.role) || (requirement.required !== undefined && typeof requirement.required !== 'boolean')) fail(index, 'reference role requirements entries must contain a non-empty role and optional boolean required');
  }
  if (recipe.qa_policy !== undefined && !isObject(recipe.qa_policy)) fail(index, 'qa_policy must be an object when present');
  if (isObject(recipe.qa_policy)) {
    if (recipe.qa_policy.protected_content_mode !== undefined && !['review', 'block'].includes(recipe.qa_policy.protected_content_mode)) fail(index, 'qa_policy.protected_content_mode must be review or block');
    if (recipe.qa_policy.approved_protected_terms !== undefined && (!Array.isArray(recipe.qa_policy.approved_protected_terms) || recipe.qa_policy.approved_protected_terms.some((term) => !nonEmpty(term)))) fail(index, 'qa_policy.approved_protected_terms must contain non-empty strings');
  }
  if (recipe.observed_model !== undefined && !nonEmpty(recipe.observed_model)) fail(index, 'observed_model must be a non-empty string when present');
  if (!isObject(recipe.variables) || !isObject(recipe.defaults)) fail(index, 'variables and defaults must be objects');
  const tokens = collectTokens(template);
  const declared = new Set([...Object.keys(recipe.variables || {}), ...Object.keys(recipe.defaults || {})]);
  const unknown = [...tokens].filter((name) => !declared.has(name));
  if (unknown.length) fail(index, `contains undeclared variables: ${unknown.join(', ')}`);
  const suppliedUnknown = Object.keys(recipe.variables || {}).filter((name) => !tokens.has(name));
  if (suppliedUnknown.length) fail(index, `contains unknown variables: ${suppliedUnknown.join(', ')}`);
  const unusedDefaults = Object.keys(recipe.defaults || {}).filter((name) => !tokens.has(name));
  if (unusedDefaults.length) fail(index, `contains unknown defaults: ${unusedDefaults.join(', ')}`);
  const values = {};
  for (const name of tokens) {
    if (Object.prototype.hasOwnProperty.call(recipe.variables || {}, name)) values[name] = recipe.variables[name];
    else if (Object.prototype.hasOwnProperty.call(recipe.defaults || {}, name)) values[name] = recipe.defaults[name];
    if (values[name] === undefined || values[name] === null || (typeof values[name] === 'string' && !values[name].trim())) fail(index, `has unresolved variable: ${name}`);
  }
  const resolvedTemplate = substitute(clone(template), values);
  if (collectTokens(resolvedTemplate).size) fail(index, 'has unresolved placeholders after substitution');
  const spec = normalizeImageGenPrompt(typeof resolvedTemplate === 'string' ? resolvedTemplate : resolvedTemplate, index);
  const lint = lintStaticFrameSpec(spec, { ...recipe, reference_role_requirements: referenceRequirements }, index);
  if (lint.errors.length) fail(index, `failed QA lint: ${lint.errors.map((item) => item.code).join(', ')}`);
  const renderedPrompt = renderStaticFramePrompt(spec, index);
  const provenance = {
    schema: IMAGEGEN_PROMPT_RECIPE_SCHEMA,
    recipe_id: recipe.recipe_id,
    version: 1,
    family: recipe.family,
    prompt_meta: clone(recipe.prompt_meta || {}),
    resolved_variables: clone(values),
    resolved_spec: clone(spec),
    rendered_prompt: renderedPrompt,
    lint: clone(lint),
    reference_role_requirements: clone(referenceRequirements),
  };
  if (recipe.observed_model !== undefined) provenance.observed_model = recipe.observed_model;
  provenance.hash = hashRecipe(provenance);
  return deepFreeze(provenance);
}

export function verifyPromptRecipeProvenance(provenance, index = 0) {
  if (!isObject(provenance) || provenance.schema !== IMAGEGEN_PROMPT_RECIPE_SCHEMA || !nonEmpty(provenance.hash)) throw new Error(`prompt recipe ${index + 1} provenance is missing or has an invalid schema`);
  const candidate = clone(provenance);
  if (candidate.version !== 1 || !nonEmpty(candidate.recipe_id) || !nonEmpty(candidate.family) || !isObject(candidate.prompt_meta)) throw new Error(`prompt recipe ${index + 1} provenance has invalid recipe identity or prompt_meta`);
  if (candidate.observed_model !== undefined && !nonEmpty(candidate.observed_model)) throw new Error(`prompt recipe ${index + 1} observed_model must be non-empty when present`);
  if (!isObject(candidate.resolved_variables) || !Array.isArray(candidate.reference_role_requirements)) throw new Error(`prompt recipe ${index + 1} provenance variables or reference requirements are invalid`);
  if (!isObject(candidate.lint) || candidate.lint.version !== 1 || !['pass', 'error'].includes(candidate.lint.status) || !Array.isArray(candidate.lint.errors) || !Array.isArray(candidate.lint.warnings) || !isObject(candidate.lint.policy)) throw new Error(`prompt recipe ${index + 1} lint report shape is invalid`);
  const expected = candidate.hash;
  delete candidate.hash;
  if (hashRecipe(candidate) !== expected) throw new Error(`prompt recipe ${index + 1} provenance hash does not match resolved content`);
  const spec = normalizeImageGenPrompt(candidate.resolved_spec, index);
  if (candidate.rendered_prompt !== renderStaticFramePrompt(spec, index)) throw new Error(`prompt recipe ${index + 1} rendered prompt does not match resolved spec`);
  if (!isObject(candidate.lint)) throw new Error(`prompt recipe ${index + 1} provenance is missing its lint report`);
  const recomputedLint = lintStaticFrameSpec(spec, { reference_role_requirements: candidate.reference_role_requirements || [], qa_policy: candidate.lint.policy || {} }, index);
  if (canonical(recomputedLint) !== canonical(candidate.lint)) throw new Error(`prompt recipe ${index + 1} lint report does not match resolved content`);
  if (recomputedLint.errors.length) throw new Error(`prompt recipe ${index + 1} resolved content fails QA lint`);
  return true;
}
