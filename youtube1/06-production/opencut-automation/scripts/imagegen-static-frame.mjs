const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const text = (value) => (nonEmpty(value) ? value.trim() : '');
export const IMAGEGEN_STATIC_FRAME_SCHEMA = 'static-frame-v1';
export const IMAGEGEN_USE_CASES = [
  'photorealistic-natural',
  'product-mockup',
  'ui-mockup',
  'infographic-diagram',
  'scientific-educational',
  'ads-marketing',
  'productivity-visual',
  'logo-brand',
  'illustration-story',
  'stylized-concept',
  'historical-scene',
];

const TEMPORAL_INSTRUCTION = /(?:\b(?:camera\s+(?:pans?|tilts?|doll(?:y|ies)|pushes?|pulls?|zooms?|orbits?|tracks?|cranes?|moves?|movement)|(?:slow|fast|gentle|rapid)\s+(?:pan|tilt|dolly|zoom|orbit|tracking|crane)\s+(?:left|right|up|down|in|out|forward|back(?:ward)?|around|toward|away)|(?:panning|tilting|zooming|orbiting|tracking|craning)\s+(?:left|right|up|down|in|out|forward|back(?:ward)?|around|toward|away)|dolly\s+(?:in|out|forward|backward|toward|away)|tracking\s+shot|crane\s+shot|push(?:es|ing)?\s+in|pull(?:s|ing)?\s+(?:out|back)|whip\s+pan|rack\s+focus|speed\s+ramp|slow\s+motion|time[- ]lapse|over\s+\d+(?:\.\d+)?\s+seconds?|then\s+(?:turns?|moves?|walks?|runs?|stops?))\b|카메라(?:가|는|를)\s*(?:(?:왼쪽|오른쪽|위|아래|앞|뒤|주변)\s*(?:으로|로)?\s*)?(?:팬|패닝|틸트|줌(?:인|아웃)?|확대|축소|추적|이동|회전)(?:\s*이동)?(?:하고|하며|하는|한다|한)|카메라(?:가|는|를)\s*뒤로\s*빠진다|(?:인물|사람|대상|피사체)(?:이|가|을|를|은|는)[^.!?]{0,24}(?:천천히|빠르게)?\s*(?:확대|축소|줌(?:인|아웃)?|추적|이동|회전|팬|패닝|틸트)(?:하고|하며|하는|한다|한)|먼저.{0,80}(?:그다음|이어서)|(?:하고|하며)\s*이어서|고\s*나서)/i;

const TOP_LEVEL_KEYS = new Set([
  'use_case', 'asset_type', 'continuity_group', 'location_id',
  'wardrobe_ids', 'prop_ids', 'reference_ids', 'scene', 'subjects',
  'shot', 'composition', 'lighting', 'references', 'exact_text_policy',
  'avoid',
]);

export const DEFAULT_AVOID_CONSTRAINTS = [
  'temporal motion, camera movement, motion blur, speed lines or implied action',
  'equipment jargon that does not describe a visible result',
  'readable text, logos, watermarks or invented interface details',
  'unrequested people, faces, minors, extra hands or duplicated objects',
];

function defaultSpec(prompt, index = 0) {
  const cutId = `cut-${index + 1}`;
  return {
    use_case: 'illustration-story',
    asset_type: 'static_frame',
    continuity_group: cutId,
    location_id: `${cutId}-location`,
    wardrobe_ids: [],
    prop_ids: [],
    reference_ids: [],
    scene: { backdrop: prompt, environment: 'ordinary, non-identifiable setting' },
    subjects: [],
    shot: { type: 'medium-wide', viewpoint: 'straight-on', camera_height: 'eye-level' },
    composition: {
      aspect_ratio: '9:16',
      spatial_placement: 'clear subject placement with an uncluttered vertical frame',
      negative_space: 'leave the upper and lower caption-safe areas clear',
      depth_layers: { foreground: 'none', midground: 'primary scene', background: 'backdrop' },
    },
    lighting: { description: 'natural, even practical light', color: 'restrained neutral palette', material_texture: 'ordinary visible surface texture' },
    references: [],
    exact_text_policy: { mode: 'none', allowed: [] },
    avoid: [...DEFAULT_AVOID_CONSTRAINTS],
  };
}

