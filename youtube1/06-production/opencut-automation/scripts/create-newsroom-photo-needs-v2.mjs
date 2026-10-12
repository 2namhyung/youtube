import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashRealMediaNeedsContent } from './newsroom-real-media-admission.mjs';

const root = path.resolve(import.meta.dirname, '..');
const authority = path.join(root, 'out', 'studies', 'three-story-authority-reapproval-v2', 'run-20260815T051236587Z-a2871f');
const outRoot = path.join(root, 'out', 'studies', 'newsroom-real-media-needs-v2');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const json = (v) => `${JSON.stringify(v, null, 2)}\n`;
const slugFiles = { 'police-father': 'police-father.semantic-cut-plan.json', 'jeju-school-intrusion': 'jeju-school-intrusion.semantic-cut-plan.json', 'nurse-pesticide-coffee': 'nurse-pesticide-coffee.semantic-cut-plan.json' };
const targets = { 'police-father': 16, 'jeju-school-intrusion': 15, 'nurse-pesticide-coffee': 15 };
const queryWords = {
  'police-father': ['police station exterior Korea', 'forensic evidence laboratory', 'CCTV security camera', 'prosecutor office Korea', 'court building Korea', 'police badge desk', 'evidence locker', 'investigation files desk', 'security monitor wall', 'public safety building', 'detective office', 'police vehicle exterior', 'court hallway', 'legal documents desk', 'forensic photography'],
  'jeju-school-intrusion': ['school corridor Korea', 'empty classroom Korea', 'Jeju police station', 'education office Korea', 'court building Korea', 'school gate exterior', 'classroom door', 'school security camera', 'island police station', 'public school hallway', 'education administration building', 'court entrance', 'police tape doorway', 'school office', 'institutional hallway'],
  'nurse-pesticide-coffee': ['coffee cup top view', 'hospital corridor Korea', 'nurse station hospital', 'pesticide container', 'medical ward corridor', 'hospital hallway empty', 'clinic reception desk', 'nursing station', 'laboratory bottle', 'safety container', 'coffee table still life', 'medical file desk', 'hospital exterior', 'ward corridor', 'clinical equipment']
};

function visualNeed(slug, cut, index) {
  const span = cut.spanBindings?.[0];
  const query = queryWords[slug][Math.min(index, queryWords[slug].length - 1)];
  const real = index < targets[slug];
  return {
    storyId: slug, cutId: cut.cutId, order: cut.order,
    narrationAnchor: { spanId: span?.spanId || null, start: span?.start ?? null, end: span?.end ?? null, durationSeconds: cut.durationIntent?.authoredDurationSeconds },
    visualInformationNeed: real ? `documentary context for ${slug} cut ${cut.cutId}; ${query}` : 'sensitive action or unsupported case-specific event requires generated storyboard',
    searchQuery: real ? query : null,
    sourceClass: real ? 'institutional-context' : 'grok-generated',
    usageMode: 'full-frame', requestedDisplayPixels: 972,
    rightsPolicy: 'CC0/Public Domain/CC BY/KOGL1 only; no news-site downloads; providerInputStatus=denied'
  };
}

export async function createNewsroomPhotoNeedsV2() {
  const cases = [];
  for (const [slug, file] of Object.entries(slugFiles)) {
    const bytes = await fs.readFile(path.join(authority, file)); const plan = JSON.parse(bytes);
    const cuts = plan.cuts.map((cut, index) => visualNeed(slug, cut, index));
    cases.push({ storyId: plan.caseId, slug, semanticCutPlanSha256: plan.approval.sha256, cutCount: cuts.length, cuts });
  }
  const artifact = { schema: 'newsroom-real-media-needs-v2', activeContract: 'evidence-motion-documentary-v13-hybrid-real-media-admission', authorityRun: path.relative(root, authority).replaceAll('\\', '/'), generatedAt: new Date().toISOString(), policy: { searchAfterNeeds: true, maxPrimaryReuse: 1, minimumUniquePrimaryRatio: 0.9, compositeAssignmentKey: 'storyId:cutId', noModuloAssignment: true }, cases };
  artifact.approval = { approved: true, status: 'admitted', sha256: hashRealMediaNeedsContent(artifact) };
  const runId = `run-${new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}-${crypto.randomBytes(3).toString('hex')}`;
  const runDir = path.join(outRoot, runId); await fs.mkdir(outRoot, { recursive: true }); await fs.mkdir(runDir, { recursive: false });
  await fs.writeFile(path.join(runDir, 'photo-needs.json'), json(artifact), { flag: 'wx' });
  await fs.writeFile(path.join(runDir, 'manifest.json'), json({ schema: 'newsroom-real-media-needs-v2-run', runId, photoNeeds: 'photo-needs.json', photoNeedsSha256: artifact.approval.sha256, cutCounts: cases.map((c) => ({ storyId: c.storyId, slug: c.slug, cuts: c.cutCount, realPhotoNeeds: c.cuts.filter((x) => x.sourceClass !== 'grok-generated').length })) }), { flag: 'wx' });
  return { runDir, sha256: artifact.approval.sha256, cases: cases.map((c) => ({ slug: c.slug, cuts: c.cutCount, realPhotoNeeds: c.cuts.filter((x) => x.sourceClass !== 'grok-generated').length })) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) createNewsroomPhotoNeedsV2().then((r) => process.stdout.write(`${JSON.stringify(r, null, 2)}\n`)).catch((e) => { process.stderr.write(`${e.stack || e}\n`); process.exitCode = 1; });
