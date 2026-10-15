import type {FinalizationJobReceipt} from '../../../visualmaker/renderer/finalization-contract.ts';

const HASH=/^[a-f0-9]{64}$/u;
const ID=/^[a-z][a-z0-9_-]{0,31}$/u;
const EPISODE_PATH=/^video\/episodes\/episode-001\/[A-Za-z0-9_./-]+$/u;
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>object(value)&&Object.keys(value).sort().join('|')===keys.slice().sort().join('|');
const integer=(value:unknown,min:number,max:number):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const hash=(value:unknown):value is string=>typeof value==='string'&&HASH.test(value);
const path=(value:unknown):value is string=>typeof value==='string'&&value.length<300&&EPISODE_PATH.test(value)&&
  !value.includes('//')&&value.split('/').every(segment=>segment!=='.'&&segment!=='..');
const finite=(value:unknown,min:number,max:number):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const MAX_SAMPLES=28_800_000;

function rights(value:unknown):value is Array<{id:string;path:string;sha256:string}>{
  if(!Array.isArray(value)||value.length<1||value.length>16)return false;
  const ids=new Set<string>(),paths=new Set<string>();
  for(const item of value){
    if(!exact(item,['id','path','sha256'])||typeof item.id!=='string'||!ID.test(item.id)||!path(item.path)||!hash(item.sha256))return false;
    const id=item.id.toLowerCase(),name=item.path.toLowerCase();
    if(ids.has(id)||paths.has(name))return false;
    ids.add(id);paths.add(name);
  }
  return true;
}

const PRESENTATION=['decodedSamples','presentedSamples','sampleRate','channels','packetCount','firstPacketPts','primingSkipSamples','lastPacketDuration','containerDiscardPadding'];
function presentation(value:Record<string,unknown>,duration:number):boolean{
  return integer(value.decodedSamples,duration,MAX_SAMPLES)&&value.presentedSamples===duration&&
    value.sampleRate===48000&&value.channels===2&&integer(value.packetCount,1,100_000)&&
    integer(value.primingSkipSamples,0,4096)&&value.firstPacketPts===-value.primingSkipSamples&&
    integer(value.lastPacketDuration,1,1024)&&integer(value.containerDiscardPadding,0,1023);
}

function measurements(value:unknown,measured:Record<string,unknown>):boolean{
  if(!exact(value,['sourceVoice','mixer','encoded','outputAudio','sourceVideoPacketSha256'])||
    !hash(value.sourceVideoPacketSha256)||value.sourceVideoPacketSha256!==measured.sourceVideoPacketSha256||
    value.sourceVideoPacketSha256!==measured.videoPacketSha256)return false;
  const voice=value.sourceVoice,mixer=value.mixer,encoded=value.encoded,output=value.outputAudio;
  if(!exact(voice,['sha256','tailDiscardSamples',...PRESENTATION])||!hash(voice.sha256)||
    !integer(voice.presentedSamples,1,MAX_SAMPLES)||!presentation(voice,voice.presentedSamples)||
    !integer(voice.tailDiscardSamples,0,1023)||!integer(voice.decodedSamples,voice.presentedSamples,MAX_SAMPLES)||
    voice.decodedSamples-voice.presentedSamples!==voice.tailDiscardSamples)return false;
  const duration=voice.presentedSamples;
  if(!exact(mixer,['contractSha256','receiptSha256','outputSha256','sampleCount','peak','rms','clippingCount'])||
    !hash(mixer.contractSha256)||!hash(mixer.receiptSha256)||!hash(mixer.outputSha256)||mixer.sampleCount!==duration||
    !finite(mixer.peak,0,10**(-1/20))||!finite(mixer.rms,0,mixer.peak)||mixer.clippingCount!==0)return false;
  if(!exact(encoded,['sha256','bytes','packetSha256','decodedPcmSha256',...PRESENTATION,'peak','rms','clippingCount'])||
    !hash(encoded.sha256)||!integer(encoded.bytes,1,100_000_000)||!hash(encoded.packetSha256)||!hash(encoded.decodedPcmSha256)||
    !presentation(encoded,duration)||!integer(encoded.decodedSamples,duration,MAX_SAMPLES)||encoded.decodedSamples-duration>1023||
    !finite(encoded.peak,0,10**(-1/20))||!finite(encoded.rms,0,encoded.peak)||encoded.clippingCount!==0||
    !exact(output,['packetSha256','decodedPcmSha256',...PRESENTATION])||!hash(output.packetSha256)||!hash(output.decodedPcmSha256)||
    output.packetSha256!==encoded.packetSha256||output.packetSha256!==measured.audioPacketSha256||
    output.decodedPcmSha256!==encoded.decodedPcmSha256||PRESENTATION.some(key=>output[key]!==encoded[key]))return false;
  if(!integer(measured.frames,1,MAX_SAMPLES)||!integer(measured.fps,1,120)||
    duration!==measured.frames*48000/measured.fps)return false;
  return true;
}

