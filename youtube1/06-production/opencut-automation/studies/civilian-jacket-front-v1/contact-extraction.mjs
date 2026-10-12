import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const study = path.dirname(fileURLToPath(import.meta.url));
const frameDir = path.resolve(study, process.argv[2] ?? path.join('..', '..', 'out', 'studies', 'civilian-jacket-front-v1', 'frames'));
const output = path.resolve(study, process.argv[3] ?? path.join('..', '..', 'out', 'studies', 'civilian-jacket-front-v1', 'contact-sheet.json'));
if (!fs.existsSync(frameDir)) throw new Error(`contact extraction blocked: frame directory missing (${frameDir})`);
const frames = fs.readdirSync(frameDir).filter((name) => /^frame-\d{4}\.png$/.test(name)).sort();
if (frames.length !== 72) throw new Error(`contact extraction requires exactly 72 PNG frames, found ${frames.length}`);
const records = frames.map((name, index) => {
  const bytes = fs.readFileSync(path.join(frameDir, name));
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`${name} is not PNG`);
  if (bytes.readUInt32BE(16) !== 1080 || bytes.readUInt32BE(20) !== 1920 || bytes[24] !== 8 || bytes[25] !== 6) throw new Error(`${name} must be 1080x1920 RGBA8`);
  return {frame: index, file: name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
});
if (records[0].sha256 !== records.at(-1).sha256) throw new Error('rest-to-rest frame equality failed');
if (new Set(records.map((record) => record.sha256)).size < 3) throw new Error('gesture did not produce at least three visual states');
const report = {schema: 'private-godot-skin-contact-sheet-v1', status: 'private-review-only', fps: 24, durationSeconds: 3, frameCount: 72, frames: records, humanReviewRequired: true, uploadAllowed: false};
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ok: true, output: path.relative(study, output), frameCount: records.length}, null, 2)}\n`);
