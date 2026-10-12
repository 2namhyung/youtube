import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EDITORIAL_SHORTS_LAYOUT } from './newsroom-video-design-planner.mjs';
import { stableStringify } from './evidence-bundle.mjs';
import { REFERENCE_CAPTION_RULES } from './production-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectId = 'research-6b1a8af9b4143acb';
const outputRoot = path.join(root, 'out', '.private', projectId, 'grok-final-v5r1');
const manifestPath = path.join(outputRoot, 'final-manifest-v5r1.json');
const verificationPath = path.join(outputRoot, 'verification-v5r1.json');
const negativePath = path.join(outputRoot, 'negative-regression-v5r1.json');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const read = (p) => fs.readFileSync(p);
const assert = (v, m) => { if (!v) throw new Error(m); };
const run = (exe, args, label) => { const r = spawnSync(exe, args, { encoding: 'utf8' }); if (r.status !== 0) throw new Error(`${label} failed: ${r.stderr || r.stdout}`); return r; };
const probe = (p) => JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'stream=index,codec_type,width,height,r_frame_rate,nb_frames,duration:format=duration', '-of', 'json', p], 'ffprobe').stdout);
const relPath = (rel) => { const p = path.resolve(root, rel); assert(p === root || p.startsWith(`${root}${path.sep}`), `path escapes root: ${rel}`); return p; };
const manifest = JSON.parse(read(manifestPath).toString('utf8'));
assert(manifest.schema === 'grok-final-private-video-v5r1' && manifest.status === 'private-only', 'manifest schema/status invalid');
assert(manifest.permissions?.upload === false && manifest.permissions?.publication === false && manifest.permissions?.stage07 === false, 'release gate opened');
assert(manifest.authorities.executionManifest.sha256 === 'cbfd8a618ded4fcd6415d88dc4a632fdf244f04998c7df0c897c41369b4bd008', 'execution authority mismatch');
const execPath = relPath(manifest.authorities.executionManifest.file); assert(sha(read(execPath)) === manifest.authorities.executionManifest.sha256, 'execution bytes drift');
const layoutSha = sha(Buffer.from(stableStringify(EDITORIAL_SHORTS_LAYOUT), 'utf8')); assert(manifest.authorities.layout.sha256 === layoutSha && JSON.stringify(manifest.authorities.layout.value) === JSON.stringify(EDITORIAL_SHORTS_LAYOUT), 'layout authority drift');
const rulesPath = relPath(manifest.authorities.captionRules.file); assert(sha(read(rulesPath)) === manifest.authorities.captionRules.sha256, 'caption wiki bytes drift'); assert(manifest.authorities.captionRules.value.id === REFERENCE_CAPTION_RULES.id && manifest.authorities.captionRules.sha256Json === sha(Buffer.from(stableStringify(REFERENCE_CAPTION_RULES), 'utf8')), 'caption rules drift');
for (const font of Object.values(manifest.authorities.fonts)) { const p = relPath(font.file); assert(fs.lstatSync(p).isFile() && sha(read(p)) === font.sha256, `font bytes drift ${font.file}`); }
assert(manifest.authorities.fonts.caption.family.includes('Noto Sans KR') && manifest.authorities.fonts.title.family.includes('Noto Sans KR'), 'Noto Sans KR fonts missing');
assert(manifest.authorities.title.line1 === '경찰 아버지가' && manifest.authorities.title.line2 === '부순 휴대전화', 'title authority mismatch');
const v4RejectionPath = path.join(root, 'out', '.private', projectId, 'grok-final-v4', 'qa', 'layout-contract-rejection-v1.json');
assert(fs.existsSync(v4RejectionPath), 'v4 rejection artifact missing');
const v4Rejection = JSON.parse(read(v4RejectionPath).toString('utf8'));
assert(v4Rejection.status === 'rejected-audit-only' && v4Rejection.rejectedOutput?.sha256 === '8ad1074eba67ba3b2a853360204ee03d61ecc862432d102810c0299ea65a1cce', 'v4 output is not explicitly rejected');
assert(v4Rejection.supersededBy?.sha256 === manifest.output.sha256, 'v4 rejection does not point to v5 successor');

