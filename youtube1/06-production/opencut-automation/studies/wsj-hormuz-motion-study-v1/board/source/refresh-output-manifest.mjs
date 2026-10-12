import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const studyRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.resolve(studyRoot,'../../out/studies/wsj-hormuz-motion-study-v1');
const p=f=>path.join(out,f); const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(p(f))).digest('hex');
const m=JSON.parse(fs.readFileSync(p('output-manifest.json'),'utf8')); m.source_reference='../../../studies/wsj-hormuz-motion-study-v1/source/reference-binding.json'; m.outputs={}; for(const f of ['study.mp4','contact-sheet.jpg','thumbnail.jpg']) m.outputs[f]={bytes:fs.statSync(p(f)).size,sha256:hash(f)}; m.refreshed_utc=new Date().toISOString(); fs.writeFileSync(p('output-manifest.json'),JSON.stringify(m,null,2)+'\n'); console.log('output manifest refreshed');
