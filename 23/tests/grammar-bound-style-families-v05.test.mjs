import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {validateAll,validateFamilyManifest} from '../video/scripts/validate-grammar-bound-style-families-v05.mjs';

const root=process.cwd();
const indexPath='video/qa/style-frames/episode-001/reference-style-families-v05/family-index.json';
const readJson=async(file)=>JSON.parse(await readFile(file,'utf8'));

test('v05 historical audit is isolated after its episode-spec byte binding was superseded',async()=>{
  const historicalErrors=await validateAll({root});
  assert.ok(historicalErrors.length>0);
  assert.ok(historicalErrors.every((error)=>/episode-spec(?: shot)? binding drift|unknown representative shot SH(?:040|047)/u.test(error)),historicalErrors.join('\n'));
  const index=await readJson(indexPath);
  assert.deepEqual({families:index.family_count,built:index.built_family_count,blocked:index.blocked_family_count,mapped:index.sample_coverage.mapped,user_approved:index.user_approved}, {families:6,built:4,blocked:2,mapped:[1,2,3,4,5,6,7,8,9],user_approved:false});
  assert.deepEqual({production_visible:index.production_visible,production_authority:index.production_authority,active_cut_root:index.active_cut_root},{production_visible:false,production_authority:false,active_cut_root:null});
});

test('a self-referential transfer row cannot replace the canonical exact locator',async()=>{
  const index=await readJson(indexPath);
  const manifest=await readJson(index.families.find((row)=>row.family_id==='process-route-editorial').path);
  manifest.transfer_matrix_rows[0].exact_reference_stills[0].path='video/qa/style-frames/episode-001/reference-style-families-v05/fake.png';
  const errors=await validateFamilyManifest(manifest,{root,index});
  assert.ok(errors.some((error)=>error.includes('family transfer-matrix')));
});

test('legal focal below 72px and a still motion claim are rejected',async()=>{
  const index=await readJson(indexPath);
  const manifest=await readJson(index.families.find((row)=>row.family_id==='law-document-editorial').path);
  manifest.frames[2].source_locked_readability.effective_font_px_1080=55;
  manifest.frames[0].motion_parity_claimed=true;
  const errors=await validateFamilyManifest(manifest,{root,index});
  assert.ok(errors.some((error)=>error.includes('>=72px')));
  assert.ok(errors.some((error)=>error.includes('static state evidence only')));
});

test('assembly cannot substitute a U.S. chamber and Omni cannot claim generated motion',async()=>{
  const index=await readJson(indexPath);
  const assembly=await readJson(index.families.find((row)=>row.family_id==='assembly-editorial').path);
  assembly.blockers=assembly.blockers.filter((row)=>!row.reason.includes('U.S. House'));
  const assemblyErrors=await validateFamilyManifest(assembly,{root,index});
  assert.ok(assemblyErrors.some((error)=>error.includes('forbid the U.S. substitute')));
  const omni=await readJson(index.families.find((row)=>row.family_id==='omni-fiction-continuity').path);
  omni.motion_claim='omni-generated-motion';
  const omniErrors=await validateFamilyManifest(omni,{root,index});
  assert.ok(omniErrors.some((error)=>error.includes('cannot claim generated or Remotion motion')));
});