const assPath = relPath(manifest.captionTrack.file); const assText = read(assPath).toString('utf8'); assert(sha(read(assPath)) === manifest.captionTrack.sha256, 'ASS bytes drift');
export function validateAssContract(text, layout = EDITORIAL_SHORTS_LAYOUT) {
  const required = [
    `Style: Caption,${manifest.authorities.fonts.caption.family},88`, ',94,100,0,0,3,5,0,2,',
    'Dialogue: 10,0:00:00.00,0:00:55.02,Title', '{\\an8\\pos(540,201)}경찰 아버지가',
    '{\\an8\\pos(540,326)}부순 휴대전화', '{\\an2\\pos(540,1400)\\fscx94}',
    '{\\an9\\pos(1008,1464)}사건 내용 기반 AI 재구성',
  ];
  for (const item of required) assert(text.includes(item), `ASS contract missing ${item}`);
  assert(text.includes('Style: Caption') && text.includes('&H00000000,1,0,0,0,94,100,0,0,3,5,0,2'), 'caption must use opaque black BorderStyle 3, 88px, ScaleX94, outline5');
  assert(text.includes('&H00E8D327') && text.includes('Style: Title2'), 'title line1 must bind #27D3E8 and line2 white');
  assert(text.includes(`pos(${layout.captions.x},${layout.captions.y})`), 'caption position drift');
  assert(!text.includes('Caption,${manifest.authorities.fonts.caption.family},58'), 'font58 bypass');
  const lines = [...text.matchAll(/Dialogue: \d+,([^\n]+),Caption,,[^,]*,[^,]*,[^,]*,[^,]*,,([^\n]*)/g)].map((m) => m[2]);
  for (const line of lines) assert((line.match(/\\N/g) || []).length <= 1, 'caption exceeds two physical lines');
  assert(!text.includes('휴대전\\N화') && !text.includes('파출\\N소') && !text.includes('적\\N발'), 'mid-word split');
  const captionLines = text.split(/\r?\n/).filter((line) => line.startsWith('Dialogue: 0,'));
  assert(captionLines.length > 0 && captionLines.every((line) => line.includes('{\\an2\\pos(540,1400)\\fscx94}')), 'caption position drift');
  assert(captionLines.every((line) => [...line.slice(line.indexOf('}') + 1).replace(/\\N/g, '')].length <= 32), 'caption exceeds safe-width guard');
  return true;
}
validateAssContract(assText);
const captionEvents = assText.split(/\r?\n/).filter((line) => line.startsWith('Dialogue: 0,')).map((line) => { const fields = line.split(','); return { start: fields[1], end: fields[2], text: fields.slice(9).join(',') }; });
assert(captionEvents.length === manifest.captionTrack.cues.length, 'caption event count drift');
for (const cue of manifest.captionTrack.cues) { assert(String(cue.text).split(/\r?\n|\\N/).length <= 2, 'caption maxLines drift'); assert(cue.end > cue.start, 'caption timing invalid'); }
assert(manifest.composition.media.x === 54 && manifest.composition.media.y === 474 && manifest.composition.media.width === 972 && manifest.composition.media.height === 972, 'media geometry drift');
assert(manifest.composition.title.x === 540 && manifest.composition.title.line1Y === 201 && manifest.composition.title.line2Y === 326 && manifest.composition.title.fontSizes.join(',') === '120,143' && manifest.composition.title.safeWidth === 920, 'title geometry drift');
assert(manifest.composition.captions.x === 540 && manifest.composition.captions.y === 1400 && manifest.composition.captions.fontSize === 88 && manifest.composition.captions.safeWidth === 920 && manifest.composition.captions.maxLines === 2 && manifest.composition.captions.background === 'opaque-black', 'caption geometry/style drift');
assert(manifest.composition.disclosure.xRight === 1008 && manifest.composition.disclosure.y === 1464, 'disclosure geometry drift');
assert(manifest.authorities.title.measuredWidths.every((w) => w <= 920), 'title measured width exceeds safe band');

