import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {validateAll} from '../video/scripts/validate-grammar-bound-style-families-v08.mjs';
const root=process.cwd(),indexPath='video/qa/style-frames/episode-001/reference-style-families-v08/family-index.json';
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
test('v08 source-bound time/data and tight source crops pass',async()=>{assert.deepEqual(await validateAll({root}),[]);const i=await readJson(indexPath),time=await readJson(i.families.find(x=>x.family_id==='time-data-editorial').path),days=time.frames.map(f=>f.geometry.texts[0].text);assert.deepEqual(days,['0일','45일','90일']);assert.deepEqual(time.frames.map(f=>f.geometry.progress_overlays[0].x2>f.geometry.progress_overlays[0].x1),[false,true,true]);});
test('v08 keeps missing-source families blocked without placeholders',async()=>{const i=await readJson(indexPath);for(const id of ['assembly-editorial','omni-fiction-continuity']){const m=await readJson(i.families.find(x=>x.family_id===id).path);assert.equal(m.status,'blocked-missing-required-source-inputs');assert.deepEqual(m.frames,[]);}});
