import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {TOOL_IDS, TOPICS, verifyAuthorityContract} from './learning-contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUTOMATION_ROOT = path.resolve(HERE, '../..');
const DEFAULT_ROOT = path.join(AUTOMATION_ROOT, 'out', 'studies', 'motion-tool-learning-v1');
const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readPngSize = file => { const b = fs.readFileSync(file); if (b.readUInt32BE(0) !== 0x89504e47 || b.toString('ascii', 1, 4) !== 'PNG') throw new Error(`not PNG: ${file}`); return {width: b.readUInt32BE(16), height: b.readUInt32BE(20)}; };

export function verify(root = DEFAULT_ROOT) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const isV2 = manifest.schema === 'motion-tool-learning-v2';
  if (!['motion-tool-learning-v1', 'motion-tool-learning-v2'].includes(manifest.schema) || manifest.sampleCount !== TOOL_IDS.length * TOPICS.length) throw new Error('sample set must contain 60 samples');
  if (manifest.contract.width !== 972 || manifest.contract.height !== 972 || manifest.contract.fps !== 24 || manifest.contract.frames !== 48 || manifest.contract.durationSeconds !== 2 || manifest.contract.network !== false) throw new Error('contract drift');
  verifyAuthorityContract(manifest.authority);
  const seenIds = new Set(); const seenTopics = new Set(); const seenMechanics = new Set(); const artifactHashes = new Set();
  for (const sampleId of manifest.samples) {
    if (seenIds.has(sampleId)) throw new Error(`duplicate sample id: ${sampleId}`); seenIds.add(sampleId);
    const sampleDir = path.join(root, 'samples', sampleId); const sample = JSON.parse(fs.readFileSync(path.join(sampleDir, 'sample.json'), 'utf8'));
    if (sample.sampleId !== sampleId || !TOOL_IDS.includes(sample.tool) || !TOPICS.some(([id]) => id === sample.topic.id)) throw new Error(`invalid sample identity: ${sampleId}`);
    if (isV2 && (!sample.runtimeEvidence || sample.runtimeEvidence.networkBlocked !== true || !sample.runtimeEvidence.invokedApi || !Array.isArray(sample.runtimeEvidence.frameSeek) || sample.mechanic === undefined)) throw new Error(`runtime evidence missing: ${sampleId}`);
    if (seenTopics.has(`${sample.tool}:${sample.topic.id}`)) throw new Error(`duplicate tool/topic: ${sample.tool}:${sample.topic.id}`); seenTopics.add(`${sample.tool}:${sample.topic.id}`);
    if (seenMechanics.has(sample.referenceMechanicId)) throw new Error(`duplicate mechanic: ${sample.referenceMechanicId}`); seenMechanics.add(sample.referenceMechanicId);
    if (!/^https:\/\//u.test(sample.provenance.officialReference) || sample.provenance.status !== 'source-only' || !sample.provenance.observed || !sample.provenance.inferred) throw new Error(`provenance missing: ${sampleId}`);
    verifyAuthorityContract({authorityId: manifest.authority.authorityId, creatorSha256: manifest.authority.creatorSha256, adapterSha256: manifest.authority.adapterSha256});
    if (sample.contract.width !== 972 || sample.contract.height !== 972 || sample.contract.fps !== 24 || sample.contract.frames !== 48 || sample.contract.network !== false || sample.contract.finalEncodeMuxQc !== 'ffmpeg') throw new Error(`sample contract drift: ${sampleId}`);
    const fields = ['timing', 'path', 'transformOccupancy', 'stateLayerOrder', 'effectEasing']; if (fields.some(field => sample.score[field] === undefined) || sample.score.total < 90 || sample.score.threshold !== 90 || sample.score.status !== 'passed') throw new Error(`score failed: ${sampleId}`);
    if (sample.expectedSignature.start.frame !== 0 || sample.expectedSignature.mid.frame !== 24 || sample.expectedSignature.end.frame !== 47) throw new Error(`signature frames invalid: ${sampleId}`);
    if (isV2 && JSON.stringify(sample.expectedSignature) === JSON.stringify(sample.measuredSignature)) throw new Error(`copied expected/measured signature: ${sampleId}`);
    const triplet = sample.artifact; if (triplet.kind !== 'png-triplet' || JSON.stringify(triplet.indices) !== JSON.stringify([1, 24, 48]) || new Set(triplet.sha256).size !== 3) throw new Error(`triplet invalid: ${sampleId}`);
    for (const index of triplet.indices) { const file = path.join(sampleDir, `frame-${String(index).padStart(4, '0')}.png`); const size = readPngSize(file); if (size.width !== 972 || size.height !== 972) throw new Error(`artifact dimensions invalid: ${sampleId}`); const hash = sha256(file); if (hash !== triplet.sha256[triplet.indices.indexOf(index)]) throw new Error(`artifact hash drift: ${sampleId}`); artifactHashes.add(hash); }
  }
  for (const tool of TOOL_IDS) { const rows = manifest.samples.filter(id => id.startsWith(tool.replace(/-v1$/u, '') + '-')); if (rows.length !== TOPICS.length) throw new Error(`tool count invalid: ${tool}`); }
  for (const tool of TOOL_IDS) if (!fs.existsSync(path.join(root, `${tool}-contact-sheet.png`))) throw new Error(`contact sheet missing: ${tool}`);
  return {verified: true, sampleCount: seenIds.size, distinctArtifactHashes: artifactHashes.size, tools: TOOL_IDS.length, topics: TOPICS.length};
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) console.log(JSON.stringify(verify(process.argv[2] || DEFAULT_ROOT)));
