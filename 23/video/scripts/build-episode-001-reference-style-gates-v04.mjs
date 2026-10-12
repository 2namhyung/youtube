import {createHash} from 'node:crypto';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
import {RENDERER_RECIPE_ID, RENDERER_RECIPE_PATH, renderStyleFrameBuffers} from './lib/grammar-bound-style-frame-renderer-v04.mjs';

const root = process.cwd();
const rel = (file) => path.relative(root, file).replaceAll('\\', '/');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const shaFile = async (file) => digest(await readFile(file));
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const writeJson = async (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const run = (file) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [file], {cwd: root, stdio: 'inherit'});
  child.on('error', reject);
  child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)));
});

const OUT_REL = 'video/qa/style-frames/episode-001/reference-style-families-v04';
const out = path.join(root, OUT_REL);
const gatesPath = path.join(root, 'video/episodes/episode-001/reference-style-gates.json');
const grammarPath = path.join(root, 'video/episodes/episode-001/reference-grammar-contract.json');
const statePath = path.join(root, 'video/episodes/episode-001/production-state.json');
const blueprintPath = path.join(root, 'video/episodes/episode-001/generated/reference-cut-blueprint.json');
const grammar = await readJson(grammarPath);
const grammarIds = new Set(grammar.approved_subset);
const grammarRecord = {path: rel(grammarPath), sha256: await shaFile(grammarPath)};
const rendererRecord = {recipe_id: RENDERER_RECIPE_ID, path: RENDERER_RECIPE_PATH, sha256: await shaFile(path.join(root, RENDERER_RECIPE_PATH))};
const promptPath = `${OUT_REL}/source-inputs/omni-fiction-continuity/prompts.md`;
const promptSha = await shaFile(path.join(root, promptPath));
const BEATS = ['opening', 'evidence-or-change', 'final-summary'];

const real = (source_kind, source_id, license, extra = {}) => ({origin: 'real-or-official-source', source_kind, source_id, license, rights_status: 'pending-human-review', ai_disclosure: false, ...extra});
const derived = (source_id, source_path, license = 'rights-review-pending') => real('source-derived-independent-asset', source_id, license, {source_path});
const deterministic = (source_id, source_path) => ({origin: 'deterministic-editorial', source_kind: 'deterministic-overlay', source_id, source_path, license: 'repository-authored-editorial-overlay', deterministic: true, explanatory_overlay: true, ai_disclosure: false});
const imagegen = (source_id, generated_file) => ({origin: 'imagegen-keyframe-plate', source_kind: 'built-in-imagegen-output', source_id, generated_file, prompt: {path: promptPath, sha256: promptSha}, identity_scope: 'fictional-generic', ai_disclosure: true, rights_status: 'pending-human-review', style_frame_qa_only: true});
const fictionalPerson = {origin: 'imagegen-person', source_kind: 'imagegen-person', source_id: 'SH006-PROSECUTOR-FICTIONAL-V01', identity_scope: 'fictional-generic', ai_disclosure: true, rights_status: 'pending-human-review'};

