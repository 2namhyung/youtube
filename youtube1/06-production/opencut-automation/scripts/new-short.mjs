#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { REFERENCE_CAPTION_PRESET } from './production-lib.mjs';
const id = process.argv[2];
if (!id || !/^[a-z0-9][a-z0-9_-]*$/.test(id)) throw new Error('Usage: node scripts/new-short.mjs <lowercase-id>');
const root = path.resolve('production/projects', id);
if (fs.existsSync(root)) throw new Error(`Project already exists: ${root}`);
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
fs.writeFileSync(path.join(root, 'project.json'), JSON.stringify({
  id,
  title: { line1: 'TITLE', line2: 'SECOND LINE' },
  scriptSource: 'script.final.json',
  assets: 'assets',
  captionPreset: REFERENCE_CAPTION_PRESET,
  narration: {
    mode: 'qwen3-tts',
    style: 'auto',
    device: 'cuda',
    seed: 20260730,
    maxAttempts: 3,
    temperature: 0.7,
    finalTempo: 1,
  },
}, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'script.final.json'), JSON.stringify({
  schemaVersion: 1,
  slug: id,
  status: 'draft',
  finalizedAt: null,
  draft: '여기에 한국어 내레이션 원고를 입력하세요.',
}, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'assets', 'README.md'), '# Assets\n\nDrop mp4, mov, webm, png, jpg, or jpeg files here. They are discovered in natural sorted order.\n');
console.log(`Created ${root}`);