function validateSpec(spec, index = 0) {
  const fail = (message) => { throw new Error(`imageGenPrompts[${index}] ${message}`); };
  if (!isObject(spec)) fail('must be an object or non-empty legacy prompt string');
  const unknownKeys = Object.keys(spec).filter((key) => !TOP_LEVEL_KEYS.has(key));
  if (unknownKeys.length) fail(`contains unknown top-level fields: ${unknownKeys.join(', ')}`);
  for (const key of ['use_case', 'asset_type', 'continuity_group', 'location_id']) if (!nonEmpty(spec[key])) fail(`requires non-empty ${key}`);
  if (!IMAGEGEN_USE_CASES.includes(spec.use_case)) fail(`use_case must be one of: ${IMAGEGEN_USE_CASES.join(', ')}`);
  if (spec.asset_type !== 'static_frame') fail('asset_type must be "static_frame" for ImageGen');
  if (!isObject(spec.scene) || !nonEmpty(spec.scene.backdrop)) fail('scene.backdrop is required');
  if (!Array.isArray(spec.subjects)) fail('subjects must be an array');
  for (const subject of spec.subjects) {
    if (!isObject(subject) || !nonEmpty(subject.id) || !nonEmpty(subject.description) || !Array.isArray(subject.invariants) || subject.invariants.some((item) => !nonEmpty(item))) {
      fail('each subject requires id, description and an invariants array');
    }
  }
  if (!isObject(spec.shot) || !nonEmpty(spec.shot.type) || !nonEmpty(spec.shot.viewpoint) || !nonEmpty(spec.shot.camera_height)) fail('shot.type, shot.viewpoint and shot.camera_height are required');
  if (!isObject(spec.composition) || !['9:16', '1:1'].includes(spec.composition.aspect_ratio) || !nonEmpty(spec.composition.spatial_placement) || !nonEmpty(spec.composition.negative_space) || !isObject(spec.composition.depth_layers)) fail('composition must define 9:16 or 1:1 aspect_ratio, spatial_placement, negative_space and depth_layers');
  if (!isObject(spec.lighting) || !nonEmpty(spec.lighting.description) || !nonEmpty(spec.lighting.color) || !nonEmpty(spec.lighting.material_texture)) fail('lighting.description, lighting.color and lighting.material_texture are required');
  if (!Array.isArray(spec.references)) fail('references must be an array');
  for (const reference of spec.references) if (!isObject(reference) || !nonEmpty(reference.id) || !nonEmpty(reference.role)) fail('each reference requires id and role');
  if (!isObject(spec.exact_text_policy) || !['none', 'exact'].includes(spec.exact_text_policy.mode) || !Array.isArray(spec.exact_text_policy.allowed) || spec.exact_text_policy.allowed.some((item) => !nonEmpty(item))) fail('exact_text_policy.mode must be none or exact and allowed must contain only non-empty strings');
  if (spec.exact_text_policy.mode === 'none' && spec.exact_text_policy.allowed.length) fail('exact_text_policy.allowed must be empty when mode is none');
  if (!Array.isArray(spec.avoid) || spec.avoid.length === 0 || spec.avoid.some((item) => !nonEmpty(item))) fail('avoid must contain at least one non-empty constraint');
  for (const key of ['wardrobe_ids', 'prop_ids', 'reference_ids']) if (!Array.isArray(spec[key]) || spec[key].some((item) => !nonEmpty(item))) fail(`${key} must be an array of IDs`);
  const staticFields = [
    spec.scene.backdrop,
    spec.scene.environment,
    ...spec.subjects.flatMap((subject) => [subject.description, ...subject.invariants]),
    spec.shot.type,
    spec.shot.viewpoint,
    spec.shot.camera_height,
    spec.composition.spatial_placement,
    spec.composition.negative_space,
    ...Object.values(spec.composition.depth_layers),
    spec.lighting.description,
    spec.lighting.color,
    spec.lighting.material_texture,
    ...spec.references.map((reference) => reference.role),
  ].filter(nonEmpty);
  if (staticFields.some((value) => TEMPORAL_INSTRUCTION.test(value))) fail('ImageGen fields must describe one visible keyframe; camera motion belongs in the deterministic animation contract');
  return spec;
}

export function normalizeImageGenPrompt(input, index = 0) {
  const spec = typeof input === 'string' ? defaultSpec(text(input), index) : structuredClone(input);
  if (typeof input === 'string' && !text(input)) throw new Error(`imageGenPrompts[${index}] must not be empty`);
  validateSpec(spec, index);
  return spec;
}

export function renderStaticFramePrompt(input, index = 0) {
  const spec = normalizeImageGenPrompt(input, index);
  const subjects = spec.subjects.map((subject) => `${subject.description} (${subject.id}; invariants: ${subject.invariants.join('; ')})`);
  const layers = Object.entries(spec.composition.depth_layers).map(([layer, value]) => `${layer}: ${value}`).join(', ');
  const refs = spec.references.length ? ` Reference images: ${spec.references.map((reference) => `${reference.id} as ${reference.role}${reference.path ? ` (${reference.path})` : ''}`).join('; ')}.` : '';
  const exactText = spec.exact_text_policy.mode === 'exact' && spec.exact_text_policy.allowed.length ? ` Exact text only: ${spec.exact_text_policy.allowed.join(' | ')}.` : ' No readable text unless explicitly allowed.';
  return [
    'Static visual frame only; no temporal motion or camera movement.',
    `${spec.use_case}, ${spec.asset_type}.`,
    `Scene/backdrop: ${spec.scene.backdrop}${spec.scene.environment ? `; ${spec.scene.environment}` : ''}.`,
    subjects.length ? `Subjects: ${subjects.join(' | ')}.` : 'No subjects.',
    `Shot: ${spec.shot.type}, ${spec.shot.viewpoint}, camera height ${spec.shot.camera_height}.`,
    `Composition: ${spec.composition.aspect_ratio}; ${spec.composition.spatial_placement}; negative space: ${spec.composition.negative_space}; depth layers: ${layers}.`,
    `Lighting/color/material: ${spec.lighting.description}; ${spec.lighting.color}; ${spec.lighting.material_texture}.`,
    exactText,
    `Avoid: ${spec.avoid.join('; ')}.${refs}`,
  ].join(' ');
}

export function validateImageGenPrompt(input, index = 0) {
  return validateSpec(normalizeImageGenPrompt(input, index), index);
}
