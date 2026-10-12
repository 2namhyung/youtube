import {createHash} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {validateCorrectedReview} from './validate-motion-reverse-engineering-review-v02.mjs';
import {validateApprovalMarkerObjectV02} from './validate-reference-calibration-approval-v02.mjs';

const ROOT=process.cwd();
const canonical={supersession:'video/qa/reference-study/motion-reverse-engineering-review-v02/reference-calibration-supersession.json',oldApproval:'video/qa/reference-study/motion-reverse-engineering-review-v01/reference-calibration-approval.json',oldGrammarApproval:'video/qa/reference-study/motion-reverse-engineering-review-v01/reference-grammar-approval.json',oldReview:'video/qa/reference-study/motion-reverse-engineering-review-v01/manifest.json',correctedReview:'video/qa/reference-study/motion-reverse-engineering-review-v02/manifest.json',calibrationMarker:'video/qa/reference-study/motion-reverse-engineering-review-v02/reference-calibration-approval-v02.json',grammarMarker:'video/qa/reference-study/motion-reverse-engineering-review-v02/reference-grammar-approval-v02.json',grammar:'video/episodes/episode-001/reference-grammar-contract.json',binding:'video/episodes/episode-001/reference-grammar-binding.json'};
const sha=(value)=>createHash('sha256').update(value).digest('hex');
const shaFile=async(file)=>sha(await readFile(file));
const exists=async(file)=>{try{return(await stat(file)).isFile();}catch{return false;}};
const rel=(root,file)=>path.relative(root,file).replaceAll('\\','/');
const canonicalize=(value)=>Array.isArray(value)?value.map(canonicalize):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map((key)=>[key,canonicalize(value[key])])):value;
const semanticDigest=(value)=>sha(Buffer.from(JSON.stringify(canonicalize(value))));
const exactKeys=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&isDeepStrictEqual(Object.keys(value).sort(),[...keys].sort());
const SUPERSESSION_SEMANTIC_SHA256='9e7c6e79efcdf5f546a857318c8d9f6d8b3eb8967cd1d3506f7f7550d0f84320';
const PENDING_GRAMMAR_SEMANTIC_SHA256='eedb0eb44edaa24e351d50528800c82e0b88f8852c3004bd149eb5dfae5d8462';
const PENDING_AUTHORING_SEMANTIC_SHA256='05670dfef8b130c5caa884fea8711e32b6701e4fdab965caf3fb512c2a2cc0e8';
const GRAMMAR_CATEGORIES=['visual_object_role','layout_relation','depth_occlusion','text_surface_role','motion_operator','transition_operator','treatment'];
const GRAMMAR_ROOT_KEYS=['reference_grammar_contract_version','status','approval_marker','calibration_approval_marker','purpose','source','approved_review_package','categories','bindings','approved_subset','unmapped_visual_grammar','novel_visual_grammar','pending_evidence_entries','hidden_authoring_uncertainties','channel_exceptions','exception_constraints','candidate_review_package','supersession'];
const GRAMMAR_APPROVAL_REL='video/qa/reference-study/motion-reverse-engineering-review-v02/reference-grammar-approval-v02.json';
const CALIBRATION_APPROVAL_REL='video/qa/reference-study/motion-reverse-engineering-review-v02/reference-calibration-approval-v02.json';
const GRAMMAR_CATEGORY_BY_ID=Object.freeze({
  'persistent-editorial-background':'visual_object_role','dominant-concrete-focal':'visual_object_role','supporting-source-object':'visual_object_role','layered-collage':'layout_relation','background-midground-foreground':'depth_occlusion','source-surface-text':'text_surface_role','independent-target-translate':'motion_operator','staggered-object-accumulation':'motion_operator','numeric-group-rise-fade-count-up':'motion_operator','plot-local-progressive-reveal':'motion_operator','map-reframe-local-overlay-lifecycle':'motion_operator','source-surface-state-progression':'motion_operator','discrete-title-state-progression':'motion_operator','object-preserving-layout-reframe':'transition_operator','directional-scene-exit-left':'transition_operator','hard-cut':'transition_operator',
});
const GRAMMAR_IDS_BY_SAMPLE=Object.freeze({
  1:['persistent-editorial-background','dominant-concrete-focal','supporting-source-object','layered-collage','background-midground-foreground','independent-target-translate','staggered-object-accumulation'],
  2:['dominant-concrete-focal','supporting-source-object','layered-collage','source-surface-text','independent-target-translate','numeric-group-rise-fade-count-up'],
  3:['dominant-concrete-focal','source-surface-text','plot-local-progressive-reveal'],4:['dominant-concrete-focal','supporting-source-object','layered-collage','map-reframe-local-overlay-lifecycle'],5:['dominant-concrete-focal','supporting-source-object','layered-collage','independent-target-translate','object-preserving-layout-reframe'],6:['layered-collage','directional-scene-exit-left','hard-cut'],7:['dominant-concrete-focal','supporting-source-object','layered-collage','independent-target-translate','staggered-object-accumulation','discrete-title-state-progression','hard-cut'],8:['dominant-concrete-focal','supporting-source-object','layered-collage','staggered-object-accumulation'],9:['dominant-concrete-focal','supporting-source-object','layered-collage','source-surface-text','source-surface-state-progression','staggered-object-accumulation'],
});

