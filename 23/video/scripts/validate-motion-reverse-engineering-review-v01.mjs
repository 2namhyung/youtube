import {createHash} from 'node:crypto';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {makeBoard,sampleRows} from './build-motion-reverse-engineering-review-v01.mjs';

const ROOT=process.cwd();
export const REVIEW_ROOT_REL='video/qa/reference-study/motion-reverse-engineering-review-v01';
const DEFAULT=path.join(ROOT,REVIEW_ROOT_REL), SUITE_REL='video/qa/reference-study/motion-reverse-engineering-suite-v01/manifest.json',PILOT_REL='video/qa/reference-study/motion-reverse-engineering-pilot-v01/manifest.json';
const CANONICAL_SAMPLE_MAP=[1,2,3,4,5,6,7,8,9,10].map((number)=>({sample_number:number,sample_id:number===2?'sample-02-numeric-step-progression':number===3?'sample-03-chart-reveal':`sample-${String(number).padStart(2,'0')}-${({1:'shared-background-accumulation',4:'map-route-reframe',5:'object-preserving-layout-reframe',6:'directional-exit-hard-cut-pair',7:'hook-reel-collage-montage',8:'speaker-supporting-overlay-entry',9:'device-light-focal-motion',10:'narrative-scale-translation'})[number]}`,inheritance:number===2||number===3?'pilot':'suite'}));
const sha=b=>createHash('sha256').update(b).digest('hex');
const shaFile=async f=>sha(await readFile(f));
const abs=(root,rel)=>path.join(ROOT,rel);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function run(cmd,args,{capture=false}={}){const r=spawnSync(cmd,args,{cwd:ROOT,encoding:capture?'utf8':undefined,windowsHide:true,stdio:capture?'pipe':'ignore'});if(r.status!==0)throw new Error(`${cmd} failed`);return capture?r.stdout:'';}
function ffprobe(file){try{return JSON.parse(run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_frames,duration','-of','json',file],{capture:true})).streams?.[0]??null;}catch{return null;}}
function rawVideo(file,filter,{seekSeconds=0,frames=300}={}){const args=['-hide_banner','-loglevel','error','-i',file];if(seekSeconds>0)args.push('-ss',String(seekSeconds));args.push('-vf',filter,'-frames:v',String(frames),'-f','rawvideo','-pix_fmt','rgb24','pipe:1');const r=spawnSync('ffmpeg',args,{cwd:ROOT,windowsHide:true,stdio:['ignore','pipe','ignore'],maxBuffer:250_000_000});if(r.status!==0)throw new Error(`ffmpeg raw decode failed: ${file}`);return r.stdout;}
function reelAllRaw(file){return rawVideo(file,'scale=192:108,format=rgb24',{frames:3000});}
function sourceRaw(file){return rawVideo(file,'scale=192:108,format=rgb24');}
function compareReelSegment(source,reelAll,start){const a=sourceRaw(source),b=reelAll,frameBytes=192*108*3,expected=frameBytes*300;if(a.length!==expected||b.length<frameBytes*(start+300))return {ok:false,mean:Infinity,max:Infinity};let total=0,max=0,count=0;for(let frame=0;frame<300;frame++){const y0=frame<45?7:0;let sum=0,pixels=0;for(let y=y0;y<108;y++)for(let x=0;x<192;x++){const ai=frame*frameBytes+(y*192+x)*3,bi=(start+frame)*frameBytes+(y*192+x)*3;for(let c=0;c<3;c++)sum+=Math.abs(a[ai+c]-b[bi+c]);pixels+=3;}const mean=sum/pixels;total+=mean;max=Math.max(max,mean);count++;}return {ok:total/count<=20&&max<=28,mean:total/count,max};}
function must(condition,message,errors){if(!condition)errors.push(message);}

function expectedContactLayout(){return {canvas:[360,203],columns:3,reference_cell:[120,101],probe_cell:[120,102],source_frame_aspect_ratio:'16:9',fit:'contain',letterbox_background:'#111',label_height:17};}

export async function validateReview({packageRoot=DEFAULT,verifyInputs=true}={}){
  const errors=[],manifest=JSON.parse(await readFile(path.join(packageRoot,'manifest.json'),'utf8'));
  must(manifest.package_id==='motion-reverse-engineering-review-v01','package_id mismatch',errors);
  must(manifest.status==='pending-human-reference-calibration-review'&&manifest.human_status==='pending'&&!manifest.human_pass&&!manifest.production_authority&&!manifest.production_eligible&&!manifest.grammar_promoted&&manifest.active_cut_root===null,'review package must remain pending/non-production',errors);
  must(manifest.suite?.manifest_path===SUITE_REL&&manifest.inherited_pilot?.manifest_path===PILOT_REL,'suite/pilot provenance binding mismatch',errors);
  const suite=JSON.parse(await readFile(path.join(ROOT,SUITE_REL),'utf8')),pilot=JSON.parse(await readFile(path.join(ROOT,PILOT_REL),'utf8')),canonicalRows=sampleRows(suite,pilot);
  must(await shaFile(path.join(ROOT,SUITE_REL))===manifest.suite.manifest_sha256,'suite manifest hash drift',errors);must(await shaFile(path.join(ROOT,PILOT_REL))===manifest.inherited_pilot.manifest_sha256,'pilot manifest hash drift',errors);
  must(manifest.samples.length===10,'review must contain exactly ten samples',errors);must(equal(manifest.reel.sample_order,[1,2,3,4,5,6,7,8,9,10]),'review reel sample order mismatch',errors);
  must(equal(manifest.canonical_sample_map,CANONICAL_SAMPLE_MAP),'canonical sample_number→sample_id mapping mismatch',errors);must(equal(manifest.samples.map(s=>({sample_number:s.sample_number,sample_id:s.sample_id,inheritance:s.inheritance})),CANONICAL_SAMPLE_MAP),'sample rows do not match immutable canonical identity map',errors);
  must(manifest.inputs.length>0,'review must bind a non-empty complete input inventory',errors);must(new Set(manifest.inputs.map(i=>i.path)).size===manifest.inputs.length,'review input paths must be unique',errors);
  const suiteById=new Map(suite.new_samples.map(s=>[s.sample_id,s]));const pilotById=new Map(pilot.samples.map(s=>[s.sample_id,s]));
  const expectedInputPaths=new Set();
  for(let i=0;i<manifest.samples.length;i++){
    const s=manifest.samples[i],number=s.sample_number,canonical=canonicalRows[i];must(number===i+1,`sample order/reordering detected at index ${i}`,errors);must(s.inheritance==='pilot'||s.inheritance==='suite','sample inheritance missing',errors);must(s.sample_id===canonical.sample_id&&s.inheritance===canonical.inheritance&&s.focal_identity===canonical.focal_identity&&s.motion_scope===canonical.motion_scope&&s.transition===canonical.transition&&s.text_rule===canonical.text_rule,`sample ${number}: immutable review identity/text binding mismatch`,errors);must(s.human_status==='pending'&&!s.production_eligible&&!s.human_pass&&!s.grammar_promoted,`sample ${number}: approval/promotion flag changed`,errors);
    const upstream=s.inheritance==='pilot'?pilotById.get(s.sample_id):suiteById.get(s.sample_id);must(Boolean(upstream),`sample ${number}: upstream sample missing`,errors);if(!upstream)continue;
    const sourceStart=upstream.window?.start_frame??upstream.source_window?.start_frame,sourceEnd=upstream.window?.end_frame??upstream.source_window?.end_frame,events=upstream.time_mapping.events??upstream.time_mapping.event_pairs;
    must(equal(s.source_frames,[sourceStart,sourceEnd]),`sample ${number}: source frame window invented or drifted`,errors);must(equal(s.exact_events,events.map(e=>({label:e.label,source_frame:e.source_frame,probe_frame:e.probe_frame}))),`sample ${number}: exact event mapping drifted`,errors);
    const upstreamDir=upstream.analysis.path.slice(0,upstream.analysis.path.lastIndexOf('/')),upstreamProbeFrames= s.inheritance==='pilot'?(upstream.probe_frames??[]):suite.artifacts.filter(item=>item.kind==='probe-frame'&&item.path.startsWith(`${upstreamDir}/`)),upstreamEvidence=[...(upstream.evidence_frames??[]),...upstreamProbeFrames].map(item=>typeof item==='string'?item:item.path);
    must(equal([...new Set(s.evidence_paths??[])].sort(),[...new Set(upstreamEvidence)].sort()),`sample ${number}: complete upstream evidence-frame inventory drifted`,errors);
    const action=upstream.probe.action_end_frame;must(s.action_end_frame===action&&s.hold_start_frame===upstream.probe.hold.start_frame&&s.hold_minimum_frames===upstream.probe.hold.minimum_frames&&s.hold_minimum_frames>=60,`sample ${number}: action/hold contract mismatch`,errors);
    must(s.contact_inputs?.length===3,`sample ${number}: contact review items missing`,errors);must(equal(s.review_checklist,{focal_identity:'pending',motion_scope:'pending',transition:'pending',text_supplemental_non_substitution:'pending',stable_hold_60f:'pending'}),`sample ${number}: review checklist changed or incomplete`,errors);
    const layout=expectedContactLayout();for(const key of Object.keys(layout))must(equal(s.contact_layout?.[key],layout[key]),`sample ${number}: contain geometry contract mismatch`,errors);must(typeof s.contact_layout?.label_source==='string'&&s.contact_layout.label_source.includes('contact'),'sample '+number+': contact provenance label missing',errors);
    const expectedPaths=[s.analysis_path,s.probe_path,s.side_by_side_path,s.contact_path,...(s.evidence_paths??[])];for(const item of s.contact_inputs??[])expectedPaths.push(item.source_path,item.probe_path);for(const p of expectedPaths){expectedInputPaths.add(p);must(typeof p==='string'&&p.length>0,`sample ${number}: required review path missing`,errors);}
    if(verifyInputs){for(const p of expectedPaths){try{must(await shaFile(abs(packageRoot,p))===manifest.inputs.find(x=>x.path===p)?.sha256,`sample ${number}: input hash missing/drifted ${p}`,errors);}catch{errors.push(`sample ${number}: missing input ${p}`);}}
      for(const item of s.contact_inputs){for(const key of ['source_path','probe_path']){const p=item[key],bound=manifest.inputs.find(x=>x.path===p);try{must(Boolean(bound)&&await shaFile(abs(packageRoot,p))===bound.sha256,`sample ${number}: contact input hash drifted ${p}`,errors);}catch{errors.push(`sample ${number}: missing contact input ${p}`);}}}
      const cmeta=await sharp(abs(packageRoot,s.contact_path)).metadata();must(cmeta.width===360&&cmeta.height===203,`sample ${number}: contact dimensions mismatch`,errors);
      const probeMeta=ffprobe(abs(packageRoot,s.probe_path));must(probeMeta?.width===1920&&probeMeta?.height===1080&&probeMeta?.avg_frame_rate==='30/1'&&Number(probeMeta?.nb_frames)===300,`sample ${number}: probe must be 1920x1080 30fps 300f`,errors);const meta=ffprobe(abs(packageRoot,s.side_by_side_path));must(meta?.width===1920&&meta?.height===1080&&meta?.avg_frame_rate==='30/1'&&Number(meta?.nb_frames)===300,`sample ${number}: side-by-side must be 1920x1080 30fps 300f`,errors);
      for(const item of s.contact_inputs){for(const key of ['source_path','probe_path']){const imageMeta=await sharp(abs(packageRoot,item[key])).metadata();must(Number(imageMeta.width)>0&&Number(imageMeta.height)>0,`sample ${number}: contact frame failed to decode ${item[key]}`,errors);}}
    }
  }
  const boardFile=abs(packageRoot,manifest.board.path),reelFile=abs(packageRoot,manifest.reel.path);const boardMeta=await sharp(boardFile).metadata();must(boardMeta.width===1920&&boardMeta.height===1080, 'review board dimensions mismatch',errors);must(await shaFile(boardFile)===manifest.board.sha256,'review board hash drift',errors);
  const reelMeta=ffprobe(reelFile);must(reelMeta?.width===1920&&reelMeta?.height===1080&&reelMeta?.avg_frame_rate==='30/1'&&Number(reelMeta?.nb_frames)===3000,'review reel must be ordered 1920x1080 30fps 3000f',errors);must(await shaFile(reelFile)===manifest.reel.sha256,'review reel hash drift',errors);must(manifest.reel.separator.includes('screen-chrome'),'review reel separator contract missing',errors);must(equal(manifest.reel.pixel_parity,{comparison_resolution:[192,108],first_45f_exempt_top_px:64,mean_abs_rgb_max:20,max_frame_mean_abs_rgb_max:28}),'review reel pixel-parity contract changed',errors);
  const actualInputPaths=new Set(manifest.inputs.map(i=>i.path));must(equal([...actualInputPaths].sort(),[...expectedInputPaths].sort()),'review input inventory does not exactly match all upstream evidence and required media',errors);const bundle=sha(Buffer.from(manifest.inputs.map(i=>`${i.kind}|${i.path}|${i.sha256}`).sort().join('\n')));must(bundle===manifest.artifact_bundle_sha256,'input artifact bundle hash mismatch',errors);
  if(verifyInputs){
    const temp=await mkdtemp(path.join(os.tmpdir(),'motion-reverse-review-board-'));
    try{const expectedBoard=path.join(temp,'expected-board.png');await makeBoard(canonicalRows,expectedBoard);const actualBoard=await sharp(boardFile).removeAlpha().raw().toBuffer(),rebuiltBoard=await sharp(expectedBoard).removeAlpha().raw().toBuffer();must(actualBoard.equals(rebuiltBoard),'review board pixels do not match deterministic contact/text/layout rebuild',errors);
      const reelAll=reelAllRaw(reelFile);for(const sample of manifest.samples){const sampleSide=abs(packageRoot,sample.side_by_side_path),comparison=compareReelSegment(sampleSide,reelAll,(sample.sample_number-1)*300);must(comparison.ok,`sample ${sample.sample_number}: review reel segment pixel mismatch (mean=${comparison.mean.toFixed(3)}, max=${comparison.max.toFixed(3)})`,errors);}
    }finally{await rm(temp,{recursive:true,force:true});}
  }
  if(errors.length)throw new Error(`motion reverse review package invalid:\n- ${errors.join('\n- ')}`);return {samples:10,board:manifest.board.sha256,reel:manifest.reel.sha256,inputs:manifest.inputs.length};
}
if(process.argv[1]?.endsWith('validate-motion-reverse-engineering-review-v01.mjs')){try{const r=await validateReview();process.stdout.write(`motion reverse review package valid: ${r.samples} samples, ${r.inputs} inputs\n`);}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}}
