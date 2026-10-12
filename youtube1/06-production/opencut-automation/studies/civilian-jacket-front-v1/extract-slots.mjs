import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const study = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(study, 'source', 'generated', 'front-master-alpha.png');
const fallback = path.resolve(study, '..', 'adult-front-rig-v1', 'source', 'appearance-pack-a', 'front-master-alpha.png');
const input = fs.existsSync(source) ? source : fallback;
const outDir = path.join(study, 'assets', 'skin-civilian-jacket-front-v1');
const width = 1024; const height = 1536;
const slots = {
  head: [320, 120, 384, 300], hair_back: [300, 100, 424, 360], hair_front: [300, 100, 424, 360], torso: [300, 350, 424, 540],
  upper_arm_l: [220, 400, 220, 280], upper_arm_r: [584, 400, 220, 280], forearm_l: [140, 570, 240, 280], forearm_r: [644, 570, 240, 280],
  hand_l: [130, 700, 190, 220], hand_r: [704, 700, 190, 220], thigh_l: [330, 790, 210, 340], thigh_r: [484, 790, 210, 340],
  shin_l: [300, 1030, 220, 350], shin_r: [504, 1030, 220, 350], foot_l: [280, 1280, 250, 190], foot_r: [494, 1280, 250, 190]
};
const hiddenSlots = new Set(['torso', 'upper_arm_l', 'upper_arm_r', 'forearm_l', 'forearm_r', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r']);
const bytes = fs.readFileSync(input); let at = 8; const idat = []; let depth; let color; let interlace; let sourceWidth; let sourceHeight;
while (at + 8 <= bytes.length) { const len = bytes.readUInt32BE(at); const kind = bytes.toString('ascii', at + 4, at + 8); const data = bytes.subarray(at + 8, at + 8 + len); at += len + 12; if (kind === 'IHDR') { sourceWidth = data.readUInt32BE(0); sourceHeight = data.readUInt32BE(4); depth = data[8]; color = data[9]; interlace = data[12]; } if (kind === 'IDAT') idat.push(data); if (kind === 'IEND') break; }
if (sourceWidth !== width || sourceHeight !== height || depth !== 8 || color !== 6 || interlace !== 0) throw new Error('front-master-alpha must be non-interlaced RGBA8 1024x1536');
const raw = zlib.inflateSync(Buffer.concat(idat)); const stride = width * 4; const pixels = Buffer.alloc(height * stride); let cursor = 0; const paeth = (a, b, c) => { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
for (let y = 0; y < height; y++) { const filter = raw[cursor++]; const row = y * stride; const prev = (y - 1) * stride; for (let x = 0; x < stride; x++) { const left = x >= 4 ? pixels[row + x - 4] : 0; const up = y ? pixels[prev + x] : 0; const ul = y && x >= 4 ? pixels[prev + x - 4] : 0; const v = raw[cursor++]; pixels[row + x] = filter === 0 ? v : filter === 1 ? (v + left) & 255 : filter === 2 ? (v + up) & 255 : filter === 3 ? (v + Math.floor((left + up) / 2)) & 255 : filter === 4 ? (v + paeth(left, up, ul)) & 255 : (() => { throw new Error(`unsupported PNG filter ${filter}`); })(); } }
const crc32 = (buffer) => { let crc = 0xffffffff; for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; };
const chunk = (kind, data) => { const type = Buffer.from(kind); const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); type.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([type, data])), 8 + data.length); return out; };
const encode = (mask, hidden = false) => { const scan = Buffer.alloc(height * (stride + 1)); for (let y = 0; y < height; y++) { scan[y * (stride + 1)] = 0; pixels.copy(scan, y * (stride + 1) + 1, y * stride, y * stride + stride); for (let x = 0; x < width; x++) { const pixel = y * (stride + 1) + 1 + x * 4; const inside = x >= mask[0] && x < mask[0] + mask[2] && y >= mask[1] && y < mask[1] + mask[3]; if (!inside) scan[pixel + 3] = 0; else if (hidden && scan[pixel + 3] > 0) { scan[pixel] = 24; scan[pixel + 1] = 39; scan[pixel + 2] = 52; } } } const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6; return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(scan, {level: 9})), chunk('IEND', Buffer.alloc(0))]); };
fs.mkdirSync(outDir, {recursive: true});
for (const [slot, mask] of Object.entries(slots)) { const visible = encode(mask); fs.writeFileSync(path.join(outDir, `${slot}-visible.png`), visible); if (hiddenSlots.has(slot)) fs.writeFileSync(path.join(outDir, `${slot}-hidden-fill.png`), encode(mask, true)); }
// Replace broad fallback crops with the authored transparent slot sources. The
// generated sources are already alpha-separated; ffmpeg only normalizes canvas,
// mirrors the bilateral left parts, and recolors hidden fills to navy.
const ffmpeg = 'C:/Users/User/tools/ffmpeg-8.1-essentials_build/bin/ffmpeg.exe';
const generated = path.join(study, 'source', 'generated');
const run = (args) => { const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args]); if (result.status !== 0) throw new Error(`ffmpeg extraction failed: ${result.stderr?.toString()}`); };
const normalize = (sourceFile, target, {crop, size, position, mirror = false, hidden = false}) => {
  const filters = [`crop=${crop[2]}:${crop[3]}:${crop[0]}:${crop[1]}`, `scale=${size[0]}:${size[1]}:flags=lanczos`];
  if (mirror) filters.push('hflip');
  filters.push(`pad=1024:1536:${position[0]}:${position[1]}:0x00000000`);
  filters.push('format=rgba');
  if (hidden) filters.push('lutrgb=r=24:g=39:b=52');
  run(['-i', sourceFile, '-vf', filters.join(','), '-frames:v', '1', target]);
};
const upper = path.join(generated, 'upper-arm-alpha-v1.png'); const forearm = path.join(generated, 'forearm-alpha-v1.png'); const torso = path.join(generated, 'torso-alpha-v1.png');
if (fs.existsSync(upper) && fs.existsSync(forearm) && fs.existsSync(torso)) {
  // Rig-space placement is deliberate: every source is cropped to its alpha
  // subject, resized to the fixed bone length, then padded at the rest-pose
  // joint. Never attach a full source canvas as a limb.
  const upperSpec = {crop: [340, 135, 330, 1280], size: [74, 205]};
  const forearmSpec = {crop: [350, 240, 330, 1040], size: [68, 170]};
  normalize(upper, path.join(outDir, 'upper_arm_r-visible.png'), {...upperSpec, position: [601, 446]});
  normalize(upper, path.join(outDir, 'upper_arm_l-visible.png'), {...upperSpec, position: [349, 446], mirror: true});
  normalize(forearm, path.join(outDir, 'forearm_r-visible.png'), {...forearmSpec, position: [604, 635]});
  normalize(forearm, path.join(outDir, 'forearm_l-visible.png'), {...forearmSpec, position: [352, 635], mirror: true});
  normalize(torso, path.join(outDir, 'torso-visible.png'), {crop: [250, 130, 750, 1000], size: [350, 466], position: [337, 350]});

  // Hidden fills are intentionally tiny overlap bands generated from the same
  // approved fabric. A full duplicate limb would create the rectangular
  // occlusion failure this study is designed to prevent.
  const fills = {
    torso: {source: torso, crop: [360, 260, 520, 120], size: [300, 70], position: [362, 405]},
    upper_arm_r: {source: upper, crop: [390, 150, 220, 170], size: [68, 52], position: [604, 443]},
    upper_arm_l: {source: upper, crop: [390, 150, 220, 170], size: [68, 52], position: [352, 443], mirror: true},
    forearm_r: {source: forearm, crop: [370, 250, 250, 180], size: [62, 48], position: [607, 631]},
    forearm_l: {source: forearm, crop: [370, 250, 250, 180], size: [62, 48], position: [355, 631], mirror: true}
  };
  for (const [slot, spec] of Object.entries(fills)) normalize(spec.source, path.join(outDir, `${slot}-hidden-fill.png`), {...spec, hidden: true});
}
console.log(JSON.stringify({ok: true, source: path.relative(study, input), slots: Object.keys(slots).length, output: path.relative(study, outDir), note: 'deterministic rectangular alpha extraction; human seam review remains required'}, null, 2));