export function derivePromotedGrammarV02(review,grammarApprovalRecord=null){
  const bindings=review.samples.flatMap((sample)=>(GRAMMAR_IDS_BY_SAMPLE[sample.sample_number]??[]).map((grammarId)=>({sample_number:sample.sample_number,sample_id:sample.sample_id,category:GRAMMAR_CATEGORY_BY_ID[grammarId],grammar_id:grammarId,contract_id:sample.motion_contract.contract_id,contract_sha256:sample.motion_contract.sha256})));
  const approvedSubset=[...new Set(bindings.map((row)=>row.grammar_id))].sort();
  const categories=Object.fromEntries(GRAMMAR_CATEGORIES.map((category)=>[category,approvedSubset.filter((id)=>GRAMMAR_CATEGORY_BY_ID[id]===category).map((grammarId)=>({grammar_id:grammarId,evidence_contracts:bindings.filter((row)=>row.grammar_id===grammarId).map(({sample_number,sample_id,contract_id,contract_sha256})=>({sample_number,sample_id,contract_id,contract_sha256})),human_approval:grammarApprovalRecord?{status:'approved',approved:true,marker:grammarApprovalRecord}:null}))]));
  const evidenceBundleSha256=semanticDigest(Object.entries(categories).flatMap(([category,entries])=>entries.map(({grammar_id,evidence_contracts})=>({category,grammar_id,evidence_contracts}))));
  return{categories,bindings,approvedSubset,evidenceBundleSha256};
}

