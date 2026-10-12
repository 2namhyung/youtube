#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { prepareFacelessReview, verifyFacelessReview, assembleFacelessReview } from './newsroom-gemini-faceless-review.mjs';

const args = Object.fromEntries(process.argv.slice(3).map((item) => { const match = item.match(/^--([^=]+)=(.*)$/u); return match ? [match[1], match[2]] : [item.replace(/^--/u, ''), true]; }));
const required = (name) => { if (!args[name]) throw new Error(`--${name}=... is required`); return path.resolve(String(args[name])); };
const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const common = () => ({ bundleRoot: required('bundle-root'), scenePlanPath: required('scene-plan'), audioPath: required('audio'), srtPath: required('srt'), ffprobe: args.ffprobe ? path.resolve(String(args.ffprobe)) : 'ffprobe' });

async function main(command = process.argv[2]) {
  if (command === 'prepare') { const result = await prepareFacelessReview({ ...common(), input: await read(required('input')) }); process.stdout.write(`${result.integrity.sha256}\n`); return; }
  if (command === 'verify') { const result = await verifyFacelessReview({ ...common(), capture: await read(required('capture')), input: await read(required('input')) }); process.stdout.write(`${result ? 'verified' : 'failed'}\n`); return; }
  if (command === 'assemble') { const result = await assembleFacelessReview({ capture: await read(required('capture')), bundleRoot: required('bundle-root'), outputRoot: required('output-root'), ffmpeg: args.ffmpeg ? path.resolve(String(args.ffmpeg)) : 'ffmpeg', ffprobe: args.ffprobe ? path.resolve(String(args.ffprobe)) : 'ffprobe' }); process.stdout.write(`${result.integrity.sha256}\n`); return; }
  throw new Error('usage: prepare|verify|assemble --bundle-root=... --scene-plan=... --audio=... --srt=...');
}
main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
