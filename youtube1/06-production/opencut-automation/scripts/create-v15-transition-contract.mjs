import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const automationRoot = path.dirname(scriptsRoot);
const projectRoot = path.join(automationRoot, 'production', 'projects', 'jeju-school-intrusion-short-v1');
const sourceProjectPath = path.join(projectRoot, 'project-v14-information-delta.json');
const sourcePlanPath = path.resolve(automationRoot, '..', 'comfyui-video', 'scene-motion-plan-v14-information-delta.json');
const sourceContractPath = path.join(projectRoot, 'pipeline-contract-v14-information-delta.json');
const projectPath = path.join(projectRoot, 'project-v15-transition-only.json');
const planPath = path.resolve(automationRoot, '..', 'comfyui-video', 'scene-motion-plan-v15-transition-only.json');
const contractPath = path.join(projectRoot, 'pipeline-contract-v15-transition-only.json');
const overwrite = process.argv.includes('--overwrite');
if (!overwrite && [projectPath, planPath, contractPath].some((file) => fs.existsSync(file))) throw new Error('Refusing to overwrite existing v15 contract; pass --overwrite intentionally');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const project = read(sourceProjectPath);
const plan = read(sourcePlanPath);
const parentContract = read(sourceContractPath);
if (project.scenes?.length !== 21 || plan.scenes?.length !== 21) throw new Error('v14 source must contain exactly 21 scenes');
for (const scene of project.scenes) { scene.camera = 'none'; scene.intensity = 0; scene.zoom = 1; scene.panX = 0.5; scene.panY = 0.5; }
project.id = 'jeju-school-intrusion-short-v1-v15-transition-only';
const specialTransitions = new Map([
  ['5-6', { type: 'dip-to-black', frames: 6, notes: 'A last 3 fade out, B first 3 fade in' }],
  ['13-14', { type: 'slide-left', frames: 8, notes: 'A full, A last frame + B first 8 slide, B first 8 removed from tail' }],
  ['16-17', { type: 'dip-to-black', frames: 6, notes: 'A last 3 fade out, B first 3 fade in' }],
  ['19-20', { type: 'slide-left', frames: 8, notes: 'A full, A last frame + B first 8 slide, B first 8 removed from tail' }],
]);
project.transitionContract = {
  mode: 'media-only',
  frameAccounting: 'preserve-scene-sum',
  boundaries: Array.from({ length: 20 }, (_, index) => {
    const from = index + 1; const to = from + 1; const special = specialTransitions.get(`${from}-${to}`);
    return special ? { from, to, ...special } : { from, to, type: 'hard-cut', frames: 0 };
  }),
};
plan.planId = 'jeju-school-intrusion-v15-transition-only';
plan.version = 15;
plan.status = 'transition-only-contract-locked-preview';
plan.contract = { ...plan.contract, outputProject: 'production/projects/jeju-school-intrusion-short-v1/project-v15-transition-only.json', pipelineContract: 'production/projects/jeju-school-intrusion-short-v1/pipeline-contract-v15-transition-only.json', transitionRule: 'FFmpeg transitions are media-region only; title, captions and AI disclosure remain fixed.' };
plan.scenes = plan.scenes.map((scene) => ({ ...scene, camera: 'none', intensity: 0, zoom: 1 }));
const contract = {
  contractId: 'jeju-school-intrusion-v15-transition-only', parentContract: parentContract.contractId, version: 15,
  purpose: 'v14 information-delta pipeline with explicit media-only FFmpeg transitions and exact frame preservation',
  output: { scenes: 21, frames: 1524, durationSeconds: 50.8, width: 1080, height: 1920, fps: 30 },
  lockedContent: { title: 'unchanged from v14', captions: { cueCount: 36, text: 'unchanged from v14', timing: 'unchanged from v14', style: 'white text on opaque black box' }, narration: 'unchanged from v14', bgm: 'unchanged from v14', disclosure: 'unchanged from v14' },
  camera: { mode: 'none', intensity: 0, zoom: 1, allScenes: true },
  transitionContract: project.transitionContract,
  scope: { transitions: 'media-region-only', overlays: 'title/captions/AI disclosure fixed', upload: 'blocked local preview only' },
};
fs.writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ projectPath, planPath, contractPath, output: contract.output, transitions: contract.transitionContract.boundaries }, null, 2));
