import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {isDeepStrictEqual} from 'node:util';
import {validateCorrectedSuite} from './validate-motion-reverse-engineering-suite-v02.mjs';
import {validatePackage as validateMotionContracts} from './validate-frame-accurate-motion-contract-v02.mjs';

const ROOT = process.cwd();
const MANIFEST_REL = 'video/qa/reference-study/motion-reverse-engineering-review-v02/manifest.json';
const CONTRACT_MANIFEST_REL = 'video/qa/reference-study/frame-accurate-motion-contract-v02/manifest.json';
const SUITE_REL = 'video/qa/reference-study/motion-reverse-engineering-suite-v02/manifest.json';
const SUITE_SHA256 = '4313dba7948ac01da29d1c569c072f9466393ec91f11454f0e6f98ea253d1bb6';
const SAMPLE10_FRAME_REL = 'video/qa/reference-study/motion-reverse-engineering-review-v02/sample-10-source-video-selection-frame-000956.png';
const EXPECTED_FUTURE_APPROVAL = {
  status:'marker-absent-pending-explicit-human-pass',
  validator:'video/scripts/validate-reference-calibration-approval-v02.mjs',
  marker_path:'video/qa/reference-study/motion-reverse-engineering-review-v02/reference-calibration-approval-v02.json',
  required_reviewer:'user',required_active_decisions:9,required_sample10_exclusion_acknowledgement:true,
  grammar_promotion_requires_valid_marker:true,legacy_v01_route_enabled:false,
};
const sha = (value) => createHash('sha256').update(value).digest('hex');
const shaFile = async (file) => sha(await readFile(file));
const exists = async (file) => { try { return (await stat(file)).isFile(); } catch { return false; } };
function ffprobe(file) { const result=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_frames','-of','json',file],{encoding:'utf8',windowsHide:true}); return result.status===0?JSON.parse(result.stdout).streams?.[0]:null; }
const sortInputs = (rows) => [...rows].sort((a,b) => `${a.sample_number}|${a.kind}|${a.path}|${a.sha256}`.localeCompare(`${b.sample_number}|${b.kind}|${b.path}|${b.sha256}`));
const meanAbs = (a,b) => {let total=0;for(let index=0;index<a.length;index+=1)total+=Math.abs(a[index]-b[index]);return total/a.length;};
function selectedScaledFrames(file, frames) {
  const select=frames.map((frame)=>`eq(n\\,${frame})`).join('+');
  const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i',file,'-vf',`select='${select}',scale=64:36,format=rgb24`,'-vsync','0','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{encoding:null,windowsHide:true,maxBuffer:64*36*3*(frames.length+1)});
  if(result.status!==0||result.stdout.length!==64*36*3*frames.length)return null;
  const size=64*36*3;return frames.map((_,index)=>result.stdout.subarray(index*size,(index+1)*size));
}

