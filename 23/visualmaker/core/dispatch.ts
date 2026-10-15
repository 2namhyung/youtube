import {spawn} from 'node:child_process';
import {realpathSync} from 'node:fs';
import path from 'node:path';
import {dataRoot,StoreError} from './store.ts';
import {failUnclaimableJob,getJob} from './jobs.ts';

function startupFailure(id:string,reason:string):{error:StoreError;terminate:boolean} {
  const result=failUnclaimableJob(id,reason);
  if(result.changed)return {error:new StoreError(reason,503),terminate:true};
  if(result.job.status==='running'||result.job.status==='succeeded')return {error:new StoreError('작업이 이미 시작됐습니다. 작업 상태를 새로고침하세요.',409),terminate:false};
  return {error:new StoreError(reason,result.job.status==='cancelled'?409:503),terminate:false};
}

export async function dispatchJob(id:string,startupTimeoutMs=10_000):Promise<void> {
  if(!Number.isInteger(startupTimeoutMs)||startupTimeoutMs<1||startupTimeoutMs>10_000)throw new StoreError('시작 제한 시간이 올바르지 않습니다.');
  const job=getJob(id);
  if(job.status!=='queued'||!['planning-package','renderer-diagnostic','canonical-cut-preview','episode-provisional-video','audio-timed-assembly','episode-finalization-export','ai-script-analysis'].includes(job.kind))throw new StoreError('실행할 수 있는 대기 작업이 아닙니다.',409);
  const projectRoot=realpathSync(process.cwd());
  let entry:string;
  try{entry=realpathSync(path.join(projectRoot,'visualmaker','worker.ts'));}
  catch{throw new StoreError('로컬 작업 실행 파일을 찾을 수 없습니다. Studio 서버의 실행 폴더를 확인하세요.',503);}
  if(!entry.startsWith(projectRoot+path.sep))throw new StoreError('작업 실행 파일 경로가 올바르지 않습니다.',500);
  const env:NodeJS.ProcessEnv={NODE_ENV:process.env.NODE_ENV??'production',VISUALMAKER_DATA_DIR:path.resolve(dataRoot())};
  for(const name of ['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','PATH','Path'])if(process.env[name])env[name]=process.env[name];
  if(job.kind==='ai-script-analysis')for(const name of ['VISUALMAKER_AI_ENABLED','VISUALMAKER_CODEX_CLI_PATH','VISUALMAKER_AI_MODEL','HOME','USERPROFILE','LOCALAPPDATA','APPDATA'])if(process.env[name])env[name]=process.env[name];
  await new Promise<void>((resolve,reject)=>{
    const child=spawn(process.execPath,['--experimental-strip-types',entry,'--job',id],{cwd:projectRoot,env,stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,detached:true});
    let settled=false;
    const timer=setTimeout(()=>{
      fail('로컬 작업 프로세스가 제한 시간 안에 작업을 시작하지 못했습니다.',true);
    },startupTimeoutMs);
    function cleanup(){clearTimeout(timer);child.removeAllListeners('message');child.removeAllListeners('error');child.removeAllListeners('exit');}
    function detach(){if(child.connected)child.disconnect();if(child.pid)child.unref();}
    function fail(reason:string,timedOut=false){
      if(settled)return;settled=true;cleanup();
      try{
        const result=startupFailure(id,reason);
        if(timedOut&&result.terminate)child.kill();
        detach();reject(result.error);
      }catch(error){detach();reject(error);}
    }
    child.on('message',message=>{
      if(settled||!message||typeof message!=='object'||!('type' in message)||message.type!=='claimed'||!('jobId' in message)||message.jobId!==id)return;
      const current=getJob(id);
      if(current.status!=='running'&&current.status!=='succeeded'){fail('작업 선점 확인과 저장된 상태가 일치하지 않습니다.');return;}
      settled=true;cleanup();detach();resolve();
    });
    child.once('error',error=>fail(`로컬 작업 프로세스를 시작하지 못했습니다: ${error.message}`));
    child.once('exit',code=>fail(`로컬 작업 프로세스가 작업 선점 전에 종료됐습니다 (코드 ${code??'unknown'}).`));
  });
}
