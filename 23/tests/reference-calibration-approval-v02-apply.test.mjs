import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cp,mkdir,mkdtemp,readFile,rm,stat,symlink,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const ROOT=process.cwd();
const SCRIPT=path.join(ROOT,'video/scripts/apply-reference-calibration-approval-v02.mjs');
const JOURNAL='video/qa/reference-study/motion-reverse-engineering-review-v02/reference-calibration-approval-v02.transaction.json';
const targets=['video/qa/reference-study/motion-reverse-engineering-review-v02/reference-calibration-approval-v02.json','video/qa/reference-study/motion-reverse-engineering-review-v02/reference-grammar-approval-v02.json','video/episodes/episode-001/reference-grammar-contract.json','video/episodes/episode-001/reference-grammar-binding.json','video/episodes/episode-001/reference-style-gates.json','video/episodes/episode-001/generated/reference-cut-blueprint.json','video/episodes/episode-001/production-state.json'];
const sha=(bytes)=>createHash('sha256').update(bytes).digest('hex');
const exists=async(file)=>{try{return(await stat(file)).isFile();}catch{return false;}};

async function approvedWorkspace(){
  const root=await mkdtemp(path.join(os.tmpdir(),'reference-v02-restart-'));
  const junction=async(relative)=>{const link=path.join(root,relative);await mkdir(path.dirname(link),{recursive:true});await symlink(path.join(ROOT,relative),link,'junction');};
  for(const relative of ['raw','wiki','video/public','video/src','video/source-intake','video/scripts/lib','video/qa/style-frames','video/qa/production-assets','video/qa/reference-study/additional-sources','video/qa/reference-study/motion-reverse-engineering-pilot-v01','video/qa/reference-study/motion-reverse-engineering-suite-v01','video/qa/reference-study/motion-reverse-engineering-suite-v02','video/qa/reference-study/frame-accurate-motion-contract-v01','video/qa/reference-study/frame-accurate-motion-contract-v02','video/qa/reference-study/motion-reverse-engineering-review-v01','video/qa/reference-study/vox-primary'])await junction(relative);
  await cp(path.join(ROOT,'video/episodes/episode-001'),path.join(root,'video/episodes/episode-001'),{recursive:true});
  const reviewDir=path.join(root,'video/qa/reference-study/motion-reverse-engineering-review-v02');await mkdir(path.dirname(reviewDir),{recursive:true});await cp(path.join(ROOT,'video/qa/reference-study/motion-reverse-engineering-review-v02'),reviewDir,{recursive:true});
  return root;
}

test('production apply surface is canonical CLI-only and rejects every argument',async()=>{
  const source=await readFile(SCRIPT,'utf8');
  assert.doesNotMatch(source,/export\s+(?:async\s+)?function\s+applyReferenceCalibrationApprovalV02|options\.(?:root|verifyMedia|validateCurrent|validateMarker|validateFinalState|postValidateCommands)/u);
  const result=spawnSync(process.execPath,[SCRIPT,'--approval-marker-root',os.tmpdir()],{cwd:ROOT,encoding:'utf8',windowsHide:true});
  assert.notEqual(result.status,0);assert.match(result.stderr,/accepts no arguments; alternate roots\/routes are forbidden/u);
});

test('durable journal restores an interrupted canonical write before validating reapplication',async()=>{
  const root=await approvedWorkspace();
  try{
    const rows=[];
    for(const relative of targets){
      const file=path.join(root,relative),bytes=await readFile(file),backup=`${file}.v02-txn-backup`,next=`${file}.v02-txn-next`;
      await writeFile(backup,bytes);await writeFile(next,Buffer.from('simulated-next-state'));
      rows.push({path:relative,backup_path:path.relative(root,backup).replaceAll('\\','/'),temp_path:path.relative(root,next).replaceAll('\\','/'),existed:true,old_sha256:sha(bytes),new_sha256:'a'.repeat(64)});
    }
    const statePath=path.join(root,'video/episodes/episode-001/production-state.json'),expectedStateSha=sha(await readFile(statePath));
    const partial=JSON.parse(await readFile(statePath,'utf8'));partial.stage='interrupted-partial-write';await writeFile(statePath,`${JSON.stringify(partial,null,2)}\n`);
    const journalPath=path.join(root,JOURNAL);await writeFile(journalPath,`${JSON.stringify({schema_version:1,transaction_id:'reference-calibration-approval-v02-canonical',status:'prepared',targets:rows},null,2)}\n`);
    const result=spawnSync(process.execPath,[SCRIPT],{cwd:root,encoding:'utf8',windowsHide:true,timeout:300000});
    assert.equal(result.status,0,result.stderr||result.stdout);assert.match(result.stdout,/already-applied/u);
    assert.equal(sha(await readFile(statePath)),expectedStateSha);assert.equal(await exists(journalPath),false);
    for(const relative of targets){assert.equal(await exists(`${path.join(root,relative)}.v02-txn-backup`),false);assert.equal(await exists(`${path.join(root,relative)}.v02-txn-next`),false);}
  }finally{await rm(root,{recursive:true,force:true});}
});

test('invalid restart journal fails before touching canonical state',async()=>{
  const root=await approvedWorkspace();
  try{
    const statePath=path.join(root,'video/episodes/episode-001/production-state.json'),before=sha(await readFile(statePath));
    const journalPath=path.join(root,JOURNAL);await writeFile(journalPath,'{"schema_version":1,"transaction_id":"forged","status":"prepared","targets":[]}\n');
    const result=spawnSync(process.execPath,[SCRIPT],{cwd:root,encoding:'utf8',windowsHide:true});
    assert.notEqual(result.status,0);assert.match(result.stderr,/journal schema\/target set is invalid/u);assert.equal(sha(await readFile(statePath)),before);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('recovery preflights every backup before mutating any canonical target',async()=>{
  const root=await approvedWorkspace();
  try{
    const rows=[];
    for(const relative of targets){
      const file=path.join(root,relative),bytes=await readFile(file),backup=`${file}.v02-txn-backup`,next=`${file}.v02-txn-next`;
      await writeFile(backup,bytes);await writeFile(next,Buffer.from('simulated-next-state'));
      rows.push({path:relative,backup_path:path.relative(root,backup).replaceAll('\\','/'),temp_path:path.relative(root,next).replaceAll('\\','/'),existed:true,old_sha256:sha(bytes),new_sha256:'a'.repeat(64)});
    }
    const firstTarget=path.join(root,targets[0]);
    await writeFile(firstTarget,'simulated-partial-canonical-state');
    await writeFile(path.join(root,rows.at(-1).backup_path),'corrupt-later-backup');
    const before=new Map(await Promise.all(targets.map(async(relative)=>[relative,await readFile(path.join(root,relative))])));
    const journalPath=path.join(root,JOURNAL);
    await writeFile(journalPath,`${JSON.stringify({schema_version:1,transaction_id:'reference-calibration-approval-v02-canonical',status:'prepared',targets:rows},null,2)}\n`);

    const result=spawnSync(process.execPath,[SCRIPT],{cwd:root,encoding:'utf8',windowsHide:true});
    assert.notEqual(result.status,0);assert.match(result.stderr,/recovery backup drift/u);
    for(const relative of targets)assert.deepEqual(await readFile(path.join(root,relative)),before.get(relative),`${relative} changed before recovery preflight completed`);
    assert.equal(await exists(journalPath),true);
  }finally{await rm(root,{recursive:true,force:true});}
});