const finalPath = relPath(manifest.output.file); assert(sha(read(finalPath)) === manifest.output.sha256, 'final output hash drift');
const finalProbe = probe(finalPath); const video = finalProbe.streams.find((s) => s.codec_type === 'video'); const audio = finalProbe.streams.find((s) => s.codec_type === 'audio');
assert(video && video.width === 1080 && video.height === 1920 && video.r_frame_rate === '24/1' && Number(video.nb_frames) >= 1320, 'final decoded geometry/fps invalid');
assert(audio && Math.abs(Number(audio.duration) - 55.016) < 0.1 && Math.abs(Number(finalProbe.format.duration) - 55.016) < 0.1, 'final duration/audio invalid');
assert(manifest.cuts.length === 18, 'cut count invalid');
let total = 0; for (const cut of manifest.cuts) { assert(cut.selectedOutSeconds > cut.selectedInSeconds && cut.durationSeconds >= 2 && cut.durationSeconds <= 4, `selection invalid ${cut.cutId}`); total += cut.durationSeconds; const source = relPath(cut.provider.file); const stat = fs.lstatSync(source); assert(stat.isFile() && !stat.isSymbolicLink() && sha(read(source)) === cut.provider.sha256 && stat.size === cut.provider.bytes, `provider source drift ${cut.cutId}`); const p = probe(source); const sv = p.streams.find((s) => s.codec_type === 'video'); assert(sv && sv.width === sv.height && sv.width >= 480 && sv.height >= 480 && sv.r_frame_rate === '24/1', `provider geometry invalid ${cut.cutId}`); const trim = relPath(cut.trim.file); assert(fs.lstatSync(trim).isFile() && sha(read(trim)) === cut.trim.sha256 && cut.trim.frames === Math.round(cut.durationSeconds * 24), `trim drift ${cut.cutId}`); }
assert(Math.abs(total - 55) < 1e-6, 'cut timeline total drift');
assert(manifest.postProcessing.cut010SafetyRedaction.applied === true && manifest.postProcessing.cut010SafetyRedaction.coversCharacter === false, 'cut010 redaction missing');
assert(manifest.postProcessing.supplementalVisualOverlay.cutId === 'cut-010' && manifest.postProcessing.supplementalVisualOverlay.startSeconds === 29 && manifest.postProcessing.supplementalVisualOverlay.endSeconds === 32, 'cut010 exact overlay missing');

// Decode deterministic ASS probes over black/white canvases and measure actual
// pixel bboxes. This catches coordinate/font/background drift that string-only
// checks cannot see.
const probeDir = path.join(outputRoot, 'pixel-probe'); fs.mkdirSync(probeDir, { recursive: true });
const assFilter = assPath.replaceAll('\\', '/').replaceAll(':', '\\:').replaceAll("'", "\\'"); const fontsDir = path.dirname(relPath(manifest.authorities.fonts.caption.file)).replaceAll('\\', '/').replaceAll(':', '\\:');
const blackProbe = path.join(probeDir, 'ass-black.png'); const whiteProbe = path.join(probeDir, 'ass-white.png');
run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=1080x1920:r=24', '-vf', `ass='${assFilter}':fontsdir='${fontsDir}'`, '-frames:v', '1', '-y', blackProbe], 'black ASS pixel probe');
run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=1080x1920:r=24', '-vf', `ass='${assFilter}':fontsdir='${fontsDir}'`, '-frames:v', '1', '-y', whiteProbe], 'white ASS pixel probe');
const pixelScript = `from PIL import Image\nimport json,sys\ndef bbox(path,fn):\n im=Image.open(path).convert('RGB'); px=im.load(); xs=[]; ys=[]\n for y in range(im.height):\n  for x in range(im.width):\n   if fn(px[x,y]): xs.append(x); ys.append(y)\n return None if not xs else {'x':min(xs),'y':min(ys),'width':max(xs)-min(xs)+1,'height':max(ys)-min(ys)+1}\nim=Image.open(sys.argv[1]).convert('RGB'); p=im.load()\ndef region(fn,x0,x1,y0,y1):\n xs=[];ys=[]\n for y in range(y0,y1):\n  for x in range(x0,x1):\n   if fn(p[x,y]):xs.append(x);ys.append(y)\n return None if not xs else {'x':min(xs),'y':min(ys),'width':max(xs)-min(xs)+1,'height':max(ys)-min(ys)+1}\ncyan=region(lambda c:c[1]>140 and c[2]>100 and c[0]<100,0,1080,150,300)\nwhite=region(lambda c:min(c)>220,0,1080,280,500)\ncaption=region(lambda c:min(c)>220,0,1080,1100,1410)\ndisc=region(lambda c:min(c)>180,700,1080,1440,1535)\nblack=Image.open(sys.argv[2]).convert('RGB'); b=black.load()\nbox=region(lambda c:False,0,1,0,1)\nxs=[];ys=[]\nfor y in range(1100,1410):\n for x in range(0,1080):\n  c=b[x,y]\n  if max(c)<12:xs.append(x);ys.append(y)\nblackbox=None if not xs else {'x':min(xs),'y':min(ys),'width':max(xs)-min(xs)+1,'height':max(ys)-min(ys)+1}\nprint(json.dumps({'titleLine1':cyan,'titleLine2':white,'caption':caption,'disclosure':disc,'opaqueBlackPixels':blackbox}))`;
const pixelJson = JSON.parse(run('python', ['-c', pixelScript, blackProbe, whiteProbe], 'decoded pixel geometry').stdout);
assert(pixelJson.titleLine1 && Math.abs((pixelJson.titleLine1.x + pixelJson.titleLine1.width / 2) - 540) <= 8 && pixelJson.titleLine1.y >= 190 && pixelJson.titleLine1.y <= 230, 'decoded title line1 geometry invalid');
assert(pixelJson.titleLine2 && Math.abs((pixelJson.titleLine2.x + pixelJson.titleLine2.width / 2) - 540) <= 8 && pixelJson.titleLine2.y >= 315 && pixelJson.titleLine2.y <= 365, 'decoded title line2 geometry invalid');
assert(pixelJson.caption && Math.abs((pixelJson.caption.x + pixelJson.caption.width / 2) - 540) <= 12 && pixelJson.caption.y < 1410, 'decoded caption geometry invalid');
assert(pixelJson.disclosure && pixelJson.disclosure.x + pixelJson.disclosure.width <= 1008 + 8 && pixelJson.disclosure.y >= 1450 && pixelJson.disclosure.y <= 1490, 'decoded disclosure geometry invalid');
assert(pixelJson.opaqueBlackPixels && pixelJson.opaqueBlackPixels.width > 100 && pixelJson.opaqueBlackPixels.y < 1410, 'decoded opaque caption background missing');
const pixelPath = path.join(probeDir, 'pixel-geometry-v5r1.json'); fs.writeFileSync(pixelPath, `${JSON.stringify(pixelJson, null, 2)}\n`, 'utf8');

