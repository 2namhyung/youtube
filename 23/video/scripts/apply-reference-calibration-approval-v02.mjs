import {createHash} from 'node:crypto';
import {open,readFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateReferenceCalibrationApprovalV02} from './validate-reference-calibration-approval-v02.mjs';
import {validateReferenceCorrection} from './validate-reference-correction-v02.mjs';

const ROOT=process.cwd();
const PATHS=Object.freeze({
  review:'video/qa/reference-study/motion-reverse-engineering-review-v02/manifest.json',
  supersession:'video/qa/reference-study/motion-reverse-engineering-review-v02/reference-calibration-supersession.json',
  calibrationMarker:'video/qa/reference-study/motion-reverse-engineering-review-v02/reference-calibration-approval-v02.json',
  grammarMarker:'video/qa/reference-study/motion-reverse-engineering-review-v02/reference-grammar-approval-v02.json',
  grammar:'video/episodes/episode-001/reference-grammar-contract.json',
  binding:'video/episodes/episode-001/reference-grammar-binding.json',
  gates:'video/episodes/episode-001/reference-style-gates.json',
  blueprint:'video/episodes/episode-001/generated/reference-cut-blueprint.json',
  state:'video/episodes/episode-001/production-state.json',
});
const JOURNAL_REL='video/qa/reference-study/motion-reverse-engineering-review-v02/reference-calibration-approval-v02.transaction.json';
const sha=(value)=>createHash('sha256').update(value).digest('hex');
const exists=async(file)=>{try{return(await stat(file)).isFile();}catch{return false;}};
const durableWrite=async(file,bytes)=>{const handle=await open(file,'w');try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}};
const resolveRecord=(root,value)=>path.resolve(root,value);

async function cleanupOrphans(root,files){
  for(const file of Object.values(files))for(const suffix of ['.v02-txn-backup','.v02-txn-next'])await rm(`${file}${suffix}`,{force:true});
  await rm(`${path.resolve(root,JOURNAL_REL)}.next`,{force:true});
}

async function recoverInterruptedTransaction(root,files){
  const journalFile=path.resolve(root,JOURNAL_REL);
  if(!await exists(journalFile)){await cleanupOrphans(root,files);return false;}
  let journal;
  try{journal=JSON.parse(await readFile(journalFile,'utf8'));}catch{throw new Error('v02 approval transaction journal is unreadable; refusing automatic mutation');}
  const canonicalTargetByPath=new Map(Object.entries(PATHS).filter(([key])=>!['review','supersession'].includes(key)).map(([key,value])=>[value,files[key]]));
  const expectedTargets=[...canonicalTargetByPath.keys()].sort();
  const actualTargets=(journal.targets??[]).map((row)=>row.path).sort();
  if(journal.schema_version!==1||journal.transaction_id!=='reference-calibration-approval-v02-canonical'||journal.status!=='prepared'||JSON.stringify(actualTargets)!==JSON.stringify(expectedTargets))throw new Error('v02 approval transaction journal schema/target set is invalid');
  const recovery=[];
  for(const record of journal.targets){
    const target=resolveRecord(root,record.path),backup=resolveRecord(root,record.backup_path);
    const expectedTarget=canonicalTargetByPath.get(record.path),expectedBackup=`${expectedTarget}.v02-txn-backup`,expectedTemp=`${expectedTarget}.v02-txn-next`;
    if(!expectedTarget||target!==expectedTarget||backup!==expectedBackup||resolveRecord(root,record.temp_path)!==expectedTemp||typeof record.existed!=='boolean'||!(/^[a-f0-9]{64}$/u.test(record.new_sha256??''))||(record.existed?!/^[a-f0-9]{64}$/u.test(record.old_sha256??''):record.old_sha256!==null))throw new Error(`v02 approval transaction journal path/hash constraints are invalid: ${record.path}`);
    if(record.existed){
      if(!await exists(backup))throw new Error(`v02 approval recovery backup drift: ${record.path}`);
      const bytes=await readFile(backup);
      if(sha(bytes)!==record.old_sha256)throw new Error(`v02 approval recovery backup drift: ${record.path}`);
      recovery.push({target,existed:true,bytes});
    }else{
      if(await exists(backup))throw new Error(`v02 approval recovery unexpected backup: ${record.path}`);
      recovery.push({target,existed:false,bytes:null});
    }
  }
  for(const record of recovery)if(record.existed)await durableWrite(record.target,record.bytes);else await rm(record.target,{force:true});
  await rm(journalFile,{force:true});
  await cleanupOrphans(root,files);
  return true;
}

async function main(){
  if(process.argv.length!==2)throw new Error('apply-reference-calibration-approval-v02 accepts no arguments; alternate roots/routes are forbidden');
  const root=path.resolve(ROOT);
  const files=Object.fromEntries(Object.entries(PATHS).map(([key,value])=>[key,path.resolve(root,value)]));
  await recoverInterruptedTransaction(root,files);
  const current=await validateReferenceCorrection({root,verifyMedia:true});
  if(current.status!=='reference-calibration-passed')throw new Error('v02 calibration mutation is retired; only validation of the already-applied historical chain is allowed');
  await validateReferenceCalibrationApprovalV02({root,verifyMedia:false,requireMarker:true});
  process.stdout.write('v02 reference calibration already-applied: historical 01-09 PASS and sample10 exclusion validated; no files changed\n');
}

if(path.resolve(process.argv[1]??'')===fileURLToPath(import.meta.url))await main();
