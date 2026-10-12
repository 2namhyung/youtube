#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateProject, validateThumbnailOverride, discoverAssets, assertHandoffSceneAssetNames, parseSrt, formatReferenceCaptionCues, segmentReferenceCaptionCues, REFERENCE_CAPTION_RULES, splitOverflowingReferenceCaptionCues, alignAuthoritativeCaptionCues, assertCaptionPresetMatchesTokens, allocateSceneFrames, allocateFramesFromDurations, allocateSceneFramesFromCaptionAnchors, normalizeSceneDurations, buildCalibrationAss, buildAss, buildEditableTrackContract, writeAtomic, escapeFilterPath, thumbnailSeek, parseSilenceDetect, buildSentenceAwareSilenceCuts, keptAudioSegments, remapCuesForSpeechTempo, buildMotionCameraFilter, fitTitleFontSize } from './production-lib.mjs';
import { generateBgm } from './media-pipeline.mjs';
import { assertAuthorityNarrationMode, authorityCommandKind } from './production-authority-policy.mjs';

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directNarrationProvenance = (provider) => ({ requestedProvider: provider, actualProvider: provider, fallbackUsed: false, fallbackReason: null, modelId: null, modelRevision: null, style: null, referenceSha256: null });
const attachNarrationProvenance = (target, provenance) => ({ ...target, narrationProvider: { ...provenance } });
const args = process.argv.slice(2); const projectArg = args[args.indexOf('--project') + 1]; const noRegister = args.includes('--no-register');
function requiredToolArgument(name) {
  const index = args.indexOf(name); const value = index >= 0 ? String(args[index + 1] || '') : '';
  if (!path.isAbsolute(value) || value.includes('\0')) throw new Error(`${name} requires an absolute executable path`);
  const resolved = path.resolve(value); const info = fs.lstatSync(resolved); const real = fs.realpathSync.native(resolved);
  const samePath = process.platform === 'win32' ? real.toLowerCase() === resolved.toLowerCase() : real === resolved;
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || !samePath) throw new Error(`${name} must be a regular nonsymlink executable`);
  return real;
}
function requiredFileArgument(name) {
  const index = args.indexOf(name); const value = index >= 0 ? String(args[index + 1] || '') : '';
  if (!path.isAbsolute(value) || value.includes('\0')) throw new Error(`${name} requires an absolute regular file`);
  const resolved = path.resolve(value); const info = fs.lstatSync(resolved); const real = fs.realpathSync.native(resolved);
  if (!info.isFile() || info.isSymbolicLink() || real !== resolved) throw new Error(`${name} requires an absolute regular nonsymlink file`);
  return real;
}
const workspaceIndex = args.indexOf('--workspace-root'); const workspaceValue = workspaceIndex >= 0 ? String(args[workspaceIndex + 1] || '') : ''; if (!path.isAbsolute(workspaceValue)) throw new Error('--workspace-root requires an absolute canonical media workspace'); const root = fs.realpathSync.native(path.resolve(workspaceValue)); const rootInfo = fs.lstatSync(root); if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('--workspace-root must be a real nonsymlink directory'); const realRoot = root;
const metadataOutputIndex = args.indexOf('--metadata-output'); const metadataOutputValue = metadataOutputIndex >= 0 ? String(args[metadataOutputIndex + 1] || '') : '';
const metadataAuthorityIndex = args.indexOf('--metadata-authority-sha256'); const metadataAuthoritySha256 = metadataAuthorityIndex >= 0 ? String(args[metadataAuthorityIndex + 1] || '') : '';
let metadataOutputPath = null;
if (metadataOutputIndex >= 0 || metadataAuthorityIndex >= 0) {
  if (!path.isAbsolute(metadataOutputValue) || !/^[a-f0-9]{64}$/u.test(metadataAuthoritySha256)) throw new Error('Producer metadata output requires an absolute path and authority SHA-256');
  const resolved = path.resolve(metadataOutputValue); const parent = fs.realpathSync.native(path.dirname(resolved)); const relativeParent = path.relative(realRoot, parent);
  if (relativeParent.startsWith('..') || path.isAbsolute(relativeParent)) throw new Error('Producer metadata output must stay inside the canonical workspace');
  if (fs.existsSync(resolved)) { const info = fs.lstatSync(resolved); if (!info.isFile() || info.isSymbolicLink() || fs.realpathSync.native(resolved) !== resolved) throw new Error('Producer metadata output must be a regular nonsymlink file'); }
  metadataOutputPath = resolved;
}
if (!projectArg) throw new Error('Usage: npm run short:produce -- --workspace-root <absolute-root> --project production/projects/<id>/project.json --ffmpeg-executable <absolute-path> --ffprobe-executable <absolute-path> --python-executable <absolute-path> --tool-bundle-manifest <absolute-path> --tool-bundle-manifest-sha256 <sha256> [--metadata-output <absolute-path> --metadata-authority-sha256 <sha256>] [--no-register]');
const ffmpegExecutable = requiredToolArgument('--ffmpeg-executable'); const ffprobeExecutable = requiredToolArgument('--ffprobe-executable'); const pythonExecutable = requiredToolArgument('--python-executable');
const toolBundleManifestPath = requiredFileArgument('--tool-bundle-manifest'); const toolBundleManifestSha256 = String(args[args.indexOf('--tool-bundle-manifest-sha256') + 1] || '');
const toolBundleManifestBytes = fs.readFileSync(toolBundleManifestPath); if (!/^[a-f0-9]{64}$/u.test(toolBundleManifestSha256) || crypto.createHash('sha256').update(toolBundleManifestBytes).digest('hex') !== toolBundleManifestSha256) throw new Error('Tool bundle invocation manifest hash mismatch');
const toolBundleManifest = JSON.parse(toolBundleManifestBytes.toString('utf8'));
if (toolBundleManifest?.schema !== 'newsroom-tool-bundle-invocation-v1' || !Array.isArray(toolBundleManifest.bundles)) throw new Error('Tool bundle invocation manifest is invalid');
function currentBundleFiles(bundleRoot) {
  const files = [];
  const walk = (directory, relative = '') => {
    const info = fs.lstatSync(directory); const real = fs.realpathSync.native(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || (real !== bundleRoot && !real.startsWith(`${bundleRoot}${path.sep}`))) throw new Error('Tool bundle mirror directory fence failed');
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const absolute = path.join(directory, entry.name); const rel = path.posix.join(relative, entry.name); const item = fs.lstatSync(absolute); if (item.isSymbolicLink()) throw new Error('Tool bundle mirror contains a link'); if (item.isDirectory()) walk(absolute, rel); else if (item.isFile()) { const bytes = fs.readFileSync(absolute); files.push({ path: rel, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }); } else throw new Error('Tool bundle mirror contains an unsupported entry'); }
  };
  walk(bundleRoot); return files;
}
const verifiedToolBundleContents = new Map();
function assertToolBundleForCommand(command) {
  const kind = authorityCommandKind(command, { python: pythonExecutable, ffmpeg: ffmpegExecutable, ffprobe: ffprobeExecutable });
  const bundle = toolBundleManifest.bundles.find((item) => item?.kind === kind); if (!bundle || !path.isAbsolute(bundle.root) || !Array.isArray(bundle.files)) throw new Error(`${kind} tool bundle authority is missing`);
  const rootInfo = fs.lstatSync(bundle.root); const realRoot = fs.realpathSync.native(bundle.root); if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || realRoot !== bundle.root) throw new Error(`${kind} tool bundle root fence failed`);
  const expectedLaunch = kind === 'python' ? { python: pythonExecutable } : { ffmpeg: ffmpegExecutable, ffprobe: ffprobeExecutable };
  for (const [key, executable] of Object.entries(expectedLaunch)) if (bundle.launch?.[key] !== executable || !executable.startsWith(`${realRoot}${path.sep}`)) throw new Error(`${kind} tool launch binding mismatch`);
  const expectedFiles = JSON.stringify(bundle.files); const cacheKey = `${toolBundleManifestSha256}:${kind}:${realRoot}`;
  // The outer Windows FileShare.Read holder denies writes and replacement for every
  // authority file during this producer process. Hash once per immutable bundle;
  // other platforms retain the conservative per-spawn full-tree hash.
  if (process.platform !== 'win32' || verifiedToolBundleContents.get(cacheKey) !== expectedFiles) {
    if (JSON.stringify(currentBundleFiles(realRoot)) !== expectedFiles) throw new Error(`${kind} tool bundle changed immediately before spawn`);
    if (process.platform === 'win32') verifiedToolBundleContents.set(cacheKey, expectedFiles);
  }
}
assertToolBundleForCommand(ffmpegExecutable); assertToolBundleForCommand(ffprobeExecutable); assertToolBundleForCommand(pythonExecutable);
const requestedProjectPath = path.resolve(projectArg); const requestedProjectInfo = fs.lstatSync(requestedProjectPath); const projectPath = fs.realpathSync.native(requestedProjectPath); const projectRelative = path.relative(root, projectPath); if (!requestedProjectInfo.isFile() || requestedProjectInfo.isSymbolicLink() || !projectRelative || projectRelative.startsWith('..') || path.isAbsolute(projectRelative)) throw new Error('Project must be a regular nonsymlink file inside --workspace-root'); const base = path.dirname(projectPath); const projectSourceText = await fsp.readFile(projectPath, 'utf8'); const project = validateProject(JSON.parse(projectSourceText), base); const thumbnailOverride = project.thumbnail ? validateThumbnailOverride(project.thumbnail, base) : null;
assertAuthorityNarrationMode(project.narration.mode, project.narration, project.productionAuthorityMode === true);
const effectiveCaptionRules = Array.isArray(project.captionProtectedTerms) && project.captionProtectedTerms.length
  ? { ...REFERENCE_CAPTION_RULES, protectedTerms: project.captionProtectedTerms }
  : REFERENCE_CAPTION_RULES;
