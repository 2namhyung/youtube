import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {closeSync,existsSync,fstatSync,lstatSync,mkdirSync,openSync,readSync,readdirSync,realpathSync,rmSync,statSync,writeSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {dataRoot} from '../core/store.ts';
import {MIX_CHANNELS,MIX_MAX_DECODED_BYTES,MIX_SAMPLE_RATE,parseFixedGainMixContract,fixedGainMixContractSha256,type FixedGainMixContract,type MixInput,type MixStem} from './fixed-gain-mix-contract.ts';

const OUTPUT_NAME='technical-fixed-gain-mix.wav';
const RECEIPT_NAME='technical-fixed-gain-mix.json';
const CEILING=10**(-1/20);
const CHUNK_SAMPLES=4096;
async function checkpoint(deadline:number,signal?:AbortSignal,yieldNow=false):Promise<void>{
  if(signal?.aborted)throw new Error('fixed-gain-mix-aborted');
  if(Date.now()>=deadline)throw new Error('fixed-gain-mix-timeout');
  if(yieldNow){await new Promise<void>(resolve=>setImmediate(resolve));if(signal?.aborted)throw new Error('fixed-gain-mix-aborted');if(Date.now()>=deadline)throw new Error('fixed-gain-mix-timeout');}
}
const identity=(fd:number)=>{const stat=fstatSync(fd,{bigint:true});if(stat.ino===0n)throw new Error('fixed-gain-mix-input-identity-unavailable');return `${stat.dev}:${stat.ino}`;};

function physicalDirectory(dir:string):string{
  const absolute=path.resolve(dir),root=path.parse(absolute).root;
  let current=root;
  for(const part of absolute.slice(root.length).split(path.sep).filter(Boolean)){
    current=path.join(current,part);
    const stat=lstatSync(current);
    if(stat.isSymbolicLink()||!stat.isDirectory()||realpathSync(current)!==current)throw new Error('fixed-gain-mix-path-link');
  }
  return absolute;
}
function physicalInput(root:string,relative:string):string{
  const absolute=path.resolve(root,...relative.split('/'));
  if(!absolute.startsWith(root+path.sep))throw new Error('fixed-gain-mix-input-escape');
  const parent=physicalDirectory(path.dirname(absolute));
  if(!parent.startsWith(root+path.sep)&&parent!==root)throw new Error('fixed-gain-mix-input-escape');
  const stat=lstatSync(absolute);
  if(stat.isSymbolicLink()||!stat.isFile()||realpathSync(absolute)!==absolute)throw new Error('fixed-gain-mix-input-link');
  return absolute;
}
async function fingerprint(file:string,maximum:number,deadline:number,signal?:AbortSignal):Promise<{bytes:number;sha256:string;identity:string}>{
  const fd=openSync(file,'r');try{
    const stat=fstatSync(fd);if(!stat.isFile()||stat.size<1||stat.size>maximum)throw new Error('fixed-gain-mix-file-size');
    const hash=createHash('sha256'),buf=Buffer.allocUnsafe(64*1024);let bytes=0;
    for(;;){if(bytes%(1024*1024)===0)await checkpoint(deadline,signal,true);const read=readSync(fd,buf,0,buf.length,null);if(!read)break;bytes+=read;if(bytes>maximum)throw new Error('fixed-gain-mix-file-size');hash.update(buf.subarray(0,read));}
    if(bytes!==stat.size||fstatSync(fd).size!==stat.size)throw new Error('fixed-gain-mix-file-drift');
    return {bytes,sha256:hash.digest('hex'),identity:identity(fd)};
  }finally{closeSync(fd);}
}
async function boundInput(root:string,input:MixInput,deadline:number,signal?:AbortSignal):Promise<{file:string;identity:string}>{
  const file=physicalInput(root,input.path),fp=await fingerprint(file,input.bytes,deadline,signal);
  if(fp.bytes!==input.bytes||fp.sha256!==input.sha256)throw new Error('fixed-gain-mix-input-drift');
  if(physicalInput(root,input.path)!==file)throw new Error('fixed-gain-mix-input-drift');
  return {file,identity:fp.identity};
}
async function stageInput(root:string,input:MixInput,work:string,index:number,expectedIdentity:string,deadline:number,signal?:AbortSignal):Promise<string>{
  const original=physicalInput(root,input.path),staged=path.join(work,`${index}${path.extname(input.path).toLowerCase()}`),readFd=openSync(original,'r');let writeFd:number|undefined;
  try{
    writeFd=openSync(staged,'wx');
    const before=fstatSync(readFd);if(!before.isFile()||before.size!==input.bytes||identity(readFd)!==expectedIdentity)throw new Error('fixed-gain-mix-input-drift');
    const hash=createHash('sha256'),buffer=Buffer.allocUnsafe(64*1024);let bytes=0;
    while(bytes<input.bytes){if(bytes%(1024*1024)===0)await checkpoint(deadline,signal,true);const read=readSync(readFd,buffer,0,Math.min(buffer.length,input.bytes-bytes),bytes);if(read<1)throw new Error('fixed-gain-mix-input-drift');hash.update(buffer.subarray(0,read));if(writeSync(writeFd,buffer,0,read)!==read)throw new Error('fixed-gain-mix-stage-write');bytes+=read;}
    if(fstatSync(readFd).size!==before.size||identity(readFd)!==expectedIdentity||hash.digest('hex')!==input.sha256||(await fingerprint(staged,input.bytes,deadline,signal)).sha256!==input.sha256)throw new Error('fixed-gain-mix-input-drift');
  }finally{if(writeFd!==undefined)closeSync(writeFd);closeSync(readFd);}
  const after=await boundInput(root,input,deadline,signal);if(after.file!==original||after.identity!==expectedIdentity)throw new Error('fixed-gain-mix-input-drift');
  return staged;
}
async function ffmpeg(args:string[],deadline:number,signal?:AbortSignal,watchFile?:string,watchLimit?:number):Promise<string>{
  if(signal?.aborted)throw new Error('fixed-gain-mix-aborted');
  const remaining=deadline-Date.now();if(remaining<=0)throw new Error('fixed-gain-mix-timeout');
  return await new Promise((resolve,reject)=>{
    const child=spawn('ffmpeg',args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderrBytes=0,done=false,reason:Error|undefined;
    const kill=(error:Error)=>{if(reason)return;reason=error;child.kill('SIGKILL');};
    const timer=setTimeout(()=>kill(new Error('fixed-gain-mix-timeout')),remaining);
    const watch=setInterval(()=>{try{if(watchFile&&existsSync(watchFile)&&statSync(watchFile).size>(watchLimit??MIX_MAX_DECODED_BYTES))kill(new Error('fixed-gain-mix-decoded-limit'));}catch{kill(new Error('fixed-gain-mix-output-watch'));}},25);
    const abort=()=>kill(new Error('fixed-gain-mix-aborted'));signal?.addEventListener('abort',abort,{once:true});
    const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);clearInterval(watch);signal?.removeEventListener('abort',abort);if(error||reason)reject(error??reason);else resolve(stdout.trim());};
    child.stdout.on('data',(chunk:Buffer)=>{if(Buffer.byteLength(stdout)+chunk.length>4096)kill(new Error('fixed-gain-mix-stdout-limit'));else stdout+=chunk.toString('utf8');});
    child.stderr.on('data',(chunk:Buffer)=>{stderrBytes+=chunk.length;if(stderrBytes>64*1024)kill(new Error('fixed-gain-mix-stderr-limit'));});
    child.once('error',()=>finish(new Error('fixed-gain-mix-ffmpeg-unavailable')));
    child.once('close',code=>finish(reason??(code===0?undefined:new Error('fixed-gain-mix-ffmpeg-failed'))));
  });
}
async function assertFiniteRaw(file:string,expectedSamples:number,deadline:number,signal?:AbortSignal):Promise<void>{
  const expected=expectedSamples*MIX_CHANNELS*4,stat=statSync(file);
  if(stat.size!==expected||expected<1)throw new Error('fixed-gain-mix-decoded-samples');
  const fd=openSync(file,'r');try{
    const buffer=Buffer.allocUnsafe(CHUNK_SAMPLES*MIX_CHANNELS*4);let offset=0;
    while(offset<expected){if(offset%(1024*1024)===0)await checkpoint(deadline,signal,true);const length=Math.min(buffer.length,expected-offset),read=readSync(fd,buffer,0,length,offset);if(read!==length)throw new Error('fixed-gain-mix-decoded-read');for(let i=0;i<read;i+=4)if(!Number.isFinite(buffer.readFloatLE(i)))throw new Error('fixed-gain-mix-nonfinite-input');offset+=read;}
    if(fstatSync(fd).size!==expected)throw new Error('fixed-gain-mix-decoded-drift');
  }finally{closeSync(fd);}
}
function wavHeader(dataBytes:number):Buffer{
  const buffer=Buffer.alloc(44);buffer.write('RIFF',0);buffer.writeUInt32LE(dataBytes+36,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(3,20);buffer.writeUInt16LE(MIX_CHANNELS,22);buffer.writeUInt32LE(MIX_SAMPLE_RATE,24);buffer.writeUInt32LE(MIX_SAMPLE_RATE*MIX_CHANNELS*4,28);buffer.writeUInt16LE(MIX_CHANNELS*4,32);buffer.writeUInt16LE(32,34);buffer.write('data',36);buffer.writeUInt32LE(dataBytes,40);return buffer;
}
async function mixRaw(raws:string[],contract:FixedGainMixContract,wav:string,deadline:number,onCreated:(fileIdentity:string)=>void,signal?:AbortSignal):Promise<{peak:number;rms:number;clippingCount:number}>{
  const inputs:[MixInput|MixStem,string,number,number][]=[[contract.voice,raws[0],0,1],...contract.stems.map((stem,index)=>[stem,raws[index+1],stem.startSample,10**(stem.gainDb/20)] as [MixStem,string,number,number])];
  const fds:number[]=[];let out:number|undefined;
  let peak=0,squares=0,clippingCount=0;
  try{
    for(const [,file] of inputs)fds.push(openSync(file,'r'));
    out=openSync(wav,'wx');onCreated(identity(out));
    writeSync(out,wavHeader(contract.durationSamples*MIX_CHANNELS*4));
    for(let start=0;start<contract.durationSamples;start+=CHUNK_SAMPLES){
      await checkpoint(deadline,signal,true);
      const frames=Math.min(CHUNK_SAMPLES,contract.durationSamples-start),sum=new Float64Array(frames*MIX_CHANNELS);
      for(let j=0;j<inputs.length;j++){
        const [input,,offset,gain]=inputs[j],first=Math.max(start,offset),last=Math.min(start+frames,offset+input.decodedSamples);
        if(first>=last)continue;
        const bytes=(last-first)*MIX_CHANNELS*4,buffer=Buffer.allocUnsafe(bytes),position=(first-offset)*MIX_CHANNELS*4;
        if(readSync(fds[j],buffer,0,bytes,position)!==bytes)throw new Error('fixed-gain-mix-decoded-drift');
        for(let i=0;i<bytes/4;i++){const sample=buffer.readFloatLE(i*4);if(!Number.isFinite(sample))throw new Error('fixed-gain-mix-nonfinite-input');sum[(first-start)*MIX_CHANNELS+i]+=sample*gain;}
      }
      const result=Buffer.allocUnsafe(frames*MIX_CHANNELS*4);
      for(let i=0;i<sum.length;i++){
        const sample=sum[i];if(!Number.isFinite(sample))throw new Error('fixed-gain-mix-nonfinite-output');
        peak=Math.max(peak,Math.abs(sample));if(Math.abs(sample)>=1)clippingCount++;
        if(Math.abs(sample)>CEILING)throw new Error('fixed-gain-mix-peak-ceiling');
        const encoded=Math.fround(sample);if(!Number.isFinite(encoded))throw new Error('fixed-gain-mix-nonfinite-output');
        squares+=encoded*encoded;result.writeFloatLE(encoded,i*4);
      }
      writeSync(out,result);
    }
    if(fstatSync(out).size!==44+contract.durationSamples*MIX_CHANNELS*4)throw new Error('fixed-gain-mix-output-size');
    return {peak,rms:Math.sqrt(squares/(contract.durationSamples*MIX_CHANNELS)),clippingCount};
  }finally{if(out!==undefined)closeSync(out);fds.forEach(closeSync);}
}
function removeOwned(file:string,expectedIdentity:string|undefined):void{
  if(!expectedIdentity||!existsSync(file))return;
  try{
    if(lstatSync(file).isSymbolicLink())return;
    const fd=openSync(file,'r');let current:string;
    try{current=identity(fd);}finally{closeSync(fd);}
    if(current===expectedIdentity)rmSync(file);
  }catch{/* Preserve a file whose identity cannot be verified. */}
}
export type FixedGainMixReceipt={schemaVersion:'visualmaker-fixed-gain-mix-receipt-v1';artifactKind:'technical-fixed-gain-mix';contractSha256:string;ffmpegVersion:string;sampleRate:48000;channels:2;sampleCount:number;inputs:Array<{id:string;kind:'voice'|'music'|'sfx';path:string;bytes:number;sha256:string;decodedSamples:number;startSample:number;gainDb:number}>;output:{name:string;bytes:number;sha256:string};peak:number;rms:number;clippingCount:number;productionAuthority:false;reviewApproved:false;productionEligible:false};
export async function runFixedGainMix(input:{contract:unknown;repositoryRoot:string;outputDir:string;signal?:AbortSignal;timeoutMs?:number;privateFinalizationStagingRoot?:string}):Promise<FixedGainMixReceipt>{
  const contract=parseFixedGainMixContract(input.contract),root=physicalDirectory(input.repositoryRoot),output=physicalDirectory(input.outputDir),temp=physicalDirectory(os.tmpdir());
  const privateStaging=input.privateFinalizationStagingRoot?physicalDirectory(input.privateFinalizationStagingRoot):null;
  const actualStaging=privateStaging?physicalDirectory(path.join(dataRoot(),'jobs','staging')):null;
  const finalizationOutput=privateStaging&&actualStaging&&path.dirname(privateStaging)===actualStaging&&/^[a-f0-9-]{36}$/iu.test(path.basename(privateStaging))&&path.dirname(root)===privateStaging&&path.dirname(output)===root&&/^vm-fixed-gain-v2-[A-Za-z0-9]+$/u.test(path.basename(root))&&path.basename(output)==='vm-fixed-gain-output';
  if((privateStaging?!finalizationOutput:!output.startsWith(temp+path.sep))||!path.basename(output).startsWith('vm-fixed-gain-')||readdirSync(output).length!==0)throw new Error('fixed-gain-mix-output-root');
  const timeout=input.timeoutMs??120_000;if(!Number.isSafeInteger(timeout)||timeout<100||timeout>120_000)throw new Error('fixed-gain-mix-timeout-contract');
  const deadline=Date.now()+timeout,inputs=[contract.voice,...contract.stems],paths:{file:string;identity:string}[]=[];
  const work=path.join(output,`.mix-work-${randomUUID()}`),wav=path.join(output,OUTPUT_NAME),receiptFile=path.join(output,RECEIPT_NAME);
  mkdirSync(work);
  let ownedWavIdentity:string|undefined,ownedReceiptIdentity:string|undefined;
  try{
    const rawFiles:string[]=[];
    const identities=new Set<string>();
    for(const item of inputs){const bound=await boundInput(root,item,deadline,input.signal);if(identities.has(bound.identity))throw new Error('fixed-gain-mix-duplicate-physical-input');identities.add(bound.identity);paths.push(bound);}
    const version=(await ffmpeg(['-version'],deadline,input.signal)).split(/\r?\n/u)[0];if(!version.startsWith('ffmpeg version '))throw new Error('fixed-gain-mix-ffmpeg-version');
    for(let index=0;index<paths.length;index++){
      const item=inputs[index],file=await stageInput(root,item,work,index,paths[index].identity,deadline,input.signal),raw=path.join(work,`${index}.f32le`),max=item.decodedSamples*MIX_CHANNELS*4;
      if(physicalInput(root,item.path)!==paths[index].file)throw new Error('fixed-gain-mix-input-drift');
      await ffmpeg(['-nostdin','-hide_banner','-loglevel','error','-protocol_whitelist','file','-i',file,'-map','0:a:0','-vn','-sn','-dn','-ac',String(MIX_CHANNELS),'-ar',String(MIX_SAMPLE_RATE),'-c:a','pcm_f32le','-f','f32le',raw],deadline,input.signal,raw,max);
      await assertFiniteRaw(raw,item.decodedSamples,deadline,input.signal);rawFiles.push(raw);
    }
    for(let index=0;index<inputs.length;index++)if((await boundInput(root,inputs[index],deadline,input.signal)).identity!==paths[index].identity)throw new Error('fixed-gain-mix-input-drift');
    const measured=await mixRaw(rawFiles,contract,wav,deadline,fileIdentity=>{ownedWavIdentity=fileIdentity;},input.signal);
    for(let index=0;index<inputs.length;index++)if((await boundInput(root,inputs[index],deadline,input.signal)).identity!==paths[index].identity)throw new Error('fixed-gain-mix-input-drift');
    await checkpoint(deadline,input.signal,true);
    const outputFile=await fingerprint(wav,44+contract.durationSamples*MIX_CHANNELS*4,deadline,input.signal);
    await checkpoint(deadline,input.signal,true);
    const result:FixedGainMixReceipt={schemaVersion:'visualmaker-fixed-gain-mix-receipt-v1',artifactKind:'technical-fixed-gain-mix',contractSha256:fixedGainMixContractSha256(contract),ffmpegVersion:version,sampleRate:48_000,channels:2,sampleCount:contract.durationSamples,inputs:inputs.map((item,index)=>({id:item.id,kind:index===0?'voice':(item as MixStem).kind,path:item.path,bytes:item.bytes,sha256:item.sha256,decodedSamples:item.decodedSamples,startSample:index===0?0:(item as MixStem).startSample,gainDb:item.gainDb})),output:{name:OUTPUT_NAME,bytes:outputFile.bytes,sha256:outputFile.sha256},...measured,productionAuthority:false,reviewApproved:false,productionEligible:false};
    await checkpoint(deadline,input.signal,true);
    const receiptBytes=Buffer.from(JSON.stringify(result,null,2)+'\n'),receiptFd=openSync(receiptFile,'wx');
    try{ownedReceiptIdentity=identity(receiptFd);let written=0;while(written<receiptBytes.length){const count=writeSync(receiptFd,receiptBytes,written,receiptBytes.length-written);if(count<1)throw new Error('fixed-gain-mix-receipt-write');written+=count;}}finally{closeSync(receiptFd);}
    await checkpoint(deadline,input.signal,true);
    if(physicalDirectory(output)!==output||lstatSync(wav).isSymbolicLink()||lstatSync(receiptFile).isSymbolicLink())throw new Error('fixed-gain-mix-output-drift');
    const finalWav=await fingerprint(wav,44+contract.durationSamples*MIX_CHANNELS*4,deadline,input.signal),finalReceipt=await fingerprint(receiptFile,receiptBytes.length,deadline,input.signal);
    if(finalWav.identity!==ownedWavIdentity||finalWav.bytes!==outputFile.bytes||finalWav.sha256!==outputFile.sha256||finalReceipt.identity!==ownedReceiptIdentity||finalReceipt.bytes!==receiptBytes.length||finalReceipt.sha256!==createHash('sha256').update(receiptBytes).digest('hex'))throw new Error('fixed-gain-mix-output-drift');
    await checkpoint(deadline,input.signal,true);
    return result;
  }catch(error){removeOwned(receiptFile,ownedReceiptIdentity);removeOwned(wav,ownedWavIdentity);throw error;
  }finally{if(existsSync(work)&&realpathSync(work)===work)rmSync(work,{recursive:true,force:true});}
}
