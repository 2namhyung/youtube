import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const automationRoot = path.dirname(scriptsRoot);
const projectRoot = path.join(automationRoot, 'production', 'projects', 'jeju-school-intrusion-short-v1');
const assetsRoot = path.join(projectRoot, 'assets', 'style-audition-v16');
const contractPath = path.join(projectRoot, 'pipeline-contract-v16-style-audition.json');
const manifestPath = path.join(projectRoot, 'style-audition-manifest-v16.json');
const projectPath = path.join(projectRoot, 'project-v16-style-audition.json');
const overwrite = process.argv.includes('--overwrite');
if (!overwrite && [contractPath, manifestPath, projectPath].some((file) => fs.existsSync(file))) {
  throw new Error('Refusing to overwrite existing v16 style-audition files; pass --overwrite intentionally');
}

const scenes = [
  { id: 'scene-04-school-exterior', sourceScene: 4, startFrame: 165, endFrame: 213, frames: 48, durationSeconds: 1.6, description: 'school exterior, empty campus approach' },
  { id: 'scene-05-threshold', sourceScene: 5, startFrame: 213, endFrame: 268, frames: 55, durationSeconds: 55 / 30, description: 'classroom threshold and doorway' },
  { id: 'scene-06-next-morning-discovery', sourceScene: 6, startFrame: 268, endFrame: 326, frames: 58, durationSeconds: 58 / 30, description: 'next-morning discovery motion, object-focused' },
  { id: 'scene-07-tumbler', sourceScene: 7, startFrame: 326, endFrame: 385, frames: 59, durationSeconds: 59 / 30, description: 'sealed tumbler evidence on a desk' },
  { id: 'scene-08-tumbler-interior', sourceScene: 8, startFrame: 385, endFrame: 428, frames: 43, durationSeconds: 43 / 30, description: 'tumbler interior, non-graphic evidence detail' },
  { id: 'scene-09-classroom-aisle', sourceScene: 9, startFrame: 428, endFrame: 473, frames: 45, durationSeconds: 1.5, description: 'empty classroom aisle, adult teacher rear view only' },
];

const styleSpecs = [
  { id: 'realistic', label: 'Realistic (v15 reference)', mode: 'source-trim', sourceVideo: 'out/.private/jeju-school-intrusion-short-v1-v15-transition-only/jeju-school-intrusion-short-v1-v15-transition-only-msg0z1pv-29380-dish8l.mp4', prompt: 'Use the latest v15 realistic render; exact frame trim only.' },
  { id: 'editorial-cartoon', label: 'Editorial cartoon', mode: 'scene-assets', prompt: 'Editorial newspaper cartoon, restrained ink and flat color, clear silhouettes, serious investigative tone.' },
  { id: 'premium-3d', label: 'Premium 3D', mode: 'scene-assets', prompt: 'Premium stylized 3D illustration, soft cinematic materials, controlled depth of field, no toy-like exaggeration.' },
  { id: 'cinematic-webtoon', label: 'Cinematic webtoon', mode: 'scene-assets', prompt: 'Cinematic Korean webtoon panels, clean linework, dramatic but restrained lighting, adult rear-view teacher only.' },
  { id: 'paper-collage', label: 'Paper collage', mode: 'scene-assets', prompt: 'Tactile paper collage with layered cut paper, documentary evidence-board mood, legible shapes without text.' },
];
const assetFileNames = {
  'scene-04-school-exterior': 'scene04-school-exterior.png',
  'scene-05-threshold': 'scene05-classroom-threshold.png',
  'scene-06-next-morning-discovery': 'scene06-discovery-start.png',
  'scene-07-tumbler': 'scene07-tumbler.png',
  'scene-08-tumbler-interior': 'scene08-tumbler-interior.png',
  'scene-09-classroom-aisle': 'scene09-classroom-aisle.png',
};
const assetPathForScene = (styleId, sceneId) => sceneId === 'scene-06-next-morning-discovery'
  ? `assets/video/v16-style-audition/${styleId}/scene06-next-morning-discovery.mp4`
  : `assets/images/v16-style-audition/${styleId}/${assetFileNames[sceneId]}`;

