import {createHash} from 'node:crypto';
import {access, mkdir, readFile, readdir, realpath, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {runtimeSha256} from './visual-contract-v2.mjs';

export const ROOT = process.cwd();
export const STAGES = ['timing-draft', 'cut-previews-ready', 'cut-review-approved', 'provisional-video-ready', 'visual-review-approved', 'script-locked', 'final-voice-locked', 'audio-timed-assembly', 'picture-locked'];
export const REMOTION_CLI = path.resolve(ROOT, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
export const QA_ENTRY = path.resolve(ROOT, 'video', 'src', 'qa-index.tsx');

export const valueFor = (args, name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

export const exists = async (file) => { try { await access(file); return true; } catch { return false; } };
export const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
export const sha256File = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');

export async function loadProductionContext(args = process.argv.slice(2)) {
  const statePath = path.resolve(ROOT, valueFor(args, '--state', 'video/episodes/episode-001/production-state.json'));
  const state = await readJson(statePath);
  if (!/^episode-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(state.episode_id ?? '')) throw new Error('episode_id must be a safe lowercase episode slug');
  const stageIndex = STAGES.indexOf(state.stage);
  if (stageIndex < 0) throw new Error(`unknown production stage: ${state.stage}`);
  if (!state.active_cut_root) return {state, statePath, stageIndex, activeRoot: null, cuts: []};
  const activeRoot = path.resolve(ROOT, state.active_cut_root);
  const comparable = (value) => path.resolve(ROOT, value).replaceAll('\\', '/').replace(/\/$/u, '').toLowerCase();
  const activeRelative = comparable(activeRoot);
  const rejectedStatuses = new Set(['rejected-provisional-visual', 'historical-rejected-provisional-visual', 'historical-rejected-style-calibration', 'historical-viewer-quality-failure']);
  const rejected = Object.entries(state.provisional_artifacts ?? {}).some(([candidate, status]) => candidate !== 'note' && rejectedStatuses.has(status) && comparable(candidate) === activeRelative);
  if (rejected) throw new Error('active_cut_root cannot reference a rejected/provisional artifact');
  const publicRoot = path.resolve(ROOT, 'video/public');
  const [physicalActiveRoot, physicalPublicRoot] = await Promise.all([realpath(activeRoot), realpath(publicRoot)]);
  const relative = path.relative(physicalPublicRoot, physicalActiveRoot);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('active_cut_root must be inside video/public');
  const cutsRoot = path.join(activeRoot, 'cuts');
  const cuts = (await readdir(cutsRoot, {withFileTypes: true}))
    .filter((entry) => entry.isDirectory() && /^SH\d{3}$/u.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => ({shotId: entry.name, root: path.join(cutsRoot, entry.name)}));
  if (stageIndex >= STAGES.indexOf('cut-previews-ready') && cuts.length !== state.expected_cut_count) throw new Error(`active_cut_root must contain exactly ${state.expected_cut_count} cuts; found ${cuts.length}`);
  return {state, statePath, stageIndex, activeRoot, cuts};
}

export async function manifestInputFingerprint(cutRoot, manifest) {
  const rows = [];
  const canonicalManifest = structuredClone(manifest);
  if (canonicalManifest.runtime_contract) canonicalManifest.runtime_contract.runtime_sha256 = null;
  if (canonicalManifest.review_requirements) canonicalManifest.review_requirements.review_artifact_sha256 = null;
  if (canonicalManifest.approvals) for (const approval of Object.values(canonicalManifest.approvals)) {
    approval.status = 'pending'; approval.user_pass = false; approval.approval_marker = null; approval.approved_bundle_sha256 = null;
  }
  rows.push(`manifest|${createHash('sha256').update(JSON.stringify(canonicalManifest)).digest('hex')}`);
  const inputs = [
    ['background', 'background.png'],
    ...(manifest.assets ?? []).map((entry) => ['asset', entry.file]),
    ...(manifest.omni?.keyframes ?? []).map((entry) => ['keyframe', entry.file]),
    ...(manifest.effects ?? []).map((entry) => ['effect', entry.file]),
  ];
  for (const [kind, relative] of inputs) {
    const file = path.resolve(cutRoot, relative);
    if (!file.startsWith(`${path.resolve(cutRoot)}${path.sep}`) || !(await exists(file))) throw new Error(`${manifest.shot_id}: missing or unsafe ${kind} input ${relative}`);
    rows.push(`${kind}|${relative.replaceAll('\\', '/')}|${await sha256File(file)}`);
  }
  if (manifest.schema_version === 2 || manifest.schema_version === 3) rows.push(`runtime|${await runtimeSha256(ROOT)}`);
  rows.sort();
  return createHash('sha256').update(rows.join('\n')).digest('hex');
}

export async function writeRenderProps({outputRoot, shotId, manifest, cutBasePath, inputFingerprint, previewFrame}) {
  const propsRoot = path.join(outputRoot, '.props');
  await mkdir(propsRoot, {recursive: true});
  const file = path.join(propsRoot, `${shotId}.json`);
  await writeFile(file, `${JSON.stringify({manifest, cutBasePath, inputFingerprint, previewFrame}, null, 2)}\n`);
  return file;
}

export function remotionStillInvocation({entry = QA_ENTRY, composition, output, propsFile, scale}) {
  const args = [REMOTION_CLI, 'still', entry, composition, output, '--props', propsFile, '--config', path.resolve(ROOT, 'video/remotion.config.ts'), '--image-format', 'png', '--log', 'error'];
  if (scale) args.push('--scale', String(scale));
  return {command: process.execPath, args};
}

export function renderStill(options) {
  const invocation = remotionStillInvocation(options);
  const result = spawnSync(invocation.command, invocation.args, {cwd: ROOT, encoding: 'utf8', windowsHide: true, env: {...process.env, REMOTION_DISABLE_NETWORK: '1'}});
  if (result.status !== 0) throw new Error(`${options.composition} render failed for ${path.basename(options.output)}\n${result.stderr || result.stdout}`);
}

export function renderComposition({entry, composition, output}) {
  const args = [REMOTION_CLI, 'render', entry, composition, output, '--config', path.resolve(ROOT, 'video/remotion.config.ts'), '--codec', 'h264', '--log', 'error'];
  const result = spawnSync(process.execPath, args, {cwd: ROOT, encoding: 'utf8', windowsHide: true, env: {...process.env, REMOTION_DISABLE_NETWORK: '1'}});
  if (result.status !== 0) throw new Error(`${composition} full-duration preview failed\n${result.stderr || result.stdout}`);
}

export function runGateValidators(args = process.argv.slice(2)) {
  for (const relative of ['video/scripts/validate-cut-assets.mjs', 'video/scripts/validate-production-stage.mjs', 'video/scripts/validate-cut-visual-states.mjs']) {
    const result = spawnSync(process.execPath, [path.resolve(ROOT, relative), ...args], {cwd: ROOT, encoding: 'utf8', windowsHide: true});
    if (result.status !== 0) throw new Error(`${path.basename(relative)} blocked QA rendering\n${result.stderr || result.stdout}`);
  }
}

export const safeEpisodeId = (state) => {
  if (!/^episode-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(state?.episode_id ?? '')) throw new Error('unsafe episode_id');
  return state.episode_id;
};

export const publicCutBasePath = (cutRoot) => path.relative(path.resolve(ROOT, 'video/public'), cutRoot).replaceAll('\\', '/');
