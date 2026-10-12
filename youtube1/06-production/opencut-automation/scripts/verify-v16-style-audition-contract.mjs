import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const automationRoot = path.dirname(scriptsRoot);
const projectRoot = path.join(automationRoot, 'production', 'projects', 'jeju-school-intrusion-short-v1');
const manifestPath = path.join(projectRoot, 'style-audition-manifest-v16.json');
const contractPath = path.join(projectRoot, 'pipeline-contract-v16-style-audition.json');
const projectPath = path.join(projectRoot, 'project-v16-style-audition.json');
const requirePlaceholders = process.argv.includes('--require-placeholders');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
for (const file of [manifestPath, contractPath, projectPath]) if (!fs.existsSync(file)) throw new Error(`Missing v16 style-audition file: ${file}`);
const manifest = read(manifestPath); const contract = read(contractPath); const project = read(projectPath);
if (manifest.version !== 16 || contract.version !== 16) throw new Error('v16 version drift');
if (manifest.output.frames !== 308 || manifest.output.width !== 1080 || manifest.output.height !== 1920 || manifest.output.fps !== 30) throw new Error('Output geometry/frame contract drift');
if (Math.abs(manifest.output.durationSeconds - 308 / 30) > 1e-9) throw new Error('Duration must equal 308/30 seconds');
if (manifest.sourceWindow.sourceStartFrame !== 165 || manifest.sourceWindow.sourceEndFrameExclusive !== 473 || manifest.sourceWindow.frameCount !== 308) throw new Error('Source trim drift: expected frames 165..472');
const scenes = manifest.sourceWindow.scenes;
if (scenes.length !== 6 || scenes[0].startFrame !== 165 || scenes.at(-1).endFrame !== 473) throw new Error('Expected six scenes spanning source frames 165..473');
if (scenes.reduce((sum, scene) => sum + scene.frames, 0) !== 308) throw new Error('Scene frame sum must equal 308');
for (let i = 0; i < scenes.length; i += 1) {
  const scene = scenes[i];
  if (scene.endFrame - scene.startFrame !== scene.frames || Math.abs(scene.durationSeconds - scene.frames / 30) > 1e-9) throw new Error(`Scene timing drift: ${scene.id}`);
  if (i > 0 && scene.startFrame !== scenes[i - 1].endFrame) throw new Error(`Scene frame gap/overlap before ${scene.id}`);
}
const transition = manifest.transitionContract;
if (transition.mode !== 'media-only' || transition.boundaries.length !== 1) throw new Error('Only one media-only transition is allowed in the audition slice');
const [boundary] = transition.boundaries;
if (boundary.from !== 5 || boundary.to !== 6 || boundary.type !== 'dip-to-black' || boundary.frames !== 6) throw new Error('5->6 dip-to-black contract drift');
const styleIds = manifest.styles.map(({ id }) => id);
if (JSON.stringify(styleIds) !== JSON.stringify(['realistic', 'editorial-cartoon', 'premium-3d', 'cinematic-webtoon', 'paper-collage'])) throw new Error('Style allowlist/order drift');
if (contract.commonInvariants.independentVariable !== 'visual style only' || contract.scope.variableIsolation !== 'visual-style-only') throw new Error('Independent-variable isolation drift');
if (project.scenes.length !== 6 || project.output.frames !== 308 || project.transitionContract.boundaries[0].frames !== 6) throw new Error('Project scaffold drift');
if (JSON.stringify(project.scenes.map(({ id, sourceScene, startFrame, endFrame, frames }) => ({ id, sourceScene, startFrame, endFrame, frames }))) !== JSON.stringify(scenes.map(({ id, sourceScene, startFrame, endFrame, frames }) => ({ id, sourceScene, startFrame, endFrame, frames })))) throw new Error('Project scene timing does not match manifest');
const realistic = manifest.styles.find(({ id }) => id === 'realistic');
const realisticSource = realistic?.sourceVideo ? path.resolve(automationRoot, realistic.sourceVideo) : null;
if (!realisticSource || !fs.existsSync(realisticSource)) throw new Error(`Latest v15 realistic source not found: ${realisticSource}`);
const missingPlaceholders = [];
for (const style of manifest.styles.filter(({ id }) => id !== 'realistic')) {
  for (const scene of style.scenes) {
    const assetPath = path.resolve(projectRoot, scene.asset);
    const motionScene = scene.id === 'scene-06-next-morning-discovery';
    if (motionScene) {
      if (scene.placeholder !== false || scene.assetType !== 'motion-video' || !/\.(mp4|mov|webm)$/i.test(scene.asset)) throw new Error(`${style.id}/${scene.id} must be a non-placeholder motion-video asset`);
    } else if (scene.placeholder !== true || scene.assetType !== 'image' || !/\.(png|jpe?g)$/i.test(scene.asset)) {
      throw new Error(`${style.id}/${scene.id} must remain an image placeholder asset`);
    }
    if (!fs.existsSync(assetPath)) missingPlaceholders.push(path.relative(projectRoot, assetPath));
  }
}
if (requirePlaceholders && missingPlaceholders.length) throw new Error(`Missing style placeholders (${missingPlaceholders.length}); generate assets before rendering`);
console.log(JSON.stringify({ status: 'pass', manifest: path.relative(automationRoot, manifestPath), contract: path.relative(automationRoot, contractPath), project: path.relative(automationRoot, projectPath), realisticSource: path.relative(automationRoot, realisticSource), frameCount: 308, sceneFrames: scenes.map(({ id, frames }) => ({ id, frames })), styles: styleIds, missingPlaceholders: missingPlaceholders.length, placeholderCheck: requirePlaceholders ? 'required' : 'reported-only' }, null, 2));
