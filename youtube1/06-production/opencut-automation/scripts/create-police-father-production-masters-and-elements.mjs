import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (value) => value.slice(1)));
const slug = 'research-6b1a8af9b4143acb';
const sourceId = `${slug}-v29-common-masters`;
const successorId = `${slug}-v29-common-masters-production-v4`;
const sourceRoot = path.join(ROOT, 'out', 'prototypes', sourceId);
const successorRoot = path.join(ROOT, 'out', 'prototypes', successorId);
const sourceManifestPath = path.join(sourceRoot, 'common-master-manifest.json');
const contactSheetPath = path.join(sourceRoot, 'common-master-contact-sheet-v1.png');
const planPath = path.join(ROOT, 'out', 'prototypes', `${slug}-next-stage-v1`, 'agent-authored-video-design-plan-v1.json');
const workflowPath = path.join(ROOT, 'production', 'newsroom', 'projects', `${slug}.workflow.json`);
const approvalPath = path.join(successorRoot, 'master-production-approval-v1.json');
const successorManifestPath = path.join(successorRoot, 'common-master-manifest.json');
const queuePath = path.join(successorRoot, 'imagegen-isolated-elements-generation-queue-v1.json');
const bindingPath = path.join(successorRoot, 'workflow-successor-binding-v1.json');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const rel = (file) => path.relative(ROOT, file).replaceAll('\\', '/');
const writeImmutable = async (file, value) => fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
const copyImmutable = async (source, target) => { try { await fs.copyFile(source, target, fs.constants.COPYFILE_EXCL); } catch (error) { if (error.code !== 'EEXIST') throw error; } };
const withoutHash = (value) => { const clone = structuredClone(value); delete clone.artifactSha256; return clone; };

const sourceManifest = await readJson(sourceManifestPath);
if (sourceManifest.manifestId !== sourceId || sourceManifest.production?.approved !== false || sourceManifest.production?.public !== false) throw new Error('source common-master manifest is not the expected preview authority');
const sourceManifestBytes = await fs.readFile(sourceManifestPath);
const sourceManifestSha256 = sha256(sourceManifestBytes);
const contactSheetBytes = await fs.readFile(contactSheetPath);
const contactSheetSha256 = sha256(contactSheetBytes);
const plan = await readJson(planPath);
const workflowSha256 = sha256(await fs.readFile(workflowPath));
if (plan.schema !== 'agent-authored-video-design-plan-v1' || plan.cuts?.length !== 18) throw new Error('current 18-cut authored plan is missing or stale');
const approvedAt = new Date().toISOString();
const sourceAssets = [];
for (const asset of sourceManifest.assets) {
  const source = path.join(sourceRoot, asset.relativePath);
  const bytes = await fs.readFile(source);
  const digest = sha256(bytes);
  if (digest !== asset.sourceSha256) throw new Error(`source master bytes drifted: ${asset.masterAssetId}`);
  sourceAssets.push({ asset, source, digest });
}
const inputBinding = { sourceManifestId: sourceManifest.manifestId, sourceManifestSha256, contactSheetSha256, visualAuthorityId: sourceManifest.visualAuthorityId, visualAuthoritySha256: sourceManifest.visualAuthoritySha256, masterAssetSha256: sourceAssets.map(({ asset, digest }) => ({ masterAssetId: asset.masterAssetId, sourceSha256: digest })), userApproval: 'Current user turn explicitly approves the exact nine displayed common paper-cut master bytes for private production.' };
const approval = { schema: 'newsroom-common-master-production-approval-v1', approvalId: `${successorId}-approval-v1`, slug, approvedAt, approvalContext: { userTurn: 'current-user-turn-2026-08-14', statement: inputBinding.userApproval }, sourceManifest: { manifestId: sourceManifest.manifestId, relativePath: rel(sourceManifestPath), sha256: sourceManifestSha256 }, contactSheet: { relativePath: rel(contactSheetPath), sha256: contactSheetSha256 }, visualAuthority: { id: sourceManifest.visualAuthorityId, sha256: sourceManifest.visualAuthoritySha256 }, production: { approved: true, privateOnly: true, public: false }, exactMasterBytes: sourceAssets.map(({ asset, digest }) => ({ masterAssetId: asset.masterAssetId, role: asset.role, sourceSha256: digest, relativePath: asset.relativePath })), creator: { id: 'newsroom-common-master-production-approval-creator-v1', inputSha256: sha256(Buffer.from(JSON.stringify(inputBinding), 'utf8')) }, verifier: { id: 'newsroom-common-master-production-approval-verifier-v1', verified: true, reportSha256: sha256(Buffer.from(JSON.stringify({ inputBinding, exactMasterBytes: sourceAssets.map(({ asset, digest }) => [asset.masterAssetId, digest]) }), 'utf8')) } };
approval.artifactSha256 = sha256(Buffer.from(JSON.stringify(withoutHash(approval)), 'utf8'));