export async function validateReelIdentity({root=ROOT,actualPath,sourcePaths,frames}) {
  const temporaryRoot=await mkdtemp(path.join(os.tmpdir(),'motion-review-v02-reel-'));
  try {
    const listFile=path.join(temporaryRoot,'expected.ffconcat');
    const expectedFile=path.join(temporaryRoot,'expected.mp4');
    const lines=['ffconcat version 1.0',...sourcePaths.map((relativePath)=>`file '${path.resolve(root,relativePath).replaceAll('\\','/').replaceAll("'","'\\''")}'`)];
    await writeFile(listFile,lines.join('\n'));
    const render=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',listFile,'-frames:v',String(frames),'-r','30','-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',expectedFile],{encoding:'utf8',windowsHide:true});
    if(render.status!==0)return{valid:false,error:`canonical reel reconstruction failed: ${render.stderr?.trim()||`ffmpeg exit ${render.status}`}`};
    const actualFile=path.resolve(root,actualPath);
    const [actualSha256,expectedSha256]=await Promise.all([shaFile(actualFile),shaFile(expectedFile)]);
    const expectedMeta=ffprobe(expectedFile);
    if(expectedMeta?.width!==1920||expectedMeta?.height!==1080||expectedMeta?.avg_frame_rate!=='30/1'||Number(expectedMeta?.nb_frames)!==frames)return{valid:false,error:'canonical reel reconstruction produced an unexpected media spec',actualSha256,expectedSha256};
    return{valid:actualSha256===expectedSha256,actualSha256,expectedSha256,verifiedFrames:frames};
  } finally {
    await rm(temporaryRoot,{recursive:true,force:true});
  }
}
async function boardTile(root, contactPath, number, sampleId) {
  const image=await sharp(path.join(root,contactPath)).resize(620,344,{fit:'contain',background:'#111'}).png().toBuffer();
  const label=`${String(number).padStart(2,'0')} · ${sampleId.replaceAll('&','and')}`;
  const overlay=Buffer.from(`<svg width="620" height="42"><rect width="620" height="42" fill="#111"/><text x="14" y="28" font-family="Arial" font-size="19" font-weight="700" fill="#fff">${label}</text></svg>`);
  return sharp({create:{width:620,height:344,channels:3,background:'#111'}}).composite([{input:image,left:0,top:0},{input:overlay,left:0,top:0}]).png().toBuffer();
}
async function expectedBoard(root, samples) {
  const layers=[];for(let index=0;index<samples.length;index+=1){const row=samples[index];layers.push({input:await boardTile(root,row.mobile_contact.path,row.sample_number,row.sample_id),left:20+(index%3)*635,top:18+Math.floor(index/3)*354});}
  return sharp({create:{width:1920,height:1080,channels:3,background:'#20262b'}}).composite(layers).raw().toBuffer();
}
async function expectedDeltaBoard(root, samples) {
  const sample08=samples.find((row)=>row.sample_number===8),sample09=samples.find((row)=>row.sample_number===9);
  const source=await sharp(path.join(root,SAMPLE10_FRAME_REL)).resize(860,484,{fit:'contain',background:'#111'}).png().toBuffer();
  const exclusionOverlay=Buffer.from(`<svg width="900" height="520"><rect width="900" height="520" fill="none" stroke="#d85b59" stroke-width="10"/><line x1="30" y1="490" x2="870" y2="30" stroke="#d85b59" stroke-width="14"/><rect x="0" y="0" width="900" height="94" fill="#111" fill-opacity=".94"/><text x="24" y="36" font-family="Arial" font-size="25" font-weight="700" fill="#fff">10 · EXCLUDED: SOURCE-VIDEO-SELECTION</text><text x="24" y="72" font-family="Arial" font-size="20" fill="#ffd8d7">NO REMOTION PROBE · NO ACTIVE GRAMMAR BINDING</text></svg>`);
  const delta08=await boardTile(root,sample08.mobile_contact.path,8,'CORRECTED · NON-PERSON SIDE OVERLAYS');
  const delta09=await boardTile(root,sample09.mobile_contact.path,9,'CORRECTED · DEVICE/SURFACE ONLY');
  return sharp({create:{width:1920,height:1080,channels:3,background:'#20262b'}}).composite([{input:await sharp(delta08).resize(920,510).png().toBuffer(),left:20,top:20},{input:await sharp(delta09).resize(920,510).png().toBuffer(),left:980,top:20},{input:source,left:520,top:566},{input:exclusionOverlay,left:500,top:548}]).raw().toBuffer();
}

