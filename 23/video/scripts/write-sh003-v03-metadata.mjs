import {createHash} from 'node:crypto';
import {mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const qaRoot = path.join(root, 'video', 'qa', 'style-calibration', 'episode-001-sh003-assembly-set-v03');
const relative = (file) => path.relative(root, file).replaceAll('\\', '/');
const exists = async (file) => stat(file).then(() => true).catch(() => false);
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');

const people = [
  {
    person: '김승원', naasCd: 'ATB59635', sourceId: 'ASSEMBLY-PROFILE-ATB59635', graph: {photoNode: 429, membership: 51, person: 61, evidence: 4},
    original: path.join(root, 'data/raw/assembly-media/14/naas-ATB59635-m-51.jpg'), sourcePhoto: path.join(qaRoot, 'source-photo/kim-seung-won-official.jpg'), cutout: path.join(qaRoot, 'assets/assembly-speaker-photo-kim-v01.png'),
    sourceUrl: 'https://www.assembly.go.kr/static/portal/img/openassm/new/06249610045b4c5487f9586046460423.jpg', apiRaw: 'data/raw/assembly/run-3-page-0001.json', expectedOriginalSha256: 'dd60ebb169b000237607061f397b4f1973f4e174e6c9055af921e42d317650e1',
  },
  {
    person: '박형수', naasCd: '6U243644', sourceId: 'ASSEMBLY-PROFILE-6U243644', graph: {photoNode: 386, membership: 127, person: 138, evidence: 5},
    original: path.join(root, 'data/raw/assembly-media/10/naas-6U243644-m-127.jpg'), sourcePhoto: path.join(qaRoot, 'source-photo/park-hyeong-soo-official.jpg'), cutout: path.join(qaRoot, 'assets/assembly-speaker-photo-park-v01.png'),
    sourceUrl: 'https://www.assembly.go.kr/static/portal/img/openassm/new/45a932e98e3545108741802f7193bf09.jpg', apiRaw: 'data/raw/assembly/run-3-page-0002.json', expectedOriginalSha256: '1ac966b138632506df999740e254b9758a5f6da99e2e893e7d2e886c38b5f3b1',
  },
];

const personRecords = [];
for (const p of people) {
  const originalMeta = await sharp(p.original).metadata();
  const cutoutMeta = await sharp(p.cutout).metadata();
  const {data: alpha} = await sharp(p.cutout).ensureAlpha().extractChannel('alpha').raw().toBuffer({resolveWithObject: true});
  const alphaStats = alpha.reduce((s, value) => { if (value === 0) s.transparent += 1; else if (value === 255) s.opaque += 1; else s.partial += 1; return s; }, {transparent: 0, partial: 0, opaque: 0});
  personRecords.push({
    person: p.person, naas_cd: p.naasCd, source_id: p.sourceId, graph_ids: p.graph,
    source_url: p.sourceUrl, api_raw: p.apiRaw, rights_status: 'rights-review-required', reuse_approval: false,
    original: {file: relative(p.original), preserved_copy: relative(p.sourcePhoto), sha256: await sha256(p.original), expected_sha256: p.expectedOriginalSha256, width: originalMeta.width, height: originalMeta.height, format: originalMeta.format},
    cutout: {file: relative(p.cutout), sha256: await sha256(p.cutout), width: cutoutMeta.width, height: cutoutMeta.height, has_alpha: cutoutMeta.hasAlpha === true, alpha_stats: alphaStats},
  });
}

const runtime = path.join(root, 'video/src/assembly-set-narrative-v03.tsx');
const registry = path.join(root, 'video/src/production-index.tsx');
const renderRoot = path.join(qaRoot, 'rendered');
const artifactNames = [
  'AssemblySet-SH003-Narrative-v03-animatic.mp4',
  'SH003-narrative-v03-frame-0.png', 'SH003-narrative-v03-frame-98.png', 'SH003-narrative-v03-frame-198.png', 'SH003-narrative-v03-frame-298.png',
  'SH003-narrative-v03-contact-sheet-2x2.png', 'SH003-narrative-v03-mobile-360x203.png', 'SH003-to-SH004-pair-v03-candidate.mp4', 'SH003-to-SH004-pair-v03-terminal.png',
];
const artifacts = [];
for (const name of artifactNames) {
  const file = path.join(renderRoot, name);
  if (await exists(file)) artifacts.push({file: relative(file), sha256: await sha256(file)});
}

await mkdir(qaRoot, {recursive: true});
await writeFile(path.join(qaRoot, 'assembly-set-narrative-metadata-v03.json'), `${JSON.stringify({
  schema_version: 1, episode_id: 'episode-001', shot_id: 'SH003', candidate_version: 'v03', status: 'inactive-narrative-calibration', review_profile: 'remotion-motion',
  user_request: '인물은 실물 PNG로 해.',
  scope: 'Official Assembly profile JPGs are preserved byte-identically and deterministically derived into transparent PNG cutouts. No generative image edit or likeness synthesis.',
  rights_status: 'rights-review-required', commercial_reuse_approved: false,
  derivation: {script: 'video/scripts/derive-official-profile-cutouts.mjs', algorithm: 'connected-border-alpha-v1', threshold: 215, white_chroma_max: 18, feather: 'one-pixel bright edge alpha=224', command: 'node video/scripts/derive-official-profile-cutouts.mjs'},
  people: personRecords,
  runtime: {file: relative(runtime), sha256: await sha256(runtime), registry_file: relative(registry), registry_sha256: await sha256(registry), compositions: ['AssemblySet-SH003-Narrative-v03', 'AssemblySet-SH003-to-SH004-Pair-v03']},
  artifacts, omni_generation: 'blocked-until-user-passes-all-cuts', production_state_unchanged: true,
  caveat: 'Official profile pages and source metadata do not by themselves grant reuse, editorial, or commercial permission; human rights review remains required before PASS or production use.',
}, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({metadata: relative(path.join(qaRoot, 'assembly-set-narrative-metadata-v03.json')), people: personRecords.map((p) => ({person: p.person, cutout: p.cutout, original: p.original})), artifacts}, null, 2));
