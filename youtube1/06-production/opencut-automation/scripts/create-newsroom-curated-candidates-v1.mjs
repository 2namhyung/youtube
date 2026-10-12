#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const runDir = process.argv[2];
if (!runDir) throw new Error('usage: node create-newsroom-curated-candidates-v1.mjs <run-dir>');
const candidatesPath = path.resolve(runDir, 'candidates.json');
const manifestPath = path.resolve(runDir, 'manifest.json');

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const doc = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));
const payload = structuredClone(doc);
delete payload.approval;
const contentSha256 = crypto.createHash('sha256').update(stable(payload), 'utf8').digest('hex');
doc.approval = { approved: true, status: 'curated', contentSha256 };
const bytes = Buffer.from(`${JSON.stringify(doc, null, 2)}\n`, 'utf8');
fs.writeFileSync(candidatesPath, bytes);
const physicalSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
const manifest = {
  schema: 'newsroom-real-media-curated-candidates-manifest-v1',
  generatedAt: new Date().toISOString(),
  candidates: {
    path: path.relative(process.cwd(), candidatesPath).replaceAll('\\', '/'),
    bytes: bytes.length,
    sha256: physicalSha256,
    contentSha256,
    recordCount: doc.records.length
  },
  providerActions: { providerInput: false, render: false, upload: false, publication: false }
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ candidatesPath, manifestPath, contentSha256, physicalSha256, bytes: bytes.length, recordCount: doc.records.length }, null, 2));
