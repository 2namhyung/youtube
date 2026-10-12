import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {validatePackage as validateMotionContracts} from './validate-frame-accurate-motion-contract-v02.mjs';

const ROOT = process.cwd();
const SUITE_REL = 'video/qa/reference-study/motion-reverse-engineering-suite-v02/manifest.json';
const CONTRACT_MANIFEST_REL = 'video/qa/reference-study/frame-accurate-motion-contract-v02/manifest.json';
const OUT_REL = 'video/qa/reference-study/motion-reverse-engineering-review-v02';
const OUT = path.join(ROOT, OUT_REL);
const SAMPLE10_SOURCE = 'video/qa/reference-study/additional-sources/acquired/0Uxx-UrTVP0.android.mp4';
const sha = (value) => createHash('sha256').update(value).digest('hex');
const shaFile = async (file) => sha(await readFile(file));
const rel = (file) => path.relative(ROOT, file).replaceAll('\\', '/');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function run(command, args) {
  const result = spawnSync(command, args, {cwd: ROOT, encoding: 'utf8', windowsHide: true});
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})\n${result.stderr}`);
}
const ffmpeg = (args) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

async function artifact(file, kind) {
  const info = await stat(file);
  const metadata = /\.(png|jpe?g)$/iu.test(file) ? await sharp(file).metadata() : null;
  return {kind, path: rel(file), sha256: await shaFile(file), bytes: info.size, ...(metadata ? {width: metadata.width, height: metadata.height} : {})};
}

async function boardTile(contactPath, number, sampleId) {
  const image = await sharp(path.join(ROOT, contactPath)).resize(620, 344, {fit: 'contain', background: '#111'}).png().toBuffer();
  const label = `${String(number).padStart(2, '0')} · ${sampleId.replaceAll('&', 'and')}`;
  const overlay = Buffer.from(`<svg width="620" height="42"><rect width="620" height="42" fill="#111"/><text x="14" y="28" font-family="Arial" font-size="19" font-weight="700" fill="#fff">${label}</text></svg>`);
  return sharp({create: {width: 620, height: 344, channels: 3, background: '#111'}}).composite([{input: image, left: 0, top: 0}, {input: overlay, left: 0, top: 0}]).png().toBuffer();
}

async function makeBoard(samples, output) {
  const layers = [];
  for (let index = 0; index < samples.length; index += 1) {
    const row = samples[index];
    layers.push({input: await boardTile(row.mobile_contact.path, row.sample_number, row.sample_id), left: 20 + (index % 3) * 635, top: 18 + Math.floor(index / 3) * 354});
  }
  await sharp({create: {width: 1920, height: 1080, channels: 3, background: '#20262b'}}).composite(layers).png().toFile(output);
}

async function concatVideos(files, output, frames) {
  const list = path.join(OUT, `${path.basename(output)}.ffconcat`);
  await writeFile(list, ['ffconcat version 1.0', ...files.map((file) => `file '${path.join(ROOT, file).replaceAll('\\', '/')}'`)].join('\n'));
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-frames:v', String(frames), '-r', '30', '-an', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', output]);
  await rm(list, {force: true});
}

async function makeDeltaBoard(samples, exclusion, output) {
  const sample08 = samples.find((row) => row.sample_number === 8);
  const sample09 = samples.find((row) => row.sample_number === 9);
  const sourceFrame = path.join(OUT, 'sample-10-source-video-selection-frame-000956.png');
  ffmpeg(['-i', path.join(ROOT, SAMPLE10_SOURCE), '-vf', "select='eq(n\\,956)'", '-vsync', '0', '-frames:v', '1', sourceFrame]);
  const source = await sharp(sourceFrame).resize(860, 484, {fit: 'contain', background: '#111'}).png().toBuffer();
  const exclusionOverlay = Buffer.from(`<svg width="900" height="520"><rect width="900" height="520" fill="none" stroke="#d85b59" stroke-width="10"/><line x1="30" y1="490" x2="870" y2="30" stroke="#d85b59" stroke-width="14"/><rect x="0" y="0" width="900" height="94" fill="#111" fill-opacity=".94"/><text x="24" y="36" font-family="Arial" font-size="25" font-weight="700" fill="#fff">10 · EXCLUDED: SOURCE-VIDEO-SELECTION</text><text x="24" y="72" font-family="Arial" font-size="20" fill="#ffd8d7">NO REMOTION PROBE · NO ACTIVE GRAMMAR BINDING</text></svg>`);
  const delta08 = await boardTile(sample08.mobile_contact.path, 8, 'CORRECTED · NON-PERSON SIDE OVERLAYS');
  const delta09 = await boardTile(sample09.mobile_contact.path, 9, 'CORRECTED · DEVICE/SURFACE ONLY');
  await sharp({create: {width: 1920, height: 1080, channels: 3, background: '#20262b'}}).composite([
    {input: await sharp(delta08).resize(920, 510).png().toBuffer(), left: 20, top: 20},
    {input: await sharp(delta09).resize(920, 510).png().toBuffer(), left: 980, top: 20},
    {input: source, left: 520, top: 566},
    {input: exclusionOverlay, left: 500, top: 548},
  ]).png().toFile(output);
  const exclusionFrame = await artifact(sourceFrame, 'source-video-selection-frame');
  exclusion.review_frame = exclusionFrame;
  return exclusionFrame;
}

async function main() {
  if (path.resolve(OUT) !== path.resolve(ROOT, OUT_REL)) throw new Error('refusing unexpected v02 review output path');
  const supersessionFile = path.join(OUT, 'reference-calibration-supersession.json');
  const preservedSupersession = await readFile(supersessionFile).catch(() => null);
  await rm(OUT, {recursive: true, force: true});
  await mkdir(OUT, {recursive: true});
  if (preservedSupersession) await writeFile(supersessionFile, preservedSupersession);
  const contractErrors = await validateMotionContracts({root: ROOT, packageRoot: path.dirname(path.join(ROOT, CONTRACT_MANIFEST_REL)), verifyMedia: false});
  if (contractErrors.length) throw new Error(`frame-accurate motion contract upstream is invalid:\n${contractErrors.join('\n')}`);
  const suite = JSON.parse(await readFile(path.join(ROOT, SUITE_REL), 'utf8'));
  const contractManifest = JSON.parse(await readFile(path.join(ROOT, CONTRACT_MANIFEST_REL), 'utf8'));
  if (suite.sample_count !== 9 || suite.samples.length !== 9) throw new Error('corrected suite must contain exactly nine active samples');
  const bindContract = async (record) => {
    const contract = JSON.parse(await readFile(path.join(ROOT, record.path), 'utf8'));
    return {sample_number: record.sample_number, sample_id: record.sample_id, contract_id: contract.contract_id, path: record.path, sha256: record.sha256, status: record.status};
  };
  const activeContractBindings = [];
  for (const record of contractManifest.contracts) activeContractBindings.push(await bindContract(record));
  const exclusionContractBinding = await bindContract(contractManifest.exclusion_contract);
  const contractByNumber = new Map([...activeContractBindings, exclusionContractBinding].map((record) => [record.sample_number, record]));
  const board = path.join(OUT, 'review-board-9-samples-1920x1080.png');
  await makeBoard(suite.samples, board);
  const reel = path.join(OUT, 'review-reel-9-samples-provisional.mp4');
  await concatVideos(suite.samples.map((row) => row.side_by_side.path), reel, 2700);
  const deltaBoard = path.join(OUT, 'delta-review-08-09-10-exclusion-1920x1080.png');
  const exclusion = structuredClone(suite.excluded_observations[0]);
  const exclusionFrame = await makeDeltaBoard(suite.samples, exclusion, deltaBoard);
  const deltaReel = path.join(OUT, 'delta-review-08-09-provisional.mp4');
  await concatVideos(suite.samples.filter((row) => [8,9].includes(row.sample_number)).map((row) => row.side_by_side.path), deltaReel, 600);
  const boardRecord = await artifact(board, 'review-board');
  const reelRecord = {...await artifact(reel, 'sequential-review-reel'), width: 1920, height: 1080, fps: 30, duration_in_frames: 2700};
  const deltaBoardRecord = await artifact(deltaBoard, 'delta-review-board');
  const deltaReelRecord = {...await artifact(deltaReel, 'delta-review-reel'), width: 1920, height: 1080, fps: 30, duration_in_frames: 600};
  const inputs = [];
  for (const row of suite.samples) for (const [kind, record] of Object.entries({analysis: row.analysis, probe: row.probe, 'side-by-side': row.side_by_side, contact: row.mobile_contact})) inputs.push({sample_number: row.sample_number, kind, path: record.path, sha256: record.sha256});
  inputs.push({sample_number: 10, kind: exclusionFrame.kind, path: exclusionFrame.path, sha256: exclusionFrame.sha256});
  inputs.push({sample_number: 0, kind: 'motion-contract-manifest', path: CONTRACT_MANIFEST_REL, sha256: await shaFile(path.join(ROOT, CONTRACT_MANIFEST_REL))});
  for (const record of [...activeContractBindings, exclusionContractBinding]) inputs.push({sample_number: record.sample_number, kind: 'motion-contract', path: record.path, sha256: record.sha256});
  for (const [kind, record] of [['review-board',boardRecord],['active-review-reel',reelRecord],['delta-review-board',deltaBoardRecord],['delta-review-reel',deltaReelRecord]]) inputs.push({sample_number: 0, kind, path: record.path, sha256: record.sha256});
  const manifest = {
    schema_version: 2,
    package_id: 'motion-reverse-engineering-review-v02-nine-samples',
    status: 'pending-human-corrected-reference-calibration-review',
    suite: {path: SUITE_REL, sha256: await shaFile(path.join(ROOT, SUITE_REL))},
    motion_contract_package: {
      required: true,
      authority: 'mandatory-analysis-contract-upstream-only',
      manifest: {path: CONTRACT_MANIFEST_REL, sha256: await shaFile(path.join(ROOT, CONTRACT_MANIFEST_REL))},
      active_contracts: activeContractBindings,
      exclusion_contract: exclusionContractBinding,
    },
    future_human_approval: {
      status: 'marker-absent-pending-explicit-human-pass',
      validator: 'video/scripts/validate-reference-calibration-approval-v02.mjs',
      marker_path: 'video/qa/reference-study/motion-reverse-engineering-review-v02/reference-calibration-approval-v02.json',
      required_reviewer: 'user',
      required_active_decisions: 9,
      required_sample10_exclusion_acknowledgement: true,
      grammar_promotion_requires_valid_marker: true,
      legacy_v01_route_enabled: false,
    },
    supersedes_review: {path: 'video/qa/reference-study/motion-reverse-engineering-review-v01/manifest.json', sha256: '35c77a0e01abe29c2b880e2a0a126db234042fba7c10aee6489b7c4b3c868f9c', authority: 'historical-only'},
    sample_count: 9,
    sample_order: [1,2,3,4,5,6,7,8,9],
    samples: suite.samples.map((row) => ({sample_number: row.sample_number, sample_id: row.sample_id, decision: 'pending', motion_contract: contractByNumber.get(row.sample_number), analysis: row.analysis, probe: row.probe, side_by_side: row.side_by_side, contact: row.mobile_contact})),
    excluded_sample_10: {...exclusion, motion_contract: exclusionContractBinding, acknowledgement: 'pending-human-review'},
    board: boardRecord,
    reel: reelRecord,
    delta_review: {scope: ['sample-08 corrected non-person overlays','sample-09 corrected device/surface motion','sample-10 exclusion as source-video-selection'], board: deltaBoardRecord, reel: deltaReelRecord},
    inputs,
    input_bundle_sha256: sha(Buffer.from(inputs.map((item) => `${item.sample_number}|${item.kind}|${item.path}|${item.sha256}`).sort().join('\n'))),
    human_pass: false,
    grammar_promoted: false,
    production_authority: false,
    production_eligible: false,
    active_cut_root: null,
  };
  await writeFile(path.join(OUT, 'manifest.json'), json(manifest));
  await writeFile(path.join(OUT, 'README.md'), '# Corrected nine-sample reference review v02\n\nReview samples 01–09 in order. Every active row is bound to its immutable frame-accurate motion contract; sample 10 is bound only to the source-video-selection exclusion contract and is absent from the active reel. The focused delta board/reel isolates corrected samples 08/09 and the sample 10 exclusion acknowledgement. Human review pending; the v02 approval validator requires an explicit user marker, and no marker, grammar promotion, or production authority exists now.\n');
  process.stdout.write(`Built ${OUT_REL}: 9-sample board/reel and 08/09 + sample10 exclusion delta review.\n`);
}

await main();
