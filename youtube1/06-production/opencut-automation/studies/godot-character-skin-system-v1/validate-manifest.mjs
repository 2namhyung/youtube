import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const REQUIRED_SLOTS = [
  'head', 'hair_back', 'hair_front', 'torso', 'upper_arm_l', 'upper_arm_r',
  'forearm_l', 'forearm_r', 'hand_l', 'hand_r', 'thigh_l', 'thigh_r',
  'shin_l', 'shin_r', 'foot_l', 'foot_r'
];

const fail = (message) => { throw new Error(`skin-slot validation failed: ${message}`); };
const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

function readPng(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) fail('attachment is not a PNG');
  let offset = 8; let width; let height; let bitDepth; let colorType; let interlace; const chunks = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset); const type = buffer.toString('ascii', offset + 4, offset + 8); const data = buffer.subarray(offset + 8, offset + 8 + length); offset += 12 + length;
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12]; }
    if (type === 'IDAT') chunks.push(data);
    if (type === 'IEND') break;
  }
  if (!width || !height || bitDepth !== 8 || colorType !== 6 || interlace !== 0) fail('only non-interlaced RGBA8 PNG attachments are supported');
  const raw = zlib.inflateSync(Buffer.concat(chunks)); const bpp = 4; const stride = width * bpp; const pixels = Buffer.alloc(height * stride); let inOffset = 0;
  const paeth = (a, b, c) => { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y += 1) {
    const filter = raw[inOffset++]; const row = y * stride; const prev = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? pixels[row + x - bpp] : 0; const up = y ? pixels[prev + x] : 0; const upLeft = y && x >= bpp ? pixels[prev + x - bpp] : 0; const value = raw[inOffset++];
      pixels[row + x] = filter === 0 ? value : filter === 1 ? (value + left) & 255 : filter === 2 ? (value + up) & 255 : filter === 3 ? (value + Math.floor((left + up) / 2)) & 255 : filter === 4 ? (value + paeth(left, up, upLeft)) & 255 : fail(`unsupported PNG filter ${filter}`);
    }
  }
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (pixels[y * stride + x * 4 + 3] > 0) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return { width, height, alphaBounds: maxX < 0 ? { x: 0, y: 0, width: 0, height: 0 } : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } };
}

function checkShape(manifest) {
  if (!isObject(manifest) || manifest.schema !== 'godot-skin-slot-contract-v1') fail('schema marker mismatch');
  if (manifest.view !== 'front') fail('view must be explicit front');
  if (!isObject(manifest.canvas) || !Number.isInteger(manifest.canvas.width) || !Number.isInteger(manifest.canvas.height)) fail('canvas dimensions missing');
  if (!isObject(manifest.skeleton) || !Array.isArray(manifest.skeleton.bones)) fail('skeleton bones missing');
  const boneIds = new Set(); const drawOrders = new Set();
  for (const bone of manifest.skeleton.bones) { if (!bone.id || boneIds.has(bone.id)) fail(`duplicate bone id ${bone.id}`); boneIds.add(bone.id); if (drawOrders.has(bone.drawOrder)) fail(`duplicate bone drawOrder ${bone.drawOrder}`); drawOrders.add(bone.drawOrder); }
  if (!Array.isArray(manifest.slots)) fail('slots must be an array');
  const slotIds = new Set(); const z = new Set();
  for (const slot of manifest.slots) { if (slotIds.has(slot.id)) fail(`duplicate slot id ${slot.id}`); slotIds.add(slot.id); if (z.has(slot.z)) fail(`duplicate slot z ${slot.z}`); z.add(slot.z); if (!boneIds.has(slot.boneId)) fail(`slot ${slot.id} references unknown bone ${slot.boneId}`); if (!Array.isArray(slot.attachments) || slot.attachments.length === 0) fail(`slot ${slot.id} has no attachments`); }
  for (const required of REQUIRED_SLOTS) if (!slotIds.has(required)) fail(`missing required slot ${required}`);
  if (!Array.isArray(manifest.skins) || manifest.skins.length === 0) fail('at least one skin is required');
  const attachmentIds = new Set(manifest.slots.flatMap((slot) => slot.attachments.map((attachment) => attachment.id)));
  const skinIds = new Set();
  for (const skin of manifest.skins) { if (!skin || skinIds.has(skin.id)) fail(`duplicate skin id ${skin?.id}`); skinIds.add(skin.id); if (!isObject(skin.slots)) fail(`skin ${skin.id} slot map missing`); for (const required of REQUIRED_SLOTS) if (!Object.hasOwn(skin.slots, required)) fail(`skin ${skin.id} missing slot ${required}`); for (const [slotId, attachmentId] of Object.entries(skin.slots)) { if (!slotIds.has(slotId)) fail(`skin ${skin.id} references unknown slot ${slotId}`); if (!attachmentIds.has(attachmentId)) fail(`skin ${skin.id} references unknown attachment ${attachmentId}`); } }
  if (!isObject(manifest.geometryCompatibility) || !isObject(manifest.geometryCompatibility.groups)) fail('geometry compatibility groups missing');
  const groups = manifest.geometryCompatibility.groups;
  const allAttachmentIds = new Set();
  for (const slot of manifest.slots) { if (!Array.isArray(groups[slot.geometryGroup]) || !groups[slot.geometryGroup].includes(slot.id)) fail(`slot ${slot.id} has incompatible geometry group ${slot.geometryGroup}`); const attachmentIds = new Set(); for (const attachment of slot.attachments) { if (attachmentIds.has(attachment.id) || allAttachmentIds.has(attachment.id)) fail(`duplicate attachment id ${attachment.id} in ${slot.id}`); attachmentIds.add(attachment.id); allAttachmentIds.add(attachment.id); if (attachment.geometryGroup !== slot.geometryGroup) fail(`attachment ${attachment.id} has incompatible geometry group`); } if (slot.articulates && (!slot.requiresHiddenFill || !slot.attachments.some((a) => a.role === 'hidden-fill'))) fail(`articulating slot ${slot.id} lacks hidden-fill declaration`); }
}

