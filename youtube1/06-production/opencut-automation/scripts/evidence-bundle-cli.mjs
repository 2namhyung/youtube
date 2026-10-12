import fs from 'node:fs';
import path from 'node:path';
import { buildEvidenceBundle, verifyEvidenceBundle, hashFile } from './evidence-bundle.mjs';

const args = process.argv.slice(2);
const val = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const required = (name) => val(name) || (() => { throw new Error(`Missing ${name}`); })();
const json = (file) => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8').replace(/^\uFEFF/u, ''));
const command = args[0];
try {
  if (command === 'build') {
    const output = required('--output');
    const configFile = path.resolve(required('--config'));
    const configDir = path.dirname(configFile);
    const config = json(configFile);
    const resolveArtifact = (input) => typeof input === 'string'
      ? path.resolve(configDir, input)
      : (input && typeof input === 'object' && typeof input.path === 'string' ? { ...input, path: path.resolve(configDir, input.path) } : input);
    const bundle = buildEvidenceBundle({
      ...config,
      researchSnapshot: resolveArtifact(config.researchSnapshot),
      eventDossier: resolveArtifact(config.eventDossier),
      legalReport: resolveArtifact(config.legalReport),
      script: resolveArtifact(config.script),
      rootDir: val('--root') ? path.resolve(configDir, val('--root')) : path.dirname(path.resolve(output)),
    });
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(path.resolve(output), `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ status: 'created', bundle: path.resolve(output), bundleSha256: hashFile(output) }, null, 2));
  } else if (command === 'verify') {
    const file = required('--bundle');
    const bundle = json(file);
    const expected = val('--sha256');
    if (expected && expected !== hashFile(file)) throw new Error('Evidence bundle file hash mismatch');
    verifyEvidenceBundle(bundle, { rootDir: val('--root') ? path.resolve(path.dirname(path.resolve(file)), val('--root')) : path.dirname(path.resolve(file)) });
    console.log(JSON.stringify({ status: 'pass', bundle: path.resolve(file), bundleSha256: hashFile(file) }, null, 2));
  } else throw new Error('Usage: build|verify');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