const hashText = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
let authoritativeScript = null;
if (project.scriptSource) {
  if (path.isAbsolute(project.scriptSource) || String(project.scriptSource).split(/[\\/]/u).includes('..')) throw new Error('scriptSource must be a contained relative path');
  const requestedSourcePath = path.resolve(base, project.scriptSource); const sourceInfo = fs.lstatSync(requestedSourcePath); const sourcePath = fs.realpathSync.native(requestedSourcePath); const sourceRelative = path.relative(root, sourcePath);
  if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink() || !sourceRelative || sourceRelative.startsWith('..') || path.isAbsolute(sourceRelative)) throw new Error('scriptSource must be a regular nonsymlink file inside --workspace-root');
  const source = JSON.parse(await fsp.readFile(sourcePath, 'utf8'));
  if (source?.status !== 'final' || !source.finalizedAt) throw new Error(`Authoritative script must be finalized: ${project.scriptSource}`);
  if (typeof source.draft !== 'string' || !source.draft.trim()) throw new Error(`Authoritative script draft is empty: ${project.scriptSource}`);
  const text = source.draft.replace(/\r\n/g, '\n').trim();
  authoritativeScript = { path: sourcePath, slug: String(source.slug || ''), finalizedAt: source.finalizedAt, text };
}
const authoritativeSourceCues = authoritativeScript
  ? authoritativeScript.text.split(/\n+/).map((text) => text.replace(/\s+/g, ' ').trim()).filter(Boolean).map((text, index) => ({ number: index + 1, text }))
  : null;
