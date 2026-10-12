import {createHash} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

export const ROOT = process.cwd();
export const CONTRACT_PATH = 'video/contracts/production-authoring-contract-v1.json';
export const EPISODE_SPEC_PATH = 'video/episodes/episode-001/episode-spec.json';
export const MANIFEST_CONTRACTS_PATH = 'video/episodes/episode-001/generated/manifest-contracts.json';
export const RENDER_CATALOG_PATH = 'video/episodes/episode-001/generated/render-catalog.json';
export const AUTHORING_ROUTE = 'episode-spec -> generated-manifest-contracts -> active-cut-manifests -> render-catalog -> EpisodeTimeline';
export const COVERAGE_DIMENSIONS = ['stage', 'focal', 'supporting', 'depth', 'entrance', 'internal-change', 'transition', 'hold', 'exclusions'];
export const NON_AUTHORITY_PATHS = [
  'video/scripts/production-qa.mjs',
  'video/src/qa-index.tsx',
  'video/src/motion-reverse-engineering-suite-v02-index.tsx',
  'video/src/style-calibration-index.tsx',
  'video/src/motion-reverse-engineering-suite-v01-index.tsx',
  'video/src/remotion-motion-grammar-v02-prototype-index.tsx',
  'video/src/remotion-motion-grammar-v02-sample-cuts-index.tsx',
  'video/src/sh006-vox-motion-calibration-index.tsx',
  'video/src/sh006-vox-motion-calibration-v04-index.tsx',
  'video/src/motion-reverse-engineering-pilot-v01-index.tsx',
];

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const sha256File = async (file) => sha256(await readFile(file));
const isSha256 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/iu.test(value);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonblank = (value) => typeof value === 'string' && value.trim().length > 0;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function isBlockedFootageFirstDraft(spec, state) {
  return ['ep001-live-action-footage-first-v1','ep001-source-first-semantic-v2','ep001-narrative-source-first-v3'].includes(spec?.editorial_revision?.id)
    && spec.editorial_revision?.production_authority === false
    && state?.stage === 'timing-draft'
    && state?.active_cut_root === null
    && state?.render_authority?.status === 'blocked-superseded-by-editorial-revision'
    && state?.render_authority?.production_authority === false
    && state?.render_authority?.cut_root === null
    && state?.render_authority?.catalog === null;
}

