import {createHash} from 'node:crypto';
import {openSync,readSync,fstatSync,closeSync,realpathSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {dataRoot} from '../core/store.ts';
import type {FinalizationExecutionContract} from './finalization-contract.ts';
import {runFinalizationEngine} from './finalization-engine.ts';

const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
function contractBytes(file:string):Buffer{
  const fd=openSync(file,'r');try{const size=fstatSync(fd).size;if(size<1||size>5_000_000)throw new Error('finalization-contract-size');const bytes=Buffer.allocUnsafe(size);let used=0;while(used<size){const count=readSync(fd,bytes,used,size-used,used);if(!count)throw new Error('finalization-contract-short-read');used+=count;}if(fstatSync(fd).size!==size)throw new Error('finalization-contract-drift');return bytes;}finally{closeSync(fd);}
}
if(process.argv[2]==='--finalization-child'){
  const [, , ,work,contractSha]=process.argv,controller=new AbortController();
  process.on('message',message=>{if(message&&typeof message==='object'&&'type' in message&&message.type==='cancel')controller.abort();});
  let stage='resolve',diagnosticWork:string|undefined,diagnosticV2=false;
  (async()=>{
    if(!work||!/^[a-f0-9]{64}$/u.test(contractSha||'')||!process.env.VISUALMAKER_DATA_DIR)throw new Error('finalization-child-input');
    const root=realpathSync(process.cwd()),actual=realpathSync(work),data=realpathSync(dataRoot());
    if(!actual.startsWith(data+path.sep)||!/[\\/]jobs[\\/]staging[\\/][a-f0-9-]{36}[\\/]work$/iu.test(actual))throw new Error('finalization-work-path');
    const bytes=contractBytes(path.join(actual,'contract.json'));
    if(sha(bytes)!==contractSha)throw new Error('finalization-contract-sha');
    const contract=JSON.parse(bytes.toString('utf8')) as FinalizationExecutionContract;
    diagnosticWork=actual;diagnosticV2=contract.schemaVersion==='visualmaker-finalization-execution-v2';
    const result=await runFinalizationEngine({contract,rootDir:root,work:actual,signal:controller.signal,onStage:next=>{stage=next;if(process.connected)process.send?.({type:'finalization-stage',stage:next});}});
    if(process.connected)process.send?.({type:'finalization-result',result},()=>process.disconnect?.());
  })().catch(error=>{
    if(diagnosticV2&&diagnosticWork){try{
      const stages=new Set(['resolve','mix-decode','mix-pcm','mix-encode','subtitle-mux','thumbnail','verify','publish']);
      const codes=new Set(['finalization-input-drift','finalization-stream-contract','finalization-packet-identity','finalization-frame-identity','finalization-thumbnail-identity','finalization-subtitle-text','finalization-subtitle-timing','finalization-subtitle-time-format','finalization-output-exists','mix-v2-owned-cleanup-incomplete','mix-v2-command-timeout','mix-v2-tool-failed','mix-v2-mux-audio-drift','mix-v2-mux-decoded-count','mix-v2-mux-decoded-content','mix-v2-encoded-content','mix-v2-encoded-peak-or-content','mix-v2-mixer-receipt']);
      const code=error instanceof Error&&codes.has(error.message)?error.message:'unknown';
      writeFileSync(path.join(diagnosticWork,'.finalization-error.json'),JSON.stringify({stage:stages.has(stage)?stage:'unknown',code})+'\n',{flag:'wx'});
    }catch{/* A diagnostic collision must not replace the original failure. */}}
    process.exitCode=1;if(process.connected)process.send?.({type:'finalization-error',stage},()=>process.disconnect?.());
  });
}