await fs.mkdir(path.join(successorRoot, 'alpha'), { recursive: true });
await fs.mkdir(path.join(successorRoot, 'opaque'), { recursive: true });
await copyImmutable(contactSheetPath, path.join(successorRoot, 'common-master-contact-sheet-v1.png'));
for (const { asset, source } of sourceAssets) await copyImmutable(source, path.join(successorRoot, asset.relativePath));
await writeImmutable(approvalPath, approval);

const successorManifest = structuredClone(sourceManifest);
successorManifest.manifestId = successorId;
successorManifest.rootRelative = rel(successorRoot);
successorManifest.humanReview = 'human-approved-production';
successorManifest.production = { approved: true, public: false };
successorManifest.productionApproval = { schema: approval.schema, approvalId: approval.approvalId, artifactRelativePath: rel(approvalPath), artifactSha256: approval.artifactSha256, approvedAt };
successorManifest.successorOf = { manifestId: sourceManifest.manifestId, manifestSha256: sourceManifestSha256 };
successorManifest.artifactSha256 = sha256(Buffer.from(JSON.stringify(withoutHash(successorManifest)), 'utf8'));
await writeImmutable(successorManifestPath, successorManifest);

const workflowBinding = { schema: 'newsroom-common-master-workflow-successor-binding-v1', slug, createdAt: approvedAt, workflow: { relativePath: rel(workflowPath), sha256: workflowSha256 }, authoredPlan: { relativePath: rel(planPath), sha256: sha256(await fs.readFile(planPath)), schema: plan.schema }, successorMasters: { manifestId: successorManifest.manifestId, relativePath: rel(successorManifestPath), sha256: successorManifest.artifactSha256, approvalSha256: approval.artifactSha256 }, requestBinding: { commonMasterManifestId: successorManifest.manifestId, preserveExistingWorkflowAndCombinedHashes: true }, creator: 'newsroom-common-master-workflow-successor-binding-creator-v1', verifier: { id: 'newsroom-common-master-workflow-successor-binding-verifier-v1', verified: true } };
workflowBinding.artifactSha256 = sha256(Buffer.from(JSON.stringify(withoutHash(workflowBinding)), 'utf8'));
await writeImmutable(bindingPath, workflowBinding);

