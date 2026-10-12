import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVisualAuthority } from './editorial-cartoon-authority.mjs';
import { buildEvidenceBundle, hashFile, stableStringify } from './evidence-bundle.mjs';
import { buildCompiledSceneEvidence } from './compiled-scene-evidence.mjs';

const authority = loadVisualAuthority('paper-cut-grok-storyboard-v2');
assert.equal(authority.animation.generator, 'grok-color-storyboard-i2v');
assert.equal(authority.animation.generativeVideoAllowed, true);
assert.equal(authority.animation.providerInput, 'exactly-one-approved-color-storyboard');
assert.equal(authority.animation.separateReferenceUploadsAllowed, false);
const historical = loadVisualAuthority('paper-cut-keyframe-v1');
assert.equal(historical.animation.generator, 'ffmpeg-deterministic-keyframes');
assert.equal(historical.animation.generativeVideoAllowed, false);
assert.equal(authority.animation.requireStoryProp, true);
assert.equal(authority.animation.requireActiveBlocking, true);

const producer = fs.readFileSync(new URL('./produce-short.mjs', import.meta.url), 'utf8');
assert.match(producer, /zoompan=z=/u);
assert.match(producer, /ffmpeg-deterministic-keyframes-v1/u);
assert.match(producer, /iw-iw\/zoom/u);

