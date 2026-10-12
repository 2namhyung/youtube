import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProject, INFORMATION_DELTA_V14_CAPTION_PRESET, assertCaptionPresetMatchesTokens } from './production-lib.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const projectRoot = path.join(root, 'production', 'projects', 'jeju-school-intrusion-short-v1');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const projectPath = path.join(projectRoot, 'project-v15-transition-only.json');
const parentPath = path.join(projectRoot, 'project-v14-information-delta.json');
const contractPath = path.join(projectRoot, 'pipeline-contract-v15-transition-only.json');
const planPath = path.resolve(root, '..', 'comfyui-video', 'scene-motion-plan-v15-transition-only.json');
const tokensPath = path.join(root, 'production', 'templates', 'reference-v3.tokens.json');
for (const file of [projectPath, parentPath, contractPath, planPath, tokensPath]) if (!fs.existsSync(file)) throw new Error(`Missing v15 contract file: ${file}`);
const raw = read(projectPath); const parent = read(parentPath); const contract = read(contractPath); const plan = read(planPath); const tokens = read(tokensPath);
const project = validateProject(raw, projectRoot);
assertCaptionPresetMatchesTokens(project.captionPreset, tokens);
if (project.id !== 'jeju-school-intrusion-short-v1-v15-transition-only') throw new Error('v15 project id drift');
if (JSON.stringify(project.captionPreset) !== JSON.stringify(INFORMATION_DELTA_V14_CAPTION_PRESET)) throw new Error('v15 caption preset drift');
if (project.scenes.length !== 21 || plan.scenes.length !== 21) throw new Error('v15 must contain exactly 21 scenes');
for (const key of ['title', 'scriptSource', 'thumbnail', 'bgm', 'narration', 'releaseGate']) if (JSON.stringify(project[key]) !== JSON.stringify(parent[key])) throw new Error(`Locked field changed: ${key}`);
for (let index = 0; index < 21; index += 1) {
  const before = parent.scenes[index]; const after = project.scenes[index];
  if (after.captionAnchor !== before.captionAnchor || after.label !== before.label || after.asset !== before.asset) throw new Error(`Scene ${index + 1} content changed`);
  if (after.camera !== 'none' || after.intensity !== 0 || after.zoom !== 1) throw new Error(`Scene ${index + 1} camera motion is not disabled`);
}
const expected = Array.from({ length: 20 }, (_, index) => {
  const from = index + 1; const to = from + 1;
  if (from === 5) return [from, to, 'dip-to-black', 6];
  if (from === 13) return [from, to, 'slide-left', 8];
  if (from === 16) return [from, to, 'dip-to-black', 6];
  if (from === 19) return [from, to, 'slide-left', 8];
  return [from, to, 'hard-cut', 0];
});
if (JSON.stringify(project.transitionContract.boundaries.map(({ from, to, type, frames }) => [from, to, type, frames])) !== JSON.stringify(expected)) throw new Error('Transition boundary/type/frame allowlist drift');
if (contract.output.scenes !== 21 || contract.output.frames !== 1524 || contract.output.durationSeconds !== 50.8 || contract.output.width !== 1080 || contract.output.height !== 1920 || contract.output.fps !== 30) throw new Error('Output contract drift');
if (contract.camera.mode !== 'none' || contract.camera.intensity !== 0 || contract.camera.zoom !== 1 || contract.camera.allScenes !== true) throw new Error('Camera contract drift');
console.log(JSON.stringify({ status: 'pass', project: path.relative(root, projectPath), plan: path.relative(root, planPath), contract: path.relative(root, contractPath), output: contract.output, transitions: expected, camera: contract.camera, caption: 'v14 white text on opaque black box' }, null, 2));