export function validateProductionAuthoringContract(contract) {
  const failures = [];
  const must = (condition, message) => { if (!condition) failures.push(message); };
  must(contract?.schema_version === 1, 'production authoring contract schema_version must be 1');
  must(contract?.contract_id === 'production-authoring-contract-v1', 'production authoring contract identity mismatch');
  must(contract?.episode_id === 'episode-001', 'production authoring contract is scoped to episode-001');
  const route = contract?.authority_route;
  must(route?.kind === 'sole-linear-authority', 'authority route must be sole-linear-authority');
  must(route?.route_expression === AUTHORING_ROUTE, 'authority route expression is not canonical');
  const steps = route?.steps ?? [];
  const expectedSteps = [
    ['episode-spec', EPISODE_SPEC_PATH, 'sole-manually-edited'],
    ['generated-manifest-contracts', MANIFEST_CONTRACTS_PATH, 'generated-only'],
    ['active-cut-manifests', 'production-state.active_cut_root/cuts/SH###/manifest.json', 'spec-bound-implementation-only'],
    ['render-catalog', RENDER_CATALOG_PATH, 'generated-only'],
    ['episode-timeline', 'video/src/vox/scene/EpisodeTimeline.tsx', 'runtime-consumer-only'],
  ];
  must(steps.length === expectedSteps.length, 'authority route must contain exactly five ordered steps');
  for (let index = 0; index < expectedSteps.length; index += 1) {
    const [id, file, policy] = expectedSteps[index];
    const actual = steps[index];
    must(actual?.id === id && actual?.path === file && actual?.edit_policy === policy, `authority route step ${index + 1} is invalid`);
  }
  must(route?.runtime_entrypoint === 'video/src/production-index.tsx', 'runtime entrypoint must be the catalog-backed production entrypoint');
  must(route?.manifest_generator === 'video/scripts/generate-episode-001-plans.mjs', 'manifest generator must be canonical');
  must(route?.scaffold_generator === 'video/scripts/new-cut.mjs', 'cut scaffold generator must be canonical');
  must(route?.catalog_generator === 'video/scripts/generate-render-catalog.mjs', 'catalog generator must be canonical');

  for (const section of ['visual_treatment', 'motion_contract', 'source_contract']) {
    const value = contract?.contract_separation?.[section];
    must(isObject(value) && nonblank(value.role), `contract separation ${section} must declare a role`);
    must(Array.isArray(value?.required_fields) && value.required_fields.length > 0, `contract separation ${section} must declare required fields`);
    must(Array.isArray(value?.must_not_contain) && value.must_not_contain.length > 0, `contract separation ${section} must declare exclusions`);
  }
  const matrix = contract?.coverage_matrix;
  must(Array.isArray(matrix?.dimensions) && same(matrix.dimensions, COVERAGE_DIMENSIONS), 'coverage matrix dimensions must be the canonical nine dimensions');
  must(isObject(matrix?.dimension_contract) && COVERAGE_DIMENSIONS.every((dimension) => nonblank(matrix.dimension_contract[dimension])), 'coverage matrix must define every dimension');
  must(Array.isArray(matrix?.coverage_statuses) && matrix.coverage_statuses.includes('planned') && matrix.coverage_statuses.includes('implemented'), 'coverage matrix statuses must include planned and implemented');
  must(matrix?.required_per_cut === true, 'coverage matrix must be required per cut');
  must(matrix?.reference_count_is_authority === false, 'reference count cannot be the coverage authority');
  must(contract?.manifest_declaration?.field === 'production_authoring_contract', 'manifest declaration field must be production_authoring_contract');
  must(contract?.manifest_declaration?.required_version === 1, 'manifest declaration version must be 1');
  must(same(contract?.manifest_declaration?.required_sections, ['visual_treatment', 'motion_contract', 'source_contract', 'coverage_matrix']), 'manifest declaration sections are incomplete');
  must(contract?.historical_policy?.active_cut_root_null_is_valid === true, 'active_cut_root=null must remain valid during draft');
  must(contract?.historical_policy?.historical_roots_are_non_production === true, 'historical roots must be non-production');
  must(contract?.historical_policy?.versioned_episode_ids_are_forbidden === true, 'versioned episode IDs must be forbidden');
  must(contract?.non_authority_routes?.package_command_prefix === 'video:qa:', 'non-authority package commands must use the video:qa: prefix');
  must(same(contract?.non_authority_routes?.blocked_as_production_authority, NON_AUTHORITY_PATHS), 'declared non-authority routes must match the frozen allowlist exactly');
  must(Array.isArray(contract?.non_authority_routes?.forbidden_ambiguous_command_prefixes) && contract.non_authority_routes.forbidden_ambiguous_command_prefixes.length > 0, 'ambiguous non-authority command prefixes must be declared');
  return failures;
}

function validateSection(section, required, label, failures) {
  if (!isObject(section)) { failures.push(`${label} must be an object`); return; }
  const present = (value) => nonblank(value) || (typeof value === 'number' && Number.isFinite(value)) || (Array.isArray(value) && value.length > 0) || (isObject(value) && Object.keys(value).length > 0);
  for (const key of required) if (!present(section[key])) failures.push(`${label}.${key} is required`);
}

