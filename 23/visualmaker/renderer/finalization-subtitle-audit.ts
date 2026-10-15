import type {CaptionSegment} from './finalization-contract.ts';

// FFmpeg's WebVTT -> mov_text default style, measured on the supported mux path.
// The variable btrt box follows this fixed tx3g header and font table.
const PLAIN_TX3G_HEADER='0000000001ff000000ff00000000000000000000000000010010ffffffff00000012667461620001000105417269616c';

function dumpBytes(value:unknown):Buffer{
  if(typeof value!=='string'||!value.startsWith('\n'))throw new Error('finalization-subtitle-raw-data');
  const chunks:Buffer[]=[];let offset=0;
  for(const line of value.trim().split('\n')){
    const match=/^([0-9a-f]{8}): ([0-9a-f ]+?) {2,}/iu.exec(line);
    if(!match||Number.parseInt(match[1],16)!==offset)throw new Error('finalization-subtitle-raw-data');
    const hex=match[2].replaceAll(' ','');
    if(!hex||hex.length%2!==0||!/^[0-9a-f]+$/iu.test(hex))throw new Error('finalization-subtitle-raw-data');
    const bytes=Buffer.from(hex,'hex');chunks.push(bytes);offset+=bytes.length;
    if(offset>5_000_000)throw new Error('finalization-subtitle-raw-data');
  }
  return Buffer.concat(chunks);
}

/** Fail closed on every style run/unknown atom; SRT output is checked separately. */
export function auditPlainMovText(probe:unknown,segments:CaptionSegment[],fps:number):void{
  if(!Number.isSafeInteger(fps)||fps<1||fps>120)throw new Error('finalization-subtitle-probe');
  if(!probe||typeof probe!=='object')throw new Error('finalization-subtitle-probe');
  const parsed=probe as {streams?:Array<{codec_name?:string;time_base?:string;extradata?:string}>;packets?:Array<{pts?:number;duration?:number;data?:string}>};
  if(parsed.streams?.length!==1||parsed.streams[0].codec_name!=='mov_text'||parsed.streams[0].time_base!=='1/1000000'||!Array.isArray(parsed.packets))throw new Error('finalization-subtitle-probe');
  const extra=dumpBytes(parsed.streams[0].extradata);
  if(extra.length!==68||extra.subarray(0,48).toString('hex')!==PLAIN_TX3G_HEADER||extra.readUInt32BE(48)!==20||extra.toString('ascii',52,56)!=='btrt')throw new Error('finalization-subtitle-default-style');
  let cueIndex=0,clearIndex=-1,previousPts=-1;
  for(const packet of parsed.packets){
    if(!Number.isSafeInteger(packet.pts)||!Number.isSafeInteger(packet.duration)||Number(packet.duration)<=0)throw new Error('finalization-subtitle-packet-time');
    const pts=Number(packet.pts),duration=Number(packet.duration);
    if(pts<=previousPts)throw new Error('finalization-subtitle-packet-time');previousPts=pts;
    const bytes=dumpBytes(packet.data);
    if(bytes.length<2)throw new Error('finalization-subtitle-packet-shape');
    const byteCount=bytes.readUInt16BE(0);
    if(byteCount===0){
      const preceding=segments[cueIndex-1];
      if(bytes.length!==2||!preceding||clearIndex===cueIndex-1||Math.abs(pts-Math.round(preceding.end_frame*1_000_000/fps))>1000)throw new Error('finalization-subtitle-packet-shape');
      clearIndex=cueIndex-1;continue;
    }
    if(bytes.length!==byteCount+2||cueIndex>=segments.length)throw new Error('finalization-subtitle-packet-shape');
    const segment=segments[cueIndex],start=Math.round(segment.start_frame*1_000_000/fps),end=Math.round(segment.end_frame*1_000_000/fps);
    if(Math.abs(pts-start)>1000||Math.abs(pts+duration-end)>1000)throw new Error('finalization-subtitle-packet-time');
    const expected=Buffer.from(segment.text,'utf8');
    if(!bytes.subarray(2).equals(expected))throw new Error('finalization-subtitle-packet-text');
    cueIndex++;
  }
  if(cueIndex!==segments.length)throw new Error('finalization-subtitle-packet-count');
}
