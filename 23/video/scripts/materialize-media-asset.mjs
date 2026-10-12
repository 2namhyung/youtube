import fs from 'node:fs';
import path from 'node:path';
import {materializeMediaAsset} from '../../src/lib/video-asset-materializer.ts';

const requestIndex = process.argv.indexOf('--request');
if (requestIndex < 0 || !process.argv[requestIndex + 1]) {
  console.error('Usage: pnpm video:materialize-media -- --request <request.json> [--dry-run]');
  process.exit(2);
}

const requestPath = path.resolve(process.argv[requestIndex + 1]);
const request = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
const result = await materializeMediaAsset(request, {dryRun: process.argv.includes('--dry-run')});
console.log(JSON.stringify(result, null, 2));
