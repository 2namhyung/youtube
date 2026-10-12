import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const automationRoot = path.resolve(here, '../../..');
const fullRoot = path.join(automationRoot, 'out/studies/motion-tool-learning-v3-full-d');
const outputRoot = path.join(fullRoot, 'comparison-v1');
const manifestPath = path.join(outputRoot, 'creator.manifest.json');
const verifierPath = fileURLToPath(import.meta.url);
const ffmpeg = 'C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffmpeg.exe';
const ffprobe = 'C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffprobe.exe';

const sha256Bytes = bytes => createHash('sha256').update(bytes).digest('hex');
const sha256 = file => sha256Bytes(readFileSync(file));
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const run = (exe, args) => execFileSync(exe, args, {stdio: ['ignore','pipe','pipe'], maxBuffer: 128 * 1024 * 1024});
const probe = file => JSON.parse(run(ffprobe, ['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=codec_name,width,height,r_frame_rate,nb_read_frames,pix_fmt','-of','json',file])).streams[0];

const manifest = json(manifestPath);
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
check(manifest.schema === 'motion-tool-learning-comparison-v1', 'wrong manifest schema');
check(manifest.truthBoundary.preservedOriginalExampleArtifactAvailable === false, 'truth boundary must report no preserved original');
check(/NOT an original official example/i.test(manifest.truthBoundary.leftPanel), 'left-panel disclosure missing');
check(manifest.noNetwork === true && manifest.providersInvoked.length === 0 && manifest.sourceOnlyOfficialReferencesAccessed === false, 'no-network/provider boundary failed');
check(manifest.referenceMechanics.sha256 === sha256(path.join(automationRoot, manifest.referenceMechanics.file)), 'reference mechanic hash drift');
check(manifest.fullDVerifier.sha256 === sha256(path.join(automationRoot, manifest.fullDVerifier.file)), 'full-d verifier hash drift');
check(json(path.join(automationRoot, manifest.fullDVerifier.file)).promotionEligible === true, 'full-d no longer promotion eligible');
check(manifest.implementation.creator.sha256 === sha256(path.join(automationRoot, manifest.implementation.creator.file)), 'creator implementation drift');
check(manifest.referenceBoards.length === 10, 'requires exactly ten semantic reference boards');
check(manifest.sourceSamples.length === 60, 'requires exactly sixty source samples');
check(manifest.toolOutputs.length === 6, 'requires exactly six tool videos');

function verifyRecord(root, record, expected) {
  const file = path.join(root, record.file);
  check(!statSync(file).isSymbolicLink(), `symlink artifact: ${record.file}`);
  check(sha256(file) === record.sha256, `artifact hash drift: ${record.file}`);
  check(statSync(file).size === record.bytes, `artifact byte drift: ${record.file}`);
  const actual = probe(file);
  for (const [key, value] of Object.entries(expected)) check(String(actual[key]) === String(value), `${record.file} ${key} expected ${value}, got ${actual[key]}`);
  return file;
}

for (const board of manifest.referenceBoards) verifyRecord(outputRoot, board.artifact, {codec_name:'ffv1',width:972,height:972,r_frame_rate:'24/1',nb_read_frames:48});
for (const source of manifest.sourceSamples) {
  const file = path.join(fullRoot, source.sourceArtifact.file);
  check(sha256(file) === source.sourceArtifact.sha256, `learned source drift: ${source.sampleId}`);
  check(statSync(file).size === source.sourceArtifact.bytes, `learned source byte drift: ${source.sampleId}`);
  const creatorRecord = path.join(path.dirname(file), 'creator.sample.json');
  check(sha256(creatorRecord) === source.creatorRecordSha256, `learned creator record drift: ${source.sampleId}`);
  check(source.scorePercent >= 90, `sub-threshold learned source: ${source.sampleId}`);
}

function panelEvidence(file, x) {
  const bytes = run(ffmpeg, ['-hide_banner','-loglevel','error','-nostdin','-i',file,'-vf',`crop=880:880:${x}:130,scale=32:32:flags=area,format=gray`,'-f','rawvideo','-pix_fmt','gray','-']);
  const frameBytes = 32 * 32;
  check(bytes.length % frameBytes === 0, `invalid raw decode size: ${path.basename(file)}`);
  const frames = [];
  for (let offset=0; offset<bytes.length; offset+=frameBytes) frames.push(bytes.subarray(offset, offset+frameBytes));
  const segments = [];
  for (let i=0; i<10; i+=1) {
    const group = frames.slice(i*48,(i+1)*48);
    const hashes = new Set(group.map(sha256Bytes));
    const mean = group.reduce((total, frame) => total + frame.reduce((a,b)=>a+b,0) / frame.length, 0) / group.length;
    segments.push({index:i+1, uniqueFrameHashes:hashes.size, meanLuma:Number(mean.toFixed(2)), dynamic:hashes.size >= 8, visible:mean > 5});
  }
  return {decodedFrames:frames.length, segments};
}

const panelChecks = [];
for (const item of manifest.toolOutputs) {
  const file = verifyRecord(outputRoot, item.artifact, {codec_name:'h264',width:1920,height:1080,r_frame_rate:'24/1',nb_read_frames:480,pix_fmt:'yuv420p'});
  const left = panelEvidence(file, 50);
  const right = panelEvidence(file, 990);
  check(left.decodedFrames === 480 && right.decodedFrames === 480, `${item.tool} panel decode frame count`);
  for (const segment of [...left.segments, ...right.segments]) check(segment.dynamic && segment.visible, `${item.tool} panel segment ${segment.index} static or blank`);
  check(left.segments.every((segment,i) => segment.uniqueFrameHashes !== right.segments[i].uniqueFrameHashes || segment.meanLuma !== right.segments[i].meanLuma), `${item.tool} left/right panels appear copied`);
  panelChecks.push({tool:item.tool,left,right});
}
verifyRecord(outputRoot, manifest.combinedOutput, {codec_name:'h264',width:1920,height:1080,r_frame_rate:'24/1',nb_read_frames:2880,pix_fmt:'yuv420p'});

const report = {
  schema:'motion-tool-learning-comparison-verifier-v1',
  verifiedAt:new Date().toISOString(),
  creatorManifestSha256:sha256(manifestPath),
  implementation:{verifier:{file:path.relative(automationRoot,verifierPath).replaceAll('\\','/'),sha256:sha256(verifierPath)}},
  checks:{referenceBoards:manifest.referenceBoards.length,sourceSamples:manifest.sourceSamples.length,toolVideos:manifest.toolOutputs.length,combinedFrames:manifest.contract.combinedFrames,panelChecks},
  failures,
  verified:failures.length === 0,
};
writeFileSync(path.join(outputRoot,'verifier.json'),`${JSON.stringify(report,null,2)}\n`);
if (failures.length) {
  process.stderr.write(`${JSON.stringify(report,null,2)}\n`);
  process.exitCode=1;
} else process.stdout.write(`${JSON.stringify({verified:true,creatorManifestSha256:report.creatorManifestSha256,verifierImplementationSha256:report.implementation.verifier.sha256},null,2)}\n`);
