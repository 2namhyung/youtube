import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const automationRoot = path.dirname(scriptsRoot);
const projectRoot = path.join(automationRoot, 'production', 'projects', 'jeju-school-intrusion-short-v1');
const defaultManifest = path.join(projectRoot, 'style-audition-manifest-v16.json');
const arg = (name, fallback = null) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] || fallback : fallback; };
const styleId = arg('--style');
const manifestPath = path.resolve(arg('--manifest', defaultManifest));
const outputPath = path.resolve(arg('--out', path.join(automationRoot, 'out', `jeju-v16-style-audition-${styleId || 'style'}.mp4`)));
const dryRun = process.argv.includes('--dry-run');
if (!styleId) throw new Error('Usage: node scripts/assemble-v16-style-audition.mjs --style <style-id> [--out file.mp4] [--dry-run]');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const style = manifest.styles.find((entry) => entry.id === styleId);
if (!style) throw new Error(`Unknown style: ${styleId}`);
const sourceVideo = path.resolve(automationRoot, style.sourceVideo || manifest.render.audioSource);
const audioSource = path.resolve(automationRoot, manifest.render.audioSource);
if (!fs.existsSync(sourceVideo)) throw new Error(`Source video not found: ${sourceVideo}`);
if (!fs.existsSync(audioSource)) throw new Error(`Audio source not found: ${audioSource}`);
const scenes = manifest.sourceWindow.scenes;
const duration = manifest.output.frames / manifest.output.fps;
const inputs = [];
const filters = [];
const mediaLabels = [];
const isVideo = (asset) => ['.mp4', '.mov', '.webm'].includes(path.extname(asset).toLowerCase());

if (style.mode === 'source-trim') {
  inputs.push('-i', sourceVideo);
  filters.push(`[0:v]select='between(n\\,${manifest.sourceWindow.sourceStartFrame}\\,${manifest.sourceWindow.sourceEndFrameExclusive - 1})',setpts=N/${manifest.output.fps}/TB[video]`);
} else {
  scenes.forEach((scene, index) => {
    const entry = style.scenes.find((candidate) => candidate.id === scene.id);
    const asset = path.resolve(projectRoot, entry.asset);
    if (!fs.existsSync(asset)) throw new Error(`Missing ${styleId} placeholder asset: ${path.relative(projectRoot, asset)}`);
    if (isVideo(asset)) inputs.push('-i', asset); else inputs.push('-loop', '1', '-i', asset);
    const input = `[${index}:v]`;
    const frameCount = scene.frames;
    const prep = isVideo(asset)
      ? `${input}fps=${manifest.output.fps},tpad=stop_mode=clone:stop_duration=${(frameCount / manifest.output.fps).toFixed(6)},scale=1080:972:force_original_aspect_ratio=increase,crop=1080:972,trim=end_frame=${frameCount},setpts=PTS-STARTPTS`
      : `${input}scale=1080:972:force_original_aspect_ratio=increase,crop=1080:972,fps=${manifest.output.fps},trim=end_frame=${frameCount},setpts=PTS-STARTPTS`;
    filters.push(`${prep}[m${index}]`);
    mediaLabels.push(`[m${index}]`);
  });
  const s = mediaLabels;
  const sequence = [s[0], '[s1_head]', '[s1_tail]', '[s2_head]', '[s2_rest]', s[3], s[4], s[5]];
  filters.push(`${s[1]}split=2[s1a][s1b]`, `[s1a]trim=end_frame=52,setpts=PTS-STARTPTS[s1_head]`, `[s1b]trim=start_frame=52,setpts=PTS-STARTPTS,fade=t=out:st=0:d=0.1[s1_tail]`, `${s[2]}split=2[s2a][s2b]`, `[s2a]trim=end_frame=3,setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.1[s2_head]`, `[s2b]trim=start_frame=3,setpts=PTS-STARTPTS[s2_rest]`, `${sequence.join('')}concat=n=${sequence.length}:v=1:a=0[media]`);
  // Reuse the v15 top/bottom overlay bands so title, captions and disclosure
  // are identical across styles; only the 1080x972 media window changes.
  const refIndex = scenes.length;
  inputs.push('-i', audioSource);
  filters.push(`[${refIndex}:v]select='between(n\\,${manifest.sourceWindow.sourceStartFrame}\\,${manifest.sourceWindow.sourceEndFrameExclusive - 1})',setpts=N/${manifest.output.fps}/TB,split=2[refTop][refBottom]`, `[refTop]crop=1080:474:0:0[top]`, `[refBottom]crop=1080:474:0:1446[bottom]`, `[top][media][bottom]vstack=inputs=3,setsar=1,fps=${manifest.output.fps},trim=end_frame=${manifest.output.frames},setpts=N/${manifest.output.fps}/TB[video]`);
}

// Audio is always the same locked v15 window, independently trimmed from 5.5s.
const audioInputIndex = style.mode === 'source-trim' ? 1 : scenes.length + 1;
inputs.push('-i', audioSource);
filters.push(`[${audioInputIndex}:a]atrim=start=${manifest.sourceWindow.sourceStartSeconds.toFixed(6)}:end=${manifest.sourceWindow.sourceEndSeconds.toFixed(6)},asetpts=PTS-STARTPTS[audio]`);
const args = ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', filters.join(';'), '-map', '[video]', '-map', '[audio]', '-t', duration.toFixed(6), '-r', String(manifest.output.fps), '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outputPath];
if (dryRun) { console.log(JSON.stringify({ style: styleId, outputPath, sourceVideo, audioSource, frameCount: manifest.output.frames, durationSeconds: duration, ffmpeg: ['ffmpeg', ...args] }, null, 2)); process.exit(0); }
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const result = spawnSync('ffmpeg', args, { stdio: 'inherit', windowsHide: true });
if (result.status !== 0) throw new Error(`ffmpeg exited with status ${result.status}`);
console.log(JSON.stringify({ status: 'rendered', style: styleId, outputPath, frameCount: manifest.output.frames, durationSeconds: duration }, null, 2));