const commonInvariants = {
  independentVariable: 'visual style only',
  locked: ['narration/audio', 'BGM', 'title', 'white-on-black captions', 'AI disclosure', 'scene frame timing', '1080x1920 canvas', '30fps', '5->6 six-frame media-only dip-to-black'],
  safety: ['no readable text', 'no logos', 'no minors', 'no faces', 'unsupported evidence prohibited', 'adult teacher rear view only', 'fictional reenactment disclosure retained'],
};

const manifest = {
  manifestId: 'jeju-school-intrusion-v16-style-audition',
  version: 16,
  purpose: 'Controlled five-style audition on one fixed 10.266667-second source window.',
  output: { width: 1080, height: 1920, fps: 30, frames: 308, durationSeconds: 308 / 30 },
  sourceWindow: { sourceStartFrame: 165, sourceEndFrameExclusive: 473, sourceStartSeconds: 5.5, sourceEndSeconds: 473 / 30, frameCount: 308, scenes: scenes.map(({ id, sourceScene, startFrame, endFrame, frames, durationSeconds }) => ({ id, sourceScene, startFrame, endFrame, frames, durationSeconds })) },
  transitionContract: { mode: 'media-only', frameAccounting: 'preserve-scene-sum', boundaries: [{ from: 5, to: 6, type: 'dip-to-black', frames: 6, notes: 'last 3 frames fade out; first 3 frames fade in; overlays remain fixed' }] },
  commonInvariants,
  styles: styleSpecs.map((style) => ({ ...style, scenes: scenes.map((scene) => ({ id: scene.id, asset: style.id === 'realistic' ? null : assetPathForScene(style.id, scene.id), placeholder: style.id !== 'realistic' && scene.id !== 'scene-06-next-morning-discovery', assetType: style.id !== 'realistic' && scene.id === 'scene-06-next-morning-discovery' ? 'motion-video' : 'image' })) })),
  render: { assembler: 'scripts/assemble-v16-style-audition.mjs', audioSource: 'out/.private/jeju-school-intrusion-short-v1-v15-transition-only/jeju-school-intrusion-short-v1-v15-transition-only-msg0z1pv-29380-dish8l.mp4', overlays: 'locked from v15; media-only replacement' },
};

const project = {
  id: 'jeju-school-intrusion-short-v1-v16-style-audition',
  title: { line1: '제주 초등학교', line2: '교실 침입 사건' },
  parentProject: 'project-v15-transition-only.json',
  manifest: 'style-audition-manifest-v16.json',
  captionPreset: { id: 'information-delta-v14-white-on-black-2line', fontFamily: 'Noto Sans KR', fontWeight: 800, fontSize: 88, scaleX: 94, safeWidth: 920, maxLines: 2, lineHeight: 1.08, x: 540, y: 1400, color: '#FFFFFF', outlineColor: '#000000', outlineWidth: 5, background: 'black' },
  lockedTracks: { narration: 'parent-v15', bgm: 'parent-v15', title: 'parent-v15', captions: 'parent-v15-white-on-black', aiDisclosure: 'parent-v15' },
  output: manifest.output,
  scenes,
  transitionContract: manifest.transitionContract,
  releaseGate: { publishable: false, releaseStatus: 'preview', uploadBlocked: true, reason: 'Style audition only; no upload or external release.' },
};

fs.mkdirSync(assetsRoot, { recursive: true });
for (const style of styleSpecs.filter(({ id }) => id !== 'realistic')) fs.mkdirSync(path.join(assetsRoot, style.id), { recursive: true });
fs.mkdirSync(projectRoot, { recursive: true });
fs.writeFileSync(contractPath, `${JSON.stringify({ contractId: 'jeju-school-intrusion-v16-style-audition', parentContract: 'jeju-school-intrusion-v15-transition-only', version: 16, purpose: manifest.purpose, output: manifest.output, sourceWindow: manifest.sourceWindow, commonInvariants, transitionContract: manifest.transitionContract, styles: styleSpecs.map(({ id, label, mode, prompt }) => ({ id, label, mode, prompt })), scope: { upload: 'blocked local preview only', researchSources: 'untouched', variableIsolation: 'visual-style-only' } }, null, 2)}\n`, 'utf8');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
fs.writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ contractPath, manifestPath, projectPath, styles: styleSpecs.map(({ id }) => id), frameCount: 308, sceneFrames: scenes.map(({ id, frames }) => ({ id, frames })) }, null, 2));
