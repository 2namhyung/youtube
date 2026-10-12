import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileImagegenOmniI2v,
  createDraftTemplate,
  prepareImagegenOmniI2vReview,
  verifyImagegenOmniI2v,
  verifyOmniI2vRequest,
} from './newsroom-imagegen-omni-i2v.mjs';

const HELP = `newsroom-imagegen-omni-i2v-v1 (planning only)

Commands:
  init --output=FILE
      Write a pending draft template with append-only semantics.
  compile --draft=FILE --visual=FILE --references=FILE --storyline=FILE --cut-plan=FILE \
      --entry-authority=FILE --legal-review=FILE --title-approval=FILE \
      --owner-narration-approval=FILE --supersession-reconciliation=FILE \
      --asset-root=DIR --evidence-root=DIR --output=FILE
      Compile independent single-shot ImageGen -> Omni I2V requests.
  verify --artifact=FILE [the compile inputs above]
      Rebuild and compare the canonical artifact, including current entry sources.
  check-request --artifact=FILE --capture=FILE --draft=FILE --visual=FILE --references=FILE --storyline=FILE --cut-plan=FILE \
      --entry-authority=FILE --legal-review=FILE --title-approval=FILE \
      --owner-narration-approval=FILE --supersession-reconciliation=FILE \
      --asset-root=DIR --evidence-root=DIR --receipt-root=DIR
      Revalidate all current upstream authorities, then compare captured raw request bytes and physical receipt.
  prepare-review --draft=FILE --visual=FILE --references=FILE --storyline=FILE --cut-plan=FILE \
      --entry-authority=FILE --legal-review=FILE --title-approval=FILE \
      --owner-narration-approval=FILE --supersession-reconciliation=FILE \
      --asset-root=DIR --evidence-root=DIR --output=FILE
      Validate upstream inputs and emit pending per-cut review bindings; no PASS is asserted.

The planner has no provider, render, upload, publication, or semantic-QA side effects.
Native multishot is recorded as experimental/unavailable with single-shot I2V fallback.
`;

const read = async (file) => JSON.parse(await fs.readFile(path.resolve(file), 'utf8'));
const parseArgs = (values) => Object.fromEntries(values.map((value) => {
  const index = value.indexOf('='); return index < 0 ? [value.replace(/^--/u, ''), true] : [value.slice(0, index).replace(/^--/u, ''), value.slice(index + 1)];
}));
const required = (args, name) => { if (!args[name]) throw new Error(`--${name}=... is required`); return args[name]; };
const writeNew = async (file, value) => fs.writeFile(path.resolve(file), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
const pendingTemplate = () => {
  const template = createDraftTemplate();
  template.providerProfile.modelDisplayName ||= template.providerProfile.model;
  template.providerProfile.resolution ||= 'replace-with-observed-resolution';
  for (const sequence of template.sequences) {
    sequence.locationSource.grounding ||= { method: 'source-backed-observation', observerId: 'replace-observer', observedAt: 'replace-observation-time', locationScope: sequence.locationBrief.scope, observation: 'replace-with-source-backed-observation', sourceUrl: 'https://replace.example/source', evidenceFile: { relativePath: 'replace-location-grounding.json', bytes: 1, sha256: 'replace' } };
    sequence.locationSource.omniInputStatus ||= 'not-applicable';
    for (const cut of sequence.cuts) {
      cut.action = { subject: cut.action.subject, startState: cut.action.startState, action: cut.action.action || 'replace-with-approved-action', endState: cut.action.endState, screenDirection: cut.action.screenDirection };
      Object.assign(cut.review, { decision: 'pending', geometricRealism: 'pending', oneActionSemantics: 'pending', locationGrounding: 'pending', actorsVehiclesSeats: 'pending', screenDirectionAxis: 'pending', noExtraText: 'pending', adjacentContinuity: 'pending' });
      Object.assign(cut.review.bindings, { inputProvenanceSha256: 'replace', locationBriefSha256: 'replace', locationSourceSha256: 'replace', resetSha256: 'replace' });
    }
  }
  template.animatic = { file: { relativePath: 'replace-owner-voice-animatic.mp4', bytes: 1, sha256: 'replace', mimeType: 'video/mp4' }, manifestFile: { relativePath: 'replace-owner-voice-animatic-manifest.json', bytes: 1, sha256: 'replace' } };
  return template;
};
const sourceBundle = async (args) => ({
  legalReview: await read(required(args, 'legal-review')),
  titleApproval: await read(required(args, 'title-approval')),
  ownerNarrationApproval: await read(required(args, 'owner-narration-approval')),
  supersessionReconciliation: await read(required(args, 'supersession-reconciliation')),
});
const upstream = async (args) => ({
  draft: await read(required(args, 'draft')),
  fullVisualStoryline: await read(required(args, 'visual')),
  referenceCatalog: await read(required(args, 'references')),
  storyline: await read(required(args, 'storyline')),
  semanticCutPlan: await read(required(args, 'cut-plan')),
  entryAuthority: await read(required(args, 'entry-authority')),
  entrySources: await sourceBundle(args),
  assetRoot: required(args, 'asset-root'),
  evidenceRoot: required(args, 'evidence-root'),
});

export async function main(command = process.argv[2], rawArgs = process.argv.slice(3)) {
  const args = parseArgs(rawArgs);
  if (!command || command === 'help' || command === '--help' || args.help) { process.stdout.write(HELP); return { help: true }; }
  if (command === 'init') { const template = pendingTemplate(); await writeNew(required(args, 'output'), template); return template; }
  if (command === 'compile') { const artifact = await compileImagegenOmniI2v(await upstream(args)); await writeNew(required(args, 'output'), artifact); return artifact; }
  if (command === 'verify') { return verifyImagegenOmniI2v({ artifact: await read(required(args, 'artifact')), ...(await upstream(args)) }); }
  if (command === 'check-request') {
    const payload = await upstream(args);
    const artifact = await read(required(args, 'artifact'));
    return verifyOmniI2vRequest({ artifact, capture: await read(required(args, 'capture')), ...payload, receiptRoot: required(args, 'receipt-root') });
  }
  if (command === 'prepare-review') {
    const manifest = await prepareImagegenOmniI2vReview(await upstream(args));
    await writeNew(required(args, 'output'), manifest); return manifest;
  }
  throw new Error('command must be init, compile, verify, check-request, prepare-review, or help');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().then((result) => process.stdout.write(`${JSON.stringify({ ok: true, result }, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
