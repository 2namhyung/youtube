#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const PROTOTYPE = import.meta.dirname;
const JOB_ID = 'production-38b942bd6f69a92105bfd57952bee9da2d7f506a';
const JOB = path.join(ROOT, 'out', 'newsroom', 'jobs', JOB_ID);
const SOURCE_AUDIO = path.join(JOB, 'project', 'narration', 'narration-final.m4a');
const HANDOFF = path.join(JOB, 'project', 'narration', 'handoff.json');
const EVIDENCE = path.join(JOB, 'authority', 'evidence-bundle.json');
const AUTHORITY_HASH = '38b942bd6f69a92105bfd57952bee9da2d7f506a231a16ade826ff680980b242';
const EVIDENCE_HASH = '64e45f87eb1e26bf0634930a67e4e021e183a38a6d5b49547b6af5f50a98546f';
const NARRATION_HASH = 'd57593fd6d5437caac96148b8ba8e963ebc164f3e8db2cdb99fe4edab88a6ac6';
const CUES = [
  { start: 0, end: 5.6296682098765425, text: '불법 촬영을 시도한 학생을 고소했는데, 핵심 증거 휴대전화를 없앤 사람은 그 학생의 경찰관 아버지였습니다.', spanId: 'span-001' },
  { start: 6.079668209876543, end: 15.709297839506169, text: '전북 전주의 한 파출소 소속 A 경감은 고등학생 아들이 여교사를 상대로 불법 촬영을 시도하다 적발되자 휴대전화를 부쉈다고 내부망에 적었습니다.', spanId: 'span-002' },
];
const CLAIM_ID = 'claim-97b1d75f713d', DURATION = 15.709298, FPS = 24, FRAMES = 377;
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const jsonText = value => `${JSON.stringify(value, null, 2)}\n`;
const getArg = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const out = path.resolve(getArg('--out') || path.join(ROOT, 'out', 'prototypes', 'research-6b1a8af9b4143acb-evidence-board-v1'));
const framesDir = path.join(out, 'frames'); fs.mkdirSync(framesDir, { recursive: true });
for (const file of fs.readdirSync(framesDir)) fs.rmSync(path.join(framesDir, file), { force: true });
if (sha256(SOURCE_AUDIO) !== NARRATION_HASH) throw new Error('Approved narration bytes changed');
const handoff = JSON.parse(fs.readFileSync(HANDOFF, 'utf8'));
for (const expected of CUES) { const actual = handoff.cues.find(cue => cue.start === expected.start && cue.end === expected.end); if (!actual || actual.text !== expected.text) throw new Error(`Approved narration cue mismatch: ${expected.spanId}`); }
const evidence = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'));
if (evidence.bundleSha256 !== EVIDENCE_HASH) throw new Error('Evidence bundle authority changed');
for (const expected of CUES) { const span = evidence.scriptSpans.find(item => item.spanId === expected.spanId); if (!span || span.excerpt !== expected.text || JSON.stringify(span.claimIds) !== JSON.stringify([CLAIM_ID])) throw new Error(`Evidence lineage mismatch: ${expected.spanId}`); }

const edgeExecutable = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
if (!fs.existsSync(edgeExecutable)) throw new Error('Pinned local browser executable is unavailable');
const browser = await chromium.launch({ headless: true, executablePath: edgeExecutable });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
const boardUrl = new URL(`file:///${path.join(PROTOTYPE, 'board.html').replaceAll('\\', '/')}`);
for (let frame = 0; frame < FRAMES; frame += 1) { boardUrl.searchParams.set('frame', String(frame)); await page.goto(boardUrl.href, { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: path.join(framesDir, `frame-${String(frame + 1).padStart(6, '0')}.png`), animations: 'disabled' }); }
await browser.close();
const video = path.join(out, 'research-6b1a8af9b4143acb-evidence-board-v1.mp4'), thumbnail = path.join(out, 'thumbnail.jpg'), contact = path.join(out, 'contact-sheet.jpg');
const run = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit', windowsHide: true });
run(['-i', path.join(framesDir, 'frame-000190.png'), '-vf', 'scale=540:960:flags=lanczos', '-q:v', '3', thumbnail]);
run(['-framerate', String(FPS), '-i', path.join(framesDir, 'frame-%06d.png'), '-vf', "select='not(mod(n\\,47))',scale=270:480:flags=lanczos,tile=3x3", '-frames:v', '1', '-q:v', '4', contact]);
run(['-framerate', String(FPS), '-i', path.join(framesDir, 'frame-%06d.png'), '-i', SOURCE_AUDIO, '-map', '0:v:0', '-map', '1:a:0', '-frames:v', String(FRAMES), '-t', String(DURATION), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', video]);
const manifest = { schema: 'phone-evidence-prototype-v1', prototypeId: 'research-6b1a8af9b4143acb-evidence-board-v1', sourceAuthority: { jobId: JOB_ID, authorityHash: AUTHORITY_HASH, excludedCurrentWorkflowJobId: 'production-b1739e79c1e8771f6ad0ab31565c60fd0572919e', exclusionReason: 'headline-bytes-corrupted-fail-closed' }, headline: { line1: '경찰 아버지가', line2: '부순 휴대전화' }, evidence: { bundleSha256: EVIDENCE_HASH, spanIds: CUES.map(cue => cue.spanId), claimIds: [CLAIM_ID] }, narration: { audioSha256: NARRATION_HASH, cues: CUES.map(({ start, end, text, spanId }) => ({ start, end, text, spanId })) }, canvas: { width: 1080, height: 1920, frameRate: FPS, durationSeconds: DURATION, expectedFrameCount: FRAMES }, policy: { deterministic: true, externalMedia: false, generativeMedia: false, network: false, privateOnly: true, upload: false }, outputs: { videoSha256: sha256(video), thumbnailSha256: sha256(thumbnail), contactSheetSha256: sha256(contact), frameCount: FRAMES } };
fs.writeFileSync(path.join(out, 'creator-manifest.json'), jsonText(manifest), 'utf8');
if (!process.argv.includes('--keep-frames')) fs.rmSync(framesDir, { recursive: true, force: true });
console.log(jsonText({ video, thumbnail, contact, manifest: path.join(out, 'creator-manifest.json') }));