const ASSETS = {
  news1: ['video/source-intake/episode-001/news/news-yna-20260729-title-and-qa.png', 'document', real('registered-news-source', 'NEWS-YNA-20260729', 'editorial-use-rights-pending')],
  news2: ['video/source-intake/episode-001/news/news-yna-20260804-title-and-effective-date.png', 'document', real('registered-news-source', 'NEWS-YNA-20260804', 'editorial-use-rights-pending')],
  news3: ['video/source-intake/episode-001/news/news-ytn-20260804-title-and-one-month.png', 'document', real('registered-news-source', 'NEWS-YTN-20260804', 'editorial-use-rights-pending')],
  law196: ['video/source-intake/episode-001/official/law-196-delete.png', 'document', real('official-law-source', 'LAW-196-DELETE', 'official-source-rights-review-pending')],
  law1972: ['video/source-intake/episode-001/official/law-197-2-requirement-deadline.png', 'document', real('official-law-source', 'LAW-197-2-REQUIREMENT-DEADLINE', 'official-source-rights-review-pending')],
  lawRevision: ['video/source-intake/episode-001/official/law-revision-21857-full.png', 'document', real('official-law-source', 'LAW-REVISION-21857', 'official-source-rights-review-pending')],
  law90: ['video/source-intake/episode-001/official/law-trans-90-day.png', 'document', real('official-law-source', 'LAW-TRANS-90-DAY', 'official-source-rights-review-pending')],
  lawEffective: ['video/source-intake/episode-001/official/law-trans-effective-date.png', 'document', real('official-law-source', 'LAW-TRANS-EFFECTIVE-DATE', 'official-source-rights-review-pending')],
  chamber: ['video/source-intake/reference-calibration-v02/nara-house-chamber-1975.jpg', 'interior', real('public-domain-government-photo', 'NARA-HOUSE-CHAMBER-1975', 'public-domain')],
  kim: ['data/raw/assembly-media/14/naas-ATB59635-m-51.jpg', 'person', real('official-assembly-profile-photo', 'ASSEMBLY-PROFILE-ATB59635', 'official-profile-rights-review-pending', {identity_scope: 'named-real-person'})],
  park: ['data/raw/assembly-media/10/naas-6U243644-m-127.jpg', 'person', real('official-assembly-profile-photo', 'ASSEMBLY-PROFILE-6U243644', 'official-profile-rights-review-pending', {identity_scope: 'named-real-person'})],
  bill: ['video/source-intake/episode-001/official/bill-2220257-full.png', 'document', real('official-bill-source', 'BILL-2220257', 'official-source-rights-review-pending')],
  person: ['video/qa/production-assets/episode-001/SH006-person-imagegen-v01/derived/sh006-prosecutor-role-imagegen-clean-v01.png', 'person', fictionalPerson],
  dossier: ['video/qa/production-assets/episode-001/SH006-real-photo-v01/assets/sh006-dossier-real-photo.png', 'document', derived('PEXELS-DOSSIER-4792288', 'data/raw/pexels-media/102/photo/pexels-4792288.jpg')],
  current196: ['video/qa/style-frames/episode-001/SH006-editorial-v08/assets/sh006-current-article-196-evidence-view.png', 'document', derived('LAW-196-CURRENT-EVIDENCE-VIEW', 'video/public/assets/episode-001-work-v01/cuts/SH006/source-photo/sh006-source-authentication.png')],
  delete196: ['video/qa/style-frames/episode-001/SH006-editorial-v08/assets/sh006-article-196-deletion-evidence-view.png', 'document', derived('LAW-196-DELETION-EVIDENCE-VIEW', 'video/public/assets/episode-001-work-v01/cuts/SH006/source-photo/sh006-article-196-deletion.png')],
  retain195: ['video/qa/style-frames/episode-001/SH006-editorial-v08/assets/sh006-article-195-retained-evidence-view.png', 'document', derived('LAW-195-RETAINED-EVIDENCE-VIEW', 'video/public/assets/episode-001-work-v01/cuts/SH006/source-photo/sh006-article-195-retained.png')],
  route: ['video/qa/style-frames/episode-001/SH006-editorial-v08/assets/sh006-route-path.svg', 'path', deterministic('SH006-ROUTE-PATH-V08', 'video/qa/style-frames/episode-001/SH006-editorial-v08/manifest.json')],
  police: ['video/qa/production-assets/episode-001/SH006-real-photo-v01/assets/sh006-police-building-real-photo.png', 'building', derived('WIKIMEDIA-POLICE-3243833', 'data/raw/wikimedia/106/photo/wikimedia-3243833.jpg')],
  omniPayment: [`${OUT_REL}/source-inputs/omni-fiction-continuity/omni-payment-receipt-keyframe-v04.png`, 'omni-keyframe-plate', imagegen('OMNI-PAYMENT-RECEIPT-V04', 'exec-c1ceee71-8c65-4ca7-9d2b-e81a2a164986.png')],
  omniWrong: [`${OUT_REL}/source-inputs/omni-fiction-continuity/omni-wrong-item-keyframe-v04.png`, 'omni-keyframe-plate', imagegen('OMNI-WRONG-ITEM-V04', 'exec-b3ee4188-01c9-48b0-b1db-68b42e1b343e.png')],
  omniReport: [`${OUT_REL}/source-inputs/omni-fiction-continuity/omni-report-evidence-keyframe-v04.png`, 'omni-keyframe-plate', imagegen('OMNI-REPORT-EVIDENCE-V04', 'exec-5a02037d-a904-4c41-a045-415751c49d17.png')],
};

