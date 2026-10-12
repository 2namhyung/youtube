import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const MANIFEST_REL = 'video/qa/reference-study/motion-reverse-engineering-suite-v02/manifest.json';
const EXACT_NUMBERS = [1,2,3,4,5,6,7,8,9];
const sha = (value) => createHash('sha256').update(value).digest('hex');
const shaFile = async (file) => sha(await readFile(file));
const exists = async (file) => { try { return (await stat(file)).isFile(); } catch { return false; } };

function ffprobe(file) {
  const result = spawnSync('ffprobe', ['-v','error','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_frames','-of','json',file], {encoding:'utf8',windowsHide:true});
  return result.status === 0 ? JSON.parse(result.stdout).streams?.[0] : null;
}

async function frameRaw(video, frame, rect = null) {
  const filters = [`select='eq(n\\,${frame})'`, ...(rect ? [`crop=${rect[2]}:${rect[3]}:${rect[0]}:${rect[1]}`] : []), 'format=rgb24'];
  const result = spawnSync('ffmpeg', ['-hide_banner','-loglevel','error','-i',video,'-vf',filters.join(','),'-vsync','0','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'], {encoding:null,windowsHide:true,maxBuffer:1920*1080*4});
  if (result.status !== 0) throw new Error(`ffmpeg frame extraction failed: ${result.stderr?.toString()}`);
  return result.stdout;
}
function meanAbs(a, b) { let sum=0; for(let index=0;index<a.length;index+=1) sum+=Math.abs(a[index]-b[index]); return sum/a.length; }

