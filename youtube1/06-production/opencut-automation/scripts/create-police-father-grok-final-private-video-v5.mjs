import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EDITORIAL_SHORTS_LAYOUT } from './newsroom-video-design-planner.mjs';
import { stableStringify } from './evidence-bundle.mjs';
import { formatReferenceCaptionCues, splitOverflowingReferenceCaptionCues, REFERENCE_CAPTION_RULES } from './production-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectId = 'research-6b1a8af9b4143acb';
const sourceRoot = path.join(root, 'out', 'newsroom', 'grok-sources', projectId);
const executionManifestPath = path.join(sourceRoot, 'execution-v2-character-pack-autonomous', 'execution-manifest-v2.json');
const narrationRoot = path.join(root, 'out', 'newsroom', 'narration-revisions', projectId, 'partial-qa-v1-eb9b25b00f5e200f');
const narrationPath = path.join(narrationRoot, 'narration-final.m4a');
const handoffPath = path.join(narrationRoot, 'handoff.json');
const srtPath = path.join(narrationRoot, 'provider.srt');
const outputRoot = path.join(root, 'out', '.private', projectId, 'grok-final-v5r1');
const workRoot = path.join(outputRoot, 'work');
const fontRoot = path.join(workRoot, 'fonts');
const finalPath = path.join(outputRoot, 'police-father-grok-final-private-v5r1.mp4');
const manifestPath = path.join(outputRoot, 'final-manifest-v5r1.json');
const qaPath = path.join(outputRoot, 'human-qa-v5r1.json');
const contactSheetPath = path.join(outputRoot, 'qa', 'final-contact-sheet-v5r1.png');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const read = (p) => fs.readFileSync(p);
const assert = (v, m) => { if (!v) throw new Error(m); };
const run = (exe, args, label) => { const r = spawnSync(exe, args, { encoding: 'utf8' }); if (r.status !== 0) throw new Error(`${label} failed: ${r.stderr || r.stdout}`); return r; };
const ffmpeg = (args, label) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], label);
const rel = (p) => path.relative(root, p).replaceAll('\\', '/');
const safePath = (p) => { const q = path.resolve(p); assert(q === root || q.startsWith(`${root}${path.sep}`), `path escaped root: ${p}`); return q; };

assert(fs.existsSync(executionManifestPath), 'execution-v2 manifest missing');
const executionBytes = read(executionManifestPath);
const executionSha = sha(executionBytes);
assert(executionSha === 'cbfd8a618ded4fcd6415d88dc4a632fdf244f04998c7df0c897c41369b4bd008', 'execution authority drift');
const execution = JSON.parse(executionBytes.toString('utf8'));
assert(execution.permissions?.privateRender === true && execution.permissions?.upload === false && execution.permissions?.publication === false && execution.permissions?.stage07 === false, 'private gates invalid');
assert(execution.requests?.length === 18, 'expected 18 Grok requests');

