import {createHash, randomUUID} from 'node:crypto';
import {mkdirSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
import {dataRoot, getProject, StoreError, updateProject} from './store.ts';
import type {Asset} from './model.ts';

export async function attachUpload(id: string, baseRevision: number, requirementId: string, bytes: Buffer, fields: Record<string,string>) {
  const plan = getProject(id);
  if (plan.revision !== baseRevision) throw new StoreError('다른 창에서 수정되었습니다. 최신 내용을 불러오세요.',409);
  const requirement = plan.requirements.find(r=>r.id===requirementId);
  if (!requirement) throw new StoreError('자료 요구를 찾을 수 없습니다.');
  if (!bytes.length || bytes.length > 40_000_000) throw new StoreError('파일은 40MB 이하여야 합니다.',413);
  for (const name of ['originalName','sourceUrl','creator','rightsNote','semanticNote']) if (!fields[name]?.trim() || fields[name].length>4000) throw new StoreError(`${name}: 출처·제작자·사용 조건·의미 대응을 입력하세요.`);
  let url: URL; try { url = new URL(fields.sourceUrl); } catch { throw new StoreError('출처 URL을 확인하세요.'); }
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw new StoreError('http/https 원문 출처 URL을 입력하세요.');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  let ext = ''; let mimeType = ''; let width:number|null=null; let height:number|null=null; let durationSeconds:number|null=null;
  const mediaType = requirement.mediaType;
  if (mediaType === 'image') {
    const meta = await sharp(bytes,{limitInputPixels:40_000_000}).metadata();
    if (!meta.width || !meta.height || !['png','jpeg','webp'].includes(meta.format || '') || (meta.pages || 1)>1) throw new StoreError('단일 PNG/JPG/WebP 이미지가 필요합니다.');
    if (requirement.acquisition === 'generated-keyframe' && meta.format!=='png') throw new StoreError('Omni 입력은 PNG 키프레임만 등록할 수 있습니다.');
    await sharp(bytes,{limitInputPixels:40_000_000}).raw().toBuffer();
    width=meta.width;height=meta.height;ext=meta.format==='jpeg'?'jpg':meta.format!;mimeType=`image/${meta.format}`;
  } else if (mediaType==='video') {
    ext=bytes.subarray(4,8).toString()==='ftyp'?'mp4':bytes.subarray(0,4).toString('hex')==='1a45dfa3'?'webm':'';
    if (!ext) throw new StoreError('MP4 또는 WebM 영상이 필요합니다.');
    mimeType=`video/${ext}`;
  } else {
    if (bytes.length>2_000_000 || bytes.includes(0)) throw new StoreError('근거 데이터는 2MB 이하 UTF-8 TXT/JSON으로 등록하세요.');
    new TextDecoder('utf-8',{fatal:true}).decode(bytes);ext='txt';mimeType='text/plain';
  }
  const relativePath=`assets/${sha256}.${ext}`;
  if (mediaType==='video') {
    // Probe in a private temporary directory; no rejected bytes become assets.
    mkdirSync(path.join(dataRoot(),'staging'),{recursive:true});
    const temporary=mkdtempSync(path.join(dataRoot(),'staging','probe-'));
    const file=path.join(temporary,`input.${ext}`);
    try {
      writeFileSync(file,bytes);
      const probe=spawnSync('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',file],{encoding:'utf8',windowsHide:true,timeout:15_000,maxBuffer:1_000_000});
      if(probe.status!==0) throw new StoreError('영상 스트림을 읽을 수 없습니다. ffprobe와 파일을 확인하세요.');
      const p=JSON.parse(probe.stdout);const stream=p.streams?.find((s:{codec_type:string})=>s.codec_type==='video');
      durationSeconds=Number(stream?.duration || p.format?.duration);
      width=Number(stream?.width);height=Number(stream?.height);
      if(!width||!height||!Number.isFinite(durationSeconds)||durationSeconds<=0) throw new StoreError('양수 길이의 영상 스트림이 필요합니다.');
    } finally { try { unlinkSync(file); } finally { rmdirSync(temporary); } }
  }
  const asset:Asset={id:`asset_${randomUUID()}`,originalName:path.basename(fields.originalName),mediaType,path:relativePath,sha256,mimeType,width,height,durationSeconds,
    sourceUrl:fields.sourceUrl,creator:fields.creator,rightsNote:fields.rightsNote,semanticNote:fields.semanticNote,status:'pending-review',
    evidenceOnly:mediaType==='data'||fields.evidenceOnly!=='false'};
  mkdirSync(path.join(dataRoot(),'assets'),{recursive:true});
  mkdirSync(path.join(dataRoot(),'receipts'),{recursive:true});
  writeFileSync(path.join(dataRoot(),relativePath),bytes);
  writeFileSync(path.join(dataRoot(),'receipts',`${asset.id}.json`),JSON.stringify(asset),{flag:'wx'});
  return updateProject(id,baseRevision,{type:'attach-asset',requirementId,asset});
}
