import {createHash} from 'node:crypto';

export const MIX_SAMPLE_RATE=48_000;
export const MIX_CHANNELS=2;
export const MIX_MAX_SAMPLES=MIX_SAMPLE_RATE*600;
export const MIX_MAX_INPUT_BYTES=100_000_000;
export const MIX_MAX_STAGED_INPUT_BYTES=300_000_000;
export const MIX_MAX_DECODED_BYTES=512_000_000;

export type MixInput={id:string;path:string;sha256:string;bytes:number;decodedSamples:number;gainDb:number};
export type MixStem=MixInput&{kind:'music'|'sfx';startSample:number};
export type FixedGainMixContract={schemaVersion:'visualmaker-fixed-gain-mix-v1';sampleRate:48000;channels:2;durationSamples:number;voice:MixInput;stems:MixStem[]};

const exact=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const integer=(value:unknown,min:number,max:number):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const sha256=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
const identifier=(value:unknown):value is string=>typeof value==='string'&&/^[a-z][a-z0-9_-]{0,31}$/u.test(value);
export function canonicalMixPath(value:unknown):value is string{
  return typeof value==='string'&&value.length<=240&&/^[a-zA-Z0-9_./ -]+$/u.test(value)&&!value.startsWith('/')&&!value.endsWith('/')&&!value.includes('//')&&value.split('/').every(part=>part!=='.'&&part!=='..'&&part.length>0)&&/\.(wav|flac|mp3|m4a|aac)$/iu.test(value);
}
function parseInput(value:unknown,stem:boolean):MixInput|MixStem{
  const common=['id','path','sha256','bytes','decodedSamples','gainDb'];
  const keys=stem?['id','kind','path','sha256','bytes','decodedSamples','startSample','gainDb']:common;
  if(!object(value)||!exact(value,keys)||!identifier(value.id)||!canonicalMixPath(value.path)||!sha256(value.sha256)||!integer(value.bytes,1,MIX_MAX_INPUT_BYTES)||!integer(value.decodedSamples,1,MIX_MAX_SAMPLES)||typeof value.gainDb!=='number'||!Number.isFinite(value.gainDb))throw new Error('fixed-gain-mix-contract-input');
  if(stem){
    if((value.kind!=='music'&&value.kind!=='sfx')||!integer(value.startSample,0,MIX_MAX_SAMPLES)||value.gainDb< -60||value.gainDb>0)throw new Error('fixed-gain-mix-contract-stem');
    return {id:value.id,kind:value.kind,path:value.path,sha256:value.sha256,bytes:value.bytes,decodedSamples:value.decodedSamples,startSample:value.startSample,gainDb:value.gainDb};
  }
  if(value.gainDb!==0)throw new Error('fixed-gain-mix-contract-voice-gain');
  return {id:value.id,path:value.path,sha256:value.sha256,bytes:value.bytes,decodedSamples:value.decodedSamples,gainDb:0};
}
/** JSON field order is fixed here; stems retain supplied order because their order is semantic. */
export function parseFixedGainMixContract(value:unknown):FixedGainMixContract{
  if(!object(value)||!exact(value,['schemaVersion','sampleRate','channels','durationSamples','voice','stems'])||value.schemaVersion!=='visualmaker-fixed-gain-mix-v1'||value.sampleRate!==MIX_SAMPLE_RATE||value.channels!==MIX_CHANNELS||!integer(value.durationSamples,1,MIX_MAX_SAMPLES)||!Array.isArray(value.stems)||value.stems.length<1||value.stems.length>16)throw new Error('fixed-gain-mix-contract');
  const voice=parseInput(value.voice,false) as MixInput,stems=value.stems.map(item=>parseInput(item,true) as MixStem);
  if(voice.decodedSamples!==value.durationSamples)throw new Error('fixed-gain-mix-voice-duration');
  const ids=new Set<string>(),paths=new Set<string>();let decodedBytes=voice.decodedSamples*MIX_CHANNELS*4,stagedBytes=0;
  for(const input of [voice,...stems]){
    stagedBytes+=input.bytes;
    const id=input.id.toLowerCase(),file=input.path.toLowerCase();
    if(ids.has(id)||paths.has(file))throw new Error('fixed-gain-mix-duplicate-input');
    ids.add(id);paths.add(file);
    if(input!==voice){const stem=input as MixStem;if(stem.startSample+stem.decodedSamples>value.durationSamples)throw new Error('fixed-gain-mix-stem-window');decodedBytes+=stem.decodedSamples*MIX_CHANNELS*4;}
  }
  if(decodedBytes>MIX_MAX_DECODED_BYTES)throw new Error('fixed-gain-mix-decoded-limit');
  if(stagedBytes>MIX_MAX_STAGED_INPUT_BYTES)throw new Error('fixed-gain-mix-staged-limit');
  return {schemaVersion:'visualmaker-fixed-gain-mix-v1',sampleRate:48_000,channels:2,durationSamples:value.durationSamples as number,voice,stems};
}
export function fixedGainMixContractSha256(contract:FixedGainMixContract):string{
  return createHash('sha256').update(JSON.stringify(parseFixedGainMixContract(contract))).digest('hex');
}
