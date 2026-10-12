import {createHash} from 'node:crypto';
import {copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {renderComposition} from './qa-runtime.mjs';
import {diffMeasure, measureProbeSample, probeFramesRequired} from './motion-reverse-suite-measurements.mjs';
import {ENTRY_REL, INHERITED_PILOT_MANIFEST_REL, INHERITED_PILOT_MANIFEST_SHA256, MEASUREMENT_REL, RUNTIME_REL, SUITE_ROOT_REL, mapSourceFrame, suiteSpecs} from './motion-reverse-suite-config.mjs';

const ROOT = process.cwd();
const OUT = path.join(ROOT, SUITE_ROOT_REL);
const ENTRY = path.join(ROOT, ENTRY_REL);
const WIDTH = 1920, HEIGHT = 1080, FPS = 30;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const shaFile = async (file) => sha(await readFile(file));
const rel = (file) => path.relative(ROOT, file).replaceAll('\\', '/');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function run(command, args, {capture = false} = {}) {
  const result = spawnSync(command, args, {cwd: ROOT, encoding: capture ? 'utf8' : undefined, windowsHide: true, stdio: capture ? 'pipe' : 'inherit'});
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})\n${result.stderr ?? ''}`);
  return capture ? result.stdout : undefined;
}
function ffmpeg(args) { run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]); }

async function artifact(file, kind) {
  const info = await stat(file);
  const image = /\.(png|jpe?g)$/iu.test(file) ? await sharp(file).metadata() : null;
  return {kind, path: rel(file), sha256: await shaFile(file), bytes: info.size, ...(image ? {width: image.width, height: image.height} : {})};
}

async function rawImage(file) { return sharp(file).removeAlpha().raw().toBuffer(); }
function frameFile(dir, frame) { return path.join(dir, `frame-${String(frame).padStart(6, '0')}.png`); }

function median(values) {
  const sorted = [...values].sort((a,b) => a-b);
  if (!sorted.length) return 0;
  const i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i-1] + sorted[i]) / 2;
}

function sourcePcaAngle(raw, width, rect) {
  const points = [];
  for (let y = Math.max(0,rect[1]); y < rect[1]+rect[3]; y += 2) for (let x = Math.max(0,rect[0]); x < rect[0]+rect[2]; x += 2) {
    const i = (y * width + x) * 3, gray = (raw[i] + raw[i+1] + raw[i+2]) / 3;
    if (gray < 78) points.push([x,y]);
  }
  if (points.length < 10) return null;
  const mx = points.reduce((s,p)=>s+p[0],0)/points.length, my = points.reduce((s,p)=>s+p[1],0)/points.length;
  let xx=0,yy=0,xy=0;
  for(const [x,y] of points){const dx=x-mx,dy=y-my;xx+=dx*dx;yy+=dy*dy;xy+=dx*dy;}
  return +(Math.atan2(2*xy,xx-yy)*90/Math.PI).toFixed(3);
}

async function normalizedCropCorrelation(fileA, rectA, fileB, rectB) {
  const a = await sharp(fileA).extract({left:rectA[0],top:rectA[1],width:rectA[2],height:rectA[3]}).resize(64,64).grayscale().raw().toBuffer();
  const b = await sharp(fileB).extract({left:rectB[0],top:rectB[1],width:rectB[2],height:rectB[3]}).resize(64,64).grayscale().raw().toBuffer();
  const ma = a.reduce((s,v)=>s+v,0)/a.length, mb = b.reduce((s,v)=>s+v,0)/b.length;
  let num=0,da=0,db=0;
  for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;num+=x*y;da+=x*x;db+=y*y;}
  return +(num/Math.sqrt(Math.max(1,da*db))).toFixed(6);
}

function bestGrayTranslationCorrelation(rawA, rawB, width, height, {maxDx = 160, maxDy = 80, step = 4, margin = 40} = {}) {
  let best = {dx_px: null, dy_px: null, normalized_correlation: -2};
  for (let dy = -maxDy; dy <= maxDy; dy += step) for (let dx = -maxDx; dx <= maxDx; dx += step) {
    let sumA = 0, sumB = 0, count = 0;
    for (let y = margin; y < height - margin; y += step) for (let x = margin; x < width - margin; x += step) {
      const xb = x + dx, yb = y + dy;
      if (xb < 0 || xb >= width || yb < 0 || yb >= height) continue;
      const ia = (y * width + x) * 3, ib = (yb * width + xb) * 3;
      sumA += (rawA[ia] + rawA[ia + 1] + rawA[ia + 2]) / 3;
      sumB += (rawB[ib] + rawB[ib + 1] + rawB[ib + 2]) / 3;
      count++;
    }
    const meanA = sumA / count, meanB = sumB / count;
    let numerator = 0, denomA = 0, denomB = 0;
    for (let y = margin; y < height - margin; y += step) for (let x = margin; x < width - margin; x += step) {
      const xb = x + dx, yb = y + dy;
      if (xb < 0 || xb >= width || yb < 0 || yb >= height) continue;
      const ia = (y * width + x) * 3, ib = (yb * width + xb) * 3;
      const a = (rawA[ia] + rawA[ia + 1] + rawA[ia + 2]) / 3 - meanA;
      const b = (rawB[ib] + rawB[ib + 1] + rawB[ib + 2]) / 3 - meanB;
      numerator += a * b; denomA += a * a; denomB += b * b;
    }
    const correlation = numerator / Math.sqrt(Math.max(1, denomA * denomB));
    if (correlation > best.normalized_correlation) best = {dx_px: dx, dy_px: dy, normalized_correlation: +correlation.toFixed(6)};
  }
  return best;
}

function meanLuma(raw) {
  let sum = 0;
  for (let index = 0; index < raw.length; index += 3) sum += (raw[index] + raw[index + 1] + raw[index + 2]) / 3;
  return +(sum / (raw.length / 3)).toFixed(6);
}

function pixelCount(raw, width, rect, predicate) {
  let count=0,minX=width,minY=1e9,maxX=-1,maxY=-1;
  for(let y=rect[1];y<rect[1]+rect[3];y++)for(let x=rect[0];x<rect[0]+rect[2];x++){
    const i=(y*width+x)*3;if(!predicate(raw[i],raw[i+1],raw[i+2]))continue;
    count++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
  }
  return {pixel_count:count,bbox:count?[minX,minY,maxX-minX+1,maxY-minY+1]:null};
}

async function extractSequence(spec, temp) {
  const dir = path.join(temp, `source-${String(spec.number).padStart(2,'0')}`);
  await mkdir(dir,{recursive:true});
  const pattern=path.join(dir,'frame-%06d.png');
  ffmpeg(['-i',path.join(ROOT,spec.source.path),'-vf',`select='between(n\\,${spec.start}\\,${spec.end})'`,'-vsync','0','-start_number',String(spec.start),pattern]);
  if(spec.secondary){
    for(const [frame] of spec.secondary) ffmpeg(['-i',path.join(ROOT,spec.source.path),'-vf',`select='eq(n\\,${frame})'`,'-vsync','0','-frames:v','1',frameFile(dir,frame)]);
  }
  return dir;
}

async function analyzeSource(spec, sourceDir, sampleDir) {
  const needed = new Set(spec.events.flatMap(([frame])=>[frame,frame-1]).filter((frame)=>frame>=0));
  const eventRaws = new Map();
  const identities=[]; const adjacent=[];
  let previous=null, baseline=null;
  const maxDiff=new Uint8Array(spec.source.width*spec.source.height);
  for(let frame=spec.start;frame<=spec.end;frame++){
    const file=frameFile(sourceDir,frame), raw=await rawImage(file);
    if(frame===spec.start) baseline=raw;
    identities.push({source_frame:frame,source_time_seconds:+(frame/spec.source.fps).toFixed(6),raw_rgb_sha256:sha(raw)});
    if(needed.has(frame))eventRaws.set(frame,raw);
    if(previous){
      const diff=diffMeasure(previous,raw,spec.source.width,spec.source.height,24);
      adjacent.push({before_frame:frame-1,after_frame:frame,...diff});
      for(let p=0;p<maxDiff.length;p++){
        const i=p*3,d=Math.round((Math.abs(raw[i]-baseline[i])+Math.abs(raw[i+1]-baseline[i+1])+Math.abs(raw[i+2]-baseline[i+2]))/3);
        if(d>maxDiff[p])maxDiff[p]=d;
      }
    }
    previous=raw;
  }
  if(spec.secondary)for(const [frame] of spec.secondary){const raw=await rawImage(frameFile(sourceDir,frame));eventRaws.set(frame,raw);identities.push({source_frame:frame,source_time_seconds:+(frame/spec.source.fps).toFixed(6),raw_rgb_sha256:sha(raw),secondary_event:true});}
  const means=adjacent.map(row=>row.mean_abs_rgb), center=median(means), mad=median(means.map(v=>Math.abs(v-center))), threshold=Math.max(18,center+6*mad);
  const boundaries=adjacent.filter(row=>row.mean_abs_rgb>=threshold).sort((a,b)=>b.mean_abs_rgb-a.mean_abs_rgb).slice(0,20);
  const stable=Buffer.alloc(maxDiff.length),dynamic=Buffer.alloc(maxDiff.length);
  for(let i=0;i<maxDiff.length;i++){if(maxDiff[i]<8)stable[i]=255;if(maxDiff[i]>=32)dynamic[i]=255;}
  const stablePath=path.join(sampleDir,'source-stable-mask.png'),dynamicPath=path.join(sampleDir,'source-dynamic-mask.png');
  await sharp(stable,{raw:{width:spec.source.width,height:spec.source.height,channels:1}}).png().toFile(stablePath);
  await sharp(dynamic,{raw:{width:spec.source.width,height:spec.source.height,channels:1}}).png().toFile(dynamicPath);
  const eventMetrics=[];
  for(const [frame,label] of spec.events){
    const raw=eventRaws.get(frame), prior=eventRaws.get(frame-1);
    eventMetrics.push({source_frame:frame,label,probe_frame:mapSourceFrame(spec,frame),adjacent_from_previous_source_frame:prior?diffMeasure(prior,raw,spec.source.width,spec.source.height,24):null});
  }
  const specific={};
  if(spec.number===1){specific.accumulation_event_change_bboxes=eventMetrics.map(e=>({source_frame:e.source_frame,label:e.label,change_bbox:e.adjacent_from_previous_source_frame?.change_bbox??null}));specific.roof_occlusion='people-over-building z-order is visually annotated at F232; flattened pixels cannot recover original layer IDs';}
  if(spec.number===4){specific.continuous_registration=[[243,244],[393,394]].map(([a,b])=>({before_frame:a,after_frame:b,...diffMeasure(eventRaws.get(a),eventRaws.get(b),640,360,24),...bestGrayTranslationCorrelation(eventRaws.get(a),eventRaws.get(b),640,360),mean_luma_delta:+(meanLuma(eventRaws.get(b))-meanLuma(eventRaws.get(a))).toFixed(6),classification:a===243?'continuous fast map/camera pan; registered structure survives':'continuous registered map plus localized explosion/brightness flash'}));specific.opening_overlay_lifecycle={source_frames:[190,205,210],probe_frames:[0,14,18],classification:'person/US marker visible at F190, fade complete by about F205, absent at F210; exact frames are raw-identity bound and semantic visibility is manually reviewed'};specific.opening_future_overlay_absence={source_frame:190,aircraft_and_iran_border:'absent by manual semantic review; validator binds local overlay lifecycles and exact source frames'};specific.camera_status='F243→244 translation registration and F393→394 luminance-normalized registration reject hard cuts; exact hidden camera interpolation/homography remains unavailable';}
  if(spec.number===5){specific.flag_map_object_crop_correlation=await normalizedCropCorrelation(frameFile(sourceDir,995),[1085,440,700,300],frameFile(sourceDir,1021),[645,240,700,300]);specific.measured_object_crop_scale_ratio=1;}
  if(spec.number===6){specific.exit_endpoint_diff=diffMeasure(eventRaws.get(711),eventRaws.get(726),1920,1080,24);specific.adjacent_hard_cut=diffMeasure(eventRaws.get(370),eventRaws.get(371),1920,1080,24);}
  if(spec.number===7){specific.adjacent_cut_metrics=[[106,107],[227,228]].map(([a,b])=>({before_frame:a,after_frame:b,...diffMeasure(eventRaws.get(a),eventRaws.get(b),640,360,24)}));specific.source_footage_internal_motion='speaker pixels change internally before first hard cut and are not classified as editorial camera motion';}
  if(spec.number===8){specific.presenter_wrapper='editorial full-frame placement remains constant; live-action pixels are classified separately';specific.bilateral_event_change_bboxes=eventMetrics.filter(e=>[43,163,245].includes(e.source_frame)).map(e=>({source_frame:e.source_frame,change_bbox:e.adjacent_from_previous_source_frame?.change_bbox??null}));}
  if(spec.number===9){specific.phone_dark_mask_pca_degrees=[60,120].map(frame=>({source_frame:frame,degrees:sourcePcaAngle(eventRaws.get(frame),640,[30,40,170,280])}));specific.phone_angle_delta_degrees=+Math.abs(sourcePcaAngle(eventRaws.get(120),640,[30,40,170,280])-sourcePcaAngle(eventRaws.get(60),640,[30,40,170,280])).toFixed(3);specific.manual_surface_content=spec.manual_surface_content;specific.support_icons={both_visible_by_source_frame:90,confirmed_frames:[90,120],classification:'two independent source-visible support marks outside the phone surface'};specific.excluded_post_cut_boundary={before_frame:155,after_frame:156,...diffMeasure(eventRaws.get(155),eventRaws.get(156),640,360,24)};specific.montage_exclusion={included_end_frame:155,excluded_start_frame:156,excluded_content:'money/clock montage'};}
  if(spec.number===10){specific.left_group_event_deltas=eventMetrics.filter(e=>[971,1019,1035].includes(e.source_frame));specific.right_group_event_deltas=eventMetrics.filter(e=>[1065,1079,1139,1155].includes(e.source_frame));specific.adjacent_hard_cut=diffMeasure(eventRaws.get(1163),eventRaws.get(1164),640,360,24);specific.manual_surface_content=spec.manual_surface_content;}
  const identitiesPath=path.join(sampleDir,'source-frame-identities.json');
  await writeFile(identitiesPath,json({sample_id:spec.id,extraction:'every source frame in exact selected window; declared secondary boundary frames are re-extracted only as exclusion/adjacency evidence',source:spec.source,window:{start_frame:spec.start,end_frame:spec.end,frame_count:spec.end-spec.start+1},secondary_frames:(spec.secondary??[]).map(([frame,label])=>({source_frame:frame,label})),frames:identities}));
  return {identitiesPath,stablePath,dynamicPath,eventRaws,measurements:{adjacent_change_summary:{pair_count:adjacent.length,median_mean_abs_rgb:+center.toFixed(6),mad:+mad.toFixed(6),shot_boundary_threshold:+threshold.toFixed(6),shot_boundary_candidates:boundaries},event_metrics:eventMetrics,specific}};
}

async function evidenceFrames(spec,sourceDir,sampleDir){
  const dir=path.join(sampleDir,'evidence');await mkdir(dir,{recursive:true});const rows=[];
  for(const [frame,label] of spec.events){const out=path.join(dir,`source-frame-${String(frame).padStart(6,'0')}-${label}.png`);await copyFile(frameFile(sourceDir,frame),out);rows.push({...await artifact(out,'source-frame-evidence'),source_frame:frame,source_time_seconds:+(frame/spec.source.fps).toFixed(6),label,probe_frame:mapSourceFrame(spec,frame)});}
  return rows;
}

async function buildMappedReference(spec,sourceDir,sampleDir,temp){
  const list=path.join(temp,`sample-${spec.number}-mapped.ffconcat`);const lines=['ffconcat version 1.0'];
  for(let probe=0;probe<300;probe++){
    let sourceFrame;
    if(spec.number===6){if(probe<=15)sourceFrame=711+probe;else if(probe<=29)sourceFrame=726;else if(probe===30)sourceFrame=370;else sourceFrame=371;}
    else sourceFrame=probe<=spec.actionEnd?Math.round(spec.start+probe*(spec.end-spec.start)/spec.actionEnd):spec.end;
    lines.push(`file '${frameFile(sourceDir,sourceFrame).replaceAll('\\','/')}'`,`duration ${1/30}`);
  }
  lines.push(`file '${frameFile(sourceDir,spec.number===6?371:spec.end).replaceAll('\\','/')}'`);await writeFile(list,lines.join('\n'));
  const out=path.join(sampleDir,`sample-${String(spec.number).padStart(2,'0')}-reference-mapped-provisional.mp4`);
  ffmpeg(['-f','concat','-safe','0','-i',list,'-frames:v','300','-r','30','-vf','scale=1920:1080:flags=lanczos','-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',out]);return out;
}

async function extractProbeRaws(video,frames,temp,prefix){
  const ordered=[...new Set(frames)].sort((a,b)=>a-b),dir=path.join(temp,`${prefix}-probe-raw`);await mkdir(dir,{recursive:true});
  const select=ordered.map(frame=>`eq(n\\,${frame})`).join('+');const pattern=path.join(dir,'frame-%06d.png');
  ffmpeg(['-i',video,'-vf',`select='${select}'`,'-vsync','0','-start_number','0',pattern]);
  const map=new Map();for(let i=0;i<ordered.length;i++)map.set(ordered[i],await rawImage(frameFile(dir,i)));return map;
}

async function extractProbePngs(video,frames,dir){
  await mkdir(dir,{recursive:true});const out=[];
  for(const frame of frames){const file=path.join(dir,`probe-frame-${String(frame).padStart(3,'0')}.png`);ffmpeg(['-i',video,'-vf',`select='eq(n\\,${frame})'`,'-vsync','0','-frames:v','1',file]);out.push(file);}return out;
}

async function labeledTile(file,width,height,label){
  const img=await sharp(file).resize(width,height,{fit:'contain',background:'#111'}).png().toBuffer();
  const svg=Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="17" fill="#000" fill-opacity=".76"/><text x="4" y="12" font-family="Arial" font-size="10" font-weight="700" fill="#fff">${label}</text></svg>`);
  return sharp(img).composite([{input:svg,left:0,top:0}]).png().toBuffer();
}

