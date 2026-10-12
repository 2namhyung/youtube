import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (v) => v.slice(1)));
const OUT = path.join(ROOT, 'out', 'prototypes', 'research-6b1a8af9b4143acb-v29-common-masters-production-v4', 'assets', 'scene-001', 'private-render-gsap-v1');
const META = path.join(OUT, 'cut-001-gsap-private-render-v1.json');
const MP4 = path.join(OUT, 'cut-001-gsap-private.mp4');
const CONTACT = path.join(OUT, 'cut-001-gsap-contact-sheet.png');
const FFPROBE = 'C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffprobe.exe';
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const meta = JSON.parse(await fs.readFile(META, 'utf8'));
const copy = structuredClone(meta); const claimed = copy.artifactSha256; delete copy.artifactSha256;
if (claimed !== sha256(Buffer.from(JSON.stringify(copy), 'utf8'))) throw new Error('private render artifact hash drifted');
if (meta.status !== 'private-rendered' || meta.privateOnly !== true || meta.composition?.width !== 972 || meta.composition?.height !== 972 || meta.composition?.fps !== 24 || meta.composition?.frames !== 96 || meta.composition?.durationSeconds !== 4 || meta.composition?.audio !== false || meta.composition?.title !== false || meta.composition?.captions !== false) throw new Error('private render composition contract invalid');
if (meta.providerCalls?.imageGen !== false || meta.providerCalls?.grok !== false || meta.providerCalls?.upload !== false || meta.providerCalls?.publication !== false || meta.providerCalls?.stage07 !== false) throw new Error('private render provider/publication gate drifted');
if (meta.engine?.id !== 'gsap-html-v1' || meta.engine?.authorityId !== 'gsap-html-authority-v1' || meta.engine?.authorityBundleSha256 !== '63b989bab30c0ee07634a8cd0b32ae7d0615d59b32c5415efae6b9831089fe18' || meta.engine?.adapterSha256 !== 'ed1f1820ecd1c061c97e4e434b18527ffa9464de45c24d232738aa5bfbd4b59c' || meta.engine?.rendererContract !== 'gsap-paused-timeline-frame-seek-972-v1') throw new Error('GSAP engine authority drifted');
const outputBytes = await fs.readFile(MP4); if (sha256(outputBytes) !== meta.output?.sha256 || outputBytes.length !== meta.output?.bytes) throw new Error('private MP4 bytes drifted');
const contactBytes = await fs.readFile(CONTACT); if (sha256(contactBytes) !== meta.contactSheet?.sha256 || contactBytes.length !== meta.contactSheet?.bytes) throw new Error('contact sheet bytes drifted');
for (const frame of meta.frameSeek?.frameHashes || []) { const bytes = await fs.readFile(path.join(ROOT, frame.relativePath)); if (sha256(bytes) !== frame.sha256 || bytes.length !== frame.bytes) throw new Error(`frame drift ${frame.frame}`); if (bytes.readUInt32BE(16) !== 972 || bytes.readUInt32BE(20) !== 972) throw new Error(`frame dimensions invalid ${frame.frame}`); }
const probe = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames,codec_name,pix_fmt', '-of', 'json', MP4], { encoding: 'utf8', windowsHide: true });
if (probe.status !== 0) throw new Error(probe.stderr || 'ffprobe failed');
const stream = JSON.parse(probe.stdout).streams?.[0];
if (stream?.width !== 972 || stream?.height !== 972 || stream?.r_frame_rate !== '24/1' || Number(stream?.nb_read_frames) !== 96 || stream?.codec_name !== 'h264' || stream?.pix_fmt !== 'yuv420p') throw new Error(`MP4 probe mismatch ${JSON.stringify(stream)}`);
if (meta.frameSeek.visualChange.first.sha256 !== meta.frameSeek.visualChange.end.sha256) throw new Error('expected explicit endpoint clear hash binding is missing');
console.log(JSON.stringify({ verified: true, artifactSha256: claimed, outputSha256: meta.output.sha256, contactSheetSha256: meta.contactSheet.sha256, frames: 96, probe: stream }));
