import {createHash} from 'node:crypto';
import {readdir, readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import sharp from 'sharp';
import {RENDERER_RECIPE_ID, RENDERER_RECIPE_PATH, renderStyleFrameBuffers} from './lib/grammar-bound-style-frame-renderer-v04.mjs';

const ROOT = process.cwd();
const INDEX_REL = 'video/qa/style-frames/episode-001/reference-style-families-v04/family-index.json';
const GRAMMAR_REL = 'video/episodes/episode-001/reference-grammar-contract.json';
const GATES_REL = 'video/episodes/episode-001/reference-style-gates.json';
const STATE_REL = 'video/episodes/episode-001/production-state.json';
const BLUEPRINT_REL = 'video/episodes/episode-001/generated/reference-cut-blueprint.json';
const FAMILY_IDS = ['hook-source-collage', 'assembly-editorial', 'law-document-editorial', 'omni-fiction-continuity', 'process-route-editorial', 'time-data-editorial'];
const BEATS = ['opening', 'evidence-or-change', 'final-summary'];
const CATEGORIES = ['visual_object_role', 'layout_relation', 'depth_occlusion', 'text_surface_role', 'motion_operator', 'transition_operator', 'treatment'];
const CATEGORY_TARGET = {visual_object_role: 'component', layout_relation: 'component', depth_occlusion: 'component', text_surface_role: 'component', motion_operator: 'action', transition_operator: 'transition', treatment: 'treatment'};
const ALLOWED_EXCEPTIONS = ['beige-checker-background', 'short-asset-label-below-target', 'source-locked-legal-retype', 'source-rights-chrome'];
const HISTORICAL_MANIFEST = {
  'hook-source-collage': 'video/qa/style-frames/episode-001/reference-style-families-v03/hook-source-collage-v03/manifest.json',
  'assembly-editorial': 'video/qa/style-frames/episode-001/reference-style-families-v03/assembly-editorial-v03/manifest.json',
  'law-document-editorial': 'video/qa/style-frames/episode-001/SH006-editorial-v08/manifest.json',
  'omni-fiction-continuity': 'video/qa/style-frames/episode-001/reference-style-families-v03/omni-fiction-continuity-v03/manifest.json',
  'process-route-editorial': 'video/qa/style-frames/episode-001/reference-style-families-v03/process-route-editorial-v03/manifest.json',
  'time-data-editorial': 'video/qa/style-frames/episode-001/reference-style-families-v03/time-data-editorial-v03/manifest.json',
};

const digest = (value) => createHash('sha256').update(value).digest('hex');
const shaFile = async (file) => digest(await readFile(file));
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const exists = async (file) => { try { return (await stat(file)).isFile(); } catch { return false; } };
const sorted = (values) => [...values].sort();
const exact = (actual, expected) => isDeepStrictEqual(actual, expected);
const rowKey = (row) => `${row.category}|${row.grammar_id}|${row.target_type}|${row.target_id}`;
const uniqueRows = (rows) => [...new Map(rows.map((row) => [rowKey(row), row])).values()];
const bundleDigest = (rows) => digest(Buffer.from(rows.map((row) => `${row.kind}|${row.path}|${row.sha256}`).join('\n')));
const dimensions = async (file) => { try { const m = await sharp(file).metadata(); return {width: m.width, height: m.height}; } catch { return null; } };
const normalized = (value) => (value ?? '').replaceAll('\\', '/').replace(/^\.\//u, '');
const isWithin = (candidate, parent) => candidate === parent || candidate.startsWith(`${parent}/`);

async function rawPixelHash(input) {
  const {data, info} = await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  return digest(Buffer.concat([Buffer.from(`${info.width}|${info.height}|${info.channels}|`), data]));
}

async function imageFiles(rootPath) {
  const result = [];
  const walk = async (dir) => {
    let entries;
    try { entries = await readdir(dir, {withFileTypes: true}); } catch { return; }
    for (const entry of entries) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile() && /\.(?:png|jpe?g|webp)$/iu.test(entry.name)) result.push(target);
    }
  };
  await walk(rootPath);
  return result;
}

