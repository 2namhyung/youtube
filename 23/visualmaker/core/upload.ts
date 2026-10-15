import {createHash, randomUUID} from 'node:crypto';
import {closeSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, realpathSync, writeFileSync, unlinkSync, rmdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
import {attachAssetBytes, dataRoot, getProject, StoreError} from './store.ts';
import type {Asset,Plan,Requirement} from './model.ts';

function checkedProbeDirectory(directory:string){
  const volume=path.parse(directory).root,parts=path.relative(volume,directory).split(path.sep).filter(Boolean);
  let current=volume;const chain:Array<{path:string;dev:number;ino:number}>=[];
  for(const part of ['',...parts]){
    if(part)current=path.join(current,part);
    const stat=lstatSync(current);
    if(!stat.isDirectory()||stat.isSymbolicLink()||path.normalize(realpathSync(current)).toLowerCase()!==path.normalize(current).toLowerCase())
      throw new StoreError('영상 측정 경로에 연결 폴더를 사용할 수 없습니다.',409);
    chain.push({path:current,dev:stat.dev,ino:stat.ino});
  }
  return chain;
}
function sameProbeDirectory(chain:ReturnType<typeof checkedProbeDirectory>){
  const next=checkedProbeDirectory(chain.at(-1)!.path);
  if(next.length!==chain.length||next.some((item,index)=>item.path!==chain[index].path||item.dev!==chain[index].dev||item.ino!==chain[index].ino))
    throw new StoreError('영상 측정 중 폴더가 변경되었습니다.',409);
}

/** The same byte-level measurement is used for intake and portable-copy restore. */
export async function measureAssetBytes(bytes: Buffer, mediaType: Asset['mediaType'], dataFormat: 'txt'|'json'='txt') {
  if (!bytes.length || bytes.length > 40_000_000) throw new StoreError('파일은 40MB 이하여야 합니다.',413);
  let ext = ''; let mimeType = ''; let width:number|null=null; let height:number|null=null; let durationSeconds:number|null=null;
  if (mediaType === 'image') {
    const meta = await sharp(bytes,{limitInputPixels:40_000_000}).metadata();
    if (!meta.width || !meta.height || !['png','jpeg','webp'].includes(meta.format || '') || (meta.pages || 1)>1) throw new StoreError('단일 PNG/JPG/WebP 이미지가 필요합니다.');
    await sharp(bytes,{limitInputPixels:40_000_000}).raw().toBuffer();
    width=meta.width;height=meta.height;ext=meta.format==='jpeg'?'jpg':meta.format!;mimeType=`image/${meta.format}`;
  } else if (mediaType==='video') {
    ext=bytes.subarray(4,8).toString()==='ftyp'?'mp4':bytes.subarray(0,4).toString('hex')==='1a45dfa3'?'webm':'';
    if (!ext) throw new StoreError('MP4 또는 WebM 영상이 필요합니다.');
    mimeType=`video/${ext}`;
  } else {
    if (bytes.length>2_000_000 || bytes.includes(0)) throw new StoreError('근거 데이터는 2MB 이하 UTF-8 TXT/JSON으로 등록하세요.');
    const value=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    if(dataFormat==='json')try{JSON.parse(value);}catch{throw new StoreError('JSON 근거 데이터의 내용이 올바르지 않습니다.');}
    ext=dataFormat;mimeType=dataFormat==='json'?'application/json':'text/plain';
  }
  if (mediaType==='video') {
    const root=dataRoot();checkedProbeDirectory(root);
    const staging=path.join(root,'staging');
    if(!lstatSync(root).isDirectory())throw new StoreError('영상 측정 경로가 올바르지 않습니다.',409);
    try{mkdirSync(staging);}catch(error){if(!(error&&typeof error==='object'&&'code' in error&&error.code==='EEXIST'))throw error;}
    const stagingChain=checkedProbeDirectory(staging);
    const temporary=mkdtempSync(path.join(staging,'probe-'));
    const file=path.join(temporary,`input.${ext}`);
    const privateChain=checkedProbeDirectory(temporary),privateIdentity=lstatSync(temporary);
    let created:{dev:number;ino:number}|null=null;
    try {
      sameProbeDirectory(stagingChain);sameProbeDirectory(privateChain);
      const fd=openSync(file,'wx');
      try{
        const stat=fstatSync(fd);created={dev:stat.dev,ino:stat.ino};
        const visible=lstatSync(file);
        if(!visible.isFile()||visible.isSymbolicLink()||visible.nlink!==1||visible.dev!==stat.dev||visible.ino!==stat.ino||realpathSync(file)!==file)
          throw new StoreError('영상 측정 임시 파일이 바뀌었습니다.',409);
        sameProbeDirectory(stagingChain);sameProbeDirectory(privateChain);
        writeFileSync(fd,bytes);
      }finally{closeSync(fd);}
      sameProbeDirectory(stagingChain);sameProbeDirectory(privateChain);
      const probe=spawnSync('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',file],{encoding:'utf8',windowsHide:true,timeout:15_000,maxBuffer:1_000_000});
      if(probe.status!==0) throw new StoreError('영상 스트림을 읽을 수 없습니다. ffprobe와 파일을 확인하세요.');
      const p=JSON.parse(probe.stdout);const stream=p.streams?.find((s:{codec_type:string})=>s.codec_type==='video');
      durationSeconds=Number(stream?.duration || p.format?.duration);
      width=Number(stream?.width);height=Number(stream?.height);
      if(!width||!height||!Number.isFinite(durationSeconds)||durationSeconds<=0) throw new StoreError('양수 길이의 영상 스트림이 필요합니다.');
    } finally {
      try{if(created){const visible=lstatSync(file);if(visible.dev===created.dev&&visible.ino===created.ino&&visible.nlink===1)unlinkSync(file);}}catch{/* Preserve the measurement failure. */}
      try{const visible=lstatSync(temporary);if(visible.dev===privateIdentity.dev&&visible.ino===privateIdentity.ino)rmdirSync(temporary);}catch{/* Preserve the measurement failure. */}
    }
  }
  return {ext,mimeType,width,height,durationSeconds};
}

