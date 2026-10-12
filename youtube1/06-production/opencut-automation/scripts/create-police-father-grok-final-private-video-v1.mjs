import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Retired bypass guard. This predecessor hard-coded divergent title/caption
// tracks and is preserved only as immutable audit evidence. New renders must
// use the layout-bound v5r1 creator and verifier.
if (process.env.NEWSROOM_ALLOW_RETIRED_V4 !== '1') {
  throw new Error('retired v4 final renderer blocked: use create-police-father-grok-final-private-video-v5.mjs');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectId = 'research-6b1a8af9b4143acb';
const sourceRoot = path.join(root, 'out', 'newsroom', 'grok-sources', projectId);
const executionManifestPath = path.join(sourceRoot, 'execution-v2-character-pack-autonomous', 'execution-manifest-v2.json');
const narrationRoot = path.join(root, 'out', 'newsroom', 'narration-revisions', projectId, 'partial-qa-v1-eb9b25b00f5e200f');
const narrationPath = path.join(narrationRoot, 'narration-final.m4a');
const handoffPath = path.join(narrationRoot, 'handoff.json');
const srtPath = path.join(narrationRoot, 'provider.srt');
const outputRoot = path.join(root, 'out', '.private', projectId, 'grok-final-v4');
const workRoot = path.join(outputRoot, 'work');
const finalPath = path.join(outputRoot, 'police-father-grok-final-private-v1.mp4');
const manifestPath = path.join(outputRoot, 'final-manifest-v1.json');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const read = (p) => fs.readFileSync(p);
const assert = (v, m) => { if (!v) throw new Error(m); };
const run = (args, label) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${label} failed: ${r.stderr || r.stdout}`);
};

assert(fs.existsSync(executionManifestPath), 'execution-v2 manifest missing');
const executionBytes = read(executionManifestPath);
const execution = JSON.parse(executionBytes.toString('utf8'));
const executionSha = sha(executionBytes);
assert(executionSha === 'cbfd8a618ded4fcd6415d88dc4a632fdf244f04998c7df0c897c41369b4bd008', 'execution-v2 manifest drift');
assert(execution.permissions?.privateRender === true && execution.permissions?.upload === false && execution.permissions?.publication === false && execution.permissions?.stage07 === false, 'private gates invalid');
assert(execution.requests?.length === 18, 'expected 18 requests');

const sourceFiles = new Map([
  ['cut-001', 'cut-001/provider-web-v7-neutral-character/cut-001-grok-provider-source-v7-neutral-character.mp4'],
  ['cut-002', 'cut-002/provider-web-v1-character-autonomous/cut-002-grok-provider-source-v1.mp4'],
  ...Array.from({ length: 16 }, (_, i) => {
    const n = String(i + 3).padStart(3, '0');
    return [`cut-${n}`, `cut-${n}/provider-web-v1-character-pack/cut-${n}-grok-provider-source-v1.mp4`];
  }),
]);
const selections = [
  ['cut-001', 0.50, 3.50], ['cut-002', 1.00, 4.00], ['cut-003', 1.00, 4.00], ['cut-004', 0.75, 4.75],
  ['cut-005', 1.00, 4.50], ['cut-006', 1.50, 4.00], ['cut-007', 1.00, 4.00], ['cut-008', 0.75, 4.75],
  ['cut-009', 1.00, 4.00], ['cut-010', 1.50, 4.50], ['cut-011', 1.00, 4.00], ['cut-012', 0.75, 4.25],
  ['cut-013', 1.50, 4.00], ['cut-014', 1.00, 4.00], ['cut-015', 1.00, 4.00], ['cut-016', 1.00, 4.00],
  ['cut-017', 1.00, 4.00], ['cut-018', 1.50, 3.50],
];
const slots = new Map(selections.map(([cutId, selectedInSeconds, selectedOutSeconds]) => [cutId, { cutId, selectedInSeconds, selectedOutSeconds, durationSeconds: selectedOutSeconds - selectedInSeconds }]));
const expectedDurations = [3, 3, 3, 4, 3.5, 2.5, 3, 4, 3, 3, 3, 3.5, 2.5, 3, 3, 3, 3, 2];
assert(selections.length === 18 && Math.abs(expectedDurations.reduce((a, b) => a + b, 0) - 55) < 1e-6, 'timeline duration invalid');
for (const [idx, req] of execution.requests.entries()) {
  const sel = slots.get(req.cutId); assert(sel && Math.abs(sel.durationSeconds - expectedDurations[idx]) < 1e-6, `slot mismatch ${req.cutId}`);
  const rel = sourceFiles.get(req.cutId); assert(rel, `source missing ${req.cutId}`);
  const p = path.resolve(sourceRoot, rel); const st = fs.lstatSync(p);
  assert(st.isFile() && !st.isSymbolicLink(), `provider source is not a physical file ${req.cutId}`);
  const bytes = read(p); assert(bytes.length > 0, `empty provider source ${req.cutId}`);
  sel.provider = { file: path.relative(root, p).replaceAll('\\', '/'), bytes: bytes.length, sha256: sha(bytes) };
}

fs.mkdirSync(workRoot, { recursive: true });
const clipPaths = [];
for (const [idx, [cutId]] of selections.entries()) {
  const sel = slots.get(cutId); const frames = Math.round(sel.durationSeconds * 24);
  const source = path.resolve(root, sel.provider.file);
  const target = path.join(workRoot, `${cutId}-trim-480.mp4`);
  const vf = [`trim=start=${sel.selectedInSeconds}:duration=${sel.durationSeconds}`, 'setpts=PTS-STARTPTS', 'scale=480:480:flags=lanczos', 'fps=24'];
  if (cutId === 'cut-010') {
    vf.push('drawbox=x=20:y=75:w=200:h=80:color=0xead9af@1:t=fill', 'drawbox=x=20:y=155:w=195:h=280:color=0xead9af@1:t=fill', 'drawbox=x=315:y=75:w=145:h=90:color=0x722035@1:t=fill', 'drawbox=x=315:y=155:w=145:h=280:color=0x722035@1:t=fill');
  }
  run(['-y', '-i', source, '-vf', vf.join(','), '-frames:v', String(frames), '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', target], `trim ${cutId}`);
  assert(fs.existsSync(target), `trim output missing ${cutId}`);
  sel.trim = { file: path.relative(root, target).replaceAll('\\', '/'), bytes: fs.statSync(target).size, sha256: sha(read(target)) , frames };
  clipPaths.push(target);
}

const concatList = path.join(workRoot, 'concat.txt');
fs.writeFileSync(concatList, clipPaths.map((p) => `file '${p.replaceAll("'", "'\\''")}'`).join('\n') + '\n', { encoding: 'utf8' });
const concatPath = path.join(workRoot, 'concat-480.mp4');
run(['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-an', '-c', 'copy', concatPath], 'concat');

const handoffBytes = read(handoffPath);
const handoff = JSON.parse(handoffBytes.toString('utf8'));
assert(handoff.schema === 'newsroom-approved-narration-handoff-v2' && handoff.cueCount === 7 && handoff.sourceIntegrity, 'approved narration handoff invalid');
assert(handoff.audioSha256 === sha(read(narrationPath)) && handoff.durationSeconds === 55.016, 'narration authority drift');
const cues = handoff.cues.map((cue) => ({ start: cue.start, end: cue.end, text: cue.text }));
const escAss = (t) => t.replace(/[{}]/g, '').replace(/\r?\n/g, ' ');
const splitText = (text) => {
  const words = text.split(/\s+/).filter(Boolean); const out = []; let current = '';
  for (const word of words) { const candidate = current ? `${current} ${word}` : word; if (candidate.length > 23 && current) { out.push(current); current = word; } else current = candidate; }
  if (current) out.push(current); return out.length ? out : [text];
};
const assTime = (seconds) => { const cs = Math.max(0, Math.round(seconds * 100)); const h = Math.floor(cs / 360000); const m = Math.floor((cs % 360000) / 6000); const s = Math.floor((cs % 6000) / 100); const c = cs % 100; return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`; };
let events = '';
for (const cue of cues) {
  const chunks = splitText(cue.text); const span = cue.end - cue.start; const total = chunks.reduce((n, t) => n + t.length, 0); let cursor = cue.start;
  chunks.forEach((chunk, i) => { const d = i === chunks.length - 1 ? cue.end - cursor : span * (chunk.length / total); const mid = chunk.length > 12 ? `${chunk.slice(0, Math.ceil(chunk.length / 2))}\\N${chunk.slice(Math.ceil(chunk.length / 2))}` : chunk; events += `Dialogue: 0,${assTime(cursor)},${assTime(cursor + d)},Caption,,0,0,0,,{\\an5\\pos(540,1400)}${escAss(mid)}\n`; cursor += d; });
}
const assPath = path.join(workRoot, 'tracks.ass');
const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Title,Malgun Gothic,120,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,1,5,30,30,30,1\nStyle: Title2,Malgun Gothic,143,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,1,5,30,30,30,1\nStyle: Caption,Malgun Gothic,58,&H00FFFFFF,&H00FFFFFF,&H00000000,&H90000000,1,0,0,0,100,100,0,0,1,2,1,5,40,40,40,1\nStyle: Disclosure,Malgun Gothic,28,&H00D0D0D0,&H00D0D0D0,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,1,0,7,0,0,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 10,0:00:00.00,0:00:55.02,Title,,0,0,0,,{\\an5\\pos(540,201)}경찰 아버지가\\N\nDialogue: 10,0:00:00.00,0:00:55.02,Title2,,0,0,0,,{\\an5\\pos(540,326)}부순 휴대전화\nDialogue: 4,0:00:00.00,0:00:55.02,Disclosure,,0,0,0,,{\\an7\\pos(70,1415)}사건 내용 기반 AI 재구성\n${events}`;
const overlayEvents = 'Dialogue: 8,0:00:29.00,0:00:32.00,Caption,,0,0,0,,{\\an5\\pos(300,860)}A 경감 주장\nDialogue: 8,0:00:29.00,0:00:32.00,Caption,,0,0,0,,{\\an5\\pos(840,860)}다른 사건 비교는\\N억울·부당\n';
const cleanAss = ass.replace(/경찰 아버지가\\N\nDialogue: 10/, '경찰 아버지가\nDialogue: 10').replace(/AI 재구성nDialogue: 0,/g, 'AI 재구성\nDialogue: 0,') + overlayEvents;
fs.writeFileSync(assPath, cleanAss, { encoding: 'utf8' });

const filterPath = assPath.replaceAll('\\', '/').replaceAll(':', '\\:');
const finalFilter = `scale=972:972:flags=lanczos,tpad=stop_mode=clone:stop_duration=0.1,setsar=1[media];color=c=black:s=1080x1920:r=24:d=55.016[bg];[bg][media]overlay=x=54:y=474:eof_action=pass:shortest=0[base];[base]ass='${filterPath}'[v]`;
run(['-y', '-i', concatPath, '-i', narrationPath, '-filter_complex', finalFilter, '-map', '[v]', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '24', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', finalPath], 'final assembly');
assert(fs.existsSync(finalPath), 'final video missing');
const finalBytes = read(finalPath);
const manifest = {
  schema: 'grok-final-private-video-v1', projectId, status: 'private-only', createdAt: new Date().toISOString(),
  authorities: { executionManifest: { file: path.relative(root, executionManifestPath).replaceAll('\\', '/'), sha256: executionSha }, narration: { file: path.relative(root, narrationPath).replaceAll('\\', '/'), sha256: sha(read(narrationPath)), handoff: path.relative(root, handoffPath).replaceAll('\\', '/'), handoffSha256: sha(handoffBytes), durationSeconds: 55.016, cues }, title: { line1: '경찰 아버지가', line2: '부순 휴대전화' } },
  permissions: { providerCall: true, privateRender: true, upload: false, publication: false, stage07: false },
  composition: { width: 1080, height: 1920, fps: 24, media: { x: 54, y: 474, width: 972, height: 972 }, title: { x: 540, y: [201, 326] }, captions: { x: 540, y: 1400 }, disclosure: '사건 내용 기반 AI 재구성' },
  cuts: selections.map(([cutId]) => slots.get(cutId)),
  captionTrack: { file: path.relative(root, assPath).replaceAll('\\', '/'), sha256: sha(read(assPath)), sourceSrt: { file: path.relative(root, srtPath).replaceAll('\\', '/'), sha256: sha(read(srtPath)) } },
  postProcessing: { cut010SafetyRedaction: { applied: true, reason: 'provider-generated unreadable card glyphs', normalizedBoxes: [{ x: 20, y: 75, width: 200, height: 80 }, { x: 20, y: 155, width: 195, height: 280 }, { x: 315, y: 75, width: 145, height: 90 }, { x: 315, y: 155, width: 145, height: 280 }], colors: ['#ead9af', '#722035'], coversCharacter: false } },
  supplementalVisualOverlay: { cutId: 'cut-010', startSeconds: 29, endSeconds: 32, events: [{ text: 'A 경감 주장', position: { x: 300, y: 860 } }, { text: '다른 사건 비교는\\N억울·부당', position: { x: 840, y: 860 } }], source: 'qualified-rebuttal-claim-c70549eed18d' },
  output: { file: path.relative(root, finalPath).replaceAll('\\', '/'), bytes: finalBytes.length, sha256: sha(finalBytes) },
};
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
if (fs.existsSync(manifestPath)) assert(read(manifestPath).equals(manifestBytes), 'final manifest drift'); else fs.writeFileSync(manifestPath, manifestBytes, { flag: 'wx' });
console.log(JSON.stringify({ finalPath, manifestPath, sha256: sha(finalBytes), bytes: finalBytes.length, executionSha }, null, 2));
