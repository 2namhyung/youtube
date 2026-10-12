import {createHash} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {validateCorrectedReview} from './validate-motion-reverse-engineering-review-v02.mjs';

const ROOT=process.cwd();
const REVIEW_REL='video/qa/reference-study/motion-reverse-engineering-review-v02/manifest.json';
const MARKER_REL='video/qa/reference-study/motion-reverse-engineering-review-v02/reference-calibration-approval-v02.json';
const GRAMMAR_REL='video/episodes/episode-001/reference-grammar-contract.json';
const GATES_REL='video/episodes/episode-001/reference-style-gates.json';
const sha=(value)=>createHash('sha256').update(value).digest('hex');
const shaFile=async(file)=>sha(await readFile(file));
const exists=async(file)=>{try{return(await stat(file)).isFile();}catch{return false;}};
const sortInputs=(rows)=>[...rows].sort((a,b)=>`${a.sample_number}|${a.kind}|${a.path}|${a.sha256}`.localeCompare(`${b.sample_number}|${b.kind}|${b.path}|${b.sha256}`));
const exactKeys=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&isDeepStrictEqual(Object.keys(value).sort(),[...keys].sort());

export function validateApprovalMarkerObjectV02({marker,markerSha,review,reviewSha,gates}){
  const errors=[],must=(condition,message)=>{if(!condition)errors.push(message);};
  must(exactKeys(marker,['schema_version','marker_id','status','reviewer','reviewed_package','motion_contract_package','approved_inputs','approved_inputs_sha256','sample_decisions','sample10_exclusion_acknowledgement','non_grants']),'v02 marker root schema must be exact');
  must(marker.schema_version===2&&marker.marker_id==='reference-calibration-approval-v02-nine-active-plus-one-exclusion'&&marker.status==='human-approved'&&marker.reviewer==='user','v02 marker identity/status/reviewer mismatch');
  const expectedReviewedPackage={path:REVIEW_REL,sha256:reviewSha,package_id:review.package_id,input_bundle_sha256:review.input_bundle_sha256};
  must(isDeepStrictEqual(marker.reviewed_package,expectedReviewedPackage),'v02 marker candidate review path/hash/bundle binding mismatch');
  must(isDeepStrictEqual(marker.motion_contract_package,review.motion_contract_package),'v02 marker contract manifest and all ten contract bindings mismatch');
  must(isDeepStrictEqual(sortInputs(marker.approved_inputs??[]),sortInputs(review.inputs??[]))&&marker.approved_inputs_sha256===review.input_bundle_sha256,'v02 marker approved inputs must exactly match the corrected review bundle');
  const expectedDecisions=review.samples.map((row)=>({sample_number:row.sample_number,sample_id:row.sample_id,decision:'PASS',contract_id:row.motion_contract.contract_id,contract_sha256:row.motion_contract.sha256,side_by_side_path:row.side_by_side.path,side_by_side_sha256:row.side_by_side.sha256,contact_path:row.contact.path,contact_sha256:row.contact.sha256}));
  must(isDeepStrictEqual(marker.sample_decisions,expectedDecisions),'v02 marker must contain exact PASS decisions for all nine active samples');
  const exclusion=review.excluded_sample_10;
  const expectedAcknowledgement={sample_number:10,sample_id:exclusion.sample_id,decision:'ACKNOWLEDGED-SOURCE-VIDEO-EXCLUSION',contract_id:exclusion.motion_contract.contract_id,contract_sha256:exclusion.motion_contract.sha256,review_frame_path:exclusion.review_frame.path,review_frame_sha256:exclusion.review_frame.sha256};
  must(isDeepStrictEqual(marker.sample10_exclusion_acknowledgement,expectedAcknowledgement),'v02 marker must explicitly acknowledge the exact sample10 exclusion');
  must(isDeepStrictEqual(marker.non_grants,{production_authority:false,cut_pass:false,omni_video_generation:false,active_cut_root:null}),'v02 calibration marker cannot grant production/cut/Omni authority');
  must(gates.reference_calibration?.approval_marker===MARKER_REL&&gates.reference_calibration?.approval_marker_sha256===markerSha,'v02 marker path/hash must be explicitly bound by the style gate before promotion');
  return errors;
}

export async function validateReferenceCalibrationApprovalV02(options={}){
  const root=options.root??ROOT,reviewFile=path.resolve(root,options.reviewPath??REVIEW_REL),markerFile=path.resolve(root,options.markerPath??MARKER_REL);
  const grammarFile=path.resolve(root,options.grammarPath??GRAMMAR_REL),gatesFile=path.resolve(root,options.gatesPath??GATES_REL),errors=[];
  const must=(condition,message)=>{if(!condition)errors.push(message);};
  must(path.resolve(markerFile)===path.resolve(root,MARKER_REL),'v02 approval marker must use the canonical explicit path');
  try{await validateCorrectedReview({root,manifestPath:reviewFile,verifyMedia:options.verifyMedia!==false});}catch(error){errors.push(error.message);}
  const review=JSON.parse(await readFile(reviewFile,'utf8')),grammar=JSON.parse(await readFile(grammarFile,'utf8')),gates=JSON.parse(await readFile(gatesFile,'utf8'));
  const markerPresent=await exists(markerFile);
  const grammarHasPromotion=grammar.status!=='pending-human-grammar-approval'||grammar.approved_review_package!==null||grammar.approval_marker!==null||grammar.calibration_approval_marker!==null||Object.values(grammar.categories??{}).some((rows)=>rows.length>0)||(grammar.bindings??[]).length>0||(grammar.approved_subset??[]).length>0;
  const gateHasPromotion=gates.reference_calibration?.status!=='reference-calibration-incomplete'||gates.reference_calibration?.user_reference_calibration_pass!==false||gates.reference_calibration?.grammar_promoted!==false;
  if(!markerPresent){
    must(options.requireMarker!==true,'explicit user v02 approval marker is absent');
    must(!grammarHasPromotion&&!gateHasPromotion,'grammar/style promotion is forbidden without a valid v02 user marker');
    must(gates.reference_calibration?.approval_marker===null&&gates.reference_calibration?.approval_marker_sha256===null,'pending gate cannot bind an approval marker');
    if(errors.length)throw new Error(`v02 reference approval invalid:\n- ${errors.join('\n- ')}`);
    return{status:'pending-explicit-human-marker',valid:false,marker_path:MARKER_REL};
  }
  const marker=JSON.parse(await readFile(markerFile,'utf8')),markerSha=await shaFile(markerFile);
  const reviewSha=await shaFile(reviewFile);
  errors.push(...validateApprovalMarkerObjectV02({marker,markerSha,review,reviewSha,gates}));
  if(grammarHasPromotion||gateHasPromotion)must(errors.length===0,'grammar/style promotion requires a fully valid v02 marker');
  if(errors.length)throw new Error(`v02 reference approval invalid:\n- ${errors.join('\n- ')}`);
  return{status:'valid-explicit-human-marker',valid:true,marker_path:MARKER_REL,marker_sha256:markerSha};
}

if(path.resolve(process.argv[1]??'')===fileURLToPath(import.meta.url)){
  const result=await validateReferenceCalibrationApprovalV02({requireMarker:process.argv.includes('--require-marker')});
  process.stdout.write(result.valid?`v02 reference approval marker valid: ${result.marker_sha256}\n`:'v02 reference approval pending: explicit user marker absent; grammar promotion locked\n');
}