const L = (asset_id, asset, bbox, fit = 'contain', layer = 'foreground') => ({asset_id, asset, bbox, fit, layer});
const FAMILIES = [
  {id: 'hook-source-collage', supersedes: 'hook-source-collage-v03', historical: 'video/qa/style-frames/episode-001/reference-style-families-v03/hook-source-collage-v03/manifest.json', frames: [
    ['현재 보도와 공식 법률 근거를 한 화면에서 함께 확인한다.', 'headline-sheet', 'dominant-source-with-support', L('headline-sheet', 'news1', {left: 100, top: 180, width: 1220, height: 600}, 'cover'), L('official-law', 'law196', {left: 1390, top: 410, width: 420, height: 360}, 'contain', 'midground')],
    ['두 보도의 시점 차이가 변화의 순서를 만든다.', 'current-report', 'source-sheet-comparison', L('current-report', 'news2', {left: 110, top: 180, width: 1180, height: 650}, 'cover'), L('earlier-report', 'news1', {left: 1370, top: 420, width: 430, height: 330}, 'cover', 'midground')],
    ['보도와 법률 원문이 같은 결론을 교차 확인한다.', 'law', 'three-source-collage', L('report', 'news1', {left: 96, top: 330, width: 500, height: 430}, 'cover', 'midground'), L('law', 'law196', {left: 660, top: 150, width: 760, height: 680}), L('effective', 'news2', {left: 1440, top: 430, width: 384, height: 320}, 'cover', 'midground')],
  ]},
  {id: 'assembly-editorial', supersedes: 'assembly-editorial-v03', historical: 'video/qa/style-frames/episode-001/reference-style-families-v03/assembly-editorial-v03/manifest.json', frames: [
    ['본회의장이라는 실제 공간을 먼저 고정한다.', 'chamber-photo', 'persistent-source-environment', L('chamber-photo', 'chamber', {left: 80, top: 80, width: 1760, height: 920}, 'cover', 'background')],
    ['실제 회의장 맥락 위에 공식 인물 출처를 더한다.', 'kim-official', 'persistent-environment-person-addition', L('chamber-photo', 'chamber', {left: 80, top: 80, width: 1760, height: 920}, 'cover', 'background'), L('kim-official', 'kim', {left: 100, top: 240, width: 520, height: 698}, 'cover')],
    ['실제 인물과 공식 법안 원문이 회의장 맥락에서 결속된다.', 'official-bill', 'assembly-source-collage', L('chamber-photo', 'chamber', {left: 60, top: 70, width: 1800, height: 940}, 'cover', 'background'), L('kim-official', 'kim', {left: 96, top: 410, width: 380, height: 520}, 'cover', 'midground'), L('park-official', 'park', {left: 1444, top: 430, width: 380, height: 500}, 'cover', 'midground'), L('official-bill', 'bill', {left: 560, top: 150, width: 800, height: 760})],
  ]},
  {id: 'law-document-editorial', supersedes: 'SH006-editorial-v08', historical: 'video/qa/style-frames/episode-001/SH006-editorial-v08/manifest.json', frames: [
    ['가상 역할 인물보다 실제 사건파일 근거를 더 크게 본다.', 'dossier-real', 'person-and-evidence', L('person-fictional', 'person', {left: 160, top: 170, width: 480, height: 700}, 'contain', 'midground'), L('dossier-real', 'dossier', {left: 760, top: 130, width: 980, height: 760})],
    ['제196조의 현재 역할과 삭제 문구를 정확한 법률 표면으로 비교한다.', 'current-article-196', 'legal-source-comparison', L('current-article-196', 'current196', {left: 96, top: 120, width: 1120, height: 760}), L('deletion-article-196', 'delete196', {left: 1280, top: 300, width: 544, height: 420}, 'contain', 'midground')],
    ['남은 제195조 직무가 사람과 실제 기관 사이의 중심 근거다.', 'retained-article-195', 'legal-route-source-collage', L('route-path', 'route', {left: 80, top: 160, width: 1760, height: 760}, 'contain', 'background'), L('person-fictional', 'person', {left: 96, top: 548, width: 300, height: 390}, 'contain', 'midground'), L('police-building', 'police', {left: 1504, top: 548, width: 320, height: 390}, 'cover', 'midground'), L('retained-article-195', 'retain195', {left: 430, top: 100, width: 1060, height: 780})],
  ]},
  {id: 'omni-fiction-continuity', supersedes: 'omni-fiction-continuity-v03', historical: 'video/qa/style-frames/episode-001/reference-style-families-v03/omni-fiction-continuity-v03/manifest.json', frames: [
    ['가상의 생활 장면에서 결제 완료 증거를 확인한다.', 'payment-keyframe', 'omni-keyframe-plate', L('payment-keyframe', 'omniPayment', {left: 96, top: 72, width: 1728, height: 866}, 'cover')],
    ['가상의 생활 장면에서 주문과 실제 물건의 불일치를 본다.', 'wrong-item-keyframe', 'omni-keyframe-plate', L('wrong-item-keyframe', 'omniWrong', {left: 96, top: 72, width: 1728, height: 866}, 'cover')],
    ['가상의 인물이 영수증과 물건을 모아 신고 근거를 정리한다.', 'report-keyframe', 'omni-keyframe-plate', L('report-keyframe', 'omniReport', {left: 96, top: 72, width: 1728, height: 866}, 'cover')],
  ]},
  {id: 'process-route-editorial', supersedes: 'process-route-editorial-v03', historical: 'video/qa/style-frames/episode-001/reference-style-families-v03/process-route-editorial-v03/manifest.json', frames: [
    ['사건파일에서 법률 요청 문서로 절차가 이동한다.', 'request-law', 'evidence-to-request', L('dossier-real', 'dossier', {left: 100, top: 240, width: 700, height: 620}, 'contain', 'midground'), L('request-law', 'law1972', {left: 980, top: 170, width: 780, height: 730})],
    ['가상의 역할 인물과 실제 기관 사이에서 법률 문서가 중심 근거가 된다.', 'request-law', 'person-document-agency-route', L('person-fictional', 'person', {left: 96, top: 420, width: 340, height: 480}, 'contain', 'midground'), L('request-law', 'law1972', {left: 570, top: 130, width: 780, height: 760}), L('police-building', 'police', {left: 1474, top: 430, width: 350, height: 470}, 'cover', 'midground')],
    ['삭제된 근거와 남은 요구 절차를 실제 문서로 나란히 구분한다.', 'deleted-law', 'deleted-versus-retained-source-route', L('deleted-law', 'law196', {left: 96, top: 140, width: 800, height: 760}), L('retained-law', 'law1972', {left: 990, top: 140, width: 800, height: 760}, 'contain', 'midground')],
  ]},
  {id: 'time-data-editorial', supersedes: 'time-data-editorial-v03', historical: 'video/qa/style-frames/episode-001/reference-style-families-v03/time-data-editorial-v03/manifest.json', frames: [
    ['한 달이라는 기한을 보도와 공식 조문이 함께 고정한다.', 'one-month-news', 'time-source-pair', L('one-month-news', 'news3', {left: 96, top: 170, width: 1080, height: 700}, 'cover'), L('deadline-law', 'law1972', {left: 1224, top: 300, width: 600, height: 520}, 'contain', 'midground')],
    ['공포 시점과 시행일을 서로 다른 출처 표면으로 비교한다.', 'effective-date-news', 'date-source-comparison', L('promulgation-law', 'lawRevision', {left: 96, top: 170, width: 760, height: 720}, 'contain', 'midground'), L('effective-date-news', 'news2', {left: 914, top: 170, width: 910, height: 720}, 'cover')],
    ['시행일과 경과기간을 공식 조문 두 장으로 묶는다.', 'effective-law', 'official-time-range-pair', L('transition-law', 'law90', {left: 100, top: 170, width: 760, height: 720}, 'contain', 'midground'), L('effective-law', 'lawEffective', {left: 980, top: 150, width: 820, height: 760})],
  ]},
];

