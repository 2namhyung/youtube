#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const runDir = process.argv[2];
if (!runDir) throw new Error('usage: node verify-newsroom-curated-candidates-v1.mjs <run-dir>');
const candidatesPath = path.resolve(runDir, 'candidates.json');
const manifestPath = path.resolve(runDir, 'manifest.json');
const bytes = fs.readFileSync(candidatesPath);
const doc = JSON.parse(bytes.toString('utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const failures = [];
const fail = (m) => failures.push(m);
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
const physicalSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
const payload = structuredClone(doc); delete payload.approval;
const contentSha256 = crypto.createHash('sha256').update(stable(payload), 'utf8').digest('hex');
if (doc.schema !== 'newsroom-real-media-curated-candidates-v1') fail('schema mismatch');
if (!Array.isArray(doc.records) || doc.records.length !== 26) fail(`record count ${doc.records?.length}`);
const keys = new Set(); const titles = new Set(); const items = new Set(); const media = new Set();
for (const [i, r] of (doc.records ?? []).entries()) {
  if (!r.storyId || !r.cutId) fail(`record ${i} missing composite key`);
  const key = `${r.storyId}:${r.cutId}`;
  if (keys.has(key)) fail(`duplicate composite ${key}`); keys.add(key);
  for (const [label, value, set] of [['title', r.title, titles], ['itemUrl', r.itemUrl, items], ['directMediaUrl', r.directMediaUrl, media]]) {
    if (!value) fail(`record ${i} missing ${label}`);
    else if (set.has(value)) fail(`duplicate ${label} ${value}`);
    else set.add(value);
  }
  if (!(r.license === 'CC0 1.0' || /^CC BY(?:-SA)? (?:2|3|4)\.0$/.test(r.license) || /^Public Domain/.test(r.license))) fail(`record ${i} disallowed license ${r.license}`);
  if (!r.rightsStatement || !r.licenseUrl || !r.creator || !r.dimensions?.width || !r.dimensions?.height) fail(`record ${i} missing rights/creator/dimensions`);
}
if (doc.policy?.providerInputStatus !== 'denied' || doc.policy?.renderStatus !== 'not-run' || doc.policy?.uploadStatus !== 'not-run') fail('policy statuses are not fail-closed');
for (const scope of [doc.providerActions, manifest.providerActions]) for (const [k, v] of Object.entries(scope ?? {})) if (v !== false) fail(`provider action ${k} not false`);
if (doc.approval?.contentSha256 !== contentSha256) fail('contentSha256 mismatch');
if (manifest.candidates?.sha256 !== physicalSha256) fail('physical sha256 mismatch');
if (manifest.candidates?.bytes !== bytes.length) fail('physical byte count mismatch');
if (manifest.candidates?.contentSha256 !== contentSha256) fail('manifest contentSha256 mismatch');
if (manifest.candidates?.recordCount !== 26) fail('manifest record count mismatch');
if (failures.length) { console.error(JSON.stringify({ ok: false, failures }, null, 2)); process.exit(1); }
console.log(JSON.stringify({ ok: true, recordCount: 26, uniqueCompositeKeys: keys.size, uniqueTitles: titles.size, uniqueItemUrls: items.size, uniqueDirectMediaUrls: media.size, contentSha256, physicalSha256, bytes: bytes.length }, null, 2));
