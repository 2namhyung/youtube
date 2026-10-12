import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectId = 'research-6b1a8af9b4143acb';
const sourcePath = path.join(root, 'out', 'newsroom', 'grok-sources', projectId, 'execution-v1-character-autonomous', 'execution-manifest-v1.json');
const outputRoot = path.join(root, 'out', 'newsroom', 'grok-sources', projectId, 'execution-v2-character-pack-autonomous');
const v32Root = path.join(root, 'out', 'prototypes', `${projectId}-v32-grok-reference-assets-production-v1`);
const v34Root = path.join(root, 'out', 'prototypes', `${projectId}-v34-teacher-neutral-master-production-v1`);
const v32Path = path.join(v32Root, 'production-admission-v1.json');
const v34Path = path.join(v34Root, 'production-admission-v1.json');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (file) => fs.readFileSync(file);
const load = (file) => JSON.parse(read(file).toString('utf8'));
const assert = (value, message) => { if (!value) throw new Error(message); };

const sourceBytes = read(sourcePath); const source = JSON.parse(sourceBytes);
const v32Bytes = read(v32Path); const v32 = JSON.parse(v32Bytes);
const v34Bytes = read(v34Path); const v34 = JSON.parse(v34Bytes);
assert(source.schema === 'grok-character-autonomous-full-execution-v1' && source.requests.length === 18, 'v1 source manifest is invalid');
assert(v32.production?.approved && v32.production?.privateOnly && !v32.production?.public, 'v32 character admission is not private-approved');
assert(v34.production?.approved && v34.production?.privateOnly && !v34.production?.public, 'v34 character admission is not private-approved');

const assets = new Map(v32.commonMasters.filter((item) => item.role === 'character').map((item) => [item.assetId, { root: v32Root, ...item }]));
assets.set(v34.asset.assetId, { root: v34Root, ...v34.asset });
const reference = (assetId) => {
  const asset = assets.get(assetId); assert(asset, `missing admitted character ${assetId}`);
  const file = path.resolve(asset.root, asset.file); const stat = fs.lstatSync(file); const bytes = read(file);
  assert(stat.isFile() && !stat.isSymbolicLink(), `unsafe character file ${assetId}`);
  assert(sha(bytes) === asset.sha256 && bytes.length === asset.bytes, `character bytes drifted ${assetId}`);
  return { assetId, role: 'character', file: path.relative(root, file).replaceAll('\\', '/'), bytes: asset.bytes, sha256: asset.sha256 };
};

const packs = new Map(Object.entries({
  'cut-001': ['character-teacher-neutral-v3'],
  'cut-002': ['character-police-father-alpha-v3'],
  'cut-003': [],
  'cut-004': ['character-son-v2', 'character-teacher-neutral-v3'],
  'cut-005': ['character-police-father-alpha-v3'],
  'cut-006': [],
  'cut-007': [],
  'cut-008': ['character-investigator-v2'],
  'cut-009': ['character-investigator-v2'],
  'cut-010': ['character-police-father-alpha-v3'],
  'cut-011': ['character-police-father-alpha-v3'],
  'cut-012': ['character-colleague-male-v1', 'character-colleague-female-v1', 'character-teacher-neutral-v3'],
  'cut-013': ['character-police-father-alpha-v3'],
  'cut-014': ['character-investigator-v2', 'character-colleague-male-v1'],
  'cut-015': ['character-investigator-v2'],
  'cut-016': ['character-police-father-alpha-v3', 'character-son-v2'],
  'cut-017': [],
  'cut-018': ['character-civilian-male-v1', 'character-civilian-female-v1'],
}));

