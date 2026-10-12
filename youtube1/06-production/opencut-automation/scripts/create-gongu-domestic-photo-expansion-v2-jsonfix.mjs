import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const sourceDir = path.join(root, 'out', 'studies', 'gongu-domestic-photo-expansion-v2', 'run-20260815T135157620Z-188ac6');
const targetDir = path.join(root, 'out', 'studies', 'gongu-domestic-photo-expansion-v2', 'run-20260815T141200Z-jsonfix-6f10a2');
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');

const reviews = [
  ['gongu-v2-001', 'police-father', 'cut-003', 'conditional', 'Visible brand mark; crop or mask locally before using as a generic camera reference.'],
  ['gongu-v2-002', 'police-father', 'cut-006', 'approved', 'Unrelated Korean camera prop with no person or sensitive information.'],
  ['gongu-v2-003', 'jeju-school-intrusion', 'cut-008', 'approved', 'Unrelated Korean camera prop; use only as a generic CCTV-device reference.'],
  ['gongu-v2-004', 'police-father', 'cut-009', 'approved', 'Unrelated Korean desk and document photo; do not present the text as an actual case record.'],
  ['gongu-v2-005', 'nurse-pesticide-coffee', 'cut-006', 'approved', 'Unrelated Korean laptop and desk photo with no person or private screen data.'],
  ['gongu-v2-006', 'nurse-pesticide-coffee', 'cut-007', 'approved', 'Unrelated Korean book photo; label as generic reference material.'],
];

async function main() {
  await fs.rm(targetDir, {recursive: true, force: false}).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  await fs.mkdir(path.join(targetDir, 'originals'), {recursive: true});
  await fs.mkdir(path.join(targetDir, 'rights'), {recursive: true});
  const predecessor = JSON.parse(await fs.readFile(path.join(sourceDir, 'manifest.json'), 'utf8'));
  const assets = [];
  for (const asset of predecessor.assets) {
    const sourceOriginal = path.resolve(root, asset.original.relativePath);
    const sourceRights = path.resolve(root, asset.evidence.rightsRelativePath);
    const originalName = path.basename(asset.original.relativePath);
    const rightsName = path.basename(asset.evidence.rightsRelativePath);
    const original = path.join(targetDir, 'originals', originalName);
    const rights = path.join(targetDir, 'rights', rightsName);
    await fs.copyFile(sourceOriginal, original, fs.constants.COPYFILE_EXCL);
    await fs.copyFile(sourceRights, rights, fs.constants.COPYFILE_EXCL);
    const originalBytes = await fs.readFile(original);
    const rightsBytes = await fs.readFile(rights);
    const next = structuredClone(asset);
    next.original = {...asset.original, relativePath: path.relative(root, original).replaceAll('\\', '/'), realpath: path.resolve(original), bytes: originalBytes.length, sha256: sha(originalBytes), preserved: true};
    next.evidence = {...asset.evidence, rightsRelativePath: path.relative(root, rights).replaceAll('\\', '/'), itemPageSha256: sha(rightsBytes), itemPageBytes: rightsBytes.length};
    assets.push(next);
  }
  const predecessorContact = path.join(sourceDir, 'contact-sheet.jpg');
  const contact = path.join(targetDir, 'contact-sheet.jpg');
  await fs.copyFile(predecessorContact, contact, fs.constants.COPYFILE_EXCL);
  const manifest = {...predecessor, generatedAt: new Date().toISOString(), predecessorRun: path.relative(root, sourceDir).replaceAll('\\', '/'), assets, successorReason: 'UTF-8 JSON repair; predecessor preserved unchanged'};
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(targetDir, 'manifest.json'), manifestBytes, {flag: 'wx'});
  const manifestHash = sha(manifestBytes);
  const contactHash = sha(await fs.readFile(contact));
  const reviewRows = reviews.map(([assetId, storyId, cutId, decision, reason]) => ({assetId, storyId, cutId, decision, reason, flags: {recognizablePerson: false, minor: false, sensitiveParty: false, trademarkLogo: decision === 'conditional', casePartyImplication: false}}));
  const counts = {reviewed: reviewRows.length, approved: reviewRows.filter((row) => row.decision === 'approved').length, conditional: reviewRows.filter((row) => row.decision === 'conditional').length, rejected: reviewRows.filter((row) => row.decision === 'rejected').length};
  const visualReview = {schema: 'gongu-domestic-photo-visual-review-v3', reviewedAt: new Date().toISOString(), predecessorRun: path.relative(root, sourceDir).replaceAll('\\', '/'), acquisitionManifest: 'manifest.json', manifestSha256: manifestHash, contactSheet: 'contact-sheet.jpg', contactSheetSha256: contactHash, policy: {domesticOnly: true, providerInput: 'denied', caseEvidence: false, maxPrimaryReuse: 1}, reviews: reviewRows, counts, production: {provider: false, render: false, upload: false, publication: false, stage07: false}};
  await fs.writeFile(path.join(targetDir, 'visual-review.json'), `${JSON.stringify(visualReview, null, 2)}\n`, {flag: 'wx'});
  console.log(JSON.stringify({targetDir, manifestSha256: manifestHash, contactSheetSha256: contactHash, counts}, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