async function makeContact(spec,evidence,probePngs,out){
  const layers=[];
  for(let i=0;i<3;i++){
    const [sourceFrame,probeFrame]=spec.contact[i],ref=evidence.find(row=>row.source_frame===sourceFrame);
    layers.push({input:await labeledTile(path.join(ROOT,ref.path),120,101,`REF F${sourceFrame}`),left:i*120,top:0});
    layers.push({input:await labeledTile(probePngs[i],120,102,`PROBE F${probeFrame}`),left:i*120,top:101});
  }
  await sharp({create:{width:360,height:203,channels:3,background:'#111'}}).composite(layers).png().toFile(out);
}

async function buildSample(spec,temp){
  const sampleDir=path.join(OUT,spec.id);await mkdir(sampleDir,{recursive:true});
  const sourceDir=await extractSequence(spec,temp);const sourceAnalysis=await analyzeSource(spec,sourceDir,sampleDir);const evidence=await evidenceFrames(spec,sourceDir,sampleDir);
  const auditContractRel=`video/qa/reference-study/frame-accurate-motion-contract-v01/${spec.id}/contract.json`,auditContract=path.join(ROOT,auditContractRel);
  const analysis = {
    schema_version: 1,
    sample_id: spec.id,
    status: 'operator-inference-pending-human-review',
    production_authority: false,
    human_review_status: 'pending',
    source_binding: {...spec.source, window: {start_frame: spec.start, end_frame: spec.end, start_seconds: +(spec.start / spec.source.fps).toFixed(6), end_seconds: +(spec.end / spec.source.fps).toFixed(6)}},
    inherited_audit_locator: {path: auditContractRel, sha256: await shaFile(auditContract), authority: 'observation-locator-only; suite measurements supersede unmeasured assumptions'},
    method: {
      decoded_frame_scope: 'every source frame in selected exact window',
      automated: ['raw RGB identity', 'adjacent-frame mean/change fraction/bbox', 'shot-boundary candidate threshold from median+6*MAD with floor 18', 'aggregate stable/dynamic masks', 'sample-specific ROI/color/PCA/crop-correlation/translation-registration where applicable'],
      manual_review: ['semantic object role', 'occlusion/z-order interpretation', 'source text transcription where local OCR unavailable'],
    },
    time_mapping: {
      mode: spec.actionEnd === spec.end - spec.start ? 'one-source-frame-to-one-probe-frame' : 'explicit-linear-event-mapping',
      source: [spec.start, spec.end],
      probe: [0, spec.actionEnd],
      events: spec.events.map(([frame, label]) => ({label, source_frame: frame, probe_frame: mapSourceFrame(spec, frame)})),
      ...(spec.number === 6 ? {separate_event_mapping: [{source_frames: [711, 726], probe_frames: [0, 15]}, {source_frames: [370, 371], probe_frames: [30, 31]}]} : {}),
    },
    observed_facts: spec.observed,
    source_measurements: sourceAnalysis.measurements,
    operator_hypotheses: [{observed_fact: spec.observed.join('; '), candidate: spec.candidate, alternative: spec.alternatives, confidence: spec.confidence, evidence_frames: spec.events.map((event) => event[0]), error: 'Flattened MP4 contains no original layer, mask, easing, homography, or keyframe metadata; semantic target boundaries remain human-reviewed annotations.', human_review_status: 'pending'}],
    forbidden_substitutes: spec.forbidden,
    text_surface_contract: {allowed_roles: ['asset-label', 'surface-content', 'screen-chrome'], no_text_substitution: true, manual_surface_content: spec.manual_surface_content ?? []},
    uncertainties: spec.alternatives,
  };
  const analysisPath=path.join(sampleDir,'analysis.json'),hypothesisPath=path.join(sampleDir,'operator-hypotheses.json');await writeFile(analysisPath,json(analysis));await writeFile(hypothesisPath,json(analysis.operator_hypotheses));
  const reference=await buildMappedReference(spec,sourceDir,sampleDir,temp);
  const probe=path.join(sampleDir,`sample-${String(spec.number).padStart(2,'0')}-remotion-probe-provisional.mp4`);renderComposition({entry:ENTRY,composition:spec.composition,output:probe});
  const measurementFrames=[...probeFramesRequired[spec.number],spec.actionEnd,Math.max(spec.actionEnd,240),299];const probeRaws=await extractProbeRaws(probe,measurementFrames,temp,`sample-${spec.number}`);const probeMeasurements=measureProbeSample(spec.number,probeRaws);
  const measurementPath=path.join(sampleDir,'probe-render-measurements.json');await writeFile(measurementPath,json(probeMeasurements));
  const probePngDir=path.join(sampleDir,'probe-frames'),contactProbeFrames=spec.contact.map(row=>row[1]);const contactProbePngs=await extractProbePngs(probe,contactProbeFrames,probePngDir);
  const holdPngs=await extractProbePngs(probe,[spec.actionEnd,Math.max(spec.actionEnd,240),299],probePngDir);
  const side=path.join(sampleDir,`sample-${String(spec.number).padStart(2,'0')}-reference-vs-probe-provisional.mp4`);
  ffmpeg(['-i',reference,'-i',probe,'-filter_complex','[0:v]scale=960:540,pad=960:1080:0:270:0x111111[ref];[1:v]scale=960:540,pad=960:1080:0:270:0x111111[probe];[ref][probe]hstack=2[out]','-map','[out]','-frames:v','300','-r','30','-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',side]);
  const contact=path.join(sampleDir,`sample-${String(spec.number).padStart(2,'0')}-reference-vs-probe-contact-360x203.png`);await makeContact(spec,evidence,contactProbePngs,contact);
  const artifacts=[await artifact(sourceAnalysis.identitiesPath,'source-frame-identities'),await artifact(sourceAnalysis.stablePath,'source-stable-mask'),await artifact(sourceAnalysis.dynamicPath,'source-dynamic-mask'),await artifact(analysisPath,'analysis'),await artifact(hypothesisPath,'operator-hypotheses'),...evidence,await artifact(reference,'mapped-reference'),await artifact(probe,'remotion-probe'),await artifact(measurementPath,'probe-render-measurements'),...await Promise.all([...contactProbePngs,...holdPngs].map(file=>artifact(file,'probe-frame'))),await artifact(side,'reference-vs-probe'),await artifact(contact,'reference-vs-probe-contact-360x203')];
  return {sample_number:spec.number,sample_id:spec.id,status:'technical-probe-complete-pending-human-review',source:spec.source,window:{start_frame:spec.start,end_frame:spec.end,decoded_frame_count:spec.end-spec.start+1},time_mapping:analysis.time_mapping,analysis:artifacts.find(a=>a.kind==='analysis'),hypotheses:artifacts.find(a=>a.kind==='operator-hypotheses'),source_frame_identities:artifacts.find(a=>a.kind==='source-frame-identities'),source_masks:artifacts.filter(a=>a.kind.startsWith('source-')&&a.kind.endsWith('mask')),evidence_frames:evidence,probe:{...artifacts.find(a=>a.kind==='remotion-probe'),composition_id:spec.composition,width:WIDTH,height:HEIGHT,fps:FPS,duration_in_frames:300,action_end_frame:spec.actionEnd,hold:{start_frame:spec.actionEnd,minimum_frames:300-spec.actionEnd,checked_frames:[spec.actionEnd,Math.max(spec.actionEnd,240),299]}},probe_measurements:artifacts.find(a=>a.kind==='probe-render-measurements'),mapped_reference:artifacts.find(a=>a.kind==='mapped-reference'),side_by_side:artifacts.find(a=>a.kind==='reference-vs-probe'),mobile_contact:artifacts.find(a=>a.kind==='reference-vs-probe-contact-360x203'),contact_layout:{canvas:[360,203],columns:3,reference_cell:[120,101],probe_cell:[120,102],source_frame_aspect_ratio:'16:9',fit:'contain',letterbox_background:'#111',label_height:17,label_source:'exact spec.contact source/probe frame pair'},contact_inputs:spec.contact.map(([sourceFrame,probeFrame],i)=>({source_frame:sourceFrame,probe_frame:probeFrame,source_path:evidence.find(row=>row.source_frame===sourceFrame).path,probe_path:rel(contactProbePngs[i])})),artifacts};
}