const masterById = new Map(sourceAssets.map(({ asset, digest }) => [asset.masterAssetId, { masterAssetId: asset.masterAssetId, role: asset.role, sourceSha256: digest }]));
const deterministicCuts = plan.cuts.filter((cut) => cut.implementationMode === 'deterministic_motion_graphics');
if (deterministicCuts.length !== 17 || plan.cuts.some((cut) => cut.cutId === 'cut-004' && cut.implementationMode !== 'image_to_video_animation')) throw new Error('expected 17 deterministic cuts plus Grok cut-004');
const elements = [];
const decomposition = {
  'evidence-comparison': [['document-card', 'document evidence card'], ['phone-token', 'isolated phone state token'], ['state-marker', 'state comparison marker']],
  'spatial-search-map': [['map-field', 'abstract square map field'], ['route-line', 'non-text route line'], ['endpoint-marker', 'route endpoint marker']],
  'document-highlight': [['document-card', 'document evidence card'], ['highlight-marker', 'evidence highlight marker'], ['evidence-tab', 'evidence tab token']],
  'investigation-flow': [['case-file', 'case file token'], ['flow-node', 'investigation flow node'], ['connector-arrow', 'non-text connector arrow']],
  'timeline-gap': [['timeline-rail', 'timeline rail'], ['time-node', 'timeline event node'], ['gap-marker', 'timeline gap marker']],
  'audit-grid': [['audit-grid', 'abstract audit grid'], ['folder-stack', 'folder stack token'], ['scope-marker', 'audit scope marker']],
  'track-gap': [['track-left', 'left legal track'], ['track-right', 'right legal track'], ['gap-marker', 'track gap marker']],
  'legal-barrier': [['legal-track', 'legal track'], ['barrier', 'non-text legal barrier'], ['qualifier-marker', 'qualification marker']],
};
for (const cut of deterministicCuts) {
  const pack = cut.motionGraphics?.elementPack;
  if (!pack?.elements?.length) throw new Error(`${cut.cutId} has no isolated element pack`);
  const base = pack.elements[0];
  const roles = decomposition[cut.motionGraphics.graphicType] || decomposition['document-highlight'];
  for (const [index, [role, description]] of roles.entries()) {
    const elementId = `${cut.cutId}-${role}`;
    const masterIds = [...new Set([...(base.masterAssetIds || []), index === 0 ? 'master-prop-evidence-pack-v1' : index === 1 ? 'master-prop-phone-state-pair-v1' : 'master-environment-records-office-v1'])];
    const masterBindings = masterIds.map((id) => masterById.get(id));
    if (masterBindings.some((binding) => !binding)) throw new Error(`${cut.cutId}/${elementId} references an unknown master`);
    const sourceElementSha256 = sha256(Buffer.from(JSON.stringify(base), 'utf8'));
    const exactText = base.evidenceBindings?.[0]?.exactText || '';
    const generationPrompt = `isolated ${description} for the bound ${cut.motionGraphics.graphicType}; represent only this single non-human raster object, no full composition, no infographic, no readable text, no labels; evidence context is ${exactText}`;
    const x = 80 + index * 300;
    elements.push({ queueId: `${cut.cutId}-${role}`, cutId: cut.cutId, assetRole: role, elementId, status: 'queued-not-generated', output: `assets/scene-${cut.cutId.slice(-3)}/${elementId}.png`, sourceElementSha256, masterBindings, imageGen: { prompt: `${generationPrompt} Flat 2D fibrous paper-cut, isolated on a perfectly uniform solid #ff00ff chroma-key background; no shadow, floor, reflection, lighting variation, logos, watermark, facial features.`, aspectRatio: '1:1', canvas: 'square', extraction: { mode: 'chroma-key', keyColor: '#ff00ff', providerNativeAlpha: false, uniformChroma: true, subjectPaletteExcluded: true, lightingVariation: false, floor: false, reflection: false } }, evidenceBindings: structuredClone(base.evidenceBindings), textBinding: null, relationshipBinding: index === 2 ? { from: `${cut.cutId}-${roles[0][0]}`, to: `${cut.cutId}-${roles[1][0]}`, meaning: 'connects the separately animated evidence objects', claimIds: cut.claimIds || [], spanIds: (base.evidenceBindings || []).map((binding) => binding.sourceId) } : null, zIndex: Number(base.zIndex) + index, initialPlacement: { ...structuredClone(base.initialPlacement), x, width: 260 }, keyframes: [{ keyframeId: `kf-${elementId}`, target: elementId, startSeconds: 0, endSeconds: cut.motionGraphics.durationSeconds, transform: { x, y: 120, scale: 1, rotation: 0 }, opacity: 1, mask: { enabled: false, x: 0, y: 0, width: 972, height: 846 } }], animationSeparation: 'one raster per semantic element; renderer owns independent transform/opacity/mask keyframes' });
  }
}
const queue = { schema: 'imagegen-isolated-elements-generation-queue-v1', slug, status: 'ready-for-imagegen', privateOnly: true, nonAuthoritative: false, providerCalls: { imageGen: false, grokCut04: false, upload: false, publication: false, stage07: false }, sourcePlan: { relativePath: rel(planPath), schema: plan.schema, sha256: sha256(await fs.readFile(planPath)), cutCount: plan.cuts.length, deterministicCount: deterministicCuts.length }, commonMasters: { manifestId: successorManifest.manifestId, relativePath: rel(successorManifestPath), sha256: successorManifest.artifactSha256, approvalArtifact: { relativePath: rel(approvalPath), sha256: approval.artifactSha256 }, productionApproved: true, public: false, assetCount: sourceAssets.length }, generationPolicy: { oneToOne: true, visualAuthorityId: sourceManifest.visualAuthorityId, visualAuthoritySha256: sourceManifest.visualAuthoritySha256, style: 'paper-cut-keyframe-v1', isolation: 'flat uniform #ff00ff chroma-key where isolated', excluded: ['title', 'captions', 'cut-004 Grok'] }, assets: elements, assetCount: elements.length };
queue.artifactSha256 = sha256(Buffer.from(JSON.stringify(withoutHash(queue)), 'utf8'));
await writeImmutable(queuePath, queue);

if (process.argv.includes('--verify')) {
  const readAndVerify = async (file, expected) => { const actual = await readJson(file); if (actual.artifactSha256 !== expected || sha256(Buffer.from(JSON.stringify(withoutHash(actual)), 'utf8')) !== expected) throw new Error(`artifact hash mismatch: ${file}`); return actual; };
  await readAndVerify(approvalPath, approval.artifactSha256);
  await readAndVerify(successorManifestPath, successorManifest.artifactSha256);
  const verifiedQueue = await readAndVerify(queuePath, queue.artifactSha256);
  if (verifiedQueue.assetCount < 45 || verifiedQueue.assetCount > 60 || verifiedQueue.assets.some((asset) => asset.status !== 'queued-not-generated')) throw new Error('generation queue verification failed');
  console.log(JSON.stringify({ verified: true, approvalSha256: approval.artifactSha256, successorManifestSha256: successorManifest.artifactSha256, queueSha256: queue.artifactSha256, elementCount: elements.length }));
} else console.log(JSON.stringify({ approvalSha256: approval.artifactSha256, successorManifestSha256: successorManifest.artifactSha256, queueSha256: queue.artifactSha256, elementCount: elements.length, outputRoot: rel(successorRoot) }));
