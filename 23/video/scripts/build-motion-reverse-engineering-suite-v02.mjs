import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {renderComposition} from './qa-runtime.mjs';

const ROOT = process.cwd();
const OUT_REL = 'video/qa/reference-study/motion-reverse-engineering-suite-v02';
const OUT = path.join(ROOT, OUT_REL);
const ENTRY_REL = 'video/src/motion-reverse-engineering-suite-v02-index.tsx';
const RUNTIME_REL = 'video/src/motion-reverse-engineering-suite-v02.tsx';
const OLD_SUITE_REL = 'video/qa/reference-study/motion-reverse-engineering-suite-v01/manifest.json';
const OLD_SUITE_SHA = '702a514d95b31d78871588b919fc5f69a68f50571a6a9848ddb809d9abe8793e';
const PILOT_REL = 'video/qa/reference-study/motion-reverse-engineering-pilot-v01/manifest.json';
const PILOT_SHA = '793fe2a384fa4f5591672ae9a4fb34815eba0c5ee63f01a4422a9c2b0a0a7382';
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

async function extractFrame(video, frame, output) {
  ffmpeg(['-i', video, '-vf', `select='eq(n\\,${frame})'`, '-vsync', '0', '-frames:v', '1', output]);
}

async function makeMappedReference(spec, output) {
  const duration = spec.action_end / 30;
  ffmpeg(['-i', path.join(ROOT, spec.source.path), '-vf', `select='between(n\\,${spec.start}\\,${spec.end})',setpts=(N/${spec.end-spec.start})*${duration}/TB,fps=30,tpad=stop_mode=clone:stop_duration=10,trim=end_frame=300,scale=1920:1080:flags=lanczos`, '-frames:v', '300', '-an', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', output]);
}

async function makeSideBySide(reference, probe, output) {
  ffmpeg(['-i', reference, '-i', probe, '-filter_complex', '[0:v]scale=960:540,pad=960:1080:0:270:0x111111[ref];[1:v]scale=960:540,pad=960:1080:0:270:0x111111[probe];[ref][probe]hstack=2[out]', '-map', '[out]', '-frames:v', '300', '-r', '30', '-an', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', output]);
}

async function labeledTile(file, label) {
  const image = await sharp(file).resize(120, 101, {fit: 'contain', background: '#111'}).png().toBuffer();
  const overlay = Buffer.from(`<svg width="120" height="17"><rect width="120" height="17" fill="#000" fill-opacity=".78"/><text x="4" y="12" font-family="Arial" font-size="10" font-weight="700" fill="#fff">${label}</text></svg>`);
  return sharp(image).composite([{input: overlay, left: 0, top: 0}]).png().toBuffer();
}

async function makeContact(spec, probe, output, workDir) {
  const layers = [];
  const inputs = [];
  for (let index = 0; index < spec.contact.length; index += 1) {
    const [sourceFrame, probeFrame] = spec.contact[index];
    const sourcePng = path.join(workDir, `source-${spec.number}-${sourceFrame}.png`);
    const probePng = path.join(workDir, `probe-${spec.number}-${probeFrame}.png`);
    await extractFrame(path.join(ROOT, spec.source.path), sourceFrame, sourcePng);
    await extractFrame(probe, probeFrame, probePng);
    const sourceTile = await labeledTile(sourcePng, `REF F${sourceFrame}`);
    const probeTile = await labeledTile(probePng, `PROBE F${probeFrame}`);
    layers.push({input: sourceTile, left: index * 120, top: 0});
    layers.push({input: await sharp(probeTile).extend({top: 1, bottom: 0, left: 0, right: 0, background: '#111'}).resize(120, 102).png().toBuffer(), left: index * 120, top: 101});
    inputs.push({source_frame: sourceFrame, probe_frame: probeFrame});
  }
  await sharp({create: {width: 360, height: 203, channels: 3, background: '#111'}}).composite(layers).png().toFile(output);
  return inputs;
}

const specs = [
  {number: 8, sample_id: 'sample-08-speaker-supporting-overlay-entry-corrected', composition: 'MotionReverseSuite08-Corrected-Provisional', source: {path: 'video/qa/reference-study/additional-sources/acquired/dBakc0BdHjY.android.mp4', sha256: '493e807a188437d6d163b2db42c12b5df7f70a8480a4c696b298f56d9f14200e'}, start: 0, end: 211, action_end: 180, contact: [[0,0],[163,112],[211,180]], grammar_candidates: ['independent-non-person-side-overlay-entry','staggered-object-accumulation']},
  {number: 9, sample_id: 'sample-09-device-light-focal-motion-corrected', composition: 'MotionReverseSuite09-Corrected-Provisional', source: {path: 'video/qa/reference-study/additional-sources/acquired/b7KlsXNQobs.android.mp4', sha256: '7ccb3068c49fca17348538fee5e9c59f5e4a1ff0114e01849f08d0765481cd8f'}, start: 60, end: 155, action_end: 60, contact: [[60,0],[90,30],[120,60]], grammar_candidates: ['source-surface-state-progression','staggered-object-accumulation']},
];

function inheritedRow(number, source, sourceManifest) {
  const row = number === 2 || number === 3
    ? sourceManifest.samples.find((item) => item.sample_id.startsWith(`sample-0${number}-`))
    : sourceManifest.new_samples.find((item) => item.sample_number === number);
  return {
    sample_number: number,
    sample_id: row.sample_id,
    status: 'carried-forward-candidate-pending-corrected-human-review',
    inheritance: {manifest_path: number === 2 || number === 3 ? PILOT_REL : OLD_SUITE_REL, manifest_sha256: number === 2 || number === 3 ? PILOT_SHA : OLD_SUITE_SHA},
    analysis: row.analysis,
    probe: row.probe,
    side_by_side: row.side_by_side,
    mobile_contact: row.mobile_contact,
    active_grammar_approval: false,
  };
}

async function buildCorrectedSample(spec, workDir) {
  if (await shaFile(path.join(ROOT, spec.source.path)) !== spec.source.sha256) throw new Error(`sample ${spec.number}: source hash drift`);
  const dir = path.join(OUT, spec.sample_id);
  await mkdir(dir, {recursive: true});
  const probe = path.join(dir, `sample-${String(spec.number).padStart(2, '0')}-remotion-probe-provisional.mp4`);
  renderComposition({entry: path.join(ROOT, ENTRY_REL), composition: spec.composition, output: probe});
  const mapped = path.join(dir, `sample-${String(spec.number).padStart(2, '0')}-reference-mapped-provisional.mp4`);
  await makeMappedReference(spec, mapped);
  const side = path.join(dir, `sample-${String(spec.number).padStart(2, '0')}-reference-vs-probe-provisional.mp4`);
  await makeSideBySide(mapped, probe, side);
  const contact = path.join(dir, `sample-${String(spec.number).padStart(2, '0')}-reference-vs-probe-contact-360x203.png`);
  const contactInputs = await makeContact(spec, probe, contact, workDir);
  const analysis = {
    schema_version: 2,
    sample_number: spec.number,
    sample_id: spec.sample_id,
    status: 'corrected-operator-candidate-pending-human-review',
    review_profile: 'remotion-motion',
    source_binding: {...spec.source, window: {start_frame: spec.start, end_frame: spec.end}},
    active_scope: spec.number === 8 ? 'non-person surrounding overlays only; presenter region is reserved and never reconstructed' : 'phone shell, source-bound surface content, chart, and non-person support overlays only',
    excluded_scope: ['recorded speaking-human pixels', 'graphic presenter/avatar/silhouette/person reconstruction', 'source-footage internal motion as transferable Remotion grammar'],
    presenter_region: spec.number === 8 ? {mode: 'reserved-non-reconstructed', target_id: 'reserved-source-video-region', moving_pixels_allowed: false} : {mode: 'absent', moving_pixels_allowed: false},
    text_surface_contract: {typography_surface_contract_version: 2, allowed_roles: ['surface-content','screen-chrome'], explanatory_text_over_person_pixels: false},
    grammar_candidates: spec.grammar_candidates,
    human_review_status: 'pending',
    production_authority: false,
  };
  const analysisPath = path.join(dir, 'analysis.json');
  await writeFile(analysisPath, json(analysis));
  return {
    sample_number: spec.number,
    sample_id: spec.sample_id,
    status: 'corrected-technical-probe-complete-pending-human-review',
    analysis: await artifact(analysisPath, 'analysis'),
    probe: {...await artifact(probe, 'remotion-probe'), composition_id: spec.composition, width: 1920, height: 1080, fps: 30, duration_in_frames: 300, action_end_frame: spec.action_end, hold: {start_frame: spec.action_end, minimum_frames: 300-spec.action_end, checked_frames: [spec.action_end, 240, 299]}},
    mapped_reference: await artifact(mapped, 'mapped-reference'),
    side_by_side: await artifact(side, 'reference-vs-probe'),
    mobile_contact: await artifact(contact, 'reference-vs-probe-contact-360x203'),
    contact_inputs: contactInputs,
    active_grammar_approval: false,
  };
}

async function main() {
  if (path.resolve(OUT) !== path.resolve(ROOT, OUT_REL)) throw new Error('refusing unexpected v02 output path');
  if (await shaFile(path.join(ROOT, OLD_SUITE_REL)) !== OLD_SUITE_SHA) throw new Error('historical v01 suite manifest drift');
  if (await shaFile(path.join(ROOT, PILOT_REL)) !== PILOT_SHA) throw new Error('historical pilot manifest drift');
  await rm(OUT, {recursive: true, force: true});
  await mkdir(OUT, {recursive: true});
  const workDir = path.join(OUT, '_build-frames');
  await mkdir(workDir, {recursive: true});
  const oldSuite = JSON.parse(await readFile(path.join(ROOT, OLD_SUITE_REL), 'utf8'));
  const pilot = JSON.parse(await readFile(path.join(ROOT, PILOT_REL), 'utf8'));
  const corrected = [];
  for (const spec of specs) corrected.push(await buildCorrectedSample(spec, workDir));
  await rm(workDir, {recursive: true, force: true});
  const correctedByNumber = new Map(corrected.map((row) => [row.sample_number, row]));
  const samples = Array.from({length: 9}, (_, index) => index + 1).map((number) => correctedByNumber.get(number) ?? inheritedRow(number, number === 2 || number === 3 ? pilot : oldSuite, number === 2 || number === 3 ? pilot : oldSuite));
  const newArtifacts = corrected.flatMap((row) => [row.analysis, row.probe, row.mapped_reference, row.side_by_side, row.mobile_contact]);
  const manifest = {
    schema_version: 2,
    package_id: 'motion-reverse-engineering-suite-v02-nine-transferable-samples',
    status: 'corrected-technical-suite-complete-pending-human-review',
    supersedes: {path: OLD_SUITE_REL, sha256: OLD_SUITE_SHA, authority: 'historical-only'},
    active_transferable_sample_numbers: [1,2,3,4,5,6,7,8,9],
    sample_count: 9,
    samples,
    excluded_observations: [{sample_number: 10, sample_id: 'sample-10-narrative-scale-translation', review_profile: 'source-video-selection', source: {path: 'video/qa/reference-study/additional-sources/acquired/0Uxx-UrTVP0.android.mp4', sha256: 'ed6839c20bfda2a52346e70bd9cbfa590299fb0a93df884698a6e65c91f5d647'}, reason: 'User determined this is source video playback, not transferable Remotion motion grammar.', remotion_probe: null, active_grammar_bindings: [], active_binding_count: 0, active_set_review_required: false, delta_exclusion_acknowledgement_required: true}],
    runtime: {entry: {path: ENTRY_REL, sha256: await shaFile(path.join(ROOT, ENTRY_REL))}, source: {path: RUNTIME_REL, sha256: await shaFile(path.join(ROOT, RUNTIME_REL))}},
    new_artifacts: newArtifacts,
    new_artifact_bundle_sha256: sha(Buffer.from(newArtifacts.map((item) => `${item.kind}|${item.path}|${item.sha256}`).sort().join('\n'))),
    human_pass: false,
    grammar_promoted: false,
    production_authority: false,
    production_eligible: false,
    active_cut_root: null,
    limitations: ['Samples 01–07 are exact carried-forward candidates, not newly approved decisions.', 'Samples 08/09 exclude recorded speaking-human pixels and any graphic presenter reconstruction.', 'Sample 10 is an excluded source-video-selection observation with no Remotion probe or grammar binding.', 'A corrected human review is required before grammar promotion or style-frame eligibility.'],
  };
  await writeFile(path.join(OUT, 'manifest.json'), json(manifest));
  await writeFile(path.join(OUT, 'README.md'), '# Motion reverse-engineering suite v02\n\nCorrected active set: samples 01–09 only. Samples 08/09 exclude recorded presenter pixels and graphic/person reconstruction. Sample 10 is preserved only as an excluded `source-video-selection` observation. Human review pending; no grammar or production authority.\n');
  process.stdout.write(`Built ${OUT_REL}: 9 active samples; sample 10 excluded.\n`);
}

await main();