const sourceFiles = new Map([
  ['cut-001', 'cut-001/provider-web-v7-neutral-character/cut-001-grok-provider-source-v7-neutral-character.mp4'],
  ['cut-002', 'cut-002/provider-web-v1-character-autonomous/cut-002-grok-provider-source-v1.mp4'],
  ...Array.from({ length: 16 }, (_, i) => { const n = String(i + 3).padStart(3, '0'); return [`cut-${n}`, `cut-${n}/provider-web-v1-character-pack/cut-${n}-grok-provider-source-v1.mp4`]; }),
]);
const selections = [
  ['cut-001', 0.50, 3.50], ['cut-002', 1.00, 4.00], ['cut-003', 1.00, 4.00], ['cut-004', 0.75, 4.75],
  ['cut-005', 1.00, 4.50], ['cut-006', 1.50, 4.00], ['cut-007', 1.00, 4.00], ['cut-008', 0.75, 4.75],
  ['cut-009', 1.00, 4.00], ['cut-010', 1.50, 4.50], ['cut-011', 1.00, 4.00], ['cut-012', 0.75, 4.25],
  ['cut-013', 1.50, 4.00], ['cut-014', 1.00, 4.00], ['cut-015', 1.00, 4.00], ['cut-016', 1.00, 4.00],
  ['cut-017', 1.00, 4.00], ['cut-018', 1.50, 3.50],
];
const expectedDurations = [3, 3, 3, 4, 3.5, 2.5, 3, 4, 3, 3, 3, 3.5, 2.5, 3, 3, 3, 3, 2];
assert(expectedDurations.reduce((a, b) => a + b, 0) === 55, 'timeline must total 55 seconds');
const slots = new Map(selections.map(([cutId, selectedInSeconds, selectedOutSeconds]) => [cutId, { cutId, selectedInSeconds, selectedOutSeconds, durationSeconds: selectedOutSeconds - selectedInSeconds }]));
for (const [i, req] of execution.requests.entries()) {
  const slot = slots.get(req.cutId); assert(slot && Math.abs(slot.durationSeconds - expectedDurations[i]) < 1e-6, `slot mismatch ${req.cutId}`);
  const p = safePath(path.join(sourceRoot, sourceFiles.get(req.cutId))); const st = fs.lstatSync(p); assert(st.isFile() && !st.isSymbolicLink(), `provider source is not physical ${req.cutId}`);
  slot.provider = { file: rel(p), bytes: st.size, sha256: sha(read(p)) };
}

fs.mkdirSync(fontRoot, { recursive: true });
const fontSource = 'C:/Windows/Fonts/NotoSansKR-VF.ttf';
const captionFontPath = path.join(fontRoot, 'NotoSansKR-ExtraBold.ttf');
const titleFontPath = path.join(fontRoot, 'NotoSansKR-Black.ttf');
run('python', [path.join(root, 'scripts', 'build-v3-font.py'), fontSource, captionFontPath, '800'], 'build caption font');
run('python', [path.join(root, 'scripts', 'build-v3-font.py'), fontSource, titleFontPath, '900'], 'build title font');
const fonts = { caption: { file: rel(captionFontPath), sha256: sha(read(captionFontPath)), family: 'School Shorts V3 Noto Sans KR' }, title: { file: rel(titleFontPath), sha256: sha(read(titleFontPath)), family: 'School Shorts V3 Title Noto Sans KR' } };

const clipPaths = [];
for (const [cutId] of selections) {
  const slot = slots.get(cutId); const frames = Math.round(slot.durationSeconds * 24);
  const source = safePath(path.join(root, slot.provider.file)); const target = path.join(workRoot, `${cutId}-trim-480.mp4`); fs.mkdirSync(workRoot, { recursive: true });
  const vf = [`trim=start=${slot.selectedInSeconds}:duration=${slot.durationSeconds}`, 'setpts=PTS-STARTPTS', 'scale=480:480:flags=lanczos', 'fps=24'];
  if (cutId === 'cut-010') vf.push('drawbox=x=20:y=75:w=200:h=80:color=0xead9af@1:t=fill', 'drawbox=x=20:y=155:w=195:h=280:color=0xead9af@1:t=fill', 'drawbox=x=315:y=75:w=145:h=90:color=0x722035@1:t=fill', 'drawbox=x=315:y=155:w=145:h=280:color=0x722035@1:t=fill');
  ffmpeg(['-y', '-i', source, '-vf', vf.join(','), '-frames:v', String(frames), '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', target], `trim ${cutId}`);
  slot.trim = { file: rel(target), bytes: fs.statSync(target).size, sha256: sha(read(target)), frames }; clipPaths.push(target);
}
const concatList = path.join(workRoot, 'concat.txt'); fs.writeFileSync(concatList, clipPaths.map((p) => `file '${p.replaceAll("'", "'\\''")}'`).join('\n') + '\n', 'utf8');
const concatPath = path.join(workRoot, 'concat-480.mp4'); ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-an', '-c', 'copy', concatPath], 'concat clips');