const forbiddenRootCache = new Map();
async function forbiddenRootEvidence(root) {
  if (forbiddenRootCache.has(root)) return forbiddenRootCache.get(root);
  const promise = (async () => {
    const state = await readJson(path.join(root, STATE_REL));
    const roots = Object.entries(state.provisional_artifacts ?? {})
      .filter(([key, statusValue]) => key !== 'note' && typeof statusValue === 'string' && /(?:rejected|historical)/u.test(statusValue))
      .map(([key]) => normalized(key));
    const allRawHashes = new Set();
    const compositeRawHashes = new Set();
    for (const relativeRoot of roots) {
      for (const file of await imageFiles(path.join(root, relativeRoot))) {
        try {
          const rawHash = await rawPixelHash(file);
          allRawHashes.add(rawHash);
          const relativeFile = normalized(path.relative(root, file));
          if (/(?:^|\/)(?:outputs?|rendered)(?:\/|$)|contact|board|style-frame/iu.test(relativeFile)) compositeRawHashes.add(rawHash);
        } catch { /* non-decodable history is irrelevant */ }
      }
    }
    return {roots, allRawHashes, compositeRawHashes};
  })();
  forbiddenRootCache.set(root, promise);
  return promise;
}

async function historicalCompositeEvidence(root, familyId) {
  const manifestPath = HISTORICAL_MANIFEST[familyId];
  const manifest = await readJson(path.join(root, manifestPath));
  const paths = [...new Set((manifest.frames ?? []).flatMap((frame) => [frame.output, frame.mobile]).filter(Boolean).map(normalized))];
  if (manifest.contact?.path) paths.push(normalized(manifest.contact.path));
  const rawHashes = new Set();
  for (const relative of paths) {
    const absolute = path.join(root, relative);
    if (await exists(absolute)) rawHashes.add(await rawPixelHash(absolute));
  }
  return {manifestPath, paths: new Set(paths), rawHashes};
}

async function validateProvenance(input, root, label, must) {
  const provenance = input.asset_provenance ?? {};
  must(typeof input.asset_class === 'string' && input.asset_class.length > 0, `${label}: asset_class is required`);
  must(typeof provenance.origin === 'string' && typeof provenance.source_kind === 'string' && typeof provenance.source_id === 'string', `${label}: explicit asset provenance is required`);
  if (input.asset_class === 'person') {
    must(['real-or-official-source', 'imagegen-person'].includes(provenance.origin), `${label}: person origin must be real/official or imagegen-person`);
    if (provenance.origin === 'imagegen-person') must(provenance.identity_scope === 'fictional-generic' && provenance.ai_disclosure === true, `${label}: imagegen person must be fictional-generic with AI disclosure`);
  } else if (input.asset_class === 'omni-keyframe-plate') {
    must(provenance.origin === 'imagegen-keyframe-plate' && provenance.identity_scope === 'fictional-generic' && provenance.ai_disclosure === true && provenance.style_frame_qa_only === true, `${label}: Omni keyframe must be a disclosed fictional style-frame-QA plate`);
    const prompt = provenance.prompt ?? {};
    const promptFile = path.join(root, prompt.path ?? '');
    must(await exists(promptFile), `${label}: ImageGen prompt record missing`);
    if (await exists(promptFile)) must(prompt.sha256 === await shaFile(promptFile), `${label}: ImageGen prompt hash drift`);
  } else if (provenance.origin === 'deterministic-editorial') {
    must(provenance.deterministic === true && provenance.explanatory_overlay === true, `${label}: deterministic overlay flags are required`);
  } else {
    must(provenance.origin === 'real-or-official-source', `${label}: non-person visual must be real/official, source-derived, or a declared deterministic overlay`);
    must(typeof provenance.license === 'string' && provenance.license.length > 0, `${label}: real/source input license is required`);
  }
}