function windows(value:unknown,duration:number,max:number):boolean{
  if(!Array.isArray(value)||value.length<1||value.length>max*2+1)return false;
  let previous=0;
  for(const window of value){
    if(!exact(window,['start','end','referenceRms','decodedRms','errorRms','correlation'])||
      !integer(window.start,previous,duration)||!integer(window.end,window.start+256,duration)||
      !finite(window.referenceRms,0,1)||!finite(window.decodedRms,0,1)||!finite(window.errorRms,0,2)||
      !finite(window.correlation,-1,1))return false;
    previous=window.end;
  }
  return true;
}

/** Validate only the downloadable receipt's shape and internal bindings; the server rechecks live authority on every file request. */
export function validFinalizationMixV2(receipt:FinalizationJobReceipt):boolean{
  if(!exact(receipt,['schemaVersion','artifactKind','episodeId','jobId','attempt','projectId','requestedRevision',
    'snapshotSha256','executionContractSha256','source','mixApproval','technical','files','productionAuthority','reviewApproved'])||
    receipt.schemaVersion!=='visualmaker-finalization-job-receipt-v2'||
    !exact(receipt.source,['jobId','attempt','artifactSha256','receiptSha256'])||
    !receipt.files.every(file=>exact(file,['name','sha256','bytes'])))return false;
  const approval=receipt.mixApproval,technical=receipt.technical;
  if(!exact(approval,['payloadSha256','markerSha256','rightsEvidence'])||!hash(approval.payloadSha256)||
    !hash(approval.markerSha256)||!rights(approval.rightsEvidence)||
    !exact(technical,['schemaVersion','episodeId','source','authority','mix','thumbnail','measured','files','ffmpegVersion','productionAuthority','reviewApproved'])||
    technical.schemaVersion!=='visualmaker-finalization-receipt-v2'||technical.episodeId!=='episode-001'||
    technical.productionAuthority!==false||technical.reviewApproved!==false||!same(technical.source,receipt.source)||
    !same(technical.files,receipt.files)||typeof technical.ffmpegVersion!=='string'||
    !technical.ffmpegVersion.startsWith('ffmpeg version '))return false;
  const authority=technical.authority,thumbnail=technical.thumbnail,measured=technical.measured,mix=technical.mix;
  if(!exact(authority,['episodeSpecSha256','preLockStateSha256','productionStateSha256','addendumPath','addendumSha256',
    'finalScriptSha256','pictureMarkerSha256','captionMarkerSha256','captionContractSha256'])||
    !path(authority.addendumPath)||Object.entries(authority).some(([key,value])=>key!=='addendumPath'&&!hash(value))||
    !exact(thumbnail,['frame'])||!integer(thumbnail.frame,0,MAX_SAMPLES)||
    !exact(measured,['width','height','fps','frames','durationSeconds','videoPacketSha256','sourceVideoPacketSha256',
      'frameSha256','sourceFrameSha256','thumbnailFrameSha256','sourceThumbnailFrameSha256','audioPacketSha256',
      'sourceAudioPacketSha256','subtitleCount','subtitleText','subtitleTimes'])||
    measured.width!==1920||measured.height!==1080||!integer(measured.fps,1,120)||!integer(measured.frames,1,MAX_SAMPLES)||
    !finite(measured.durationSeconds,0.001,600+Math.max(.12,2/Number(measured.fps)))||
    Math.abs(measured.durationSeconds-Number(measured.frames)/Number(measured.fps))>Math.max(.12,2/Number(measured.fps))||
    !hash(measured.videoPacketSha256)||measured.videoPacketSha256!==measured.sourceVideoPacketSha256||
    !hash(measured.audioPacketSha256)||!hash(measured.sourceAudioPacketSha256)||
    !Array.isArray(measured.frameSha256)||measured.frameSha256.length!==3||!measured.frameSha256.every(hash)||
    !same(measured.frameSha256,measured.sourceFrameSha256)||
    !hash(measured.thumbnailFrameSha256)||measured.thumbnailFrameSha256!==measured.sourceThumbnailFrameSha256||
    !integer(measured.subtitleCount,1,MAX_SAMPLES)||!Array.isArray(measured.subtitleText)||
    measured.subtitleText.length!==measured.subtitleCount||!measured.subtitleText.every((item:unknown)=>typeof item==='string')||
    !Array.isArray(measured.subtitleTimes)||measured.subtitleTimes.length!==measured.subtitleCount||
    !measured.subtitleTimes.every((item:unknown)=>exact(item,['startMs','endMs'])&&integer(item.startMs,0,600000)&&integer(item.endMs,item.startMs+1,600000))||
    !exact(mix,['mode','payloadSha256','approvalMarkerSha256','rightsEvidence','measurements','contentWindows'])||
    mix.mode!=='fixed-gain-stems'||mix.payloadSha256!==approval.payloadSha256||
    mix.approvalMarkerSha256!==approval.markerSha256||!same(mix.rightsEvidence,approval.rightsEvidence)||
    !measurements(mix.measurements,measured)||!object(mix.measurements)||!object(mix.measurements.sourceVoice)||
    !integer(mix.measurements.sourceVoice.presentedSamples,1,MAX_SAMPLES)||
    !windows(mix.contentWindows,mix.measurements.sourceVoice.presentedSamples,approval.rightsEvidence.length))return false;
  return true;
}
