export const MAX_EPISODE_BROWSER_BYTES=2_000_000_000;
const DIRECTORY='visualmaker-episode-temporary';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export type EpisodeWritable={write:(chunk:Uint8Array)=>Promise<void>;close:()=>Promise<void>;abort:()=>Promise<void>};
export type EpisodeFileHandle={createWritable:()=>Promise<EpisodeWritable>;getFile:()=>Promise<File>};
export type EpisodeDirectory={
  getDirectoryHandle:(name:string,options:{create:true})=>Promise<EpisodeDirectory>;
  getFileHandle:(name:string,options?:{create:true})=>Promise<EpisodeFileHandle>;
  removeEntry:(name:string)=>Promise<void>;
};
export type EpisodeStorage={getDirectory:()=>Promise<EpisodeDirectory>;estimate:()=>Promise<{usage?:number;quota?:number}>};

function errorMessage(reason:unknown):Error{
  if(reason&&typeof reason==='object'&&'name' in reason&&reason.name==='QuotaExceededError')
    return new Error('브라우저 임시 저장 공간이 부족합니다. 디스크 공간을 확보한 뒤 다시 시도하세요.');
  return reason instanceof Error?reason:new Error('브라우저 임시 파일 저장에 실패했습니다.');
}

/** Writes one authenticated response to a newly named origin-private file. Caller owns cleanup after success. */
export async function streamEpisodeToPrivateFile(input:{response:Response;expectedBytes:number;storage:EpisodeStorage;id:string;
  signal:AbortSignal;current:()=>boolean}):Promise<{file:File;bytes:number;name:string;cleanup:()=>Promise<void>}>{
  const {response,expectedBytes,storage,id,signal,current}=input;
  if(!UUID.test(id)||!Number.isSafeInteger(expectedBytes)||expectedBytes<1||expectedBytes>MAX_EPISODE_BROWSER_BYTES)
    throw new Error('브라우저 임시 영상 크기 또는 식별자가 올바르지 않습니다. 최대 2GB입니다.');
  if(response.status!==200||Number(response.headers.get('content-length'))!==expectedBytes)
    throw new Error('영상 응답 크기가 검증된 기록과 다릅니다.');
  if(signal.aborted||!current())throw new Error('현재 에피소드 작업이 변경됐습니다.');
  if(!response.body)throw new Error('영상 스트림이 비어 있습니다.');
  const quota=await storage.estimate();
  if(Number.isFinite(quota.quota)&&Number.isFinite(quota.usage)&&
    Number(quota.quota)-Number(quota.usage)<expectedBytes)
    throw new Error('브라우저 임시 저장 공간이 부족합니다. 디스크 공간을 확보한 뒤 다시 시도하세요.');
  if(signal.aborted||!current())throw new Error('현재 에피소드 작업이 변경됐습니다.');
  const root=await storage.getDirectory(),directory=await root.getDirectoryHandle(DIRECTORY,{create:true});
  const name=`provisional-episode-${id}.mp4`;
  try{await directory.getFileHandle(name);throw new Error('임시 영상 이름이 이미 사용 중입니다. 다시 시도하세요.');}
  catch(reason){if(!(reason&&typeof reason==='object'&&'name' in reason&&reason.name==='NotFoundError'))throw reason;}
  if(signal.aborted||!current())throw new Error('현재 에피소드 작업이 변경됐습니다.');
  let fileCreated=false,writer:EpisodeWritable|null=null,closed=false,reader:ReadableStreamDefaultReader<Uint8Array>|null=null;
  const cleanup=async()=>{if(fileCreated){await directory.removeEntry(name);fileCreated=false;}};
  try{
    const handle=await directory.getFileHandle(name,{create:true});fileCreated=true;
    writer=await handle.createWritable();reader=response.body.getReader();let bytes=0;
    for(;;){const {done,value}=await reader.read();if(done)break;
      bytes+=value.byteLength;if(bytes>expectedBytes)throw new Error('영상 크기가 검증된 기록을 넘었습니다.');
      if(signal.aborted||!current())throw new Error('현재 에피소드 작업이 변경됐습니다.');
      await writer.write(value);}
    if(bytes!==expectedBytes||signal.aborted||!current())throw new Error('영상이 완전히 전달되지 않았습니다.');
    await writer.close();closed=true;writer=null;
    const file=await handle.getFile();
    if(file.size!==expectedBytes||signal.aborted||!current())throw new Error('저장된 영상 크기 또는 작업 범위가 변경됐습니다.');
    return {file,bytes,name,cleanup};
  }catch(reason){
    await reader?.cancel().catch(()=>{});
    if(writer&&!closed)await writer.abort().catch(()=>{});
    await cleanup().catch(()=>{});
    throw errorMessage(reason);
  }
}
