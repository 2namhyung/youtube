import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {buildEpisodePlanOutputs, withDerivedProductionStateHashes} from './episode-plan-generator-lib.mjs';

const root = process.cwd();
const episodeDir = path.join(root, 'video', 'episodes', 'episode-001');
const specPath = path.join(episodeDir, 'episode-spec.json');
const specBytes = await readFile(specPath);
const spec = JSON.parse(specBytes.toString('utf8'));
const outputs = buildEpisodePlanOutputs(spec, specBytes);

for (const [name, contents] of outputs) {
  const output = path.join(episodeDir, name);
  await mkdir(path.dirname(output), {recursive: true});
  await writeFile(output, contents, 'utf8');
}
const statePath = path.join(episodeDir, 'production-state.json');
const state = withDerivedProductionStateHashes(JSON.parse(await readFile(statePath, 'utf8')), specBytes, spec);
await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
console.log(`Generated ${outputs.size} EP001 compatibility outputs and refreshed derived production-state hashes from episode-spec.json.`);