export async function validateFamilyManifest(manifest, {root = ROOT, grammar, forbiddenEvidence} = {}) {
  const errors = [];
  const must = (condition, message) => { if (!condition) errors.push(message); };
  if (!grammar) grammar = await readJson(path.join(root, GRAMMAR_REL));
  if (!forbiddenEvidence) forbiddenEvidence = await forbiddenRootEvidence(root);
  const historical = await historicalCompositeEvidence(root, manifest.family_id);
  const rendererSha = await shaFile(path.join(root, RENDERER_RECIPE_PATH));
  const approvedIds = new Set(grammar.approved_subset ?? []);
  const categoryById = new Map(CATEGORIES.flatMap((category) => (grammar.categories?.[category] ?? []).map((entry) => [entry.grammar_id, category])));
  must(manifest.schema_version === 4, 'schema_version must be 4');
  must(FAMILY_IDS.includes(manifest.family_id), 'unknown family_id');
  must(manifest.candidate_id === `${manifest.family_id}-v04`, 'candidate_id must be the canonical v04 ID');
  must(manifest.status === 'pending-user-style-frame-review', 'candidate must be pending user style-frame review');
  for (const field of ['production_visible', 'production_authority', 'user_style_frame_pass', 'user_cut_pass', 'rights_approved', 'omni_video_approved', 'stage_advanced']) must(manifest[field] === false, `${field} must be false`);
  must(manifest.builder?.path === 'video/scripts/build-episode-001-reference-style-gates-v04.mjs' && manifest.builder?.version === 4, 'canonical v04 builder binding is required');
  must(exact(manifest.renderer_recipe, {recipe_id: RENDERER_RECIPE_ID, path: RENDERER_RECIPE_PATH, sha256: rendererSha}), 'renderer/runtime recipe path/hash is stale');
  must(manifest.typography_surface_contract_version === 2 && manifest.layout_contract_version === 2, 'typography/layout contract v2 is required');
  must(manifest.reference_grammar_contract?.path === GRAMMAR_REL && manifest.reference_grammar_contract?.sha256 === await shaFile(path.join(root, GRAMMAR_REL)), 'reference grammar contract path/hash is stale');
  must(exact(manifest.reference_grammar_approval_marker, grammar.approval_marker), 'grammar approval marker binding drift');
  must(exact(manifest.reference_calibration_approval_marker, grammar.calibration_approval_marker), 'calibration approval marker binding drift');
  must(exact(manifest.representative_beats, BEATS), 'exact opening/evidence-or-change/final-summary beats are required');
  must(Array.isArray(manifest.frames) && manifest.frames.length === 3, 'exactly three representative frames are required');
  must(manifest.superseded_source_manifest?.path === HISTORICAL_MANIFEST[manifest.family_id] && manifest.superseded_source_manifest?.sha256 === await shaFile(path.join(root, HISTORICAL_MANIFEST[manifest.family_id])) && manifest.superseded_source_manifest?.used_as_render_input === false, 'historical source manifest must be observation-only with exact path/hash');

  const grammarRecord = manifest.reference_grammar ?? {};
  must(exact(grammarRecord.unmapped_visual_grammar, []), 'unmapped_visual_grammar must be []');
  must(exact(grammarRecord.novel_visual_grammar, []), 'novel_visual_grammar must be []');
  must(exact(grammarRecord.declared_actions, []) && exact(grammarRecord.declared_transitions, []) && exact(grammarRecord.declared_treatments, []), 'static style candidates cannot claim action, transition, or treatment runtime evidence');
  const manifestBindings = grammarRecord.bindings ?? [];
  must(manifestBindings.length > 0, 'free-text-only candidate: grammar bindings are empty');
  must(new Set(manifestBindings.map(rowKey)).size === manifestBindings.length, 'grammar bindings must be unique');
  for (const row of manifestBindings) {
    must(categoryById.get(row.grammar_id) === row.category, `unapproved or category-mismatched grammar ID ${row.grammar_id}`);
    must(approvedIds.has(row.grammar_id), `grammar ID ${row.grammar_id} is not in the approved contract subset`);
    must(CATEGORY_TARGET[row.category] === row.target_type, `${row.grammar_id} target type mismatch`);
  }
  const allInputs = [];
  const allFrameBindings = [];
  const allVisible = [];
  const allStructural = [];
  const allComplianceBindings = [];

  for (const [index, frame] of (manifest.frames ?? []).entries()) {
    const label = frame.frame_id ?? `frame-${index}`;
    must(frame.representative_beat === BEATS[index], `${label}: representative beat order drift`);
    must(frame.dominant_focal_kind === 'visual-input-asset' && frame.asset_text_substitution === false, `${label}: asset+explanatory-text focal substitution is forbidden`);
    must(Array.isArray(frame.inputs) && frame.inputs.length > 0, `${label}: exact visual inputs are required`);
    const inputIds = (frame.inputs ?? []).map((input) => input.asset_id);
    const inputSet = new Set(inputIds);
    must(inputSet.size === inputIds.length, `${label}: input asset IDs must be unique`);
    must(inputSet.has(frame.dominant_focal_asset_id), `${label}: the one focal must be an actual visual input`);
    must(!(frame.supporting_asset_ids ?? []).includes(frame.dominant_focal_asset_id), `${label}: focal cannot be supporting`);
    must(!(frame.hidden_asset_ids ?? []).includes(frame.dominant_focal_asset_id), `${label}: focal cannot be hidden`);
    must(exact(frame.declared_visible_components, inputIds), `${label}: declared visible components must exactly equal actual rendered input components`);
    const expectedStructural = inputIds.length > 1 ? [`scene:${label}`] : [];
    must(exact(frame.structural_grammar_targets, expectedStructural), `${label}: structural grammar targets must exactly describe the rendered scene relation`);
    const frameBindings = frame.reference_grammar_bindings ?? [];
    must(frameBindings.length > 0, `${label}: frame grammar bindings are required`);
    must(new Set(frameBindings.map(rowKey)).size === frameBindings.length, `${label}: duplicate frame grammar binding`);
    const visibleTargets = new Set(frame.declared_visible_components ?? []);
    const structuralTargets = new Set(frame.structural_grammar_targets ?? []);
    for (const row of frameBindings) {
      must(categoryById.get(row.grammar_id) === row.category, `unapproved or category-mismatched grammar ID ${row.grammar_id}`);
      must(approvedIds.has(row.grammar_id), `grammar ID ${row.grammar_id} is not in the approved contract subset`);
      must(CATEGORY_TARGET[row.category] === row.target_type, `${row.grammar_id} target type mismatch`);
      const targetAllowed = ['visual_object_role', 'text_surface_role'].includes(row.category) ? visibleTargets.has(row.target_id) : ['layout_relation', 'depth_occlusion'].includes(row.category) ? structuralTargets.has(row.target_id) : false;
      must(targetAllowed, `${label}: binding target ${row.target_id} is unmapped or belongs to the wrong target class`);
    }
    for (const input of frame.inputs ?? []) {
      const roleCount = frameBindings.filter((row) => row.category === 'visual_object_role' && row.target_id === input.asset_id).length;
      const textCount = frameBindings.filter((row) => row.category === 'text_surface_role' && row.target_id === input.asset_id).length;
      must(roleCount === 1, `${label}/${input.asset_id}: every visible component requires exactly one visual object-role binding`);
      must(textCount === (input.asset_class === 'document' ? 1 : 0), `${label}/${input.asset_id}: source-surface text binding coverage mismatch`);
    }
    for (const target of expectedStructural) {
      must(frameBindings.filter((row) => row.category === 'layout_relation' && row.target_id === target).length === 1, `${label}/${target}: exactly one layout binding is required`);
      must(frameBindings.filter((row) => row.category === 'depth_occlusion' && row.target_id === target).length === 1, `${label}/${target}: exactly one depth binding is required`);
    }
    const compliance = frame.compliance_only_components ?? [];
    const complianceIds = compliance.map((row) => row.component_id);
    must(compliance.length === 1 && compliance[0]?.component_id === `background:${label}` && compliance[0]?.exception_id === 'beige-checker-background' && compliance[0]?.generated_by_renderer === true && compliance[0]?.renderer_recipe_sha256 === rendererSha, `${label}: explicit renderer-bound compliance background is required`);
    must(complianceIds.every((id) => !visibleTargets.has(id) && !structuralTargets.has(id)), `${label}: compliance-only targets cannot masquerade as grammar targets`);
    const frameExceptions = frame.channel_exception_bindings ?? [];
    must(exact(frameExceptions, compliance.map((row) => ({exception_id: row.exception_id, target_type: 'compliance-layer', target_id: row.component_id}))), `${label}: compliance-only component and exception binding coverage must be exact`);
    allComplianceBindings.push(...frameExceptions);

    const recipe = frame.render_recipe ?? {};
    must(recipe.recipe_id === RENDERER_RECIPE_ID && recipe.renderer_sha256 === rendererSha && exact(recipe.canvas, {width: 1920, height: 1080}) && recipe.background_component_id === `background:${label}`, `${label}: exact renderer recipe binding is required`);
    const layers = recipe.layers ?? [];
    must(layers.length === inputIds.length && new Set(layers.map((row) => row.asset_id)).size === layers.length, `${label}: renderer layers must exhaustively equal inputs`);
    for (const input of frame.inputs ?? []) {
      const file = path.join(root, input.path ?? '');
      const normalizedPath = normalized(input.path);
      must(input.renderer_recipe_sha256 === rendererSha, `${label}/${input.asset_id}: input is not bound to the renderer recipe hash`);
      must(!forbiddenEvidence.roots.some((prohibited) => isWithin(normalizedPath, prohibited)), `${label}/${input.asset_id}: input is under production-state rejected/historical provisional root`);
      must(!historical.paths.has(normalizedPath), `${label}/${input.asset_id}: historical composite output cannot be a direct input`);
      must(await exists(file), `${label}/${input.asset_id}: input missing`);
      if (await exists(file)) {
        must(input.sha256 === await shaFile(file), `${label}/${input.asset_id}: input hash drift`);
        const rawHash = await rawPixelHash(file);
        const prohibitedPixels = manifest.family_id === 'omni-fiction-continuity' ? forbiddenEvidence.allRawHashes : forbiddenEvidence.compositeRawHashes;
        must(!prohibitedPixels.has(rawHash), `${label}/${input.asset_id}: input pixels duplicate a production-state rejected/historical provisional artifact`);
        must(!historical.rawHashes.has(rawHash), `${label}/${input.asset_id}: input pixels duplicate a historical composite even under a renamed path`);
      }
      await validateProvenance(input, root, `${label}/${input.asset_id}`, must);
      const matching = layers.filter((layer) => layer.asset_id === input.asset_id);
      must(matching.length === 1 && matching[0].path === input.path && matching[0].sha256 === input.sha256, `${label}/${input.asset_id}: renderer layer/input path or hash drift`);
      const geometry = frame.geometry?.assets?.find((asset) => asset.id === input.asset_id);
      must(geometry && exact(matching[0].bbox, geometry.bbox), `${label}/${input.asset_id}: renderer layer geometry drift`);
      allInputs.push({kind: 'visual-input', path: input.path, sha256: input.sha256});
    }
    for (const layer of layers) must(inputSet.has(layer.asset_id), `${label}/${layer.asset_id}: undeclared transitive renderer layer is forbidden`);

    try {
      const expected = await renderStyleFrameBuffers({root, frame});
      must(frame.output_sha256 === digest(expected.wide), `${label}: output is not reproducible from declared inputs and renderer recipe`);
      must(frame.mobile_sha256 === digest(expected.mobile), `${label}: mobile output is not reproducible from declared inputs and renderer recipe`);
    } catch (error) {
      must(false, `${label}: renderer replay failed: ${error.message}`);
    }
    for (const [kind, width, height] of [['output', 1920, 1080], ['mobile', 360, 203]]) {
      const file = path.join(root, frame[kind] ?? '');
      must(await exists(file), `${label}: ${kind} missing`);
      if (await exists(file)) {
        must(frame[`${kind}_sha256`] === await shaFile(file), `${label}: ${kind} hash drift`);
        must(exact(await dimensions(file), {width, height}), `${label}: ${kind} dimensions must be ${width}x${height}`);
        const rawHash = await rawPixelHash(file);
        must(!historical.rawHashes.has(rawHash) && !forbiddenEvidence.compositeRawHashes.has(rawHash), `${label}: rendered pixels duplicate a historical/rejected composite`);
      }
    }
    allFrameBindings.push(...frameBindings);
    allVisible.push(...frame.declared_visible_components);
    allStructural.push(...frame.structural_grammar_targets);
  }

  const expectedBindings = uniqueRows(allFrameBindings);
  must(exact(manifestBindings, expectedBindings), 'manifest bindings must exactly equal the exhaustive frame binding union');
  must(exact(grammarRecord.declared_visible_components, sorted(new Set(allVisible))), 'manifest declared visible components must exactly equal frame components');
  must(exact(grammarRecord.structural_grammar_targets, sorted(new Set(allStructural))), 'manifest structural grammar targets must exactly equal frame targets');
  const usedIds = sorted(new Set(manifestBindings.map((row) => row.grammar_id)));
  must(exact(grammarRecord.approved_subset, usedIds), 'manifest approved_subset must exactly equal unique used grammar IDs');
  must(!usedIds.some((id) => categoryById.get(id) === 'motion_operator' || categoryById.get(id) === 'transition_operator'), 'static candidate cannot present motion/transition grammar as visible proof');
  const expectedRows = [...new Map(allInputs.map((row) => [`${row.path}|${row.sha256}`, row])).values()];
  expectedRows.push({kind: 'renderer-recipe', path: RENDERER_RECIPE_PATH, sha256: rendererSha});
  expectedRows.sort((a, b) => `${a.kind}|${a.path}`.localeCompare(`${b.kind}|${b.path}`));
  must(exact(manifest.exact_input_bundle?.rows, expectedRows), 'exact input inventory drift');
  must(manifest.exact_input_bundle?.sha256 === bundleDigest(expectedRows), 'exact input bundle SHA drift');
  const boundaries = manifest.source_sample_boundaries ?? {};
  must(/presenter reconstruction forbidden/u.test(boundaries.sample08 ?? '') && /presenter reconstruction forbidden/u.test(boundaries.sample09 ?? ''), 'sample08/09 presenter reconstruction bans are required');
  must(boundaries.sample10 === 'excluded from motion grammar; source-video-selection only', 'sample10 source-video-selection exclusion must be exact');
  must(manifest.focal_policy?.exactly_one_visual_input_focal_per_beat === true && manifest.focal_policy?.asset_plus_explanatory_text_focal_substitution === false && manifest.focal_policy?.free_text_only_candidate === false, 'fail-closed focal policy is required');
  const exceptionBindings = manifest.channel_exceptions?.bindings ?? [];
  const expectedExceptions = uniqueRows(allComplianceBindings.map((row) => ({category: 'channel-exception', grammar_id: row.exception_id, ...row}))).map(({category, grammar_id, ...row}) => row);
  must(exact(exceptionBindings, expectedExceptions), 'manifest compliance exception bindings must exactly equal frame compliance components');
  const exceptionIds = exceptionBindings.map((row) => row.exception_id);
  must(exact(manifest.channel_exceptions?.approved_subset, sorted(new Set(exceptionIds))), 'channel exception approved_subset must exactly equal used IDs');
  must(exceptionIds.every((id) => ALLOWED_EXCEPTIONS.includes(id)), 'unknown channel exception');
  must(manifest.asset_origin_policy?.version === 1 && Array.isArray(manifest.asset_origin_policy?.inputs) && manifest.asset_origin_policy.inputs.length === allInputs.length, 'asset origin policy must exhaustively bind every frame input');
  return errors;
}