export async function validateCorrectedSuite(options = {}) {
  const root = options.root ?? ROOT;
  const manifestFile = path.resolve(root, options.manifestPath ?? MANIFEST_REL);
  const errors = [];
  const must = (condition, message) => { if (!condition) errors.push(message); };
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  must(manifest.package_id === 'motion-reverse-engineering-suite-v02-nine-transferable-samples' && manifest.status === 'corrected-technical-suite-complete-pending-human-review', 'v02 suite identity/status mismatch');
  must(manifest.sample_count === 9 && JSON.stringify(manifest.active_transferable_sample_numbers) === JSON.stringify(EXACT_NUMBERS), 'active transferable set must be exactly samples 01-09');
  must((manifest.samples ?? []).length === 9 && JSON.stringify(manifest.samples.map((row) => row.sample_number)) === JSON.stringify(EXACT_NUMBERS), 'suite rows must be ordered 01-09 with no sample10 row');
  must(manifest.human_pass === false && manifest.grammar_promoted === false && manifest.production_authority === false && manifest.production_eligible === false && manifest.active_cut_root === null, 'corrected suite must remain human-pending and non-production');
  must(manifest.supersedes?.path === 'video/qa/reference-study/motion-reverse-engineering-suite-v01/manifest.json' && manifest.supersedes?.sha256 === '702a514d95b31d78871588b919fc5f69a68f50571a6a9848ddb809d9abe8793e' && manifest.supersedes?.authority === 'historical-only', 'historical v01 supersession binding drift');

  const exclusion = manifest.excluded_observations;
  must(exclusion?.length === 1 && exclusion[0].sample_number === 10 && exclusion[0].review_profile === 'source-video-selection' && exclusion[0].remotion_probe === null && exclusion[0].active_binding_count === 0 && JSON.stringify(exclusion[0].active_grammar_bindings) === '[]' && exclusion[0].active_set_review_required === false, 'sample10 must be excluded source-video-selection with zero probe/binding authority');
  must(!(manifest.samples ?? []).some((row) => row.sample_number === 10 || /sample-10/u.test(row.probe?.path ?? '') || /sample-10/u.test(row.side_by_side?.path ?? '')), 'sample10 cannot appear in active rows, probes, or comparison artifacts');

  const runtimeFile = path.resolve(root, options.runtimePath ?? manifest.runtime?.source?.path ?? '');
  const entryFile = path.resolve(root, options.entryPath ?? manifest.runtime?.entry?.path ?? '');
  const runtime = await readFile(runtimeFile, 'utf8');
  const entry = await readFile(entryFile, 'utf8');
  if (!options.runtimePath) must(await shaFile(runtimeFile) === manifest.runtime.source.sha256, 'corrected runtime hash drift');
  if (!options.entryPath) must(await shaFile(entryFile) === manifest.runtime.entry.sha256, 'corrected entry hash drift');
  const banned = ['PresenterPlate','presenter-context','presenter-plate','right-person-icon','source-internal-motion','avatar','silhouette','person-reconstruction','live-person'];
  for (const token of banned) must(!runtime.toLowerCase().includes(token.toLowerCase()), `corrected runtime contains forbidden graphic/live-person reconstruction token: ${token}`);
  must(runtime.includes('reserved-source-video-region') && runtime.includes('presenter-not-reconstructed'), 'sample08 must reserve rather than reconstruct the presenter region');
  must(/<div data-suite-target="reserved-source-video-region"[^>]*\/>/u.test(runtime), 'sample08 reserved presenter region must be an empty self-closing element');
  must(runtime.includes('phone-shell') && runtime.includes('surface-value') && runtime.includes('surface-percent') && runtime.includes('surface-chart'), 'sample09 device/surface targets missing');
  must(!runtime.includes('SuiteSample10') && !entry.includes('Suite10') && !entry.includes('Sample10'), 'sample10 composition/probe is forbidden in v02 runtime entry');

  const expectedIds = {8:'sample-08-speaker-supporting-overlay-entry-corrected',9:'sample-09-device-light-focal-motion-corrected'};
  for (const number of [8,9]) {
    const row = manifest.samples.find((item) => item.sample_number === number);
    must(row?.sample_id === expectedIds[number] && row.status === 'corrected-technical-probe-complete-pending-human-review' && row.active_grammar_approval === false, `sample${number}: corrected row identity/status mismatch`);
    const analysisFile = path.resolve(root, row.analysis.path);
    const analysis = JSON.parse(await readFile(analysisFile, 'utf8'));
    must(await shaFile(analysisFile) === row.analysis.sha256, `sample${number}: analysis hash drift`);
    must(analysis.excluded_scope?.includes('recorded speaking-human pixels') && analysis.excluded_scope?.includes('graphic presenter/avatar/silhouette/person reconstruction') && analysis.excluded_scope?.includes('source-footage internal motion as transferable Remotion grammar'), `sample${number}: presenter/internal-motion exclusions incomplete`);
    must(analysis.human_review_status === 'pending' && analysis.production_authority === false, `sample${number}: analysis must remain pending/non-production`);
    for (const record of [row.probe,row.mapped_reference,row.side_by_side,row.mobile_contact]) {
      const file = path.resolve(root, record.path);
      must(await exists(file), `sample${number}: missing ${record.kind}`);
      if (await exists(file)) must(await shaFile(file) === record.sha256, `sample${number}: ${record.kind} hash drift`);
    }
    if (options.verifyMedia !== false) {
      const probeFile = path.resolve(root, row.probe.path);
      const meta = ffprobe(probeFile);
      must(meta?.width === 1920 && meta?.height === 1080 && meta?.avg_frame_rate === '30/1' && Number(meta?.nb_frames) === 300, `sample${number}: probe must be 1920x1080 30fps 300f`);
      const action = row.probe.action_end_frame;
      const actionRaw=await frameRaw(probeFile,action), hold240=await frameRaw(probeFile,240), hold299=await frameRaw(probeFile,299);
      must(meanAbs(actionRaw,hold240)<.35&&meanAbs(hold240,hold299)<.35, `sample${number}: declared reading hold exceeds codec-noise tolerance`);
      if (number === 8) {
        const reserved=[548,106,824,868];
        const reserved0=await frameRaw(probeFile,0,reserved),reservedAction=await frameRaw(probeFile,action,reserved);
        const expected=Buffer.alloc(reserved0.length);for(let i=0;i<expected.length;i+=3){expected[i]=239;expected[i+1]=231;expected[i+2]=210;}
        must(meanAbs(reserved0,reservedAction)<.35&&meanAbs(reserved0,expected)<2, 'sample08: reserved presenter region must remain empty background with no static or moving reconstruction');
        must(meanAbs(await frameRaw(probeFile,0),actionRaw)>1, 'sample08: non-person side overlays did not visibly change');
        const left0=await frameRaw(probeFile,0,[190,280,330,400]),left68=await frameRaw(probeFile,68,[190,280,330,400]),left150=await frameRaw(probeFile,150,[190,280,330,400]);
        const right0=await frameRaw(probeFile,0,[1400,200,340,300]),right68=await frameRaw(probeFile,68,[1400,200,340,300]),right150=await frameRaw(probeFile,150,[1400,200,340,300]);
        must(meanAbs(left0,left68)>3&&meanAbs(left68,left150)<.35,'sample08: left overlay must enter first and then remain stable');
        must(meanAbs(right0,right68)<.35&&meanAbs(right68,right150)>3,'sample08: right overlay must retain its independent later lifecycle');
      } else {
        must(meanAbs(await frameRaw(probeFile,0,[0,0,650,1080]),await frameRaw(probeFile,action,[0,0,650,1080]))<.35, 'sample09: presenter-side region must remain empty/static');
        must(meanAbs(await frameRaw(probeFile,0),actionRaw)>1, 'sample09: device/surface motion did not visibly change');
        must(meanAbs(await frameRaw(probeFile,0,[700,70,920,900]),await frameRaw(probeFile,60,[700,70,920,900]))>1,'sample09: phone surface/support region did not progress');
      }
    }
  }
  for (const row of manifest.samples.filter((item) => item.sample_number <= 7)) {
    must(row.status === 'carried-forward-candidate-pending-corrected-human-review' && row.active_grammar_approval === false && ['video/qa/reference-study/motion-reverse-engineering-suite-v01/manifest.json','video/qa/reference-study/motion-reverse-engineering-pilot-v01/manifest.json'].includes(row.inheritance?.manifest_path), `sample${row.sample_number}: invalid carried-forward candidate binding`);
    for (const record of [row.analysis,row.probe,row.side_by_side,row.mobile_contact]) must(await shaFile(path.resolve(root, record.path)) === record.sha256, `sample${row.sample_number}: inherited ${record.kind ?? 'artifact'} drift`);
  }
  if (errors.length) throw new Error(`corrected motion reverse suite invalid:\n- ${errors.join('\n- ')}`);
  return {samples: 9, corrected_samples: [8,9], excluded_sample: 10};
}

if (process.argv[1]?.endsWith('validate-motion-reverse-engineering-suite-v02.mjs')) {
  const result = await validateCorrectedSuite();
  process.stdout.write(`corrected motion reverse suite valid: ${result.samples} active samples; 08/09 corrected; sample10 excluded\n`);
}