const locate = (name) => String(execFileSync('where.exe', [name], { encoding: 'utf8', windowsHide: true })).split(/\r?\n/u).find(Boolean);
const ffmpeg = locate('ffmpeg');
const ffprobe = locate('ffprobe');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-keyframe-test-'));
try {
  const source = path.join(temp, 'source.png');
  const output = path.join(temp, 'motion.mp4');
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:rate=1', '-frames:v', '1', '-threads', '1', source], { windowsHide: true });
  const progress = 'on/71';
  const filter = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='1.0000+(0.1200)*${progress}':x='(iw-iw/zoom)*(0.5+-0.0600+(0.1200)*${progress})':y='(ih-ih/zoom)*(0.5+0.0200+(-0.0400)*${progress})':d=72:s=1080x1920:fps=24,setsar=1,fps=24,trim=end_frame=72,setpts=PTS-STARTPTS`;
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-stream_loop', '-1', '-i', source, '-vf', filter, '-frames:v', '72', '-r', '24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', output], { windowsHide: true });
  const probe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames', '-of', 'json', output], { encoding: 'utf8', windowsHide: true }));
  assert.deepEqual({ width: probe.streams[0].width, height: probe.streams[0].height, fps: probe.streams[0].r_frame_rate, frames: Number(probe.streams[0].nb_read_frames) }, { width: 1080, height: 1920, fps: '24/1', frames: 72 });
  const hashes = String(execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', output, '-vf', "select='eq(n,0)+eq(n,71)'", '-vsync', '0', '-f', 'framemd5', '-'], { encoding: 'utf8', windowsHide: true })).split(/\r?\n/u).filter((line) => /^\d/u.test(line)).map((line) => line.split(',').at(-1).trim());
  assert.equal(hashes.length, 2);
  assert.notEqual(hashes[0], hashes[1], 'the deterministic keyframe transform must visibly change the frame');

  const writeJson = (name, value) => { const file = path.join(temp, name); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); return file; };
  const research = writeJson('research.json', { slug: 'keyframe', sources: [{ id: 'src', url: 'https://example.invalid/keyframe', publisher: 'fixture', verified: true }] });
  const dossier = writeJson('dossier.json', { slug: 'keyframe' });
  const legal = writeJson('legal.json', { confirmedFacts: [{ id: 'c1', summary: 'A verified prop action', sourceIds: ['src'], status: 'confirmed' }], videoDecision: { decision: 'allow' }, scriptPolicy: { allowedClaims: ['c1'] } });
  const script = writeJson('script.final.json', { schemaVersion: 1, slug: 'keyframe', status: 'final', draft: 'A verified prop action.' });
  const sceneEvidence = { scene: 1, captionAnchor: 'A verified prop action.', excerpt: 'A verified prop action.', claimIds: ['c1'], evidenceClass: 'direct', qualificationIds: [], legalConstraintIds: [] };
  const bundle = buildEvidenceBundle({ researchSnapshot: research, eventDossier: dossier, legalReport: legal, script, rootDir: temp, scriptSpans: [sceneEvidence] });
  const bundlePath = writeJson('bundle.json', bundle);
  fs.copyFileSync(source, path.join(temp, 'asset.png'));
  const visualAuthoritySha256 = crypto.createHash('sha256').update(fs.readFileSync(new URL('../production/templates/paper-cut-grok-storyboard-v2.json', import.meta.url))).digest('hex');
  const storyboardDir = path.join(temp, 'assets', 'storyboards'); const roughDir = path.join(temp, 'assets', 'roughs'); const masterDir = path.join(temp, 'assets', 'masters'); fs.mkdirSync(storyboardDir, { recursive: true }); fs.mkdirSync(roughDir, { recursive: true }); fs.mkdirSync(masterDir, { recursive: true }); fs.copyFileSync(source, path.join(storyboardDir, 'storyboard-1.png')); fs.copyFileSync(source, path.join(roughDir, 'rough-1.png')); fs.copyFileSync(source, path.join(masterDir, 'master-character.png')); const storyboardBytes = fs.readFileSync(path.join(storyboardDir, 'storyboard-1.png')); const masterBytes = fs.readFileSync(path.join(masterDir, 'master-character.png')); const storyboardSha256 = crypto.createHash('sha256').update(storyboardBytes).digest('hex'); const masterSha256 = crypto.createHash('sha256').update(masterBytes).digest('hex');
  const canonicalHash = (value) => { const copy = structuredClone(value); delete copy.approval; return crypto.createHash('sha256').update(stableStringify(copy)).digest('hex'); };
  const durationIntent = { policy: 'target-2-3s', exceptionReason: 'none', boundaryEvidence: 'normal narration beat' };
  const storyline = { schema: 'newsroom-storyline-v2', authorities: { newsSha256: '1'.repeat(64), scriptSha256: '2'.repeat(64), narrationAudioSha256: '3'.repeat(64), narrationTimingSha256: '4'.repeat(64) }, beginning: 'a', development: 'b', turn: 'c', resolution: 'd', endQuestion: 'e', addedNewsFacts: [], qualifiers: [] }; storyline.approval = { approved: true, status: 'admitted', sha256: canonicalHash(storyline) };
  const semanticCutPlan = { schema: 'newsroom-semantic-cut-plan-v2', authorities: { storylineSha256: storyline.approval.sha256, ...storyline.authorities }, cuts: [{ cutId: 'cut-001', spanBindings: [{ spanId: bundle.scriptSpans[0].spanId, start: 0, end: bundle.scriptSpans[0].excerpt.length }], durationIntent }] }; semanticCutPlan.approval = { approved: true, status: 'admitted', sha256: canonicalHash(semanticCutPlan) };
  const board = { cutId: 'cut-001', storyboardAssetId: 'storyboard-1', role: 'color-storyboard', generationMode: 'approved-color-storyboard', approval: { approved: true, status: 'admitted', sha256: storyboardSha256, bytes: storyboardBytes.length }, provenance: { roughStoryboard: { assetId: 'rough-1', role: 'rough-storyboard', output: 'assets/roughs/rough-1.png', sha256: storyboardSha256, bytes: storyboardBytes.length }, characterMasters: [{ assetId: 'master-character', role: 'character', sha256: masterSha256, bytes: masterBytes.length }] } };
  const storyboardAdmission = { schema: 'newsroom-color-storyboard-admission-v2', authorities: { semanticCutPlanSha256: semanticCutPlan.approval.sha256, storylineSha256: storyline.approval.sha256, visualAuthoritySha256 }, boards: [{ ...structuredClone(board), provenance: { ...structuredClone(board.provenance), roughStoryboard: Object.fromEntries(Object.entries(board.provenance.roughStoryboard).filter(([key]) => key !== 'output')) } }] }; storyboardAdmission.approval = { approved: true, status: 'admitted', sha256: canonicalHash(storyboardAdmission) };
  const videoDesign = { schema: 'video-design-v7-two-stage-color-storyboard', authorshipContract: 'newsroom-primary-agent-video-design-v8-two-stage-color-storyboard-authority', contractRevision: 'evidence-motion-documentary-v12-two-stage-color-storyboard', visualAuthorityId: 'paper-cut-grok-storyboard-v2', visualAuthoritySha256, totalCuts: 1, storyline, semanticCutPlan, storyboardAdmission, storyboardAssets: [{ ...board, output: 'assets/storyboards/storyboard-1.png', outputSha256: storyboardSha256 }], commonMasterAssets: [{ masterAssetId: 'master-character', role: 'character', output: 'assets/masters/master-character.png', outputSha256: masterSha256, approval: { approved: true, status: 'admitted', sha256: masterSha256, bytes: masterBytes.length } }], scenes: [{ scene: 1, cutId: 'cut-001', durationSeconds: 2, durationIntent, grokSceneClass: 'human-action', grokI2v: { referenceImages: [{ assetId: 'storyboard-1', role: 'color-storyboard', generationMode: 'approved-color-storyboard' }], clipSelection: { mode: 'semantic-qa-selected-window-v2-authored-duration-bound', minimumSeconds: 1.95, maximumSeconds: 2.05, authoredDurationSeconds: 2, durationToleranceSeconds: 0.05 } }, imageGen: {} }] };
  const referenceManifest = { schema: 'editorial-reference-assets-v1', assets: [] };
  const videoDesignPath = writeJson('video-design.json', videoDesign);
  const referencePath = writeJson('reference-assets.json', referenceManifest);
  const animation = { move: 'push-in', intensity: 0.5, startScale: 1, endScale: 1.12, startX: -0.06, endX: 0.06, startY: 0.02, endY: -0.02 };
  const shotDesign = { shotScale: 'close-up', cameraAngle: 'overhead', focalSubject: 'cracked phone', visualHierarchy: ['foreground paper shards', 'midground cracked phone', 'background evidence folder'], blocking: 'a gloved paper hand places the cracked phone into an evidence tray', storyProps: ['cracked phone', 'evidence tray'] };
  const compiledEvidence = buildCompiledSceneEvidence({ scene: 1, spanBindings: [{ spanId: bundle.scriptSpans[0].spanId, start: 0, end: bundle.scriptSpans[0].excerpt.length }] }, bundle.scriptSpans);
  const config = { contractVersion: 3, productionAuthorityMode: true, animationMode: 'grok-storyboard-first-semantic-qa-trim-v1', projectId: 'keyframe-fixture', title: { line1: '키프레임', line2: '구도 검증' }, scriptSource: 'script.final.json', assetsRoot: '.', scenes: [{ asset: 'asset.png', captionAnchor: sceneEvidence.captionAnchor, duration: 2, durationIntent, animation, shotDesign }], sceneAssets: ['asset.png'], sceneEvidence: [compiledEvidence], evidenceBundle: { path: 'bundle.json', sha256: hashFile(bundlePath) }, videoDesign: { path: 'video-design.json', sha256: hashFile(videoDesignPath), value: videoDesign }, referenceManifest: { path: 'reference-assets.json', sha256: hashFile(referencePath), value: referenceManifest }, assetPlan: { schema: 'editorial-asset-plan-v5-grok-storyboard-first', scenes: [{ scene: 1, classification: 'human-action' }] }, narration: { mode: 'file', audio: 'narration.wav', srt: 'narration.srt' }, bgm: { required: false }, captionPreset: { id: 'fixture' }, transitionContract: { mode: 'media-only', frameAccounting: 'preserve-scene-sum', boundaries: [] }, releaseGate: { publishable: false }, aiDisclosureLabel: 'AI 재구성', output: { width: 1080, height: 1920, fps: 24, durationSeconds: 2, frames: 48 } };
  const configPath = writeJson('creator.config.json', config);
  const projectPath = path.join(temp, 'project.json'); const contractPath = path.join(temp, 'contract.json'); const planPath = path.join(temp, 'plan.json');
  const automationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  execFileSync(process.execPath, ['scripts/create-editorial-cartoon-project.mjs', '--config', configPath, '--output-project', projectPath, '--output-contract', contractPath, '--output-plan', planPath], { cwd: automationRoot, windowsHide: true });
  execFileSync(process.execPath, ['scripts/verify-editorial-cartoon-project.mjs', projectPath, contractPath, planPath], { cwd: automationRoot, windowsHide: true });
  const verify = () => execFileSync(process.execPath, ['scripts/verify-editorial-cartoon-project.mjs', projectPath, contractPath, planPath], { cwd: automationRoot, windowsHide: true, stdio: 'pipe' });
  const roughPath = path.join(roughDir, 'rough-1.png'); const masterPath = path.join(masterDir, 'master-character.png');
  fs.appendFileSync(roughPath, Buffer.from([0])); assert.throws(verify, /Rough storyboard 1 integrity drifted/u); fs.copyFileSync(source, roughPath);
  fs.appendFileSync(masterPath, Buffer.from([0])); assert.throws(verify, /Character master master-character integrity drifted/u); fs.copyFileSync(source, masterPath);
  const pristineProject = fs.readFileSync(projectPath, 'utf8'); const mutatedProject = JSON.parse(pristineProject); mutatedProject.scenes[0].duration = 2.25; fs.writeFileSync(projectPath, `${JSON.stringify(mutatedProject, null, 2)}\n`); assert.throws(verify, /violates color-storyboard-only duration\/reference binding/u); fs.writeFileSync(projectPath, pristineProject);
  verify();
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

process.stdout.write('paper-cut-keyframe-tests passed\n');
