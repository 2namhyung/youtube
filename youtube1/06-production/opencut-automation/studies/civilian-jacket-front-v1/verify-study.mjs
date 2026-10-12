import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const study = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(study, '..', '..', 'out', 'studies', 'civilian-jacket-front-v1');
const manifest = path.join(study, 'skin-manifest.json');
const allowPending = process.argv.includes('--allow-pending');
if (!fs.existsSync(manifest)) {
  if (allowPending) { console.log(JSON.stringify({ok: true, status: 'pending-art', productionAuthority: false, uploadAllowed: false})); process.exit(0); }
  throw new Error('verification blocked: build-manifest.mjs must run after all incoming PNG slots arrive');
}
const validation = spawnSync(process.execPath, [path.join(study, 'validate-manifest.mjs')], {encoding: 'utf8'});
if (validation.status !== 0) throw new Error(validation.stderr || validation.stdout || 'manifest validation failed');
const trace = path.join(out, 'runtime-trace.json');
if (fs.existsSync(trace)) {
  const value = JSON.parse(fs.readFileSync(trace, 'utf8'));
  if (value.schema !== 'private-godot-skin-runtime-trace-v1' || value.fps !== 24 || value.durationSeconds !== 3) throw new Error('runtime trace contract mismatch');
  if (!Array.isArray(value.samples) || value.samples.length < 70) throw new Error('runtime trace has insufficient samples');
  const first = value.samples[0]?.rotations; const last = value.samples.at(-1)?.rotations;
  if (JSON.stringify(first) !== JSON.stringify(last)) throw new Error('gesture rest-return equality failed');
} else if (!allowPending) throw new Error('runtime trace missing; run Godot with --qa-trace');
const contact = path.join(out, 'contact-sheet.json');
if (fs.existsSync(contact)) {
  const value = JSON.parse(fs.readFileSync(contact, 'utf8'));
  if (value.schema !== 'private-godot-skin-contact-sheet-v1' || value.frameCount !== 72 || value.uploadAllowed !== false) throw new Error('contact report contract mismatch');
} else if (!allowPending) throw new Error('contact extraction report missing');
const report = path.join(out, 'runtime-report.json');
if (fs.existsSync(report)) {
  const value = JSON.parse(fs.readFileSync(report, 'utf8'));
  if (value.schema !== 'private-civilian-jacket-front-runtime-report-v1' || value.productionAuthority !== false || value.uploadAllowed !== false) throw new Error('runtime report release contract mismatch');
  if (value.visualQa?.status !== 'pass' && !allowPending) throw new Error('visual QA is not admitted; human seam review remains required');
} else if (!allowPending) throw new Error('runtime report missing');
console.log(JSON.stringify({ok: true, status: 'private-review-only', productionAuthority: false, uploadAllowed: false, manifest: path.relative(study, manifest)}, null, 2));