export async function validateCorrectedReview(options = {}) {
  const root = options.root ?? ROOT;
  const manifestFile = path.resolve(root, options.manifestPath ?? MANIFEST_REL);
  const errors = [];
  const must = (condition, message) => { if (!condition) errors.push(message); };
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  const suiteFile=path.resolve(root,SUITE_REL),suite=JSON.parse(await readFile(suiteFile,'utf8'));
  must(isDeepStrictEqual(manifest.suite,{path:SUITE_REL,sha256:SUITE_SHA256})&&await shaFile(suiteFile)===SUITE_SHA256,'corrected review suite must use the validator-owned exact path/hash');
  if (options.verifySuite !== false) { try { await validateCorrectedSuite({root, verifyMedia: options.verifyMedia}); } catch (error) { errors.push(error.message); } }
  try {
    const contractErrors = await validateMotionContracts({root, packageRoot: path.dirname(path.resolve(root, CONTRACT_MANIFEST_REL)), verifyMedia: options.verifyMedia !== false});
    if (contractErrors.length) errors.push(`mandatory frame-accurate motion contract upstream invalid:\n${contractErrors.join('\n')}`);
  } catch (error) { errors.push(`mandatory frame-accurate motion contract upstream unavailable: ${error.message}`); }
  const contractManifestFile = path.resolve(root, CONTRACT_MANIFEST_REL);
  const contractManifest = JSON.parse(await readFile(contractManifestFile, 'utf8'));
  const expectedContractBindings = [];
  for (const record of [...contractManifest.contracts, contractManifest.exclusion_contract]) {
    const contract = JSON.parse(await readFile(path.resolve(root, record.path), 'utf8'));
    expectedContractBindings.push({sample_number:record.sample_number,sample_id:record.sample_id,contract_id:contract.contract_id,path:record.path,sha256:record.sha256,status:record.status});
  }
  const expectedActiveContractBindings = expectedContractBindings.filter((record) => record.sample_number <= 9);
  const expectedExclusionContractBinding = expectedContractBindings.find((record) => record.sample_number === 10);
  const expectedContractManifestBinding = {path:CONTRACT_MANIFEST_REL,sha256:await shaFile(contractManifestFile)};
  must(manifest.package_id === 'motion-reverse-engineering-review-v02-nine-samples' && manifest.status === 'pending-human-corrected-reference-calibration-review', 'corrected review identity/status mismatch');
  must(isDeepStrictEqual(manifest.future_human_approval,EXPECTED_FUTURE_APPROVAL),'future v02 approval route must be exact, marker-absent, and v01-disabled');
  must(manifest.motion_contract_package?.required === true && manifest.motion_contract_package?.authority === 'mandatory-analysis-contract-upstream-only' && JSON.stringify(manifest.motion_contract_package?.manifest) === JSON.stringify(expectedContractManifestBinding), 'mandatory contract manifest exact path/hash binding mismatch');
  must(JSON.stringify(manifest.motion_contract_package?.active_contracts) === JSON.stringify(expectedActiveContractBindings), 'mandatory active motion contract bindings must exactly cover samples 01-09');
  must(JSON.stringify(manifest.motion_contract_package?.exclusion_contract) === JSON.stringify(expectedExclusionContractBinding), 'mandatory sample10 exclusion contract binding mismatch');
  must(manifest.sample_count === 9 && JSON.stringify(manifest.sample_order) === JSON.stringify([1,2,3,4,5,6,7,8,9]), 'review active order must be exactly 01-09');
  const expectedSamples=suite.samples.map((row)=>({sample_number:row.sample_number,sample_id:row.sample_id,decision:'pending',motion_contract:expectedActiveContractBindings.find((record)=>record.sample_number===row.sample_number),analysis:row.analysis,probe:row.probe,side_by_side:row.side_by_side,contact:row.mobile_contact}));
  must(isDeepStrictEqual(manifest.samples,expectedSamples),'review sample rows must exactly match canonical suite evidence and immutable motion contracts');
  must(manifest.human_pass === false && manifest.grammar_promoted === false && manifest.production_authority === false && manifest.production_eligible === false && manifest.active_cut_root === null, 'corrected review must not grant approval or production authority');
  must(manifest.supersedes_review?.sha256 === '35c77a0e01abe29c2b880e2a0a126db234042fba7c10aee6489b7c4b3c868f9c' && manifest.supersedes_review?.authority === 'historical-only', 'old ten-sample review must be explicitly historical');
  const exclusion = manifest.excluded_sample_10;
  const sample10FrameFile=path.resolve(root,SAMPLE10_FRAME_REL),sample10FrameInfo=await stat(sample10FrameFile);
  const sample10ReviewFrame={kind:'source-video-selection-frame',path:SAMPLE10_FRAME_REL,sha256:await shaFile(sample10FrameFile),bytes:sample10FrameInfo.size,width:640,height:360};
  const expectedExclusion={...suite.excluded_observations[0],review_frame:sample10ReviewFrame,motion_contract:expectedExclusionContractBinding,acknowledgement:'pending-human-review'};
  must(isDeepStrictEqual(exclusion,expectedExclusion),'sample10 must be the canonical source-video exclusion acknowledgement with no relabel or evidence leakage');
  must(!(manifest.samples ?? []).some((row) => row.sample_number === 10 || /sample-10/u.test(row.probe?.path ?? '') || /sample-10/u.test(row.side_by_side?.path ?? '')), 'sample10 cannot have an active probe/comparison review row');
  must(!(manifest.inputs ?? []).some((item) => item.sample_number === 10 && ['probe','side-by-side','contact','analysis'].includes(item.kind)), 'sample10 cannot enter active review inputs as a Remotion artifact');
  const bundle = sha(Buffer.from((manifest.inputs ?? []).map((item) => `${item.sample_number}|${item.kind}|${item.path}|${item.sha256}`).sort().join('\n')));
  must(bundle === manifest.input_bundle_sha256, 'corrected review input bundle drift');
  const requiredContractInputs = [{sample_number:0,kind:'motion-contract-manifest',...expectedContractManifestBinding},...expectedContractBindings.map((record) => ({sample_number:record.sample_number,kind:'motion-contract',path:record.path,sha256:record.sha256}))];
  const artifactRecord=async(kind,relativePath,extra={})=>{const file=path.resolve(root,relativePath),info=await stat(file);return{kind,path:relativePath,sha256:await shaFile(file),bytes:info.size,...extra};};
  const expectedBoardRecord=await artifactRecord('review-board','video/qa/reference-study/motion-reverse-engineering-review-v02/review-board-9-samples-1920x1080.png',{width:1920,height:1080});
  const expectedReelRecord=await artifactRecord('sequential-review-reel','video/qa/reference-study/motion-reverse-engineering-review-v02/review-reel-9-samples-provisional.mp4',{width:1920,height:1080,fps:30,duration_in_frames:2700});
  const expectedDeltaBoardRecord=await artifactRecord('delta-review-board','video/qa/reference-study/motion-reverse-engineering-review-v02/delta-review-08-09-10-exclusion-1920x1080.png',{width:1920,height:1080});
  const expectedDeltaReelRecord=await artifactRecord('delta-review-reel','video/qa/reference-study/motion-reverse-engineering-review-v02/delta-review-08-09-provisional.mp4',{width:1920,height:1080,fps:30,duration_in_frames:600});
  must(isDeepStrictEqual(manifest.board,expectedBoardRecord)&&isDeepStrictEqual(manifest.reel,expectedReelRecord),'active board/reel records must exactly bind canonical output files');
  const deltaScope=['sample-08 corrected non-person overlays','sample-09 corrected device/surface motion','sample-10 exclusion as source-video-selection'];
  must(isDeepStrictEqual(manifest.delta_review,{scope:deltaScope,board:expectedDeltaBoardRecord,reel:expectedDeltaReelRecord}),'delta review records/scope must be exact');
  const suiteInputs=suite.samples.flatMap((row)=>Object.entries({analysis:row.analysis,probe:row.probe,'side-by-side':row.side_by_side,contact:row.mobile_contact}).map(([kind,record])=>({sample_number:row.sample_number,kind,path:record.path,sha256:record.sha256})));
  const outputInputs=[['review-board',expectedBoardRecord],['active-review-reel',expectedReelRecord],['delta-review-board',expectedDeltaBoardRecord],['delta-review-reel',expectedDeltaReelRecord]].map(([kind,record])=>({sample_number:0,kind,path:record.path,sha256:record.sha256}));
  const expectedInputs=[...suiteInputs,{sample_number:10,kind:sample10ReviewFrame.kind,path:sample10ReviewFrame.path,sha256:sample10ReviewFrame.sha256},...requiredContractInputs,...outputInputs];
  must(isDeepStrictEqual(sortInputs(manifest.inputs??[]),sortInputs(expectedInputs)),'review input inventory must exactly equal all canonical suite evidence, contract files, and review outputs with no extras/deletions/rebinding');
  for (const item of manifest.inputs ?? []) {
    const file = path.resolve(root, item.path);
    must(await exists(file), `missing review input: ${item.path}`);
    if (await exists(file)) must(await shaFile(file) === item.sha256, `review input hash drift: ${item.path}`);
  }
  for (const [label, record, expectedFrames] of [['board',manifest.board,null],['reel',manifest.reel,2700],['delta board',manifest.delta_review?.board,null],['delta reel',manifest.delta_review?.reel,600]]) {
    const file = path.resolve(root, record?.path ?? '');
    must(await exists(file), `${label} missing`);
    if (await exists(file)) must(await shaFile(file) === record.sha256, `${label} hash drift`);
    if (await exists(file) && expectedFrames && options.verifyMedia !== false) {
      const meta=ffprobe(file);must(meta?.width===1920&&meta?.height===1080&&meta?.avg_frame_rate==='30/1'&&Number(meta?.nb_frames)===expectedFrames,`${label} dimensions/fps/frame count mismatch`);
    }
    if (await exists(file) && !expectedFrames) { const meta=await sharp(file).metadata(); must(meta.width===1920&&meta.height===1080,`${label} must be 1920x1080`); }
  }
  if(options.verifyMedia!==false){
    const boardPixels=await sharp(path.resolve(root,manifest.board.path)).raw().toBuffer();
    must(boardPixels.equals(await expectedBoard(root,suite.samples)),'active board pixels do not reconstruct from canonical contacts 01-09');
    const deltaBoardPixels=await sharp(path.resolve(root,manifest.delta_review.board.path)).raw().toBuffer();
    must(deltaBoardPixels.equals(await expectedDeltaBoard(root,suite.samples)),'delta board pixels do not reconstruct from canonical samples08/09 plus sample10 exclusion');
    const sample10SourceFrames=selectedScaledFrames(path.resolve(root,suite.excluded_observations[0].source.path),[956]);
    const sample10ReviewFrames=selectedScaledFrames(sample10FrameFile,[0]);
    must(sample10SourceFrames&&sample10ReviewFrames&&meanAbs(sample10SourceFrames[0],sample10ReviewFrames[0])<2,'sample10 exclusion frame is not the canonical source-video frame F956');
    const activeReelIdentity=await validateReelIdentity({root,actualPath:manifest.reel.path,sourcePaths:suite.samples.map((row)=>row.side_by_side.path),frames:2700});
    must(activeReelIdentity.valid,`active reel 01-09 is not the exhaustive deterministic reconstruction of all 2700 canonical ordered frames${activeReelIdentity.error?`: ${activeReelIdentity.error}`:''}`);
    const deltaRows=suite.samples.filter((row)=>[8,9].includes(row.sample_number));
    const deltaReelIdentity=await validateReelIdentity({root,actualPath:manifest.delta_review.reel.path,sourcePaths:deltaRows.map((row)=>row.side_by_side.path),frames:600});
    must(deltaReelIdentity.valid,`delta reel 08-09 is not the exhaustive deterministic reconstruction of all 600 canonical ordered frames${deltaReelIdentity.error?`: ${deltaReelIdentity.error}`:''}`);
  }
  must(JSON.stringify(manifest.delta_review?.scope) === JSON.stringify(['sample-08 corrected non-person overlays','sample-09 corrected device/surface motion','sample-10 exclusion as source-video-selection']), 'delta review scope drift');
  if (errors.length) throw new Error(`corrected motion reverse review invalid:\n- ${errors.join('\n- ')}`);
  return {samples: 9, review_status: 'pending', delta_scope: 3};
}

if (process.argv[1]?.endsWith('validate-motion-reverse-engineering-review-v02.mjs')) {
  const result=await validateCorrectedReview();
  process.stdout.write(`corrected motion reverse review valid: ${result.samples} pending samples; delta scope ${result.delta_scope}\n`);
}
