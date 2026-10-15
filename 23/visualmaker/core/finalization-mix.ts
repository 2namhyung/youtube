import {createHash} from 'node:crypto';
import {closeSync,fstatSync,lstatSync,openSync,readSync} from 'node:fs';
import path from 'node:path';
import {safeCanonicalFile} from './canonical-cut-render.ts';
import {parsePostLockJson,safeEpisodePath} from './post-lock-transition.ts';
import {StoreError} from './store.ts';
import {MIX_CHANNELS,MIX_MAX_DECODED_BYTES,MIX_MAX_INPUT_BYTES,MIX_MAX_SAMPLES,MIX_MAX_STAGED_INPUT_BYTES,MIX_SAMPLE_RATE} from '../renderer/fixed-gain-mix-contract.ts';
import type {CaptionSegment,FinalizationBinding,FinalizationMixMeasured,FinalizationMixV2,FinalizationSelection} from '../renderer/finalization-contract.ts';

const HEX=/^[a-f0-9]{64}$/u;
const ID=/^[a-z][a-z0-9_-]{0,31}$/u;
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:unknown,fields:string[]):value is Record<string,unknown>=>object(value)&&Object.keys(value).sort().join('|')===fields.sort().join('|');
const integer=(value:unknown,min:number,max:number):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const digest=(value:unknown):value is string=>typeof value==='string'&&HEX.test(value);
const text=(value:unknown,max=2000):value is string=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&value.trim()===value&&!/[\u0000-\u001f]/u.test(value);
const episodePath=(value:unknown):value is string=>safeEpisodePath(value)&&value.startsWith('video/episodes/episode-001/');

export function assertPlainCaptionText(segments:CaptionSegment[]):void{
  if(segments.some(segment=>/[<>&{}\\]/u.test(segment.text)))throw new StoreError('v2 자막에는 해석될 수 있는 문자(<, >, &, 중괄호, 역슬래시)를 아직 지원하지 않습니다.',409);
}