const binding = (category, grammar_id, target_id) => ({category, grammar_id, target_type: 'component', target_id});
const bindingKey = (row) => `${row.category}|${row.grammar_id}|${row.target_type}|${row.target_id}`;
const uniqueBindings = (rows) => [...new Map(rows.map((row) => [bindingKey(row), row])).values()];

await mkdir(out, {recursive: true});
const built = [];
for (const family of FAMILIES) {
  const familyDir = path.join(out, `${family.id}-v04`);
  const outputDir = path.join(familyDir, 'outputs');
  await rm(familyDir, {recursive: true, force: true});
  await mkdir(outputDir, {recursive: true});
  const frames = [];
  for (const [index, [takeaway, focal, template, ...layerSpecs]] of family.frames.entries()) {
    const beat = BEATS[index];
    const frameId = `${family.id}-${beat}-v04`;
    const widePath = path.join(outputDir, `${frameId}-1920x1080.png`);
    const mobilePath = path.join(outputDir, `${frameId}-360x203.png`);
    const inputs = [];
    const layers = [];
    const layerRoles = {background: [], midground: [], foreground: []};
    for (const [z_index, layer] of layerSpecs.entries()) {
      const [inputPath, asset_class, asset_provenance] = ASSETS[layer.asset];
      const inputSha = await shaFile(path.join(root, inputPath));
      inputs.push({asset_id: layer.asset_id, path: inputPath, sha256: inputSha, asset_class, asset_provenance, renderer_recipe_sha256: rendererRecord.sha256});
      layers.push({asset_id: layer.asset_id, path: inputPath, sha256: inputSha, bbox: layer.bbox, fit: layer.fit, z_index});
      layerRoles[layer.layer].push(layer.asset_id);
    }
    const sceneId = `scene:${frameId}`;
    const backgroundId = `background:${frameId}`;
    const visible = inputs.map((input) => input.asset_id);
    const structural = inputs.length > 1 ? [sceneId] : [];
    const bindings = [];
    for (const input of inputs) {
      const role = input.asset_id === focal ? 'dominant-concrete-focal' : input.asset_id === 'chamber-photo' ? 'persistent-editorial-background' : 'supporting-source-object';
      bindings.push(binding('visual_object_role', role, input.asset_id));
      if (input.asset_class === 'document') bindings.push(binding('text_surface_role', 'source-surface-text', input.asset_id));
    }
    if (structural.length) {
      bindings.push(binding('layout_relation', 'layered-collage', sceneId));
      bindings.push(binding('depth_occlusion', 'background-midground-foreground', sceneId));
    }
    const frame = {
      frame_id: frameId, representative_beat: beat, viewer_takeaway: takeaway, dominant_focal_asset_id: focal, dominant_focal_kind: 'visual-input-asset', asset_text_substitution: false,
      inputs,
      geometry: {assets: layers.map((layer) => ({
        id: layer.asset_id,
        bbox: layer.bbox,
        surface_rotation_deg: 0,
        baseline_group: `${frameId}-${layer.asset_id}-baseline`,
        ...(layerRoles.background.includes(layer.asset_id) ? {role: 'context', full_bleed: true} : {}),
      })), texts: [], connectors: [], intentional_overlaps: []},
      layer_roles: layerRoles, hidden_asset_ids: [], supporting_asset_ids: visible.filter((id) => id !== focal), layout_template: template,
      narration_window: {start_frame: 0, end_frame: 300}, stable_reading_hold_seconds: 2, required_review_dimensions: {wide: '1920x1080', mobile: '360x203'}, evidence_view: 'independent-source-composite',
      declared_visible_components: visible, structural_grammar_targets: structural,
      compliance_only_components: [{component_id: backgroundId, role: 'background', exception_id: 'beige-checker-background', generated_by_renderer: true, renderer_recipe_sha256: rendererRecord.sha256}],
      reference_grammar_bindings: uniqueBindings(bindings),
      channel_exception_bindings: [{exception_id: 'beige-checker-background', target_type: 'compliance-layer', target_id: backgroundId}],
      render_recipe: {recipe_id: RENDERER_RECIPE_ID, renderer_sha256: rendererRecord.sha256, canvas: {width: 1920, height: 1080}, background_component_id: backgroundId, layers},
      layout_contract_version: 2, editorial_contract_version: 3,
    };
    const rendered = await renderStyleFrameBuffers({root, frame});
    await writeFile(widePath, rendered.wide);
    await writeFile(mobilePath, rendered.mobile);
    Object.assign(frame, {output: rel(widePath), output_sha256: await shaFile(widePath), mobile: rel(mobilePath), mobile_sha256: await shaFile(mobilePath), dimensions: {width: 1920, height: 1080}});
    frames.push(frame);
  }
  const familyBindings = uniqueBindings(frames.flatMap((frame) => frame.reference_grammar_bindings));
  const usedIds = [...new Set(familyBindings.map((row) => row.grammar_id))].sort();
  if (usedIds.some((id) => !grammarIds.has(id))) throw new Error(`${family.id}: unapproved grammar ID`);
  const complianceBindings = uniqueBindings(frames.flatMap((frame) => frame.channel_exception_bindings.map((row) => ({category: 'channel-exception', grammar_id: row.exception_id, ...row})))).map(({category, grammar_id, ...row}) => row);
  const inputRows = [...new Map(frames.flatMap((frame) => frame.inputs.map((input) => [`${input.path}|${input.sha256}`, {kind: 'visual-input', path: input.path, sha256: input.sha256}])).map(([rowKey, value]) => [rowKey, value])).values()];
  inputRows.push({kind: 'renderer-recipe', path: rendererRecord.path, sha256: rendererRecord.sha256});
  inputRows.sort((a, b) => `${a.kind}|${a.path}`.localeCompare(`${b.kind}|${b.path}`));
  const contactPath = path.join(outputDir, `${family.id}-v04-contact-1920x520.png`);
  const thumbs = await Promise.all(frames.map((frame) => sharp(path.join(root, frame.output)).resize(560, 315).png().toBuffer()));
  await sharp({create: {width: 1920, height: 520, channels: 4, background: '#eee7da'}}).composite(thumbs.map((input, index) => ({input, left: 60 + index * 600, top: 110}))).png({compressionLevel: 9}).toFile(contactPath);
  const manifest = {
    schema_version: 4, episode_id: 'episode-001', family_id: family.id, candidate_id: `${family.id}-v04`, status: 'pending-user-style-frame-review', production_visible: false, production_authority: false, user_style_frame_pass: false, user_cut_pass: false, rights_approved: false, omni_video_approved: false, stage_advanced: false,
    supersedes_for_style_review: family.supersedes, superseded_source_manifest: {path: family.historical, sha256: await shaFile(path.join(root, family.historical)), authority: 'historical-non-production-observation-only', used_as_render_input: false},
    builder: {path: 'video/scripts/build-episode-001-reference-style-gates-v04.mjs', version: 4}, renderer_recipe: rendererRecord,
    review_profile: family.id === 'omni-fiction-continuity' ? 'omni-keyframe-input' : 'source-photo-treatment', representative_shots: [], representative_beats: BEATS,
    typography_surface_contract_version: 2, layout_contract_version: 2, layout_contract: {version: 2, authority: 'semantic-layout-before-coordinates', text_roles: ['asset-label', 'surface-content', 'screen-chrome'], unbound_explanatory_text_forbidden: true, asset_label_clearance_px: 32, asset_label_max_clearance_px: 72, same_row_asset_gap_px: 64, surface_rotation_match_tolerance_deg: 0.05}, editorial_contract_version: 3, typography_semantic_roles: {'asset-label': {allowed: true}, 'surface-content': {allowed: true}, 'screen-chrome': {allowed: true}},
    reference_grammar_contract: grammarRecord, reference_grammar_approval_marker: grammar.approval_marker, reference_calibration_approval_marker: grammar.calibration_approval_marker,
    reference_grammar: {declared_visible_components: [...new Set(frames.flatMap((frame) => frame.declared_visible_components))].sort(), structural_grammar_targets: [...new Set(frames.flatMap((frame) => frame.structural_grammar_targets))].sort(), declared_actions: [], declared_transitions: [], declared_treatments: [], bindings: familyBindings, approved_subset: usedIds, unmapped_visual_grammar: [], novel_visual_grammar: []},
    channel_exceptions: {approved_subset: [...new Set(complianceBindings.map((row) => row.exception_id))].sort(), bindings: complianceBindings},
    exact_input_bundle: {rows: inputRows, sha256: digest(Buffer.from(inputRows.map((row) => `${row.kind}|${row.path}|${row.sha256}`).join('\n')))},
    source_sample_boundaries: {sample08: 'presenter reconstruction forbidden; only non-person supporting overlays may transfer', sample09: 'presenter reconstruction forbidden; only phone, source-surface, and supporting assets may transfer', sample10: 'excluded from motion grammar; source-video-selection only'},
    focal_policy: {exactly_one_visual_input_focal_per_beat: true, asset_plus_explanatory_text_focal_substitution: false, free_text_only_candidate: false},
    asset_origin_policy: {version: 1, person_imagegen_allowed: true, non_person_source_required: true, deterministic_overlay_classes: ['path'], omni_keyframes_are_separate_route: true, production_asset_decomposition_complete: false, inputs: frames.flatMap((frame) => frame.inputs.map((input) => ({frame_id: frame.frame_id, asset_id: input.asset_id, asset_class: input.asset_class, asset_provenance: input.asset_provenance, path: input.path, sha256: input.sha256})))},
    reference_transfer: {reference_frames: frames.map((frame) => frame.frame_id), observed_grammar: usedIds, excluded_elements: ['historical composite pixels', 'unbound explanatory text', 'presenter reconstruction'], observed_grammar_ids: usedIds, historical_manifest: family.historical, historical_composite_pixels_used: false, subject_matter_substituted: true},
    reference_parity: {status: 'pending-user-style-frame-review', static_only: true, playable_parity: false, static_to_playable_parity: {pass: false}, motion_proof: {pass: false}},
    source_boundary: 'Every rendered pixel is reproducible from declared independent inputs and the hash-bound renderer recipe. Historical composites are observation-only.',
    frames, contact: {path: rel(contactPath), sha256: await shaFile(contactPath), dimensions: {width: 1920, height: 520}},
    prohibited_rules_post_cut_recheck: ['no-free-text-only-style-candidate', 'no-stale-reference-grammar-contract', 'no-historical-composite-render-input', 'no-rejected-provisional-root-input', 'no-sample08-or-09-presenter-reconstruction', 'no-sample10-motion-grammar-reuse', 'no-generated-legal-numeric-or-named-person-text', 'no-production-authority-before-user-style-pass'],
  };
  const manifestPath = path.join(familyDir, 'manifest.json');
  await writeJson(manifestPath, manifest);
  await writeFile(path.join(familyDir, 'README.md'), `# ${family.id} v04\n\nIndependent-input, grammar-bound style-frame candidate. Pending explicit user style-frame review; no motion, cut, Omni-video, rights, or production authority.\n`, 'utf8');
  built.push({family_id: family.id, candidate_id: `${family.id}-v04`, path: rel(manifestPath), sha256: await shaFile(manifestPath), contact: manifest.contact, input_bundle_sha256: manifest.exact_input_bundle.sha256, approved_subset: usedIds});
}

