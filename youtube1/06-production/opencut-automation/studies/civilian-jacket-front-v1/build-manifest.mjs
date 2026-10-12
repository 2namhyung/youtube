import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';

const study = path.dirname(fileURLToPath(import.meta.url));
const assetRoot = path.join(study, 'assets', 'skin-civilian-jacket-front-v1');
const output = path.join(study, 'skin-manifest.json');
const canvas = {width: 1024, height: 1536};
const requiredSlots = ['head', 'hair_back', 'hair_front', 'torso', 'upper_arm_l', 'upper_arm_r', 'forearm_l', 'forearm_r', 'hand_l', 'hand_r', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r', 'foot_l', 'foot_r'];
const hiddenFillSlots = new Set(['torso', 'upper_arm_l', 'upper_arm_r', 'forearm_l', 'forearm_r', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r']);
const joints = {
  head: [512, 190], hair_back: [512, 250], hair_front: [512, 270], torso: [512, 390],
  upper_arm_l: [386, 456], upper_arm_r: [638, 456], forearm_l: [386, 646], forearm_r: [638, 646],
  hand_l: [386, 798], hand_r: [638, 798], thigh_l: [450, 850], thigh_r: [574, 850],
  shin_l: [450, 1100], shin_r: [574, 1100], foot_l: [450, 1280], foot_r: [574, 1280]
};
const parents = {head: 'root_bone', hair_back: 'root_bone', hair_front: 'root_bone', torso: 'root_bone', upper_arm_l: 'root_bone', upper_arm_r: 'root_bone', forearm_l: 'upper_arm_l_bone', forearm_r: 'upper_arm_r_bone', hand_l: 'forearm_l_bone', hand_r: 'forearm_r_bone', thigh_l: 'root_bone', thigh_r: 'root_bone', shin_l: 'thigh_l_bone', shin_r: 'thigh_r_bone', foot_l: 'shin_l_bone', foot_r: 'shin_r_bone'};
const group = (slot) => slot === 'head' || slot.startsWith('hair_') || slot === 'torso' ? 'core-v1' : slot.startsWith('thigh') || slot.startsWith('shin') || slot.startsWith('foot') ? 'leg-v1' : 'limb-v1';
const readPng = (bytes) => {
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('not a PNG');
  let offset = 8; let width; let height; let depth; let type; let interlace; const chunks = [];
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset); const kind = bytes.toString('ascii', offset + 4, offset + 8); const data = bytes.subarray(offset + 8, offset + 8 + length); offset += length + 12;
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    if (kind === 'IDAT') chunks.push(data); if (kind === 'IEND') break;
  }
  if (depth !== 8 || type !== 6 || interlace !== 0) throw new Error('only non-interlaced RGBA8 PNG is supported');
  const raw = zlib.inflateSync(Buffer.concat(chunks)); const stride = width * 4; const pixels = Buffer.alloc(height * stride); let at = 0;
  const paeth = (a, b, c) => { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y++) { const filter = raw[at++]; const row = y * stride; const prev = (y - 1) * stride; for (let x = 0; x < stride; x++) { const left = x >= 4 ? pixels[row + x - 4] : 0; const up = y ? pixels[prev + x] : 0; const upLeft = y && x >= 4 ? pixels[prev + x - 4] : 0; const value = raw[at++]; pixels[row + x] = filter === 0 ? value : filter === 1 ? (value + left) & 255 : filter === 2 ? (value + up) & 255 : filter === 3 ? (value + Math.floor((left + up) / 2)) & 255 : filter === 4 ? (value + paeth(left, up, upLeft)) & 255 : (() => { throw new Error(`unsupported PNG filter ${filter}`); })(); } }
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (pixels[y * stride + x * 4 + 3] > 0) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return {width, height, alphaBounds: maxX < 0 ? {x: 0, y: 0, width: 0, height: 0} : {x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1}};
};
const attachment = (slot, role) => {
  const filename = `${slot}-${role === 'visible' ? 'visible' : 'hidden-fill'}.png`; const file = path.join(assetRoot, filename);
  if (!fs.existsSync(file)) throw new Error(`missing incoming transparent PNG slot: ${path.relative(study, file)}`);
  const bytes = fs.readFileSync(file); const image = readPng(bytes);
  if (image.width !== canvas.width || image.height !== canvas.height) throw new Error(`${filename} must be ${canvas.width}x${canvas.height} full-canvas RGBA8`);
  return {id: `${slot}-${role}`, role, path: path.relative(study, file).replaceAll(path.sep, '/'), bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), dimensions: {width: image.width, height: image.height}, alphaBounds: image.alphaBounds, geometryGroup: group(slot)};
};
const bones = [{id: 'root_bone', parent: null, joint: {x: 512, y: 768}, pivot: {x: 0.5, y: 0.5}, drawOrder: -1, allowedMotionEnvelope: {rotationDeg: [-5, 5], translation: {x: [-8, 8], y: [-8, 8]}}}];
for (const [index, slot] of requiredSlots.entries()) bones.push({id: `${slot}_bone`, parent: parents[slot], joint: {x: joints[slot][0], y: joints[slot][1]}, pivot: {x: 0.5, y: 0.5}, drawOrder: index, allowedMotionEnvelope: {rotationDeg: hiddenFillSlots.has(slot) ? [-20, 20] : [-12, 12], translation: {x: [-24, 24], y: [-24, 24]}}});
const slots = requiredSlots.map((id, index) => ({id, boneId: `${id}_bone`, z: index, articulates: hiddenFillSlots.has(id), requiresHiddenFill: hiddenFillSlots.has(id), geometryGroup: group(id), attachments: [attachment(id, 'visible'), ...(hiddenFillSlots.has(id) ? [attachment(id, 'hidden-fill')] : [])]}));
const manifest = {schema: 'godot-skin-slot-contract-v1', manifestId: 'civilian-jacket-front-v1', view: 'front', canvas, skeleton: {id: 'civilian-jacket-shared-skeleton-v1', bones}, slots, skins: [{id: 'civilian-jacket-v1', slots: Object.fromEntries(slots.map((slot) => [slot.id, `${slot.id}-visible`]))}], geometryCompatibility: {groups: {'core-v1': requiredSlots.filter((slot) => group(slot) === 'core-v1'), 'limb-v1': requiredSlots.filter((slot) => group(slot) === 'limb-v1'), 'leg-v1': requiredSlots.filter((slot) => group(slot) === 'leg-v1')}}};
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ok: true, manifest: path.relative(study, output), slots: slots.length, attachments: slots.reduce((count, slot) => count + slot.attachments.length, 0)}, null, 2));
