#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { prepareMannequinPilot, verifyMannequinPilot, importMannequinPilotSource } from './newsroom-gemini-web-mannequin-pilot.mjs';

const args = Object.fromEntries(process.argv.slice(3).map((item) => { const match = item.match(/^--([^=]+)=(.*)$/u); return match ? [match[1], match[2]] : [item.replace(/^--/u, ''), true]; }));
const required = (name) => { if (!args[name]) throw new Error(`--${name}=... is required`); return path.resolve(String(args[name])); };
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));

async function main(command = process.argv[2]) {
  const common = { bundleRoot: required('bundle-root'), outputRoot: args['output-root'] ? path.resolve(String(args['output-root'])) : required('bundle-root'), scenePlanPath: required('scene-plan'), audioPath: required('audio'), ffprobe: args.ffprobe ? path.resolve(String(args.ffprobe)) : 'ffprobe' };
  if (command === 'prepare') {
    const packet = await prepareMannequinPilot({ ...common, input: await readJson(required('input')) });
    process.stdout.write(`${packet.integrity.sha256}\n`); return;
  }
  if (command === 'verify') {
    const packet = await readJson(required('packet'));
    await verifyMannequinPilot({ ...common, packet, input: await readJson(required('input')) });
    process.stdout.write('verified\n'); return;
  }
  if (command === 'import-source') {
    const packet = await readJson(required('packet'));
    const result = await importMannequinPilotSource({ packet, operatorInput: await readJson(required('operator-input')), bundleRoot: common.bundleRoot, sourceRoot: required('source-root'), sourceRelativePath: String(args.source || ''), receiptRoot: required('receipt-root'), ffprobe: common.ffprobe });
    process.stdout.write(`${result.capture.integrity.sha256}\n`); return;
  }
  throw new Error('usage: prepare|verify|import-source --bundle-root=... --scene-plan=... --audio=... [command inputs]');
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