async function main(){
  const resolved=path.resolve(OUT),allowed=path.resolve(ROOT,'video/qa/reference-study/motion-reverse-engineering-suite-v01');if(resolved!==allowed)throw new Error('refusing unexpected suite output path');
  await rm(OUT,{recursive:true,force:true});await mkdir(OUT,{recursive:true});const temp=await mkdtemp(path.join(os.tmpdir(),'motion-reverse-suite-'));
  try{
    for(const spec of suiteSpecs)if(await shaFile(path.join(ROOT,spec.source.path))!==spec.source.sha256)throw new Error(`${spec.id}: source hash mismatch`);
    if(await shaFile(path.join(ROOT,INHERITED_PILOT_MANIFEST_REL))!==INHERITED_PILOT_MANIFEST_SHA256)throw new Error('inherited 02/03 pilot manifest changed');
    const samples=[];for(const spec of suiteSpecs){process.stdout.write(`Analyzing/rendering ${spec.id}...\n`);samples.push(await buildSample(spec,temp));}
    const inheritedManifest=JSON.parse(await readFile(path.join(ROOT,INHERITED_PILOT_MANIFEST_REL),'utf8'));
    const inheritedSamples=inheritedManifest.samples.map(sample=>({sample_id:sample.sample_id,inheritance:'immutable-by-path-and-hash',pilot_manifest_path:INHERITED_PILOT_MANIFEST_REL,pilot_manifest_sha256:INHERITED_PILOT_MANIFEST_SHA256,pilot_bundle_sha256:inheritedManifest.artifact_bundle_sha256,probe:{path:sample.probe.path,sha256:sample.probe.sha256},side_by_side:{path:sample.side_by_side.path,sha256:sample.side_by_side.sha256},mobile_contact:{path:sample.mobile_contact.path,sha256:sample.mobile_contact.sha256}}));
    const allArtifacts=samples.flatMap(sample=>sample.artifacts);const bundle=sha(Buffer.from(allArtifacts.map(a=>`${a.kind}|${a.path}|${a.sha256}`).sort().join('\n')));
    const manifest={schema_version:1,package_id:'motion-reverse-engineering-suite-v01',status:'technical-suite-complete-pending-human-review',purpose:'aggregate all ten sample families while inheriting completed 02/03 without modification',production_authority:false,production_eligible:false,grammar_promoted:false,human_pass:false,active_cut_root:null,runtime:{entry:{path:ENTRY_REL,sha256:await shaFile(path.join(ROOT,ENTRY_REL))},source:{path:RUNTIME_REL,sha256:await shaFile(path.join(ROOT,RUNTIME_REL))},measurement:{path:MEASUREMENT_REL,sha256:await shaFile(path.join(ROOT,MEASUREMENT_REL))}},inherited_pilot:{manifest_path:INHERITED_PILOT_MANIFEST_REL,manifest_sha256:INHERITED_PILOT_MANIFEST_SHA256,bundle_sha256:inheritedManifest.artifact_bundle_sha256,samples:inheritedSamples},new_samples:samples.map(({artifacts,...sample})=>sample),artifacts:allArtifacts,artifact_count:allArtifacts.length,artifact_bundle_sha256:bundle,limitations:['Original hidden authoring layers/keyframes/easing are unavailable.','Operator candidates are ranked from flattened-pixel evidence and remain pending human review.','Technique probes intentionally test operator scope rather than source-specific visual styling.','No probe, comparison, contact, or automated validator grants reference-calibration PASS or production authority.']};
    await writeFile(path.join(OUT,'manifest.json'),json(manifest));await writeFile(path.join(OUT,'README.md'),'# Motion reverse-engineering suite v01\n\nSeparate aggregate for samples 01–10. Samples 02/03 are inherited by immutable pilot manifest path/hash; samples 01/04–10 have exact source-frame identities, measured operator hypotheses, minimal 300f Remotion probes, synchronized side-by-side artifacts, and 360×203 contacts. Pending human review; no production, PASS, grammar-promotion, Omni, or active-root authority.\n');
    process.stdout.write(`Built ${SUITE_ROOT_REL}: 8 new samples, ${allArtifacts.length} bound artifacts; inherited 02/03 unchanged.\n`);
  }finally{await rm(temp,{recursive:true,force:true});}
}

await main();