const boardPath = path.join(out, 'EP001-grammar-bound-six-family-review-board-v04.png');
const contacts = await Promise.all(built.map((row) => sharp(path.join(root, row.contact.path)).resize(1800, 488).png().toBuffer()));
await sharp({create: {width: 1920, height: 120 + contacts.length * 528, channels: 4, background: '#eee7da'}}).composite(contacts.map((input, index) => ({input, left: 60, top: 100 + index * 528}))).png({compressionLevel: 9}).toFile(boardPath);
const index = {schema_version: 4, episode_id: 'episode-001', candidate_set_id: 'episode-001-grammar-bound-six-family-v04', status: 'pending-user-style-frame-review', eligible_for_user_style_frame_review: true, user_approved: false, production_visible: false, production_authority: false, reference_grammar_contract: grammarRecord, reference_grammar_approval_marker: grammar.approval_marker, reference_calibration_approval_marker: grammar.calibration_approval_marker, renderer_recipe: rendererRecord, approved_subset: [...new Set(built.flatMap((row) => row.approved_subset))].sort(), unmapped_visual_grammar: [], novel_visual_grammar: [], family_count: 6, representative_beats: BEATS, pending_families: built, review_board: {path: rel(boardPath), sha256: await shaFile(boardPath), dimensions: {width: 1920, height: 120 + contacts.length * 528}}, static_to_playable_parity: {status: 'blocked-pre-style-pass', pass: false, parity_record: null}, full_motion_expansion_allowed: false, active_cut_root: null, sample10_policy: 'source-video-selection-only-excluded-from-motion-grammar'};
const indexPath = path.join(out, 'family-index.json');
await writeJson(indexPath, index);

