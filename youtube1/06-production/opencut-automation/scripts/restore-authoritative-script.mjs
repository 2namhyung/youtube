import fs from 'node:fs';
import path from 'node:path';
import { restoreAuthoritativeDraft } from './authoritative-script-restoration.mjs';

const args = process.argv.slice(2);
const index = args.indexOf('--script');
const scriptPath = index >= 0 ? path.resolve(args[index + 1] || '') : '';
if (!scriptPath) throw new Error('Usage: node scripts/restore-authoritative-script.mjs --script <script.final.json>');
const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8').replace(/^\uFEFF/u, ''));
const restored = restoreAuthoritativeDraft(script);
const target = `${JSON.stringify(restored, null, 2)}\n`;
const temporary = `${scriptPath}.${process.pid}.tmp`;
try {
  fs.writeFileSync(temporary, target, 'utf8');
  fs.renameSync(temporary, scriptPath);
} finally {
  if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
}
console.log(JSON.stringify({ status: 'restored', script: scriptPath, restoration: restored.restoration }, null, 2));