function canonical(value:unknown):unknown{
  if(Array.isArray(value))return value.map(canonical);
  if(object(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
export function finalizationMixPayloadSha256(mix:FinalizationMixV2):string{
  const {approval_marker:_marker,approval_marker_sha256:_markerSha,...payload}=mix;
  return sha(JSON.stringify(canonical(payload)));
}
export function parseFinalizationMix(value:unknown):FinalizationMixV2{
  if(!exact(value,['mode','sample_rate','channels','duration_samples','voice_decoded_samples','voice_tail_discard_samples','stems','approval_marker','approval_marker_sha256'])||value.mode!=='fixed-gain-stems'||value.sample_rate!==MIX_SAMPLE_RATE||value.channels!==MIX_CHANNELS||!integer(value.duration_samples,1,MIX_MAX_SAMPLES)||!integer(value.voice_decoded_samples,value.duration_samples,MIX_MAX_SAMPLES)||!integer(value.voice_tail_discard_samples,0,1023)||value.voice_decoded_samples-value.duration_samples!==value.voice_tail_discard_samples||!Array.isArray(value.stems)||value.stems.length<1||value.stems.length>16||!episodePath(value.approval_marker)||!digest(value.approval_marker_sha256))throw new StoreError('믹스 선택 버전 또는 길이가 올바르지 않습니다.',409);
  const ids=new Set<string>(),paths=new Set<string>(),hashes=new Set<string>();let inputBytes=0,decodedBytes=value.duration_samples*MIX_CHANNELS*4;
  for(const stem of value.stems){
    if(!exact(stem,['id','kind','path','sha256','bytes','decoded_samples','start_sample','gain_db','source_url','creator','license','attribution','rights_evidence_path','rights_evidence_sha256'])||!ID.test(stem.id as string)||!['music','sfx'].includes(stem.kind as string)||!episodePath(stem.path)||!/[.](wav|flac|mp3|m4a|aac)$/iu.test(stem.path as string)||!digest(stem.sha256)||!integer(stem.bytes,1,MIX_MAX_INPUT_BYTES)||!integer(stem.decoded_samples,1,MIX_MAX_SAMPLES)||!integer(stem.start_sample,0,MIX_MAX_SAMPLES)||stem.start_sample+stem.decoded_samples>value.duration_samples||typeof stem.gain_db!=='number'||!Number.isFinite(stem.gain_db)||stem.gain_db< -60||stem.gain_db>0||!text(stem.source_url)||!/^https:\/\//iu.test(stem.source_url as string)||!text(stem.creator)||!text(stem.license)||typeof stem.attribution!=='string'||stem.attribution.length>2000||!episodePath(stem.rights_evidence_path)||!digest(stem.rights_evidence_sha256))throw new StoreError('믹스 stem 형식·길이·출처가 올바르지 않습니다.',409);
    const stemId=(stem.id as string).toLowerCase(),stemPath=(stem.path as string).toLowerCase();
    if(ids.has(stemId)||paths.has(stemPath)||hashes.has(stem.sha256 as string)||stem.rights_evidence_path===stem.path||stem.rights_evidence_path===value.approval_marker)throw new StoreError('믹스 입력이 중복되거나 승인 문서와 겹칩니다.',409);
    ids.add(stemId);paths.add(stemPath);hashes.add(stem.sha256 as string);inputBytes+=stem.bytes as number;decodedBytes+=(stem.decoded_samples as number)*MIX_CHANNELS*4;
  }
  if(inputBytes>MIX_MAX_STAGED_INPUT_BYTES||decodedBytes+(value.voice_tail_discard_samples as number)*MIX_CHANNELS*4>MIX_MAX_DECODED_BYTES)throw new StoreError('믹스 입력이 기술 제한을 넘었습니다.',409);
  return value as FinalizationMixV2;
}

function boundFile(root:string,relative:string,max:number):{sha256:string;bytes:number}{
  if(!episodePath(relative))throw new StoreError('믹스 파일 경로가 올바르지 않습니다.',409);
  const file=safeCanonicalFile(root,relative),stat=lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size<1||stat.size>max)throw new StoreError('믹스 파일의 실제 바이트 또는 경로가 올바르지 않습니다.',409);
  const fd=openSync(file,'r');try{
    const before=fstatSync(fd),buffer=Buffer.allocUnsafe(64*1024),hash=createHash('sha256');let bytes=0;
    if(!before.isFile()||before.nlink!==1||before.size!==stat.size)throw new StoreError('믹스 파일 식별이 변경됐습니다.',409);
    for(;;){const count=readSync(fd,buffer,0,buffer.length,null);if(!count)break;bytes+=count;if(bytes>max)throw new StoreError('믹스 파일 크기가 제한을 넘었습니다.',409);hash.update(buffer.subarray(0,count));}
    const after=fstatSync(fd);if(bytes!==before.size||after.size!==before.size||after.ino!==before.ino||after.mtimeMs!==before.mtimeMs||after.nlink!==1||safeCanonicalFile(root,relative)!==file)throw new StoreError('믹스 파일이 읽는 중 변경됐습니다.',409);
    return {sha256:hash.digest('hex'),bytes};
  }finally{closeSync(fd);}
}
export type BoundFinalizationMix={payloadSha256:string;markerSha256:string;rightsEvidence:Array<{id:string;path:string;sha256:string}>;fingerprints:Record<string,string>};
export function bindFinalizationMix(root:string,selection:Extract<FinalizationSelection,{version:2}>,captionContractSha256:string,captionMarkerSha256:string,authorityPaths:string[]):BoundFinalizationMix{
  const mix=parseFinalizationMix(selection.mix),payloadSha256=finalizationMixPayloadSha256(mix),fingerprints:Record<string,string>={};
  const rightsEvidence:BoundFinalizationMix['rightsEvidence']=[],physical=new Set<string>();
  const physicalKey=(relative:string)=>{const file=safeCanonicalFile(root,relative),stat=lstatSync(file,{bigint:true});return [path.normalize(file).toLowerCase(),`${stat.dev}:${stat.ino}`];};
  for(const relative of authorityPaths)for(const key of physicalKey(relative))physical.add(key);
  for(const stem of mix.stems){
    const asset=boundFile(root,stem.path,MIX_MAX_INPUT_BYTES),evidence=boundFile(root,stem.rights_evidence_path,1_000_000);
    if(asset.sha256!==stem.sha256||asset.bytes!==stem.bytes||evidence.sha256!==stem.rights_evidence_sha256)throw new StoreError('믹스 자산 또는 권리 자료 바이트가 변경됐습니다.',409);
    const assetPath=safeCanonicalFile(root,stem.path),evidencePath=safeCanonicalFile(root,stem.rights_evidence_path);
    for(const relative of [stem.path,stem.rights_evidence_path])for(const key of physicalKey(relative)){if(physical.has(key))throw new StoreError('믹스 자산 또는 권리 자료 경로가 승인 원본과 중복됩니다.',409);physical.add(key);}
    const fd=openSync(evidencePath,'r');try{const bytes=Buffer.allocUnsafe(evidence.bytes);if(readSync(fd,bytes,0,bytes.length,0)!==bytes.length||sha(bytes)!==evidence.sha256)throw new StoreError('권리 자료가 변경됐습니다.',409);const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(!source.trim())throw new StoreError('권리 자료가 비었습니다.',409);}finally{closeSync(fd);}
    fingerprints[stem.path]=asset.sha256;fingerprints[stem.rights_evidence_path]=evidence.sha256;rightsEvidence.push({id:stem.id,path:stem.rights_evidence_path,sha256:evidence.sha256});
  }
  const marker=boundFile(root,mix.approval_marker,1_000_000);
  if(marker.sha256!==mix.approval_marker_sha256)throw new StoreError('믹스 입력 승인 마커가 변경됐습니다.',409);
  for(const key of physicalKey(mix.approval_marker))if(physical.has(key))throw new StoreError('믹스 승인 마커가 자산·권리 자료·승인 원본과 겹칩니다.',409);
  const markerFile=safeCanonicalFile(root,mix.approval_marker),markerFd=openSync(markerFile,'r');let value:Record<string,unknown>;
  try{const bytes=Buffer.allocUnsafe(marker.bytes);if(readSync(markerFd,bytes,0,bytes.length,0)!==bytes.length||sha(bytes)!==marker.sha256)throw new StoreError('믹스 승인 마커가 변경됐습니다.',409);value=parsePostLockJson(bytes,1_000_000);}finally{closeSync(markerFd);}
  const markerSource=value.source;
  if(!exact(value,['schema_version','kind','episode_id','reviewer','approved','source','final_script_sha256','picture_marker_sha256','caption_contract_sha256','caption_marker_sha256','mix_payload_sha256','decisions'])||value.schema_version!==1||value.kind!=='fixed-gain-mix-input'||value.episode_id!=='episode-001'||value.reviewer!=='user'||value.approved!==true||value.final_script_sha256!==selection.final_script.sha256||value.picture_marker_sha256!==selection.picture_marker_sha256||value.caption_contract_sha256!==captionContractSha256||value.caption_marker_sha256!==captionMarkerSha256||value.mix_payload_sha256!==payloadSha256||!exact(markerSource,['job_id','attempt','artifact_sha256','receipt_sha256'])||markerSource.job_id!==selection.source.job_id||markerSource.attempt!==selection.source.attempt||markerSource.artifact_sha256!==selection.source.artifact_sha256||markerSource.receipt_sha256!==selection.source.receipt_sha256||!Array.isArray(value.decisions)||value.decisions.length!==mix.stems.length)throw new StoreError('믹스 입력 승인 마커의 권한 결속이 다릅니다.',409);
  const decisions=new Map<string,Record<string,unknown>>();
  for(const decision of value.decisions){if(!exact(decision,['id','asset_sha256','rights_evidence_sha256','decision','allowed_use','attribution','reason'])||typeof decision.id!=='string'||decisions.has(decision.id)||decision.decision!=='permitted'||decision.allowed_use!=='youtube-publication'||!text(decision.reason))throw new StoreError('믹스 입력 승인 결정이 올바르지 않습니다.',409);decisions.set(decision.id,decision);}
  for(const stem of mix.stems){const decision=decisions.get(stem.id);if(!decision||decision.asset_sha256!==stem.sha256||decision.rights_evidence_sha256!==stem.rights_evidence_sha256||decision.attribution!==stem.attribution)throw new StoreError('믹스 입력 승인 결정이 선택과 다릅니다.',409);}
  fingerprints[mix.approval_marker]=marker.sha256;
  return {payloadSha256,markerSha256:marker.sha256,rightsEvidence,fingerprints};
}

export function validateFinalizationMixTechnical(value:unknown,binding:FinalizationBinding,measured:{audioPacketSha256:string;videoPacketSha256:string;sourceVideoPacketSha256:string},result?:FinalizationMixMeasured):void{
  if(binding.selection.version!==2||!exact(value,['mode','payloadSha256','approvalMarkerSha256','rightsEvidence','measurements','contentWindows']))throw new StoreError('v2 믹스 기술 영수증 형식이 올바르지 않습니다.',409);
  const mix=binding.selection.mix,m=value.measurements;
  if(value.mode!=='fixed-gain-stems'||value.payloadSha256!==binding.mixPayloadSha256||value.approvalMarkerSha256!==binding.mixApprovalMarkerSha256||JSON.stringify(value.rightsEvidence)!==JSON.stringify(binding.mixRightsEvidence)||!exact(m,['sourceVoice','mixer','encoded','outputAudio','sourceVideoPacketSha256'])||m.sourceVideoPacketSha256!==measured.sourceVideoPacketSha256||m.sourceVideoPacketSha256!==measured.videoPacketSha256)throw new StoreError('v2 믹스 승인 또는 영상 결속이 다릅니다.',409);
  const voice=m.sourceVoice,engine=m.mixer,encoded=m.encoded,out=m.outputAudio;
  const presentation=['decodedSamples','presentedSamples','sampleRate','channels','packetCount','firstPacketPts','primingSkipSamples','lastPacketDuration','containerDiscardPadding'];
  const presentationValid=(item:Record<string,unknown>)=>integer(item.packetCount,1,100_000)&&integer(item.primingSkipSamples,0,4096)&&item.firstPacketPts===-item.primingSkipSamples&&integer(item.lastPacketDuration,1,1024)&&integer(item.containerDiscardPadding,0,1023)&&item.sampleRate===48000&&item.channels===2;
  if(!exact(voice,['sha256','tailDiscardSamples',...presentation])||!digest(voice.sha256)||voice.decodedSamples!==mix.voice_decoded_samples||voice.presentedSamples!==mix.duration_samples||voice.tailDiscardSamples!==mix.voice_tail_discard_samples||!presentationValid(voice)||!exact(engine,['contractSha256','receiptSha256','outputSha256','sampleCount','peak','rms','clippingCount'])||!digest(engine.contractSha256)||!digest(engine.receiptSha256)||!digest(engine.outputSha256)||engine.sampleCount!==mix.duration_samples||typeof engine.peak!=='number'||!Number.isFinite(engine.peak)||engine.peak<0||engine.peak>10**(-1/20)||typeof engine.rms!=='number'||!Number.isFinite(engine.rms)||engine.rms<0||engine.rms>engine.peak||engine.clippingCount!==0)throw new StoreError('v2 믹스 음성 또는 PCM 측정이 올바르지 않습니다.',409);
  if(!exact(encoded,['sha256','bytes','packetSha256','decodedPcmSha256',...presentation,'peak','rms','clippingCount'])||!digest(encoded.sha256)||!integer(encoded.bytes,1,100_000_000)||!digest(encoded.packetSha256)||!digest(encoded.decodedPcmSha256)||!integer(encoded.decodedSamples,mix.duration_samples,MIX_MAX_SAMPLES)||encoded.decodedSamples-mix.duration_samples>1023||encoded.presentedSamples!==mix.duration_samples||!presentationValid(encoded)||typeof encoded.peak!=='number'||!Number.isFinite(encoded.peak)||encoded.peak<0||encoded.peak>10**(-1/20)||typeof encoded.rms!=='number'||!Number.isFinite(encoded.rms)||encoded.rms<0||encoded.rms>encoded.peak||encoded.clippingCount!==0||!exact(out,['packetSha256','decodedPcmSha256',...presentation])||out.packetSha256!==encoded.packetSha256||out.packetSha256!==measured.audioPacketSha256||out.decodedPcmSha256!==encoded.decodedPcmSha256||presentation.some(key=>out[key]!==encoded[key]))throw new StoreError('v2 AAC 중간 파일과 결과 음성 측정이 다릅니다.',409);
  if(!Array.isArray(value.contentWindows)||!value.contentWindows.length||value.contentWindows.length>mix.stems.length*2+1)throw new StoreError('v2 AAC 내용 비교가 없습니다.',409);
  let previous=0;
  for(const window of value.contentWindows){if(!exact(window,['start','end','referenceRms','decodedRms','errorRms','correlation'])||!integer(window.start,previous,mix.duration_samples)||!integer(window.end,window.start+256,mix.duration_samples)||['referenceRms','decodedRms','errorRms','correlation'].some(key=>typeof window[key]!=='number'||!Number.isFinite(window[key]))||Number(window.referenceRms)<0||Number(window.decodedRms)<0||Number(window.errorRms)<0||Number(window.correlation)< -1||Number(window.correlation)>1)throw new StoreError('v2 AAC 내용 비교 측정이 올바르지 않습니다.',409);previous=window.end;}
  if(result&&JSON.stringify(m)!==JSON.stringify(result))throw new StoreError('v2 믹스 실행 측정이 자식 프로세스와 다릅니다.',409);
}
