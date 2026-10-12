import {createHash} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import sharp from 'sharp';
import {
  CONTACT_HEIGHT,
  CONTACT_WIDTH,
  RENDERER_RECIPE_ID,
  RENDERER_RECIPE_PATH,
  renderBlockedContactBuffer,
  renderBoardBuffer,
  renderContactBuffer,
  renderStyleFrameBuffers,
} from './lib/grammar-bound-style-frame-renderer-v05.mjs';

const ROOT = process.cwd();
const INDEX_REL = 'video/qa/style-frames/episode-001/reference-style-families-v05/family-index.json';
const SPEC_REL = 'video/episodes/episode-001/episode-spec.json';
const GRAMMAR_REL = 'video/episodes/episode-001/reference-grammar-contract.json';
const OLD_INDEX_REL = 'video/qa/style-frames/episode-001/reference-style-families-v04/family-index.json';
const FAMILY_IDS = ['hook-source-collage', 'assembly-editorial', 'law-document-editorial', 'omni-fiction-continuity', 'process-route-editorial', 'time-data-editorial'];
const BUILT = ['hook-source-collage', 'law-document-editorial', 'process-route-editorial', 'time-data-editorial'];
const BLOCKED = ['assembly-editorial', 'omni-fiction-continuity'];
const BEATS = ['opening', 'evidence-or-change', 'final-summary'];
const SAMPLE_FAMILIES = {1: ['assembly-editorial', 'process-route-editorial'], 2: ['time-data-editorial'], 3: ['time-data-editorial'], 4: ['process-route-editorial'], 5: ['law-document-editorial'], 6: ['hook-source-collage'], 7: ['hook-source-collage'], 8: ['assembly-editorial'], 9: ['time-data-editorial']};
const SAMPLE_SHOTS = {1: ['SH003', 'SH047'], 2: ['SH040'], 3: ['SH040'], 4: ['SH047'], 5: ['SH006'], 6: ['SH001', 'SH005'], 7: ['SH001'], 8: ['SH003'], 9: ['SH040']};
const FAMILY_SHOTS = {
  'hook-source-collage': ['SH001', 'SH001', 'SH005'],
  'assembly-editorial': ['SH003', 'SH003', 'SH003'],
  'law-document-editorial': ['SH006', 'SH006', 'SH006'],
  'omni-fiction-continuity': ['SH008', 'SH011', 'SH014'],
  'process-route-editorial': ['SH047', 'SH047', 'SH047'],
  'time-data-editorial': ['SH040', 'SH040', 'SH040'],
};
const digest = (value) => createHash('sha256').update(value).digest('hex');
const stableDigest = (value) => digest(Buffer.from(JSON.stringify(value)));
const shaFile = async (file) => digest(await readFile(file));
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const exists = async (file) => { try { return (await stat(file)).isFile(); } catch { return false; } };
const exact = (actual, expected) => isDeepStrictEqual(actual, expected);
const sorted = (values) => [...values].sort();
const rel = (file) => path.relative(ROOT, file).replaceAll('\\', '/');
const timecode = (frame, fps) => {
  const seconds = frame / fps;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${(seconds % 60).toFixed(3).padStart(6, '0')}`;
};
const dims = async (file) => { try { const row = await sharp(file).metadata(); return {width: row.width, height: row.height}; } catch { return null; } };
const bundleDigest = (rows) => digest(Buffer.from(rows.map((row) => `${row.kind}|${row.path}|${row.sha256}`).join('\n')));

const validateShotBinding = (binding, shotId, shotMap, must, label) => {
  const cut = shotMap.get(shotId);
  must(Boolean(cut), `${label}: unknown representative shot ${shotId}`);
  if (!cut) return;
  must(exact(binding, {shot_id: shotId, production_mode: cut.production_mode, viewer_takeaway: cut.viewer_takeaway, cut_sha256: stableDigest(cut)}), `${label}: episode-spec shot binding drift`);
};

export async function validateFamilyManifest(manifest, {root = ROOT, index, spec, grammar} = {}) {
  const errors = [];
  const must = (condition, message) => { if (!condition) errors.push(message); };
  index ??= await readJson(path.join(root, INDEX_REL));
  spec ??= await readJson(path.join(root, SPEC_REL));
  grammar ??= await readJson(path.join(root, GRAMMAR_REL));
  const shotMap = new Map(spec.cuts.map((cut) => [cut.shot_id, cut]));
  const rendererHash = await shaFile(path.join(root, RENDERER_RECIPE_PATH));
  const expectedSamples = index.transfer_matrix.filter((row) => row.family_ids.includes(manifest.family_id));
  must(manifest.schema_version === 5, 'schema_version must be 5');
  must(FAMILY_IDS.includes(manifest.family_id), 'unknown family_id');
  must(manifest.candidate_id === `${manifest.family_id}-v05`, 'candidate_id must be canonical v05');
  must(manifest.eligible_for_user_style_frame_review === false, 'family review must remain blocked');
  for (const field of ['production_visible', 'production_authority', 'user_style_frame_pass', 'user_cut_pass', 'rights_approved', 'omni_video_approved', 'stage_advanced']) must(manifest[field] === false, `${field} must be false`);
  must(exact(manifest.episode_spec_binding, {path: SPEC_REL, sha256: await shaFile(path.join(root, SPEC_REL))}), 'episode-spec binding drift');
  must(exact(manifest.reference_grammar_contract, {path: GRAMMAR_REL, sha256: await shaFile(path.join(root, GRAMMAR_REL))}), 'grammar contract binding drift');
  must(exact(manifest.transfer_matrix_rows, expectedSamples), 'family transfer-matrix rows must exactly match the index');
  must(exact(manifest.transfer_matrix_sample_numbers, expectedSamples.map((row) => row.sample_number)), 'family sample-number binding drift');
  must(manifest.typography_surface_contract_version === 2 && manifest.layout_contract_version === 2, 'typography/layout v2 required');
  must(exact(manifest.representative_beats, BEATS), 'three state roles are required');
  must(exact(manifest.representative_shots?.map((row) => row.shot_id), FAMILY_SHOTS[manifest.family_id]), 'representative shot IDs drift');
  for (let i = 0; i < 3; i += 1) validateShotBinding(manifest.representative_shots?.[i], FAMILY_SHOTS[manifest.family_id][i], shotMap, must, `${manifest.family_id}/shot-${i}`);
  must(manifest.reference_parity?.static_only === true && manifest.reference_parity?.motion_proof === false && manifest.reference_parity?.playable_parity === false && manifest.reference_parity?.status === 'blocked-pre-style-pass', 'stills cannot claim motion/playable parity');
  must(exact(manifest.v04_history, index.v04_history) && manifest.v04_history?.used_as_render_input === false, 'v04 must be historical and unused');

  if (BUILT.includes(manifest.family_id)) {
    must(manifest.status === 'candidate-built-blocked-until-all-six-families-ready', 'built family status drift');
    must(manifest.review_profile === 'source-photo-treatment', 'built family review profile drift');
    must(manifest.frames?.length === 3, 'built family must have exactly three frames');
    const observedRows = new Map();
    const rawHashes = [];
    for (let i = 0; i < (manifest.frames ?? []).length; i += 1) {
      const frame = manifest.frames[i];
      const label = `${manifest.family_id}/${BEATS[i]}`;
      must(frame.representative_beat === BEATS[i], `${label}: state role drift`);
      validateShotBinding(frame.representative_shot, FAMILY_SHOTS[manifest.family_id][i], shotMap, must, label);
      must(frame.static_state_evidence_only === true && frame.motion_parity_claimed === false, `${label}: must be static state evidence only`);
      must(typeof frame.viewer_takeaway === 'string' && frame.viewer_takeaway.length > 0, `${label}: viewer takeaway missing`);
      must(frame.dominant_focal_kind === 'visual-input-asset' && frame.asset_text_substitution === false, `${label}: focal cannot be a text substitute`);
      must(frame.inputs?.some((input) => input.asset_id === frame.dominant_focal_asset_id), `${label}: focal must be an actual input`);
      must(exact(frame.declared_visible_components, frame.inputs.map((input) => input.asset_id)), `${label}: visible component list drift`);
      must(frame.planned_runtime_operator_refs?.length > 0, `${label}: future runtime transfer missing`);
      for (const operator of frame.planned_runtime_operator_refs ?? []) must(operator.status === 'planned-not-implemented', `${label}: still must not claim implemented runtime motion`);
      if (manifest.family_id === 'law-document-editorial' || (manifest.family_id === 'process-route-editorial' && frame.dominant_focal_asset_id === 'retained-law')) must(frame.source_locked_readability?.effective_font_px_1080 >= 72 && frame.source_locked_readability?.line_count <= 2, `${label}: legal focal must be >=72px and <=2 lines`);
      if (manifest.family_id === 'time-data-editorial') must(frame.source_locked_readability?.effective_font_px_1080 >= 72, `${label}: numeric focal readability missing`);
      for (const input of frame.inputs ?? []) {
        const absolute = path.join(root, input.path ?? '');
        must(await exists(absolute), `${label}: missing input ${input.path}`);
        if (await exists(absolute)) must(input.sha256 === await shaFile(absolute), `${label}: input hash drift ${input.path}`);
        must(input.renderer_recipe_sha256 === rendererHash, `${label}: renderer hash drift`);
        must(typeof input.asset_class === 'string' && input.asset_class.length > 0, `${label}: asset_class missing`);
        const provenance = input.asset_provenance ?? {};
        must(provenance.origin === 'real-or-official-source' && typeof provenance.source_kind === 'string' && typeof provenance.source_id === 'string' && typeof provenance.license === 'string' && provenance.rights_status === 'pending-human-review', `${label}: explicit non-invented pending-rights provenance required`);
        must(!input.path.includes('/reference-style-families-v04/'), `${label}: v04 composite cannot be an input`);
        must(!/news-(?:yna|full).*\.png$/iu.test(input.path) || input.path.includes('/source-inputs/'), `${label}: full-page source capture cannot be the readable focal`);
        observedRows.set(`${input.path}|${input.sha256}`, {kind: 'visual-input', path: input.path, sha256: input.sha256});
      }
      const wide = path.join(root, frame.output ?? '');
      const mobile = path.join(root, frame.mobile ?? '');
      must(exact(await dims(wide), {width: 1920, height: 1080}), `${label}: wide decode/dimensions invalid`);
      must(exact(await dims(mobile), {width: 360, height: 203}), `${label}: mobile decode/dimensions invalid`);
      if (await exists(wide)) must(frame.output_sha256 === await shaFile(wide), `${label}: wide hash drift`);
      if (await exists(mobile)) must(frame.mobile_sha256 === await shaFile(mobile), `${label}: mobile hash drift`);
      const replay = await renderStyleFrameBuffers({root, frame});
      must(frame.output_sha256 === digest(replay.wide), `${label}: wide renderer replay mismatch`);
      must(frame.mobile_sha256 === digest(replay.mobile), `${label}: mobile renderer replay mismatch`);
      rawHashes.push(await sharp(wide).ensureAlpha().raw().toBuffer().then(digest));
    }
    must(new Set(rawHashes).size === 3, `${manifest.family_id}: all three states must visibly differ`);
    const rows = [...observedRows.values()];
    rows.push({kind: 'renderer-recipe', path: RENDERER_RECIPE_PATH, sha256: rendererHash});
    rows.sort((a, b) => `${a.kind}|${a.path}`.localeCompare(`${b.kind}|${b.path}`));
    must(exact(manifest.exact_input_bundle?.rows, rows), `${manifest.family_id}: exact input bundle rows drift`);
    must(manifest.exact_input_bundle?.sha256 === bundleDigest(rows), `${manifest.family_id}: exact input bundle hash drift`);
    const contact = path.join(root, manifest.contact?.path ?? '');
    must(exact(await dims(contact), {width: CONTACT_WIDTH, height: CONTACT_HEIGHT}), `${manifest.family_id}: contact dimensions invalid`);
    must(exact(manifest.contact?.visible_labels, {family_id: manifest.family_id, states: BEATS}), `${manifest.family_id}: contact labels missing`);
    const replayContact = await renderContactBuffer({root, familyId: manifest.family_id, frames: manifest.frames});
    must(manifest.contact?.sha256 === digest(replayContact), `${manifest.family_id}: contact renderer replay mismatch`);
  } else {
    must(manifest.status === 'blocked-missing-required-source-inputs', 'blocked family status drift');
    must(exact(manifest.frames, []), 'blocked family cannot contain review frames');
    must(exact(manifest.exact_input_bundle, {rows: [], sha256: digest(Buffer.from(''))}), 'blocked family input bundle must be empty');
    must(manifest.blockers?.length >= 3, 'blocked family must name concrete blockers');
    for (const blocker of manifest.blockers ?? []) must(typeof blocker.blocker_id === 'string' && blocker.reason?.length > 0 && blocker.required_evidence?.length >= 3, 'blocked family blocker evidence incomplete');
    if (manifest.family_id === 'assembly-editorial') must(manifest.blockers.some((row) => /Korean National Assembly/u.test(row.reason)) && manifest.blockers.some((row) => /U\.S\. House.*forbidden/u.test(row.reason)), 'assembly must require Korean context and forbid the U.S. substitute');
    if (manifest.family_id === 'omni-fiction-continuity') {
      must(manifest.review_profile === 'omni-keyframe-input', 'Omni family must remain omni-keyframe-input');
      must(manifest.blockers.some((row) => /laptop payment.*wrong-item reveal.*police intake/u.test(row.reason)), 'Omni blocker must preserve SH008→SH011→SH014 continuity');
      must(!JSON.stringify(manifest).match(/omni-generated-motion|remotion-motion/iu), 'Omni blocked family cannot claim generated or Remotion motion');
    }
    const contact = path.join(root, manifest.contact?.path ?? '');
    must(exact(await dims(contact), {width: CONTACT_WIDTH, height: CONTACT_HEIGHT}), `${manifest.family_id}: blocked contact dimensions invalid`);
    must(exact(manifest.contact?.visible_labels, {family_id: manifest.family_id, states: ['BLOCKED — NOT A REVIEW SURFACE']}), `${manifest.family_id}: blocker label missing`);
    const replay = await renderBlockedContactBuffer({familyId: manifest.family_id, blockers: manifest.blockers.map((row) => row.reason)});
    must(manifest.contact?.sha256 === digest(replay), `${manifest.family_id}: blocked contact renderer replay mismatch`);
  }
  return errors;
}

export async function validateAll({root = ROOT} = {}) {
  const errors = [];
  const must = (condition, message) => { if (!condition) errors.push(message); };
  // v05 is an immutable historical audit. It intentionally does not consume the
  // current production gate/state/blueprint, whose schema and authority moved on.
  const [index, spec, grammar] = await Promise.all([INDEX_REL, SPEC_REL, GRAMMAR_REL].map((row) => readJson(path.join(root, row))));
  const shotMap = new Map(spec.cuts.map((cut) => [cut.shot_id, cut]));
  const rendererHash = await shaFile(path.join(root, RENDERER_RECIPE_PATH));
  must(index.schema_version === 5 && index.candidate_set_id === 'episode-001-transfer-bound-six-family-v05', 'canonical v05 index identity drift');
  must(index.status === 'blocked-pending-required-source-inputs' && index.eligible_for_user_style_frame_review === false && index.user_approved === false, 'v05 must remain fail-closed');
  must(index.production_visible === false && index.production_authority === false && index.active_cut_root === null, 'v05 cannot have production authority');
  must(exact(index.episode_spec_binding, {path: SPEC_REL, sha256: await shaFile(path.join(root, SPEC_REL))}), 'index episode-spec binding drift');
  must(exact(index.reference_grammar_contract, {path: GRAMMAR_REL, sha256: await shaFile(path.join(root, GRAMMAR_REL))}), 'index grammar binding drift');
  must(exact(index.renderer_recipe, {recipe_id: RENDERER_RECIPE_ID, path: RENDERER_RECIPE_PATH, sha256: rendererHash}), 'index renderer binding drift');
  must(index.v04_history?.path === OLD_INDEX_REL && index.v04_history?.sha256 === await shaFile(path.join(root, OLD_INDEX_REL)) && index.v04_history?.authority === 'historical-human-review-failed' && index.v04_history?.used_as_render_input === false, 'v04 history boundary drift');
  must(index.family_count === 6 && index.built_family_count === 4 && index.blocked_family_count === 2, 'family count summary drift');
  must(exact(index.families?.map((row) => row.family_id), FAMILY_IDS), 'six-family order/completeness drift');
  must(exact(index.sample_coverage, {required: [1,2,3,4,5,6,7,8,9], excluded: [10], mapped: [1,2,3,4,5,6,7,8,9]}), 'sample coverage must be exactly 01–09 with 10 excluded');
  must(index.sample10_policy?.review_profile === 'source-video-selection' && index.sample10_policy?.active_motion_bindings === 0 && index.sample10_policy?.excluded_from_style_motion_transfer === true, 'sample 10 exclusion drift');
  must(exact(index.transfer_matrix?.map((row) => row.sample_number), [1,2,3,4,5,6,7,8,9]), 'transfer matrix must contain each sample exactly once');

  for (const row of index.transfer_matrix ?? []) {
    const label = `sample-${String(row.sample_number).padStart(2, '0')}`;
    const contractFile = path.join(root, row.contract?.path ?? '');
    must(await exists(contractFile), `${label}: contract missing`);
    if (!(await exists(contractFile))) continue;
    const contract = await readJson(contractFile);
    must(row.contract.sha256 === await shaFile(contractFile) && row.contract.contract_id === contract.contract_id, `${label}: exact contract binding drift`);
    const source = contract.source_binding;
    const expectedLocator = {path: source.path, sha256: source.sha256, fps: source.fps, start_frame: source.window.start_frame, end_frame: source.window.end_frame, start_timecode: timecode(source.window.start_frame, source.fps), end_timecode: timecode(source.window.end_frame, source.fps)};
    must(exact(row.source_locator, expectedLocator), `${label}: source frame/timecode locator drift`);
    const sourceFile = path.join(root, source.path);
    must(await exists(sourceFile) && source.sha256 === await shaFile(sourceFile), `${label}: locked source byte binding drift`);
    must(row.exact_reference_stills?.length === 3, `${label}: three exact local reference stills required`);
    for (const still of row.exact_reference_stills ?? []) {
      const file = path.join(root, still.path ?? '');
      must(await exists(file), `${label}: local reference still missing`);
      if (await exists(file)) must(still.sha256 === await shaFile(file), `${label}: reference still hash drift`);
      must(still.source_frame >= source.window.start_frame && still.source_frame <= source.window.end_frame && still.timecode === timecode(still.source_frame, source.fps), `${label}: still frame/timecode outside exact locator`);
      must(!still.path.includes('/reference-style-families-v0'), `${label}: self-referential candidate frame is forbidden`);
    }
    const grammarIds = sorted([...new Set(grammar.bindings.filter((binding) => binding.sample_number === row.sample_number).map((binding) => binding.grammar_id))]);
    must(exact(row.approved_grammar_ids, grammarIds) && row.approved_grammar_ids.every((id) => grammar.approved_subset.includes(id)), `${label}: grammar ID mapping incomplete`);
    must(exact(row.family_ids, SAMPLE_FAMILIES[row.sample_number]), `${label}: family mapping drift`);
    must(exact(row.representative_shots?.map((binding) => binding.shot_id), SAMPLE_SHOTS[row.sample_number]), `${label}: representative shot mapping drift`);
    row.representative_shots?.forEach((binding, i) => validateShotBinding(binding, SAMPLE_SHOTS[row.sample_number][i], shotMap, must, label));
    must(exact(row.state_roles, BEATS), `${label}: state-role transfer incomplete`);
    must(row.future_runtime_operator_transfer?.length > 0 && row.future_runtime_operator_transfer.every((operator) => operator.status === 'planned-not-implemented' && row.approved_grammar_ids.includes(operator.grammar_id)), `${label}: grammar/operator transfer is incomplete or overclaimed`);
    must(row.static_state_evidence_only === true && row.motion_parity_claimed === false, `${label}: static stills cannot claim motion parity`);
    if (row.sample_number === 8) must(row.future_runtime_operator_transfer.every((operator) => /non-person/u.test(operator.target_scope)), `${label}: presenter reconstruction is forbidden`);
  }

  for (const familyRow of index.families ?? []) {
    const file = path.join(root, familyRow.path ?? '');
    must(await exists(file), `${familyRow.family_id}: manifest missing`);
    if (!(await exists(file))) continue;
    must(familyRow.sha256 === await shaFile(file), `${familyRow.family_id}: manifest hash drift`);
    const manifest = await readJson(file);
    errors.push(...await validateFamilyManifest(manifest, {root, index, spec, grammar}));
    must(exact(familyRow.representative_shot_ids, FAMILY_SHOTS[familyRow.family_id]), `${familyRow.family_id}: index shot binding drift`);
    must(familyRow.contact.sha256 === manifest.contact.sha256 && familyRow.contact.path === manifest.contact.path, `${familyRow.family_id}: index contact binding drift`);
  }
  const board = path.join(root, index.review_board?.path ?? '');
  must(exact(await dims(board), index.review_board?.dimensions), 'review board decode/dimensions invalid');
  must(exact(index.review_board?.visible_labels, {candidate_set_id: index.candidate_set_id, family_ids: FAMILY_IDS, states: BEATS, blocked_label: 'BLOCKED — NOT A REVIEW SURFACE'}), 'review board visible labels incomplete');
  must(index.review_board?.sha256 === digest(await renderBoardBuffer({root, rows: index.families})), 'review board renderer replay mismatch');
  must(index.review_board?.sha256 === await shaFile(board), 'review board byte hash drift');

  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (value) => value.slice(1)))) {
  const errors = await validateAll();
  if (errors.length > 0) {
    process.stderr.write(`${errors.map((error) => `- ${error}`).join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`${JSON.stringify({status: 'PASS', candidate_set: 'v05', families: 6, built: 4, blocked: 2, frames: 12, transfer_samples: 9, production_authority: false}, null, 2)}\n`);
  }
}
