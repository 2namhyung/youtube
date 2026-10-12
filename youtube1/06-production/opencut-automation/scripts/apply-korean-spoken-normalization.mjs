import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { applyKoreanSpokenNormalization } from './korean-spoken-normalization.mjs';

const args = process.argv.slice(2);
const value = (name) => args[args.indexOf(name) + 1];
const scriptPath = path.resolve(value('--script') || '');
const ruleIds = args.filter((value, index) => args[index - 1] === '--rule');
if (!scriptPath || !ruleIds.length) throw new Error('Usage: node apply-korean-spoken-normalization.mjs --script <script.final.json> --rule <rule-id>');
const sourceBytes = fs.readFileSync(scriptPath);
const script = JSON.parse(sourceBytes.toString('utf8').replace(/^\uFEFF/u, ''));
if (script.status !== 'final' || typeof script.draft !== 'string') throw new Error('Normalization creator requires a finalized authoritative script');
let inputDraft = script.draft;
if (args.includes('--reapply')) {
  if (!script.normalization || script.normalization.spokenOnlyOverride !== false || !Array.isArray(script.normalization.applications)) throw new Error('--reapply requires an existing authoritative normalization record');
  for (const application of [...script.normalization.applications].reverse()) {
    const index = Number(application.sourceIndex);
    const target = `${String(application.target || '')}${String(application.targetSuffix || '')}`;
    const source = `${String(application.source || '')}${String(application.sourceSuffix || '')}`;
    if (!Number.isInteger(index) || !target || !source || inputDraft.slice(index, index + target.length) !== target) throw new Error('--reapply could not reconstruct the prior authoritative source');
    inputDraft = `${inputDraft.slice(0, index)}${source}${inputDraft.slice(index + target.length)}`;
  }
  const reconstructedSha256 = crypto.createHash('sha256').update(inputDraft, 'utf8').digest('hex');
  if (reconstructedSha256 !== script.normalization.inputDraftSha256) throw new Error('--reapply reconstructed source SHA-256 mismatch');
}
const normalized = applyKoreanSpokenNormalization(inputDraft, ruleIds);
const output = {
  ...script,
  draft: normalized.draft,
  normalization: {
    ...normalized.evidence,
    creator: 'scripts/apply-korean-spoken-normalization.mjs',
  },
};
const target = `${JSON.stringify(output, null, 2)}\n`;
const temporary = `${scriptPath}.${process.pid}.tmp`;
try {
  fs.writeFileSync(temporary, target, 'utf8');
  fs.renameSync(temporary, scriptPath);
} finally {
  if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
}
console.log(JSON.stringify({ status: 'written', script: scriptPath, normalization: output.normalization }, null, 2));
