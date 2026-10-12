import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {buildOfficialRecaptureReview, PACKAGE_ROOT} from './build-episode-001-official-recapture-review.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const DECISIONS = ['source_identity','content_scope','locator','visual_readability','rights','use_of_ui'];
const exact = (left,right) => JSON.stringify(left) === JSON.stringify(right);

export async function validateOfficialRecaptureReview({root=process.cwd(), manifest:providedManifest} = {}) {
  const failures=[];
  const must=(value,message)=>{if(!value) failures.push(message);};
  const expected=await buildOfficialRecaptureReview({root,write:false});
  const actual=providedManifest ?? JSON.parse(fs.readFileSync(path.resolve(root,PACKAGE_ROOT,'manifest.json'),'utf8'));
  must(actual?.schema_version===1 && actual?.package_id==='episode-001-official-recapture-v03-human-review-v1' && actual?.status==='historical-evidence-only','review package identity/status mismatch');
  must(actual?.production_eligibility==='permanently-ineligible-capture-containing-rendered-text'
    && actual?.capture_pixels_evidence_only===true && actual?.style_frame_pixel_input_allowed===false
    && actual?.production_visible_allowed===false && actual?.motion_target_allowed===false,
  'rendered-text recapture package must remain permanently evidence-only and pixel-ineligible');
  must(actual?.human_approval===false && actual?.source_approved===false && actual?.rights_approved===false && actual?.registry_replacement===false && actual?.materialized===false && actual?.production_authority===false,'review package cannot claim approval, replacement, materialization or production authority');
  must(actual?.rights_research?.legal_advice===false && actual?.rights_research?.status==='official-primary-sources-reviewed-rights-still-pending','rights research must remain non-legal-advice and pending');
  const urls=Object.values(actual?.rights_research?.sources??{}).map((source)=>source.official_url);
  must(urls.length===3 && urls.every((url)=>/^https:\/\/(?:www\.)?(?:law\.go\.kr|moleg\.go\.kr)\//u.test(url)),'rights research must use only exact official law.go.kr/moleg.go.kr sources');
  must(exact(actual?.required_human_decision_fields,DECISIONS),'required human decision fields drift');
  for(const item of actual?.items??[]){
    const label=item?.old_candidate?.source_id??'unknown';
    must(exact(Object.keys(item?.human_decisions??{}),DECISIONS),`${label}: all six human decision fields are required in order`);
    for(const field of DECISIONS) must(item?.human_decisions?.[field]?.status==='pending' && item?.human_decisions?.[field]?.pass===false && item?.human_decisions?.[field]?.reviewer===null,`${label}/${field}: decision must remain pending and false`);
    must(item?.new_candidate?.registered===false && item?.new_candidate?.status==='unapproved-source-candidate',`${label}: v03 must remain an unregistered source candidate`);
    must(item?.comparison?.locator_visible_in_v03===true && item?.new_candidate?.locator_evidence?.matched_text===item?.new_candidate?.matched_text,`${label}: exact visible locator evidence missing`);
    must(item?.old_candidate?.actual_mime==='image/jpeg' && item?.old_candidate?.extension==='.png' && item?.old_candidate?.mime_extension_consistent===false,`${label}: legacy JPEG payload/PNG extension mismatch must remain explicit`);
    must(item?.new_candidate?.actual_mime==='image/png' && item?.new_candidate?.extension==='.png' && item?.new_candidate?.mime_extension_consistent===true,`${label}: v03 MIME/extension must be truthful`);
    must(item?.content_rights_boundary?.legal_text?.status==='pending-human-content-scope-review' && item?.content_rights_boundary?.law_go_kr_ui_and_logo?.cleared_for_use===false && item?.content_rights_boundary?.whole_screenshot?.rights_approved===false,`${label}: legal text cannot grant rights to UI/logo or whole screenshot`);
    must(/transcription verification only/u.test(item?.recommended_use_boundary?.legal_text??'')
      && /permanently excluded/u.test(item?.recommended_use_boundary?.ui_and_logo??'')
      && /never style-frame or production-visible/u.test(item?.recommended_use_boundary?.whole_screenshot??''),
    `${label}: capture-pixel production exclusion boundary is missing`);
    must(item?.human_pass===false && item?.source_approved===false && item?.rights_approved===false && item?.registry_replacement===false && item?.materialized===false && item?.production_authority===false,`${label}: item cannot claim PASS/approval/replacement/materialization`);
  }
  must(exact(actual,expected.manifest),'review manifest is stale or was hand-mutated from deterministic inputs');
  for(let index=0;index<(actual?.boards??[]).length;index++){
    const board=actual.boards[index];
    const file=path.resolve(root,board.path);
    const base=path.resolve(root,PACKAGE_ROOT);
    must(file.startsWith(base+path.sep) && fs.existsSync(file),`${board.path}: board missing or unsafe`);
    if(!file.startsWith(base+path.sep)||!fs.existsSync(file)) continue;
    const bytes=fs.readFileSync(file);
    must(sha256(bytes)===board.sha256 && sha256(expected.boardBuffers[index])===board.sha256,`${board.path}: deterministic board hash drift`);
    let meta; try{meta=await sharp(bytes).metadata();}catch{meta=null;}
    must(meta?.format==='png' && meta?.width===1920 && meta?.height===1080,`${board.path}: board must decode as 1920x1080 PNG`);
  }
  return {ok:failures.length===0,failures};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=await validateOfficialRecaptureReview();
  if(!result.ok){console.error(result.failures.join('\n'));process.exitCode=1;}
  else console.log('EP001 recapture-v03 package is deterministic historical evidence only and permanently ineligible for production pixels.');
}
