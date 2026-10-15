import {spawn,spawnSync} from 'node:child_process';
import {lstatSync,realpathSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {StoreError} from './store.ts';

export type CliRun={args:string[];maxBytes:number;timeoutMs:number;signal?:AbortSignal;trustedEnv?:Record<string,string>};
export type CliRunner=(request:CliRun)=>Promise<Buffer>;
const BASE=['--ignore-config','--no-config-locations','--no-plugin-dirs','--no-js-runtimes','--no-remote-components','--no-playlist','--no-cache-dir','--no-progress','--no-netrc'];
export const inspectArgs=(url:string)=>[...BASE,'--dump-single-json','--skip-download','--',url];
export const searchArgs=(query:string)=>[...BASE,'--dump-single-json','--flat-playlist','--skip-download','--',`ytsearch5:${query}`];
export const downloadArgs=(url:string,formatId:string)=>[...BASE,'--quiet','--no-simulate','--format',formatId,'--output','-','--',url];

function executable(){
  const local=process.env.LOCALAPPDATA;
  if(!local)throw new StoreError('yt-dlp 설치를 확인하세요.',503);
  const root=path.join(local,'Programs','Python');
  let names:string[];try{names=readdirSync(root).filter(name=>/^Python\d{2,3}$/.test(name)).sort().reverse();}catch{throw new StoreError('yt-dlp 설치를 확인하세요.',503);}
  for(const name of names){
    const file=path.join(root,name,'Scripts','yt-dlp.exe');
    try{const stat=lstatSync(file);if(stat.isFile()&&!stat.isSymbolicLink()&&realpathSync(file).toLowerCase()===file.toLowerCase())return file;}catch{/* Try another local install. */}
  }
  throw new StoreError('yt-dlp 설치를 확인하세요.',503);
}

export const runYouTubeCli:CliRunner=(request)=>runBoundedProcess(executable(),request);
/** Tests use a local process here; HTTP input never selects this executable. */
export const runBoundedProcess=(program:string,{args,maxBytes,timeoutMs,signal,trustedEnv}:CliRun):Promise<Buffer>=>new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(new StoreError('요청이 취소됐습니다.',409));return;}
  const child=spawn(program,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],
    detached:process.platform!=='win32',
    env:{NODE_ENV:process.env.NODE_ENV,SystemRoot:process.env.SystemRoot||'C:\\Windows',WINDIR:process.env.WINDIR||'C:\\Windows',PATH:process.env.SystemRoot?path.join(process.env.SystemRoot,'System32'):'',...trustedEnv}});
  let size=0,errSize=0,settled=false,rootExited=false;const chunks:Buffer[]=[];
  const abort=()=>fail(new StoreError('요청이 취소됐습니다.',409));
  const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);child.stdout.removeAllListeners('data');
    child.stderr.removeAllListeners('data');};
  const killTree=()=>{
    // 'close' waits for inherited pipes. The root PID can already be gone and reused.
    if(!child.pid||rootExited||child.exitCode!==null||child.signalCode!==null)return;
    if(process.platform==='win32'){
      const systemRoot=process.env.SystemRoot||'C:\\Windows';
      const killed=spawnSync(path.join(systemRoot,'System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],
        {shell:false,windowsHide:true,stdio:'ignore',timeout:3_000});
      if(killed.status===0)return;
    }else{
      try{process.kill(-child.pid,'SIGKILL');return;}catch{/* Direct-child fallback below. */}
    }
    try{child.kill('SIGKILL');}catch{/* May already have exited. */}
  };
  const fail=(error:StoreError)=>{if(settled)return;settled=true;cleanup();killTree();
    child.stdout.destroy();child.stderr.destroy();chunks.length=0;reject(error);};
  const timer=setTimeout(()=>fail(new StoreError('YouTube CLI 요청 시간이 초과됐습니다.',504)),timeoutMs);
  signal?.addEventListener('abort',abort,{once:true});
  child.stdout.on('data',(chunk:Buffer)=>{if(settled)return;size+=chunk.length;
    if(size>maxBytes){fail(new StoreError('영상 또는 메타데이터 크기 제한을 초과했습니다.',413));return;}chunks.push(chunk);});
  child.stderr.on('data',(chunk:Buffer)=>{if(settled)return;errSize+=chunk.length;
    if(errSize>64_000)fail(new StoreError('YouTube CLI 오류 출력 제한을 초과했습니다.',502));});
  child.on('exit',()=>{rootExited=true;});
  child.on('error',()=>fail(new StoreError('yt-dlp를 실행할 수 없습니다. 설치를 확인하세요.',503)));
  child.on('close',code=>{if(settled)return;settled=true;cleanup();
    if(code!==0)reject(new StoreError('YouTube 자료를 사용할 수 없습니다. 공개 여부와 CLI 설치를 확인하세요.',502));
    else resolve(Buffer.concat(chunks,size));});
});
