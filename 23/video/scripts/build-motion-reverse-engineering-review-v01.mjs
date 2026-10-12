import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdir,mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';

const ROOT=process.cwd();
const SUITE_REL='video/qa/reference-study/motion-reverse-engineering-suite-v01/manifest.json';
const PILOT_REL='video/qa/reference-study/motion-reverse-engineering-pilot-v01/manifest.json';
const OUT_REL='video/qa/reference-study/motion-reverse-engineering-review-v01';
const OUT=path.join(ROOT,OUT_REL);
const sha=b=>createHash('sha256').update(b).digest('hex');
const shaFile=async f=>sha(await readFile(f));
const rel=f=>path.relative(ROOT,f).replaceAll('\\','/');
const json=value=>`${JSON.stringify(value,null,2)}\n`;
function run(command,args,{capture=false}={}){const result=spawnSync(command,args,{cwd:ROOT,encoding:capture?'utf8':undefined,windowsHide:true,stdio:capture?'pipe':'ignore'});if(result.status!==0)throw new Error(`${command} failed (${result.status})`);return capture?result.stdout:'';}
function ffmpeg(args){run('ffmpeg',['-hide_banner','-loglevel','error','-y',...args]);}
function probe(file){const out=run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_frames,duration','-of','json',file],{capture:true});return JSON.parse(out).streams?.[0]??null;}
function xml(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
async function artifact(file,kind){const info=await stat(file);return {kind,path:rel(file),sha256:await shaFile(file),bytes:info.size};}

function sampleRows(suite,pilot){
  const inherited=new Map(pilot.samples.map(s=>[s.sample_id,s]));
  const rows=[];
  for(const number of [1,2,3,4,5,6,7,8,9,10]){
    const id=number===2||number===3?`sample-0${number}-${number===2?'numeric-step-progression':'chart-reveal'}`:suite.new_samples.find(s=>s.sample_number===number)?.sample_id;
    const s=suite.new_samples.find(x=>x.sample_number===number)||inherited.get(id);
    if(!s)throw new Error(`missing sample ${number}`);
    const a=s.analysis?JSON.parse(readFileSync(path.join(ROOT,s.analysis.path),'utf8')):null;
    const sampleDir=s.analysis.path.slice(0,s.analysis.path.lastIndexOf('/'));
    const allProbeFrames=number===2||number===3?(s.probe_frames??[]):(suite.artifacts??[]).filter(item=>item.kind==='probe-frame'&&item.path.startsWith(`${sampleDir}/`)).map(item=>item);
    const evidencePaths=[...(s.evidence_frames??[]),...allProbeFrames].map(item=>typeof item==='string'?item:item.path);
    const sourceStart=s.window?.start_frame??s.time_mapping.source_start_frame;
    const sourceEnd=s.window?.end_frame??s.time_mapping.source_end_frame;
    const events=s.time_mapping.events??s.time_mapping.event_pairs;
    const action=s.probe.action_end_frame;
    rows.push({
      sample_number:number,sample_id:id,inheritance:number===2||number===3?'pilot':'suite',
      source_path:s.source?.path??'raw/inbox/vox-style-claude-remotion-reference.mp4',
      source_frames:[sourceStart,sourceEnd],
      exact_events:events.map(e=>({label:e.label,source_frame:e.source_frame,probe_frame:e.probe_frame})),
      analysis_path:s.analysis.path,probe_path:s.probe.path,side_by_side_path:(s.side_by_side??s.side).path,
      contact_path:(s.mobile_contact??s.mobile).path,
      contact_inputs:s.contact_inputs??s.time_mapping.contact_pairs,
      evidence_paths:[...new Set(evidencePaths)],
      contact_layout:{canvas:[360,203],columns:3,reference_cell:[120,101],probe_cell:[120,102],source_frame_aspect_ratio:'16:9',fit:'contain',letterbox_background:'#111',label_height:17,label_source:'exact upstream contact source/probe frame pair'},
      action_end_frame:action,hold_start_frame:s.probe.hold.start_frame,hold_minimum_frames:s.probe.hold.minimum_frames,
      focal_identity:({1:'building with two independently entering people',2:'tanker asset with source-bound numeric group',3:'chart shell with plot-local series',4:'continuous geography map and local route/event overlays',5:'preserved map object becoming focal as chart exits',6:'complete scene parent including background/chrome',7:'speaker/gallery/title phase sequence',8:'fixed presenter with bilateral evidence overlays',9:'angled phone shell and inside-screen states',10:'snack and phone value groups'})[number],
      motion_scope:({1:'independent asset reveal and z-order accumulation',2:'asset-preserving numeric rise/fade/count-up',3:'shell settle followed by plot-only series draw',4:'registered map pan/zoom with local overlay lifecycles',5:'independent chart exit and preserved map reframe',6:'exhaustive parent left exit then adjacent hard cut',7:'phase-owned overlay/gallery/title state changes and two hard cuts',8:'stable presenter plate with independent overlay entries',9:'phone surface-local value/percentage/chart progression',10:'independent object/value entries followed by hard cut'})[number],
      transition:({1:'continuous accumulation',2:'continuous state progression',3:'continuous shell then plot reveal',4:'continuous registered movement; local flash',5:'continuous layout reframe',6:'left exit; adjacent hard cut',7:'hard cuts F107→108 and F227→228',8:'continuous overlay entries',9:'continuous device segment; F155→156 excluded hard cut',10:'adjacent hard cut F1163→1164'})[number],
      text_rule:'supplemental labels only; source/evidence surface-content remains source-bound; never substitute missing visual evidence',
      analysis_candidate:a?.operator_hypotheses?.[0]?.candidate??({2:'tanker internal motion plus numeric group rise/fade and framewise count-up',3:'fixed chart shell with plot-local series draw'}[number]),
      review_checklist:{focal_identity:'pending',motion_scope:'pending',transition:'pending',text_supplemental_non_substitution:'pending',stable_hold_60f:'pending'},
      human_status:'pending',production_eligible:false,human_pass:false,grammar_promoted:false
    });
  }
  return rows;
}

async function makeBoard(rows,out){
  const W=1920,H=1080,CW=960,RH=216,thumbW=360,thumbH=203;
  let svg=`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#090b0e"/>`;
  const layers=[];
  for(const row of rows){
    const col=(row.sample_number-1)%2, r=Math.floor((row.sample_number-1)/2), x=col*CW,y=r*RH;
    svg+=`<rect x="${x+2}" y="${y+2}" width="${CW-4}" height="${RH-4}" rx="8" fill="#11151a" stroke="#303840"/>`;
    svg+=`<text x="${x+392}" y="${y+29}" fill="#f2f5f7" font-family="Arial" font-size="22" font-weight="700">${xml(`SAMPLE ${String(row.sample_number).padStart(2,'0')} · ${row.sample_id.replace(/^sample-\d+-/,'')}`)}</text>`;
    const lines=[`source F${row.source_frames[0]}–F${row.source_frames[1]} · probe action F${row.action_end_frame}`,`hold F${row.hold_start_frame} · minimum ${row.hold_minimum_frames}f`,`focal: ${row.focal_identity}`,`motion: ${row.motion_scope}`,`transition: ${row.transition}`,row.inheritance==='pilot'?'inherited pilot binding (immutable path/hash)':'suite sample · pending human review'];
    lines.forEach((line,i)=>{svg+=`<text x="${x+392}" y="${y+57+i*24}" fill="${i===5?'#e9ae54':'#c7d0d9'}" font-family="Arial" font-size="16">${xml(line)}</text>`;});
    const contact=path.join(ROOT,row.contact_path);layers.push({input:await sharp(contact).resize(thumbW,thumbH,{fit:'contain',background:'#111'}).png().toBuffer(),left:x+16,top:y+7});
  }
  svg+='</svg>';
  await sharp(Buffer.from(svg)).composite(layers).png().toFile(out);
}

async function makeReel(rows,out,temp){
  const processed=[];
  for(const row of rows){
    const input=path.join(ROOT,row.side_by_side_path),meta=probe(input);
    if(!meta||Number(meta.width)!==1920||Number(meta.height)!==1080||meta.avg_frame_rate!=='30/1'||Number(meta.nb_frames)!==300)throw new Error(`side-by-side metadata mismatch: ${row.sample_id}`);
    const target=path.join(temp,`sample-${String(row.sample_number).padStart(2,'0')}.mp4`);
    const label=`SAMPLE ${String(row.sample_number).padStart(2,'0')}  ${row.sample_id.replace(/^sample-\d+-/,'')}`;
    const filter=`drawbox=x=0:y=0:w=iw:h=64:color=0x090b0e@0.92:t=fill:enable='lte(n,44)',drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='${label.replaceAll("'","\\\\'")}':x=24:y=20:fontsize=24:fontcolor=white:enable='lte(n,44)'`;
    ffmpeg(['-i',input,'-vf',filter,'-frames:v','300','-r','30','-an','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p',target]);
    processed.push(target);
  }
  const list=path.join(temp,'review.ffconcat');
  await writeFile(list,['ffconcat version 1.0',...processed.map(f=>`file '${f.replaceAll('\\','/')}'`)].join('\n'));
  ffmpeg(['-f','concat','-safe','0','-i',list,'-r','30','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',out]);
}

async function main(){
  const suite=JSON.parse(await readFile(path.join(ROOT,SUITE_REL),'utf8')),pilot=JSON.parse(await readFile(path.join(ROOT,PILOT_REL),'utf8'));
  await rm(OUT,{recursive:true,force:true});await mkdir(OUT,{recursive:true});
  const temp=await mkdtemp(path.join(os.tmpdir(),'motion-reverse-review-'));
  try{
    const rows=sampleRows(suite,pilot),board=path.join(OUT,'review-board-1920x1080.png'),reel=path.join(OUT,'review-reel-provisional.mp4');
    await makeBoard(rows,board);await makeReel(rows,reel,temp);
    const inputMap=new Map(),addInput=async(file,kind,sample_number,frame)=>{const key=rel(file);if(!inputMap.has(key))inputMap.set(key,{...await artifact(file,kind),sample_number, ...(frame?{frame}: {})});};
    for(const row of rows){for(const key of ['analysis_path','probe_path','side_by_side_path','contact_path'])await addInput(path.join(ROOT,row[key]),key.replace('_path',''),row.sample_number);for(const item of row.contact_inputs)for(const key of ['source_path','probe_path'])await addInput(path.join(ROOT,item[key]),key.replace('_path',''),row.sample_number,{source_frame:item.source_frame,probe_frame:item.probe_frame});for(const p of row.evidence_paths)await addInput(path.join(ROOT,p),'evidence-frame',row.sample_number);}
    const inputs=[...inputMap.values()];
    const canonical_sample_map=rows.map(r=>({sample_number:r.sample_number,sample_id:r.sample_id,inheritance:r.inheritance}));
    const manifest={schema_version:1,package_id:'motion-reverse-engineering-review-v01',status:'pending-human-reference-calibration-review',purpose:'sequential human review handoff for exact 01–10 reverse-engineering probes',production_authority:false,production_eligible:false,human_pass:false,grammar_promoted:false,active_cut_root:null,human_status:'pending',suite:{manifest_path:SUITE_REL,manifest_sha256:await shaFile(path.join(ROOT,SUITE_REL))},inherited_pilot:{manifest_path:PILOT_REL,manifest_sha256:await shaFile(path.join(ROOT,PILOT_REL)),sample_ids:['sample-02-numeric-step-progression','sample-03-chart-reveal']},canonical_sample_map,board:{kind:'review-board',path:rel(board),sha256:await shaFile(board),width:1920,height:1080,layout:'2 columns × 5 rows; each contact is fit=contain at native 360×203 ratio'},reel:{kind:'sequential-review-reel',path:rel(reel),sha256:await shaFile(reel),width:1920,height:1080,fps:30,duration_in_frames:3000,sample_order:rows.map(r=>r.sample_number),separator:'top screen-chrome bar for first 45 frames of each 300-frame segment',pixel_parity:{comparison_resolution:[192,108],first_45f_exempt_top_px:64,mean_abs_rgb_max:20,max_frame_mean_abs_rgb_max:28}},samples:rows,inputs,limitations:['Flattened MP4s cannot expose original layer files, keyframes, easing, or hidden authoring metadata.','This package records pending human review only; it does not record user approval or unlock production.','Reel separators are review screen-chrome and do not alter or replace any linked side-by-side input.'],artifact_bundle_sha256:sha(Buffer.from(inputs.map(i=>`${i.kind}|${i.path}|${i.sha256}`).sort().join('\n')))};
    await writeFile(path.join(OUT,'manifest.json'),json(manifest));
    await writeFile(path.join(OUT,'README.md'),'# 10개 레퍼런스 역설계 인간 검수 패키지\n\n이 패키지는 1번부터 10번까지 원본 프레임·Remotion 프로브·side-by-side·contact를 순서대로 검수하기 위한 임시 산출물입니다. 각 샘플의 `review_checklist`에서 focal identity, motion scope, transition, text supplemental/non-substitution, 60프레임 이상 hold를 확인해 주세요.\n\n각 항목을 PASS 또는 FAIL로 판단한 뒤 결과를 알려 주세요. 이 파일과 manifest는 사용자의 승인 결과를 미리 기록하지 않으며, 현재 `human_status=pending`, production/PASS/grammar promotion 플래그는 모두 false입니다.\n\n- [검수 보드](./review-board-1920x1080.png)\n- [순차 검수 릴](./review-reel-provisional.mp4)\n- [manifest](./manifest.json)\n\n검수 순서: Sample 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10. 릴의 각 10초 구간 상단에 샘플 구분용 screen-chrome이 표시됩니다. 원본 side-by-side 영상은 수정하지 않았습니다.\n');
    process.stdout.write(`Built ${OUT_REL}: board ${await shaFile(board)}, reel ${await shaFile(reel)}\n`);
  }finally{await rm(temp,{recursive:true,force:true});}
}
export {sampleRows,makeBoard};
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)await main();
