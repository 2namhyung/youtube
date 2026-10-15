import {spawn} from 'node:child_process';
import {constants,existsSync,lstatSync,mkdtempSync,readFileSync,rmSync,statSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {accessSync} from 'node:fs';

// The persisted proposal is capped at 200 KB; raw schema JSON may be larger before
// source spans are rebound and normalized, so do not reject a valid bounded proposal early.
const MAX_STREAM=1024*1024,MAX_FINAL=512*1024;

function executable(candidate:string):boolean{
  try{
    if(!path.isAbsolute(candidate)||!statSync(candidate).isFile())return false;
    accessSync(candidate,constants.X_OK);
    return process.platform!=='win32'||/\.(exe|com)$/iu.test(candidate);
  }catch{return false;}
}

/** Local executable discovery only. No login or provider request is made. */
export function resolveCodexCli(configured:string|undefined):string|null{
  if(configured!==undefined&&configured!=='')return executable(configured)?configured:null;
  const names=process.platform==='win32'?['codex.exe','codex.com']:['codex'];
  for(const directory of (process.env.PATH??process.env.Path??'').split(path.delimiter)){
    if(!directory||!path.isAbsolute(directory))continue;
    for(const name of names){const candidate=path.join(directory,name);if(executable(candidate))return candidate;}
  }
  return null;
}

function privateEnv():NodeJS.ProcessEnv{
  const env:NodeJS.ProcessEnv={NODE_ENV:'production'};
  for(const key of ['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','PATH','Path','HOME','USERPROFILE','LOCALAPPDATA','APPDATA']){
    if(process.env[key])env[key]=process.env[key];
  }
  return env;
}

async function terminateTree(pid:number|undefined,killDirect:()=>void):Promise<void>{
  if(!pid){killDirect();return;}
  if(process.platform==='win32'){
    const systemRoot=process.env.SystemRoot??process.env.SYSTEMROOT;
    const taskkill=systemRoot&&path.isAbsolute(systemRoot)?path.join(systemRoot,'System32','taskkill.exe'):null;
    if(taskkill&&executable(taskkill)){
      const killed=await new Promise<boolean>(resolve=>{
        let finished=false;
        const killer=spawn(taskkill,['/PID',String(pid),'/T','/F'],{stdio:'ignore',env:privateEnv(),windowsHide:true,shell:false});
        const done=(value:boolean)=>{if(finished)return;finished=true;clearTimeout(timer);resolve(value);};
        const timer=setTimeout(()=>{killer.kill();done(false);},2000);
        killer.once('error',()=>done(false));
        killer.once('close',code=>done(code===0));
      });
      if(killed)return;
    }
    killDirect();
  }else{
    try{process.kill(-pid,'SIGKILL');}catch{try{process.kill(pid,'SIGKILL');}catch{}}
  }
}

/** No shell, repository cwd, provider key environment, or script in process arguments. */
export async function runCodexAnalysis(executablePath:string,modelId:string,prompt:string,schema:Record<string,unknown>,signal:AbortSignal,timeoutMs:number):Promise<unknown>{
  return runCodexProcess(executablePath,[],modelId,prompt,schema,signal,timeoutMs);
}

/** Test-only seam for a synthetic executable. Never sourced from HTTP or environment. */
export async function runCodexProcess(executablePath:string,prefixArgs:readonly string[],modelId:string,prompt:string,schema:Record<string,unknown>,signal:AbortSignal,timeoutMs:number):Promise<unknown>{
  if(!executable(executablePath)||!/^codex\/[a-z0-9][a-z0-9._:/-]*$/iu.test(modelId)||
    !Number.isSafeInteger(timeoutMs)||timeoutMs<10||timeoutMs>120_000||signal.aborted)throw new Error('CLI unavailable');
  const directory=mkdtempSync(path.join(os.tmpdir(),'visualmaker-codex-'));
  const schemaPath=path.join(directory,'schema.json'),resultPath=path.join(directory,'result.json');
  try{
    writeFileSync(schemaPath,JSON.stringify(schema),{encoding:'utf8',flag:'wx',mode:0o600});
    const args=[...prefixArgs,'--no-daemon','exec','--ignore-user-config','--ignore-rules','--ephemeral','--sandbox','read-only','--skip-git-repo-check','--color','never',
      '--output-schema',schemaPath,'-o',resultPath,'-c','approval_policy="never"','-c','web_search="disabled"',
      '-c','tools.view_image=false','-c','project_doc_max_bytes=0'];
    for(const feature of ['shell_tool','apps','plugins','hooks','multi_agent','browser_use','computer_use','image_generation','in_app_browser','code_mode_host'])args.push('--disable',feature);
    if(modelId!=='codex/default')args.push('-m',modelId.slice('codex/'.length));
    args.push('-');
    await new Promise<void>((resolve,reject)=>{
      const child=spawn(executablePath,args,{cwd:directory,env:privateEnv(),stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false,detached:process.platform!=='win32'});
      let finished=false,bytes=0,stopped:Error|undefined,closed=false,closeCode:number|null=null;
      let termination:Promise<void>|null=null;
      const stop=(error:Error)=>{
        if(finished||stopped)return;
        stopped=error;
        termination=terminateTree(child.pid,()=>{child.kill();});
        void termination.then(()=>maybeSettle());
      };
      const timer=setTimeout(()=>stop(new Error('CLI timeout')),timeoutMs);
      const onAbort=()=>stop(new Error('CLI cancelled'));
      function settle(error?:Error){if(finished)return;finished=true;clearTimeout(timer);signal.removeEventListener('abort',onAbort);if(stopped||error)reject(stopped??error);else resolve();}
      function maybeSettle(){if(!closed)return;if(termination){void termination.then(()=>settle(closeCode===0?undefined:new Error('CLI failed')));}else settle(closeCode===0?undefined:new Error('CLI failed'));}
      signal.addEventListener('abort',onAbort,{once:true});
      child.once('error',()=>{if(!child.pid)settle(new Error('CLI start failed'));else stop(new Error('CLI start failed'));});
      child.once('close',code=>{closed=true;closeCode=code;maybeSettle();});
      for(const stream of [child.stdout,child.stderr])stream.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>MAX_STREAM)stop(new Error('CLI output exceeded limit'));});
      child.stdin.on('error',()=>stop(new Error('CLI input failed')));
      child.stdin.end(prompt,'utf8');
    });
    if(!existsSync(resultPath)||!lstatSync(resultPath).isFile()||statSync(resultPath).size>MAX_FINAL)throw new Error('CLI output invalid');
    const bytes=readFileSync(resultPath);if(bytes.length>MAX_FINAL)throw new Error('CLI output invalid');
    return JSON.parse(bytes.toString('utf8')) as unknown;
  }finally{rmSync(directory,{recursive:true,force:true});}
}