const scriptSha256 = authoritativeScript ? hashText(authoritativeScript.text) : null;
const projectConfigSha256 = hashText(projectSourceText.replace(/\r\n/g, '\n'));
let pipelineContract = null;
if (project.pipelineContract) {
  const contractPath = path.resolve(base, project.pipelineContract.path);
  const relative = path.relative(realRoot, fs.realpathSync(contractPath));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('pipelineContract must stay inside the automation workspace');
  const bytes = await fsp.readFile(contractPath);
  const contractSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (contractSha256 !== project.pipelineContract.sha256) throw new Error('pipelineContract SHA-256 mismatch before render');
  pipelineContract = { path: contractPath, authority: path.relative(root, contractPath).replaceAll(path.sep, '/'), sha256: contractSha256 };
}
if (authoritativeScript && authoritativeScript.slug !== 'jeju-school-intrusion' && !pipelineContract) throw new Error('Generic renders require an exact pipelineContract path and SHA-256 binding');
const narrationConfigSha256 = hashText(JSON.stringify({ scriptSha256, narration: project.narration }));
const visualConfigSha256 = hashText(JSON.stringify({ title: project.title, assets: project.assets, scenes: project.scenes, captionPreset: project.captionPreset, captionRules: effectiveCaptionRules, media: project.media, transitionContract: project.transitionContract, motionEvidence: project.motionEvidence }));
const sourceIntegrity = authoritativeScript ? {
  authority: path.relative(root, authoritativeScript.path).replaceAll(path.sep, '/'),
  slug: authoritativeScript.slug,
  status: 'final',
  finalizedAt: authoritativeScript.finalizedAt,
  scriptSha256,
  projectConfigSha256,
  projectAuthority: path.relative(root, projectPath).replaceAll(path.sep, '/'),
  ...(pipelineContract ? { contractAuthority: pipelineContract.authority, contractSha256: pipelineContract.sha256 } : {}),
  narrationConfigSha256,
  visualConfigSha256,
  sourceCueCount: authoritativeSourceCues.length,
} : null;
let editorProjectId;
const canonicalBaselinePath = path.join(base, 'canonical-baseline.json');
if (fs.existsSync(canonicalBaselinePath)) {
  const canonicalBaseline = JSON.parse(await fsp.readFile(canonicalBaselinePath, 'utf8'));
  if (typeof canonicalBaseline.projectId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(canonicalBaseline.projectId)) throw new Error('Canonical baseline projectId is invalid');
  editorProjectId = canonicalBaseline.projectId;
}
const tokens = JSON.parse(await fsp.readFile(path.join(moduleRoot, 'production/templates/reference-v3.tokens.json'), 'utf8'));
assertCaptionPresetMatchesTokens(project.captionPreset, tokens);
if (project.captionPreset?.background === 'black') tokens.semantic.captionBackground = 'black';
const referenceFontFamily = tokens.primitive.font.family;
tokens.primitive.font.family = 'School Shorts V3 Noto Sans KR';
const allowedMediaExtensions = new Set(['.png', '.jpg', '.jpeg', '.mp4', '.mov', '.webm']);
const assertWorkspaceMediaPath = (value, label, { directory = false } = {}) => {
  const resolved = path.resolve(base, value);
  let realPath; let stat;
  try { realPath = fs.realpathSync(resolved); stat = fs.statSync(realPath); } catch { throw new Error(`${label} not found: ${value}`); }
  const relative = path.relative(realRoot, realPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} must stay inside the automation workspace`);
  if (directory ? !stat.isDirectory() : !stat.isFile()) throw new Error(`${label} must be a ${directory ? 'directory' : 'regular file'}`);
  if (!directory && !allowedMediaExtensions.has(path.extname(realPath).toLowerCase())) throw new Error(`${label} has an unsupported media extension`);
  return realPath;
};
if (project.scenes?.length) project.scenes.forEach((scene, index) => assertWorkspaceMediaPath(project.media?.sceneReplacements?.[String(index)] || scene.asset, `scene ${index + 1} asset`));
else assertWorkspaceMediaPath(project.assets || 'assets', 'assets directory', { directory: true });
if (Array.isArray(project.media?.clips)) project.media.clips.forEach((clip, index) => assertWorkspaceMediaPath(clip.path, `media clip ${index + 1}`));
const runId = `${Date.now().toString(36)}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const versionId = runId; const outDir = path.join(root, 'out'); const workDir = path.join(outDir, '.runs', `${project.id}-${runId}`); await fsp.mkdir(workDir, { recursive: true });
const publishDir = noRegister ? path.join(outDir, '.private', project.id) : outDir; await fsp.mkdir(publishDir, { recursive: true });
const outPath = path.join(publishDir, `${project.id}-${versionId}.mp4`); const thumbPath = path.join(publishDir, `${project.id}-${versionId}-0_5.png`); const tmpPath = path.join(workDir, 'render.mp4'); const assPath = path.join(workDir, 'captions.ass');
const versionDir = noRegister ? null : path.join(outDir, 'registry', 'versions');
const handoffRoot = noRegister ? path.join(publishDir, `${versionId}.handoff`) : path.join(outDir, 'registry', 'handoffs', versionId);
const registryRecordPath = versionDir ? path.join(versionDir, `${versionId}.json`) : null;
const registryHandoffPath = versionDir ? path.join(versionDir, `${versionId}.handoff.json`) : null;
const latestRenderPath = versionDir ? path.join(outDir, 'latest-render.json') : null;
const previousLatest = latestRenderPath && fs.existsSync(latestRenderPath) ? await fsp.readFile(latestRenderPath) : null;
const providerScriptPath = authoritativeScript ? path.join(workDir, 'authoritative-script.txt') : path.resolve(base, project.scriptFile || 'script.txt');
if (authoritativeScript) await fsp.writeFile(providerScriptPath, `${authoritativeScript.text}\n`, 'utf8');
let audioPath; let cues = []; let narrationProvenance = directNarrationProvenance(project.narration.mode);
let authoritativeCueCount = null;
let narrationAlreadyFinal = false;
try {
  if (project.narration.mode === 'file') {
    audioPath = path.resolve(base, project.narration.audio);
    const srt = project.narration.srt ? path.resolve(base, project.narration.srt) : null;
    if (srt && !fs.existsSync(srt)) throw new Error(`configured SRT not found: ${project.narration.srt}`);
    if (srt && fs.existsSync(srt)) cues = parseSrt(await fsp.readFile(srt, 'utf8'));
    else if (project.narration.transcribe) {
      const generatedSrt = path.join(workDir, 'transcribed.srt');
      await run(pythonExecutable, [path.join(moduleRoot, 'scripts', 'transcribe-whisper.py'), audioPath, generatedSrt]);
      cues = parseSrt(await fsp.readFile(generatedSrt, 'utf8'));
    } else throw new Error('File narration requires a valid configured SRT or transcribe:true');
  } else if (project.narration.mode === 'approved-locked') {
    const lockedAudioPath = path.resolve(base, project.narration.audio);
    const lockedHandoffPath = path.resolve(base, project.narration.handoff);
    if (!fs.existsSync(lockedAudioPath) || !fs.existsSync(lockedHandoffPath)) throw new Error('Approved locked narration assets are missing');
    const lockedHash = crypto.createHash('sha256').update(await fsp.readFile(lockedAudioPath)).digest('hex');
    if (lockedHash !== String(project.narration.audioSha256).toLowerCase()) throw new Error('Approved locked narration audio hash mismatch');
    audioPath = lockedAudioPath;
    const lockedHandoff = JSON.parse(await fsp.readFile(lockedHandoffPath, 'utf8'));
    if (!Array.isArray(lockedHandoff.cues) || lockedHandoff.cues.length !== Number(project.narration.cueCount)) throw new Error('Approved locked narration cue count mismatch');
    cues = lockedHandoff.cues.map((cue) => {
      const start = Number(cue.start); const end = Number(cue.end); const text = String(cue.text || '');
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text.trim()) throw new Error('Approved locked narration contains an invalid cue');
      return { ...cue, start, end, text };
    });
    const lockedText = cues.map((cue) => cue.text).join('').replace(/\s+/g, '');
    const authoritativeText = authoritativeScript?.text.replace(/\s+/g, '') || '';
    if (!authoritativeText || lockedText !== authoritativeText) throw new Error('Approved locked narration cues do not exactly match the authoritative final script');
    authoritativeCueCount = cues.length;
    narrationAlreadyFinal = true;
    narrationProvenance = {
      requestedProvider: 'approved-locked', actualProvider: 'approved-locked', fallbackUsed: false,
      approvedAudioSha256: lockedHash, approvedHandoff: path.relative(root, lockedHandoffPath).replaceAll(path.sep, '/'),
      source: String(project.narration.source || 'approved-locked-owner-audio'), scriptSha256, narrationConfigSha256,
      speechAcceptance: lockedHandoff.narrationProvider?.speechAcceptance || { accepted: true, final: { accepted: true } },
      locked: true,
    };
  } else {
    throw new Error(`Render-time narration generation was removed; received unsupported mode: ${project.narration.mode}`);
  }
  if (!cues.length) throw new Error('Narration produced no caption cues');
  if (authoritativeSourceCues) {
    cues = alignAuthoritativeCaptionCues(authoritativeSourceCues, cues);
    authoritativeCueCount = cues.length;
  }
  const narrationPreset = tokens.component.narration;
  const speechTempo = narrationAlreadyFinal ? 1 : Number(project.narration.speechTempo ?? narrationPreset.speechTempo);
  const sourceAudioProbe = JSON.parse(await run(ffprobeExecutable, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', audioPath], true));
  const sourceAudioDuration = Number(sourceAudioProbe.format?.duration || 0);
  if (!(sourceAudioDuration > 0)) throw new Error('Source narration duration probe returned zero');
  let silenceCuts = [];
  if (!narrationAlreadyFinal && (project.narration.removeSilence ?? narrationPreset.removeSilence)) {
    const silenceOutput = await runDiagnostic(ffmpegExecutable, ['-hide_banner', '-i', audioPath, '-af', 'silencedetect=noise=-35dB:d=0.18', '-f', 'null', 'NUL']);
    silenceCuts = buildSentenceAwareSilenceCuts(parseSilenceDetect(silenceOutput), sourceAudioDuration, cues, {
      speechTempo,
      sentencePauseSeconds: Number(project.narration.sentencePauseSeconds ?? narrationPreset.terminalPauseSeconds),
      semanticPauseSeconds: Number(project.narration.semanticPauseSeconds ?? narrationPreset.semanticPauseSeconds),
      joinSafetySeconds: Number(project.narration.joinSafetySeconds ?? narrationPreset.joinSafetySeconds),
    });
  }
  if (silenceCuts.length || speechTempo !== 1) {
    const timedAudioPath = path.join(workDir, 'narration-retimed.m4a');
    const segments = keptAudioSegments(sourceAudioDuration, silenceCuts);
    const audioFilters = segments.map((segment, index) => `[0:a]atrim=start=${segment.start.toFixed(6)}:end=${segment.end.toFixed(6)},asetpts=PTS-STARTPTS[a${index}]`);
    const labels = segments.map((_, index) => `[a${index}]`).join('');
    audioFilters.push(`${labels}concat=n=${segments.length}:v=0:a=1[compact]`);
    audioFilters.push(`[compact]atempo=${speechTempo.toFixed(6)}[timed]`);
    await run(ffmpegExecutable, ['-hide_banner', '-loglevel', 'error', '-y', '-i', audioPath, '-filter_complex', audioFilters.join(';'), '-map', '[timed]', '-c:a', 'aac', '-b:a', '192k', timedAudioPath]);
    cues = remapCuesForSpeechTempo(cues, silenceCuts, speechTempo);
    audioPath = timedAudioPath;
  }
  if (authoritativeCueCount !== null) {
    if (cues.length !== authoritativeCueCount) throw new Error(`Accepted narration timing expected ${authoritativeCueCount} cues, received ${cues.length}`);
    cues = cues.map((cue) => ({ ...cue, end: Math.max(cue.end, cue.start + 0.6) }));
    if (cues.some((cue) => cue.end - cue.start < 0.599999)) throw new Error('Accepted narration timing requires every cue to last at least 0.6 seconds');
  }
  const staticFontPath = path.join(workDir, 'NotoSansKR-ExtraBold.ttf');
  const titleFontPath = path.join(workDir, 'NotoSansKR-Black.ttf');
  await Promise.all([
    run(pythonExecutable, [path.join(moduleRoot, 'scripts', 'build-v3-font.py'), 'C:/Windows/Fonts/NotoSansKR-VF.ttf', staticFontPath, '800']),
    run(pythonExecutable, [path.join(moduleRoot, 'scripts', 'build-v3-font.py'), 'C:/Windows/Fonts/NotoSansKR-VF.ttf', titleFontPath, '900']),
  ]);
  cues = segmentReferenceCaptionCues(cues, { ...effectiveCaptionRules, minDurationSeconds: Math.max(0.6, Number(effectiveCaptionRules.minDurationSeconds)), wordAnchors: Boolean(authoritativeSourceCues) });
  cues = formatReferenceCaptionCues(cues, { ...tokens.component.caption, targetGraphemesPerLine: effectiveCaptionRules.targetGraphemesPerLine, protectedTerms: effectiveCaptionRules.protectedTerms });
  const calibrationAssPath = path.join(workDir, 'calibration.ass'); const calibrationFrames = path.join(workDir, 'calibration.rgb'); const calibrationInput = path.join(workDir, 'caption-text.json'); const calibrationOutput = path.join(workDir, 'caption-pixels.json');
  let calibration;
  for (let pass = 0; pass < 8; pass += 1) {
    await fsp.writeFile(calibrationInput, JSON.stringify(cues.map((cue) => cue.text)), 'utf8'); await fsp.writeFile(calibrationAssPath, buildCalibrationAss(cues, tokens), 'utf8');
    const calibrationCropY = Math.max(0, Math.min(tokens.primitive.canvas.height - 360, Math.round(tokens.component.caption.y - 200)));
    await run(ffmpegExecutable, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black:s=1080x1920:r=1:d=${cues.length}`, '-vf', `subtitles='${escapeFilterPath(calibrationAssPath)}':fontsdir='${escapeFilterPath(workDir)}',crop=1080:360:0:${calibrationCropY},format=rgb24`, '-frames:v', String(cues.length), '-f', 'rawvideo', calibrationFrames]);
    await run(pythonExecutable, [path.join(moduleRoot, 'scripts', 'analyze-libass-calibration.py'), staticFontPath, calibrationInput, calibrationFrames, calibrationOutput]);
    calibration = JSON.parse(await fsp.readFile(calibrationOutput, 'utf8'));
    if (calibration.length !== cues.length) throw new Error(`Expected ${cues.length} libass measurements, received ${calibration.length}`);
    const overflow = splitOverflowingReferenceCaptionCues(cues, calibration, { ...tokens.component.caption, targetGraphemesPerLine: effectiveCaptionRules.targetGraphemesPerLine, protectedTerms: effectiveCaptionRules.protectedTerms, safeWidth: tokens.semantic.safeWidth, minDurationSeconds: 0.6 });
    if (overflow.splitCount === 0) break;
    cues = overflow.cues;
    calibration = null;
  }
  if (!calibration) throw new Error('Caption pixel fitting did not converge within 8 passes');
  if (cues.some((cue) => cue.end - cue.start < 0.599999)) throw new Error('Final editable captions require every cue to last at least 0.6 seconds');
  if (authoritativeScript) {
    const normalizeCaptionContract = (value) => String(value || '').replace(/\s+/g, '');
    const renderedCaptionText = cues.map((cue) => cue.text).join('');
    if (normalizeCaptionContract(renderedCaptionText) !== normalizeCaptionContract(authoritativeScript.text)) {
      throw new Error('Final burned-in captions must contain the authoritative script exactly, in source order');
    }
  }
  cues.forEach((cue, index) => { Object.assign(cue, calibration[index]); });
  await fsp.writeFile(assPath, buildAss(cues, tokens), 'utf8');
  await Promise.all([fsp.rm(calibrationFrames, { force: true }), fsp.rm(calibrationAssPath, { force: true }), fsp.rm(calibrationInput, { force: true }), fsp.rm(calibrationOutput, { force: true })]);
  const audioProbe = JSON.parse(await run(ffprobeExecutable, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', audioPath], true)); const audioDuration = Number(audioProbe.format?.duration || 0); if (!(audioDuration > 0)) throw new Error('Audio duration probe returned zero');
  const paperMetadataCandidate = project.animationMode === 'ffmpeg-deterministic-keyframes-v1';
  const outputFps = paperMetadataCandidate ? 24 : tokens.primitive.canvas.fps;
  const narrationDuration = Math.max(audioDuration, ...cues.map((cue) => cue.end));
  let totalFrames = Math.max(1, Math.ceil(narrationDuration * outputFps));
  let duration = totalFrames / outputFps;
  if (paperMetadataCandidate) {
    const requestedDurations = project.scenes.map((scene) => Number(scene.duration));
    if (requestedDurations.some((value, index) => !((value >= 2 && value <= 3) || (index === requestedDurations.length - 1 && value >= 1.5 && value <= 3.5)))) throw new Error('Paper keyframe durations must target 2-3 seconds; only the final required sentence boundary may use 1.5-3.5 seconds.');
    totalFrames = requestedDurations.reduce((sum, value) => sum + value * outputFps, 0);
    duration = totalFrames / outputFps;
    if (narrationDuration > duration + 0.001) throw new Error('Paper sequence timeline is shorter than the narration or caption authority.');
  }
  let finalAudioPath = audioPath;
  let bgmSourcePath = null;
  let bgmProvenance = null;
  if (project.bgm) {
    if (project.bgm.audio) bgmSourcePath = path.resolve(base, project.bgm.audio);
    else if (project.bgm.provider && project.bgm.provider !== 'local-file') {
      const generatedPath = path.join(workDir, 'generated-bgm.wav');
      const generated = await generateBgm({ provider: project.bgm.provider, prompt: project.bgm.prompt, durationSeconds: duration, outputPath: generatedPath, seed: project.bgm.seed, cwd: root });
      bgmProvenance = generated;
      if (generated.status === 'ready') bgmSourcePath = generated.outputPath;
      else if (project.bgm.required === true) throw new Error(generated.reason || 'BGM provider unavailable');
    }
    if (bgmSourcePath && fs.existsSync(bgmSourcePath)) {
      const bgmMixedPath = path.join(workDir, 'narration-bgm-mix.m4a');
      const volumeDb = Number(project.bgm.volumeDb ?? -25);
      const fade = Math.min(Number(project.bgm.fadeSeconds ?? 1.2), Math.max(0.1, duration / 2));
      const voiceFilter = project.bgm.duckUnderNarration === false
        ? `[0:a]apad=whole_dur=${duration.toFixed(3)},atrim=duration=${duration.toFixed(3)}[voice]`
        : `[0:a]apad=whole_dur=${duration.toFixed(3)},atrim=duration=${duration.toFixed(3)},asplit=2[voice][sidechain]`;
      const bgmFilter = `[1:a]atrim=duration=${duration.toFixed(3)},volume=${volumeDb}dB,afade=t=in:st=0:d=${Math.min(0.35, fade).toFixed(3)},afade=t=out:st=${Math.max(0, duration - fade).toFixed(3)}:d=${fade.toFixed(3)}[bg]`;
      const audioFilter = project.bgm.duckUnderNarration === false
        ? `${voiceFilter};${bgmFilter};[voice][bg]amix=inputs=2:duration=longest:dropout_transition=2,loudnorm=I=-16:TP=-1.5:LRA=11[mix]`
        : `${voiceFilter};${bgmFilter};[bg][sidechain]sidechaincompress=threshold=0.035:ratio=8:attack=20:release=250[duck];[voice][duck]amix=inputs=2:duration=longest:dropout_transition=2,loudnorm=I=-16:TP=-1.5:LRA=11[mix]`;
      await run(ffmpegExecutable, ['-hide_banner', '-loglevel', 'error', '-y', '-i', audioPath, '-stream_loop', '-1', '-i', bgmSourcePath, '-filter_complex', audioFilter, '-map', '[mix]', '-t', duration.toFixed(3), '-c:a', 'aac', '-b:a', '192k', bgmMixedPath]);
      finalAudioPath = bgmMixedPath;
      bgmProvenance = { ...(bgmProvenance || {}), status: 'ready', sourcePath: bgmSourcePath, volumeDb, duckUnderNarration: project.bgm.duckUnderNarration !== false, durationSeconds: duration, provenance: project.bgm.provenance || null };
    }
  }
  const renderedScenes = project.scenes?.length ? project.scenes.map((scene, index) => {
    const replacement = project.media?.sceneReplacements?.[String(index)];
    return replacement ? { ...scene, asset: replacement } : scene;
  }) : null;
  const discoveredAssets = renderedScenes?.length
    ? renderedScenes.map((scene, index) => assertWorkspaceMediaPath(scene.asset, `scene ${index + 1} asset`))
    : discoverAssets(assertWorkspaceMediaPath(project.assets || 'assets', 'assets directory', { directory: true }));
  const mediaClips = Array.isArray(project.media?.clips)
    ? project.media.clips.map((clip, index) => assertWorkspaceMediaPath(clip.path, `media clip ${index + 1}`))
    : [];
  const sourceAssets = project.scenes?.length ? discoveredAssets : [...discoveredAssets, ...mediaClips.filter((asset) => !discoveredAssets.includes(asset))];
  const discoveredImages = sourceAssets.filter((asset) => ['.png', '.jpg', '.jpeg'].includes(path.extname(asset).toLowerCase()));
  const preferredAssets = !project.scenes?.length && tokens.component.sequence.imageFirst && discoveredImages.length ? discoveredImages : sourceAssets;
  if (!preferredAssets.length) throw new Error('No assets found. Add media under the configured assets directory.');
  const assets = project.scenes?.length
    ? preferredAssets
    : Array.from({ length: tokens.component.sequence.sceneCount }, (_, index) => preferredAssets[index % preferredAssets.length]);
  const sceneConfigs = renderedScenes?.length
    ? (renderedScenes.some((scene) => scene.duration !== undefined) ? normalizeSceneDurations(renderedScenes, duration) : renderedScenes)
    : assets.map(() => ({}));
  const paperKeyframeScenes = paperMetadataCandidate ? sceneConfigs : [];
  if (paperMetadataCandidate) for (let index = 0; index < sceneConfigs.length; index += 1) {
    const scene = sceneConfigs[index]; const animation = scene.animation;
    const sceneDuration = Number(scene.duration);
    const boundaryException = index === sceneConfigs.length - 1 && sceneDuration >= 1.5 && sceneDuration <= 3.5;
    if (!((sceneDuration >= 2 && sceneDuration <= 3) || boundaryException) || !animation || !['push-in', 'pull-out', 'pan-left', 'pan-right', 'tilt-down', 'tilt-up', 'locked-insert'].includes(animation.move)) throw new Error(`Paper keyframe scene ${index + 1} metadata is incomplete: target duration is 2-3s (last required boundary may be 1.5-3.5s).`);
    for (const key of ['startScale', 'endScale', 'startX', 'endX', 'startY', 'endY']) if (!Number.isFinite(Number(animation[key]))) throw new Error(`Paper keyframe scene ${index + 1} has a nonnumeric transform.`);
  }
  assertHandoffSceneAssetNames(assets);
  let frameCounts;
  const isPaperKeyframe = paperKeyframeScenes.length > 0;
  if (isPaperKeyframe) {
    frameCounts = sceneConfigs.map((scene) => Number(scene.duration) * outputFps);
    if (frameCounts.reduce((sum, value) => sum + value, 0) !== totalFrames) throw new Error('Paper sequence frame sum does not match the exact timeline duration.');
  } else if (project.scenes?.length) {
    const scenes = sceneConfigs;
    frameCounts = scenes.every((scene) => scene.captionAnchor !== undefined)
      ? allocateSceneFramesFromCaptionAnchors(totalFrames, scenes, cues, tokens.primitive.canvas.fps)
      : scenes.every((scene) => scene.duration === undefined)
        ? allocateSceneFrames(totalFrames, assets.length)
        : allocateFramesFromDurations(totalFrames, scenes.map((scene) => scene.duration));
  }
  else frameCounts = allocateSceneFrames(totalFrames, assets.length);
  const inputs = []; const filters = []; const labels = [];
  const mediaStyle = tokens.component.media;
  const aiDisclosureIntervals = [];
  let disclosureCursorFrames = 0;
  if (isPaperKeyframe) for (let index = 0; index < assets.length; index += 1) {
    if (!['.mp4', '.mov', '.webm'].includes(path.extname(assets[index]).toLowerCase())) continue;
    const probe = JSON.parse(await run(ffprobeExecutable, ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'json', assets[index]], true));
    const availableFrames = Number(probe.streams?.[0]?.nb_read_frames);
    if (!Number.isInteger(availableFrames) || availableFrames < frameCounts[index]) throw new Error(`Paper motion scene ${index + 1} has fewer source frames than its exact timeline budget.`);
  }
  assets.forEach((asset, i) => {
    const frames = Number.isInteger(frameCounts[i]) ? frameCounts[i] : Math.max(1, Math.round(frameCounts[i] * outputFps));
    const scene = sceneConfigs[i] || {};
    const isMotionAsset = ['.mp4', '.mov', '.webm'].includes(path.extname(asset).toLowerCase());
    const zoom = isMotionAsset ? 1 : Number(scene.zoom || 1);
    const panX = isMotionAsset ? 0.5 : Number(scene.panX ?? 0.5);
    const panY = isMotionAsset ? 0.5 : Number(scene.panY ?? 0.5);
    const startSeconds = disclosureCursorFrames / outputFps;
    const endSeconds = (disclosureCursorFrames + frames) / outputFps;
    if (scene.label) aiDisclosureIntervals.push({ start: startSeconds, end: endSeconds, text: String(scene.label) });
    disclosureCursorFrames += frames;
    if (isMotionAsset) inputs.push('-i', asset);
    else inputs.push('-stream_loop', '-1', '-i', asset);
    const label = `v${i}`;
    const motionFraming = buildMotionCameraFilter({ camera: scene.camera || 'none', intensity: scene.intensity ?? 0.5, width: mediaStyle.width, height: mediaStyle.height, frames });
    const animation = scene.animation;
    const progress = `on/${Math.max(1, frames - 1)}`;
    const stillFraming = animation
      ? `scale=${mediaStyle.width}:${mediaStyle.height}:force_original_aspect_ratio=increase,crop=${mediaStyle.width}:${mediaStyle.height},zoompan=z='${Number(animation.startScale).toFixed(4)}+(${Number(animation.endScale - animation.startScale).toFixed(4)})*${progress}':x='(iw-iw/zoom)*(0.5+${Number(animation.startX).toFixed(4)}+(${Number(animation.endX - animation.startX).toFixed(4)})*${progress})':y='(ih-ih/zoom)*(0.5+${Number(animation.startY).toFixed(4)}+(${Number(animation.endY - animation.startY).toFixed(4)})*${progress})':d=${frames}:s=${mediaStyle.width}x${mediaStyle.height}:fps=${outputFps}`
      : `scale=${mediaStyle.width}:${mediaStyle.height}:force_original_aspect_ratio=increase,crop=${mediaStyle.width}:${mediaStyle.height},scale=ceil(iw*${zoom}/2)*2:ceil(ih*${zoom}/2)*2,crop=${mediaStyle.width}:${mediaStyle.height}:(in_w-out_w)*${panX}:(in_h-out_h)*${panY}`;
    const clip = isMotionAsset
      ? (isPaperKeyframe
        ? `[${i}:v]fps=24,${motionFraming},setsar=1,trim=end_frame=${frames},setpts=PTS-STARTPTS[${label}]`
        : `[${i}:v]fps=30,tpad=stop_mode=clone:stop_duration=${(frames / 30).toFixed(6)},${motionFraming},setsar=1,trim=end_frame=${frames},setpts=PTS-STARTPTS[${label}]`)
      : `[${i}:v]${stillFraming},setsar=${1},fps=${outputFps},trim=end_frame=${frames},setpts=PTS-STARTPTS[${label}]`;
    filters.push(clip);
    labels.push(`[${label}]`);
  });
  // v15 transition contracts are intentionally media-only and frame-preserving.
  // Legacy projects keep the original straight concat path byte-for-byte.
  const transitionSpec = project.transitionContract;
  if (!transitionSpec) {
    filters.push(`${labels.join('')}concat=n=${labels.length}:v=1:a=0[media]`);
  } else {
    if (transitionSpec.mode !== 'media-only' || !Array.isArray(transitionSpec.boundaries)) throw new Error('Invalid transitionContract schema');
    const boundaryByFrom = new Map();
    for (const boundary of transitionSpec.boundaries) {
      if (!Number.isInteger(boundary.from) || !Number.isInteger(boundary.to) || boundary.to !== boundary.from + 1) throw new Error('Transition boundaries must be adjacent 1-based scenes');
      if (!['dip-to-black', 'slide-left', 'hard-cut'].includes(boundary.type)) throw new Error(`Unsupported transition type: ${boundary.type}`);
      const legacyFrames = boundary.type === 'dip-to-black' ? 6 : boundary.type === 'slide-left' ? 8 : 0;
      const permitted = boundary.type === 'hard-cut'
        ? boundary.frames === 0
        : boundary.frames === legacyFrames || (boundary.frames >= 10 && boundary.frames <= 14);
      if (!permitted) throw new Error(`Transition ${boundary.from}->${boundary.to} requires ${legacyFrames} legacy frames or 10-14 explicit frames`);
      if (boundary.from < 1 || boundary.to > assets.length || boundaryByFrom.has(boundary.from)) throw new Error('Transition boundary index out of range or duplicated');
      boundaryByFrom.set(boundary.from - 1, boundary);
    }
    const sceneRefs = frameCounts.map((_, i) => ({ base: `[v${i}]`, start: `[v${i}]`, end: `[v${i}]` }));
    for (let i = 0; i < frameCounts.length; i += 1) {
      const incoming = transitionSpec.boundaries.find((b) => b.to === i + 1 && b.type !== 'hard-cut');
      const outgoing = transitionSpec.boundaries.find((b) => b.from === i + 1 && b.type !== 'hard-cut');
      const count = 1 + (incoming ? 1 : 0) + (outgoing ? 1 : 0);
      if (count > 1) {
        const outs = Array.from({ length: count }, (_, n) => `[v${i}_${n}]`).join('');
        filters.push(`[v${i}]split=${count}${outs}`);
        const refs = Array.from({ length: count }, (_, n) => `[v${i}_${n}]`);
        sceneRefs[i] = { base: refs[0], start: incoming ? refs[1] : refs[0], end: outgoing ? refs[count - 1] : refs[0] };
      }
    }
    const sequence = [];
    const trim = (ref, frames, startFrame, endFrame, suffix = '', include = true) => {
      const out = `[tr_${sequence.length}_${suffix || 'x'}]`;
      const start = (startFrame / outputFps).toFixed(6);
      const end = endFrame === undefined ? '' : `:end=${(endFrame / outputFps).toFixed(6)}`;
      filters.push(`${ref}trim=start=${start}${end},setpts=PTS-STARTPTS,scale=${mediaStyle.width}:${mediaStyle.height},setsar=1${suffix ? `,${suffix}` : ''}${out}`);
      if (include) sequence.push(out);
      return out;
    };
    for (let i = 0; i < frameCounts.length; i += 1) {
      const frames = frameCounts[i];
      const incoming = transitionSpec.boundaries.find((b) => b.to === i + 1 && b.type !== 'hard-cut');
      const outgoing = transitionSpec.boundaries.find((b) => b.from === i + 1 && b.type !== 'hard-cut');
      const incomingFrames = incoming?.frames || 0;
      const outgoingFrames = outgoing?.frames || 0;
      const skip = incoming ? (incoming.type === 'dip-to-black' ? Math.floor(incomingFrames / 2) : incomingFrames) : 0;
      if (outgoing?.type === 'dip-to-black') {
        const outgoingHalf = Math.ceil(outgoingFrames / 2);
        trim(sceneRefs[i].base, frames, skip, frames - outgoingHalf);
        trim(sceneRefs[i].end, frames, frames - outgoingHalf, frames, `fade=t=out:st=0:d=${(outgoingHalf / outputFps).toFixed(6)}`);
      } else if (incoming?.type === 'dip-to-black') {
        trim(sceneRefs[i].base, frames, skip, undefined);
      } else if (incoming?.type === 'slide-left') {
        trim(sceneRefs[i].base, frames, skip, undefined);
      } else {
        trim(sceneRefs[i].base, frames, 0, undefined);
      }
      if (outgoing?.type === 'dip-to-black') {
        const next = i + 1;
        const bRef = sceneRefs[next]?.start;
        if (!bRef) throw new Error(`Transition ${i + 1}->${next + 1} missing destination scene`);
        const incomingHalf = Math.floor(outgoingFrames / 2);
        trim(bRef, frameCounts[next], 0, incomingHalf, `fade=t=in:st=0:d=${(incomingHalf / outputFps).toFixed(6)}`);
      } else if (outgoing?.type === 'slide-left') {
        const next = i + 1;
        const bRef = sceneRefs[next]?.start;
        if (!bRef) throw new Error(`Transition ${i + 1}->${next + 1} missing destination scene`);
        const aLast = trim(sceneRefs[i].end, frames, frames - 1, frames, `tpad=stop_mode=clone:stop_duration=${((outgoingFrames - 1) / outputFps).toFixed(6)},trim=end_frame=${outgoingFrames}`, false);
        const bHead = trim(bRef, frameCounts[next], 0, outgoingFrames, '', false);
        const stacked = `[stack_${i}]`;
        const trans = `[slide_${i}]`;
        filters.push(`${aLast}${bHead}hstack=inputs=2${stacked};${stacked}crop=w=${mediaStyle.width}:h=${mediaStyle.height}:x='${mediaStyle.width}*n/${Math.max(1, outgoingFrames - 1)}':y=0${trans}`);
        sequence.push(trans);
      }
    }
    if (!sequence.length) throw new Error('Transition contract produced no media segments');
    filters.push(`${sequence.join('')}concat=n=${sequence.length}:v=1:a=0[media]`);
  }
  const title1Path = path.join(workDir, 'title-line1.txt'); const title2Path = path.join(workDir, 'title-line2.txt'); await fsp.writeFile(title1Path, project.title.line1, 'utf8'); await fsp.writeFile(title2Path, project.title.line2, 'utf8');
  tokens.primitive.font.family = 'School Shorts V3 Noto Sans KR';
  const font = escapeFilterPath(titleFontPath); const ass = escapeFilterPath(assPath); const t1 = escapeFilterPath(title1Path); const t2 = escapeFilterPath(title2Path); const fontsDir = escapeFilterPath(workDir);
  const titleStyle = tokens.component.title;
  const titleSafeWidth = Math.min(Number(project.captionPreset?.safeWidth || 920), tokens.primitive.canvas.width - 96);
  const titleLine1Size = fitTitleFontSize(project.title.line1, titleStyle.line1Size, titleSafeWidth);
  const titleLine2Size = fitTitleFontSize(project.title.line2, titleStyle.line2Size, titleSafeWidth);
  const disclosureY = mediaStyle.y + mediaStyle.height + 18;
  const disclosureEnable = aiDisclosureIntervals.map((interval) => `between(t\\,${interval.start.toFixed(3)}\\,${interval.end.toFixed(3)})`).join('+');
  const disclosureFilter = disclosureEnable
    ? `,drawtext=fontfile='${font}':text='사건 내용 기반 AI 재구성':fontcolor=white@0.74:fontsize=24:x=w-tw-72:y=${disclosureY}:enable='${disclosureEnable}'`
    : '';
  filters.push(`[media]pad=${tokens.primitive.canvas.width}:${tokens.primitive.canvas.height}:${mediaStyle.x}:${mediaStyle.y}:color=${tokens.semantic.background}${disclosureFilter},drawtext=fontfile='${font}':textfile='${t1}':expansion=none:fontcolor=${tokens.semantic.titleAccent}:fontsize=${titleLine1Size}:x=(w-text_w)/2:y=${titleStyle.line1Y},drawtext=fontfile='${font}':textfile='${t2}':expansion=none:fontcolor=${tokens.semantic.titleSecondary}:fontsize=${titleLine2Size}:x=(w-text_w)/2:y=${titleStyle.line2Y},subtitles='${ass}':fontsdir='${fontsDir}'[vout]`);
  const finalAudioCodecArgs = !isPaperKeyframe && path.extname(finalAudioPath).toLowerCase() === '.m4a'
    ? ['-c:a', 'copy']
    : ['-c:a', 'aac', '-b:a', '192k'];
  const audioTimelineArgs = isPaperKeyframe ? ['-af', `apad=whole_dur=${duration.toFixed(6)}`] : [];
  await run(ffmpegExecutable, ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-i', finalAudioPath, '-filter_complex', filters.join(';'), '-map', '[vout]', '-map', `${assets.length}:a:0`, ...audioTimelineArgs, '-t', String(duration), '-r', String(outputFps), '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', ...finalAudioCodecArgs, '-movflags', '+faststart', tmpPath]);
  const info = JSON.parse(await run(ffprobeExecutable, ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames,duration', '-of', 'json', tmpPath], true)); const stream = info.streams?.[0]; if (!stream || Number(stream.width) !== 1080 || Number(stream.height) !== 1920 || Number(stream.nb_read_frames) !== totalFrames || String(stream.r_frame_rate) !== `${outputFps}/1`) throw new Error(`Rendered output validation failed: expected ${totalFrames} frames at ${outputFps}fps, got ${JSON.stringify(stream)}`);
  if (thumbnailOverride) await fsp.copyFile(thumbnailOverride.imagePath, thumbPath);
  else {
    const seek = thumbnailSeek(totalFrames, Number(stream.duration || duration));
    await run(ffmpegExecutable, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(seek), '-i', tmpPath, '-frames:v', '1', thumbPath]);
  }
  const thumbProbe = await run(ffprobeExecutable, ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'json', thumbPath], true);
  const thumbnailStream = JSON.parse(thumbProbe).streams?.[0];
  if (!thumbnailStream?.codec_name?.includes('png') || Number(thumbnailStream.width) !== 1080 || Number(thumbnailStream.height) !== 1920) throw new Error('Thumbnail validation failed: expected 1080x1920 PNG');
  if (thumbnailOverride) {
    const copiedHash = crypto.createHash('sha256').update(await fsp.readFile(thumbPath)).digest('hex');
    if (copiedHash !== thumbnailOverride.sha256) throw new Error('Thumbnail override copy hash mismatch');
  }
  await fsp.rename(tmpPath, outPath);
  if (process.env.OPENCUT_TEST_FAIL_AFTER === 'final-rename') throw new Error('Injected failure after final rename');
  const handoffFile = `${versionId}.handoff.json`;
  const metadata = attachNarrationProvenance({ versionId, path: outPath, thumbnailPath: thumbPath, fileName: path.basename(outPath), thumbnailFileName: path.basename(thumbPath), thumbnail: path.basename(thumbPath), ...(thumbnailOverride ? { thumbnailOverride: { ...project.thumbnail } } : {}), videoUrl: `/api/renders/final?versionId=${versionId}`, thumbnailUrl: `/api/renders/final/thumbnail?versionId=${versionId}`, title: `${project.title.line1} ${project.title.line2}`.trim(), duration: Number(stream.duration || duration), frames: totalFrames, fps: outputFps, resolution: { width: 1080, height: 1920 }, videoEncoding: { codec: 'libx264', preset: 'medium', crf: 17, pixelFormat: 'yuv420p' }, template: 'reference-v3', templateId: 'reference-v3', timestamp: new Date().toISOString(), handoffFile, ...(sourceIntegrity ? { sourceIntegrity } : {}), ...(project.motionEvidence ? { motionEvidence: project.motionEvidence } : {}), ...(bgmProvenance ? { bgm: bgmProvenance } : {}), ...(project.media ? { media: project.media } : {}), ...(project.releaseGate ? { publishable: project.releaseGate.publishable, releaseStatus: project.releaseGate.releaseStatus, releaseGate: project.releaseGate } : {}) }, narrationProvenance);
if (paperKeyframeScenes.length) metadata.paperKeyframeTimeline = { schema: 'paper-cut-keyframe-timeline-v1', applied: true, fps: outputFps, durationSeconds: duration, sceneCount: paperKeyframeScenes.length, boundaryTransitionCount: project.transitionContract?.boundaries?.length || 0, sceneFrameSum: frameCounts.reduce((sum, value) => sum + Number(value), 0), sceneFramesAt24fps: sceneConfigs.map((scene) => Number(scene.duration) * 24), animationMode: 'ffmpeg-deterministic-keyframes-v1', continuousBeds: ['owner-narration', ...(bgmSourcePath ? ['bgm'] : [])] };
  let privateHandoffPath;
  {
    await Promise.all([...(versionDir ? [fsp.mkdir(versionDir, { recursive: true })] : []), fsp.mkdir(handoffRoot, { recursive: true })]);
    const handoffAssets = [];
    const handoffNames = new Set();
    for (let index = 0; index < assets.length; index += 1) {
      const name = path.basename(assets[index]);
      if (handoffNames.has(name)) continue;
      handoffNames.add(name);
      const destination = path.join(handoffRoot, name);
      const isMotionAsset = ['.mp4', '.mov', '.webm'].includes(path.extname(assets[index]).toLowerCase());
      if (isMotionAsset) {
        const frames = frameCounts[index];
        const paperIncoming = isPaperKeyframe ? project.transitionContract?.boundaries?.find((boundary) => boundary.to === index + 1 && boundary.type === 'dip-to-black') : null;
        const paperOutgoing = isPaperKeyframe ? project.transitionContract?.boundaries?.find((boundary) => boundary.from === index + 1 && boundary.type === 'dip-to-black') : null;
        const paperFades = [];
        if (paperIncoming) { const incomingFrames = Math.floor(paperIncoming.frames / 2); paperFades.push(`fade=t=in:st=0:d=${(incomingFrames / outputFps).toFixed(6)}`); }
        if (paperOutgoing) { const outgoingFrames = Math.ceil(paperOutgoing.frames / 2); paperFades.push(`fade=t=out:st=${((frames - outgoingFrames) / outputFps).toFixed(6)}:d=${(outgoingFrames / outputFps).toFixed(6)}`); }
        const handoffVideoFilter = isPaperKeyframe ? [`fps=24`, `trim=end_frame=${frames}`, 'setpts=PTS-STARTPTS', ...paperFades].join(',') : `fps=30,tpad=stop_mode=clone:stop_duration=${(frames / 30).toFixed(6)},trim=end_frame=${frames},setpts=PTS-STARTPTS`;
        await run(ffmpegExecutable, [
          '-hide_banner', '-loglevel', 'error', '-y', '-i', assets[index],
           '-vf', handoffVideoFilter,
          '-an', '-r', String(outputFps), '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
          destination,
        ]);
      } else {
        await fsp.copyFile(assets[index], destination);
      }
      const mime = handoffMime(destination);
      if (!mime) throw new Error(`Unsupported handoff asset: ${name}`);
      handoffAssets.push({ name, path: path.relative(root, destination).replaceAll(path.sep, '/'), mime });
    }
    const narrationName = 'narration-retimed.m4a';
    const narrationPath = path.join(handoffRoot, narrationName);
    if (path.extname(audioPath).toLowerCase() === '.m4a') await fsp.copyFile(audioPath, narrationPath);
    else await run(ffmpegExecutable, ['-hide_banner', '-loglevel', 'error', '-y', '-i', audioPath, '-vn', '-c:a', 'aac', '-b:a', '192k', narrationPath]);
    const handoffAudioProbe = JSON.parse(await run(ffprobeExecutable, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', narrationPath], true));
    const handoffAudioDuration = Number(handoffAudioProbe.format?.duration || 0);
    if (!(handoffAudioDuration > 0)) throw new Error('Handoff narration duration probe returned zero');
    handoffAssets.push({ name: narrationName, path: path.relative(root, narrationPath).replaceAll(path.sep, '/'), mime: 'audio/mp4' });
    let scriptName = null;
    if (authoritativeScript) {
      scriptName = 'script.json';
      const scriptPath = path.join(handoffRoot, scriptName);
      await fsp.copyFile(authoritativeScript.path, scriptPath);
      handoffAssets.push({ name: scriptName, path: path.relative(root, scriptPath).replaceAll(path.sep, '/'), mime: 'application/json' });
    }
    let bgmName = null;
    if (bgmSourcePath && fs.existsSync(bgmSourcePath)) {
      bgmName = 'background-music.m4a';
      const bgmPath = path.join(handoffRoot, bgmName);
      await run(ffmpegExecutable, ['-hide_banner', '-loglevel', 'error', '-y', '-stream_loop', '-1', '-i', bgmSourcePath, '-t', String(duration), '-vn', '-c:a', 'aac', '-b:a', '192k', bgmPath]);
      handoffAssets.push({ name: bgmName, path: path.relative(root, bgmPath).replaceAll(path.sep, '/'), mime: 'audio/mp4' });
    }
    const handoffThumbnailPath = path.join(handoffRoot, 'thumbnail.png');
    await fsp.copyFile(thumbPath, handoffThumbnailPath);
    if (process.env.OPENCUT_TEST_FAIL_AFTER === 'handoff-copy') throw new Error('Injected failure after handoff copy');
    handoffAssets.push({ name: 'thumbnail.png', path: path.relative(root, handoffThumbnailPath).replaceAll(path.sep, '/'), mime: 'image/png' });
    let sceneStartFrame = 0;
    const handoffTracks = assets.map((sceneAssetPath, index) => {
      const asset = handoffAssets.find((candidate) => candidate.name === path.basename(sceneAssetPath));
      if (!asset) throw new Error(`Handoff scene asset is unavailable: ${sceneAssetPath}`);
      const frames = frameCounts[index];
      const isMotionAsset = asset.mime.startsWith('video/');
      const track = {
        type: 'video',
        src: asset.name,
        start: sceneStartFrame / outputFps,
        duration: frames / outputFps,
        ...(isMotionAsset ? { sourceStart: 0, loop: false } : { loop: false }),
        videoStyle: { fit: mediaStyle.fit, xPx: mediaStyle.x, yPx: mediaStyle.y, widthPx: mediaStyle.width, heightPx: mediaStyle.height },
      };
      sceneStartFrame += frames;
      return track;
    });
    handoffTracks.unshift({ type: 'audio', src: narrationName, start: 0, duration: handoffAudioDuration });
    if (bgmName) handoffTracks.unshift({ type: 'audio', src: bgmName, start: 0, duration, audioStyle: { volumeDb: Number(project.bgm?.volumeDb ?? -25), duckUnderNarration: project.bgm?.duckUnderNarration !== false } });
    handoffTracks.unshift({ type: 'asset', src: 'thumbnail.png', start: 0, duration });
    for (const interval of aiDisclosureIntervals) {
      handoffTracks.unshift({ type: 'text', text: interval.text, start: interval.start, duration: interval.end - interval.start, textStyle: { fontFamily: referenceFontFamily, fontWeight: 'bold', fontSizePx: 24, color: '#FFFFFF', textAlign: 'right', centerXPx: 810, topPx: disclosureY, lineHeight: 1, background: false } });
    }
    handoffTracks.unshift(
      { type: 'text', text: project.title.line2, start: 0, duration, textStyle: { fontFamily: referenceFontFamily, fontWeight: 'bold', fontSizePx: titleLine2Size, color: tokens.semantic.titleSecondary, textAlign: 'center', centerXPx: tokens.primitive.canvas.width / 2, topPx: titleStyle.line2Y, lineHeight: 1, background: false } },
    );
    handoffTracks.unshift(
      { type: 'text', text: project.title.line1, start: 0, duration, textStyle: { fontFamily: referenceFontFamily, fontWeight: 'bold', fontSizePx: titleLine1Size, color: tokens.semantic.titleAccent, textAlign: 'center', centerXPx: tokens.primitive.canvas.width / 2, topPx: titleStyle.line1Y, lineHeight: 1, background: false } },
    );
    const editableTrackContract = buildEditableTrackContract({ scriptAsset: scriptName, scriptSha256, narrationAsset: narrationName, visualTrackCount: assets.length, captionCueCount: cues.length, bgmAsset: bgmName, bgmRequired: project.bgm?.required === true });
    const handoff = attachNarrationProvenance({ versionId, project: { ...(editorProjectId ? { id: editorProjectId } : {}), name: `${project.title.line1} ${project.title.line2}`.trim(), width: 1080, height: 1920, fps: outputFps }, captionPreset: project.captionPreset, captionRules: effectiveCaptionRules, editableTrackContract, ...(isPaperKeyframe ? { paperKeyframeTimeline: { schema: 'paper-cut-keyframe-timeline-v1', animationMode: 'ffmpeg-deterministic-keyframes-v1', transitionContract: project.transitionContract, exactFrameSum: totalFrames } } : {}), ...(thumbnailOverride ? { thumbnailOverride: { ...project.thumbnail } } : {}), ...(sourceIntegrity ? { sourceIntegrity } : {}), ...(project.motionEvidence ? { motionEvidence: project.motionEvidence } : {}), ...(bgmProvenance ? { bgm: bgmProvenance } : {}), ...(project.media ? { media: project.media } : {}), ...(project.releaseGate ? { publishable: project.releaseGate.publishable, releaseStatus: project.releaseGate.releaseStatus, releaseGate: project.releaseGate } : {}), assets: handoffAssets, tracks: handoffTracks, cues: cues.map((cue) => ({ start: Number(cue.start), end: Number(cue.end), text: String(cue.text), ...(Array.isArray(cue.anchors) ? { anchors: cue.anchors } : {}) })), fallback: { video: path.basename(outPath), thumbnail: path.basename(thumbPath) } }, narrationProvenance);
    if (versionDir) {
      await writeAtomic(path.join(versionDir, handoffFile), JSON.stringify(handoff, null, 2) + '\n');
      await writeAtomic(path.join(versionDir, `${versionId}.json`), JSON.stringify(metadata, null, 2) + '\n');
      await writeAtomic(path.join(outDir, 'latest-render.json'), JSON.stringify(metadata, null, 2) + '\n');
    } else {
      privateHandoffPath = path.join(handoffRoot, 'handoff.json');
      await writeAtomic(privateHandoffPath, JSON.stringify(handoff, null, 2) + '\n');
    }
  }
  const producerResult = { ...metadata, ...(privateHandoffPath ? { handoffPath: privateHandoffPath } : {}), registered: !noRegister, ...(metadataOutputPath ? { producerAuthoritySha256: metadataAuthoritySha256 } : {}) };
  if (metadataOutputPath) await writeAtomic(metadataOutputPath, `${JSON.stringify(producerResult, null, 2)}\n`);
  console.log(JSON.stringify(producerResult, null, 2));
} catch (error) {
  await Promise.all([
    fsp.rm(outPath, { force: true }),
    fsp.rm(thumbPath, { force: true }),
    fsp.rm(handoffRoot, { recursive: true, force: true }),
    ...(registryRecordPath ? [fsp.rm(registryRecordPath, { force: true })] : []),
    ...(registryHandoffPath ? [fsp.rm(registryHandoffPath, { force: true })] : []),
  ].map((operation) => operation.catch(() => undefined)));
  if (latestRenderPath) {
    if (previousLatest) await writeAtomic(latestRenderPath, previousLatest.toString('utf8')).catch(() => undefined);
    else await fsp.rm(latestRenderPath, { force: true }).catch(() => undefined);
  }
  const failureDir = path.join(outDir, '.private', `${project.id}-${runId}-failed`);
  await fsp.mkdir(path.dirname(failureDir), { recursive: true });
  await fsp.cp(workDir, failureDir, { recursive: true, force: false });
  await writeAtomic(path.join(failureDir, 'failure.json'), `${JSON.stringify({
    projectId: project.id,
    versionId,
    projectConfigSha256,
    scriptSha256,
    narrationConfigSha256,
    error: error instanceof Error ? error.message : String(error),
    failedAt: new Date().toISOString(),
  }, null, 2)}\n`);
  throw error;
} finally { await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {}); }

function run(command, argv, capture = false, options = {}) { assertToolBundleForCommand(command); return new Promise((resolve, reject) => { const { timeoutMs, ...spawnOptions } = options; const child = spawn(command, argv, { cwd: root, ...spawnOptions, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', shell: false }); let out = ''; let err = ''; let timedOut = false; const timer = timeoutMs ? setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs) : null; if (capture) { child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { err += d; }); } child.on('error', (error) => { if (timer) clearTimeout(timer); reject(error); }); child.on('close', (code) => { if (timer) clearTimeout(timer); if (timedOut) reject(new Error(`${command} timed out after ${timeoutMs}ms`)); else if (code) reject(new Error(`${command} failed (${code}): ${err}`)); else resolve(out); }); }); }
function runDiagnostic(command, argv) { assertToolBundleForCommand(command); return new Promise((resolve, reject) => { const child = spawn(command, argv, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], shell: false }); let err = ''; child.stderr.on('data', (d) => { err += d; }); child.on('error', reject); child.on('close', (code) => code ? reject(new Error(`${command} failed (${code}): ${err}`)) : resolve(err)); }); }
function handoffMime(filePath) {
  return new Map([
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.mp4', 'video/mp4'],
    ['.mov', 'video/quicktime'],
    ['.webm', 'video/webm'],
    ['.json', 'application/json'],
  ]).get(path.extname(filePath).toLowerCase());
}
