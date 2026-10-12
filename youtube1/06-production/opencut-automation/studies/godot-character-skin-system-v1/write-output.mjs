import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateManifest } from './validate-manifest.mjs';

const studyRoot = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(studyRoot, 'sample-manifest.json');
const manifestBytes = fs.readFileSync(manifestPath);
const result = validateManifest(JSON.parse(manifestBytes), manifestPath);
const outRoot = path.resolve(studyRoot, '../../out/studies/godot-character-skin-system-v1');
fs.mkdirSync(outRoot, { recursive: true });
const report = { schema: 'godot-skin-slot-preflight-report-v1', manifest: 'sample-manifest.json', manifestBytes: manifestBytes.length, manifestSha256: crypto.createHash('sha256').update(manifestBytes).digest('hex'), validation: result, renderer: 'none (loader preflight only)', publication: false };
fs.writeFileSync(path.join(outRoot, 'preflight-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
