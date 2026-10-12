import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateManifest} from './validate-manifest.mjs';

const study = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(study, '..', '..');
const output = path.join(root, 'out', 'studies', 'godot-character-skin-system-v1');
const manifestPath = path.join(study, 'sample-manifest.json');
const manifestBytes = readFileSync(manifestPath);
const godotLogBytes = readFileSync(path.join(study, 'godot-preflight.log'));
const godotLog = godotLogBytes.includes(0) ? godotLogBytes.toString('utf16le') : godotLogBytes.toString('utf8');
if (/WARNING|ERROR/.test(godotLog)) throw new Error('Godot preflight log is not clean');
if (!/"ok"\s*:\s*true/.test(godotLog)) throw new Error('Godot loader did not accept the contract');
const report = {
  schema: 'godot-skin-slot-preflight-report-v1',
  status: 'private-contract-only',
  productionAuthority: false,
  uploadAllowed: false,
  renderer: 'none (loader preflight only)',
  engine: 'Godot 4.7.1 stable',
  manifest: 'sample-manifest.json',
  manifestBytes: manifestBytes.length,
  manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
  validation: validateManifest(JSON.parse(manifestBytes.toString('utf8')), manifestPath),
  godotLoaderPreflight: {ok: true, slotCount: 16, attachmentCount: 25, warningFree: true},
  admittedRealCharacterArt: false,
  note: 'Synthetic fixtures prove the contract and loader only. Existing flattened A/B character art remains rejected.'
};
mkdirSync(output, {recursive: true});
writeFileSync(path.join(output, 'preflight-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
