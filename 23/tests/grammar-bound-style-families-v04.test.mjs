import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {copyFile,mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {validateFamilyManifest,validateGrammarBoundStyleFamiliesV04} from '../video/scripts/validate-grammar-bound-style-families-v04.mjs';

const root=process.cwd();
const manifestPath='video/qa/style-frames/episode-001/reference-style-families-v04/hook-source-collage-v04/manifest.json';
const omniManifestPath='video/qa/style-frames/episode-001/reference-style-families-v04/omni-fiction-continuity-v04/manifest.json';
const grammarPath='video/episodes/episode-001/reference-grammar-contract.json';
const readJson=async(path)=>JSON.parse(await readFile(path,'utf8'));
const sha=(value)=>createHash('sha256').update(value).digest('hex');
const shaFile=async(file)=>sha(await readFile(file));
const refreshBundle=(manifest)=>{
  const rows=[...new Map(manifest.frames.flatMap((frame)=>frame.inputs.map((input)=>[`${input.path}|${input.sha256}`,{kind:'visual-input',path:input.path,sha256:input.sha256}]))).values()];
  rows.push({kind:'renderer-recipe',path:manifest.renderer_recipe.path,sha256:manifest.renderer_recipe.sha256});
  rows.sort((a,b)=>`${a.kind}|${a.path}`.localeCompare(`${b.kind}|${b.path}`));
  manifest.exact_input_bundle={rows,sha256:sha(Buffer.from(rows.map((row)=>`${row.kind}|${row.path}|${row.sha256}`).join('\n')))};
};

test('historical six-family v04 set cannot remain the canonical review route',async()=>{
  await assert.rejects(()=>validateGrammarBoundStyleFamiliesV04({root}),/grammar-bound style family v04 invalid/u);
});

test('free-text-only candidate is rejected',async()=>{
  const [manifest,grammar]=await Promise.all([readJson(manifestPath),readJson(grammarPath)]);
  manifest.reference_grammar.bindings=[];
  manifest.reference_grammar.approved_subset=[];
  const errors=await validateFamilyManifest(manifest,{root,grammar});
  assert.ok(errors.some((error)=>error.includes('free-text-only candidate')));
});

test('stale input hash and bundle are rejected',async()=>{
  const [manifest,grammar]=await Promise.all([readJson(manifestPath),readJson(grammarPath)]);
  manifest.frames[0].inputs[0].sha256='0'.repeat(64);
  const errors=await validateFamilyManifest(manifest,{root,grammar});
  assert.ok(errors.some((error)=>error.includes('input hash drift')));
  assert.ok(errors.some((error)=>error.includes('exact input inventory drift')));
});

test('stale grammar contract and unapproved grammar ID are rejected',async()=>{
  const [manifest,grammar]=await Promise.all([readJson(manifestPath),readJson(grammarPath)]);
  manifest.reference_grammar_contract.sha256='0'.repeat(64);
  manifest.reference_grammar.bindings[0].grammar_id='invented-free-text-layout';
  const errors=await validateFamilyManifest(manifest,{root,grammar});
  assert.ok(errors.some((error)=>error.includes('reference grammar contract path/hash is stale')));
  assert.ok(errors.some((error)=>error.includes('unapproved or category-mismatched grammar ID')));
});

test('visible component without an exact object-role binding is rejected',async()=>{
  const [manifest,grammar]=await Promise.all([readJson(manifestPath),readJson(grammarPath)]);
  manifest.frames[0].declared_visible_components.push('unbound-visible-component');
  const errors=await validateFamilyManifest(manifest,{root,grammar});
  assert.ok(errors.some((error)=>error.includes('declared visible components must exactly equal')||error.includes('every visible component requires exactly one')));
});

test('renamed historical composite pixels cannot masquerade as an independent input',async()=>{
  const [manifest,grammar]=await Promise.all([readJson(manifestPath),readJson(grammarPath)]);
  const tempDir=await mkdtemp(path.join(root,'video/qa/style-frames/episode-001/reference-style-families-v04/source-inputs/renamed-history-'));
  try{
    const source=path.join(root,'video/qa/style-frames/episode-001/reference-style-families-v03/hook-source-collage-v03/outputs/SH001-dominant-paper-with-support.png');
    const renamed=path.join(tempDir,'innocent-source.png');
    await copyFile(source,renamed);
    const relative=path.relative(root,renamed).replaceAll('\\','/');
    const input=manifest.frames[0].inputs[0];
    input.path=relative;
    input.sha256=await shaFile(renamed);
    const layer=manifest.frames[0].render_recipe.layers.find((item)=>item.asset_id===input.asset_id);
    layer.path=input.path;
    layer.sha256=input.sha256;
    refreshBundle(manifest);
    const errors=await validateFamilyManifest(manifest,{root,grammar});
    assert.ok(errors.some((error)=>error.includes('duplicate a historical composite even under a renamed path')));
  }finally{await rm(tempDir,{recursive:true,force:true});}
});

test('undeclared historical sourceFrame output cannot replace a renderer-reproducible frame',async()=>{
  const [manifest,grammar]=await Promise.all([readJson(manifestPath),readJson(grammarPath)]);
  const historical='video/qa/style-frames/episode-001/reference-style-families-v03/hook-source-collage-v03/outputs/SH001-dominant-paper-with-support.png';
  manifest.frames[0].output=historical;
  manifest.frames[0].output_sha256=await shaFile(path.join(root,historical));
  const errors=await validateFamilyManifest(manifest,{root,grammar});
  assert.ok(errors.some((error)=>error.includes('not reproducible from declared inputs and renderer recipe')));
  assert.ok(errors.some((error)=>error.includes('rendered pixels duplicate a historical/rejected composite')));
});

test('Omni input under a production-state rejected provisional root is rejected dynamically',async()=>{
  const [manifest,grammar]=await Promise.all([readJson(omniManifestPath),readJson(grammarPath)]);
  const rejected='video/public/assets/episode-001-v03/cuts/SH008/assets/start.png';
  const input=manifest.frames[0].inputs[0];
  input.path=rejected;
  input.sha256=await shaFile(path.join(root,rejected));
  const layer=manifest.frames[0].render_recipe.layers[0];
  layer.path=input.path;
  layer.sha256=input.sha256;
  refreshBundle(manifest);
  const errors=await validateFamilyManifest(manifest,{root,grammar});
  assert.ok(errors.some((error)=>error.includes('under production-state rejected/historical provisional root')));
});
