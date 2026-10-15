import {createHash, randomUUID} from 'node:crypto';
import {constants, closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, rmdirSync, statSync, unlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {validatePlan} from './director.ts';
import {measureAssetBytes} from './upload.ts';
import {measureNarrationBytes} from './narration.ts';
import {dataRoot, insertProject, openDb, StoreError} from './store.ts';
import type {Asset, NarrationTake, Plan} from './model.ts';

export const BACKUP_LIMITS={archive:128*1024*1024,payload:120*1024*1024,entries:512,media:50*1024*1024,plan:3*1024*1024,receipt:256*1024} as const;
const VERSION='visualmaker-project-backup-v1';
const SHA=/^[a-f0-9]{64}$/;
const ASSET=/^assets\/([a-f0-9]{64})\.(png|jpg|webp|mp4|webm|json|txt)$/;
const TAKE=/^narration\/([a-f0-9]{64})\.(wav|mp3|m4a)$/;
const ASSET_RECEIPT=/^receipts\/asset_[a-f0-9-]{36}\.json$/;
const TAKE_RECEIPT=/^narration-receipts\/take_[a-f0-9-]{36}\.json$/;
const ZIP_NAME=/^[a-z0-9/_\-.]+$/;
type Entry={name:string;bytes:Buffer};
type Descriptor={path:string;bytes:number;sha256:string};
type Manifest={schemaVersion:typeof VERSION;source:{projectId:string;revision:number;productionAuthority:false};plan:Descriptor;files:Descriptor[]};
type DirectoryIdentity={path:string;dev:number;ino:number};
const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
function fail(message:string,status=400):never{throw new StoreError(message,status);}
const exact=(obj:Record<string,unknown>,keys:string[])=>Object.keys(obj).length===keys.length&&keys.every(key=>Object.hasOwn(obj,key));
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))fail('백업 형식이 올바르지 않습니다.');return value as Record<string,unknown>;}
function json(bytes:Buffer,max:number):unknown{
  if(bytes.length<1||bytes.length>max)fail('백업 항목 크기가 허용 범위를 벗어났습니다.',413);
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return fail('백업 JSON을 읽을 수 없습니다.');}
}
function descriptor(name:string,bytes:Buffer):Descriptor{return {path:name,bytes:bytes.length,sha256:hash(bytes)};}
function safeRoot(){
  const root=dataRoot();
  if(!existsSync(root))fail('프로젝트 데이터 폴더가 없습니다.',404);
  directoryChain(root,root);
  return root;
}
function directoryChain(root:string,directory:string):DirectoryIdentity[]{
  if(directory!==root&&!directory.startsWith(root+path.sep))fail('프로젝트 데이터 경로가 올바르지 않습니다.',409);
  const volume=path.parse(root).root,relative=path.relative(volume,directory),parts=relative?relative.split(path.sep):[];
  let current=volume;const chain:DirectoryIdentity[]=[];
  for(const part of ['',...parts]){
    if(part)current=path.join(current,part);
    let info:ReturnType<typeof lstatSync>;
    try{info=lstatSync(current);}catch{return fail('프로젝트 데이터 경로가 없습니다.',409);}
    if(!info.isDirectory()||info.isSymbolicLink()||path.normalize(realpathSync(current)).toLowerCase()!==path.normalize(current).toLowerCase())fail('프로젝트 데이터 경로에 연결 폴더를 사용할 수 없습니다.',409);
    chain.push({path:current,dev:info.dev,ino:info.ino});
  }
  return chain;
}
function sameDirectoryChain(root:string,directory:string,before:DirectoryIdentity[]){
  const after=directoryChain(root,directory);
  if(after.length!==before.length||after.some((item,index)=>item.path!==before[index].path||item.dev!==before[index].dev||item.ino!==before[index].ino))fail('자료 처리 중 상위 폴더가 변경되었습니다.',409);
}
function checkParents(root:string,relative:string,create=false){
  if(!ZIP_NAME.test(relative)||relative.startsWith('/')||relative.includes('..')||relative.includes('\\')||relative.includes('//'))fail('백업 항목 경로가 올바르지 않습니다.');
  let parent=root;
  for(const component of relative.split('/').slice(0,-1)){
    parent=path.join(parent,component);
    if(create&&!existsSync(parent))mkdirSync(parent,{recursive:false});
    let meta:ReturnType<typeof lstatSync>;
    try{meta=lstatSync(parent);}catch{return fail('백업 자료 폴더가 없습니다.',409);}
    if(!meta.isDirectory()||meta.isSymbolicLink()||realpathSync(parent)!==parent)fail('데이터 폴더에 연결 경로를 사용할 수 없습니다.',409);
  }
  return path.join(root,...relative.split('/'));
}
function readSafe(root:string,relative:string,max:number){
  const file=checkParents(root,relative);
  const parent=path.dirname(file),chain=directoryChain(root,parent);
  let prior:ReturnType<typeof lstatSync>;
  try{prior=lstatSync(file);}catch{return fail('자료 또는 영수증 파일이 없습니다.',409);}
  if(!prior.isFile()||prior.isSymbolicLink()||prior.nlink!==1||prior.size<1)fail('자료 또는 영수증의 파일 형식·크기가 올바르지 않습니다.',409);
  if(prior.size>max)fail('자료 또는 영수증 크기가 허용 범위를 넘었습니다.',413);
  const fd=openSync(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try{
    const before=fstatSync(fd);
    if(!before.isFile()||before.nlink!==1||before.dev!==prior.dev||before.ino!==prior.ino||before.size!==prior.size||before.mtimeMs!==prior.mtimeMs)fail('읽는 중 자료가 변경되었습니다.',409);
    const bytes=Buffer.alloc(before.size);let offset=0;
    while(offset<bytes.length){const n=readSync(fd,bytes,offset,bytes.length-offset,offset);if(n<=0)fail('자료를 끝까지 읽을 수 없습니다.',409);offset+=n;}
    const after=fstatSync(fd),current=lstatSync(file);
    if(after.dev!==before.dev||after.ino!==before.ino||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs||
      current.dev!==before.dev||current.ino!==before.ino||current.size!==before.size||current.mtimeMs!==before.mtimeMs||current.nlink!==1)fail('읽는 중 자료가 변경되었습니다.',409);
    sameDirectoryChain(root,parent,chain);
    return bytes;
  }finally{closeSync(fd);}
}
function assetReceipt(asset:Asset,bytes:Buffer){
  const receipt=object(json(bytes,BACKUP_LIMITS.receipt));
  for(const [key,value] of Object.entries(asset))if(JSON.stringify(receipt[key])!==JSON.stringify(value))fail('자료 영수증이 원본 계획과 다릅니다.',409);
  return receipt;
}
function takeReceipt(take:NarrationTake,bytes:Buffer){
  const receipt=object(json(bytes,BACKUP_LIMITS.receipt));
  if(!exact(receipt,['version','take','takeSha256'])||receipt.version!==1||JSON.stringify(receipt.take)!==JSON.stringify(take)||receipt.takeSha256!==hash(JSON.stringify(take)))fail('녹음 영수증이 원본 계획과 다릅니다.',409);
}
function currentDocument(projectId:string,revision:number){
  const db=openDb();try{
    const row=db.prepare('SELECT revision,document FROM projects WHERE id=?').get(projectId) as {revision:number;document:string}|undefined;
    if(!row)fail('프로젝트를 찾을 수 없습니다.',404);
    if(row.revision!==revision)fail('프로젝트가 변경되었습니다. 최신 상태에서 백업하세요.',409);
    return row.document;
  }finally{db.close();}
}
const allowedMedia=(name:string)=>ASSET.test(name)||TAKE.test(name);
const allowedEntry=(name:string)=>name==='manifest.json'||name==='plan.json'||allowedMedia(name)||ASSET_RECEIPT.test(name)||TAKE_RECEIPT.test(name);
function orderedEntries(plan:Plan,planBytes:Buffer,root:string){
  const entries:Entry[]=[{name:'plan.json',bytes:planBytes}];const seen=new Map<string,Buffer>([['plan.json',planBytes]]);let payload=planBytes.length;
  function add(name:string,max:number){
    if(!allowedEntry(name)||name==='manifest.json'||name==='plan.json')fail('계획에 허용되지 않은 자료 경로가 있습니다.',409);
    const previous=seen.get(name);if(previous)return previous;
    if(entries.length>=BACKUP_LIMITS.entries-1||payload>=BACKUP_LIMITS.payload)fail('백업 항목 수 또는 자료 총량이 허용 범위를 넘었습니다.',413);
    const bytes=readSafe(root,name,Math.min(max,BACKUP_LIMITS.payload-payload));
    seen.set(name,bytes);entries.push({name,bytes});payload+=bytes.length;
    return bytes;
  }
  for(const asset of plan.assets){
    if(!ASSET.test(asset.path)||asset.path!==`assets/${asset.sha256}.${asset.path.split('.').at(-1)}`)fail('자료 경로와 해시가 다릅니다.',409);
    const bytes=add(asset.path,BACKUP_LIMITS.media);if(hash(bytes)!==asset.sha256)fail('자료 바이트가 변경되었습니다.',409);
    assetReceipt(asset,add(`receipts/${asset.id}.json`,BACKUP_LIMITS.receipt));
  }
  for(const take of plan.narrationTakes??[]){
    if(!TAKE.test(take.path)||take.path!==`narration/${take.sha256}.${take.format}`)fail('녹음 경로와 해시가 다릅니다.',409);
    const bytes=add(take.path,BACKUP_LIMITS.media);if(hash(bytes)!==take.sha256||bytes.length!==take.byteCount)fail('녹음 바이트가 변경되었습니다.',409);
    takeReceipt(take,add(`narration-receipts/${take.id}.json`,BACKUP_LIMITS.receipt));
  }
  return entries;
}
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);return c>>>0;});
function crc(bytes:Buffer){let c=0xffffffff;for(const byte of bytes)c=crcTable[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function zip(entries:Entry[]){
  if(entries.length>BACKUP_LIMITS.entries)fail('백업 항목 수가 허용 범위를 넘었습니다.',413);
  let payload=0;const locals:Buffer[]=[];const centers:Buffer[]=[];let offset=0;
  for(const entry of entries){
    if(!allowedEntry(entry.name)||!ZIP_NAME.test(entry.name))fail('백업 항목 이름이 올바르지 않습니다.');
    const name=Buffer.from(entry.name,'ascii'),size=entry.bytes.length,checksum=crc(entry.bytes);payload+=size;
    if(payload>BACKUP_LIMITS.payload||size>0xffffffff)fail('백업 자료 총량이 허용 범위를 넘었습니다.',413);
    const local=Buffer.alloc(30+name.length);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt32LE(checksum,14);local.writeUInt32LE(size,18);local.writeUInt32LE(size,22);local.writeUInt16LE(name.length,26);name.copy(local,30);
    const center=Buffer.alloc(46+name.length);center.writeUInt32LE(0x02014b50,0);center.writeUInt16LE(20,4);center.writeUInt16LE(20,6);center.writeUInt32LE(checksum,16);center.writeUInt32LE(size,20);center.writeUInt32LE(size,24);center.writeUInt16LE(name.length,28);center.writeUInt32LE(offset,42);name.copy(center,46);
    locals.push(local,entry.bytes);centers.push(center);offset+=local.length+size;
    if(offset>BACKUP_LIMITS.archive)fail('백업 ZIP이 허용 범위를 넘었습니다.',413);
  }
  const centralSize=centers.reduce((n,b)=>n+b.length,0),footer=Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50,0);footer.writeUInt16LE(entries.length,8);footer.writeUInt16LE(entries.length,10);footer.writeUInt32LE(centralSize,12);footer.writeUInt32LE(offset,16);
  if(offset+centralSize+footer.length>BACKUP_LIMITS.archive)fail('백업 ZIP이 허용 범위를 넘었습니다.',413);
  return Buffer.concat([...locals,...centers,footer],offset+centralSize+footer.length);
}
function unzip(bytes:Buffer){
  if(bytes.length>BACKUP_LIMITS.archive)fail('백업 ZIP이 허용 범위를 넘었습니다.',413);
  if(bytes.length<22||bytes.readUInt32LE(bytes.length-22)!==0x06054b50)fail('지원하지 않는 ZIP 끝 기록입니다.');
  const end=bytes.length-22,n=bytes.readUInt16LE(end+10),centralSize=bytes.readUInt32LE(end+12),centralOffset=bytes.readUInt32LE(end+16);
  if(n>BACKUP_LIMITS.entries)fail('ZIP 항목 수가 허용 범위를 넘었습니다.',413);
  if(bytes.readUInt16LE(end+4)!==0||bytes.readUInt16LE(end+6)!==0||bytes.readUInt16LE(end+8)!==n||bytes.readUInt16LE(end+20)!==0||n<2||n===0xffff||centralSize===0xffffffff||centralOffset===0xffffffff||centralOffset+centralSize!==end)fail('ZIP 디스크·항목 수·목록이 올바르지 않습니다.');
  const result=new Map<string,Buffer>(),folded=new Set<string>();let at=centralOffset,localEnd=0,payload=0;
  for(let i=0;i<n;i++){
    if(at+46>end||bytes.readUInt32LE(at)!==0x02014b50)fail('ZIP 중앙 목록이 손상됐습니다.');
    const made=bytes.readUInt16LE(at+4),needed=bytes.readUInt16LE(at+6),flags=bytes.readUInt16LE(at+8),method=bytes.readUInt16LE(at+10),check=bytes.readUInt32LE(at+16),size=bytes.readUInt32LE(at+20),rawSize=bytes.readUInt32LE(at+24),nameLength=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32),disk=bytes.readUInt16LE(at+34),external=bytes.readUInt32LE(at+38),offset=bytes.readUInt32LE(at+42);
    if(made!==20||needed!==20||flags!==0||method!==0||size!==rawSize||size===0xffffffff||disk!==0||external!==0||extra!==0||comment!==0||nameLength<1||at+46+nameLength>end)fail('지원하지 않는 ZIP 항목 형식입니다.');
    const name=bytes.toString('ascii',at+46,at+46+nameLength);
    if(!allowedEntry(name)||!ZIP_NAME.test(name)||Buffer.from(name,'ascii').compare(bytes.subarray(at+46,at+46+nameLength))!==0||folded.has(name.toLowerCase()))fail('ZIP 경로가 중복되거나 허용되지 않습니다.');
    folded.add(name.toLowerCase());at+=46+nameLength;
    if(offset!==localEnd||offset+30+nameLength>centralOffset||bytes.readUInt32LE(offset)!==0x04034b50||bytes.readUInt16LE(offset+4)!==20||bytes.readUInt16LE(offset+6)!==flags||bytes.readUInt16LE(offset+8)!==method||bytes.readUInt32LE(offset+14)!==check||bytes.readUInt32LE(offset+18)!==size||bytes.readUInt32LE(offset+22)!==size||bytes.readUInt16LE(offset+26)!==nameLength||bytes.readUInt16LE(offset+28)!==0||!bytes.subarray(offset+30,offset+30+nameLength).equals(Buffer.from(name,'ascii')))fail('ZIP 로컬 항목이 중앙 목록과 다릅니다.');
    const start=offset+30+nameLength;localEnd=start+size;payload+=size;
    if(localEnd>centralOffset||payload>BACKUP_LIMITS.payload)fail('ZIP 항목이 겹치거나 허용 크기를 넘습니다.',413);
    const part=bytes.subarray(start,localEnd);if(crc(part)!==check)fail('ZIP CRC가 다릅니다.');
    if(name==='manifest.json'||ASSET_RECEIPT.test(name)||TAKE_RECEIPT.test(name)){if(size>BACKUP_LIMITS.receipt)fail('ZIP 영수증이 너무 큽니다.',413);}else if(name==='plan.json'){if(size>BACKUP_LIMITS.plan)fail('ZIP 계획이 너무 큽니다.',413);}else if(size>BACKUP_LIMITS.media)fail('ZIP 미디어가 너무 큽니다.',413);
    result.set(name,part);
  }
  if(at!==end||localEnd!==centralOffset)fail('ZIP 항목 경계가 올바르지 않습니다.');
  return result;
}
function parseManifest(entries:Map<string,Buffer>){
  const bytes=entries.get('manifest.json'),planBytes=entries.get('plan.json');if(!bytes||!planBytes)fail('백업 필수 항목이 없습니다.');
  const m=object(json(bytes,BACKUP_LIMITS.receipt));if(!exact(m,['schemaVersion','source','plan','files'])||m.schemaVersion!==VERSION)fail('백업 버전 또는 목록이 올바르지 않습니다.');
  const source=object(m.source);if(!exact(source,['projectId','revision','productionAuthority'])||typeof source.projectId!=='string'||!Number.isSafeInteger(source.revision)||Number(source.revision)<1||source.productionAuthority!==false)fail('백업 출처 정보가 올바르지 않습니다.');
  if(!Array.isArray(m.files)||m.files.length!==entries.size-1)fail('백업 목록과 항목 수가 다릅니다.');
  const listed=new Set<string>();for(const item of m.files){const d=object(item);if(!exact(d,['path','bytes','sha256'])||typeof d.path!=='string'||!Number.isSafeInteger(d.bytes)||Number(d.bytes)<1||!SHA.test(String(d.sha256))||listed.has(d.path))fail('백업 파일 설명이 올바르지 않습니다.');listed.add(d.path);const content=entries.get(d.path);if(!content||content.length!==d.bytes||hash(content)!==d.sha256)fail('백업 파일의 크기·해시가 다릅니다.');}
  if(listed.size!==entries.size-1||[...entries.keys()].some(name=>name!=='manifest.json'&&!listed.has(name)))fail('백업에 누락되거나 추가된 항목이 있습니다.');
  if(JSON.stringify(m.plan)!==JSON.stringify(descriptor('plan.json',planBytes)))fail('백업 계획 바이트가 다릅니다.');
  return {manifest:m as unknown as Manifest,planBytes};
}
function requiredPaths(plan:Plan){
  const names=new Set(['plan.json']);
  for(const asset of plan.assets){if(!ASSET.test(asset.path)||asset.path!==`assets/${asset.sha256}.${asset.path.split('.').at(-1)}`||!/^asset_[a-f0-9-]{36}$/.test(asset.id))fail('자료 설명이 올바르지 않습니다.');names.add(asset.path);names.add(`receipts/${asset.id}.json`);}
  for(const take of plan.narrationTakes??[]){if(!TAKE.test(take.path)||take.path!==`narration/${take.sha256}.${take.format}`||!/^take_[a-f0-9-]{36}$/.test(take.id))fail('녹음 설명이 올바르지 않습니다.');names.add(take.path);names.add(`narration-receipts/${take.id}.json`);}
  return names;
}
function assertComplete(plan:Plan,entries:Map<string,Buffer>){
  const names=requiredPaths(plan);if(names.size!==entries.size-1||[...names].some(name=>!entries.has(name)))fail('계획의 입력과 ZIP 항목이 다릅니다.');
  for(const asset of plan.assets){const media=entries.get(asset.path)!;if(hash(media)!==asset.sha256)fail('자료 원본이 변경됐습니다.');assetReceipt(asset,entries.get(`receipts/${asset.id}.json`)!);}
  for(const take of plan.narrationTakes??[]){const media=entries.get(take.path)!;if(hash(media)!==take.sha256||media.length!==take.byteCount)fail('녹음 원본이 변경됐습니다.');takeReceipt(take,entries.get(`narration-receipts/${take.id}.json`)!);}
}
export function exportProjectBackup(projectId:string,baseRevision:number){
  if(!/^[-a-zA-Z0-9_]{1,200}$/.test(projectId)||!Number.isSafeInteger(baseRevision)||baseRevision<1)fail('프로젝트와 버전을 확인하세요.');
  const root=safeRoot();
  const rootChain=directoryChain(root,root);
  const document=currentDocument(projectId,baseRevision);
  if(Buffer.byteLength(document,'utf8')>BACKUP_LIMITS.plan)fail('계획이 백업 크기 제한을 넘었습니다.',413);
  const plan=validatePlan(JSON.parse(document));
  if(plan.id!==projectId||plan.revision!==baseRevision)fail('프로젝트 버전이 일치하지 않습니다.',409);
  const planBytes=Buffer.from(document,'utf8');if(planBytes.length>BACKUP_LIMITS.plan)fail('계획이 백업 크기 제한을 넘었습니다.',413);
  const entries=orderedEntries(plan,planBytes,root);
  if(currentDocument(projectId,baseRevision)!==document)fail('백업 중 프로젝트가 변경됐습니다.',409);
  sameDirectoryChain(root,root,rootChain);
  const manifest:Manifest={schemaVersion:VERSION,source:{projectId,revision:baseRevision,productionAuthority:false},plan:descriptor('plan.json',planBytes),files:entries.map(item=>descriptor(item.name,item.bytes))};
  const manifestBytes=Buffer.from(JSON.stringify(manifest));if(manifestBytes.length>BACKUP_LIMITS.receipt)fail('백업 목록이 너무 큽니다.',413);
  const bytes=zip([{name:'manifest.json',bytes:manifestBytes},...entries]);
  return {bytes,filename:`visualmaker-project-${baseRevision}.zip`};
}
function stageRoot(root:string){
  const staging=checkParents(root,'backup-staging/placeholder',true);void staging;
  const directory=path.join(root,'backup-staging',`copy-${randomUUID()}`);mkdirSync(directory,{recursive:false});
  if(realpathSync(directory)!==directory)fail('임시 경로가 올바르지 않습니다.',409);
  return directory;
}
function publish(root:string,name:string,bytes:Buffer,owned:Array<{path:string;dev:number;ino:number}>,reusable:boolean){
  const file=checkParents(root,name,true);
  const parent=path.dirname(file),chain=directoryChain(root,parent);
  try{
    const fd=openSync(file,'wx');try{const stat=fstatSync(fd);owned.push({path:file,dev:stat.dev,ino:stat.ino});writeFileSync(fd,bytes);}finally{closeSync(fd);}
  }catch(error){
    if(!(error&&typeof error==='object'&&'code' in error&&error.code==='EEXIST'))throw error;
    if(!reusable||!readSafe(root,name,BACKUP_LIMITS.media).equals(bytes))fail('기존 저장 파일의 바이트가 다릅니다.',409);
  }
  sameDirectoryChain(root,parent,chain);
  return chain;
}
function cleanupOwned(owned:Array<{path:string;dev:number;ino:number}>){for(const file of owned.reverse())try{const current=lstatSync(file.path);if(current.dev===file.dev&&current.ino===file.ino&&current.nlink===1)unlinkSync(file.path);}catch{/* Preserve the original error. */}}
export async function restoreProjectBackup(archive:Buffer){
  const entries=unzip(archive),{manifest,planBytes}=parseManifest(entries),raw=json(planBytes,BACKUP_LIMITS.plan),source=validatePlan(raw);
  if(source.id!==manifest.source.projectId||source.revision!==manifest.source.revision||source.productionAuthority!==false)fail('백업 출처와 계획이 다릅니다.');
  assertComplete(source,entries);
  const root=safeRoot(),rootChain=directoryChain(root,root);
  checkParents(root,'staging/placeholder',true);
  for(const asset of source.assets){const bytes=entries.get(asset.path)!;const measured=await measureAssetBytes(bytes,asset.mediaType,asset.mediaType==='data'&&asset.path.endsWith('.json')?'json':'txt');
    if(asset.path!==`assets/${asset.sha256}.${measured.ext}`||asset.mimeType!==measured.mimeType||asset.width!==measured.width||asset.height!==measured.height||asset.durationSeconds!==measured.durationSeconds)fail('복원 자료의 실제 형식·측정값이 다릅니다.',409);
  }
  for(const take of source.narrationTakes??[]){const bytes=entries.get(take.path)!;const measured=measureNarrationBytes(bytes);
    if(take.format!==measured.format||take.mimeType!==measured.mimeType||take.sampleRate!==measured.sampleRate||take.channels!==measured.channels||take.durationSeconds!==measured.durationSeconds)fail('복원 녹음의 실제 측정값이 다릅니다.',409);
  }
  const now=new Date().toISOString(),newId=`project_${randomUUID()}`,idMap=new Map<string,string>();
  const assets=source.assets.map(asset=>{const id=`asset_${randomUUID()}`;idMap.set(asset.id,id);return {...asset,id};});
  const takes=(source.narrationTakes??[]).map(take=>{const id=`take_${randomUUID()}`;idMap.set(take.id,id);return {...take,id,projectId:newId};});
  const timings=(source.narrationTimings??[]).map(timing=>({...timing,id:`timing_${randomUUID()}`,projectId:newId,takeId:idMap.get(timing.takeId)!,manualReviewConfirmed:undefined,manualReviewConfirmedAt:undefined}));
  for(const timing of timings){delete timing.manualReviewConfirmed;delete timing.manualReviewConfirmedAt;}
  const copied=validatePlan({...source,id:newId,createdAt:now,updatedAt:now,assets,requirements:source.requirements.map(requirement=>({...requirement,assetId:requirement.assetId===null?null:idMap.get(requirement.assetId)!})),
    scenes:source.scenes.map(scene=>{const copy={...scene};delete copy.originCutIds;return copy;}),sourceReviews:[],narrationTakes:takes,narrationTimings:timings,origin:undefined,aiAnalysisAdoption:undefined});
  const owned:Array<{path:string;dev:number;ino:number}>=[],staged:Array<{path:string;dev:number;ino:number}>=[],published:Array<{name:string;bytes:Buffer;chain:DirectoryIdentity[]}>=[],stage=stageRoot(root),stageChain=directoryChain(root,stage);
  let committed=false;
  try{
    for(const [name,bytes] of entries)if(allowedMedia(name)){
      sameDirectoryChain(root,stage,stageChain);
      const file=path.join(stage,`input-${randomUUID()}`),fd=openSync(file,'wx');
      try{const stat=fstatSync(fd),visible=lstatSync(file);staged.push({path:file,dev:stat.dev,ino:stat.ino});
        if(!visible.isFile()||visible.isSymbolicLink()||visible.nlink!==1||visible.dev!==stat.dev||visible.ino!==stat.ino||realpathSync(file)!==file)fail('복원 임시 파일이 변경됐습니다.',409);
        sameDirectoryChain(root,stage,stageChain);writeFileSync(fd,bytes);
      }finally{closeSync(fd);}
      sameDirectoryChain(root,stage,stageChain);
      if(!readSafe(stage,path.basename(file),BACKUP_LIMITS.media).equals(bytes))fail('복원 임시 파일이 변경됐습니다.',409);
    }
    function addPublished(name:string,bytes:Buffer,reusable:boolean){const chain=publish(root,name,bytes,owned,reusable);published.push({name,bytes,chain});}
    for(const [name,bytes] of entries)if(allowedMedia(name))addPublished(name,bytes,true);
    for(let i=0;i<assets.length;i++){
      const refreshed=assets[i];addPublished(`receipts/${assets[i].id}.json`,Buffer.from(JSON.stringify(refreshed)),false);
    }
    for(const take of takes){const receipt={version:1,take,takeSha256:hash(JSON.stringify(take))};addPublished(`narration-receipts/${take.id}.json`,Buffer.from(JSON.stringify(receipt)),false);}
    sameDirectoryChain(root,root,rootChain);
    sameDirectoryChain(root,stage,stageChain);
    for(const item of published){sameDirectoryChain(root,path.dirname(path.join(root,...item.name.split('/'))),item.chain);
      if(!readSafe(root,item.name,allowedMedia(item.name)?BACKUP_LIMITS.media:BACKUP_LIMITS.receipt).equals(item.bytes))fail('게시 전 자료가 변경되었습니다.',409);}
    const saved=insertProject(copied,false);committed=true;
    return {plan:saved,summary:{sourceProjectId:source.id,sourceRevision:source.revision,assets:assets.length,recordings:takes.length,timingDrafts:timings.length,clearedSourceReviews:(source.sourceReviews??[]).length,clearedSourceReceiptExtensions:source.assets.filter(asset=>Object.keys(assetReceipt(asset,entries.get(`receipts/${asset.id}.json`)!)).length>Object.keys(asset).length).length,clearedAIAdoption:source.aiAnalysisAdoption?1:0,clearedEpisodeOrigin:source.origin?1:0,clearedSceneOriginCutIds:source.scenes.filter(scene=>scene.originCutIds?.length).length,clearedTimingAttestations:(source.narrationTimings??[]).filter(t=>t.manualReviewConfirmed).length,productionAuthority:false}};
  }catch(error){
    let definitelyAbsent=false;
    if(!committed)try{const db=openDb();try{definitelyAbsent=!db.prepare('SELECT id FROM projects WHERE id=?').get(newId);}finally{db.close();}}catch{/* Unknown commit state: preserve the created files. */}
    if(definitelyAbsent)cleanupOwned(owned);
    throw error;
  }
  finally{cleanupOwned(staged);try{rmdirSync(stage);}catch{/* A crash or conflicting staging file must not imply success. */}}
}