export function validateManifest(manifest, manifestPath) {
  checkShape(manifest);
  const root = fs.realpathSync(path.dirname(manifestPath)); const physicalPaths = new Set();
  for (const slot of manifest.slots) for (const attachment of slot.attachments) {
    if (typeof attachment.path !== 'string' || path.isAbsolute(attachment.path) || attachment.path.split(/[\\/]/).includes('..')) fail(`path escape for ${attachment.id}`);
    const candidate = path.resolve(path.dirname(manifestPath), attachment.path); if (!fs.existsSync(candidate)) fail(`missing attachment ${attachment.path}`);
    const pathParts = path.relative(path.dirname(manifestPath), candidate).split(path.sep); let walk = path.dirname(manifestPath); for (const part of pathParts) { walk = path.join(walk, part); if (fs.lstatSync(walk).isSymbolicLink()) fail(`symlink attachment ${attachment.path}`); }
    const real = fs.realpathSync(candidate); const rel = path.relative(root, real); if (rel.startsWith('..') || path.isAbsolute(rel)) fail(`attachment outside manifest root ${attachment.path}`);
    physicalPaths.add(real); const bytes = fs.readFileSync(real); if (bytes.length !== attachment.bytes) fail(`byte length mismatch for ${attachment.id}`); const sha = crypto.createHash('sha256').update(bytes).digest('hex'); if (sha !== attachment.sha256) fail(`SHA-256 mismatch for ${attachment.id}`);
    const image = readPng(bytes); if (image.width !== attachment.dimensions.width || image.height !== attachment.dimensions.height) fail(`dimension mismatch for ${attachment.id}`); if (JSON.stringify(image.alphaBounds) !== JSON.stringify(attachment.alphaBounds)) fail(`alpha bounds mismatch for ${attachment.id}`);
  }
  if (physicalPaths.size === 1 && manifest.slots.length > 1) fail('flat single-raster pack is not admissible');
  return { ok: true, slots: manifest.slots.length, attachments: manifest.slots.reduce((n, s) => n + s.attachments.length, 0), uniquePhysicalPaths: physicalPaths.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const manifestPath = path.resolve(process.argv[2] ?? 'sample-manifest.json'); const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); console.log(JSON.stringify(validateManifest(manifest, manifestPath)));
}