export async function validateGrammarBoundStyleFamiliesV04({root = ROOT} = {}) {
  const errors = [];
  const must = (condition, message) => { if (!condition) errors.push(message); };
  const [index, grammar, gates, state, blueprint, forbiddenEvidence] = await Promise.all([
    INDEX_REL, GRAMMAR_REL, GATES_REL, STATE_REL, BLUEPRINT_REL,
  ].map((item) => readJson(path.join(root, item))).concat(forbiddenRootEvidence(root)));
  const rendererSha = await shaFile(path.join(root, RENDERER_RECIPE_PATH));
  must(index.schema_version === 4 && index.candidate_set_id === 'episode-001-grammar-bound-six-family-v04', 'canonical v04 candidate set identity is required');
  must(index.status === 'pending-user-style-frame-review' && index.eligible_for_user_style_frame_review === true && index.user_approved === false && index.production_visible === false && index.production_authority === false, 'candidate set must be review-eligible but unapproved/non-production');
  must(exact(index.renderer_recipe, {recipe_id: RENDERER_RECIPE_ID, path: RENDERER_RECIPE_PATH, sha256: rendererSha}), 'candidate index renderer recipe drift');
  must(index.family_count === 6 && index.pending_families?.length === 6, 'exactly six pending families are required');
  must(exact(index.representative_beats, BEATS), 'candidate index representative beats drift');
  must(exact(index.reference_grammar_contract, {path: GRAMMAR_REL, sha256: await shaFile(path.join(root, GRAMMAR_REL))}), 'candidate index grammar hash drift');
  must(exact(index.unmapped_visual_grammar, []) && exact(index.novel_visual_grammar, []), 'candidate index grammar gaps must be empty');
  const used = [];
  for (const [position, row] of (index.pending_families ?? []).entries()) {
    must(row.family_id === FAMILY_IDS[position], `family order/identity drift at ${position}`);
    const expectedPath = `video/qa/style-frames/episode-001/reference-style-families-v04/${row.family_id}-v04/manifest.json`;
    must(row.path === expectedPath, `${row.family_id}: canonical manifest path required`);
    const file = path.join(root, row.path ?? '');
    must(await exists(file), `${row.family_id}: manifest missing`);
    if (!(await exists(file))) continue;
    must(row.sha256 === await shaFile(file), `${row.family_id}: manifest hash drift`);
    const manifest = await readJson(file);
    errors.push(...(await validateFamilyManifest(manifest, {root, grammar, forbiddenEvidence})).map((error) => `${row.family_id}: ${error}`));
    must(row.input_bundle_sha256 === manifest.exact_input_bundle?.sha256, `${row.family_id}: index input bundle drift`);
    must(exact(row.approved_subset, manifest.reference_grammar?.approved_subset), `${row.family_id}: index grammar subset drift`);
    must(exact(row.contact, manifest.contact), `${row.family_id}: contact binding drift`);
    used.push(...(manifest.reference_grammar?.bindings ?? []).map((binding) => binding.grammar_id));
  }
  must(exact(index.approved_subset, sorted(new Set(used))), 'candidate index approved_subset must exactly equal all used grammar IDs');
  const board = path.join(root, index.review_board?.path ?? '');
  must(await exists(board), 'six-family review board missing');
  if (await exists(board)) {
    must(index.review_board.sha256 === await shaFile(board), 'six-family review board hash drift');
    must(exact(await dimensions(board), index.review_board.dimensions), 'six-family review board dimensions drift');
  }
  must(index.static_to_playable_parity?.status === 'blocked-pre-style-pass' && index.static_to_playable_parity?.pass === false && index.full_motion_expansion_allowed === false && index.active_cut_root === null, 'style candidate set cannot grant playable/full-motion/active-root authority');
  must(gates.status === 'pending-user-style-frame-review' && gates.reference_calibration?.eligible_for_user_style_frame_review === true && exact(gates.reference_calibration?.blockers, []) && gates.reference_calibration?.next_gate === 'user-style-frame-review', 'reference style gate readiness drift');
  must(gates.visual_families?.length === 6 && gates.visual_families.every((family, indexValue) => family.family_id === FAMILY_IDS[indexValue] && family.status === 'pending-user-style-frame-review' && family.user_approved === false && family.approval_marker === null && family.approved_inputs_sha256 === null), 'six gate families must be pending and unapproved');
  for (const family of gates.visual_families ?? []) { const row = index.pending_families.find((item) => item.family_id === family.family_id); must(family.candidate_manifest === row?.path && family.candidate_manifest_sha256 === row?.sha256 && family.contact === row?.contact.path && family.contact_sha256 === row?.contact.sha256, `${family.family_id}: gate candidate binding drift`); }
  must(state.stage === 'timing-draft' && state.active_cut_root === null, 'production stage/root must remain locked');
  must(state.reference_calibration?.eligible_for_user_style_frame_review === true && state.style_frame_review?.status === 'pending-user-style-frame-review' && state.style_frame_review?.user_approved === false, 'production state style review readiness drift');
  must(state.reference_style_gates?.candidate_index === INDEX_REL && state.reference_style_gates?.candidate_index_sha256 === await shaFile(path.join(root, INDEX_REL)), 'production state candidate index hash drift');
  must(state.reference_style_gates?.contract_sha256 === await shaFile(path.join(root, GATES_REL)) && state.reference_style_gates?.cut_blueprint_sha256 === await shaFile(path.join(root, BLUEPRINT_REL)), 'production state gate/blueprint hash drift');
  must(blueprint.readiness === 'pending-family-style-review' && blueprint.status === 'reference-bound-cut-blueprint-pending-6-family-style-pass' && blueprint.cuts?.length === 48, '48-cut blueprint must be pending six-family style review');
  must(blueprint.cuts.every((cut) => cut.readiness === 'blocked-pending-user-family-style-pass' && cut.reference_family_status === 'pending-user-style-frame-review' && cut.full_motion_expansion_allowed === false), 'all blueprint cuts must remain blocked before family PASS');
  if (errors.length) throw new Error(`grammar-bound style family v04 invalid:\n- ${errors.join('\n- ')}`);
  return {families: 6, frames: 18, index_sha256: await shaFile(path.join(root, INDEX_REL)), board_sha256: index.review_board.sha256};
}

if (process.argv[1]?.endsWith('validate-grammar-bound-style-families-v04.mjs')) {
  if (process.argv.length !== 2) throw new Error('alternate candidate roots/arguments are unsupported');
  const result = await validateGrammarBoundStyleFamiliesV04();
  process.stdout.write(`grammar-bound style families v04 valid: ${result.families} families, ${result.frames} frames; pending explicit user style-frame review\n`);
}
