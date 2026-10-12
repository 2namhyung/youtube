import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {loadAuthorityState, ROOT} from './render-authority-lib.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const specPath = path.resolve(ROOT, 'video/episodes/episode-001/episode-spec.json');
const contractsPath = path.resolve(ROOT, 'video/episodes/episode-001/generated/manifest-contracts.json');
const [specBytes, contractsBytes, authorityState] = await Promise.all([
  readFile(specPath), readFile(contractsPath), loadAuthorityState(),
]);
const contracts = JSON.parse(contractsBytes.toString('utf8'));
const specSha = sha256(specBytes);
if (contracts?.source_spec_sha256 !== specSha || contracts?._generated?.source_sha256 !== specSha) {
  throw new Error('generated manifest contracts are stale; run video:generate-plans first');
}

const synced = [];
for (const shotId of authorityState.authority.present_shot_ids ?? []) {
  const contract = contracts.cuts?.find((item) => item.shot_id === shotId);
  if (!contract) throw new Error(`${shotId}: generated cut contract is missing`);
  const manifestPath = path.join(authorityState.cutRoot, 'cuts', shotId, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.shot_id !== shotId || manifest.episode_id !== authorityState.state.episode_id) throw new Error(`${shotId}: manifest identity mismatch`);
  if (manifest.source_cut_sha256 !== contract.source_cut_sha256 || manifest.manifest_contract_sha256 !== contract.manifest_contract_sha256) {
    throw new Error(`${shotId}: editorial/cut contract changed; metadata-only rebinding is forbidden`);
  }
  manifest.source_spec_sha256 = contract.source_spec_sha256;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  synced.push(shotId);
}

console.log(JSON.stringify({ok:true, metadata_only:true, source_spec_sha256:specSha, synced_shot_ids:synced, active_cut_root:authorityState.state.active_cut_root ?? null}, null, 2));