const handoffBytes = read(handoffPath); const handoff = JSON.parse(handoffBytes.toString('utf8'));
assert(handoff.schema === 'newsroom-approved-narration-handoff-v2' && handoff.cueCount === 7 && handoff.audioSha256 === sha(read(narrationPath)) && handoff.durationSeconds === 55.016, 'approved narration authority drift');
const title = { line1: '경찰 아버지가', line2: '부순 휴대전화' };
const layoutValue = JSON.parse(JSON.stringify(EDITORIAL_SHORTS_LAYOUT)); const layoutSha = sha(Buffer.from(stableStringify(layoutValue), 'utf8'));
const rules = REFERENCE_CAPTION_RULES;
const captionRulesSha = sha(Buffer.from(stableStringify(rules), 'utf8'));

// Use the canonical Korean splitter first. If a wrapped line still exceeds the
// physical-font safe band, split only at the same allowed Korean boundaries and
// proportionally preserve the original handoff cue's time (including pauses).
const fontMetrics = (texts, fontPath, size, scaleX = 100) => {
  const py = `import json,sys\nfrom fontTools.ttLib import TTFont\nf=TTFont(sys.argv[1]); u=f['head'].unitsPerEm; cmap={}\nfor t in f['cmap'].tables: cmap.update(t.cmap)\nout=[]\nfor text in json.loads(sys.argv[2]):\n w=0\n for ch in text:\n  g=cmap.get(ord(ch),'.notdef'); w += f['hmtx'].metrics.get(g,(0,))[0]\n out.append(w/u*float(sys.argv[3])*float(sys.argv[4])/100)\nprint(json.dumps(out))`;
  return JSON.parse(run('python', ['-c', py, fontPath, JSON.stringify(texts), String(size), String(scaleX)], 'font metrics').stdout);
};
const lineWidth = (text, size = 88, fontPath = captionFontPath, scaleX = 94) => fontMetrics([String(text).replace(/\\N/g, '')], fontPath, size, scaleX)[0];
const splitCueToFit = (cue) => {
  let pending = [cue]; const output = [];
  while (pending.length) {
    const current = pending.shift(); const wrapped = formatReferenceCaptionCues([current], { targetGraphemesPerLine: rules.targetGraphemesPerLine, maxLines: rules.maxLines })[0];
    const widths = wrapped.text.split('\n').map((line) => lineWidth(line)); const maxWidth = Math.max(...widths);
    if (maxWidth + 10 <= layoutValue.captions.safeWidth) { output.push({ ...wrapped, renderedWidth: maxWidth }); continue; }
    const split = splitOverflowingReferenceCaptionCues([current], [{ renderedWidth: maxWidth }], { safeWidth: layoutValue.captions.safeWidth, outlineWidth: 5, targetGraphemesPerLine: 10, maxLines: 2, minDurationSeconds: rules.minDurationSeconds }).cues;
    assert(split.length === 2, `caption splitter did not split overflowing cue: ${current.text}`); pending.unshift(...split);
  }
  return output;
};
const captionCues = handoff.cues.flatMap(splitCueToFit);
const normalize = (s) => String(s).normalize('NFC').replace(/\s+/g, '');
const sourceNorm = normalize(handoff.cues.map((c) => c.text).join('')); const outputNorm = normalize(captionCues.map((c) => c.text).join(''));
assert(sourceNorm === outputNorm, 'caption text changed during semantic split');
assert(captionCues.every((c) => c.text.split('\n').length <= 2 && c.end > c.start && c.end - c.start >= rules.minDurationSeconds), 'caption line/duration contract invalid');
const titleWidths = fontMetrics([title.line1, title.line2], titleFontPath, 120, 100); assert(titleWidths[0] <= 920 && fontMetrics([title.line2], titleFontPath, 143, 100)[0] <= 920, 'title exceeds 920px at full size');
const assTime = (seconds) => { const cs = Math.max(0, Math.round(Number(seconds) * 100)); const h = Math.floor(cs / 360000); const m = Math.floor((cs % 360000) / 6000); const s = Math.floor((cs % 6000) / 100); return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`; };
const escapeAss = (text) => String(text).replace(/[{}\\]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\N');
const captionEvents = captionCues.map((cue) => `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Caption,,0,0,0,,{\\an2\\pos(540,1400)\\fscx94}${escapeAss(cue.text)}`);
const ass = `[Script Info]\nScriptType: v4.00+\nTitle: police-father-grok-final-v5r1\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Title,${fonts.title.family},120,&H00E8D327,&H00E8D327,&H00000000,&HFF000000,1,0,0,0,100,100,0,0,1,2,0,8,30,30,30,1\nStyle: Title2,${fonts.title.family},143,&H00FFFFFF,&H00FFFFFF,&H00000000,&HFF000000,1,0,0,0,100,100,0,0,1,2,0,8,30,30,30,1\nStyle: Caption,${fonts.caption.family},88,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,94,100,0,0,3,5,0,2,80,80,520,1\nStyle: Disclosure,${fonts.caption.family},24,&H00FFFFFF,&H00FFFFFF,&H00000000,&HFF000000,1,0,0,0,100,100,0,0,1,1,0,9,0,0,0,1\nStyle: Overlay,${fonts.caption.family},30,&H00FFFFFF,&H00FFFFFF,&H00000000,&HCC000000,1,0,0,0,100,100,0,0,3,2,0,5,0,0,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 10,0:00:00.00,0:00:55.02,Title,,0,0,0,,{\\an8\\pos(540,201)}${escapeAss(title.line1)}\nDialogue: 10,0:00:00.00,0:00:55.02,Title2,,0,0,0,,{\\an8\\pos(540,326)}${escapeAss(title.line2)}\nDialogue: 4,0:00:00.00,0:00:55.02,Disclosure,,0,0,0,,{\\an9\\pos(1008,1464)}사건 내용 기반 AI 재구성\nDialogue: 8,0:00:29.00,0:00:32.00,Overlay,,0,0,0,,{\\an5\\pos(300,860)}A 경감 주장\nDialogue: 8,0:00:29.00,0:00:32.00,Overlay,,0,0,0,,{\\an5\\pos(840,860)}다른 사건 비교는 억울·부당\n${captionEvents.join('\n')}\n`;
const assPath = path.join(workRoot, 'tracks-v5.ass'); fs.writeFileSync(assPath, ass, 'utf8');

const assFilterPath = assPath.replaceAll('\\', '/').replaceAll(':', '\\:').replaceAll("'", "\\'"); const fontsDirFilter = fontRoot.replaceAll('\\', '/').replaceAll(':', '\\:').replaceAll("'", "\\'");
const finalFilter = `scale=972:972:flags=lanczos,tpad=stop_mode=clone:stop_duration=0.1,setsar=1[media];color=c=black:s=1080x1920:r=24:d=55.016[bg];[bg][media]overlay=x=54:y=474:eof_action=pass:shortest=0[base];[base]ass='${assFilterPath}':fontsdir='${fontsDirFilter}'[v]`;
ffmpeg(['-y', '-i', concatPath, '-i', narrationPath, '-filter_complex', finalFilter, '-map', '[v]', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '24', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', finalPath], 'final v5 assembly');
fs.mkdirSync(path.dirname(contactSheetPath), { recursive: true }); ffmpeg(['-y', '-i', finalPath, '-vf', "fps=1/3,scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2:black,tile=4x5", '-frames:v', '1', contactSheetPath], 'contact sheet');

const layoutAuthority = { module: 'scripts/newsroom-video-design-planner.mjs', export: 'EDITORIAL_SHORTS_LAYOUT', value: layoutValue, sha256: layoutSha };
const manifest = {
  schema: 'grok-final-private-video-v5r1', projectId, status: 'private-only', createdAt: new Date().toISOString(),
  authorities: { executionManifest: { file: rel(executionManifestPath), sha256: executionSha }, narration: { file: rel(narrationPath), sha256: sha(read(narrationPath)), handoff: rel(handoffPath), handoffSha256: sha(handoffBytes), durationSeconds: 55.016, cues: handoff.cues }, layout: layoutAuthority, captionRules: { file: rel(path.join(root, 'knowledge', 'wiki', 'concepts', 'caption-generation-rules.md')), sha256: sha(read(path.join(root, 'knowledge', 'wiki', 'concepts', 'caption-generation-rules.md'))), value: rules, sha256Json: captionRulesSha }, fonts, title: { line1: title.line1, line2: title.line2, fontFamily: fonts.title.family, sizes: [120, 143], safeWidth: 920, measuredWidths: titleWidths } },
  permissions: { providerCall: true, privateRender: true, upload: false, publication: false, stage07: false },
  composition: { ...layoutValue, title: { ...layoutValue.title, fontFamily: fonts.title.family, fontSizes: [120, 143], measuredWidths: titleWidths }, captions: { ...layoutValue.captions, fontFamily: fonts.caption.family, fontWeight: 800, scaleX: 94, background: 'opaque-black', outlineWidth: 5, maxLines: 2 }, disclosure: { text: '사건 내용 기반 AI 재구성', xRight: 1008, y: 1464, fontSize: 24, fontFamily: fonts.caption.family } },
  cuts: selections.map(([cutId]) => slots.get(cutId)), captionTrack: { file: rel(assPath), sha256: sha(read(assPath)), sourceSrt: { file: rel(srtPath), sha256: sha(read(srtPath)) }, rulesId: rules.id, cues: captionCues.map(({ start, end, text }) => ({ start, end, text })) },
  postProcessing: { cut010SafetyRedaction: { applied: true, reason: 'provider-generated unreadable card glyphs', coversCharacter: false, normalizedBoxes: [{ x: 20, y: 75, width: 200, height: 80 }, { x: 20, y: 155, width: 195, height: 280 }, { x: 315, y: 75, width: 145, height: 90 }, { x: 315, y: 155, width: 145, height: 280 }] }, supplementalVisualOverlay: { cutId: 'cut-010', startSeconds: 29, endSeconds: 32, events: [{ text: 'A 경감 주장', position: { x: 300, y: 860 } }, { text: '다른 사건 비교는 억울·부당', position: { x: 840, y: 860 } }] } },
  qaArtifacts: { contactSheet: { file: rel(contactSheetPath), sha256: sha(read(contactSheetPath)) }, humanQa: { file: rel(qaPath), sha256: null } }, output: { file: rel(finalPath), bytes: fs.statSync(finalPath).size, sha256: sha(read(finalPath)) }, work: { concat: { file: rel(concatPath), sha256: sha(read(concatPath)) }, ass: { file: rel(assPath), sha256: sha(read(assPath)) } },
};
const qa = { schema: 'grok-final-private-video-human-qa-v5r1', status: 'pending-human-review', checks: ['layout authority bound', 'caption semantic boundaries', 'decoded pixel geometry required', 'no upload/publication/Stage07'], notes: ['All title/caption/disclosure tracks are generated from shared layout authority.', 'Caption cues preserve handoff start/end times and normalized approved text.', 'cut-010 generated card glyphs are covered and exact qualified overlay is deterministic.'] };
const qaBytes = Buffer.from(`${JSON.stringify(qa, null, 2)}\n`); fs.writeFileSync(qaPath, qaBytes, { flag: 'wx' }); manifest.qaArtifacts.humanQa.sha256 = sha(qaBytes);
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`); fs.writeFileSync(manifestPath, manifestBytes, { flag: 'wx' });
console.log(JSON.stringify({ finalPath, manifestPath, qaPath, contactSheetPath, outputSha256: manifest.output.sha256, manifestSha256: sha(manifestBytes), captionCount: captionCues.length, layoutSha, fontHashes: { caption: fonts.caption.sha256, title: fonts.title.sha256 } }, null, 2));
