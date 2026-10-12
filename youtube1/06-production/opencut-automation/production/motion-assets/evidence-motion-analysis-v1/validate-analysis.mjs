import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const load=p=>JSON.parse(fs.readFileSync(path.join(here,p),'utf8'));
const manifests=['evidence-motion-v1','evidence-motion-v2'].map(v=>JSON.parse(fs.readFileSync(path.join(root,v,'manifest.json'),'utf8')));
const ids=manifests.flatMap(m=>m.assets.map(a=>a.asset_id));
const catalog=load('asset-effects-catalog.json');
const refs=load('reference-scene-analysis.json');
const strict2026=load('reference-motion-2026-strict.json');
const retraction2026=load('reference-motion-2026-retraction.json');
const rubric=load('motion-graphics-classification-rubric-v1.json');
const calibration=load('motion-graphics-calibration-cases-v1.json');
const matrix=load('reproduction-feasibility.json');
const errors=[];
if(ids.length!==178) errors.push(`expected 178 manifest assets, got ${ids.length}`);
if(catalog.asset_count!==ids.length) errors.push('catalog asset_count mismatch');
const modules=catalog.modules||[]; const moduleIds=new Set(modules.map(m=>m.module_id));
if(moduleIds.size!==modules.length) errors.push('duplicate module_id');
const seen=[]; for(const m of modules){ if(!m.asset_ids?.length) errors.push(`${m.module_id} has no assets`); for(const id of m.asset_ids||[]) { if(!ids.includes(id)) errors.push(`${m.module_id} references unknown asset ${id}`); seen.push(id); } }
for(const id of ids) if(!seen.includes(id)) errors.push(`unmapped asset ${id}`);
if(new Set(seen).size!==seen.length) errors.push('asset assigned to multiple modules');
const validVerdicts=new Set(['READY','ADAPT','BUILD','EXTERNAL_ASSET','DO_NOT_COPY']);
const refIds=new Set(refs.references.map(r=>r.reference_id));
for(const r of refs.references){ if(!/^https:\/\//.test(r.url)) errors.push(`${r.reference_id} URL invalid`); for(const i of r.sampled_intervals||[]) if(i.start_s<0||i.end_s<i.start_s) errors.push(`${r.reference_id} timestamp invalid`); if(r.coverage_status==='sampled-contact-sheet' && !(r.scene_motion_ledger||[]).length) errors.push(`${r.reference_id} missing scene_motion_ledger`); if(r.sampling_plan && (r.sampling_plan.coverage_percent<0||r.sampling_plan.coverage_percent>100)) errors.push(`${r.reference_id} coverage out of range`); }
if(strict2026.scope?.upload_year!==2026) errors.push('strict reference catalog must be 2026-only');
const strictRows=[...(strict2026.primary_references||[]),...(strict2026.valid_motion_graphics_but_low_case_fit||[])];
for(const r of strictRows){
  const id=r.reference_id||`${r.video_id}:${r.timestamp_url}`;
  if(!String(r.upload_date||'').startsWith('2026-')) errors.push(`${id} is not a 2026 upload`);
  if(!/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]+&t=\d+s$/.test(r.timestamp_url||'')) errors.push(`${id} timestamp URL invalid`);
  if(!(r.view_count_snapshot>=0)) errors.push(`${id} view snapshot invalid`);
  if(!Array.isArray(r.interval_seconds)||!(r.interval_seconds[1]>r.interval_seconds[0])) errors.push(`${id} interval invalid`);
}
if(retraction2026.status!=='individual_claims_retracted') errors.push('2026 reference retraction status invalid');
if(retraction2026.not_authorized_for_planning!==true) errors.push('retracted 2026 references must not be authorized for planning');
if(!retraction2026.invalidated_claims?.length) errors.push('2026 retraction has no invalidated claims');
const allowedClassifications=new Set(rubric.allowed_classifications||[]);
if(rubric.admission_policy?.continuous_playback_required!==true) errors.push('motion rubric must require continuous playback');
if(rubric.admission_policy?.classification_quality_and_relevance_must_be_separate!==true) errors.push('motion rubric must separate classification, quality, and relevance');
if((calibration.cases||[]).length<18) errors.push('motion calibration set is incomplete');
for(const c of calibration.cases||[]) if(!allowedClassifications.has(c.classification)) errors.push(`${c.id} calibration classification invalid`);
for(const row of matrix.rows||[]){ if(!validVerdicts.has(row.verdict)) errors.push(`${row.grammar_id} verdict invalid`); for(const id of row.module_ids||[]) if(!moduleIds.has(id)) errors.push(`${row.grammar_id} unknown module ${id}`); for(const id of row.reference_ids||[]) if(!refIds.has(id)) errors.push(`${row.grammar_id} unknown reference ${id}`); }
if(errors.length){ console.error(errors.join('\n')); process.exit(1); }
console.log(`analysis-v1 valid: ${ids.length} assets, ${modules.length} modules, ${refs.references.length} legacy references, ${strictRows.length} strict 2026 references, ${calibration.cases.length} motion calibration cases, ${retraction2026.invalidated_claims.length} individually retracted claims, ${matrix.rows.length} feasibility rows, 0 errors`);
