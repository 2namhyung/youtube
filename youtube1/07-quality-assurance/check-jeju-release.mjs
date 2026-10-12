#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const index = args.indexOf('--version');
if (index < 0 || !/^[A-Za-z0-9_-]+$/.test(args[index + 1] || '')) throw new Error('Jeju release verification requires --version <exact-version-id>.');
const versionId = args[index + 1];
const registry = await readFile(path.join(workspace, '06-production', 'opencut-automation', 'out', 'registry', 'versions', `${versionId}.json`), 'utf8').then(JSON.parse);
assert.equal(registry.versionId, versionId, 'selected registry version mismatch');
assert.ok(registry.sourceIntegrity?.slug === 'jeju-school-intrusion' || String(registry.sourceIntegrity?.authority || '').includes('jeju-school-intrusion'), 'selected registry is not a Jeju release');
await import('./check-qwen-canonical-jeju.mjs');
