import {cp,mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {CONTACT_HEIGHT,CONTACT_WIDTH,RENDERER_RECIPE_ID,RENDERER_RECIPE_PATH,renderBlockedContactBuffer,renderBoardBuffer,renderContactBuffer,renderStyleFrameBuffers} from './lib/grammar-bound-style-frame-renderer-v08.mjs';

const root=process.cwd();
const v07Rel='video/qa/style-frames/episode-001/reference-style-families-v07';
const outRel='video/qa/style-frames/episode-001/reference-style-families-v08';
const out=path.join(root,outRel), sha=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const fileSha=async p=>sha(await readFile(p));
const writeJson=async(p,v)=>writeFile(p,`${JSON.stringify(v,null,2)}\n`);
const rel=p=>path.relative(root,p).replaceAll('\\','/');
const exists=async p=>{try{await stat(p);return true;}catch{return false;}};
await rm(out,{recursive:true,force:true}); await mkdir(out,{recursive:true});
const spec=await read('video/episodes/episode-001/episode-spec.json');
const oldIndex=await read(path.join(root,v07Rel,'family-index.json'));
const specBind={path:'video/episodes/episode-001/episode-spec.json',sha256:await fileSha(path.join(root,'video/episodes/episode-001/episode-spec.json'))};
const grammarBind={path:'video/episodes/episode-001/reference-grammar-contract.json',sha256:await fileSha(path.join(root,'video/episodes/episode-001/reference-grammar-contract.json'))};
const rendererSha=await fileSha(path.join(root,RENDERER_RECIPE_PATH));
const v07Hist={path:`${v07Rel}/family-index.json`,sha256:await fileSha(path.join(root,v07Rel,'family-index.json')),authority:'historical-human-review-failed',used_as_render_input:false};
const sourceDefs={
 'news-a':{source:'video/source-intake/episode-001/news/news-yna-20260729-title-and-qa.png',extract:{left:0,top:0,width:1100,height:360},id:'NEWS-YNA-20260729'},
 'news-b':{source:'video/source-intake/episode-001/news/news-yna-20260804-title-and-effective-date.png',extract:{left:0,top:0,width:1100,height:360},id:'NEWS-YNA-20260804'},
 'law-delete':{source:'video/source-intake/episode-001/official/law-196-delete.png',extract:{left:0,top:0,width:1000,height:360},id:'LAW-196-DELETE'},
 'law-roles':{source:'video/source-intake/episode-001/official/law-195-role-split.png',extract:{left:0,top:0,width:1000,height:320},id:'LAW-195-ROLE-SPLIT'},
 'chart':{source:'video/source-intake/episode-001/official/law-trans-90-day.png',extract:{left:0,top:0,width:1000,height:340},id:'LAW-TRANS-90-DAY'},
};
const material={};
for(const [key,s] of Object.entries(sourceDefs)){const p=path.join(out,'source-inputs',`${key}-tight.png`);await mkdir(path.dirname(p),{recursive:true});await sharp(path.join(root,s.source)).extract(s.extract).png({compressionLevel:9,adaptiveFiltering:false}).toFile(p);material[key]={path:rel(p),sha256:await fileSha(p),source:s};}
const shotMap=new Map(spec.cuts.map(c=>[c.shot_id,c]));
const shot=id=>{const c=shotMap.get(id);return {shot_id:id,production_mode:c.production_mode,viewer_takeaway:c.viewer_takeaway,cut_sha256:sha(Buffer.from(JSON.stringify(c)))};};
const sourceKey=id=>({'news-a':'news-a','news-b':'news-b','law-delete':'law-delete','law-roles':'law-roles','chart':'chart'}[id]);
const frameBox=(family,i)=>family==='hook-source-collage'&&i===2?{left:60,top:170,width:1800,height:700}:family==='law-document-editorial'?(i===0?{left:40,top:140,width:1840,height:700}:i===1?{left:500,top:180,width:1380,height:650}:{left:500,top:150,width:1380,height:690}):family==='time-data-editorial'?(i===0?{left:40,top:150,width:1840,height:700}:i===1?{left:40,top:180,width:1120,height:650}:{left:40,top:220,width:1120,height:650}):null;
const upgradeFrame=async(family,sourceFrame,i)=>{
 const f=structuredClone(sourceFrame); f.frame_id=f.frame_id.replace(/-v07$/u,'-v08'); f.render_recipe.recipe_id=RENDERER_RECIPE_ID; f.render_recipe.renderer_sha256=rendererSha;
 for(const input of f.inputs){const key=sourceKey(input.asset_id);if(key){Object.assign(input,{path:material[key].path,sha256:material[key].sha256,asset_provenance:{...input.asset_provenance,source_path:material[key].source.source}});}input.renderer_recipe_sha256=rendererSha;}
 const inputBy=new Map(f.inputs.map(x=>[x.asset_id,x]));
 for(const layer of f.render_recipe.layers){const input=inputBy.get(layer.asset_id);if(input){layer.path=input.path;layer.sha256=input.sha256;}}
 for(const asset of f.geometry.assets){const layer=f.render_recipe.layers.find(x=>x.asset_id===asset.id);if(layer)asset.bbox=layer.bbox;}
 if(family==='hook-source-collage'&&i===2){const b=frameBox(family,i);f.render_recipe.layers[0].bbox=b;f.geometry.assets[0].bbox=b;}
 if(family==='law-document-editorial'){const first=frameBox(family,i);f.render_recipe.layers[0].bbox=first;f.geometry.assets.find(x=>x.id===f.render_recipe.layers[0].asset_id).bbox=first;if(i>0){const b=i===1?{left:500,top:180,width:1380,height:650}:{left:500,top:150,width:1380,height:690};f.render_recipe.layers[1].bbox=b;f.geometry.assets.find(x=>x.id===f.render_recipe.layers[1].asset_id).bbox=b;}}
 if(family==='time-data-editorial'){
   const chart=frameBox(family,i);f.render_recipe.layers.find(x=>x.asset_id==='chart').bbox=chart;f.geometry.assets.find(x=>x.id==='chart').bbox=chart;
   if(i>0){const b=i===1?{left:1200,top:200,width:680,height:640}:{left:1000,top:130,width:860,height:760};const other=f.render_recipe.layers.find(x=>x.asset_id==='chart-effective');if(other){other.bbox=b;f.geometry.assets.find(x=>x.id==='chart-effective').bbox=b;}}
   const day=i===0?0:i===1?45:90,start=chart.left+120,end=chart.left+chart.width-120,y=chart.top+chart.height-130;
   f.geometry.texts=[{id:`surface-day-${day}`,semantic_role:'surface-content',placement:'on-surface',host_surface_asset_id:'chart',target_id:'chart',text:`${day}일`,bbox:{left:start,top:chart.top+40,width:180,height:90},rotation_deg:0,font_size_px:72,fill:'#b42318'}];
   f.geometry.progress_overlays=[{id:`surface-progress-${day}`,host_surface_asset_id:'chart',x1:start,y1:y,x2:start+(end-start)*(day/90),y2:y,stroke:'#b42318',stroke_width:12,marker_radius:14,meaning:'episode LAW-TRANS-90-DAY source-bound elapsed-day progress'}];
   f.geometry.deterministic_overlays=['source-bound-progress-overlay'];f.semantic_fidelity.host_surface_asset_id='chart';f.semantic_fidelity.surface_content_host='chart';
 }
 f.output=f.output.replaceAll('reference-style-families-v07','reference-style-families-v08').replaceAll('-v07-','-v08-');f.mobile=f.mobile.replaceAll('reference-style-families-v07','reference-style-families-v08').replaceAll('-v07-','-v08-');
 const rendered=await renderStyleFrameBuffers({root,frame:f});await mkdir(path.dirname(path.join(root,f.output)),{recursive:true});await writeFile(path.join(root,f.output),rendered.wide);await writeFile(path.join(root,f.mobile),rendered.mobile);f.output_sha256=await fileSha(path.join(root,f.output));f.mobile_sha256=await fileSha(path.join(root,f.mobile));return f;
};
const rows=[];
for(const oldRow of oldIndex.families){const oldManifest=await read(path.join(root,oldRow.path));const m=structuredClone(oldManifest);m.schema_version=8;m.candidate_id=`${m.family_id}-v08`;m.v07_history=v07Hist;m.v06_history=v07Hist;m.v05_history=v07Hist;m.v04_history=v07Hist;m.episode_spec_binding=specBind;m.reference_grammar_contract=grammarBind;m.renderer_recipe={recipe_id:RENDERER_RECIPE_ID,path:RENDERER_RECIPE_PATH,sha256:rendererSha};
 const familyDir=path.join(out,path.basename(path.dirname(oldRow.path)).replace(/-v07$/u,'-v08'));await mkdir(path.join(familyDir,'outputs'),{recursive:true});
 if(oldManifest.frames.length){m.frames=[];for(let i=0;i<oldManifest.frames.length;i++)m.frames.push(await upgradeFrame(m.family_id,oldManifest.frames[i],i));m.contact.path=m.contact.path.replaceAll('reference-style-families-v07','reference-style-families-v08').replace(/-v07-/gu,'-v08-').replace(/-v07(?=\/)/gu,'-v08');await writeFile(path.join(root,m.contact.path),await renderContactBuffer({root,familyId:m.family_id,frames:m.frames}));m.contact.sha256=await fileSha(path.join(root,m.contact.path));const inputRows=[...new Map(m.frames.flatMap(f=>f.inputs.map(x=>[`${x.path}|${x.sha256}`,{kind:'visual-input',path:x.path,sha256:x.sha256}]))).values(),{kind:'renderer-recipe',path:RENDERER_RECIPE_PATH,sha256:rendererSha}].sort((a,b)=>`${a.kind}|${a.path}`.localeCompare(`${b.kind}|${b.path}`));m.exact_input_bundle={rows:inputRows,sha256:sha(Buffer.from(inputRows.map(x=>`${x.kind}|${x.path}|${x.sha256}`).join('\n')))};}else{m.contact.path=m.contact.path.replaceAll('reference-style-families-v07','reference-style-families-v08').replace(/-v07-/gu,'-v08-').replace(/-v07(?=\/)/gu,'-v08');await writeFile(path.join(root,m.contact.path),await renderBlockedContactBuffer({familyId:m.family_id,blockers:m.blockers.map(x=>x.reason)}));m.contact.sha256=await fileSha(path.join(root,m.contact.path));}
 const mp=path.join(familyDir,'manifest.json');await writeJson(mp,m);rows.push({family_id:m.family_id,status:m.status,review_profile:m.review_profile,path:rel(mp),sha256:await fileSha(mp),contact:m.contact,representative_shot_ids:m.representative_shots.map(x=>x.shot_id),sample_numbers:m.transfer_matrix_sample_numbers??[],blocker_ids:(m.blockers??[]).map(x=>x.blocker_id)});
}
rows.sort((a,b)=>oldIndex.families.findIndex(x=>x.family_id===a.family_id)-oldIndex.families.findIndex(x=>x.family_id===b.family_id));
const board=path.join(out,'EP001-episode-source-only-six-family-review-board-v08.png');await writeFile(board,await renderBoardBuffer({root,rows}));
const index={...oldIndex,schema_version:8,candidate_set_id:'episode-001-episode-source-only-six-family-v08',families:rows,renderer_recipe:{recipe_id:RENDERER_RECIPE_ID,path:RENDERER_RECIPE_PATH,sha256:rendererSha},v07_history:v07Hist,v06_history:v07Hist,v05_history:v07Hist,v04_history:v07Hist,review_board:{path:rel(board),sha256:await fileSha(board),dimensions:{width:1920,height:110+rows.length*548},visible_labels:{candidate_set_id:'episode-001-episode-source-only-six-family-v08',family_ids:rows.map(x=>x.family_id),states:['opening','evidence-or-change','final-summary'],blocked_label:'BLOCKED — NOT A REVIEW SURFACE'}},semantic_fidelity_gate:{version:2,episode_source_allowlist:['NEWS-YNA-20260729','NEWS-YNA-20260804','NEWS-YNA-20260804-EFFECTIVE-DATE','LAW-196-DELETE','LAW-195-ROLE-SPLIT','LAW-TRANS-90-DAY','PEXELS-DOSSIER-4792288','WIKIMEDIA-POLICE-3243833'],surface_content_requires_host:true,detached_text_box_focal:false,rasterized_deterministic_text_focal:false,geometry_texts_empty_bypass_rejected:true},active_cut_root:null};await writeJson(path.join(out,'family-index.json'),index);
const gates=await read('video/episodes/episode-001/reference-style-gates.json');gates.status=index.status;gates.reference_calibration={...gates.reference_calibration,next_gate:'complete-v08-required-source-inputs',eligible_for_user_style_frame_review:false};for(const f of gates.visual_families){const r=rows.find(x=>x.family_id===f.family_id);Object.assign(f,{candidate_manifest:r.path,candidate_manifest_sha256:r.sha256,contact:r.contact.path,contact_sha256:r.contact.sha256,user_approved:false,review_ready:false,inputs_complete:r.status==='candidate-built-blocked-until-all-six-families-ready',blockers:r.blocker_ids});}await writeJson(path.join(root,'video/episodes/episode-001/reference-style-gates.json'),gates);
const state=await read('video/episodes/episode-001/production-state.json');state.reference_calibration={...state.reference_calibration,note:'v06/v07 failed human visual review. v08 uses episode-specific source surfaces; time-data carries source-bound 0/45/90 day overlays inside official LAW-TRANS-90-DAY.'};state.style_frame_review={...state.style_frame_review,candidate_id:index.candidate_set_id,manifest:rel(path.join(out,'family-index.json')),manifest_sha256:await fileSha(path.join(out,'family-index.json')),user_approved:false,blockers:index.blockers};state.reference_style_gates={...state.reference_style_gates,status:index.status,candidate_index:rel(path.join(out,'family-index.json')),candidate_index_sha256:await fileSha(path.join(out,'family-index.json')),pending_family_ids:rows.map(x=>x.family_id),blocked_family_ids:rows.filter(x=>x.status.startsWith('blocked')).map(x=>x.family_id),approved_family_ids:[]};state.stage='timing-draft';state.active_cut_root=null;await writeJson(path.join(root,'video/episodes/episode-001/production-state.json'),state);
console.log(JSON.stringify({candidate_set:index.candidate_set_id,index_sha256:await fileSha(path.join(out,'family-index.json')),board:index.review_board,built:4,blocked:2,transfer_samples:9},null,2));
