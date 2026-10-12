import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const projectId = 'research-6b1a8af9b4143acb';
const root = path.join(repo, 'out', 'storyboards', projectId, 'storyline-v1', 'cut-boards-v2');
const manifestPath = path.join(root, 'storyboard-bundle-manifest-v1.json');
const planPath = path.join(repo, 'production', 'newsroom', 'projects', `${projectId}.storyboard-guided-video-design-v1.md`);
const sheetPath = path.join(root, 'storyboard-contact-sheet-v2.png');
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const pngSize = file => {
  const b = fs.readFileSync(file);
  if (b.length < 24 || b.subarray(1, 4).toString() !== 'PNG') throw new Error(`not png: ${file}`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
};
const ensurePhysicalContained = file => {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`not physical file: ${file}`);
  const realRoot = fs.realpathSync(root);
  const realFile = fs.realpathSync(file);
  if (!realFile.startsWith(`${realRoot}${path.sep}`)) throw new Error(`outside root: ${file}`);
};

if (fs.existsSync(manifestPath)) throw new Error('append-only manifest already exists');
if (!fs.existsSync(planPath) || !fs.existsSync(sheetPath)) throw new Error('plan or contact sheet missing');

const characters = {
  1: ['character-son-v2', 'character-teacher-v2'],
  2: ['character-teacher-v2'],
  3: ['character-police-father-alpha-v3'],
  4: ['character-police-father-alpha-v3'],
  5: ['character-police-father-alpha-v3'],
  6: [], 7: [], 8: [],
  9: ['character-investigator-v2'],
  10: ['character-police-father-alpha-v3'],
  11: ['character-colleague-male-v1', 'character-colleague-female-v1', 'character-teacher-v2'],
  12: ['character-police-father-alpha-v3'],
  13: ['character-investigator-v2', 'character-colleague-male-v1'],
  14: ['character-investigator-v2'],
  15: ['character-police-father-alpha-v3', 'character-son-v2'],
  16: [],
  17: ['character-civilian-male-v1', 'character-civilian-female-v1'],
};

const cuts = [];
const seen = new Set();
for (let n = 1; n <= 17; n += 1) {
  const cutId = `cut-${String(n).padStart(3, '0')}`;
  const file = path.join(root, `${cutId}.png`);
  ensurePhysicalContained(file);
  const size = pngSize(file);
  if (size.width !== 1254 || size.height !== 1254) throw new Error(`wrong dimensions: ${cutId}`);
  const hash = sha256(file);
  if (seen.has(hash)) throw new Error(`duplicate storyboard bytes: ${cutId}`);
  seen.add(hash);
  const characterMasterIds = characters[n];
  cuts.push({
    cutId,
    storyboardAssetId: `storyboard-${cutId}-rough-v2`,
    relativePath: `${cutId}.png`,
    bytes: fs.statSync(file).size,
    sha256: hash,
    width: size.width,
    height: size.height,
    characterMasterIds,
    providerReferenceOrder: [`storyboard-${cutId}-rough-v2`, ...characterMasterIds],
  });
}

ensurePhysicalContained(sheetPath);
const manifest = {
  schema: 'newsroom-storyboard-bundle-v1',
  projectId,
  status: 'private-preproduction-primary-agent-qa-pass-human-approval-pending',
  contractRevision: 'storyboard-first-character-masters-v1',
  cutCount: cuts.length,
  inputRule: {
    everyCutStoryboardCount: 1,
    humanCutCharacterCount: '1-3',
    informationCutCharacterCount: 0,
    totalReferenceCount: '1-4',
    storyboardAlwaysFirst: true,
    forbiddenAdditionalReferenceClasses: ['environment', 'prop', 'document', 'map', 'marker', 'divider', 'timeline', 'grid', 'effect'],
  },
  cuts,
  designPlan: { bytes: fs.statSync(planPath).size, sha256: sha256(planPath) },
  contactSheet: { relativePath: 'storyboard-contact-sheet-v2.png', bytes: fs.statSync(sheetPath).size, sha256: sha256(sheetPath) },
  creator: { scriptSha256: sha256(fileURLToPath(import.meta.url)) },
  gates: { provider: false, render: false, upload: false, publication: false, stage07: false },
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ manifestPath, manifestSha256: sha256(manifestPath), cutCount: cuts.length, status: manifest.status }));