export function validateManifestAuthoringDeclaration(manifest, options = {}) {
  const failures = [];
  const declaration = manifest?.production_authoring_contract;
  if (declaration === undefined || declaration === null) {
    if (options.requireDeclaration === true) failures.push(`${manifest?.shot_id ?? 'cut'}: production_authoring_contract is required for an active production candidate`);
    return failures;
  }
  const label = manifest?.shot_id ?? 'cut';
  if (!isObject(declaration)) return [`${label}: production_authoring_contract must be an object`];
  if (declaration.version !== 1) failures.push(`${label}: production_authoring_contract.version must be 1`);
  if (declaration.contract_path !== CONTRACT_PATH) failures.push(`${label}: production_authoring_contract.contract_path must point to the canonical contract`);
  if (declaration.route !== AUTHORING_ROUTE) failures.push(`${label}: production_authoring_contract.route must be the canonical single route`);
  if (declaration.episode_spec_path !== EPISODE_SPEC_PATH) failures.push(`${label}: episode_spec_path must point to episode-001 episode-spec.json`);
  if (declaration.generated_manifest_contracts_path !== MANIFEST_CONTRACTS_PATH) failures.push(`${label}: generated_manifest_contracts_path must point to the canonical generated contracts`);
  if (declaration.render_catalog_path !== RENDER_CATALOG_PATH) failures.push(`${label}: render_catalog_path must point to the canonical render catalog`);
  if (!isSha256(declaration.episode_spec_sha256)) failures.push(`${label}: episode_spec_sha256 must be a SHA-256`);
  if (!isSha256(declaration.generated_manifest_contracts_sha256)) failures.push(`${label}: generated_manifest_contracts_sha256 must be a SHA-256`);
  const cut = declaration.cut_contract;
  if (!isObject(cut) || cut.shot_id !== manifest.shot_id) failures.push(`${label}: cut_contract must bind the same shot_id`);
  for (const key of ['source_spec_sha256', 'source_cut_sha256', 'manifest_contract_sha256']) if (!isSha256(cut?.[key])) failures.push(`${label}: cut_contract.${key} must be a SHA-256`);
  for (const key of ['source_spec_sha256', 'source_cut_sha256', 'manifest_contract_sha256']) if (cut?.[key] !== manifest?.[key]) failures.push(`${label}: cut_contract.${key} must match the manifest top-level binding`);
  validateSection(declaration.visual_treatment, ['surface', 'palette', 'typography', 'texture', 'prohibited_treatments'], `${label}: visual_treatment`, failures);
  validateSection(declaration.motion_contract, ['target_asset_id', 'operator_id', 'start_frame', 'end_frame', 'state_delta', 'reading_hold'], `${label}: motion_contract`, failures);
  validateSection(declaration.source_contract, ['source_id', 'source_kind', 'locator', 'rights_status', 'materialization_status'], `${label}: source_contract`, failures);
  const sourceStatus = declaration.source_contract?.materialization_status;
  if (!['pending', 'materialized', 'blocked'].includes(sourceStatus)) failures.push(`${label}: source_contract.materialization_status is invalid`);
  if (sourceStatus === 'materialized' && !isSha256(declaration.source_contract?.sha256)) failures.push(`${label}: materialized source_contract.sha256 must be a SHA-256`);
  if (sourceStatus !== 'materialized' && declaration.source_contract?.sha256 !== null) failures.push(`${label}: non-materialized source_contract.sha256 must be null`);
  const matrix = declaration.coverage_matrix;
  if (!isObject(matrix)) failures.push(`${label}: coverage_matrix must be an object`);
  else {
    for (const dimension of COVERAGE_DIMENSIONS) {
      const item = matrix[dimension];
      if (!isObject(item)) failures.push(`${label}: coverage_matrix.${dimension} is required`);
      else {
        if (!['planned', 'implemented', 'blocked', 'not-applicable'].includes(item.status)) failures.push(`${label}: coverage_matrix.${dimension}.status is invalid`);
        if (!Array.isArray(item.evidence) || item.evidence.length === 0 || item.evidence.some((value) => !nonblank(value))) failures.push(`${label}: coverage_matrix.${dimension}.evidence is required`);
      }
    }
    for (const key of Object.keys(matrix)) if (key !== 'notes' && !COVERAGE_DIMENSIONS.includes(key)) failures.push(`${label}: coverage_matrix contains unknown dimension ${key}`);
  }
  if (options.episodeSpecSha256 && declaration.episode_spec_sha256 !== options.episodeSpecSha256) failures.push(`${label}: episode_spec_sha256 does not match local episode spec`);
  if (options.manifestContractsSha256 && declaration.generated_manifest_contracts_sha256 !== options.manifestContractsSha256) failures.push(`${label}: generated_manifest_contracts_sha256 does not match local generated contracts`);
  if (declaration.production_authority !== false) failures.push(`${label}: authoring declaration cannot grant production authority`);
  return failures;
}