export async function attachUpload(id: string, baseRevision: number, requirementId: string, bytes: Buffer, fields: Record<string,string>,
  receiptExtension: Record<string,unknown> = {}, expectedMimeType?: string, signal?:AbortSignal,
  afterAttach?: (plan:Plan,requirement:Requirement,asset:Asset)=>void) {
  if(signal?.aborted)throw new StoreError('자료 수집이 취소됐습니다.',409);
  const plan = getProject(id);
  if (plan.revision !== baseRevision) throw new StoreError('다른 창에서 수정되었습니다. 최신 내용을 불러오세요.',409);
  const requirement = plan.requirements.find(r=>r.id===requirementId);
  if (!requirement) throw new StoreError('자료 요구를 찾을 수 없습니다.');
  if (!bytes.length || bytes.length > 40_000_000) throw new StoreError('파일은 40MB 이하여야 합니다.',413);
  for (const name of ['originalName','sourceUrl','creator','rightsNote','semanticNote']) if (!fields[name]?.trim() || fields[name].length>4000) throw new StoreError(`${name}: 출처·제작자·사용 조건·의미 대응을 입력하세요.`);
  let url: URL; try { url = new URL(fields.sourceUrl); } catch { throw new StoreError('출처 URL을 확인하세요.'); }
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw new StoreError('http/https 원문 출처 URL을 입력하세요.');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const mediaType = requirement.mediaType;
  const {ext,mimeType,width,height,durationSeconds}=await measureAssetBytes(bytes,mediaType);
  if (mediaType === 'image') {
    if (requirement.acquisition === 'generated-keyframe' && ext!=='png') throw new StoreError('Omni 입력은 PNG 키프레임만 등록할 수 있습니다.');
  }
  const relativePath=`assets/${sha256}.${ext}`;
  if(expectedMimeType&&mimeType!==expectedMimeType)throw new StoreError('수집 원본의 실제 형식이 보관함 MIME 기록과 다릅니다.',409);
  if(signal?.aborted)throw new StoreError('자료 수집이 취소됐습니다.',409);
  const asset:Asset={id:`asset_${randomUUID()}`,originalName:path.basename(fields.originalName),mediaType,path:relativePath,sha256,mimeType,width,height,durationSeconds,
    sourceUrl:fields.sourceUrl,creator:fields.creator,rightsNote:fields.rightsNote,semanticNote:fields.semanticNote,status:'pending-review',
    evidenceOnly:mediaType==='data'||fields.evidenceOnly!=='false'};
  return attachAssetBytes(id,baseRevision,requirementId,asset,bytes,receiptExtension,signal,afterAttach);
}