const replacements = new Map([
  ['cut-004', `Use uploaded character 1 as the high-school son and uploaded character 2 as the adult female teacher. Preserve both blank paper faces and clothing. Create an anonymous classroom. The son, in the left-middle plane, subtly raises and angles one intact phone toward the teacher side once. The teacher, in the right-middle plane, notices the direction and takes one restrained step back without touching him; the son immediately lowers the phone. End with a clear gap between them. No recorded imagery, phone-screen content, sensational reaction, touching, repeated attempt, additional student or any third person.`],
  ['cut-012', `Use uploaded character 1 as the male police colleague, character 2 as the female police colleague, and character 3 as the adult female teacher. Preserve their blank paper faces and clothing. Place the two colleagues as separate restrained critique silhouettes on the left and center, and the teacher as the affected adult on the right. Reveal one institution card, then draw one relationship line to each colleague and a final line toward the teacher; the camera settles on the teacher. No spoken dialogue, lip movement, pointing, invented quote, emotional expression or any fourth person.`],
  ['cut-014', `Use uploaded character 1 as the investigator and character 2 as a male police colleague assisting only as a neutral witness to procedure. Preserve both blank paper faces and clothing. Create an anonymous residential exterior with a closed plain door and a short paper approach route. The investigator walks to the threshold while the colleague remains one pace behind; both stop before the closed boundary and do not enter. No forced entry, interior search, seized item, exact address, logo or any third person.`],
  ['cut-016', `Use uploaded character 1 as the police father and character 2 as his high-school son, preserving both blank paper faces and clothing. Keep both still on the left side as a family relationship pair, with no touch or gesture. Create a horizontal legal track toward a punishment endpoint. A small family token moves once; a layered paper legal barrier lowers and locks so it stops before the endpoint. Leave space for a later qualifier overlay. No verdict, acquittal celebration, court seal, readable legal text or any third person.`],
  ['cut-018', `Use uploaded character 1 as an anonymous male civilian and uploaded character 2 as an anonymous female civilian, preserving both blank paper faces and clothing. Show them from a three-quarter back public viewpoint facing a distant generic institution silhouette. They each take one restrained step into the foreground and stop side by side. A small phone token and case-folder token travel on separate return rails and stop before an unresolved central gap. Finish with a restrained pullback and open space for the closing question. No protest, witness claim, readable sign, exact building, definitive trust-loss statement or any third person.`],
]);

const requests = source.requests.map((item) => {
  const ids = packs.get(item.cutId); assert(ids, `missing pack for ${item.cutId}`);
  const characterReferences = ids.map(reference);
  assert(item.classification === 'information-motion' ? characterReferences.length === 0 : characterReferences.length >= 1 && characterReferences.length <= 3, `character count invalid for ${item.cutId}`);
  const basePrompt = replacements.get(item.cutId) || item.prompt;
  return {
    ...item,
    schema: 'grok-character-pack-autonomous-cut-request-v2',
    status: ['cut-001', 'cut-002'].includes(item.cutId) ? 'provider-source-preserved-private-only' : 'provider-ready-private-only',
    characterReferences,
    referenceCount: characterReferences.length,
    prompt: replacements.has(item.cutId) ? `${basePrompt}\n\nSTYLE AND SAFETY\nPremium flat 2D editorial paper-cut collage, matte fibrous paper with torn edges, restrained beige, dark green, navy and burgundy, shallow layered depth. Square composition with foreground, midground and background. No readable text, logo, insignia, exact workplace or address, photorealism, glossy 3D, morphing, reversal or loop. One coherent state change. Produce a square approximately six-second source; independent semantic QA selects the strongest continuous narration-fitting window at 1x.` : basePrompt.replace(/only fully visible person|only person/gu, characterReferences.length > 1 ? 'specified uploaded people' : 'only uploaded person'),
    authority: { ...item.authority, predecessorExecutionManifestSha256: sha(sourceBytes), v32AdmissionSha256: sha(v32Bytes), v34AdmissionSha256: sha(v34Bytes) },
  };
});

const manifest = {
  schema: 'grok-character-pack-autonomous-full-execution-v2', status: 'provider-ready-private-only', projectId,
  contractRevision: 'evidence-motion-documentary-v9-grok-character-pack-autonomous-scenes',
  predecessor: { schema: source.schema, sha256: sha(sourceBytes) }, requestCount: requests.length,
  humanActionCount: requests.filter((item) => item.classification === 'human-action').length,
  informationMotionCount: requests.filter((item) => item.classification === 'information-motion').length,
  permissions: { providerCall: true, privateRender: true, upload: false, publication: false, stage07: false }, requests,
};
const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
fs.mkdirSync(outputRoot, { recursive: true });
const target = path.join(outputRoot, 'execution-manifest-v2.json');
if (fs.existsSync(target)) assert(read(target).equals(bytes), 'append-only v2 manifest drift');
else { fs.writeFileSync(target, bytes, { flag: 'wx' }); fs.chmodSync(target, 0o444); }
console.log(JSON.stringify({ target, sha256: sha(read(target)), requestCount: requests.length, characterReferenceCount: requests.reduce((sum, item) => sum + item.referenceCount, 0) }, null, 2));