async function readJson(root, relative, label, failures) {
  try { return JSON.parse(await readFile(path.resolve(root, relative), 'utf8')); }
  catch { failures.push(`${label}: missing or invalid JSON (${relative})`); return null; }
}

export async function validateCanonicalProductionAuthoring(options = {}) {
  const root = options.root ?? ROOT;
  const failures = [];
  const contract = options.contract ?? await readJson(root, CONTRACT_PATH, 'production authoring contract', failures);
  failures.push(...validateProductionAuthoringContract(contract));
  const spec = await readJson(root, EPISODE_SPEC_PATH, 'episode spec', failures);
  const contracts = await readJson(root, MANIFEST_CONTRACTS_PATH, 'generated manifest contracts', failures);
  const catalog = await readJson(root, RENDER_CATALOG_PATH, 'render catalog', failures);
  const state = await readJson(root, 'video/episodes/episode-001/production-state.json', 'production state', failures);
  const packageDocument = await readJson(root, 'package.json', 'package scripts', failures);
  const blockedFootageFirstDraft = isBlockedFootageFirstDraft(spec, state);
  let specHash = null, contractsHash = null;
  try { specHash = await sha256File(path.resolve(root, EPISODE_SPEC_PATH)); } catch {}
  try { contractsHash = await sha256File(path.resolve(root, MANIFEST_CONTRACTS_PATH)); } catch {}
  if (spec) {
    if (spec.episode_id !== 'episode-001' || spec.authority !== 'sole-manually-edited-episode-authority') failures.push('episode spec must be the sole manually edited episode-001 authority');
  }
  if (contracts) {
    if (contracts.episode_id !== 'episode-001' || contracts.schema_version !== 1) failures.push('generated manifest contracts identity/schema mismatch');
    if (specHash && contracts.source_spec_sha256 !== specHash) failures.push('generated manifest contracts are not bound to the local episode spec SHA-256');
    if (contracts._generated?.source !== 'episode-spec.json' || contracts._generated?.source_sha256 !== specHash) failures.push('generated manifest contracts marker is not bound to episode-spec.json');
    const ids = (contracts.cuts ?? []).map((cut) => cut.shot_id);
    if (new Set(ids).size !== ids.length || ids.some((id) => !/^SH\d{3}$/u.test(id))) failures.push('generated manifest contracts must contain unique canonical shot IDs');
  }
  if (catalog && !blockedFootageFirstDraft) {
    if (catalog.episode_id !== 'episode-001') failures.push('render catalog must be scoped to episode-001');
    if (catalog._generated?.generator !== 'video/scripts/generate-render-catalog.mjs') failures.push('render catalog must be generated by the canonical catalog generator');
    const contractIds = new Set((contracts?.cuts ?? []).map((cut) => cut.shot_id));
    for (const cut of catalog.cuts ?? []) {
      if (!contractIds.has(cut.shot_id)) failures.push(`render catalog cut ${cut.shot_id} has no generated manifest contract`);
      if (cut.manifest?.source_spec_sha256 !== specHash) failures.push(`render catalog cut ${cut.shot_id} is not spec-bound`);
    }
  }
  if (state) {
    if (state.episode_id !== 'episode-001') failures.push('production state must be scoped to episode-001');
    if (state.active_cut_root !== null && state.active_cut_root !== undefined && state.active_cut_root !== state.render_authority?.cut_root) failures.push('active_cut_root must be promoted only from the canonical render-authority root');
    if (blockedFootageFirstDraft) {
      const superseded = state.superseded_render_authorities ?? [];
      if (!superseded.some((authority) => authority.catalog === RENDER_CATALOG_PATH
        && authority.production_authority === false)) failures.push('blocked editorial draft must preserve the stale catalog only as superseded non-production history');
    } else if (state.render_authority?.catalog !== RENDER_CATALOG_PATH) failures.push('production state render authority must point to the canonical render catalog');
    if (state.draft_inputs?.episode_spec !== EPISODE_SPEC_PATH || (specHash && state.draft_inputs?.episode_spec_sha256 !== specHash)) failures.push('production state draft input is not bound to episode-spec.json');
  }
  if (packageDocument) {
    const scripts = packageDocument.scripts ?? {};
    for (const prefix of contract?.non_authority_routes?.forbidden_ambiguous_command_prefixes ?? []) {
      for (const name of Object.keys(scripts)) if (name.startsWith(prefix)) failures.push(`ambiguous non-authority package command must be moved under video:qa:: ${name}`);
    }
    const check = scripts.check ?? '';
    for (const command of ['video:validate-production-authoring-contract', 'video:validate-reference-style-gates', 'video:qa:validate-motion-reverse-review-v02']) {
      const occurrences = check.split(command).length - 1;
      if (occurrences !== 1) failures.push(`canonical check must include ${command} exactly once`);
    }
    const commandByTarget = new Map();
    for (const [name, target] of Object.entries(scripts)) {
      if (!name.startsWith('video:qa:')) continue;
      if (commandByTarget.has(target)) failures.push(`duplicate QA command target: ${commandByTarget.get(target)} and ${name}`);
      else commandByTarget.set(target, name);
      const targetPath = String(target).match(/\b(video\/(?:scripts|src)\/[^\s"']+\.(?:mjs|tsx|ts))\b/u)?.[1];
      if (!targetPath) failures.push(`${name}: QA command must expose one local script or entrypoint for authority scanning`);
      else {
        failures.push(...await validateNonAuthorityGraph(root, targetPath));
      }
    }
  }
  for (const relative of contract?.non_authority_routes?.blocked_as_production_authority ?? []) {
    failures.push(...await validateNonAuthorityGraph(root, relative));
  }
  const source = async (relative) => { try { return await readFile(path.resolve(root, relative), 'utf8'); } catch { failures.push(`route source missing: ${relative}`); return ''; } };
  const [timeline, runtimeEntry, rootEntry, qa] = await Promise.all([
    source('video/src/vox/scene/EpisodeTimeline.tsx'),
    source('video/src/production-index.tsx'),
    source('video/src/index.tsx'),
    source('video/scripts/production-qa.mjs'),
  ]);
  if (!timeline.includes('ManifestScene') || !timeline.includes('TransitionPair')) failures.push('EpisodeTimeline must be the sole scene/transition runtime consumer');
  if (!runtimeEntry.includes("./generated/render-authority-catalog") || !runtimeEntry.includes('EpisodeTimeline')) failures.push('canonical runtime entrypoint must consume generated render catalog and EpisodeTimeline');
  if (rootEntry.includes('render-authority-catalog') || rootEntry.includes('EpisodeTimeline')) failures.push('default Remotion entrypoint must not become a second production authority');
  if (qa.includes('registerRoot') || qa.includes('render-authority-catalog')) failures.push('production QA launcher cannot become a production render authority');
  return {ok: failures.length === 0, failures, spec_sha256: specHash, manifest_contracts_sha256: contractsHash, route: AUTHORING_ROUTE};
}

async function readJsonOrText(root, relative, failures) {
  try { return await readFile(path.resolve(root, relative), 'utf8'); }
  catch { failures.push(`declared non-authority route is missing: ${relative}`); return null; }
}

export function validateNonAuthoritySource(relative, source) {
  const failures = [];
  const sourceFile = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, relative.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.JS);
  const propertyName = (node) => ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node) ? node.text : null;
  const assignedName = (node) => {
    if (ts.isIdentifier(node)) return node.text;
    if (ts.isPropertyAccessExpression(node)) return node.name.text;
    if (ts.isElementAccessExpression(node) && node.argumentExpression && (ts.isStringLiteral(node.argumentExpression) || ts.isIdentifier(node.argumentExpression))) return node.argumentExpression.text;
    return null;
  };
  const protectedApprovalFields = new Set(['production_authority', 'user_pass', 'all_cuts_passed', 'user_approved']);
  const mutationCalls = new Set(['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'rename', 'renameSync', 'copyFile', 'copyFileSync', 'rm', 'rmSync', 'unlink', 'unlinkSync', 'truncate', 'truncateSync']);
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === 'EpisodeTimeline') failures.push(`${relative}: non-authority route cannot consume EpisodeTimeline`);
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (specifier.includes('render-authority-catalog')) failures.push(`${relative}: non-authority route cannot consume the production render catalog`);
      if (specifier.includes('EpisodeTimeline')) failures.push(`${relative}: non-authority route cannot consume EpisodeTimeline`);
    }
    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (name === 'active_cut_root' && node.initializer.kind !== ts.SyntaxKind.NullKeyword) failures.push(`${relative}: non-authority route cannot select a non-null active_cut_root`);
      if (protectedApprovalFields.has(name) && node.initializer.kind === ts.SyntaxKind.TrueKeyword) failures.push(`${relative}: non-authority route cannot grant ${name}`);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const name = assignedName(node.left);
      if (name === 'active_cut_root' && node.right.kind !== ts.SyntaxKind.NullKeyword) failures.push(`${relative}: non-authority route cannot select a non-null active_cut_root`);
      if (protectedApprovalFields.has(name) && node.right.kind === ts.SyntaxKind.TrueKeyword) failures.push(`${relative}: non-authority route cannot grant ${name}`);
    }
    if (ts.isCallExpression(node)) {
      const name = assignedName(node.expression);
      if (mutationCalls.has(name)) {
        const destination = node.arguments[0]?.getText(sourceFile) ?? '';
        if (/production-state\.json|render-catalog\.json|episode-spec\.json/u.test(destination) || /(?:production.*state|state.*path|render.*catalog|catalog.*path|episode.*spec|spec.*path|active.*root)/iu.test(destination)) {
          failures.push(`${relative}: non-authority route cannot mutate a protected production authority path (${destination})`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return failures;
}

async function validateNonAuthorityGraph(root, entry) {
  const failures = [];
  const visited = new Set();
  const extensions = ['', '.mjs', '.js', '.ts', '.tsx', '/index.mjs', '/index.js', '/index.ts', '/index.tsx'];
  const walk = async (relative) => {
    const normalized = relative.replaceAll('\\', '/');
    if (visited.has(normalized)) return;
    visited.add(normalized);
    let source;
    try { source = await readFile(path.resolve(root, normalized), 'utf8'); }
    catch { failures.push(`declared non-authority route is missing: ${normalized}`); return; }
    failures.push(...validateNonAuthoritySource(normalized, source));
    const ast = ts.createSourceFile(normalized, source, ts.ScriptTarget.Latest, true, normalized.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.JS);
    const imports = [];
    ast.forEachChild((node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith('.')) imports.push(node.moduleSpecifier.text);
    });
    for (const specifier of imports) {
      const base = path.resolve(root, path.dirname(normalized), specifier);
      let resolved = null;
      for (const suffix of extensions) {
        const candidate = `${base}${suffix}`;
        try { if ((await stat(candidate)).isFile()) { resolved = candidate; break; } } catch {}
      }
      if (resolved) await walk(path.relative(root, resolved));
    }
  };
  await walk(entry);
  return [...new Set(failures)];
}

export const validateSingleAuthoringRoute = validateCanonicalProductionAuthoring;