export async function validateReferenceCorrection(options={}){
  const root=options.root??ROOT;
  const files=Object.fromEntries(Object.entries(canonical).map(([key,value])=>[key,path.resolve(root,options[key]??value)]));
  const errors=[];const must=(condition,message)=>{if(!condition)errors.push(message);};
  const readJson=async(file,label)=>{try{return JSON.parse(await readFile(file,'utf8'));}catch{errors.push(`${label}: missing/invalid JSON`);return null;}};
  const [supersession,grammar,binding,review,calibrationMarker,grammarMarker]=await Promise.all([
    readJson(files.supersession,'supersession'),readJson(files.grammar,'grammar'),readJson(files.binding,'binding'),readJson(files.correctedReview,'corrected review'),readJson(files.calibrationMarker,'calibration marker'),readJson(files.grammarMarker,'grammar marker'),
  ]);
  if([supersession,grammar,binding,review,calibrationMarker,grammarMarker].some((value)=>!value))throw new Error(`reference correction invalid:\n- ${errors.join('\n- ')}`);
  const historical={oldApproval:'70980091e8af19f01c4a10f6e73b3e0f9289c14bdad5d0a19366f6717fe73916',oldGrammarApproval:'c65ccfca93d5e48593093f196904402c2aff7deb124e605f69c95fdcc0798281',oldReview:'35c77a0e01abe29c2b880e2a0a126db234042fba7c10aee6489b7c4b3c868f9c'};
  for(const [key,expected] of Object.entries(historical))must(await exists(files[key])&&await shaFile(files[key])===expected,`${key}: historical approved bytes must remain preserved`);
  const correctedReviewSha=await shaFile(files.correctedReview),supersessionSha=await shaFile(files.supersession),grammarSha=await shaFile(files.grammar),calibrationMarkerSha=await shaFile(files.calibrationMarker),grammarMarkerSha=await shaFile(files.grammarMarker);
  must(supersession.status==='superseded-by-user-correction'&&supersession.reviewer==='user'&&supersession.recorded_at==='2026-09-02','supersession reviewer/date/status mismatch');
  const supersessionSemantic=structuredClone(supersession);supersessionSemantic.corrected_review.sha256='<CURRENT_REVIEW_SHA256>';
  must(semanticDigest(supersessionSemantic)===SUPERSESSION_SEMANTIC_SHA256,'supersession full canonical semantics/artifact rows drift');
  must(supersession.superseded_approval?.sha256===historical.oldApproval&&supersession.superseded_approval?.authority==='historical-only'&&supersession.superseded_grammar_approval?.sha256===historical.oldGrammarApproval&&supersession.superseded_review?.sha256===historical.oldReview,'supersession historical hash chain drift');
  must(supersession.corrected_review?.path===rel(root,files.correctedReview)&&supersession.corrected_review?.sha256===correctedReviewSha&&supersession.corrected_review?.status==='pending-human-corrected-reference-calibration-review','supersession corrected review binding drift');
  must(isDeepStrictEqual(supersession.carried_forward_candidates?.map((row)=>row.sample_number),[1,2,3,4,5,6,7])&&supersession.carried_forward_candidates.every((row)=>row.authority==='carried-forward-candidate-only'&&row.user_approval_reuse===false),'only samples01-07 may be carried forward as unapproved candidates');
  must(isDeepStrictEqual(supersession.invalidated_samples?.map((row)=>row.sample_number),[8,9,10]),'samples08/09/10 must be explicitly invalidated');
  must(Object.values(supersession.non_grants??{}).every((value)=>value===false||value===null),'supersession cannot grant downstream authority');
  if(options.verifyReview!==false){try{await validateCorrectedReview({root,manifestPath:files.correctedReview,verifyMedia:options.verifyMedia});}catch(error){errors.push(error.message);}}

  const syntheticGate={reference_calibration:{approval_marker:CALIBRATION_APPROVAL_REL,approval_marker_sha256:calibrationMarkerSha}};
  errors.push(...validateApprovalMarkerObjectV02({marker:calibrationMarker,markerSha:calibrationMarkerSha,review,reviewSha:correctedReviewSha,gates:syntheticGate}));
  const calibrationApproval={path:CALIBRATION_APPROVAL_REL,sha256:calibrationMarkerSha};
  const grammarApproval={path:GRAMMAR_APPROVAL_REL,sha256:grammarMarkerSha};
  const promotion=derivePromotedGrammarV02(review,grammarApproval);
  const expectedReviewPackage={path:canonical.correctedReview,sha256:correctedReviewSha,approved_inputs_sha256:review.input_bundle_sha256,board:{path:review.board.path,sha256:review.board.sha256},reel:{path:review.reel.path,sha256:review.reel.sha256},motion_contract_package:review.motion_contract_package};
  must(exactKeys(grammar,GRAMMAR_ROOT_KEYS)&&grammar.reference_grammar_contract_version===1&&grammar.purpose==='Human-approved, contract-bound v02 grammar allowlist derived only from corrected active samples 01–09; sample10 remains excluded.','approved v02 grammar root schema/version/purpose must be exact');
  must(semanticDigest(grammar.source)==='b70f3281b7f2e0cc6f60e319327900fd46546df501f9aaa2cf54ab368ab7c8f9'&&semanticDigest(grammar.hidden_authoring_uncertainties)==='36ab78ff746d34d3062e6adf4f31c41bcd34e144d89edfe01e3daee48dbbffc1'&&semanticDigest(grammar.channel_exceptions)==='3ea5a030cd71507a31d64123dc75ac0ec6df6421d30395b22a36180e1210e473'&&semanticDigest(grammar.exception_constraints)==='f4714011877d38c209c8545a2676cd34ca2eee53f795ceef2b89f712ab1941d9','approved grammar source/uncertainties/channel exceptions drift');
  must(grammar.status==='approved-human-grammar'&&isDeepStrictEqual(grammar.calibration_approval_marker,calibrationApproval)&&isDeepStrictEqual(grammar.approval_marker,grammarApproval)&&isDeepStrictEqual(grammar.approved_review_package,expectedReviewPackage),'historical calibration requires the exact v02-approved grammar review/marker binding');
  must(isDeepStrictEqual(grammar.categories,promotion.categories)&&isDeepStrictEqual(grammar.bindings,promotion.bindings)&&isDeepStrictEqual(grammar.approved_subset,promotion.approvedSubset)&&isDeepStrictEqual(grammar.unmapped_visual_grammar,[])&&isDeepStrictEqual(grammar.novel_visual_grammar,[]),'approved grammar categories/bindings/subset must exactly derive from active samples01-09');
  must(semanticDigest((grammar.pending_evidence_entries??[]).filter((entry)=>entry.status==='pending_evidence'))===PENDING_AUTHORING_SEMANTIC_SHA256&&(grammar.pending_evidence_entries??[]).every((entry)=>entry.status==='pending_evidence'),'promoted grammar may retain only the exact unresolved authoring hypotheses');
  const expectedGrammarMarker={schema_version:2,marker_id:'reference-grammar-approval-v02',status:'approved-human-grammar',reviewer:'user',calibration_approval:calibrationApproval,approved_review_package:{path:canonical.correctedReview,sha256:correctedReviewSha,input_bundle_sha256:review.input_bundle_sha256},approved_grammar_ids:Object.values(promotion.categories).flat().map((entry)=>entry.grammar_id),approved_subset:promotion.approvedSubset,evidence_bundle_sha256:promotion.evidenceBundleSha256,non_grants:{style_frame_pass:false,cut_pass:false,production_authority:false,active_cut_root:null}};
  must(isDeepStrictEqual(grammarMarker,expectedGrammarMarker),'grammar approval marker must be the exact user-reviewed v02 promotion marker');
  const expectedBinding={schema_version:1,grammar_contract:{path:canonical.grammar,sha256:grammarSha},status:'approved-human-grammar',approval_marker:grammarApproval,calibration_approval_marker:calibrationApproval,supersession:{path:canonical.supersession,sha256:supersessionSha}};
  must(isDeepStrictEqual(binding,expectedBinding),'approved grammar binding must exactly bind grammar, calibration marker, approval marker, and supersession');
  must(grammar.candidate_review_package?.sha256===correctedReviewSha&&grammar.candidate_review_package?.path===canonical.correctedReview&&grammar.supersession?.sha256===supersessionSha&&grammar.supersession?.path===canonical.supersession,'grammar candidate/supersession binding drift');
  must(review.sample_count===9&&!review.samples.some((row)=>row.sample_number===10),'corrected review must not reactivate sample10');
  if(errors.length)throw new Error(`reference correction invalid:\n- ${errors.join('\n- ')}`);
  return{status:'reference-calibration-passed',active_samples:9,excluded_sample:10,supersession_sha256:supersessionSha,corrected_review_sha256:correctedReviewSha,calibration_marker_sha256:calibrationMarkerSha,grammar_marker_sha256:grammarMarkerSha,grammar_contract_sha256:grammarSha};
}

if(process.argv[1]?.endsWith('validate-reference-correction-v02.mjs')){const result=await validateReferenceCorrection();process.stdout.write(`reference correction valid: ${result.active_samples} active candidates; sample${result.excluded_sample} excluded; ${result.status}\n`);}