const gates = await readJson(gatesPath);
gates.status = 'pending-user-style-frame-review';
Object.assign(gates.reference_calibration, {eligible_for_user_style_frame_review: true, blockers: [], next_gate: 'user-style-frame-review'});
for (const family of gates.visual_families) {
  const row = built.find((item) => item.family_id === family.family_id);
  Object.assign(family, {status: 'pending-user-style-frame-review', candidate_manifest: row.path, candidate_manifest_sha256: row.sha256, contact: row.contact.path, contact_sha256: row.contact.sha256, user_approved: false, approval_marker: null, approved_inputs_sha256: null, approval_marker_sha256: null});
}
await writeJson(gatesPath, gates);
await run('video/scripts/build-episode-001-reference-blueprint.mjs');

const state = await readJson(statePath);
state.reference_calibration = {...gates.reference_calibration, note: 'Corrected samples 01–09 and sample10 exclusion are approved. Six independently rendered grammar-bound candidates validate and are eligible for explicit user style-frame review; no style PASS or motion authority is granted.'};
state.style_frame_review = {status: 'pending-user-style-frame-review', candidate_id: index.candidate_set_id, representative_beats: BEATS, manifest: rel(indexPath), manifest_sha256: await shaFile(indexPath), user_approved: false, approval_marker: null, approval_marker_sha256: null, approved_inputs_sha256: null, production_asset_decomposition_status: 'blocked-pending-current-style-frame-pass', note: 'All six independent-input candidates are ready for explicit user style-frame review; full motion remains blocked.'};
Object.assign(state.reference_style_gates, {status: 'pending-6-family-user-review', contract: rel(gatesPath), contract_sha256: await shaFile(gatesPath), candidate_index: rel(indexPath), candidate_index_sha256: await shaFile(indexPath), cut_blueprint: rel(blueprintPath), cut_blueprint_sha256: await shaFile(blueprintPath), approved_family_ids: [], pending_family_ids: gates.visual_families.map((family) => family.family_id), all_family_style_pass_required_before_full_motion_expansion: true, note: 'Six exact independent-input, grammar-ID/hash-bound candidates await user style-frame review; no family is approved.'});
for (const section of ['generation_input_review', 'playable_cut_review', 'provisional_video', 'visual_review', 'final_script', 'final_voice', 'picture_lock']) state[section].status = 'blocked-pending-user-style-frame-review';
state.active_cut_root = null;
state.stage = 'timing-draft';
await writeJson(statePath, state);

console.log(JSON.stringify({index: rel(indexPath), index_sha256: await shaFile(indexPath), board: index.review_board, gate_sha256: await shaFile(gatesPath), blueprint_sha256: await shaFile(blueprintPath), families: built}, null, 2));
