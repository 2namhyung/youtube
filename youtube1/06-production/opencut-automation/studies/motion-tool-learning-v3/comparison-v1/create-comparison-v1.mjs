import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const automationRoot = path.resolve(here, '../../..');
const fullRoot = path.join(automationRoot, 'out/studies/motion-tool-learning-v3-full-d');
const outputRoot = path.join(fullRoot, 'comparison-v1');
const referenceSpecPath = path.join(automationRoot, 'studies/motion-tool-learning-v3/reference-mechanics.json');
const creatorPath = fileURLToPath(import.meta.url);
const ffmpeg = 'C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffmpeg.exe';
const ffprobe = 'C:\\Users\\User\\tools\\ffmpeg-8.1-essentials_build\\bin\\ffprobe.exe';
const font = 'C\\\\:/Windows/Fonts/arial.ttf';

const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const run = (exe, args) => execFileSync(exe, args, {stdio: ['ignore', 'pipe', 'pipe']});
const probe = file => JSON.parse(run(ffprobe, ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,nb_read_frames', '-of', 'json', file])).streams[0];
const record = file => ({
  file: path.relative(outputRoot, file).replaceAll('\\', '/'),
  sha256: sha256(file),
  bytes: statSync(file).size,
  probe: probe(file),
});

if (!json(path.join(fullRoot, 'verifier.json')).promotionEligible) throw new Error('full-d is not promotion eligible');
if (statSync(fullRoot).isSymbolicLink()) throw new Error('full-d root must not be a symlink');
try { statSync(outputRoot); throw new Error(`append-only target already exists: ${outputRoot}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }

mkdirSync(path.join(outputRoot, 'reference-boards'), {recursive: true});
mkdirSync(path.join(outputRoot, 'videos'), {recursive: true});
const temp = mkdtempSync(path.join(tmpdir(), 'motion-comparison-v1-'));

const referenceSpec = json(referenceSpecPath);
const verified = json(path.join(fullRoot, 'verifier.json'));
const verifiedById = new Map(verified.samples.map(sample => [sample.sampleId, sample]));
const creator = json(path.join(fullRoot, 'creator.json'));
const toolIds = Object.keys(referenceSpec.tools);

function referenceFilter(index) {
  const base = 'color=c=0x111827:s=972x972:r=24:d=2,format=yuv420p';
  const guide = 'drawbox=x=80:y=80:w=812:h=812:color=0x334155:t=4';
  const red = '0xef4444';
  const common = `[0:v]${guide}`;
  if (index === 1) return {inputs: ['-f','lavfi','-i',base,'-f','lavfi','-i',`color=c=${red}:s=120x120:r=24:d=2`], graph: `${common}[bg];[bg][1:v]overlay=x='120+600*t/2':y=426:eval=frame[out]`};
  if (index === 2) return {inputs: ['-f','lavfi','-i',base,'-f','lavfi','-i',`color=c=${red}:s=300x300:r=24:d=2`], graph: `${common}[bg];[1:v]scale=w='60+240*n/47':h='60+240*n/47':eval=frame[actor];[bg][actor]overlay=x='(W-w)/2':y='(H-h)/2':eval=frame[out]`};
  if (index === 3) return {inputs: ['-f','lavfi','-i',base,'-f','lavfi','-i',`color=c=${red}:s=300x80:r=24:d=2,format=rgba`], graph: `${common}[bg];[1:v]rotate=angle='PI*t/4':ow=500:oh=500:c=none[actor];[bg][actor]overlay=x=236:y=236[out]`};
  if (index === 4) return {inputs: ['-f','lavfi','-i',base,'-f','lavfi','-i',`color=c=${red}:s=280x280:r=24:d=2,format=rgba,fade=t=in:st=0:d=1.8:alpha=1`], graph: `${common}[bg];[bg][1:v]overlay=x=346:y=346[out]`};
  if (index === 5) return {inputs: ['-f','lavfi','-i',base,...Array.from({length:3},()=>['-f','lavfi','-i',`color=c=${red}:s=150x110:r=24:d=2`]).flat()], graph: `${common}[bg];[bg][1:v]overlay=x='min(300,-160+460*t)':y=260:eval=frame[s1];[s1][2:v]overlay=x='if(lt(t,0.35),-200,min(410,-160+460*(t-0.35)))':y=431:eval=frame[s2];[s2][3:v]overlay=x='if(lt(t,0.7),-200,min(520,-160+460*(t-0.7)))':y=602:eval=frame[out]`};
  if (index === 6) return {inputs: ['-f','lavfi','-i',base,'-f','lavfi','-i',`color=c=${red}:s=672x40:r=24:d=2`], graph: `${common}[bg];[1:v]scale=w='4+668*n/47':h=40:eval=frame[line];[bg][line]overlay=x=150:y=466[out]`};
  if (index === 7) return {inputs: ['-f','lavfi','-i',base,'-f','lavfi','-i',`color=c=${red}:s=672x400:r=24:d=2`], graph: `${common}[bg];[1:v]scale=w='4+668*n/47':h=400:eval=frame[card];[bg][card]overlay=x=150:y=286[out]`};
  if (index === 8) return {inputs: ['-f','lavfi','-i',base,'-f','lavfi','-i',`color=c=${red}:s=120x120:r=24:d=2`], graph: `${common}[bg];[bg][1:v]overlay=x='426+260*cos(PI*t)':y='426+260*sin(PI*t)':eval=frame[out]`};
  if (index === 9) return {inputs: ['-f','lavfi','-i',base,'-f','lavfi','-i',`color=c=${red}:s=120x120:r=24:d=2`], graph: `${common}[bg];[bg][1:v]overlay=x=426:y='220+350*(1-exp(-2.4*t)*abs(cos(6*t)))':eval=frame[out]`};
  return {inputs: ['-f','lavfi','-i',base,'-f','lavfi','-i',`color=c=${red}:s=280x280:r=24:d=2`], graph: `${common}[bg];[1:v]scale=w='100+180*max(0,(n-24)/23)':h='100+180*max(0,(n-24)/23)':eval=frame[actor];[bg][actor]overlay=x='120+480*min(t,1)':y='(H-h)/2':eval=frame[out]`};
}

const referenceBoards = [];
for (const sample of referenceSpec.samples) {
  const target = path.join(outputRoot, 'reference-boards', `${String(sample.index).padStart(2,'0')}-${sample.observationClass}.mkv`);
  const spec = referenceFilter(sample.index);
  run(ffmpeg, ['-hide_banner','-loglevel','error','-nostdin', ...spec.inputs, '-filter_complex', spec.graph, '-map','[out]', '-frames:v','48','-c:v','ffv1','-level','3','-pix_fmt','yuv420p', target]);
  referenceBoards.push({...sample, role: 'semantic-reference-visualization-not-original-example', filterGraph: spec.graph, artifact: record(target)});
}

const sourceSamples = [];
const toolOutputs = [];
for (const tool of toolIds) {
  const toolSamples = verified.samples.filter(sample => sample.tool === tool).sort((a,b) => Number(a.sampleId.match(/-(\d\d)-/)[1]) - Number(b.sampleId.match(/-(\d\d)-/)[1]));
  if (toolSamples.length !== 10) throw new Error(`${tool} requires 10 verified samples`);
  const segments = [];
  for (let i = 0; i < toolSamples.length; i += 1) {
    const sample = toolSamples[i];
    const sourceDir = path.join(fullRoot, 'samples', sample.sampleId);
    const sourceRecord = json(path.join(sourceDir, 'creator.sample.json'));
    const sourceVideo = path.join(sourceDir, sourceRecord.artifact.file);
    if (sha256(sourceVideo) !== sourceRecord.artifact.sha256) throw new Error(`source drift: ${sample.sampleId}`);
    const board = path.join(outputRoot, referenceBoards[i].artifact.file);
    const segment = path.join(temp, `${tool}-${String(i+1).padStart(2,'0')}.mp4`);
    const heading = `LEFT  SEMANTIC REFERENCE BOARD  NOT ORIGINAL EXAMPLE`;
    const right = `RIGHT  LEARNED OUTPUT`;
    const footer = `${String(i+1).padStart(2,'0')}  ${sample.topic}  ${sample.observationClass}  SCORE ${sample.score.percent} PERCENT`;
    const graph = [
      'color=c=0x030712:s=1920x1080:r=24:d=2[bg]',
      '[0:v]scale=880:880,setpts=PTS-STARTPTS[left]',
      '[1:v]scale=880:880,setpts=PTS-STARTPTS[right]',
      '[bg][left]overlay=x=50:y=130[tmp1]',
      '[tmp1][right]overlay=x=990:y=130[tmp2]',
      `[tmp2]drawtext=fontfile=${font}:text='${heading}':fontcolor=0x93c5fd:fontsize=31:x=50:y=45,drawtext=fontfile=${font}:text='${right}':fontcolor=0x86efac:fontsize=31:x=990:y=45,drawtext=fontfile=${font}:text='${footer}':fontcolor=white:fontsize=29:x=(w-text_w)/2:y=1030[out]`,
    ].join(';');
    run(ffmpeg, ['-hide_banner','-loglevel','error','-nostdin','-i',board,'-i',sourceVideo,'-filter_complex',graph,'-map','[out]','-frames:v','48','-r','24','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',segment]);
    segments.push(segment);
    sourceSamples.push({sampleId: sample.sampleId, tool, topic: sample.topic, observationClass: sample.observationClass, scorePercent: sample.score.percent, sourceArtifact: {file: path.relative(fullRoot, sourceVideo).replaceAll('\\','/'), sha256: sourceRecord.artifact.sha256, bytes: sourceRecord.artifact.bytes}, creatorRecordSha256: sha256(path.join(sourceDir, 'creator.sample.json'))});
  }
  const target = path.join(outputRoot, 'videos', `${tool}-reference-vs-learned.mp4`);
  const concatInputs = segments.flatMap(file => ['-i', file]);
  const concatPads = segments.map((_, i) => `[${i}:v]`).join('');
  run(ffmpeg, ['-hide_banner','-loglevel','error','-nostdin', ...concatInputs, '-filter_complex', `${concatPads}concat=n=10:v=1:a=0[out]`, '-map','[out]','-frames:v','480','-r','24','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',target]);
  toolOutputs.push({tool, mechanics: 10, artifact: record(target)});
}

const combined = path.join(outputRoot, 'videos', 'all-tools-reference-vs-learned.mp4');
const combinedInputs = toolOutputs.flatMap(item => ['-i', path.join(outputRoot, item.artifact.file)]);
const combinedPads = toolOutputs.map((_, i) => `[${i}:v]`).join('');
run(ffmpeg, ['-hide_banner','-loglevel','error','-nostdin', ...combinedInputs, '-filter_complex', `${combinedPads}concat=n=6:v=1:a=0[out]`, '-map','[out]','-frames:v','2880','-r','24','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',combined]);

const manifest = {
  schema: 'motion-tool-learning-comparison-v1',
  createdAt: new Date().toISOString(),
  truthBoundary: {
    preservedOriginalExampleArtifactAvailable: false,
    leftPanel: 'semantic reference visualization generated from the hash-bound mechanic specification; NOT an original official example',
    rightPanel: 'exact hash-verified learned output from motion-tool-learning-v3-full-d',
    similarityMeaning: referenceSpec.definition,
  },
  noNetwork: true,
  providersInvoked: [],
  sourceOnlyOfficialReferencesAccessed: false,
  referenceMechanics: {file: path.relative(automationRoot, referenceSpecPath).replaceAll('\\','/'), sha256: sha256(referenceSpecPath)},
  fullDVerifier: {file: 'out/studies/motion-tool-learning-v3-full-d/verifier.json', sha256: sha256(path.join(fullRoot,'verifier.json')), promotionEligible: verified.promotionEligible},
  implementation: {creator: {file: path.relative(automationRoot, creatorPath).replaceAll('\\','/'), sha256: sha256(creatorPath)}},
  contract: {width: 1920, height: 1080, fps: 24, framesPerMechanic: 48, mechanicsPerTool: 10, framesPerTool: 480, tools: 6, combinedFrames: 2880, videoCodec: 'h264', pixelFormat: 'yuv420p', audio: false},
  referenceBoards,
  sourceSamples,
  toolOutputs,
  combinedOutput: record(combined),
};
writeFileSync(path.join(outputRoot, 'creator.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
rmSync(temp, {recursive: true, force: true});
process.stdout.write(`${JSON.stringify({outputRoot, tools: toolOutputs.length, sourceSamples: sourceSamples.length, combined: manifest.combinedOutput}, null, 2)}\n`);
