import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateManifest, REQUIRED_SLOTS } from './validate-manifest.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const assetRoot = path.join(root, 'fixtures', 'skin-pack-a'); fs.mkdirSync(assetRoot, { recursive: true });
const crc32 = (buffer) => { let c = 0xffffffff; for (const byte of buffer) { c ^= byte; for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type); const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); t.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length); return out; };
function png(color) {
  const width = 4; const height = 4; const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) { raw[y * 17] = 0; for (let x = 0; x < width; x += 1) { const p = y * 17 + 1 + x * 4; raw[p] = color[0]; raw[p + 1] = color[1]; raw[p + 2] = color[2]; raw[p + 3] = 255; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const bones = REQUIRED_SLOTS.map((id, index) => ({ id: `${id}_bone`, parent: index ? 'root_bone' : null, joint: { x: 512 + (index % 2 ? 80 : -80), y: 180 + index * 70 }, pivot: { x: 0.5, y: 0.5 }, drawOrder: index, allowedMotionEnvelope: { rotationDeg: [-20, 20], translation: { x: [-24, 24], y: [-24, 24] } } }));
bones.unshift({ id: 'root_bone', parent: null, joint: { x: 512, y: 768 }, pivot: { x: 0.5, y: 0.5 }, drawOrder: -1, allowedMotionEnvelope: { rotationDeg: [-5, 5], translation: { x: [-8, 8], y: [-8, 8] } } });
const slots = REQUIRED_SLOTS.map((id, index) => {
  const group = id.includes('arm') || id.includes('forearm') || id.includes('hand') ? 'limb-v1' : id.includes('thigh') || id.includes('shin') || id.includes('foot') ? 'leg-v1' : 'core-v1';
  const entries = ['visible']; if (['torso', 'upper_arm_l', 'upper_arm_r', 'forearm_l', 'forearm_r', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r'].includes(id)) entries.push('hidden-fill');
  const attachments = entries.map((role, n) => { const file = `${id}-${role}.png`; const bytes = png([(index * 31 + n * 70) % 255, (index * 47 + 40) % 255, (index * 19 + 90) % 255]); fs.writeFileSync(path.join(assetRoot, file), bytes); return { id: `${id}-${role}-a`, role, path: `fixtures/skin-pack-a/${file}`, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), dimensions: { width: 4, height: 4 }, alphaBounds: { x: 0, y: 0, width: 4, height: 4 }, geometryGroup: group }; });
  const articulates = ['torso', 'upper_arm_l', 'upper_arm_r', 'forearm_l', 'forearm_r', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r'].includes(id);
  return { id, boneId: `${id}_bone`, z: index, articulates, requiresHiddenFill: entries.includes('hidden-fill'), geometryGroup: group, attachments };
});
const skinSlots = Object.fromEntries(slots.map((slot) => [slot.id, slot.attachments[0].id]));
const manifest = { schema: 'godot-skin-slot-contract-v1', manifestId: 'synthetic-front-skin-pack-a', view: 'front', canvas: { width: 1024, height: 1536 }, skeleton: { id: 'generic-front-skeleton-v1', bones }, slots, skins: [{ id: 'skin-a', slots: skinSlots }], geometryCompatibility: { groups: { 'core-v1': ['head', 'hair_back', 'hair_front', 'torso'], 'limb-v1': ['upper_arm_l', 'upper_arm_r', 'forearm_l', 'forearm_r', 'hand_l', 'hand_r'], 'leg-v1': ['thigh_l', 'thigh_r', 'shin_l', 'shin_r', 'foot_l', 'foot_r'] } } };
fs.writeFileSync(path.join(root, 'sample-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`); validateManifest(manifest, path.join(root, 'sample-manifest.json')); console.log('wrote sample-manifest.json');
