import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateManifest} from '../godot-character-skin-system-v1/validate-manifest.mjs';

const study = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(study, process.argv[2] ?? 'skin-manifest.json');
if (!fs.existsSync(manifestPath)) throw new Error(`skin manifest missing: ${path.relative(study, manifestPath)}`);
const result = validateManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), manifestPath);
if (result.slots !== 16) throw new Error(`expected 16 slots, got ${result.slots}`);
process.stdout.write(`${JSON.stringify({...result, manifestPath: path.relative(study, manifestPath)}, null, 2)}\n`);
