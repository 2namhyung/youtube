import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  captureGeminiWebSource, compileGeminiPromptBatches, sealFullVisualStoryline, sealGeminiSemanticQa, sealImagegenReferenceCatalog, sealV9EntryAuthority,
  verifyFullVisualStoryline, verifyGeminiPromptBatches, verifyGeminiSemanticQa, verifyGeminiWebSourceCapture, verifyImagegenReferenceCatalog, verifyV9EntryAuthority,
} from './newsroom-gemini-storyboard-pipeline.mjs';

const read = async (file) => JSON.parse(await fs.readFile(path.resolve(file), 'utf8'));
const args = Object.fromEntries(process.argv.slice(3).map((value) => value.split('=', 2)));
const required = (name) => { if (!args[name]) throw new Error(`--${name}=... is required`); return args[name]; };
const writeNew = async (file, value) => fs.writeFile(path.resolve(file), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
const entrySources = async () => ({ legalReview: await read(required('legal-review')), titleApproval: await read(required('title-approval')), ownerNarrationApproval: await read(required('owner-narration-approval')), supersessionReconciliation: await read(required('supersession-reconciliation')) });

export async function main(command = process.argv[2]) {
  if (command === 'seal-entry') {
    const artifact = sealV9EntryAuthority({ ...(await entrySources()), storyline: await read(required('storyline')), semanticCutPlan: await read(required('cut-plan')) });
    await writeNew(required('output'), artifact); return artifact;
  }
  if (command === 'seal-visual') {
    const artifact = sealFullVisualStoryline({ draft: await read(required('draft')), storyline: await read(required('storyline')), semanticCutPlan: await read(required('cut-plan')), entryAuthority: await read(required('entry-authority')), entrySources: await entrySources() });
    await writeNew(required('output'), artifact); return artifact;
  }
  if (command === 'seal-references') {
    const artifact = await sealImagegenReferenceCatalog({ draft: await read(required('draft')), fullVisualStoryline: await read(required('visual')), assetRoot: required('asset-root') });
    await writeNew(required('output'), artifact); return artifact;
  }
  if (command === 'compile-batches') {
    const artifact = await compileGeminiPromptBatches({ fullVisualStoryline: await read(required('visual')), referenceCatalog: await read(required('references')), batchDrafts: await read(required('draft')), assetRoot: required('asset-root') });
    await writeNew(required('output'), artifact); return artifact;
  }
  if (command === 'capture-source') {
    const batch = await read(required('batches')); const batchId = required('batch-id');
    const artifact = await captureGeminiWebSource({ promptBatchArtifact: batch, batchId, sourceRoot: required('source-root'), relativePath: required('source'), operatorAttestation: await read(required('attestation')), evidenceRoot: required('evidence-root') });
    await writeNew(required('output'), artifact); return artifact;
  }
  if (command === 'seal-qa') {
    const artifact = await sealGeminiSemanticQa({ promptBatchArtifact: await read(required('batches')), sourceCapture: await read(required('capture')), draft: await read(required('draft')), evidenceRoot: required('evidence-root') });
    await writeNew(required('output'), artifact); return artifact;
  }
  if (command === 'verify-entry') return verifyV9EntryAuthority({ artifact: await read(required('artifact')), entrySources: await entrySources(), storyline: await read(required('storyline')), semanticCutPlan: await read(required('cut-plan')) });
  if (command === 'verify-visual') return verifyFullVisualStoryline({ artifact: await read(required('artifact')), storyline: await read(required('storyline')), semanticCutPlan: await read(required('cut-plan')), entryAuthority: await read(required('entry-authority')), entrySources: await entrySources() });
  if (command === 'verify-references') return verifyImagegenReferenceCatalog({ artifact: await read(required('artifact')), fullVisualStoryline: await read(required('visual')), assetRoot: required('asset-root') });
  if (command === 'verify-batches') return verifyGeminiPromptBatches({ artifact: await read(required('artifact')), fullVisualStoryline: await read(required('visual')), referenceCatalog: await read(required('references')), assetRoot: required('asset-root') });
  if (command === 'verify-capture') return verifyGeminiWebSourceCapture({ artifact: await read(required('artifact')), promptBatchArtifact: await read(required('batches')), sourceRoot: required('source-root'), operatorAttestation: await read(required('attestation')), evidenceRoot: required('evidence-root') });
  if (command === 'verify-qa') return verifyGeminiSemanticQa({ artifact: await read(required('artifact')), promptBatchArtifact: await read(required('batches')), sourceCapture: await read(required('capture')), evidenceRoot: required('evidence-root') });
  throw new Error('command must be seal-entry, seal-visual, seal-references, compile-batches, capture-source, seal-qa, or a verify-* command');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().then((result) => process.stdout.write(`${JSON.stringify({ ok: true, result }, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