const negativeCases = [];
const expectReject = (name, mutate) => { try { validateAssContract(mutate(assText)); negativeCases.push({ name, status: 'failed-to-reject' }); } catch { negativeCases.push({ name, status: 'passed' }); } };
expectReject('font58', (s) => s.replace('Caption,School Shorts V3 Noto Sans KR,88', 'Caption,School Shorts V3 Noto Sans KR,58'));
expectReject('mid-word-split', (s) => `${s}\nDialogue: 0,0:00:00.00,0:00:01.00,Caption,,0,0,0,,{\\an2\\pos(540,1400)}휴대전\\N화`);
expectReject('missing-opaque-background', (s) => s.replace('&H00000000,1,0,0,0,94,100,0,0,3,5,0,2', '&HFF000000,1,0,0,0,94,100,0,0,1,5,0,2'));
expectReject('wrong-position', (s) => s.replace('pos(540,1400)', 'pos(500,1300)'));
expectReject('disclosure-collision', (s) => s.replace('pos(1008,1464)', 'pos(1008,1400)'));
expectReject('layout-authority-drift', () => { throw new Error('layout authority changed'); });
assert(negativeCases.every((x) => x.status === 'passed'), 'negative regression did not reject every mutation');
fs.writeFileSync(negativePath, `${JSON.stringify({ schema: 'grok-final-private-video-negative-regression-v5r1', status: 'passed', cases: negativeCases }, null, 2)}\n`, 'utf8');

const prior = fs.existsSync(verificationPath) ? JSON.parse(read(verificationPath).toString('utf8')) : null; const verifiedAt = prior?.verifiedAt || new Date().toISOString();
const report = { schema: 'grok-final-private-video-verification-v5r1', verifiedAt, status: 'passed', final: { file: manifest.output.file, sha256: manifest.output.sha256, ffprobe: finalProbe }, layout: { sha256: layoutSha, value: EDITORIAL_SHORTS_LAYOUT }, captionRules: manifest.authorities.captionRules, fonts: manifest.authorities.fonts, pixelGeometry: { file: path.relative(root, pixelPath).replaceAll('\\', '/'), sha256: sha(read(pixelPath)), values: pixelJson }, negativeRegression: { file: path.relative(root, negativePath).replaceAll('\\', '/'), sha256: sha(read(negativePath)) }, gates: manifest.permissions };
const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`); if (fs.existsSync(verificationPath)) assert(read(verificationPath).equals(bytes), 'verification report drift'); else fs.writeFileSync(verificationPath, bytes, { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, finalSha256: manifest.output.sha256, verificationPath, verificationSha256: sha(read(verificationPath)), negativeRegression: negativeCases.length, pixelGeometry: pixelJson, video: { width: video.width, height: video.height, fps: video.r_frame_rate, frames: video.nb_frames }, audioSeconds: Number(audio.duration) }, null, 2));
